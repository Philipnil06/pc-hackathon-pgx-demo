const CPIC_BASE_URL = "https://api.cpicpgx.org/v1";
const DEFAULT_POPULATION = "general";
const APP_DISCLAIMER =
  "Clinical decision support only. Final decision remains with the physician.";
const FALLBACK_MODE_MESSAGE =
  "Fallback demo data shown because the live CPIC API was unavailable.";

const ANTIDEPRESSANT_ALIASES = {
  lexapro: "escitalopram",
  celexa: "citalopram",
  zoloft: "sertraline",
  paxil: "paroxetine",
  effexor: "venlafaxine",
  trintellix: "vortioxetine",
  elavil: "amitriptyline",
};

const SUPPORTED_ANTIDEPRESSANTS = [
  "amitriptyline",
  "citalopram",
  "escitalopram",
  "paroxetine",
  "sertraline",
  "venlafaxine",
  "vortioxetine",
];

const DEMO_PATIENT = {
  patientName: "Anna Bergstrom",
  age: 34,
  condition: "Major depressive symptoms",
  previousIssue: "Nausea and insomnia after SSRI",
  drugQuery: "escitalopram",
  phenotypeMap: {
    CYP2C19: "Poor Metabolizer",
    CYP2D6: "Normal Metabolizer",
    CYP2B6: "Intermediate Metabolizer",
  },
};

const FALLBACK_DEMO_RESULT = {
  fallbackUsed: true,
  fallbackReason: FALLBACK_MODE_MESSAGE,
  normalizedDrug: "escitalopram",
  normalizedQuery: "escitalopram",
  drugMatches: [
    {
      drugid: "RxNorm:321988",
      name: "escitalopram",
      guidelineid: 100413,
    },
  ],
  pairMatches: [
    {
      pairid: 110098,
      drugid: "RxNorm:321988",
      drugname: "escitalopram",
      genesymbol: "CYP2C19",
      guidelinename:
        "CYP2D6, CYP2C19, CYP2B6, SLC6A4, HTR2A and Serotonin Reuptake Inhibitor Antidepressants",
      guidelineurl: "https://www.clinpgx.org/guideline/PA166251452",
      cpiclevel: "A",
      usedforrecommendation: "Yes",
    },
  ],
  recommendationMatches: [
    {
      id: 8093632,
      guidelineid: 100413,
      drugid: "RxNorm:321988",
      implications: {
        CYP2C19:
          "Reduced metabolism of citalopram and escitalopram to less active compounds when compared to CYP2C19 normal and intermediate metabolizers. Higher plasma concentrations may increase the probability of side effects.",
      },
      drugrecommendation:
        "Consider a clinically appropriate antidepressant not predominantly metabolized by CYP2C19. If citalopram or escitalopram are clinically appropriate, consider a lower starting dose, slower titration schedule and 50% reduction of the standard maintenance dose as compared to normal metabolizers.",
      classification: "Strong",
      phenotypes: {
        CYP2C19: "Poor Metabolizer",
      },
      lookupkey: {
        CYP2C19: "Poor Metabolizer",
      },
      population: "general",
      comments:
        "Per the FDA warning, citalopram 20 mg/day is the maximum recommended dose in CYP2C19 poor metabolizers due to the risk of QT prolongation.",
      dosinginformation: false,
      alternatedrugavailable: false,
      otherprescribingguidance: false,
    },
  ],
  guideline: {
    id: 100413,
    name: "CYP2D6, CYP2C19, CYP2B6, SLC6A4, HTR2A and Serotonin Reuptake Inhibitor Antidepressants",
    url: "https://www.clinpgx.org/guideline/PA166251452",
    genes: ["CYP2D6", "CYP2C19", "CYP2B6", "SLC6A4", "HTR2A"],
  },
};

