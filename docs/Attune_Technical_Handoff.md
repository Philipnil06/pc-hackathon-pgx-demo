# Attune — Technical Handoff for the Builder

**Context:** Hackathon build (Pinecone Ventures, Visby). 24h window, Demo Day in front of investors + Cambio (the Cosmic EHR vendor) in the room. This document tells you exactly what to build and why.

**Read this first, in one sentence:** We are NOT building a website and we are NOT building a screen-scraping overlay. We are building a **SMART on FHIR app** — the industry-standard way a third-party tool launches *inside* an EHR, reads the live patient context, and renders a recommendation panel. This is both the fastest credible demo and the real path into Cambio Cosmic.

---

## 1. The product in one paragraph

Attune is a **clinical decision-support layer** for starting antidepressants. Given the patient's symptom profile, **live medication list**, diagnosis, and (when available) pharmacogenetic phenotype (CYP2C19 / CYP2D6), it returns a **short, sourced, traceable recommendation**: which SSRI to favor or avoid, what starting dose, and what to monitor. 

**Critical framing for the logic:** Attune does **not** predict which drug will be most *effective*. It flags exposure/tolerability risk (genotype) and dangerous combinations (interactions), and it puts pharmacogenetics *in context*. Build the logic to reflect that — it is rule-based and explainable, not a black box. (This is also what keeps us on the safer side of medical-device regulation; see §9.)

---

## 2. Why SMART on FHIR, not an overlay

There are two "surfaces" to an EHR:

1. **Data surface** — how you read patient data. Modern EHRs (including Cosmic) expose this as a **FHIR API**: clean, structured JSON resources. You query it; you do not OCR the screen.
2. **Visual surface** — where your UI appears. The standard is **SMART App Launch**: the EHR opens your app in an **iframe / embedded panel** and hands it the current patient context via an OAuth2 token.

Together these are "SMART on FHIR." The clinician clicks a button in the EHR, your panel appears already knowing which patient is open — no second login, no patient lookup, no copy-paste.

**Why this beats the overlay/Togi/OCR idea:**
- Structured FHIR data (the real medication list) is far more reliable than scraping pixels.
- It is the *actual* integration path into Cosmic, so the demo doubles as a real go-to-market proof.
- "We built against Cambio's open FHIR sandbox" is a concrete traction claim — strong with Cambio in the room.
- An overlay only makes sense for EHRs with no API. Cosmic has one. Use it.

---

## 3. Architecture

```
┌─────────────────────────────────────────────┐
│  EHR (sandbox for the demo)                  │
│  - Launches Attune in an iframe              │
│  - Passes: launch token + iss (FHIR base URL)│
└───────────────┬─────────────────────────────┘
                │ SMART App Launch (OAuth2)
                ▼
┌─────────────────────────────────────────────┐
│  ATTUNE (React/Vite SPA)                     │
│  1. Receives launch → OAuth2 handshake       │
│  2. Reads FHIR resources for current patient │
│  3. Runs rule engine (the differentiator)    │
│  4. Renders sourced recommendation panel     │
└───────────────┬─────────────────────────────┘
                │ FHIR R4 REST (read)
                ▼
┌─────────────────────────────────────────────┐
│  FHIR server (sandbox)                        │
│  Patient / MedicationRequest / Condition /    │
│  Observation / AllergyIntolerance             │
└─────────────────────────────────────────────┘
```

Three layers to build:
- **Launch + auth** (boilerplate, use a library — §6)
- **FHIR data fetch** (a few read calls — §7)
- **Rule engine + UI** (this is the actual product — §8). Spend your time here.

---

## 4. Sandbox options (pick one to start, in this order)

You do **not** need a real EHR. Use a simulator that performs a real SMART launch.

1. **SMART App Launcher — `https://launch.smarthealthit.org`** (recommended starting point.)
   - Free, public, no signup. Simulates an EHR launch, lets you pick a synthetic patient, hands your app a launch token + a working FHIR R4 endpoint. This is what you develop against first.
