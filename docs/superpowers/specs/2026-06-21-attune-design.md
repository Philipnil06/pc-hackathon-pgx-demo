# Attune — Design Spec

**Date:** 2026-06-21
**Branch:** `erik-work`
**Context:** Hackathon build (Pinecone Ventures, Visby). 24h window, Demo Day in
front of investors + Cambio (the Cosmic EHR vendor). This spec is the agreed
build for Erik's branch. It refines the technical handoff
(`docs/Attune_Technical_Handoff.md`) with the team's pivot to an
OpenEMR-specific integration.

---

## 1. What we are building

Attune is a **clinical decision-support layer that integrates directly into an
existing EHR (OpenEMR)**. The wedge is the integration itself: doctors already
live in their journal system, so Attune plugs into it rather than asking them to
open a separate portal. Once launched from inside OpenEMR, Attune reads the
patient's **entire journal** via FHIR R4 — medications, conditions, labs,
**genome / pharmacogenetic data, documents**, allergies — extracts the
CYP2C19 / CYP2D6 phenotype from a genome `Observation`, **correlates it against
known gene→drug relationships**, and renders a short, sourced recommendation for
starting an antidepressant.

Positioning (handoff §1, clinician summary): Attune does **not** predict which
drug is most *effective*. It flags exposure/tolerability risk and interactions,
and puts pharmacogenetics *in context*. Decision *support* — the clinician
decides. Never "prescribe X."

### Decisions that scope this build

1. **The integration target is OpenEMR specifically, and it is the point.**
   "Integrate where the doctor already works" is the core value proposition, not
   demo dressing. We stand up OpenEMR **entirely** (Docker) and seed a full mock
   patient profile in it.
2. **Attune reads the whole patient journal**, not just the medication list:
   `Patient`, `MedicationRequest`, `Condition`, `Observation` (labs **+ genome**),
   `DocumentReference`, `AllergyIntolerance`.
3. **Genome comes from OpenEMR as a FHIR `Observation`** with a recognizable
   CYP2C19 / CYP2D6 code; Attune extracts and parses the phenotype. The manual
   phenotype dropdown survives only as a demo override.
4. **The correlation engine is still mocked** for the demo — a small hard-coded
   gene→drug table plus scripted, sourced lines and the phenoconversion check. No
   real CPIC dataset, no ML. Rule-based and traceable on purpose.

Cambio Open Services (COS) is **off the critical path**: it exposes FHIR data
APIs only (no SMART App Launch) and key access is gated behind a signup +
approval step we cannot wait on. OpenEMR replaces it as the simulated journal.

---

## 2. Architecture

Pure **React + Vite + TypeScript SPA**. No backend. `fhirclient` performs the
SMART App Launch with **PKCE** (required by OpenEMR for public/browser clients)
and returns a client bound to the launching EHR's FHIR endpoint.

```
┌─────────────────────────────────────────────┐
│  OpenEMR (self-hosted, Docker)               │
│  - Doctor clicks "Attune" inside OpenEMR     │
│  - SMART EHR launch: launch token + iss      │
└───────────────┬─────────────────────────────┘
                │ SMART App Launch (OAuth2 + PKCE)
                ▼
┌─────────────────────────────────────────────┐
│  ATTUNE (React/Vite/TS SPA)                  │
│  1. /launch → fhirclient.authorize() (PKCE)  │
│  2. /app → fhirclient.ready() → client       │
│  3. fhir/ reads the FULL journal             │
│  4. extract genome phenotype from Observation│
│  5. recommendation/ (mocked) correlates →    │
│     sourced recommendation                   │
│  6. ui/ renders journal + panel; dropdown    │
│     overrides phenotype live                 │
└───────────────┬─────────────────────────────┘
                │ FHIR R4 REST (read, bearer token, patient/*.read)
                ▼
┌─────────────────────────────────────────────┐
│  OpenEMR FHIR R4  /apis/default/fhir/*       │
│  Patient / MedicationRequest / Condition /   │
│  Observation(genome) / DocumentReference /   │
│  AllergyIntolerance                          │
└─────────────────────────────────────────────┘
```