const VALIDATION_CASES = [
  {
    id: "positive-escitalopram-cyp2c19-pm",
    testName: "Positive CPIC: escitalopram + CYP2C19 Poor Metabolizer",
    drugQuery: "escitalopram",
    phenotypeMap: { CYP2C19: "Poor Metabolizer" },
    expectedBehavior: "CPIC recommendation found",
    expectedOutcome: "live_recommendation",
  },
  {
    id: "positive-citalopram-cyp2c19-pm",
    testName: "Positive CPIC: citalopram + CYP2C19 Poor Metabolizer",
    drugQuery: "citalopram",
    phenotypeMap: { CYP2C19: "Poor Metabolizer" },
    expectedBehavior: "CPIC recommendation found",
    expectedOutcome: "live_recommendation",
  },
  {
    id: "sertraline-cyp2c19-um",
    testName: "Positive or safe fail: sertraline + CYP2C19 Ultrarapid Metabolizer",
    drugQuery: "sertraline",
    phenotypeMap: { CYP2C19: "Ultrarapid Metabolizer" },
    expectedBehavior:
      "CPIC recommendation found if available, otherwise show no exact recommendation without hallucinating",
    expectedOutcome: "recommendation_or_safe_fail",
  },
  {
    id: "venlafaxine-cyp2d6-pm",
    testName: "Positive or partial: venlafaxine + CYP2D6 Poor Metabolizer",
    drugQuery: "venlafaxine",
    phenotypeMap: { CYP2D6: "Poor Metabolizer" },
    expectedBehavior: "CPIC recommendation found if available",
    expectedOutcome: "recommendation_or_safe_fail",
  },
  {
    id: "brand-name-lexapro",
    testName: "Brand normalization: Lexapro",
    drugQuery: "Lexapro",
    phenotypeMap: { CYP2C19: "Poor Metabolizer" },
    expectedBehavior: "Normalize to escitalopram or show clear normalization failure",
    expectedOutcome: "normalized_or_clear_fail",
  },
  {
    id: "typo-escitalopramm",
    testName: "Typo handling: escitalopramm",
    drugQuery: "escitalopramm",
    phenotypeMap: { CYP2C19: "Poor Metabolizer" },
    expectedBehavior: "Either suggest escitalopram or fail with a clear error, not hallucinate",
    expectedOutcome: "suggest_or_clear_fail",
  },
  {
    id: "fake-drug-banana",
    testName: "Fake drug: banana",
    drugQuery: "banana",
    phenotypeMap: { CYP2C19: "Poor Metabolizer" },
    expectedBehavior: "No RxNorm or CPIC match, no recommendation",
    expectedOutcome: "safe_fail",
  },
  {
    id: "wrong-gene-brca1",
    testName: "Wrong gene: BRCA1 Positive",
    drugQuery: "escitalopram",
    phenotypeMap: { BRCA1: "Positive" },
    expectedBehavior: "No CPIC antidepressant PGx recommendation",
    expectedOutcome: "safe_fail",
  },
  {
    id: "unsupported-gene-htr2a",
    testName: "Unsupported pharmacodynamic gene: HTR2A Unknown",
    drugQuery: "escitalopram",
    phenotypeMap: { HTR2A: "Unknown" },
    expectedBehavior:
      "Do not produce prescribing recommendation unless CPIC has a valid recommendation match",
    expectedOutcome: "safe_fail",
  },
  {
    id: "missing-phenotype",
    testName: "Missing phenotype: CYP2C19 empty",
    drugQuery: "escitalopram",
    phenotypeMap: { CYP2C19: "" },
    expectedBehavior: "Validation error asking for phenotype",
    expectedOutcome: "validation_error",
  },
  {
    id: "multiple-gene-profile",
    testName: "Multiple gene profile",
    drugQuery: "escitalopram",
    phenotypeMap: {
      CYP2C19: "Poor Metabolizer",
      CYP2D6: "Normal Metabolizer",
      CYP2B6: "Intermediate Metabolizer",
    },
    expectedBehavior: "Select relevant matched gene and retrieve CPIC recommendation",
    expectedOutcome: "relevant_gene_recommendation",
  },
  {
    id: "source-integrity",
    testName: "Source integrity",
    drugQuery: "escitalopram",
    phenotypeMap: { CYP2C19: "Poor Metabolizer" },
    expectedBehavior:
      "Result must include CPIC guideline, drug id, lookup key and fallbackUsed=false",
    expectedOutcome: "source_integrity",
  },
];

class FallbackError extends Error {
  constructor(message, data) {
    super(message);
    this.name = "FallbackError";
    this.fallbackUsed = true;
    this.data = data;
  }
}

