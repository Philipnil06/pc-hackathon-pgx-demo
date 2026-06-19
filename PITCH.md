# Datum PGx

A clinical decision support that helps a clinician choose and start an antidepressant
more safely, by combining the symptom picture, the medication list, and pharmacogenetics
in one short, traceable recommendation.

---

## The problem

Antidepressant prescribing is largely trial and error. A clinician picks a first drug,
waits four to six weeks to see if it helps, and often has to switch. Roughly half of
patients do not respond adequately to their first antidepressant, so a second or third
attempt is common. Each failed attempt is weeks of continued illness, side effects that
drive people to stop, and lost trust.

At the same time, antidepressants are prescribed at very high volume and that volume keeps
rising. The pressure in primary care is to start something quickly in a short appointment,
usually without the time to weigh symptom subtype, the patient's other medications, and
their metabolism together. Two real risks follow. First, the wrong fit for the symptom
picture, for example a sedating profile given to a fatigued patient. Second, avoidable harm
from interactions, such as serotonergic combinations or a CYP inhibitor that quietly turns
a normal metabolizer into a poor one.

The gap is not a lack of data. It is that symptom information, the medication list, and
genetics live in separate places and are rarely combined at the moment of prescribing.

## Validation, and the pivot it caused

We did not build what we first imagined. Our original idea was genetics first: feed in a
genotype and have the tool pick the right antidepressant. We took that idea to a specialist
GP before writing the final version.

The feedback changed the product. The verdict was clear: a genetics-first tool that claims
to pick the right drug is too narrow and loses clinician trust. Genes describe metabolism
and drug exposure. They do not tell you which drug will work for this patient. A tool that
leads with genetics is answering the wrong question, and a clinician can see that
immediately.

So we pivoted. Datum is now a layered decision support with a clear priority order:
symptoms first, interactions second, genetics as a filter on top. The same specialist
pointed out the detail that makes this credible: a CYP inhibitor in the patient's current
medication list can make a genetically normal metabolizer behave like a poor metabolizer.
In other words, an interaction can matter more than the genotype. That is exactly why
genetics cannot sit at the top of the stack.

This is our proof of problem fit. We had a plausible idea, we put it in front of the person
who would actually use it, and we let their judgement reshape the product before the
buildathon clock ran out.

## The solution: three layers, one recommendation

Datum evaluates each candidate drug through three layers, in this order.

1. **Clinical symptom profile.** The starting point. Depression with insomnia, anxiety,
   fatigue, weight concern, sexual side-effect concern, pain, or high suicide risk all point
   toward or away from specific drugs. This is what decides whether a drug is a reasonable
   fit at all.

2. **Current medications and interactions.** We check the patient's drug list for
   serotonergic combinations, CYP2C19 and CYP2D6 inhibitors or inducers, QT risk, bleeding
   risk, and sedation. This layer can override genetics, because phenoconversion from an
   inhibitor can change real-world exposure more than a genotype does.

3. **Pharmacogenetics as a filter.** On top, not underneath. For CYP2C19, CYP2D6, and CYP2B6
   we translate the patient's diplotype into a phenotype and turn that into a clear flag:
   avoid, start low and go slow, standard, or risk of low exposure. Genetics is a safety and
   precision layer, never the chooser.

The output is deliberately short. One recommendation per drug, ranked, each with a plain
verdict, a one-line reason, and a citation. It is written to drop into the prescription flow
and the journal, not to be a long genetic report no one reads.

## What is actually built (prototype)

This is a working Node and Express app, not a slide.

- A patient worklist and a genotype-ingestion flow that computes the phenotype from a
  diplotype using our `phenotype.js` module.
- `POST /api/evaluate` runs the three-layer workflow for a single drug.
- `POST /api/fan-out` runs all seven supported drugs and returns a ranked list, each with a
  verdict level of alert, caution, ok, or none, plus the recommendation text, the matched
  gene, and the phenotype.
- The frontend shows the verdict and the fan-out comparison so a clinician sees the whole
  shortlist at once.
- Scope is honest and bounded: seven antidepressants in common use (amitriptyline,
  citalopram, escitalopram, paroxetine, sertraline, venlafaxine, vortioxetine) and three
  genes (CYP2C19, CYP2D6, CYP2B6). Every rule is traceable to a source.

## Business model and paying customer

Datum is a decision-support layer sold to the organisations that already run, or want to
run, structured medication review.

- **Pharmacist-led pharmacogenetics services.** These services already order PGx panels and
  need a defensible, prescriber-friendly way to turn results into action. Datum is the
  interpretation layer. This is the most natural first paying customer: a per-seat or
  per-report subscription.
- **Psychiatry clinics and primary-care groups.** They carry the trial-and-error cost
  directly. We sell per-clinician seats with a clear pitch: fewer failed first attempts and
  fewer avoidable interaction events.
