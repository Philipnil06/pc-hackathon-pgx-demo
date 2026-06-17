# Datum PGx

**The right antidepressant, without the months of trial and error.**

Datum reads a patient's pharmacogenomic genotype, computes their metabolizer phenotype, and ranks every supported antidepressant against published CPIC guidance. It is an advisory decision-support tool for clinicians. It does not diagnose or prescribe.

---

## Problem

Finding an antidepressant that works is mostly trial and error. A large share of patients cycle through two or three drugs over several months before landing on one that helps at a tolerable dose. Each failed trial is weeks of waiting for an effect, side effects that drive people to quit, and a depression that stays untreated the whole time.

A real and measurable part of that failure is genetic. Genes like CYP2C19 and CYP2D6 control how fast the body breaks a drug down. A "poor metabolizer" can build up toxic levels at a standard dose. An "ultrarapid metabolizer" can clear the drug before it ever works. Today most prescribers cannot see this, so they dose by averages and adjust by trial.

The information often already exists. Pharmacogenomic panels are increasingly ordered, but the result lands as a raw genotype the prescriber has to interpret by hand against dense guideline tables, drug by drug, at the moment of the visit. That step is where the evidence gets lost.

## Solution

Datum sits exactly at that interpretation step. Give it a raw genotype and a clinical context, and it does three things:

1. **Computes the phenotype** from the patient's star-allele diplotype (for example, CYP2C19 \*2/\*2 becomes a poor metabolizer) using published CPIC allele-to-phenotype tables.
2. **Fans the result across every supported antidepressant at once** instead of one lookup at a time.
3. **Returns a ranked verdict** for each drug, each tied back to the CPIC recommendation that produced it.

The prescriber sees, on one screen, which drugs are standard, which need a dose change, and which to avoid for this specific patient, with the source behind every call.

## How it works

```
Raw genotype  ->  Computed phenotype  ->  Ranked CPIC guidance across all drugs
CYP2C19 *2/*2     Poor Metabolizer        amitriptyline: caution / dose change
                                          citalopram, escitalopram, sertraline,
                                          paroxetine, venlafaxine, vortioxetine ...
```

- **Input:** a star-allele diplotype per gene plus a synthetic patient context. Supported genes today: CYP2C19, CYP2D6, CYP2B6.
- **Phenotype engine:** maps diplotypes to metabolizer status using CPIC's published allele functionality and phenotype tables, the same logic a pharmacogenomics pharmacist applies by hand.
- **Guidance engine:** queries the live CPIC API (api.cpicpgx.org) for the recommendation that matches that drug and phenotype.
- **Output:** a ranked verdict across all seven supported antidepressants, each item carrying the CPIC source it came from.

Supported antidepressants today: amitriptyline, citalopram, escitalopram, paroxetine, sertraline, venlafaxine, vortioxetine. All demo patients are synthetic. No real patient data is used.

## Why it's credible

Datum is built to be trusted by clinicians, which means it is built to refuse rather than guess.

- **Source-grounded.** Every recommendation comes from the live CPIC API. CPIC is the established, peer-reviewed standard for translating pharmacogenetic results into prescribing guidance. Datum does not invent recommendations.
- **Phenotype is computed, not assumed.** The genotype-to-phenotype step uses published CPIC allele tables, so the reasoning is transparent and checkable, not a black box.
- **It never hallucinates.** The app has explicit anti-hallucination guardrails. It safe-fails on a drug it does not support, on a gene that is not relevant to the drug, and on a genotype it cannot resolve to a phenotype. When it cannot stand behind an answer, it says so instead of making one up.
- **Honest about its boundaries.** Pharmacogenomics is one input. It does not account for drug interactions, organ function, prior response, or patient preference. Datum surfaces the genetic evidence and leaves the decision with the prescriber.

## Regulatory path

We are deliberate about what Datum is and is not.

**Today: advisory only, clinician in the loop.** Datum presents published guidance to a qualified prescriber who makes the decision. It does not diagnose, does not prescribe, and does not act without a clinician. In this form it functions as a guideline-reference and workflow tool, with the human responsible for the clinical call.

