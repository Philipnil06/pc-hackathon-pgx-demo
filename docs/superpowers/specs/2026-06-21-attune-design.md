# Attune — Design Spec

**Date:** 2026-06-21
**Branch:** `erik-work`
**Context:** Hackathon build (Pinecone Ventures, Visby). 24h window, Demo Day in
front of investors + Cambio (the Cosmic EHR vendor). This spec is the agreed
build for Erik's branch. It supersedes the earlier read-only SMART-on-FHIR panel
design with the team's pivot to **the AI that makes the follow-up call**.

---

## 0. The one line

The antidepressant gets started and then abandoned at the starting dose. Attune
is the AI that makes the follow-up call — it phones the patient, runs the
structured side-effect and symptom interview the guideline requires, and writes
it into the journal as a note the doctor signs.

---

## 1. What we are building

Attune is a **headless backend service** that runs the antidepressant
**follow-up loop** primary care skips, integrated into **OpenEMR**. It:

1. tracks each patient's place in the titration loop,
2. **calls the patient automatically with an AI voice agent** at the loop
   milestones and runs a **structured clinical interview** — adherence, start-up
   side effects, the symptom rating scale (MADRS-S / PHQ-9) conversationally, and
   a **suicidality red-flag screen**,
3. runs a **rule-based, sourced** loop that decides the next step (escalate /
   continue / maintain / switch), and
4. **writes the result into OpenEMR** — a structured note carrying the interview
   and rating, the sourced next-action as a **draft**, and the next follow-up
   into the calendar.

Because OpenEMR exposes the journal over **FHIR read**, Attune also reads the
live medication list and any genome `Observation` at the start/escalation moment,
so the **safety layer / phenoconversion** check is real (a patient on paroxetine
is flagged a *functional* CYP2D6 poor metabolizer — the moment a static gene test
misses).

**The division of labor that defines the product:** the AI **captures and
documents** the call; a **rule-based engine decides** the next step; the
**clinician reviews and signs** in OpenEMR. **No standalone clinician UI.** The
only user-facing surface is the **patient call**.

Positioning: decision **support**, the clinician decides. Rule-based, sourced,
traceable. Value is **fit, follow-up, and time** — **not** a claim that the AI
picks the medicine or that genes beat the clinician.

**Deferred (decide later, do not block the build):** the outreach **channel**
(AI voice vs SMS) and the **GDPR/consent** specifics — both sit behind a provider
interface with a test double.

---

## 2. Why this shape (AI call + journal write-back, not a panel)

- The validated gap (see the handoff and the clinician conversations) is **what
  happens after the prescription**: the SSRI is started and then stops at the
  starting dose, rarely titrated, rarely followed up, rarely rated. The
  **follow-up call nobody has time to make** is the unmet need — not another
  read-only screen the doctor has to open.
- A read-only recommendation panel still depends on the clinician initiating the
  work. **An AI that makes the call removes the labor that causes the loop to
  fail.** It also produces the documentation burden's relief as a side effect: a
  ready note.
- It is built to run **inside the record the doctor already uses** (OpenEMR /
  the open Cosmic ecosystem), which is where the medication history and prior
  side effects live, and where the note must land to be useful.

### Why OpenEMR

- **Open-source and self-hostable**, so it is a **real EHR we fully control with
  zero external credentials** — the entire stack (Docker) runs locally. The demo
  is genuinely "running inside a real EHR," and nothing can gate or revoke it.
- **FHIR R4 read** for the journal (meds, conditions, genome) and a **Standard
  REST API** for writing the encounter + note + appointment (see §5a).
- Standard SMART-on-FHIR / OAuth2 — credible, transferable integration craft and
  the real path into a Cosmic specialty module.

---

## 3. Architecture

```
                 (timer: day 14 / day 28)
┌──────────────────────────────────────────────┐
│  Attune backend service (Node + TypeScript)   │
│  scheduler  → fires outreach at milestones     │
│  outreach/  → AI voice agent CALLS the PATIENT │ ──▶ patient (AI phone call)
│               runs the structured interview     │
│               ◄── inbound webhook (result)      │ ◀── interview + rating + flags
│  ratingscale/ score (pure)                     │
│  loop/      next-action engine (pure) ◄ CORE   │
│  selection/ first-choice + phenoconversion     │
│  plans/     TreatmentPlan store                 │
│  openemr/   FHIR R4 read + Standard REST write  │
│  writeback/ loop result → Encounter + SOAP note │
│             + Appointment                        │
│  api/       Fastify: tick · webhook · health     │
└───────────────┬────────────────────────────────┘
                │ OAuth2 bearer
                ▼
┌──────────────────────────────────────────────┐
│  OpenEMR (self-hosted, Docker)                  │
│  read  (FHIR R4): Patient · MedicationRequest · │
│        Condition · Observation (labs + genome)  │
│  write (Standard REST): Encounter · soap_note · │
│        Appointment                               │
└───────────────┬────────────────────────────────┘
                ▼  clinician opens OpenEMR, reviews & signs
```