function normalizeDrugName(query) {
  const cleaned = String(query || "").trim().toLowerCase();
  return ANTIDEPRESSANT_ALIASES[cleaned] || cleaned;
}

function titleCase(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizePhenotype(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const lookup = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const phenotypeMap = {
    "poor metabolizer": "Poor Metabolizer",
    "likely poor metabolizer": "Likely Poor Metabolizer",
    "intermediate metabolizer": "Intermediate Metabolizer",
    "likely intermediate metabolizer": "Likely Intermediate Metabolizer",
    "normal metabolizer": "Normal Metabolizer",
    "rapid metabolizer": "Rapid Metabolizer",
    "ultrarapid metabolizer": "Ultrarapid Metabolizer",
    "ultra rapid metabolizer": "Ultrarapid Metabolizer",
    "indeterminate": "Indeterminate",
    "positive": "Positive",
    "negative": "Negative",
    unknown: "Unknown",
  };

  return phenotypeMap[lookup] || titleCase(lookup);
}

function normalizePhenotypeMap(phenotypeMap) {
  return Object.entries(phenotypeMap || {}).reduce((accumulator, [gene, phenotype]) => {
    const normalizedGene = String(gene || "").trim().toUpperCase();
    const normalizedPhenotype = normalizePhenotype(phenotype);

    if (normalizedGene && normalizedPhenotype) {
      accumulator[normalizedGene] = normalizedPhenotype;
    }

    return accumulator;
  }, {});
}

function levenshteinDistance(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  const grid = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let row = 0; row <= a.length; row += 1) {
    grid[row][0] = row;
  }

  for (let column = 0; column <= b.length; column += 1) {
    grid[0][column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      grid[row][column] = Math.min(
        grid[row - 1][column] + 1,
        grid[row][column - 1] + 1,
        grid[row - 1][column - 1] + cost,
      );
    }
  }

  return grid[a.length][b.length];
}

function suggestDrugName(query) {
  const cleaned = String(query || "").trim().toLowerCase();
  if (!cleaned) {
    return null;
  }

  const candidates = [...new Set([...SUPPORTED_ANTIDEPRESSANTS, ...Object.keys(ANTIDEPRESSANT_ALIASES)])];
  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(cleaned, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  if (bestDistance <= 2) {
    return normalizeDrugName(bestMatch);
  }

  return null;
}

function validatePhenotypeMap(phenotypeMap) {
  const entries = Object.entries(phenotypeMap || {});
  if (!entries.length) {
    return "At least one gene phenotype is required.";
  }

  for (const [gene, phenotype] of entries) {
    if (!String(gene || "").trim() || !String(phenotype || "").trim()) {
      return "Each selected gene must include a phenotype value.";
    }
  }

  return null;
}

async function fetchCpic(path) {
  const response = await fetch(`${CPIC_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CPIC request failed with ${response.status}`);
  }

  return response.json();
}

async function searchCpicDrug(query) {
  const normalized = normalizeDrugName(query);
  const exact = await fetchCpic(
    `/drug?name=eq.${encodeURIComponent(normalized)}&select=drugid,name,guidelineid,rxnormid,flowchart&limit=20`,
  );

  if (exact.length > 0) {
    return exact;
  }

  return fetchCpic(
    `/drug?name=ilike.*${encodeURIComponent(normalized)}*&select=drugid,name,guidelineid,rxnormid,flowchart&limit=20`,
  );
}

async function searchCpicPairs(drugName) {
  const normalized = normalizeDrugName(drugName);
  return fetchCpic(
    `/pair_view?drugname=ilike.*${encodeURIComponent(normalized)}*&order=usedforrecommendation.desc,cpiclevel.asc&limit=50`,
  );
}

async function getCpicRecommendation({ drugId, population, lookupKey }) {
  const encodedLookupKey = encodeURIComponent(JSON.stringify(lookupKey));
  return fetchCpic(
    `/recommendation?drugid=eq.${encodeURIComponent(drugId)}&population=eq.${encodeURIComponent(
      population,
    )}&lookupkey=eq.${encodedLookupKey}`,
  );
}

