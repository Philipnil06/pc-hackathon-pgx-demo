# Attune — the AI that makes the antidepressant follow-up call

**The one line:** the antidepressant gets started and then abandoned at the
starting dose. Attune is the AI that makes the follow-up call — it phones the
patient, runs the structured side-effect and symptom interview the guideline
requires, and writes it into the journal as a note the doctor signs.

Attune is a **headless Node/TypeScript backend** that runs the antidepressant
follow-up loop primary care skips, on self-hosted **OpenEMR**. At the guideline
milestones (~day 14, ~day 28) it **calls the patient** with an AI voice agent,
conducts a structured interview (adherence, start-up side effects, the MADRS-S /
PHQ-9 items, and a suicidality red-flag screen), runs a **rule-based, sourced**
loop that decides the next step (**escalate / continue / maintain / switch**),
and **writes the result back into the patient's OpenEMR chart**: an **Encounter**,
a **SOAP note** carrying the interview + rating + the sourced next-action (a
DRAFT the clinician reviews and signs), and an **Appointment** (the review).

The AI **captures and documents** the call; a **rule-based engine decides** the
step; the **doctor signs** in OpenEMR. There is no clinician UI — the clinician
works in OpenEMR. The only user-facing surface is the **patient call**.

At the start/escalation moment Attune also reads the live medication list and
genome over FHIR, so the **safety layer** is real — a patient on paroxetine is
flagged a *functional* CYP2D6 poor metabolizer. **We do not claim genes pick a
better drug than the doctor.** The value is **fit, follow-up, and time**.

> **OpenEMR 7.0.3 reality:** its FHIR API is *read-only* for clinical data (FHIR
> `POST` of Observation / DocumentReference / Appointment returns 404). So Attune
> **reads over FHIR** (meds + genome → phenoconversion) and **writes over
> OpenEMR's Standard REST API** (encounter + SOAP note + appointment). See
> [`OPENEMR.md`](OPENEMR.md).

## Run locally

```bash
npm install

# Start the self-hosted OpenEMR stack (OpenEMR + MariaDB), then one-shot setup:
# enables the APIs, registers+enables a confidential client, seeds the hero,
# and writes .env. No manual UI clicks. See OPENEMR.md.
docker compose up -d
OPENEMR_PORT=9301 bash scripts/setup-openemr.sh

set -a; . ./.env; set +a   # load the generated credentials/ids

npm run dev               # start the backend service (OUTREACH_MOCK=1 is set in .env)

npm test                  # run the Vitest suite
npm run typecheck         # tsc --noEmit
npm run openemr:roundtrip # live, credential-free round-trip against local OpenEMR
```

`OUTREACH_MOCK=1` simulates the patient call so the demo runs without live
telephony; the AI-call provider sits behind an interface with a test double.

## Architecture

```
scheduler → outreach (AI call) → webhook (structured interview) → ratingscale
  → loop (pure core) + selection (phenoconversion) → writeback → OpenEMR
```

- **scheduler** — detects which patients are due (~day 14 / ~day 28) from the plan store.
- **outreach** — the AI voice agent calls the patient and runs the structured
  interview; the channel sits behind a provider interface with a test double.
- **webhook** — the interview result (rating + side-effect notes + flags) becomes
  a `RatingScaleEntry` (+ structured note content).
- **ratingscale** — scores the response (MADRS-S / PHQ-9). Pure.
- **loop** — the next-action engine. A **pure function of `(plan, ratings, today)`**, fully unit-testable.
- **selection** — first-choice + phenoconversion, fed by the live FHIR read med list + genome.
- **writeback** — maps the loop result to an encounter + SOAP note + appointment and writes them to OpenEMR.
- **OpenEMR** — **read** over FHIR R4 (`Patient`, `MedicationRequest`, `Condition`, `Observation` incl. genome); **write** over the Standard REST API (`Encounter`, `soap_note`, `Appointment`). OAuth2 throughout.

Every recommendation line carries a source tag (kunskapsstöd för vårdgivare /
CPIC 2023 / DPWG 2023 / FASS). The escalate/switch recommendation is a DRAFT the
clinician signs in OpenEMR.

## What we are NOT claiming

- The AI does **not** decide the medicine. It conducts and documents the call.
- Genes do **not** beat the clinician. Pharmacogenetics is a sourced safety
  filter for the subset with actionable variants, applied at start/escalation.
- The rule engine **proposes**; the clinician **decides and signs**.

## Fallback drug ladder

- **escitalopram** 10 → 15 → 20 mg
- **sertraline** 50 → 100 → 150 → 200 mg

## Credential-free

The entire EHR stack is self-hosted via Docker (OpenEMR + MariaDB) with no
external SaaS. There are no credentials to gate or revoke — the demo runs against
a real EHR you fully control locally, including the live FHIR round-trip
(`npm run openemr:roundtrip`).

## Docs

- Design spec — [`docs/superpowers/specs/2026-06-21-attune-design.md`](docs/superpowers/specs/2026-06-21-attune-design.md)
- Implementation plan — [`docs/superpowers/plans/2026-06-21-attune-smart-on-fhir.md`](docs/superpowers/plans/2026-06-21-attune-smart-on-fhir.md)
- Technical handoff — [`docs/Attune_Technical_Handoff.md`](docs/Attune_Technical_Handoff.md)
- OpenEMR setup — [`OPENEMR.md`](OPENEMR.md)
