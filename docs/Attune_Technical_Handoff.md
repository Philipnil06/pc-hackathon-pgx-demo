# Attune — Technical Handoff for the Builder

**Context:** Hackathon build (Pinecone Ventures, Visby). 24h window, Demo Day in front of investors + Cambio (the Cosmic EHR vendor) in the room. This document tells you exactly what to build and why.

**Read this first, in one sentence:** We are NOT building a website, NOT a screen-scraping overlay, and NOT a read-only recommendation panel. We are building **the AI that makes the antidepressant follow-up call** — a headless service that phones the patient at the guideline milestones, runs a structured clinical interview, and **writes the result back into the EHR** as a note the doctor signs. The journal is read over **FHIR**; the note is written into a real, self-hosted **OpenEMR**.

---

## 1. The product in one paragraph

Attune is a **clinical decision-support service for antidepressant treatment**. Its core is the **follow-up loop** primary care skips: start, structured check-ins, symptom rating scales, dose titration until the patient actually improves. Attune runs that loop by **calling the patient** with an AI voice agent at ~2 and ~4 weeks, conducting a structured interview (adherence, start-up side effects, the MADRS-S/PHQ-9 items, a suicidality red-flag screen), then **writing a structured note + a sourced next-step draft + the next appointment into the journal**. At the start/escalation moment it also weighs the live medication list, interactions, and (where available) pharmacogenetics into the recommendation.

**Critical framing for the logic:** Attune does **not** decide the medicine, and it does **not** predict which drug will be most *effective*. The AI **captures and documents** the call; a **rule-based engine decides** the next step (escalate / continue / maintain / switch); the **clinician reviews and signs**. Genetics is a sourced **safety filter** for the subset with actionable variants — it flags exposure/tolerability risk and dangerous combinations and puts pharmacogenetics *in context*. Build the logic to reflect that — rule-based and explainable, not a black box. (This is also what keeps us on the safer side of medical-device regulation; see §9.)

---

## 2. Why an AI call + journal write-back, not a panel

There are two "surfaces" to an EHR:

1. **Data surface** — how you read patient data. Modern EHRs (including OpenEMR and Cosmic) expose this as a **FHIR API**: clean, structured JSON. You query it; you do not OCR the screen.
2. **Write surface** — where your output lands. Attune writes the **Encounter + SOAP note + Appointment** back into the record over the EHR's write API, so the doctor finds a ready note in the chart they already use.

**Why this beats the read-only panel idea:**
- A panel still depends on the clinician *initiating* the work. The validated gap is that the follow-up **doesn't happen** — time and stress. **An AI that makes the call removes the labor that causes the loop to fail.**
- The note write-back relieves documentation burden as a side effect: the doctor reviews and signs instead of typing.
- Structured FHIR data (the real medication list) drives a real safety check (phenoconversion), far more reliable than scraping pixels.
- It is the *actual* integration path into the open Cosmic ecosystem, so the demo doubles as go-to-market proof — strong with Cambio in the room.

---

## 3. Architecture

```
              (timer: ~day 14 / ~day 28)
┌─────────────────────────────────────────────┐
│  ATTUNE backend service (Node + TypeScript)  │
│  scheduler → outreach (AI CALLS the patient) │ ──▶ patient (AI phone call)
│  structured interview ◄── inbound webhook    │ ◀── rating + side effects + flags
│  ratingscale (pure) → loop engine (pure) +   │
│  selection (phenoconversion from FHIR read)  │
│  writeback → Encounter + SOAP note + Appt    │
└───────────────┬─────────────────────────────┘
                │ OAuth2 bearer
                ▼
┌─────────────────────────────────────────────┐
│  OpenEMR (self-hosted, Docker)               │
│  READ  (FHIR R4): Patient / MedicationRequest│
│        / Condition / Observation (genome)    │
│  WRITE (Standard REST): Encounter / soap_note│
│        / Appointment                          │
└───────────────┬─────────────────────────────┘
                ▼  clinician opens OpenEMR, reviews & signs
```

Layers to build:
- **Scheduler + outreach** (the AI call, behind a provider interface with a test double)
- **Loop engine + selection** (the rule-based, sourced decision — this is the product; spend your time here)
- **OpenEMR client** (FHIR read + Standard-REST write) and **writeback**

There is **no frontend**. The only user-facing surface is the **patient call**; the clinician works in OpenEMR.

---

## 4. The EHR (self-hosted, credential-free)

You do **not** need a SaaS EHR or external keys. Stand up **OpenEMR 7.0.3 + MariaDB via Docker** and drive it headlessly.