### OpenEMR access model (from research)

- OpenEMR FHIR R4, SMART on FHIR v2.2.0, served at `/apis/default/fhir/*`;
  OAuth2 at `/oauth2/default/*`. APIs are **off by default**; enabled in
  Administration → Connectors, which also requires setting the **Site Address**.
  **OAuth2 requires HTTPS** (self-signed cert locally — must be trusted in the
  browser).
- **Two OAuth2 clients:**
  - **App client** — *public* (`token_endpoint_auth_method: none`), **PKCE S256**,
    restricted to **`patient/*` read scopes** (OpenEMR rejects `user/*` and
    `system/*` for public clients). Used by the Attune SPA. Reading the launched
    patient's full record needs only `patient/*` scopes.
  - **Seed client** — *confidential* (`client_secret_post`) with write scopes,
    used once to POST the mock profile via FHIR. Public clients cannot write.
- Registered apps need **approval** (Administration → Config → Connectors →
  OAuth2 → App Manual Approval) before first use.

---

## 3. FHIR targets

Same app code, configured by environment:

- **Primary — OpenEMR (self-hosted, Docker).** The real integration and the
  demo. App `client_id` and FHIR `iss` come from env (`VITE_ATTUNE_CLIENT_ID`,
  `VITE_FHIR_ISS`).
- **Dev rig — `https://launch.smarthealthit.org`.** Instant, no signup, for
  iterating on the app before OpenEMR is ready. Any `client_id` works there.
- **Offline fallback — `?mock=1`.** A local mock client (synthetic journal incl.
  a genome `Observation` and an active paroxetine med). The demo survives even if
  OpenEMR misbehaves on the conference network.

---

## 4. Components (isolated, independently testable units)

### `auth/`
Wraps `fhirclient` with PKCE and env config:
- **`/launch`** — `FHIR.oauth2.authorize({ clientId: env, scope, redirectUri, iss: env })`. `fhirclient` uses PKCE (S256) automatically for public clients. EHR launch picks up `launch`+`iss` from the URL; standalone uses the configured `iss`.
- **`/app`** — `FHIR.oauth2.ready()` → ready client.
- Scopes: `launch openid fhirUser patient/Patient.read patient/MedicationRequest.read patient/Condition.read patient/Observation.read patient/DocumentReference.read patient/AllergyIntolerance.read`.

### `fhir/`
Typed read functions over the ready client, mapping raw FHIR to plain models:
- `getPatient`, `getActiveMedications`, `getConditions`, `getObservations`,
  `getDocuments`, `getAllergies`.
- `extractGenomePhenotypes(observations)` → `GenomePhenotype[]` — picks
  Observations whose code/display names CYP2C19 / CYP2D6 and maps the value text
  (e.g. "Poor metabolizer") to `UM | NM | IM | PM`.

### `recommendation/` (mocked engine)
Pure function `recommend({ patient, medications, conditions, phenotype }) → Recommendation`:
- Small hard-coded gene→drug table for the worked cases (escitalopram + CYP2C19
  PM/UM/IM/NM).
- **Phenoconversion check (real, trivial):** if the active med list contains a
  strong CYP2D6 inhibitor (paroxetine / fluoxetine / bupropion), emit the
  "functional CYP2D6 poor metabolizer" line even when phenotype = NM.
- Serotonergic combination flag.
- Each line carries a source tag (CPIC 2023 / DPWG 2023 / FASS). Interface is
  identical to what a real engine would expose, so the mock is not throwaway.

### `ui/`
- `PatientHeader`, `MedicationList`, `GenomeCard` (extracted phenotype + source),
  `ObservationList`, `DocumentList`, `AllergyList`, `PhenotypeSelector` (override,
  labeled "entered / override"), `RecommendationPanel`, `SourceTag`.
- Clinical, compact styling.

### `mock/`
Local synthetic journal + a fake client for `?mock=1`, including a CYP2C19
genome `Observation` and an active paroxetine medication so the hero case fires
offline.

