const express = require("express");
const path = require("path");

const {
  DEFAULT_POPULATION,
  DEMO_PATIENT,
  FALLBACK_MODE_MESSAGE,
  FallbackError,
  SUPPORTED_ANTIDEPRESSANTS,
  getMedicationWorkflow,
  runValidationSuite,
} = require("./src/cpic");
const { SYMPTOM_PROFILES, symptomFit } = require("./src/symptoms");
const { checkInteractions, applyPhenoconversion } = require("./src/interactions");
const { combineRecommendation, rankRecommendations, buildClinicalNote } = require("./src/recommend");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
// Expose the phenotype engine (src/phenotype.js) to the browser too.
app.use("/src", express.static(path.join(__dirname, "src")));

// Turn one CPIC workflow result into a single verdict level.
// Mirrors the client logic in public/app.js so server and browser agree.
// Anti-hallucination: no recommendation match -> "none", never fabricated.
function deriveFanOutVerdict(result) {
  const rec = result && result.recommendationMatches && result.recommendationMatches[0];
  if (!rec) {
    return { verdictLevel: "none", recommendationText: "No specific PGx guidance for this combination." };
  }
  const text = (rec.drugrecommendation || "").toLowerCase();
  const avoid = /(antidepressant not predominantly|consider an alternative|select an alternative|avoid|is not recommended|use an alternative)/.test(text);
  const adjust = /(lower starting dose|lower dose|reduc|slower titration|titrat|maximum recommended dose|50%|adjust|monitor)/.test(text);
  if (avoid) return { verdictLevel: "alert", recommendationText: rec.drugrecommendation };
  if (adjust) return { verdictLevel: "caution", recommendationText: rec.drugrecommendation };
  return { verdictLevel: "ok", recommendationText: rec.drugrecommendation };
}

const RANK_WEIGHT = { ok: 0, caution: 1, alert: 2, none: 3 };
const RANK_LABEL = {
  ok: "Preferred",
  caution: "Use with caution",
  alert: "Alternative advised",
  none: "No specific guidance",
};

function summarizeDrug(drug, result, fallbackUsed) {
  const rec = result && result.recommendationMatches && result.recommendationMatches[0];
  const { verdictLevel, recommendationText } = deriveFanOutVerdict(result);
  const gene = result && result.matchedGene ? result.matchedGene : null;
  const phenotype = rec && gene ? (rec.lookupkey && rec.lookupkey[gene]) || (rec.phenotypes && rec.phenotypes[gene]) || null : null;
  return {
    drug,
    verdictLevel,
    rankLabel: RANK_LABEL[verdictLevel],
    classification: rec ? rec.classification || null : null,
    gene,
    phenotype,
    recommendationText,
    guidelineUrl: (result && result.guideline && result.guideline.url) || null,
    fallbackUsed: Boolean(fallbackUsed),
  };
}

app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  return next(error);
});

app.get("/api/config", (_req, res) => {
  res.json({
    defaultPopulation: DEFAULT_POPULATION,
    demoPatient: DEMO_PATIENT,
    fallbackMessage: FALLBACK_MODE_MESSAGE,
    symptomProfiles: SYMPTOM_PROFILES,
  });
});

app.get("/api/drugs/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (!query) {
    return res.status(400).json({ error: "Medication query is required." });
  }

  try {
    const result = await getMedicationWorkflow({
      drugQuery: query,
      phenotypeMap: {},
      population: DEFAULT_POPULATION,
      searchOnly: true,
    });

    return res.json(result);
  } catch (error) {
    const status = error instanceof FallbackError ? 200 : 500;
    return res.status(status).json({
      error: error.message || "Unable to search CPIC.",
      fallbackUsed: Boolean(error.fallbackUsed),
      data: error.data || null,
    });
  }
});

app.post("/api/evaluate", async (req, res) => {
  const {
    patientName,
    age,
    condition,
    previousIssue,
    drugQuery,
    phenotypeMap,
    population = DEFAULT_POPULATION,
  } = req.body || {};

  if (!drugQuery || typeof drugQuery !== "string") {
    return res.status(400).json({ error: "drugQuery is required." });
  }

  if (!phenotypeMap || typeof phenotypeMap !== "object") {
    return res.status(400).json({ error: "phenotypeMap is required." });
  }

  try {
    const result = await getMedicationWorkflow({
      drugQuery,
      phenotypeMap,
      population,
      patientContext: {
        patientName,
        age,
        condition,
        previousIssue,
      },
    });

    return res.json(result);
  } catch (error) {
    const status = error instanceof FallbackError ? 200 : 500;
    return res.status(status).json({
      error: error.message || "Unable to evaluate gene-drug evidence.",
      fallbackUsed: Boolean(error.fallbackUsed),
      data: error.data || null,
    });
  }
});