async function getGuideline(guidelineId) {
  const results = await fetchCpic(
    `/guideline?id=eq.${encodeURIComponent(guidelineId)}&select=id,name,url,genes,notesonusage`,
  );
  return results[0] || null;
}

function buildNoRecommendationReasons(pairMatches, normalizedPhenotypes) {
  const reasons = [];

  if (!pairMatches.length) {
    reasons.push("Drug not covered by CPIC");
  }

  if (pairMatches.length > 0) {
    const coveredGenes = new Set(pairMatches.map((pair) => pair.genesymbol));
    const matchedGene = Object.keys(normalizedPhenotypes).some((gene) => coveredGenes.has(gene));

    if (!matchedGene) {
      reasons.push("Gene phenotype does not match available lookup keys");
    }
  }

  reasons.push("Population mismatch");
  reasons.push("Data unavailable");

  return [...new Set(reasons)];
}

function createGroundedSummaries({ recommendation, patientContext, gene, drugName }) {
  if (!recommendation) {
    return {
      doctorSummary:
        "No CPIC recommendation was retrieved for this exact gene-drug combination. Review the evidence panel before making any treatment decision.",
      patientExplanation:
        "No matching CPIC gene-drug guidance was found for this exact combination in the current lookup.",
      followUpPlan:
        "Confirm the phenotype wording, gene coverage, medication name, and population filter. If needed, review the full CPIC guideline manually.",
      safetyDisclaimer: APP_DISCLAIMER,
    };
  }

  const implication = recommendation.implications?.[gene] || "No implication text available.";
  const phenotype = recommendation.lookupkey?.[gene] || recommendation.phenotypes?.[gene] || "n/a";
  const recommendationText = recommendation.drugrecommendation || "No recommendation text provided.";
  const comments =
    recommendation.comments && recommendation.comments !== "n/a" ? recommendation.comments : "";
  const ageText = patientContext?.age ? `${patientContext.age}-year-old` : "adult";
  const priorIssue = patientContext?.previousIssue
    ? ` Prior issue noted: ${patientContext.previousIssue}.`
    : "";

  return {
    doctorSummary: `${drugName} with ${gene} ${phenotype}: ${implication} CPIC recommendation: ${recommendationText}${comments ? ` Additional comment: ${comments}` : ""}`,
    patientExplanation: `This result does not choose a medication for ${patientContext?.patientName || "the patient"}. It shows that people with a ${gene} result of ${phenotype} may process ${drugName} differently, so the doctor may need to consider dose pace, maintenance dose, or another clinically appropriate option.${priorIssue}`,
    followUpPlan: `Confirm the PGx result wording, review side-effect history for this ${ageText} patient, and use the CPIC recommendation plus overall clinical factors before deciding whether ${drugName} remains appropriate.`,
    safetyDisclaimer: APP_DISCLAIMER,
  };
}

function sortRecommendations(recommendations) {
  const rank = {
    Strong: 0,
    Moderate: 1,
    Optional: 2,
    "No Recommendation": 3,
  };

  return [...recommendations].sort((left, right) => {
    const leftRank = rank[left.classification] ?? 99;
    const rightRank = rank[right.classification] ?? 99;
    return leftRank - rightRank;
  });
}

function buildNoDrugMatchResult({
  normalizedDrug,
  normalizedPhenotypes,
  patientContext,
  suggestion,
  validationError = null,
}) {
  return {
    fallbackUsed: false,
    normalizedDrug,
    normalizedQuery: normalizedDrug,
    normalizedPhenotypes,
    drugMatches: [],
    pairMatches: [],
    eligiblePairs: [],
    recommendationMatches: [],
    matchedGene: null,
    matchedLookupKey: null,
    guideline: null,
    sourceUsed: "No live CPIC match",
    suggestion,
    validationError,
    summaries: createGroundedSummaries({
      recommendation: null,
      patientContext,
      gene: "",
      drugName: normalizedDrug,
    }),
    noRecommendationReasons: ["Drug not covered by CPIC", "Data unavailable"],
  };
}