2. **`aehrc/SMART-EHR-Launcher`** (GitHub, open source.)
   - A React EHR-simulator dashboard that renders your app **embedded inside a mock EHR** with patient/encounter switching. Use this to make the demo *look* like it's inside an EHR. Run locally via Docker.
3. **Cambio Open Services (COS) sandbox — `https://developer.openservices.cambio.se`** (the credibility play.)
   - A **full COSMIC install with synthetic test data**, FHIR + REST APIs, Azure API Management. Requires signup for API keys; production access is gated behind registering an idea via "Cambio innovation" (B2B). For the hackathon: sign up, get sandbox keys, and at minimum hit one FHIR endpoint so you can truthfully say "Attune runs against Cambio's COS sandbox." 
   - **Open question to resolve with Cambio (they're at the event):** confirm whether COS exposes full **SMART App Launch** (embedded iframe + context) or **FHIR data APIs only**. If data-only, do the embedded-launch demo on the SMART Launcher (option 1/2) and use COS for the data-layer proof.

**Plan:** develop on option 1, dress the demo with option 2, and get at least one real call against option 3 for the traction line.

---

## 5. Tech stack

- **Frontend:** React + Vite + TypeScript (fast to scaffold, matches the SMART tooling).
- **SMART/FHIR client:** `fhirclient` (npm, the official SMART Health IT JS library, a.k.a. fhirclient.js). Handles the OAuth2 launch dance for you.
- **UI:** Tailwind or plain CSS. Keep the recommendation panel clean and compact — it has to look like it belongs in a clinical screen, not a consumer app.
- **Rule engine:** plain TypeScript module + a JSON ruleset. No ML. Deterministic and traceable on purpose.
- **Hosting for the demo:** Vite dev server is fine locally; if you need a public URL for the launcher to redirect to, deploy to Vercel/Netlify (free).

---

## 6. Launch + auth (boilerplate)

Install:
```bash
npm create vite@latest attune -- --template react-ts
cd attune && npm install fhirclient
```

You need two routes/pages:

**`/launch`** — entry point the EHR calls. Kicks off OAuth2.
```js
import FHIR from "fhirclient";

FHIR.oauth2.authorize({
  clientId: "attune",            // registered client id (sandbox: any value works)
  scope: "launch openid fhirUser patient/*.read",
  redirectUri: "/app",
});
```

**`/app`** — where the EHR redirects back. Completes auth, gives you a ready client.
```js
import FHIR from "fhirclient";

FHIR.oauth2.ready().then(async (client) => {
  const patient = await client.patient.read();              // current patient
  const meds = await client.request(
    `MedicationRequest?patient=${client.patient.id}&status=active`,
    { flat: true }
  );
  const conditions = await client.request(
    `Condition?patient=${client.patient.id}`, { flat: true }
  );
  // → hand these to the rule engine (§8)
});
```

To test: open `https://launch.smarthealthit.org`, set the app's launch URL to your `/launch` route, pick a patient, go. (For local dev you'll point the launcher at your `http://localhost:5173/launch`, or deploy and use the public URL.)

> Note: exact `fhirclient` method names/options are stable but check the current docs (docs.smarthealthit.org / npm `fhirclient`) if anything errors. Watch for **CORS** — if the sandbox FHIR server blocks browser calls, route requests through a tiny backend proxy.

---

## 7. FHIR resources to fetch (the inputs)

Read these for the launched patient (all FHIR R4):

| Resource | What you use it for |
|---|---|
| `Patient` | age, sex (dosing context, elderly flag) |
| `MedicationRequest` (status=active) | **the live medication list** — the core input for interaction + phenoconversion checks |
| `Condition` | diagnosis / symptom context (depression, anxiety, etc.) |
| `Observation` | labs if present; also where a PGx genotype result could live |
| `AllergyIntolerance` | safety, avoid-list |

**Pharmacogenetic phenotype (CYP2C19 / CYP2D6):** in the real world this comes from a lab result. Sandboxes won't have it. For the demo, provide it as a **manual input field** (a dropdown: Normal / Intermediate / Poor / Ultrarapid metabolizer) so you can show the recommendation changing live. Be explicit in the demo that genotype is entered/simulated — do not imply the sandbox supplied it.