- The backend owns the OpenEMR OAuth2 credentials, the loop logic, and the
  treatment-plan store. No frontend; the only user surface is the patient call.
- The loop engine is a **pure function of (plan, ratings, today)** — state is
  data passed in, so it is fully unit-testable.

---

## 4. The loop, end to end

The guideline-correct cycle (Region Stockholm, `kunskapsstodforvardgivare.se`):

```
 START SSRI (escitalopram/sertraline, low dose) — baseline rating captured
        │
 ~2 WEEKS: AI check-in call (onset side effects pass; adherence; retention)
        │
 ~4 WEEKS on a dose: AI interview → rating → REVIEW
        ├─ remission (MADRS-S ≤10 / PHQ-9 <5) ──► maintain
        ├─ response (≥50% ↓ from baseline) ─────► continue
        ├─ partial/no response & dose < max ────► ESCALATE (name the next rung)
        └─ no response & near max after budget ──► SWITCH
   (any call: a suicidality red flag short-circuits to immediate escalation)
```

Runtime:
1. **Scheduler** sees a patient due (~day 14 / ~day 28) from the plan store.
2. **Outreach** reads the patient's phone from OpenEMR and the **AI voice agent
   calls** them, running the structured interview (adherence, side effects, the
   MADRS-S/PHQ-9 items, suicidality screen).
3. **Interview result** → webhook → score + structured note content.
4. **Loop** decides the next action; **selection** runs on the **real read med
   list + genome** (phenoconversion fires on paroxetine) at start/escalation.
5. **Write-back into OpenEMR:** an `Encounter`, a `SOAP note` (the interview +
   rating in *objective*; the sourced next-action **draft** in *plan*), and an
   `Appointment` (the review).
6. **Clinician** opens OpenEMR, sees all three, reviews and signs.

Every recommendation line carries a source tag (kunskapsstöd för vårdgivare /
CPIC 2023 / DPWG 2023 / FASS).

### 4a. The structured interview ("the right questions")

The AI call administers, in order:
1. **Adherence** — still taking it? missed doses? when?
2. **Start-up side effects** — nausea, insomnia, activation/anxiety, GI, sexual;
   severity + trajectory (the transient effects patients quietly quit over).
3. **Efficacy** — the MADRS-S / PHQ-9 items, asked conversationally, scored to a
   total.
4. **Red flags** — suicidality (MADRS-S item 9 / PHQ-9 item 9). A positive screen
   **hard-escalates immediately** (alert, not a draft-for-next-week).

The AI **transcribes and structures**; it does **not** decide the medical action.

---

## 5. OpenEMR integration

- **Auth:** OAuth2 against `/oauth2/default/*` (HTTPS, self-signed cert trusted
  locally). A confidential client with read + Standard-API write scopes.
- **Read** (`/apis/default/fhir/*`): `Patient` (incl. `telecom` phone),
  `MedicationRequest?status=active`, `Condition`, `Observation` (labs + genome).
- **Write** (Standard REST `api:oemr`): `Encounter`, `soap_note`, `Appointment`.
- The genome phenotype is extracted from an `Observation` whose code/text names
  CYP2C19/CYP2D6 and whose value text contains the phenotype word.

### 5a. Implementation note (verified against OpenEMR 7.0.3, 2026-06-21)

OpenEMR 7.0.3 does **not** offer symmetric FHIR read + write. Verified live:

- **FHIR write is read-only for clinical data.** `POST` of FHIR `Observation`,
  `DocumentReference`, and `Appointment` returns **404**; the only advertised
  FHIR `.write` scopes are `Patient`, `Organization`, `Practitioner`.
- **Reads work over FHIR** (`Patient`, `MedicationRequest`, `Condition`,
  `Observation`) — the phenoconversion read is genuinely FHIR-real.
- **Writes use OpenEMR's Standard REST API** (`api:oemr`): an `Encounter`, a
  `SOAP note` (rating + interview in *objective*; sourced recommendation DRAFT in
  *plan*), and an `Appointment`.
- FHIR uses the patient UUID; the Standard API uses the numeric pid →
  `resolvePid(uuid)` bridges them. The encounter route keys on the UUID;
  soap_note and appointment key on the pid.
- The whole stack comes up **credential-free with no UI clicks** via
  `scripts/setup-openemr.sh`. The genome `Observation` cannot be seeded (no write
  path), so selection defaults the phenotype to NM; the phenoconversion line still
  fires from the read med list (paroxetine). See `OPENEMR.md`.

---

## 6. Components (independently testable)

- `domain/` — shared models (TreatmentPlan, DoseStep, RatingScaleEntry,
  Instrument, ResponseStatus, LoopAction, LoopRecommendation; interview models;
  plus journal read models Patient/Medication/Condition/GenomePhenotype).