async function getMedicationWorkflow({
  drugQuery,
  phenotypeMap,
  population = DEFAULT_POPULATION,
  patientContext = {},
  searchOnly = false,
}) {
  const normalizedDrug = normalizeDrugName(drugQuery);
  const normalizedPhenotypes = normalizePhenotypeMap(phenotypeMap);
  const validationError = searchOnly ? null : validatePhenotypeMap(phenotypeMap);

  if (validationError) {
    return {
      fallbackUsed: false,
      normalizedDrug,
      normalizedQuery: normalizedDrug,
      normalizedPhenotypes,
      drugMatches: [],
      pairMatches: [],
      eligiblePairs: [],
      recommendationMatches: [],
      matchedGene: null,
      matchedLookupKey: null,
      guideline: null,
      sourceUsed: "Validation error",
      suggestion: null,
      validationError,
      summaries: createGroundedSummaries({
        recommendation: null,
        patientContext,
        gene: "",
        drugName: normalizedDrug,
      }),
      noRecommendationReasons: ["Gene phenotype does not match available lookup keys"],
    };
  }

  try {
    const [drugMatches, pairMatches] = await Promise.all([
      searchCpicDrug(normalizedDrug),
      searchCpicPairs(normalizedDrug),
    ]);

    if (searchOnly) {
      return {
        fallbackUsed: false,
        normalizedQuery: normalizedDrug,
        drugMatches,
        pairMatches,
      };
    }

    const primaryDrug = drugMatches[0] || pairMatches[0];

    if (!primaryDrug?.drugid) {
      return buildNoDrugMatchResult({
        normalizedDrug,
        normalizedPhenotypes,
        patientContext,
        suggestion: suggestDrugName(drugQuery),
      });
    }

    const candidatePairs = pairMatches.filter((pair) => pair.drugid === primaryDrug.drugid);
    const eligiblePairs = candidatePairs.filter(
      (pair) =>
        pair.usedforrecommendation === "Yes" &&
        Object.prototype.hasOwnProperty.call(normalizedPhenotypes, pair.genesymbol),
    );

    let recommendationMatches = [];
    let matchedGene = null;
    let matchedLookupKey = null;

    for (const pair of eligiblePairs) {
      const gene = pair.genesymbol;
      const lookupKey = { [gene]: normalizedPhenotypes[gene] };
      const recommendations = await getCpicRecommendation({
        drugId: primaryDrug.drugid,
        population,
        lookupKey,
      });

      if (recommendations.length > 0) {
        matchedGene = gene;
        matchedLookupKey = lookupKey;
        recommendationMatches = recommendationMatches.concat(recommendations);
      }
    }

    recommendationMatches = sortRecommendations(recommendationMatches);
    const primaryRecommendation = recommendationMatches[0] || null;
    const guidelineId =
      primaryRecommendation?.guidelineid ||
      primaryDrug.guidelineid ||
      eligiblePairs[0]?.guidelineid ||
      null;
    const guideline = guidelineId ? await getGuideline(guidelineId) : null;

    return {
      fallbackUsed: false,
      normalizedDrug,
      normalizedQuery: normalizedDrug,
      normalizedPhenotypes,
      drugMatches,
      pairMatches,
      eligiblePairs,
      recommendationMatches,
      matchedGene,
      matchedLookupKey,
      guideline,
      sourceUsed: primaryRecommendation ? "Live CPIC API" : "Live CPIC API with no exact recommendation",
      suggestion: null,
      validationError: null,
      summaries: createGroundedSummaries({
        recommendation: primaryRecommendation,
        patientContext,
        gene: matchedGene,
        drugName: normalizedDrug,
      }),
      noRecommendationReasons: primaryRecommendation
        ? []
        : buildNoRecommendationReasons(pairMatches, normalizedPhenotypes),
    };
  } catch (_error) {
    if (searchOnly) {
      throw new FallbackError(FALLBACK_MODE_MESSAGE, {
        fallbackUsed: true,
        normalizedQuery: normalizedDrug,
        drugMatches: FALLBACK_DEMO_RESULT.drugMatches,
        pairMatches: FALLBACK_DEMO_RESULT.pairMatches,
      });
    }

    const fallbackResult = {
      ...FALLBACK_DEMO_RESULT,
      normalizedPhenotypes,
      matchedGene: "CYP2C19",
      matchedLookupKey: { CYP2C19: "Poor Metabolizer" },
      sourceUsed: "Cached demo result",
      suggestion: null,
      validationError: null,
      summaries: createGroundedSummaries({
        recommendation: FALLBACK_DEMO_RESULT.recommendationMatches[0],
        patientContext,
        gene: "CYP2C19",
        drugName: "escitalopram",
      }),
      noRecommendationReasons: [],
    };

    throw new FallbackError(FALLBACK_MODE_MESSAGE, fallbackResult);
  }
}

