# Attune — Design Spec

**Date:** 2026-06-21
**Branch:** `erik-work`
**Context:** Hackathon build (Pinecone Ventures, Visby). 24h window, Demo Day in
front of investors + Cambio (the Cosmic EHR vendor). This spec is the agreed
build for Erik's branch. It refines the technical handoff (`docs/Attune_Technical_Handoff.md`)
with two team decisions made during brainstorming.

---

## 1. What we are building

Attune is a **SMART on FHIR clinical decision-support panel** for starting
antidepressants. It launches inside a (simulated) EHR, reads the live patient
context and medication list via FHIR R4, and renders a short, sourced
recommendation: which SSRI to favor or avoid, starting dose, and what to monitor.

Positioning (handoff §1, clinician summary): Attune does **not** predict which
drug is most *effective*. It flags exposure/tolerability risk and dangerous
interactions, and puts pharmacogenetics *in context*. Decision *support* — the
clinician decides. Never "prescribe X."

### Two decisions that scope this build

1. **The integration is the deliverable; the recommendation logic is mocked.**
   The credible, real part of the demo is a genuine SMART on FHIR app launching
   inside a simulated EHR, already knowing the patient, reading the live
   medication list. The "intelligence" is scripted — hard-coded sourced lines
   plus one trivial real check (phenoconversion). No CPIC/DPWG engine.

2. **Simulated-journal target = SMART Health IT launcher (dev) + OpenEMR (demo).**
   Cambio Open Services (COS) was rejected as the target: it exposes FHIR data
   APIs only (no SMART App Launch), and key access is gated behind a signup +
   "register your idea" approval step we cannot wait on in a 24h window. Instead
   we use open-source / no-signup backends (see §3).

---

## 2. Architecture

Pure **React + Vite + TypeScript SPA**. No backend. SMART App Launch via the
`fhirclient` library handles the OAuth2 dance; the launch context supplies the
FHIR base URL (`iss`) and a bearer token, so the SPA calls FHIR directly from
the browser. Nothing about the FHIR endpoint is hardcoded — the same build works
against any SMART-capable EHR that launches it.

```
┌─────────────────────────────────────────────┐
│  Simulated EHR (SMART launcher OR OpenEMR)   │
│  - Launches Attune in an iframe / new tab    │
│  - Passes: launch token + iss (FHIR base URL)│
└───────────────┬─────────────────────────────┘
                │ SMART App Launch (OAuth2)
                ▼
┌─────────────────────────────────────────────┐
│  ATTUNE (React/Vite/TS SPA)                  │
│  1. /launch → fhirclient.authorize()         │
│  2. /app → fhirclient.ready() → client       │
│  3. fhir/ reads Patient, MedicationRequest,  │
│     Condition → typed models                 │
│  4. recommendation/ (mocked) → Recommendation│
│  5. ui/ renders the panel; phenotype dropdown│
│     re-runs recommendation live              │
└───────────────┬─────────────────────────────┘
                │ FHIR R4 REST (read, bearer token)
                ▼
┌─────────────────────────────────────────────┐
│  FHIR server (launcher HAPI  OR  OpenEMR)    │
│  Patient / MedicationRequest / Condition     │
└─────────────────────────────────────────────┘
```

---

## 3. FHIR targets

Same app code, two launch sources:

- **Dev — `https://launch.smarthealthit.org`.** Instant, no signup, real SMART
  launch, pre-loaded Synthea synthetic patients, R4 HAPI backend. Primary
  development target from minute one.
- **Demo — OpenEMR (self-hosted, Docker).** A real open-source EHR with a
  clinician UI, FHIR R4 + SMART on FHIR v2.2.0 (EHR launch). Register Attune as a
  SMART app and launch it from inside OpenEMR for the "inside a real journal"
  moment. Self-hosted = no signup and no demo-day network/approval dependency.

If COS sandbox keys happen to arrive later, the same app can point at COS too —
but COS is explicitly **not** on the critical path.

---

## 4. Components (isolated, independently testable units)

Each unit has one purpose and a defined interface so it can be understood and
tested alone, and the mock layer can later be swapped for a real engine without
touching FHIR or UI.

### `auth/`
Wraps `fhirclient`. Two routes:
- **`/launch`** — entry point the EHR calls. Calls `FHIR.oauth2.authorize({ clientId, scope: "launch openid fhirUser patient/*.read", redirectUri: "/app" })`.
- **`/app`** — redirect target. Calls `FHIR.oauth2.ready()` → returns a ready client.

### `fhir/`
Typed read functions over the ready client. Maps raw FHIR resources to plain
typed models so nothing downstream touches FHIR JSON shapes:
- `getPatient(client): Patient` — id, name, age, sex.
- `getActiveMedications(client): Medication[]` — from `MedicationRequest?patient=&status=active`, normalized drug names (lowercased generic where resolvable).
- `getConditions(client): Condition[]` — from `Condition?patient=`.

