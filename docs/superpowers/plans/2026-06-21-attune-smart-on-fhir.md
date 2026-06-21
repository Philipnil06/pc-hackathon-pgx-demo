# Attune Follow-up-Call Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a **headless Node/TypeScript backend** that runs the antidepressant
follow-up loop on self-hosted OpenEMR. At the guideline milestones it **calls the
patient** (AI voice agent, mocked for the demo), runs a **structured interview**
(adherence, side effects, MADRS-S/PHQ-9, suicidality screen), runs a **rule-based,
sourced loop** that decides the next step (escalate / continue / maintain /
switch), and **writes an Encounter + SOAP note + Appointment back into OpenEMR** as
a draft the clinician signs. Genetics/interactions are a sourced safety layer read
live over FHIR (phenoconversion: paroxetine → functional CYP2D6 PM).

**Architecture:** Headless service. No frontend; the only user-facing surface is the
patient call. The loop engine is a pure function of `(plan, ratings, today)`.
OpenEMR is read over **FHIR R4** and written over the **Standard REST API** (FHIR
clinical write is read-only in 7.0.3). OpenEMR is stood up entirely via Docker and
seeded credential-free.

**Tech Stack:** Node + TypeScript, Fastify, `fetch`/`undici`, Vitest, OpenEMR +
MariaDB (Docker). AI-call provider behind an interface with a test double.

**Spec:** `docs/superpowers/specs/2026-06-21-attune-design.md`

**Division of labor (the product):** the AI **captures and documents** the call; a
**rule-based engine decides**; the **clinician signs**. Never an "AI picks the
drug" black box.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example` | Scaffold + scripts + env vars |
| `src/domain/types.ts` | Shared models: plan, dose, rating, loop, interview, journal-read |
| `src/ratingscale/score.ts` (+ `.test.ts`) | MADRS-S / PHQ-9 scoring (pure) |
| `src/loop/engine.ts` (+ `.test.ts`) | `nextAction({plan,ratings,today})` — CORE, pure |
| `src/selection/engine.ts` (+ `.test.ts`) | First-choice + phenoconversion (pure) |
| `src/fhir/mappers.ts` (+ `.test.ts`) | FHIR → model mappers + genome/rating extraction |
| `src/openemr/client.ts` (+ `.test.ts`) | OAuth2 + FHIR read + Standard REST write |
| `src/scheduler/due.ts` (+ `.test.ts`) | `dueOutreach(plans, today)` |
| `src/outreach/provider.ts`, `mock.ts`, `interview.ts`, `capture.ts` (+ `.test.ts`) | AI-call provider interface, test double, structured interview runner, webhook → entry |
| `src/writeback/map.ts` (+ `.test.ts`) | `planActionToWrites` (pure) + `executeWrites` |
| `src/plans/store.ts` | TreatmentPlan + rating store (in-memory/JSON) |
| `src/api/server.ts` (+ `.test.ts`) | Fastify: `POST /api/tick`, `POST /api/outreach/webhook`, `GET /health` |
| `src/main.ts` | Runnable entrypoint (self-running scheduler tick + server) |
| `docker-compose.yml`, `scripts/setup-openemr.sh`, `scripts/openemr-roundtrip.ts` | OpenEMR stack, one-shot setup, live round-trip |
| `OPENEMR.md`, `README.md` | Setup runbook + project readme |

---