function buildActualBehavior(result) {
  if (result.validationError) {
    return `Validation error: ${result.validationError}`;
  }

  if (result.fallbackUsed) {
    return `API unavailable. ${result.fallbackReason || "Cached demo result returned."}`;
  }

  if (result.recommendationMatches?.length) {
    const recommendation = result.recommendationMatches[0];
    return `Recommendation found for ${result.matchedGene || "matched gene"} with lookup key ${JSON.stringify(
      recommendation.lookupkey || result.matchedLookupKey || {},
    )}.`;
  }

  if (result.suggestion) {
    return `No live CPIC match found. Suggested drug name: ${result.suggestion}.`;
  }

  return `No exact CPIC recommendation found. Reasons: ${(result.noRecommendationReasons || []).join(
    ", ",
  )}.`;
}

function hasHallucinatedRecommendation(result) {
  return !result.fallbackUsed && !result.recommendationMatches?.length && Boolean(result.summaries?.doctorSummary?.includes("CPIC recommendation:"));
}

function evaluateValidationOutcome(validationCase, result) {
  const recommendationFound = Boolean(result.recommendationMatches?.length);
  const hasGuideline = Boolean(result.guideline?.name && result.guideline?.url);
  const hasDrugId = Boolean(result.drugMatches?.[0]?.drugid || result.recommendationMatches?.[0]?.drugid);
  const hasLookupKey = Boolean(result.recommendationMatches?.[0]?.lookupkey || result.matchedLookupKey);
  const fallbackUsed = Boolean(result.fallbackUsed);
  const hallucinated = hasHallucinatedRecommendation(result);

  let passed = false;
  let explanation = "";

  switch (validationCase.expectedOutcome) {
    case "live_recommendation":
      passed = recommendationFound && !fallbackUsed;
      explanation = passed
        ? "Live CPIC recommendation retrieved."
        : fallbackUsed
          ? "Validation used fallback data, so this is not live proof."
          : "Expected a live CPIC recommendation but none was returned.";
      break;
    case "recommendation_or_safe_fail":
      passed = !fallbackUsed && (recommendationFound || (!recommendationFound && !hallucinated));
      explanation = recommendationFound
        ? "Live CPIC recommendation retrieved."
        : fallbackUsed
          ? "Validation used fallback data, so this is not live proof."
          : "No exact recommendation was returned, but the workflow failed safely without hallucinating.";
      break;
    case "normalized_or_clear_fail":
      passed =
        !fallbackUsed &&
        (result.normalizedDrug === "escitalopram" || (!recommendationFound && !hallucinated));
      explanation =
        result.normalizedDrug === "escitalopram"
          ? "Brand name normalized to escitalopram."
          : fallbackUsed
            ? "Validation used fallback data, so normalization was not proven live."
            : "Brand name did not normalize, but the workflow failed clearly without inventing guidance.";
      break;
    case "suggest_or_clear_fail":
      passed = !fallbackUsed && (Boolean(result.suggestion) || (!recommendationFound && !hallucinated));
      explanation = result.suggestion
        ? `Suggested ${result.suggestion} instead of inventing a result.`
        : fallbackUsed
          ? "Validation used fallback data, so typo handling was not proven live."
          : "The typo failed clearly without hallucinating a recommendation.";
      break;
    case "safe_fail":
      passed = !fallbackUsed && !recommendationFound && !hallucinated;
      explanation = fallbackUsed
        ? "Validation used fallback data, so safe failure was not proven live."
        : passed
          ? "No recommendation was produced, which is the safe behavior."
          : "A recommendation was produced where none should have been.";
      break;
    case "validation_error":
      passed = result.validationError === "Each selected gene must include a phenotype value.";
      explanation = passed
        ? "Missing phenotype was caught before evidence generation."
        : "The app did not surface the expected validation error.";
      break;
    case "relevant_gene_recommendation":
      passed = recommendationFound && !fallbackUsed && result.matchedGene === "CYP2C19";
      explanation = passed
        ? "The workflow selected CYP2C19 as the relevant matched gene."
        : "The workflow did not select the expected relevant gene from the profile.";
      break;
    case "source_integrity":
      passed = recommendationFound && !fallbackUsed && hasGuideline && hasDrugId && hasLookupKey;
      explanation = passed
        ? "Guideline, drug ID, lookup key, and live source metadata were present."
        : "One or more required source integrity fields were missing or fallback was used.";
      break;
    default:
      passed = false;
      explanation = "Unhandled validation case.";
  }

  if (hallucinated) {
    passed = false;
    explanation = "Unsafe behavior detected: summary implied a recommendation without a CPIC result.";
  }

  return {
    pass: passed,
    hallucinatedRecommendation: hallucinated,
    explanation,
  };
}