- `docker compose up -d`, then `scripts/setup-openemr.sh` enables the APIs, registers + enables a confidential OAuth2 client, seeds the hero patient, and writes `.env`. **No UI clicks.**
- **Reality check, verified on 7.0.3:** FHIR clinical **write is read-only** (`POST` of Observation / DocumentReference / Appointment → 404). So Attune **reads over FHIR** and **writes over the Standard REST API** (`api:oemr`): an Encounter, a `soap_note`, and an Appointment. FHIR uses the patient UUID; the Standard API uses the numeric pid — `resolvePid` bridges them.
- This is the credibility play *and* the demo: a real EHR you fully control locally, nothing to gate or revoke. "We host the whole EHR and write a real note into it" beats any mockup.

---

## 5. Tech stack

- **Backend:** Node + TypeScript + Fastify (fast to scaffold, fully testable). `fetch`/`undici` for HTTP. Vitest.
- **AI call:** behind a `provider` interface (`placeCall(patient, job) → InterviewResult`). For the 24h, `OUTREACH_MOCK=1` returns a scripted interview result; live voice/transcription is the swap-in later. Do not block the demo on live telephony.
- **Loop engine:** plain TypeScript + a sourced ruleset. No ML. Deterministic and traceable on purpose.
- **OpenEMR + MariaDB:** Docker, localhost, self-signed cert trusted locally.

---

## 6. The patient call (the structured interview)

The AI administers, in order — these are "the right questions":

1. **Adherence** — still taking it? missed doses, and when?
2. **Start-up side effects** — nausea, insomnia, activation/anxiety, GI, sexual; severity + trajectory. (These transient effects are what patients quietly quit over; ask so the note captures them.)
3. **Efficacy** — the MADRS-S / PHQ-9 items, asked conversationally, scored to a total.
4. **Red flags** — suicidality (MADRS-S item 9 / PHQ-9 item 9). A positive screen **hard-escalates immediately** (urgent alert + appointment), not a draft that waits a week.

The AI **transcribes and structures** the answers into an `InterviewResult` (rating + side-effect notes + `redFlag`). It does **not** decide the medical action.

---

## 7. FHIR resources to read (the safety inputs)

Read these for the patient (all FHIR R4) at the start/escalation moment:

| Resource | What you use it for |
|---|---|
| `Patient` | age, sex, **`telecom` phone** (the number to call) |
| `MedicationRequest` (status=active) | **the live medication list** — the core input for interaction + phenoconversion checks |
| `Condition` | diagnosis / symptom context |
| `Observation` | labs; also where a PGx genotype result could live |

**Pharmacogenetic phenotype (CYP2C19 / CYP2D6):** in the real world this is a lab result; OpenEMR 7.0.3 can't seed a genome Observation (no write path), so selection defaults the phenotype to NM and the **phenoconversion line still fires from the read med list** (paroxetine). Be explicit in the demo that the genotype is defaulted/simulated — do not imply the EHR supplied it.

---

## 8. The rule engine (this is the product — spend your time here)

Keep it **deterministic, ordered, and traceable**. Two engines:

**A. The loop** — `nextAction({plan, ratings, today})`, a pure function. Constants: onset 14d, review 28d, escalation budget 2; ladders escitalopram 10→15→20, sertraline 50→100→150→200. Ordered decision:
```
remission (MADRS-S ≤10 / PHQ-9 <5)   → maintain
< 4 weeks on dose, some response      → continue
response (≥50% ↓ from baseline)       → continue
flat/partial & not at max dose        → escalate  (NAME the next rung: 10→15 mg)
at max & escalation budget spent      → switch
(any call: suicidality red flag       → immediate escalation)
```

**B. Selection / safety filter** — at start/escalation, over the live med list + genome:
- CYP2C19 phenotype → CPIC/DPWG dosing line for the candidate.
- **Phenoconversion (the differentiator):** a strong CYP2D6 inhibitor in the med list (paroxetine / fluoxetine / bupropion) downgrades the *effective* phenotype even at genotype "Normal." *"Effective CYP2D6 poor metabolizer due to an interacting drug — genotype alone would miss this."* This is the line that wins the room: it shows why a static gene test (GeneSight) isn't enough.
- Serotonergic combination caution (e.g. existing tramadol/triptan/SNRI).

Every output line carries a **source tag** (kunskapsstöd för vårdgivare / CPIC 2023 / DPWG 2023 / FASS). Traceability is the credibility. The escalate/switch line is written as a **DRAFT** the clinician signs.

---

## 9. Regulatory note (build-time implications, brief)

Automated patient outreach + a dose-steering recommendation is realistically **EU MDR Class IIa**. That is a post-hackathon concern, but build choices keep options open:

- The AI **captures and documents**; a **rule-based, fully traceable engine decides**; the **clinician signs**. Keep those three roles separate in the code and the pitch.
- Every recommendation **cites a guideline**. Easier to validate than a model.
- A **suicidality red flag hard-escalates** rather than sitting in a draft — patient-safety surface of an autonomous call, handled explicitly.
- Patient data leaving the EHR (the call) needs **consent + minimization** — deferred GDPR work, behind the provider interface.

Don't architect it as an opaque auto-prescriber, and don't let the AI be the medical decision-maker.

---

## 10. Demo script (what to show on stage)

1. "GP starts an SSRI, then the follow-up gets dropped. Attune runs that loop."
2. Trigger the scheduler → Attune **calls the patient** (mocked AI voice). The patient reports worsening insomnia + flat mood; the interview yields **MADRS-S 28** (flat at 4 weeks).
3. The loop → **escalate**, naming the rung: **escitalopram 10 → 15 mg**, with the source tag. Selection flags **functional CYP2D6 poor metabolizer via phenoconversion** from the **real** read med list (paroxetine). *"A static gene test would call this patient normal. Attune doesn't, because it reads the medication list."*
4. **The money shot:** open **OpenEMR** and show the **Encounter + SOAP note (the interview + rating + the escalation DRAFT) + the review Appointment** that Attune just wrote. *"This is a real EHR we host ourselves — no mockup. No one staffed this call. Attune made it, ran the guideline interview, and put the result and the next step straight into the journal. The doctor just reviews and signs."*

---

## 11. Build order / time budget (24h)

| Block | Task | Done = |
|---|---|---|
| 0–2h | Scaffold the TS service + Vitest | Smoke test passes |
| 2–6h | Loop engine + ratingscale (pure, TDD) incl. **flat-at-4-weeks → escalate naming the rung** | Hero decision works in tests |
| 6–9h | Selection + **phenoconversion** (paroxetine → functional CYP2D6 PM) | The differentiator works in tests |
| 9–13h | OpenEMR client (FHIR read + Standard-REST write) + writeback | Round-trip writes a note in tests |
| 13–17h | Outreach provider + structured interview + mock + capture + suicidality red flag | Tick → call → score → writeback |
| 17–21h | OpenEMR Docker stack + `setup-openemr.sh` + live round-trip | Real Encounter/SOAP/Appt ids printed |
| 21–24h | Polish, rehearse the §10 script, fallbacks | Smooth 2-min run |

---

## 12. Fallback ladder (if something breaks)

- **Live AI telephony won't cooperate** → `OUTREACH_MOCK=1` returns a scripted interview result; *describe* the live call. The loop + writeback are unchanged and real.
- **A Standard-REST write 401s** → check the scope and that you passed the numeric pid (not the UUID) where required; the encounter uses the UUID, soap_note + appointment use the pid.
- **Everything OpenEMR breaks** → run the loop against the in-memory plan store and a fake openemr client and show the decision + the note body it *would* write. State clearly it's local; the rule engine (the product) is unchanged. Better an honest local demo than a fake live one.

---

## 13. Hard rules — do not violate

- **Do not OCR or scrape the EHR screen.** Read FHIR; write the Standard REST API.
- **Do not build a standalone marketing website or a read-only panel.** Build the headless loop that calls the patient and writes the note.
- **Do not claim the AI picks the drug, or that Attune predicts efficacy.** The AI captures and documents; the rule engine decides; the doctor signs. It flags exposure/tolerability risk and interactions, and contextualizes genetics. Say that precisely.
- **Do not present simulated data (the genome default, the mocked call) as live** without saying so.
- **Do not hard-code a "magic AI picks the drug" black box.** Rule-based + sourced. That's the whole positioning.

---

## 14. Links

- OpenEMR (self-hosted EHR): https://github.com/openemr/openemr
- OpenEMR API/FHIR docs: https://github.com/openemr/openemr/blob/master/API_README.md
- SMART App Launch spec: https://hl7.org/fhir/smart-app-launch/
- Cambio Open Services (COS): https://developer.openservices.cambio.se
- Region Stockholm kunskapsstöd (the follow-up loop guideline): https://kunskapsstodforvardgivare.se
- CPIC guidelines (drug-gene dosing): https://cpicpgx.org
- DPWG / PharmGKB: https://www.pharmgkb.org

---

*Owner's note: the loop engine and the phenoconversion case (§8) are the product. The AI call is how the loop actually runs without a clinician staffing it; the journal write-back is how the result lands where the doctor works. If you're short on time, cut polish and live telephony — not the loop logic, the phenoconversion, or the real write-back.*
