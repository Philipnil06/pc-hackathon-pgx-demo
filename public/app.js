const state = {
  config: null,
  lastResult: null,
  lastValidationSuite: null,
  activePatientId: null,
  patientMeta: {},
};

const genes = ["CYP2C19", "CYP2D6", "CYP2B6"];

// Synthetic patient worklist. No real patient data — demo only.
// Genotypes are lab-style diplotypes that map to the phenotype used for lookup.
const PATIENTS = [
  {
    id: "MRN-100482",
    patientName: "Anna Bergström",
    sex: "Female",
    dob: "1992-03-14",
    age: 34,
    condition: "Major depressive disorder",
    previousIssue: "Nausea and insomnia after a prior SSRI",
    drugQuery: "escitalopram",
    genotypes: [
      { gene: "CYP2C19", diplotype: "*2/*2", phenotype: "Poor Metabolizer" },
      { gene: "CYP2D6", diplotype: "*1/*1", phenotype: "Normal Metabolizer" },
      { gene: "CYP2B6", diplotype: "*1/*6", phenotype: "Intermediate Metabolizer" },
    ],
  },
  {
    id: "MRN-100517",
    patientName: "Erik Lindqvist",
    sex: "Male",
    dob: "1978-09-02",
    age: 47,
    condition: "Recurrent major depressive disorder",
    previousIssue: "Partial response to a prior SSRI",
    drugQuery: "venlafaxine",
    genotypes: [
      { gene: "CYP2D6", diplotype: "*4/*4", phenotype: "Poor Metabolizer" },
      { gene: "CYP2C19", diplotype: "*1/*1", phenotype: "Normal Metabolizer" },
    ],
  },
  {
    id: "MRN-100623",
    patientName: "Sofia Nilsson",
    sex: "Female",
    dob: "1985-11-21",
    age: 40,
    condition: "Mixed anxiety and depressive disorder",
    previousIssue: "Reports medications 'wear off quickly'",
    drugQuery: "sertraline",
    genotypes: [
      { gene: "CYP2C19", diplotype: "*17/*17", phenotype: "Ultrarapid Metabolizer" },
      { gene: "CYP2D6", diplotype: "*1/*2", phenotype: "Normal Metabolizer" },
    ],
  },
  {
    id: "MRN-100741",
    patientName: "Johan Andersson",
    sex: "Male",
    dob: "1969-06-30",
    age: 56,
    condition: "Depression with neuropathic pain",
    previousIssue: "Considering a tricyclic for dual benefit",
    drugQuery: "amitriptyline",
    genotypes: [
      { gene: "CYP2D6", diplotype: "*1/*4", phenotype: "Intermediate Metabolizer" },
      { gene: "CYP2C19", diplotype: "*1/*17", phenotype: "Rapid Metabolizer" },
    ],
  },
];

const elements = {
  disclaimer: document.getElementById("global-disclaimer"),
  roster: document.getElementById("patient-roster"),
  patientBanner: document.getElementById("patient-banner"),
  genomicsCard: document.getElementById("genomics-card"),
  genotypeChips: document.getElementById("genotype-chips"),
  searchDrug: document.getElementById("search-drug"),
  runEvaluation: document.getElementById("run-evaluation"),
  runValidation: document.getElementById("run-validation"),
  patientName: document.getElementById("patientName"),
  age: document.getElementById("age"),
  condition: document.getElementById("condition"),
  previousIssue: document.getElementById("previousIssue"),
  drugQuery: document.getElementById("drugQuery"),
  searchStatus: document.getElementById("search-status"),
  resultStatus: document.getElementById("result-status"),
  drugResults: document.getElementById("drug-results"),
  verdict: document.getElementById("verdict"),
  evidenceCard: document.getElementById("evidence-card"),
  recommendationCards: document.getElementById("recommendation-cards"),
  emptyState: document.getElementById("empty-state"),
  interpretationCard: document.getElementById("interpretation-card"),
  patientCard: document.getElementById("patient-card"),
  followupCard: document.getElementById("followup-card"),
  doctorSummary: document.getElementById("doctor-summary"),
  patientSummary: document.getElementById("patient-summary"),
  followUpSummary: document.getElementById("follow-up-summary"),
  evidenceMode: document.getElementById("evidence-mode"),
  sourceBadge: document.getElementById("source-badge"),
  validationStatus: document.getElementById("validation-status"),
  validationResults: document.getElementById("validation-results"),
  summaryPassRate: document.getElementById("summary-pass-rate"),
  summaryLiveCount: document.getElementById("summary-live-count"),
  summarySafeFailures: document.getElementById("summary-safe-failures"),
  summaryHallucinations: document.getElementById("summary-hallucinations"),
  genomicsSourceBadge: document.getElementById("genomics-source-badge"),
  genotypeIngest: document.getElementById("genotype-ingest"),
  genotypeInput: document.getElementById("genotype-input"),
  genotypeParse: document.getElementById("genotype-parse"),
  genotypeFile: document.getElementById("genotype-file"),
  genotypeFileTrigger: document.getElementById("genotype-file-trigger"),
  genotypeIngestStatus: document.getElementById("genotype-ingest-status"),
  genotypeIngestReport: document.getElementById("genotype-ingest-report"),
  runFanout: document.getElementById("run-fanout"),
  fanoutCard: document.getElementById("fanout-card"),
  fanoutSummary: document.getElementById("fanout-summary"),
  fanoutStatus: document.getElementById("fanout-status"),
  fanoutResults: document.getElementById("fanout-results"),
  symptomOptions: document.getElementById("symptom-options"),
  currentMeds: document.getElementById("current-meds"),
  clinicalNoteBlock: document.getElementById("clinical-note-block"),
  clinicalNote: document.getElementById("clinical-note"),
};