- `ratingscale/` — `scoreStatus` (MADRS-S/PHQ-9). Pure.
- `loop/` — `nextAction({plan,ratings,today})`. Pure. CORE.
- `selection/` — `firstChoice({patient,medications,conditions,phenotype})` incl.
  the phenoconversion check. Fed by OpenEMR reads.
- `fhir/` — read mappers (patient/med/condition/observation, genome + rating
  extraction). Pure.
- `openemr/` — client: OAuth2 token (cached), `findPatient`, `readJournal`,
  `resolvePid`, `createEncounter`, `writeSoapNote`, `bookAppointment`. Fetch
  injected for tests.
- `scheduler/` — `dueOutreach(plans, today)`.
- `outreach/` — provider interface + test-double provider + the AI-call interview
  runner + webhook → `RatingScaleEntry` (+ structured note content). The only user
  surface (patient-side).
- `writeback/` — `planActionToWrites` (pure) + executor calling the openemr client.
- `plans/` — TreatmentPlan + rating store (in-memory/JSON for the demo).
- `api/` — Fastify routes: `POST /api/tick`, `POST /api/outreach/webhook`,
  `GET /health`.
- OpenEMR env — `docker-compose.yml`, `scripts/setup-openemr.sh`, `OPENEMR.md`.

No clinician UI, no frontend workspace.

---

## 7. State

OpenEMR has no titration-state object. **Attune holds the `TreatmentPlan` +
captured ratings in its own store** (drug, dose history, escalations, milestones,
outreach status), seeded for the demo. `readJournal` additionally hydrates
meds/genome for selection. Demo store = in-memory/JSON; production = a small DB.

---

## 8. Data flow

`scheduler` (timer) → `outreach` AI-calls the patient and runs the interview →
webhook → `ratingscale.scoreStatus` → `loop.nextAction` (+ `selection.firstChoice`
from `openemr.readJournal`) → `writeback` → OpenEMR (`Encounter` + `soap_note` +
`Appointment`) → clinician reviews/signs in OpenEMR.

---

## 9. Demo script (credential-free, fully real EHR)

1. `docker compose up -d`, seed OpenEMR (escitalopram 10 mg 4 weeks ago,
   paroxetine, MADRS-S baseline 30). Start Attune (`OUTREACH_MOCK=1`).
2. Trigger the scheduler — Attune **calls the patient** (mocked AI voice for the
   demo). The patient reports worsening insomnia + flat mood; the interview yields
   **MADRS-S 28** (flat).
3. Loop → **escalate** (name the rung: **10 → 15 mg**); selection flags
   **functional CYP2D6 PM via phenoconversion** from the **real** read med list
   (paroxetine).
4. Attune writes to **real OpenEMR**: an `Encounter`, a `SOAP note` (the interview
   + MADRS-S 28 + the sourced escalation **draft**), an `Appointment` (4-week
   review). Open OpenEMR and show all three.
5. *"No one staffed this call. Attune made it, ran the guideline interview, and
   put the result and the next step straight into the journal. The doctor just
   reviews and signs."*

---

## 10. Regulatory note

Automated outreach + a dose-steering recommendation → **EU MDR Class IIa**.
Mitigations: the AI **captures and documents** (does not decide); every write is a
**draft the clinician reviews and signs in OpenEMR** (no silent/auto-signed
writes); every recommendation is **sourced**; the engine is **rule-based and
traceable**; a **suicidality red flag hard-escalates** rather than waiting in a
draft. Patient health data leaving the EHR (the call) needs consent + minimization
— the deferred GDPR work, behind the provider interface.

---

## 11. Scope cuts (YAGNI)

- Outreach channel (live AI telephony) + GDPR deferred behind the provider
  interface; `OUTREACH_MOCK=1` simulates the call for the demo.
- Engine rule-based/mocked — no real CPIC dataset.
- TreatmentPlan store in-memory/JSON.
- No clinician UI, no frontend.
- Genome limited to a CYP2C19 (+ optional CYP2D6) phenotype Observation.
- OpenEMR only (no Webdoc, no mock-only variant, no COS).

---

## 12. Tech stack

- Backend: Node + TypeScript (Fastify), `fetch`/`undici`, Vitest.
- OpenEMR FHIR R4 read + Standard REST write over OAuth2; OpenEMR + MariaDB via Docker.
- AI-call provider behind an interface (voice/transcription/structuring); test
  double for the demo. Store in-memory/JSON. No frontend.

---

## 13. Config

```
PORT=8080
OUTREACH_MOCK=1                # simulate the patient call (channel deferred)
OPENEMR_FHIR_BASE=https://localhost:9300/apis/default/fhir
OPENEMR_OAUTH_BASE=https://localhost:9300/oauth2/default
OPENEMR_CLIENT_ID=             # confidential client (read+write), from OPENEMR.md
OPENEMR_CLIENT_SECRET=
OPENEMR_USER=admin             # API user for the password grant (demo)
OPENEMR_PASS=
NODE_TLS_REJECT_UNAUTHORIZED=0 # demo only: accept the self-signed OpenEMR cert
```
Secrets are backend-only.