## Task 1: Scaffold the headless TS service with Vitest

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/smoke.test.ts`

- [ ] **Step 1: Init + deps** — `npm init -y`; install `fastify`, `undici`, `tsx`; dev `typescript`, `vitest`.
- [ ] **Step 2: Scripts** — `dev: tsx watch src/main.ts`, `test: vitest run`, `typecheck: tsc --noEmit`, `openemr:roundtrip: tsx scripts/openemr-roundtrip.ts`.
- [ ] **Step 3: `.env.example`** — mirror spec §13 (`PORT`, `OUTREACH_MOCK=1`, `OPENEMR_FHIR_BASE`, `OPENEMR_OAUTH_BASE`, `OPENEMR_CLIENT_ID/SECRET`, `OPENEMR_USER/PASS`, `NODE_TLS_REJECT_UNAUTHORIZED=0`).
- [ ] **Step 4: Smoke test** — trivial passing test.
- [ ] **Step 5: Run** — `npm test` → PASS. **Commit.**

---

## Task 2: Domain types

**Files:** `src/domain/types.ts`

- [ ] Define: `Phenotype`, `Gene`; journal-read models `Patient` (incl. `mobile`), `Medication`, `Condition`, `GenomePhenotype`; loop models `Instrument` (`MADRS-S`|`PHQ-9`), `RatingScaleEntry`, `ResponseStatus`, `DoseStep`, `LoopAction`, `TreatmentPlan`, `LoopRecommendation`; interview models `InterviewResult` (rating + side-effect notes + `redFlag: boolean`), `OutreachJob` (`patientId`, `milestone`, `instrument`); `JournalRead`.
- [ ] **Verify** `tsc --noEmit`. **Commit.**

---

## Task 3: Rating-scale scoring (TDD)

**Files:** `src/ratingscale/score.ts` (+ `.test.ts`)

- [ ] Tests: remission (MADRS-S ≤10 / PHQ-9 <5); response (≥50% drop from baseline); partial (≥25%); no-response (<25%).
- [ ] Implement `scoreStatus(instrument, baseline, latest)` and `remissionThreshold`. **Commit.**

---

## Task 4: Loop engine (TDD) — CORE

**Files:** `src/loop/engine.ts` (+ `.test.ts`)

Pure `nextAction({plan, ratings, today})`. Constants: `ONSET=14`, `REVIEW=28`,
`ESCALATION_BUDGET=2`; ladders `escitalopram 10→15→20`, `sertraline 50→100→150→200`.

- [ ] Tests (hero cases): `d<14` → `await-onset-checkin`; no on-dose rating yet → `capture-rating`; remission → `maintain`; `d<28` with some response → `continue`; **flat at 4 weeks, not at max → `escalate` and the recommendation names the next rung (10→15 mg)**; at max + budget spent → `switch`.
- [ ] Implement the ordered decision tree (spec §4). Every recommendation carries `source`.
- [ ] **Enhancement over the prior build:** `escalate` text MUST name the next dose from the ladder (e.g. "escalate 10 mg → 15 mg"), not just "escalate the dose." **Commit.**

---

## Task 5: Selection + phenoconversion (TDD)

**Files:** `src/selection/engine.ts` (+ `.test.ts`)

- [ ] Tests: CYP2C19 PM → dose-reduction line; UM → underexposure line; **paroxetine present at NM → "effective CYP2D6 poor metabolizer" (phenoconversion fires)**; tramadol present → serotonergic caution; default candidate escitalopram.
- [ ] Implement `firstChoice({patient,medications,conditions,phenotype})`; every line carries a source tag (CPIC/DPWG/FASS). **Commit.**

---

## Task 6: FHIR read mappers + genome/rating extraction (TDD)

**Files:** `src/fhir/mappers.ts` (+ `.test.ts`)

- [ ] Tests + impl: `mapPatient` (incl. `telecom` → `mobile`), `mapMedication` (normalize to lowercase generic), `mapCondition`, `mapObservation`; `extractGenomePhenotypes` (code names CYP2C19/CYP2D6, value text → phenotype). **Commit.**

---

## Task 7: OpenEMR client — read (FHIR) + write (Standard REST) (TDD with injected fetch)

**Files:** `src/openemr/client.ts` (+ `.test.ts`)

- [ ] Tests vs a fake `fetch`: token cache + bearer; correct FHIR read queries (`MedicationRequest?...&status=active`, etc.); `resolvePid(uuid)` (FHIR uuid → numeric pid); correct Standard-REST write bodies for `createEncounter` (keys on UUID), `writeSoapNote` (keys on pid, `{subjective,objective,assessment,plan}`), `bookAppointment` (keys on pid); 401 → re-auth once.
- [ ] Implement. Document the read-FHIR/write-Standard split in a header comment. **Commit.**

---

## Task 8: Scheduler (TDD)

**Files:** `src/scheduler/due.ts` (+ `.test.ts`)

- [ ] Tests + impl: `dueOutreach(plans, today)` — `days≥28` → `review` job; `days≥14` → `onset-checkin` job; else none. **Commit.**

---

## Task 9: Outreach — AI-call provider interface, interview runner, capture (TDD)

**Files:** `src/outreach/provider.ts`, `mock.ts`, `interview.ts`, `capture.ts` (+ `.test.ts`)

- [ ] **`provider.ts`** — the channel interface: `placeCall(patient, job) → InterviewResult`. This is the swap point for live AI telephony later.
- [ ] **`mock.ts`** — test-double provider that returns a scripted `InterviewResult` (e.g. MADRS-S 28, "worsening insomnia", `redFlag:false`). Used when `OUTREACH_MOCK=1`.
- [ ] **`interview.ts`** — the structured-interview definition/runner: ordered sections (adherence, side effects, rating items, **suicidality screen**) → `InterviewResult`. Pure mapping of answers → rating + notes + `redFlag`.
- [ ] **`capture.ts`** — webhook payload → `RatingScaleEntry` (+ structured note content).
- [ ] **Tests:** mock provider returns a complete `InterviewResult`; **a positive suicidality answer sets `redFlag:true`**; capture builds a valid `RatingScaleEntry`. **Commit.**

---

## Task 10: Writeback mapping + executor (TDD)

**Files:** `src/writeback/map.ts` (+ `.test.ts`)

- [ ] **`planActionToWrites(rec, plan, latestRating, interview)`** (pure): builds `{encounter, soapNote, appointment}`. SOAP `objective` = the instrument total + the interview's side-effect summary; `plan` = `rec.text [Source: ...]`, DRAFT-prefixed for escalate/switch; `subjective` = the loop/check-in context.
- [ ] **Red-flag path:** if `interview.redFlag`, the note's `plan` leads with an **immediate-escalation alert** line (not a routine draft) and the appointment is urgent.
- [ ] **`executeWrites(client, patientUuid, writes)`** — `createEncounter` → `writeSoapNote` → `bookAppointment`; returns the three ids.
- [ ] **Tests:** per-action mapping (escalate names the rung; switch; maintain has no DRAFT prefix); red-flag mapping; executor calls the client in order. **Commit.**

---

## Task 11: Plan store + API wiring (integration, TDD)

**Files:** `src/plans/store.ts`, `src/api/server.ts` (+ `.test.ts`), `src/main.ts`

- [ ] **`store.ts`** — in-memory/JSON TreatmentPlan + ratings, seeded hero (escitalopram 10 mg started 4 weeks ago, baseline MADRS-S 30).
- [ ] **`server.ts`** — Fastify: `POST /api/tick` (run scheduler → for each due job, place the call via the provider, score, decide, readJournal for selection, writeback), `POST /api/outreach/webhook` (inbound interview result → same pipeline), `GET /health`.
- [ ] **Test** with a **fake openemr client**: tick → call (mock) → flat MADRS-S 28 → `escalate` + `phenoconversion:true` → encounter/soap/appointment ids returned. **Red-flag webhook → urgent path.**
- [ ] **`main.ts`** — runnable entrypoint: start the server and a self-running scheduler tick interval. **Commit.**

---

## Task 12: OpenEMR stack + credential-free setup + live round-trip

**Files:** `docker-compose.yml`, `scripts/setup-openemr.sh`, `scripts/openemr-roundtrip.ts`, `OPENEMR.md`

> Infrastructure; does not change `src/`. Can run in parallel with Tasks 3–11.

- [ ] **`docker-compose.yml`** — OpenEMR 7.0.3 + MariaDB, DB healthcheck + `depends_on: service_healthy`, publish `9300:443`.
- [ ] **`setup-openemr.sh`** — wait for OpenEMR, then headlessly: enable REST+FHIR APIs and the OAuth2 password grant (DB `globals`); register + enable a confidential client; seed the hero (Patient over FHIR; escitalopram + **paroxetine** over the Standard API so the med list surfaces in FHIR `MedicationRequest` reads); write `.env` with client creds + `PATIENT_UUID`. **No UI clicks.**
- [ ] **`openemr-roundtrip.ts`** — `findPatient` → `readJournal` (assert **paroxetine**) → `resolvePid` → `createEncounter` → `writeSoapNote` (MADRS-S + sourced escalate **draft**) → `bookAppointment`; print the real ids.
- [ ] **`OPENEMR.md`** — runbook: what 7.0.3 supports (read-FHIR / write-Standard), `docker compose up`, `setup-openemr.sh`, the round-trip, and how to confirm the Encounter + SOAP note + Appointment in the OpenEMR UI.
- [ ] **Verify live** — round-trip prints encounter/soap/appointment ids; open OpenEMR and see all three. **Commit.**

---

## Task 13: Project README

**Files:** `README.md`

- [ ] Write the readme: the one-liner (AI makes the follow-up call), what it is, run-locally (`docker compose up` → `setup-openemr.sh` → `npm run dev` / `npm run openemr:roundtrip`), the architecture line, **what we are NOT claiming** (AI captures/documents, engine decides, doctor signs; genes don't beat the clinician), the fallback ladder, and links to the spec/plan/OPENEMR.md. **Commit.**

---

## Self-Review Notes

- **Spec coverage:** §1 product (loop + AI call + writeback) → Tasks 4, 9, 10. §3
  architecture → all. §4 loop + §4a interview → Tasks 4, 9. §5/§5a OpenEMR
  read-FHIR/write-Standard → Tasks 6, 7, 12. §6 components → Tasks 2–12. §8 data
  flow → Task 11. §9 demo → Task 12 + OPENEMR.md. §10 regulatory (capture/decide/
  sign split; red-flag hard-escalate) → Tasks 9, 10. §11 scope cuts (mock call,
  in-memory store) → Tasks 9, 11.
- **Key differences from the superseded panel plan:** there is **no React SPA, no
  SMART browser launch, no recommendation panel UI**. The user surface is the
  **patient call**; the clinician surface is **OpenEMR itself**. Writes go over the
  **Standard REST API** (FHIR clinical write is unsupported in 7.0.3). Genetics is a
  **sourced safety layer**, not the headline.
- **Type consistency:** `TreatmentPlan`, `RatingScaleEntry`, `LoopRecommendation`,
  `InterviewResult`, `OutreachJob`, and the openemr client method names
  (`findPatient`, `readJournal`, `resolvePid`, `createEncounter`, `writeSoapNote`,
  `bookAppointment`) are used identically across Tasks 2, 7, 9, 10, 11.
