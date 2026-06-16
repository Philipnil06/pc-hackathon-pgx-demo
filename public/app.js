const state = {
  config: null,
  lastResult: null,
  lastValidationSuite: null,
};

const elements = {
  disclaimer: document.getElementById("global-disclaimer"),
  loadDemo: document.getElementById("load-demo"),
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
  recommendationCards: document.getElementById("recommendation-cards"),
  emptyState: document.getElementById("empty-state"),
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
};

const genes = ["CYP2C19", "CYP2D6", "CYP2B6"];

function setBusy(button, busy, text) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
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

function setStatus(element, text, className = "") {
  element.className = `inline-status ${className}`.trim();
  element.textContent = text;
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
            <strong>${match.name}</strong><br />
            Drug ID: ${match.drugid}${match.rxnormid ? ` | RxNorm: ${match.rxnormid}` : ""}
          </div>`,
      )
    : pairs.map(
        (pair) => `
          <div class="simple-list-item">
            <strong>${pair.drugname}</strong><br />
            Gene pair: ${pair.genesymbol} | CPIC level: ${pair.cpiclevel || "n/a"}
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

function formatInputGenes(genesMap) {
  return Object.entries(genesMap || {})
    .map(([gene, phenotype]) => `${gene}: ${phenotype || "(empty)"}`)
    .join(", ");
}

function renderRecommendationCards(result) {
  const recommendations = result?.recommendationMatches || [];

  if (!recommendations.length) {
    elements.recommendationCards.innerHTML = `
      <div class="recommendation-card">
        <header>
          <div>
            <strong>No CPIC recommendation found for this exact gene-drug combination.</strong>
          </div>
        </header>
        <p>Possible reasons:</p>
        <ul class="guardrail-list">
          ${(result.noRecommendationReasons || [])
            .map((reason) => `<li>${reason}</li>`)
            .join("")}
        </ul>
      </div>
    `;
    elements.emptyState.style.display = "none";
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
              <p class="section-kicker">Clinical Flag</p>
              <strong>${entry.classification || "Unclassified"}</strong>
            </div>
            <span class="status-badge">${gene}: ${lookup}</span>
          </header>
          <p><strong>Possible implication:</strong> ${implication}</p>
          <p><strong>Recommendation:</strong> ${entry.drugrecommendation || "n/a"}</p>
          <p><strong>Comments:</strong> ${entry.comments || "n/a"}</p>
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Population</span>
              ${entry.population || "n/a"}
            </div>
            <div class="meta-item">
              <span class="meta-label">Drug ID</span>
              ${entry.drugid || "n/a"}
            </div>
            <div class="meta-item">
              <span class="meta-label">Guideline</span>
              ${
                guidelineLink
                  ? `<a href="${guidelineLink}" target="_blank" rel="noreferrer">${result.guideline?.name || matchingPair?.guidelinename || "Open CPIC guideline"}</a>`
                  : result.guideline?.name || matchingPair?.guidelinename || "n/a"
              }
            </div>
            <div class="meta-item">
              <span class="meta-label">Evidence Source</span>
              CPIC recommendation table
            </div>
            <div class="meta-item">
              <span class="meta-label">Pair Evidence</span>
              ${
                matchingPair?.guidelineurl
                  ? `<a href="${matchingPair.guidelineurl}" target="_blank" rel="noreferrer">CPIC pair view</a>`
                  : "n/a"
              }
            </div>
            <div class="meta-item">
              <span class="meta-label">PMIDs</span>
              ${pmids}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  elements.emptyState.style.display = "none";
}

function renderSummaries(result) {
  elements.doctorSummary.textContent = result.summaries?.doctorSummary || "No summary available.";
  elements.patientSummary.textContent =
    result.summaries?.patientExplanation || "No patient explanation available.";
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

function renderValidationSummary(summary) {
  elements.summaryPassRate.textContent = `${summary.passed} / ${summary.total} tests passed`;
  elements.summaryLiveCount.textContent = String(summary.liveCpicResults);
  elements.summarySafeFailures.textContent = String(summary.safeFailures);
  elements.summaryHallucinations.textContent = String(summary.hallucinatedRecommendations);
}

function renderValidationResults(payload) {
  state.lastValidationSuite = payload;
  renderValidationSummary(payload.summary);

  elements.validationResults.innerHTML = payload.cases
    .map(
      (testCase) => `
        <article class="validation-card ${testCase.pass ? "validation-pass" : "validation-fail"}">
          <header class="validation-header">
            <div>
              <p class="section-kicker">Validation Case</p>
              <h3>${testCase.testName}</h3>
            </div>
            <span class="status-badge">${testCase.pass ? "PASS" : "FAIL"}</span>
          </header>
          <div class="validation-grid-inner">
            <div class="meta-item">
              <span class="meta-label">Input</span>
              Drug: ${testCase.input.drug}<br />
              ${formatInputGenes(testCase.input.genes)}
            </div>
            <div class="meta-item">
              <span class="meta-label">Expected</span>
              ${testCase.expectedBehavior}
            </div>
            <div class="meta-item">
              <span class="meta-label">Actual</span>
              ${testCase.actualBehavior}
            </div>
            <div class="meta-item">
              <span class="meta-label">Source</span>
              ${testCase.sourceUsed}
            </div>
            <div class="meta-item">
              <span class="meta-label">Fallback Used</span>
              ${testCase.fallbackUsed ? "Yes" : "No"}
            </div>
            <div class="meta-item">
              <span class="meta-label">Explanation</span>
              ${testCase.shortExplanation}
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

async function loadConfig() {
  const response = await fetch("/api/config");
  state.config = await response.json();
  elements.disclaimer.textContent = "Clinical decision support only. Final decision remains with the physician.";
}

function loadDemoPatient() {
  const demo = state.config?.demoPatient;

  if (!demo) {
    return;
  }

  elements.patientName.value = demo.patientName;
  elements.age.value = demo.age;
  elements.condition.value = demo.condition;
  elements.previousIssue.value = demo.previousIssue;
  elements.drugQuery.value = demo.drugQuery;

  Object.entries(demo.phenotypeMap).forEach(([gene, value]) => {
    const input = document.getElementById(`gene-${gene}`);
    if (input) {
      input.value = value;
    }
  });
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
    return;
  }

  setBusy(elements.runEvaluation, true, "Looking up...");
  setStatus(elements.resultStatus, "Querying CPIC for gene-drug evidence...");

  try {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
  setStatus(
    elements.validationStatus,
    "Running predefined validation cases against the live workflow...",
  );

  try {
    const response = await fetch("/api/validation-suite", {
      method: "POST",
    });
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
    setStatus(
      elements.validationStatus,
      error.message || "Validation suite failed.",
      "flag-error",
    );
  } finally {
    setBusy(elements.runValidation, false);
  }
}

elements.loadDemo.addEventListener("click", loadDemoPatient);
elements.searchDrug.addEventListener("click", searchDrug);
elements.runEvaluation.addEventListener("click", runEvaluation);
elements.runValidation.addEventListener("click", runValidationSuite);

loadConfig().then(loadDemoPatient);