function setBusy(button, busy, text) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
}

function setStatus(element, text, className = "") {
  element.className = `inline-status ${className}`.trim();
  element.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

/* ---------- Patient roster + chart ---------- */

function renderRoster() {
  elements.roster.innerHTML = PATIENTS.map((patient) => {
    const primary = patient.genotypes[0];
    return `
      <button class="roster-item ${patient.id === state.activePatientId ? "active" : ""}"
              type="button" data-patient="${patient.id}">
        <div class="roster-name">${escapeHtml(patient.patientName)}</div>
        <div class="roster-meta">${escapeHtml(patient.id)} · ${patient.age} y · ${escapeHtml(patient.sex)}</div>
        <span class="roster-tag">${escapeHtml(primary.gene)} ${escapeHtml(primary.phenotype)}</span>
      </button>`;
  }).join("");

  elements.roster.querySelectorAll("[data-patient]").forEach((node) => {
    node.addEventListener("click", () => selectPatient(node.dataset.patient));
  });
}

function selectPatient(patientId) {
  const patient = PATIENTS.find((item) => item.id === patientId);
  if (!patient) {
    return;
  }

  state.activePatientId = patient.id;
  state.patientMeta = {
    id: patient.id,
    sex: patient.sex,
    dob: patient.dob,
    genotypes: patient.genotypes,
  };

  elements.patientName.value = patient.patientName;
  elements.age.value = patient.age;
  elements.condition.value = patient.condition;
  elements.previousIssue.value = patient.previousIssue;
  elements.drugQuery.value = patient.drugQuery;

  genes.forEach((gene) => {
    const input = document.getElementById(`gene-${gene}`);
    const match = patient.genotypes.find((entry) => entry.gene === gene);
    if (input) {
      input.value = match ? match.phenotype : "";
    }
  });

  if (elements.genomicsSourceBadge) {
    elements.genomicsSourceBadge.textContent = "Source: clinical lab panel";
  }
  if (elements.genotypeIngestStatus) {
    setStatus(elements.genotypeIngestStatus, "");
    elements.genotypeIngestReport.innerHTML = "";
  }

  resetResults();
  renderRoster();
  renderPatientBanner();
  renderGenotypeChips();
}

function renderPatientBanner() {
  const meta = state.patientMeta;
  const name = elements.patientName.value.trim() || "Unnamed patient";
  const age = elements.age.value || "—";
  const condition = elements.condition.value.trim() || "—";
  const history = elements.previousIssue.value.trim() || "None recorded";

  elements.patientBanner.classList.remove("empty");
  elements.patientBanner.innerHTML = `
    <div class="pb-top">
      <span class="pb-name">${escapeHtml(name)}</span>
      <span class="pb-mrn">${escapeHtml(meta.id || "Manual entry")}</span>
    </div>
    <div class="pb-grid">
      <div class="pb-field"><span class="pb-label">Age</span><span class="pb-value">${escapeHtml(age)}</span></div>
      <div class="pb-field"><span class="pb-label">Sex</span><span class="pb-value">${escapeHtml(meta.sex || "—")}</span></div>
      <div class="pb-field"><span class="pb-label">Indication</span><span class="pb-value">${escapeHtml(condition)}</span></div>
      <div class="pb-field"><span class="pb-label">Relevant history</span><span class="pb-value">${escapeHtml(history)}</span></div>
    </div>`;
}

function renderGenotypeChips() {
  elements.genomicsCard.hidden = false;
  const genotypes = state.patientMeta.genotypes;

  const chips = genes
    .map((gene) => {
      const phenotype = document.getElementById(`gene-${gene}`).value.trim();
      if (!phenotype) {
        return "";
      }
      const lab = genotypes?.find((entry) => entry.gene === gene);
      const diplotype = lab ? lab.diplotype : "reported";
      return `
        <div class="chip">
          <span class="chip-gene">${escapeHtml(gene)}</span>
          <span class="chip-diplotype">${escapeHtml(diplotype)} <span class="chip-arrow">→</span></span>
          <span class="chip-phenotype">${escapeHtml(phenotype)}</span>
        </div>`;
    })
    .filter(Boolean)
    .join("");

  elements.genotypeChips.innerHTML =
    chips || `<p class="inline-status">No genotype values entered.</p>`;
}

/* ---------- Verdict ---------- */

function deriveVerdict(result) {
  const rec = result?.recommendationMatches?.[0];

  if (!rec) {
    return {
      level: "none",
      icon: "–",
      label: "No specific PGx guidance",
      detail:
        "No CPIC gene–drug recommendation matched this combination. Prescribe using standard clinical judgment; this genotype does not flag a change.",
      pills: [],
    };
  }

  const gene = Object.keys(rec.lookupkey || rec.phenotypes || {})[0] || "Gene";
  const phenotype = rec.lookupkey?.[gene] || rec.phenotypes?.[gene] || "n/a";
  const text = (rec.drugrecommendation || "").toLowerCase();
  const pills = [];
  if (rec.classification) pills.push(rec.classification);
  pills.push(`${gene} ${phenotype}`);

  const avoid = /(antidepressant not predominantly|consider an alternative|select an alternative|avoid|is not recommended|use an alternative)/.test(
    text,
  );
  const adjust = /(lower starting dose|lower dose|reduc|slower titration|titrat|maximum recommended dose|50%|adjust|monitor)/.test(
    text,
  );

  if (avoid) {
    return {
      level: "alert",
      icon: "!",
      label: "Consider an alternative agent",
      detail:
        "This patient's genotype meaningfully changes how this drug is processed. CPIC suggests an alternative may be more appropriate. See the recommendation below.",
      pills,
    };
  }

  if (adjust) {
    return {
      level: "caution",
      icon: "!",
      label: "Use with caution — dose adjustment advised",
      detail:
        "The drug can still be appropriate, but this genotype affects exposure. CPIC suggests adjusting the dose or titration. See the recommendation below.",
      pills,
    };
  }

  return {
    level: "ok",
    icon: "✓",
    label: "Standard dosing appropriate",
    detail:
      "This genotype does not require a change for this medication. Standard prescribing applies, alongside usual clinical judgment.",
    pills,
  };
}

function renderVerdict(result) {
  const verdict = deriveVerdict(result);
  elements.verdict.hidden = false;
  elements.verdict.className = `verdict level-${verdict.level}`;
  elements.verdict.innerHTML = `
    <div class="verdict-top">
      <span class="verdict-icon">${verdict.icon}</span>
      <span class="verdict-label">${escapeHtml(verdict.label)}</span>
      <span class="verdict-pills">
        ${verdict.pills.map((pill) => `<span class="verdict-pill">${escapeHtml(pill)}</span>`).join("")}
      </span>
    </div>
    <p class="verdict-detail">${escapeHtml(verdict.detail)}</p>`;
}

/* ---------- Results rendering ---------- */

function resetResults() {
  elements.verdict.hidden = true;
  elements.evidenceCard.hidden = true;
  elements.interpretationCard.hidden = true;
  elements.patientCard.hidden = true;
  elements.followupCard.hidden = true;
  elements.fanoutCard.hidden = true;
  if (elements.clinicalNoteBlock) elements.clinicalNoteBlock.hidden = true;
  setStatus(elements.resultStatus, "");
  setStatus(elements.searchStatus, "");
  elements.drugResults.innerHTML = "";
}

function collectPayload() {
  const phenotypeMap = {};
  genes.forEach((gene) => {
    const value = document.getElementById(`gene-${gene}`).value.trim();
    if (value) {
      phenotypeMap[gene] = value;
    }
  });

  return {
    patientName: elements.patientName.value.trim(),
    age: elements.age.value ? Number(elements.age.value) : null,
    condition: elements.condition.value.trim(),
    previousIssue: elements.previousIssue.value.trim(),
    drugQuery: elements.drugQuery.value.trim(),
    phenotypeMap,
  };
}

function renderDrugSearch(data, meta = {}) {
  const matches = data?.drugMatches || [];
  const pairs = data?.pairMatches || [];

  if (!matches.length && !pairs.length) {
    elements.drugResults.innerHTML = `<div class="simple-list-item">No CPIC drug or pair results found.</div>`;
    return;
  }

  const rows = matches.length
    ? matches.map(
        (match) => `
          <div class="simple-list-item">
            <strong>${escapeHtml(match.name)}</strong><br />
            Drug ID: ${escapeHtml(match.drugid)}${match.rxnormid ? ` · RxNorm: ${escapeHtml(match.rxnormid)}` : ""}
          </div>`,
      )
    : pairs.map(
        (pair) => `
          <div class="simple-list-item">
            <strong>${escapeHtml(pair.drugname)}</strong><br />
            Gene pair: ${escapeHtml(pair.genesymbol)} · CPIC level: ${escapeHtml(pair.cpiclevel || "n/a")}
          </div>`,
      );

  elements.drugResults.innerHTML = rows.join("");
  setStatus(
    elements.searchStatus,
    meta.fallbackUsed
      ? "Fallback demo data shown because live CPIC search was unavailable."
      : `Found ${matches.length} drug match(es) and ${pairs.length} pair match(es).`,
    meta.fallbackUsed ? "flag-fallback" : "flag-live",
  );
}

function renderRecommendationCards(result) {
  const recommendations = result?.recommendationMatches || [];
  elements.evidenceCard.hidden = false;

  if (!recommendations.length) {
    elements.recommendationCards.innerHTML = `
      <div class="recommendation-card">
        <header>
          <strong>No CPIC recommendation for this exact gene–drug combination.</strong>
        </header>
        <p>Possible reasons:</p>
        <ul class="guardrail-list">
          ${(result.noRecommendationReasons || [])
            .map((reason) => `<li>${escapeHtml(reason)}</li>`)
            .join("")}
        </ul>
      </div>`;
    elements.emptyState.hidden = true;
    return;
  }

  elements.recommendationCards.innerHTML = recommendations
    .map((entry) => {
      const gene = Object.keys(entry.lookupkey || entry.phenotypes || {})[0] || "Gene";
      const lookup = entry.lookupkey?.[gene] || "n/a";
      const implication = entry.implications?.[gene] || "n/a";
      const matchingPair = (result.eligiblePairs || result.pairMatches || []).find(
        (pair) => pair.genesymbol === gene,
      );
      const guidelineLink = result.guideline?.url || matchingPair?.guidelineurl || "";
      const pmids = matchingPair?.pmids?.length ? matchingPair.pmids.join(", ") : "n/a";

      return `
        <article class="recommendation-card">
          <header>
            <div>
              <p class="section-kicker">CPIC classification</p>
              <strong>${escapeHtml(entry.classification || "Unclassified")}</strong>
            </div>
            <span class="status-badge">${escapeHtml(gene)}: ${escapeHtml(lookup)}</span>
          </header>
          <p><strong>Implication:</strong> ${escapeHtml(implication)}</p>
          <p><strong>Recommendation:</strong> ${escapeHtml(entry.drugrecommendation || "n/a")}</p>
          ${entry.comments && entry.comments !== "n/a" ? `<p><strong>Comments:</strong> ${escapeHtml(entry.comments)}</p>` : ""}
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Population</span>
              ${escapeHtml(entry.population || "n/a")}
            </div>
            <div class="meta-item">
              <span class="meta-label">Guideline</span>
              ${
                guidelineLink
                  ? `<a href="${escapeHtml(guidelineLink)}" target="_blank" rel="noreferrer">${escapeHtml(result.guideline?.name || matchingPair?.guidelinename || "Open CPIC guideline")}</a>`
                  : escapeHtml(result.guideline?.name || matchingPair?.guidelinename || "n/a")
              }
            </div>
            <div class="meta-item">
              <span class="meta-label">PMIDs</span>
              ${escapeHtml(pmids)}
            </div>
          </div>
        </article>`;
    })
    .join("");

  elements.emptyState.hidden = true;
}

function renderSummaries(result) {
  elements.interpretationCard.hidden = false;
  elements.patientCard.hidden = false;
  elements.followupCard.hidden = false;

  elements.doctorSummary.textContent =
    result.summaries?.doctorSummary || "No interpretation available.";
  elements.patientSummary.textContent =
    result.summaries?.patientExplanation || "No patient note available.";
  elements.followUpSummary.textContent =
    `${result.summaries?.followUpPlan || "No follow-up plan available."} ${result.summaries?.safetyDisclaimer || ""}`.trim();
}

function renderEvidenceMode(result) {
  const payload = {
    normalizedDrug: result.normalizedDrug,
    normalizedPhenotypes: result.normalizedPhenotypes,
    matchedGene: result.matchedGene,
    drugMatch: result.drugMatches?.[0] || null,
    pairMatches: result.eligiblePairs?.length ? result.eligiblePairs : result.pairMatches,
    recommendation: result.recommendationMatches?.[0] || null,
    guideline: result.guideline,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason || null,
  };
  elements.evidenceMode.textContent = JSON.stringify(payload, null, 2);
}

function renderResultEnvelope(envelope) {
  const result = envelope.data || envelope;
  state.lastResult = result;

  renderVerdict(result);
  renderRecommendationCards(result);
  renderSummaries(result);
  renderEvidenceMode(result);

  const fallbackUsed = envelope.fallbackUsed || result.fallbackUsed;
  elements.sourceBadge.textContent = fallbackUsed ? "Fallback demo data" : "Live CPIC data";
  setStatus(
    elements.resultStatus,
    fallbackUsed
      ? envelope.error || result.fallbackReason || "Fallback demo data shown."
      : result.recommendationMatches?.length
        ? "Live CPIC recommendation retrieved."
        : "Lookup completed. No exact CPIC recommendation matched.",
    fallbackUsed ? "flag-fallback" : "flag-live",
  );
}

/* ---------- Validation suite ---------- */

function formatInputGenes(genesMap) {
  return Object.entries(genesMap || {})
    .map(([gene, phenotype]) => `${gene}: ${phenotype || "(empty)"}`)
    .join(", ");
}

function renderValidationResults(payload) {
  state.lastValidationSuite = payload;
  const summary = payload.summary;
  elements.summaryPassRate.textContent = `${summary.passed} / ${summary.total} tests passed`;
  elements.summaryLiveCount.textContent = String(summary.liveCpicResults);
  elements.summarySafeFailures.textContent = String(summary.safeFailures);
  elements.summaryHallucinations.textContent = String(summary.hallucinatedRecommendations);

  elements.validationResults.innerHTML = payload.cases
    .map(
      (testCase) => `
        <article class="validation-card ${testCase.pass ? "validation-pass" : "validation-fail"}">
          <header class="validation-header">
            <div>
              <p class="section-kicker">Validation case</p>
              <h3>${escapeHtml(testCase.testName)}</h3>
            </div>
            <span class="status-badge">${testCase.pass ? "PASS" : "FAIL"}</span>
          </header>
          <div class="validation-grid-inner">
            <div class="meta-item"><span class="meta-label">Input</span>Drug: ${escapeHtml(testCase.input.drug)}<br />${escapeHtml(formatInputGenes(testCase.input.genes))}</div>
            <div class="meta-item"><span class="meta-label">Expected</span>${escapeHtml(testCase.expectedBehavior)}</div>
            <div class="meta-item"><span class="meta-label">Actual</span>${escapeHtml(testCase.actualBehavior)}</div>
            <div class="meta-item"><span class="meta-label">Source</span>${escapeHtml(testCase.sourceUsed)}</div>
          </div>
        </article>`,
    )
    .join("");
}

/* ---------- Network actions ---------- */

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    state.config = await response.json();
  } catch (_error) {
    state.config = null;
  }
  elements.disclaimer.textContent =
    "Clinical decision support only. The final decision remains with the prescriber.";
  renderSymptomOptions();
}