**For real clinical deployment, the bar is higher, and we know it.** Software that interprets a patient's genetic result to drive a treatment decision is most likely a regulated medical device. In the United States that points to an FDA Class II clearance pathway (a 510(k)-style submission demonstrating substantial equivalence and analytical and clinical validity). In the European Union it falls under the In Vitro Diagnostic Regulation / Medical Device Regulation with the corresponding conformity assessment. That process requires validated allele calling, documented clinical evidence, quality management, and post-market surveillance.

**What we built is the workflow, not an unregulated prescribing tool.** The hard, defensible part of Datum is the genotype-to-phenotype-to-guidance engine and its guardrails. That engine is what a regulated product is built around. We are choosing to be the credible, source-grounded version of this rather than the fast, unaccountable one.

## Adoption wedge

We do not need every clinic on day one. We need the people who already do this work by hand.

- **Pharmacist-led pharmacogenomics services.** A growing number of pharmacies and health systems run PGx consult services. These pharmacists already interpret genotypes against CPIC, manually, drug by drug. Datum removes the slowest part of their workflow and speaks their exact vocabulary. They are the lowest-friction, highest-trust first adopter.
- **Psychiatry clinics.** Antidepressant trial and error is felt most acutely in psychiatry, and CYP2C19 and CYP2D6 genotyping is already common there. The pain is sharp, the relevant genes are few, and the prescriber is motivated to shorten the path to a working drug.

Both groups are clinician-led, evidence-driven, and already paying the cost Datum removes. That makes them the wedge.

## Market expansion

Antidepressants are the demonstration wedge, not the ceiling.

The engine underneath, genotype to computed phenotype to CPIC guidance with guardrails, is drug-class agnostic. CPIC publishes guidance well beyond psychiatry. The same pipeline extends to:

- **Pain management** (for example, codeine and tramadol via CYP2D6), where metabolizer status changes both efficacy and overdose risk.
- **Cardiology** (for example, clopidogrel via CYP2C19, warfarin, statins), where genotype-guided dosing already has strong guideline support.
- **Oncology** (for example, thiopurines via TPMT, fluoropyrimidines via DPYD), where avoiding a toxic dose is life-or-death.

Each new class is a new set of genes and CPIC tables plugged into an engine that already exists. We prove the model on antidepressants, then expand drug class by drug class.

## 90-second demo script

**0:00 - 0:15 — The pain.** "Imagine you're starting treatment for depression. The usual path is trial and error: try a drug, wait weeks, maybe it works, maybe the side effects are unbearable, try the next one. For a lot of people that's months. Part of why is genetic. Your genes decide how fast you break a drug down, and most prescribers can't see that."

**0:15 - 0:30 — The setup.** "This is Datum. We start with a synthetic patient and their raw genetic result, a genotype like CYP2C19 \*2/\*2. That's the kind of result a pharmacogenomic panel actually returns. Today a pharmacist would interpret this by hand, drug by drug."

**0:30 - 0:50 — The core move.** "I paste the genotype and hit compute. First, Datum computes the phenotype from published CPIC allele tables. \*2/\*2 makes this patient a poor metabolizer. Then, instead of one lookup, it fans that across every supported antidepressant at once and ranks them." (Show the ranked list: standard, dose-change, avoid.)

**0:50 - 1:10 — Why you can trust it.** "Every line is pulled live from the CPIC API, the peer-reviewed standard, with the source attached. And watch this." (Enter a fake drug or an irrelevant gene.) "It refuses. It safe-fails instead of guessing. That's the whole point. A clinical tool has to know what it doesn't know."

**1:10 - 1:25 — The boundary and the wedge.** "Datum is advisory. A clinician makes the call. Our first users are the people already doing this by hand, pharmacist-led PGx services and psychiatry clinics. We remove their slowest step."

**1:25 - 1:30 — The expansion.** "Antidepressants are the demo. The same engine extends to pain, cardiology, and oncology. We collapse months of trial and error into evidence you can read in seconds."