---

## 8. The rule engine (this is the product — spend your time here)

Keep it **deterministic, ordered, and traceable**. Every output line cites why. This mirrors the clinical positioning and is the part judges will probe.

**Processing order:**

1. **Symptom profile** (from `Condition` + a few UI toggles): e.g. depression + insomnia, depression + anxiety, fatigue-dominant, weight concern, pain, sexual-side-effect concern, suicidality flag.
2. **Interaction / risk scan** over the active medication list: serotonergic load (→ serotonin syndrome risk), CYP inhibitors/inducers, QT-prolongation risk, bleeding risk (e.g. SSRIs + NSAID/anticoagulant), sedation load.
3. **PGx filter** (CYP2C19 / CYP2D6 phenotype → CPIC/DPWG dosing guidance for the candidate SSRI).
4. **Phenoconversion adjustment** — the differentiator: if the med list contains a strong inhibitor of the relevant enzyme, **downgrade the effective phenotype** even if genotype is "normal." (A genotypic normal metabolizer on a strong CYP2D6 inhibitor is a *functional* poor metabolizer.)
5. **Output**: a short, sourced recommendation — favored agent(s), avoid list, start dose, monitoring — each with a one-line rationale and source tag.

**Minimal ruleset data structure (extend as time allows):**
```ts
type Phenotype = "UM" | "NM" | "IM" | "PM";

interface DrugGeneRule {
  drug: string;            // e.g. "escitalopram"
  gene: "CYP2C19" | "CYP2D6";
  guidance: Record<Phenotype, {
    action: "standard" | "reduce_dose" | "avoid" | "monitor";
    note: string;          // shown to clinician
    source: string;        // "CPIC 2023" | "DPWG 2023" | "FASS"
  }>;
}

// Strong inhibitors that trigger phenoconversion
const CYP2D6_STRONG_INHIBITORS = ["paroxetine", "fluoxetine", "bupropion", "quinidine"];
const CYP2C19_INHIBITORS = ["fluvoxamine", "fluconazole", "omeprazole" /* moderate */];
```

**Worked examples to hard-code for the demo (clinically grounded):**

- **Escitalopram + CYP2C19 Poor Metabolizer** → exposure is markedly higher in PMs; DPWG advises reducing to ≤50% of the normal max dose, or choosing an alternative. Output: *"Reduce starting dose / consider alternative — CYP2C19 PM, ~2–3× higher escitalopram exposure (CPIC/DPWG)."*
- **Escitalopram + CYP2C19 Ultrarapid Metabolizer** → lower exposure, higher risk of non-response/switching. Output: *"Standard dose may underexpose; monitor response, consider alternative (CYP2C19 UM)."*
- **Phenoconversion case:** patient is **CYP2D6 genotype Normal** but is **on paroxetine/fluoxetine/bupropion** → flag *functional* PM for CYP2D6-metabolized candidates. Output: *"Effective CYP2D6 poor metabolizer due to interacting drug (strong inhibitor present) — genotype alone would miss this."* **This is the slide that wins the room** — it shows why a static gene test (GeneSight) is not enough and a context-aware tool is.
- **Serotonergic combo flag:** candidate SSRI + existing serotonergic agent (e.g. tramadol, triptan, another SSRI/SNRI, MAOI) → serotonin-syndrome caution line.

Make every output line carry a **source tag** (CPIC 2023 / DPWG 2023 / FASS). Traceability is the credibility.

---

## 9. Regulatory note (build-time implications, brief)

A tool that **generates a drug/dose recommendation** is, under EU MDR Rule 11, realistically a **Class IIa** medical device (more if a wrong output could cause serious harm). That is a post-hackathon concern, but two build choices keep options open:

- Keep the engine **rule-based and fully traceable** (every recommendation cites a guideline). Easier to validate than a model.
- Frame the UI as **decision *support*** — it informs the clinician, who decides. Avoid language/UX that "auto-prescribes."