- **Journal and EHR integration.** The larger play. Because the output is one short,
  structured, sourced line, it is built to sit inside the prescription flow of an existing
  record system. That is a per-seat licence to the EHR vendor or the region, with much
  higher reach.

Credible revenue path: land with one pharmacist-led PGx service as a paid pilot, prove fewer
switches and cleaner interaction checks, then expand to primary-care groups, then license the
engine into a journal or EHR for scale.

## Market and timing

Sweden prescribes antidepressants at high and rising volume, with well over a million people
on them, which makes even small improvements in first-choice quality meaningful at the
population level. Pharmacogenetics is moving from research into routine care: panel costs have
fallen, CPIC and equivalent bodies publish drug-gene guidance, and pharmacist-led PGx services
are emerging. The missing piece is not the test, it is the decision support that puts the
genetic result in clinical context at the moment of prescribing. That is the window Datum
fits, and antidepressants are the highest-volume, best-evidenced place to start.

## Why it is credible and safe

- **Rule-based, not a black box.** Every verdict comes from an explicit rule, not a model
  guess. A clinician can see why.
- **Traceable.** Each recommendation cites its source, FASS and CPIC, so it can be checked
  and defended in the journal.
- **Advisory only.** Datum informs the prescriber. It never diagnoses, never prescribes, and
  is never the sole driver of a decision. The clinician decides.
- **Honest regulatory path.** Advisory clinical decision support now. As we move toward
  driving decisions more directly, we expect to fall under medical device rules, Class II and
  the EU MDR, and we plan for that rather than around it.

## 2-minute pitch script, beat by beat

**0:00 to 0:20. The hook.**
"For most patients, the first antidepressant they are given does not work well enough. The
clinician picks one, waits a month and a half, and often starts over. That is normal, and it
costs patients weeks of illness."

**0:20 to 0:40. The real problem.**
"Three things decide a good first choice: the symptom picture, the patient's other
medications, and how they metabolise the drug. Today those live in three different places and
almost never get combined in a short appointment."

**0:40 to 1:05. The validation and the pivot. This is the heart.**
"We first built this genetics first, a tool that picks the drug from your genes. We showed it
to a specialist GP before we finished. He told us, plainly, that genetics first is too narrow
and loses clinician trust, because genes tell you how you handle a drug, not whether it works.
He also gave us the detail that proves it: a drug interaction can turn a genetically normal
metabolizer into a poor one, so an interaction can matter more than the genotype. We pivoted."

**1:05 to 1:35. The solution.**
"Datum now works in the order a clinician actually thinks. Symptoms first, to decide what
fits. Interactions second, because they can override everything else. Genetics on top, as a
safety filter: avoid, start low, standard, or low exposure. The output is one short line,
sourced to FASS and CPIC, ready to paste into the journal."

**1:35 to 1:55. Proof and ask.**
"It is built and running: enter symptoms, medications, and genotype, and it ranks all seven
common antidepressants with a clear verdict for each. It is rule-based and traceable, advisory
only, never the sole decider."

**1:55 to 2:00. Close.**
"Datum makes the first antidepressant choice safer and easier to defend. We start with
pharmacist-led PGx services and scale into the journal."

## Likely jury questions and answers

**Q1. Is this not just another pharmacogenetics tool?**
No, and that is the point of our pivot. A pure PGx tool answers the wrong question. Genetics
only describes metabolism. Datum leads with the symptom picture and interactions and uses
genetics as a filter on top. A specialist GP told us directly that the genetics-first version
would lose clinician trust, so we rebuilt it.

**Q2. How is this safe if it is recommending drugs?**
It recommends nothing on its own. It is advisory decision support. Every verdict is rule-based
and cited to FASS and CPIC, so the clinician can check it and remains the decision-maker. We
never diagnose or prescribe, and the tool is never the sole driver.

**Q3. What about regulation?**
As advisory support that a clinician interprets, we sit in the lighter category today. We are
honest that moving toward driving decisions more directly brings us under medical device
rules, likely Class II under the EU MDR, and we are planning the product and evidence for that
path rather than pretending it does not exist.

**Q4. Who pays, and why would they?**
Pharmacist-led PGx services first. They already order the tests and need a defensible way to
act on them. Then psychiatry and primary-care groups, who carry the trial-and-error cost.
The scale play is licensing the engine into a journal or EHR, which the short structured
output is designed for. The buyer's return is fewer failed first attempts and fewer avoidable
interaction events.

**Q5. Why only seven drugs and three genes? Is that not too small?**
It is deliberate scope, not a limit of the idea. These seven cover the bulk of antidepressant
prescribing and the three genes carry the relevant metabolism. Starting narrow lets every rule
be traceable and clinically defensible, which is exactly what earns clinician trust. The
architecture extends drug by drug and gene by gene once the core is validated.
