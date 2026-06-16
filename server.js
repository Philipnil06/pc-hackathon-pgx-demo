const express = require("express");
const path = require("path");

const {
  DEFAULT_POPULATION,
  DEMO_PATIENT,
  FALLBACK_MODE_MESSAGE,
  FallbackError,
  getMedicationWorkflow,
  runValidationSuite,
} = require("./src/cpic");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

app.listen(PORT, () => {
  console.log(`PC Hackathon PGx demo running at http://localhost:${PORT}`);
});