async function runValidationSuite() {
  const results = [];

  for (const validationCase of VALIDATION_CASES) {
    let result;

    try {
      result = await getMedicationWorkflow({
        drugQuery: validationCase.drugQuery,
        phenotypeMap: validationCase.phenotypeMap,
        population: DEFAULT_POPULATION,
        patientContext: DEMO_PATIENT,
      });
    } catch (error) {
      if (error instanceof FallbackError) {
        result = error.data;
      } else {
        result = {
          fallbackUsed: false,
          sourceUsed: "Application error",
          recommendationMatches: [],
          noRecommendationReasons: ["Data unavailable"],
          summaries: createGroundedSummaries({
            recommendation: null,
            patientContext: DEMO_PATIENT,
            gene: "",
            drugName: validationCase.drugQuery,
          }),
          validationError: error.message,
        };
      }
    }

    const evaluation = evaluateValidationOutcome(validationCase, result);

    results.push({
      id: validationCase.id,
      testName: validationCase.testName,
      input: {
        drug: validationCase.drugQuery,
        genes: validationCase.phenotypeMap,
      },
      expectedBehavior: validationCase.expectedBehavior,
      actualBehavior: buildActualBehavior(result),
      sourceUsed: result.sourceUsed || (result.fallbackUsed ? "Cached demo result" : "Live CPIC API"),
      fallbackUsed: Boolean(result.fallbackUsed),
      pass: evaluation.pass,
      shortExplanation: evaluation.explanation,
      hallucinatedRecommendation: evaluation.hallucinatedRecommendation,
      details: {
        normalizedDrug: result.normalizedDrug,
        matchedGene: result.matchedGene,
        matchedLookupKey: result.matchedLookupKey || result.recommendationMatches?.[0]?.lookupkey || null,
        drugId: result.drugMatches?.[0]?.drugid || result.recommendationMatches?.[0]?.drugid || null,
        guideline: result.guideline?.name || null,
        recommendationFound: Boolean(result.recommendationMatches?.length),
        suggestion: result.suggestion || null,
        validationError: result.validationError || null,
      },
    });
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    liveCpicResults: results.filter(
      (result) => !result.fallbackUsed && result.details.recommendationFound,
    ).length,
    safeFailures: results.filter(
      (result) => !result.fallbackUsed && !result.details.recommendationFound && !result.hallucinatedRecommendation,
    ).length,
    hallucinatedRecommendations: results.filter((result) => result.hallucinatedRecommendation).length,
    fallbackCases: results.filter((result) => result.fallbackUsed).length,
  };

  return {
    summary,
    cases: results,
  };
}

module.exports = {
  APP_DISCLAIMER,
  DEFAULT_POPULATION,
  DEMO_PATIENT,
  SUPPORTED_ANTIDEPRESSANTS,
  FALLBACK_MODE_MESSAGE,
  FallbackError,
  VALIDATION_CASES,
  getMedicationWorkflow,
  getCpicRecommendation,
  normalizeDrugName,
  normalizePhenotype,
  runValidationSuite,
  searchCpicDrug,
  searchCpicPairs,
};