### `recommendation/` (the mocked engine)
Pure function, no I/O:
`recommend({ patient, medications, conditions, phenotype }): Recommendation`.
- **Hard-coded** dose/monitoring lines and source tags for the worked cases
  (escitalopram + CYP2C19 PM, escitalopram + CYP2C19 UM, serotonergic combo).
- **One real check kept** — phenoconversion: if `medications` contains a strong
  CYP2D6 inhibitor (`paroxetine`, `fluoxetine`, `bupropion`), emit the
  "functional CYP2D6 poor metabolizer" line even when `phenotype === "NM"`. This
  is a list-membership test over real FHIR data — trivial, but it is the demo's
  hero moment and reads as live.
- Output is a list of lines, each `{ text, level: "preferred"|"caution"|"avoid"|"info", source }`.
- Interface is identical to what a real engine would expose, so the mock is not
  throwaway.

### `ui/`
- `PatientHeader` — name, age, sex.
- `MedicationList` — the live active med list (proves the FHIR read on stage).
- `PhenotypeSelector` — dropdown UM / NM / IM / PM. Explicitly labeled as
  entered/simulated (handoff §7: do not imply the sandbox supplied genotype).
- `RecommendationPanel` — renders recommendation lines; updates live on dropdown
  change.
- `SourceTag` — small per-line source chip (CPIC 2023 / DPWG 2023 / FASS).

Clinical, compact styling — looks like it belongs in a clinical screen.

### `mock/`
Local synthetic FHIR `Bundle` JSON + a loader, for the §12 "everything FHIR
breaks" fallback. Same `recommendation/` and `ui/` run against it unchanged.
State clearly on stage that it is synthetic if used.

---

## 5. Data flow

EHR launch → `auth` (`/launch` → `/app`) → `fhir` reads (Patient, active
MedicationRequest, Condition) → `recommendation(inputs + phenotype)` →
`RecommendationPanel`. Changing the `PhenotypeSelector` dropdown re-runs the pure
`recommend()` function and re-renders the panel — live updates, no refetch.

---

## 6. Error handling

- **Launch / auth failure** → fall back to standalone SMART launch with a patient
  picker (still real FHIR). Surface a clear error state, not a blank screen.
- **CORS blocked** (OpenEMR FHIR server rejects browser calls) → drop in a small
  Node/Express proxy that forwards FHIR reads. Back-pocket only; not built unless
  needed.
- **All FHIR unavailable** → load the local synthetic `Bundle` from `mock/` and
  run the same panel. Honest local-data demo beats a fake live one.
- **Missing/odd FHIR fields** (no age, unresolved med codes) → degrade
  gracefully; never crash the panel.

---

## 7. Testing

**Vitest** unit tests on the two pure layers:
- `recommendation/` — the hero cases: escitalopram + CYP2C19 PM (dose reduction),
  escitalopram + CYP2C19 UM (underexposure), paroxetine phenoconversion
  (functional CYP2D6 PM with phenotype = NM), serotonergic combo flag.
- `fhir/` — mappers from sample FHIR resources to typed models.

SMART/auth plumbing is verified manually against `launch.smarthealthit.org`.
Light, hackathon-appropriate — no e2e harness.

---

## 8. Scope cuts (YAGNI for the 24h)

- No real CPIC/DPWG dataset — scripted lines only.
- No `Observation` / `AllergyIntolerance` reads in v1 (add if time).
- No Cambio COS integration (off critical path).
- No `aehrc/SMART-EHR-Launcher` — OpenEMR is the embed surface.
- No backend unless CORS forces the proxy fallback.

---

## 9. Demo script (handoff §10, adapted)

1. Open OpenEMR with a patient loaded.
2. Click "Attune" → panel launches embedded, already knowing the patient (no
   second login). "Standard SMART on FHIR launch — same way it drops into Cosmic."
3. Show it reading the live medication list via FHIR.
4. Set the phenotype dropdown to **Poor Metabolizer** → recommendation updates
   with a sourced dose-reduction line.
5. **Money moment:** keep phenotype **Normal**, but the patient is on paroxetine →
   Attune flags **functional CYP2D6 poor metabolizer via phenoconversion**. "A
   static gene test would call this patient normal. Attune doesn't, because it
   reads the medication list."

---

## 10. Known dependency / risk

The hero phenoconversion case needs a synthetic patient whose **active med list
includes a strong CYP2D6 inhibitor** (paroxetine / fluoxetine / bupropion). The
launcher's Synthea patients may not have one. Resolved during build by either
selecting a suitable synthetic patient or loading a custom patient/medication
into OpenEMR. This is the one data dependency to nail before the demo.

---

## 11. Tech stack

- React + Vite + TypeScript.
- `fhirclient` (npm) for SMART App Launch + FHIR access.
- Plain CSS or Tailwind — clean, compact, clinical.
- Vitest for unit tests.
- Local Vite dev server; deploy to Vercel/Netlify if a public redirect URL is
  needed for the launcher. OpenEMR + app both on localhost works for a
  same-machine demo.