### OpenEMR environment (`docker-compose.yml`, `openemr/`, `scripts/seed/`)
- `docker-compose.yml` — OpenEMR + MariaDB (DB healthcheck + `depends_on:
  service_healthy`).
- Runbook to enable Connectors / Site Address, register the public app client and
  the confidential seed client, and approve the app.
- `scripts/seed/seed.sh` — registers the seed client, gets a token, and POSTs the
  mock profile (Patient, Condition, active MedicationRequest = paroxetine,
  genome Observation). UI fallback documented per resource.

---

## 5. Data flow

OpenEMR EHR launch → `auth` (`/launch` → `/app`, PKCE) → `fhir` reads the full
journal → `extractGenomePhenotypes` resolves the CYP2C19 phenotype → `recommend()`
correlates → `RecommendationPanel`. The `PhenotypeSelector` dropdown overrides the
extracted phenotype and re-runs `recommend()` live (no refetch).

---

## 6. Error handling

- **Launch / auth failure** → fall back to standalone launch with a patient
  picker, or `?mock=1`. Clear error state, not a blank screen.
- **Self-signed cert** → runbook tells the user to trust the OpenEMR cert in the
  browser before launching.
- **CORS blocked** → small Node proxy forwarding FHIR reads (back-pocket only).
- **A FHIR resource type unsupported / empty** → that journal section degrades
  gracefully; the panel still renders.
- **All FHIR unavailable** → `?mock=1` offline journal. State clearly it is
  synthetic.

---

## 7. Testing

**Vitest** unit tests on the pure layers:
- `recommendation/` — escitalopram + CYP2C19 PM (dose reduction), UM
  (underexposure), paroxetine phenoconversion (functional CYP2D6 PM at NM),
  serotonergic combo.
- `fhir/` — mappers and `extractGenomePhenotypes` (CYP2C19 "Poor metabolizer" →
  PM; ignores non-genome Observations).

OpenEMR/auth plumbing verified manually (launcher + OpenEMR). Light,
hackathon-appropriate.

---

## 8. Scope cuts (YAGNI for the 24h)

- No real CPIC/DPWG dataset — scripted gene→drug lines only.
- No backend unless CORS forces the proxy fallback.
- No COS integration (off critical path).
- Genome representation limited to a CYP2C19 (and optionally CYP2D6) phenotype
  Observation — not full genomic sequence resources.

---

## 9. Demo script

1. Open OpenEMR with a patient loaded.
2. Click "Attune" → panel launches embedded inside OpenEMR, already knowing the
   patient (no second login). "Standard SMART on FHIR launch — same way it drops
   into Cosmic."
3. Show it reading the **whole journal** live — meds, conditions, and the
   **genome record pulled from OpenEMR**.
4. Set the phenotype override to **Poor Metabolizer** → sourced dose-reduction
   line appears.
5. **Money moment:** with the genome showing CYP2D6 **Normal**, the patient is on
   paroxetine → Attune flags **functional CYP2D6 poor metabolizer via
   phenoconversion**. "A static gene test would call this patient normal. Attune
   doesn't, because it reads the medication list inside the journal."

---

## 10. Known dependencies / risks

- **OpenEMR setup is the biggest time sink and risk.** Mitigated by the `?mock=1`
  offline path, which needs no OpenEMR.
- **Genome Observation seeding** depends on OpenEMR's FHIR write support for
  `Observation`; if a version rejects it, seed via the UI or as a
  `DocumentReference` — the extractor only needs a recognizable code + value text.
- **Hero case data:** the seeded patient must have an active strong CYP2D6
  inhibitor (paroxetine) for the phenoconversion line.

---

## 11. Tech stack

- React + Vite + TypeScript; `fhirclient` (PKCE); `react-router-dom`; Vitest +
  `@testing-library/react`.
- OpenEMR + MariaDB via Docker.
- Local Vite dev server; deploy to Vercel/Netlify only if a public redirect URL
  is needed. OpenEMR + app on localhost works for a same-machine demo.