You don't need to do anything regulatory for the demo. Just don't architect it as an opaque auto-prescriber.

---

## 10. Demo script (what to show on stage)

1. Open the mock EHR (SMART-EHR-Launcher), patient already loaded.
2. Click "Attune" → panel launches embedded, **already knowing the patient** (no login). Say: *"Standard SMART on FHIR launch — same way it drops into Cambio Cosmic."*
3. Show it reading the **live medication list** via FHIR.
4. Set the CYP2C19 phenotype dropdown to **Poor Metabolizer** → recommendation updates with a sourced dose-reduction line.
5. **The money moment:** keep genotype "Normal," but show a patient already on paroxetine → Attune flags **functional CYP2D6 poor metabolizer via phenoconversion**. Say: *"A static gene test would call this patient normal. Attune doesn't, because it reads the medication list."*
6. Switch to a browser tab showing the **Cambio COS sandbox** call returning FHIR data. Say: *"This isn't a mockup — we're running against Cambio's open FHIR sandbox."*

---

## 11. Build order / time budget (24h)

| Block | Task | Done = |
|---|---|---|
| 0–2h | Scaffold Vite app, install `fhirclient`, hello-world | App runs locally |
| 2–5h | SMART launch against `launch.smarthealthit.org`, read Patient + MedicationRequest | Console logs real patient + meds |
| 5–9h | Rule engine v1: CYP2C19 + escitalopram dosing, 3–4 hard-coded drug-gene rules | Recommendation text from inputs |
| 9–13h | **Phenoconversion logic** + interaction/serotonergic flags | The demo's hero case works |
| 13–17h | Recommendation panel UI, phenotype dropdown, source tags | Looks clinical, updates live |
| 17–20h | Embed in `SMART-EHR-Launcher` so it renders inside a mock EHR | Looks "inside" an EHR |
| 20–22h | Cambio COS: sign up, one real FHIR call | Traction line is true |
| 22–24h | Polish, rehearse the §10 script, fallbacks | Smooth 2-min run |

---

## 12. Fallback ladder (if something breaks)

- **SMART launch won't cooperate in time** → run as a **standalone SMART app** (still uses FHIR + a patient picker) and *describe* the embedded launch. Still real, still FHIR-based.
- **CORS blocks browser→FHIR calls** → stand up a 20-line Node/Express proxy that forwards FHIR reads.
- **Everything FHIR breaks** → load a **local synthetic FHIR `Bundle` JSON** and run the engine against it. State clearly it's synthetic data; the rule engine (the actual product) is unchanged. Better an honest local-data demo than a fake live one.

---

## 13. Hard rules — do not violate

- **Do not OCR or scrape the EHR screen.** Use FHIR.
- **Do not build a standalone marketing website.** Build the launchable app.
- **Do not claim Attune predicts efficacy.** It flags exposure/tolerability risk and interactions, and contextualizes genetics. Say that precisely.
- **Do not present synthetic/simulated data as live** without saying so.
- **Do not hard-code a "magic AI picks the drug" black box.** Rule-based + sourced. That's the whole positioning.

---

## 14. Links

- SMART App Launch spec: https://hl7.org/fhir/smart-app-launch/
- SMART App Launcher (sandbox): https://launch.smarthealthit.org
- fhirclient.js docs: https://docs.smarthealthit.org
- EHR simulator (embed your app): https://github.com/aehrc/SMART-EHR-Launcher
- Cambio Open Services (COS): https://developer.openservices.cambio.se
- Cambio FHIR API list: https://fhir.openservices.cambio.se/site/index.html
- Cambio innovation (register idea for COS): https://www.cambio.se/innovation/register-innovation/
- CPIC guidelines (drug-gene dosing): https://cpicpgx.org
- DPWG / PharmGKB: https://www.pharmgkb.org

---

*Owner's note: the rule engine (§8), especially the phenoconversion case, is the product. The FHIR/SMART plumbing is a means to make it land "inside the EHR." If you're short on time, cut polish, not the phenoconversion logic.*