function renderSymptomOptions() {
  const profiles = (state.config && state.config.symptomProfiles) || [];
  elements.symptomOptions.innerHTML = profiles
    .map(
      (p) => `
      <label class="symptom-chip" title="${escapeHtml(p.description || "")}">
        <input type="checkbox" value="${escapeHtml(p.id)}" />
        <span>${escapeHtml(p.label)}</span>
      </label>`,
    )
    .join("");
}

function getSymptomProfileIds() {
  return Array.from(elements.symptomOptions.querySelectorAll("input:checked")).map((i) => i.value);
}

function getCurrentMeds() {
  return elements.currentMeds.value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function searchDrug() {
  const query = elements.drugQuery.value.trim();
  if (!query) {
    setStatus(elements.searchStatus, "Enter a medication name first.", "flag-error");
    return;
  }

  setBusy(elements.searchDrug, true, "Searching...");
  setStatus(elements.searchStatus, "Searching CPIC medication tables...");

  try {
    const response = await fetch(`/api/drugs/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    renderDrugSearch(data.data || data, data);
  } catch (_error) {
    setStatus(elements.searchStatus, "Medication search failed.", "flag-error");
  } finally {
    setBusy(elements.searchDrug, false);
  }
}

async function runEvaluation() {
  const payload = collectPayload();

  if (!payload.drugQuery) {
    setStatus(elements.resultStatus, "Medication is required.", "flag-error");
    elements.evidenceCard.hidden = false;
    return;
  }

  setBusy(elements.runEvaluation, true, "Checking...");
  setStatus(elements.resultStatus, "Querying CPIC for gene–drug evidence...");
  elements.evidenceCard.hidden = false;

  try {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    renderResultEnvelope(data);
  } catch (_error) {
    setStatus(elements.resultStatus, "Evidence lookup failed.", "flag-error");
  } finally {
    setBusy(elements.runEvaluation, false);
  }
}

async function runValidationSuite() {
  setBusy(elements.runValidation, true, "Running...");
  setStatus(elements.validationStatus, "Running predefined validation cases against the live workflow...");

  try {
    const response = await fetch("/api/validation-suite", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Validation suite failed.");
    }

    renderValidationResults(payload);
    setStatus(
      elements.validationStatus,
      payload.summary.hallucinatedRecommendations === 0
        ? `Validation complete. ${payload.summary.passed} of ${payload.summary.total} cases passed.`
        : "Validation complete, but unsafe hallucinated recommendations were detected.",
      payload.summary.hallucinatedRecommendations === 0 ? "flag-live" : "flag-error",
    );
  } catch (error) {
    setStatus(elements.validationStatus, error.message || "Validation suite failed.", "flag-error");
  } finally {
    setBusy(elements.runValidation, false);
  }
}

/* ---------- Genotype ingestion (raw diplotype -> computed phenotype) ----------
   Anti-hallucination contract: this layer NEVER invents a phenotype. It extracts
   {gene, diplotype} pairs and asks src/phenotype.js to compute. Any allele the
   engine can't map is surfaced as a safe-fail, never guessed. */

const GENOTYPE_SAMPLES = {
  anna: "# Synthetic lab report — Anna Bergström (MRN-100482)\nCYP2C19\t*2/*2\nCYP2D6\t*1/*1\nCYP2B6\t*1/*6\n",
  erik: "# Synthetic lab report — Erik Lindqvist (MRN-100517)\nCYP2D6\t*4/*4\nCYP2C19\t*1/*1\n",
  sofia: "# Synthetic lab report — Sofia Nilsson (MRN-100623)\nCYP2C19\t*17/*17\nCYP2D6\t*1/*2\n",
};

function normalizeGeneToken(raw) {
  const key = String(raw || "").toUpperCase().replace(/[\s_]+/g, "");
  return genes.includes(key) ? key : null;
}

function normalizeDiplotypeToken(raw) {
  const cleaned = String(raw || "").replace(/\s+/g, "");
  return /^\*[0-9A-Za-z]+(\/\*[0-9A-Za-z]+)$/.test(cleaned) ? cleaned : null;
}

function extractDiplotypes(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return { pairs: [], errors: ["No genotype text provided."] };
  }

  if (text[0] === "{" || text[0] === "[") {
    try {
      const json = JSON.parse(text);
      const list = Array.isArray(json?.genotypes) ? json.genotypes : null;
      const pairs = [];
      const errors = [];
      const seen = new Set();
      const push = (g, d) => {
        const gene = normalizeGeneToken(g);
        const diplotype = normalizeDiplotypeToken(d);
        if (!gene) return errors.push(`Unsupported gene "${g}".`);
        if (!diplotype) return errors.push(`Bad diplotype "${d}" for ${g}.`);
        if (!seen.has(gene)) { seen.add(gene); pairs.push({ gene, diplotype }); }
      };
      if (list) list.forEach((entry) => push(entry.gene, entry.diplotype));
      else Object.entries(json).forEach(([g, d]) => push(g, d));
      return { pairs, errors };
    } catch (_e) {
      return { pairs: [], errors: ["File looks like JSON but could not be parsed."] };
    }
  }

  const pairs = [];
  const errors = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    const tokens = trimmed.split(/[\t,;:]|\s+/).filter(Boolean);
    if (tokens.length < 2) return errors.push(`Could not read "${trimmed}" (expected: GENE  *x/*y).`);
    const gene = normalizeGeneToken(tokens[0]);
    const diplotype = normalizeDiplotypeToken(tokens.slice(1).join(""));
    if (!gene) return errors.push(`Unsupported gene in "${trimmed}". Datum covers ${genes.join(", ")}.`);
    if (!diplotype) return errors.push(`Could not read a diplotype in "${trimmed}" (expected star alleles, e.g. *2/*2).`);
    if (seen.has(gene)) return;
    seen.add(gene);
    pairs.push({ gene, diplotype });
  });
  return { pairs, errors };
}

function computePhenotypes(pairs) {
  const fn = window.DatumPhenotype && window.DatumPhenotype.diplotypeToPhenotype;
  if (typeof fn !== "function") {
    return { computed: [], unmapped: [], moduleMissing: true };
  }
  const computed = [];
  const unmapped = [];
  pairs.forEach(({ gene, diplotype }) => {
    let res = null;
    try {
      res = fn(gene, diplotype);
    } catch (_e) {
      res = null;
    }
    const phenotype = res && res.phenotype ? res.phenotype : null;
    if (phenotype) {
      computed.push({ gene, diplotype, phenotype });
    } else {
      unmapped.push({ gene, diplotype, reason: (res && res.reason) || "Allele not recognized." });
    }
  });
  return { computed, unmapped, moduleMissing: false };
}

function applyComputedGenotypes(computed) {
  const genotypesForChips = [];
  genes.forEach((gene) => {
    const hit = computed.find((c) => c.gene === gene);
    const input = document.getElementById(`gene-${gene}`);
    if (input && hit) {
      input.value = hit.phenotype;
    }
    if (hit) {
      genotypesForChips.push({ gene, diplotype: hit.diplotype, phenotype: hit.phenotype });
    }
  });

  state.patientMeta = {
    ...state.patientMeta,
    id: state.patientMeta.id || "Uploaded genotype",
    genotypes: genotypesForChips.length ? genotypesForChips : state.patientMeta.genotypes,
  };

  if (elements.genomicsSourceBadge) {
    elements.genomicsSourceBadge.textContent = "Source: computed by Datum from raw genotype";
  }
  renderGenotypeChips();
  renderPatientBanner();
  resetResults();
}

function renderIngestReport({ computed, unmapped, errors }) {
  const rows = [];
  computed.forEach((c) => {
    rows.push(`
      <div class="ingest-row ingest-row-ok">
        <span class="chip-gene">${escapeHtml(c.gene)}</span>
        <span class="chip-diplotype">${escapeHtml(c.diplotype)} <span class="chip-arrow">→</span></span>
        <span class="chip-phenotype">${escapeHtml(c.phenotype)}</span>
        <span class="ingest-provenance">computed by Datum</span>
      </div>`);
  });
  unmapped.forEach((u) => {
    rows.push(`
      <div class="ingest-row ingest-row-unknown">
        <span class="chip-gene">${escapeHtml(u.gene)}</span>
        <span class="chip-diplotype">${escapeHtml(u.diplotype)}</span>
        <span class="ingest-provenance">not recognized — enter this phenotype manually below</span>
      </div>`);
  });
  (errors || []).forEach((e) => {
    rows.push(`<div class="ingest-row ingest-row-error">${escapeHtml(e)}</div>`);
  });
  elements.genotypeIngestReport.innerHTML = rows.join("");
}

function runGenotypeIngestion() {
  const { pairs, errors } = extractDiplotypes(elements.genotypeInput.value);

  if (!pairs.length) {
    setStatus(elements.genotypeIngestStatus, errors[0] || "Could not read any genotype. Expected lines like: CYP2C19  *2/*2", "flag-error");
    renderIngestReport({ computed: [], unmapped: [], errors });
    return;
  }

  const { computed, unmapped, moduleMissing } = computePhenotypes(pairs);

  if (moduleMissing) {
    setStatus(elements.genotypeIngestStatus, "Phenotype engine not loaded. Enter phenotypes manually below.", "flag-error");
    renderIngestReport({ computed: [], unmapped: pairs.map((p) => ({ ...p })), errors });
    return;
  }

  if (computed.length) {
    applyComputedGenotypes(computed);
  }

  if (unmapped.length) {
    const which = unmapped.map((u) => `${u.gene} ${u.diplotype}`).join(", ");
    setStatus(
      elements.genotypeIngestStatus,
      computed.length
        ? `Computed ${computed.length} phenotype(s). Could not map: ${which}. Enter those manually below.`
        : `No diplotype could be mapped (${which}). Enter the phenotype manually below.`,
      "flag-fallback",
    );
  } else {
    setStatus(elements.genotypeIngestStatus, `Computed ${computed.length} phenotype(s) from the raw genotype. Values applied above.`, "flag-live");
  }
  renderIngestReport({ computed, unmapped, errors });
}

function loadGenotypeSample(key) {
  const sample = GENOTYPE_SAMPLES[key];
  if (!sample) return;
  elements.genotypeInput.value = sample;
  elements.genotypeIngest.open = true;
  setStatus(elements.genotypeIngestStatus, "Sample loaded. Press Compute phenotypes.", "");
  elements.genotypeIngestReport.innerHTML = "";
}

/* ---------- Combined recommendation (symptom + interactions + PGx) ---------- */

const LEVEL_ICON = { preferred: "✓", neutral: "·", caution: "!", avoid: "✕" };
const LEVEL_LABEL = {
  preferred: "Reasonable first option",
  neutral: "No specific concern",
  caution: "Use with caution",
  avoid: "Better avoided",
};
const LAYER_LABEL = { symptom: "Symptoms", interaction: "Interaction", pgx: "Genetics" };

async function runFanout() {
  const payload = collectPayload();
  const symptomProfileIds = getSymptomProfileIds();
  const currentMeds = getCurrentMeds();

  if (!Object.keys(payload.phenotypeMap).length && !symptomProfileIds.length && !currentMeds.length) {
    elements.fanoutCard.hidden = false;
    setStatus(elements.fanoutStatus, "Add a symptom profile, current medications, or a genotype first.", "flag-error");
    elements.fanoutResults.innerHTML = "";
    return;
  }

  setBusy(elements.runFanout, true, "Ranking...");
  elements.fanoutCard.hidden = false;
  setStatus(elements.fanoutStatus, "Weighing symptoms, interactions, and genetics across all 7 drugs...");

  try {
    const response = await fetch("/api/fan-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phenotypeMap: payload.phenotypeMap,
        symptomProfileIds,
        currentMeds,
        patientContext: {
          patientName: payload.patientName,
          age: payload.age,
          condition: payload.condition,
          previousIssue: payload.previousIssue,
        },
      }),
    });
    const data = await response.json();
    renderFanout(data);
  } catch (_error) {
    setStatus(elements.fanoutStatus, "Ranking failed.", "flag-error");
  } finally {
    setBusy(elements.runFanout, false);
  }
}

function renderFanout(data) {
  const results = (data && data.results) || [];
  if (!results.length) {
    setStatus(elements.fanoutStatus, "No results returned.", "flag-error");
    elements.fanoutResults.innerHTML = "";
    return;
  }

  const s = data.summary || {};
  elements.fanoutSummary.textContent = `${s.preferred || 0} preferred · ${s.neutral || 0} neutral · ${s.caution || 0} caution · ${s.avoid || 0} avoid`;

  const convNote = (data.conversions || []).length
    ? ` Phenoconversion applied: ${data.conversions.map((c) => `${c.culprit} → effective ${c.gene} ${c.to}`).join("; ")}.`
    : "";
  setStatus(
    elements.fanoutStatus,
    (data.anyFallbackUsed ? "Some rows used fallback demo data (live CPIC unavailable)." : "Live CPIC guidance retrieved for the full panel.") + convNote,
    data.anyFallbackUsed ? "flag-fallback" : "flag-live",
  );

  elements.fanoutResults.innerHTML = results
    .map((row) => {
      const reasons = (row.reasons || [])
        .map(
          (r) => `
            <li class="reason reason-${r.layer}">
              <span class="reason-tag">${escapeHtml(LAYER_LABEL[r.layer] || r.layer)}</span>
              <span class="reason-text">${escapeHtml(r.text)}</span>
              ${r.source ? `<span class="reason-source">${escapeHtml(r.source)}</span>` : ""}
            </li>`,
        )
        .join("");
      return `
        <article class="fanout-row level-${row.overallLevel}">
          <div class="fanout-head">
            <span class="fanout-rank">${row.rank}</span>
            <span class="fanout-icon">${LEVEL_ICON[row.overallLevel] || "·"}</span>
            <span class="fanout-drug">${escapeHtml(row.drug)}</span>
            <span class="fanout-label">${escapeHtml(LEVEL_LABEL[row.overallLevel] || "")}${row.fallbackUsed ? " · fallback" : ""}</span>
          </div>
          ${reasons ? `<ul class="reason-list">${reasons}</ul>` : `<p class="fanout-rec">No flag from symptoms, interactions, or genetics.</p>`}
        </article>`;
    })
    .join("");

  if (data.clinicalNote) {
    elements.clinicalNoteBlock.hidden = false;
    elements.clinicalNote.textContent = data.clinicalNote;
  } else {
    elements.clinicalNoteBlock.hidden = true;
  }
}

/* ---------- Wire up ---------- */

[elements.patientName, elements.age, elements.condition, elements.previousIssue].forEach((input) => {
  input.addEventListener("input", () => {
    if (state.activePatientId !== null || elements.patientName.value) {
      renderPatientBanner();
    }
  });
});

genes.forEach((gene) => {
  document.getElementById(`gene-${gene}`).addEventListener("input", renderGenotypeChips);
});

elements.searchDrug.addEventListener("click", searchDrug);
elements.runEvaluation.addEventListener("click", runEvaluation);
elements.runValidation.addEventListener("click", runValidationSuite);
elements.runFanout.addEventListener("click", runFanout);

document.querySelectorAll("[data-meds]").forEach((btn) => {
  btn.addEventListener("click", () => {
    elements.currentMeds.value = btn.dataset.meds || "";
  });
});

elements.genotypeParse.addEventListener("click", runGenotypeIngestion);
elements.genotypeFileTrigger.addEventListener("click", () => elements.genotypeFile.click());
elements.genotypeFile.addEventListener("change", () => {
  const file = elements.genotypeFile.files && elements.genotypeFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    elements.genotypeInput.value = reader.result;
    elements.genotypeIngest.open = true;
    setStatus(elements.genotypeIngestStatus, `Loaded ${file.name}. Press Compute phenotypes.`, "");
  };
  reader.readAsText(file);
});
elements.genotypeIngest.querySelectorAll("[data-sample]").forEach((btn) => {
  btn.addEventListener("click", () => loadGenotypeSample(btn.dataset.sample));
});

renderRoster();
loadConfig().then(() => selectPatient(PATIENTS[0].id));