// Layered decision support: symptom profile + current meds + pharmacogenetics.
// Order matters (per the GP consult): symptoms decide fit, interactions can
// override, genetics is the filter on top. Genetics never makes a drug "avoid"
// on its own; only a serious interaction or a symptom contraindication does.
app.post("/api/fan-out", async (req, res) => {
  const {
    phenotypeMap,
    symptomProfileIds = [],
    currentMeds = [],
    patientContext = null,
    population = DEFAULT_POPULATION,
  } = req.body || {};

  if (!phenotypeMap || typeof phenotypeMap !== "object" || Array.isArray(phenotypeMap)) {
    return res.status(400).json({ error: "phenotypeMap (gene -> phenotype) is required." });
  }

  const meds = Array.isArray(currentMeds) ? currentMeds : [];
  const profileIds = Array.isArray(symptomProfileIds) ? symptomProfileIds : [];

  // Layer 2 -> 3 bridge: a CYP inhibitor in the med list can phenoconvert a
  // genotype-normal patient to an effective poor metabolizer before the PGx read.
  const { adjustedPhenotypeMap, conversions } = applyPhenoconversion(phenotypeMap, meds);

  const rows = await Promise.all(
    SUPPORTED_ANTIDEPRESSANTS.map(async (drug) => {
      // Layer 3: pharmacogenetics (on the phenoconverted phenotype).
      let pgx;
      let fallbackUsed = false;
      try {
        const result = await getMedicationWorkflow({
          drugQuery: drug,
          phenotypeMap: adjustedPhenotypeMap,
          population,
          patientContext,
        });
        pgx = summarizeDrug(drug, result, false);
      } catch (error) {
        if (error instanceof FallbackError) {
          pgx = summarizeDrug(drug, error.data || {}, true);
          fallbackUsed = true;
        } else {
          pgx = summarizeDrug(drug, {}, false);
        }
      }

      // Layer 1 + 2.
      const sFit = symptomFit(drug, profileIds);
      const interactionFlags = checkInteractions(drug, meds);

      // Merge into one verdict (genetics as filter only).
      const combined = combineRecommendation({
        drug,
        symptomFit: sFit,
        interactionFlags,
        pgxVerdict: {
          verdictLevel: pgx.verdictLevel,
          recommendationText: pgx.recommendationText,
          gene: pgx.gene,
          phenotype: pgx.phenotype,
          source: pgx.gene ? "CPIC, " + pgx.gene : "CPIC",
        },
      });

      return {
        ...combined,
        pgxVerdictLevel: pgx.verdictLevel,
        gene: pgx.gene,
        phenotype: pgx.phenotype,
        guidelineUrl: pgx.guidelineUrl,
        fallbackUsed,
      };
    }),
  );

  const ranked = rankRecommendations(rows);

  const summary = ranked.reduce(
    (acc, row) => ((acc[row.overallLevel] = (acc[row.overallLevel] || 0) + 1), acc),
    { preferred: 0, neutral: 0, caution: 0, avoid: 0 },
  );

  const profileLabels = profileIds
    .map((id) => {
      const p = SYMPTOM_PROFILES.find((x) => x.id === id);
      return p ? p.label : null;
    })
    .filter(Boolean);

  const genotypeSummary = Object.keys(phenotypeMap).length
    ? Object.entries(phenotypeMap).map(([g, p]) => `${g} ${p}`).join(", ")
    : "";
  const phenoconversionNote = conversions.length
    ? conversions.map((c) => `${c.culprit} makes effective ${c.gene} ${c.to}`).join("; ")
    : "";

  const clinicalNote = buildClinicalNote(
    { profileLabels, genotypeSummary, phenoconversionNote },
    ranked,
  );

  return res.json({
    population,
    phenotypeMap,
    adjustedPhenotypeMap,
    conversions,
    summary,
    clinicalNote,
    anyFallbackUsed: ranked.some((row) => row.fallbackUsed),
    results: ranked,
  });
});

app.post("/api/validation-suite", async (_req, res) => {
  try {
    const results = await runValidationSuite();
    return res.json(results);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unable to run validation suite.",
    });
  }
});

// Only start a long-lived listener when run directly (local dev). On Vercel the
// app is imported as a serverless handler (see api/index.js), so we export it.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PC Hackathon PGx demo running at http://localhost:${PORT}`);
  });
}

module.exports = app;
