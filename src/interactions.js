// src/interactions.js
//
// Drug-interaction layer for Datum PGx.
// Advisory only. Rule-based and traceable: every rule carries a `source` label.
// Covers the 7 in-scope antidepressants:
//   amitriptyline, citalopram, escitalopram, paroxetine, sertraline, venlafaxine, vortioxetine
// Gene focus: CYP2C19, CYP2D6, CYP2B6.
//
// Severity scale used throughout:
//   'info'    -> note it, no action usually needed
//   'caution' -> adjust dose / monitor / slow titration
//   'serious' -> avoid combination or escalate clinically
//
// NOTE ON PHENOCONVERSION: a strong CYP inhibitor can make a genetically Normal
// Metabolizer behave like a Poor Metabolizer for that gene. applyPhenoconversion()
// below encodes that bridge between the medication layer and the genetics layer.

'use strict';

// ---------------------------------------------------------------------------
// Which gene primarily clears each in-scope antidepressant. Used to decide
// whether a CYP inhibitor/inducer is actually relevant to the chosen drug.
// ---------------------------------------------------------------------------
const DRUG_PRIMARY_GENES = {
  amitriptyline: ['CYP2D6', 'CYP2C19'], // both: 2C19 -> nortriptyline, 2D6 clears it
  citalopram: ['CYP2C19'],
  escitalopram: ['CYP2C19'],
  paroxetine: ['CYP2D6'],
  sertraline: ['CYP2C19'], // also 2B6/2D6, 2C19 is the actionable one (CPIC)
  venlafaxine: ['CYP2D6'],
  vortioxetine: ['CYP2D6'],
};

// Antidepressants that carry a QT signal (used for additive-QT rule).
const QT_ANTIDEPRESSANTS = new Set(['citalopram', 'escitalopram', 'amitriptyline']);

// All 7 are serotonergic; used for the serotonin-syndrome additive rule.
const SEROTONERGIC_ANTIDEPRESSANTS = new Set([
  'amitriptyline', 'citalopram', 'escitalopram', 'paroxetine',
  'sertraline', 'venlafaxine', 'vortioxetine',
]);

// SSRIs in scope (bleeding-risk rule applies to SSRIs specifically).
const SSRIS = new Set(['citalopram', 'escitalopram', 'paroxetine', 'sertraline']);

// ---------------------------------------------------------------------------
// INTERACTING_DRUGS: lookup of common culprit meds -> {effect, gene?, severity}.
// Keys are lowercase generic names. matchMed() also does substring matching so
// "co-codamol" etc. can be caught, and a few brand/synonym aliases are included.
// ---------------------------------------------------------------------------
const INTERACTING_DRUGS = {
  // --- MAOIs: hard contraindication with all serotonergic antidepressants ---
  phenelzine: { effect: 'MAOI', severity: 'serious' },
  tranylcypromine: { effect: 'MAOI', severity: 'serious' },
  isocarboxazid: { effect: 'MAOI', severity: 'serious' },
  moclobemide: { effect: 'MAOI', severity: 'serious' }, // reversible MAOI-A
  selegiline: { effect: 'MAOI', severity: 'serious' },
  rasagiline: { effect: 'MAOI', severity: 'serious' },
  linezolid: { effect: 'MAOI', severity: 'serious' }, // weak MAOI antibiotic
  'methylene blue': { effect: 'MAOI', severity: 'serious' },

  // --- Other serotonergic agents: additive serotonin-syndrome risk ---
  tramadol: { effect: 'serotonergic', severity: 'serious' },
  pethidine: { effect: 'serotonergic', severity: 'serious' },
  meperidine: { effect: 'serotonergic', severity: 'serious' },
  fentanyl: { effect: 'serotonergic', severity: 'caution' },
  sumatriptan: { effect: 'serotonergic', severity: 'caution' },
  rizatriptan: { effect: 'serotonergic', severity: 'caution' },
  zolmitriptan: { effect: 'serotonergic', severity: 'caution' },
  'st john': { effect: 'serotonergic', severity: 'serious' }, // St John's Wort (also CYP inducer, below)
  tryptophan: { effect: 'serotonergic', severity: 'caution' },
  lithium: { effect: 'serotonergic', severity: 'caution' },
  buspirone: { effect: 'serotonergic', severity: 'caution' },
  trazodone: { effect: 'serotonergic', severity: 'caution' },
  mirtazapine: { effect: 'serotonergic', severity: 'caution' },
  duloxetine: { effect: 'serotonergic', severity: 'serious' }, // also an SNRI
  fluoxetine: { effect: 'serotonergic+CYP2D6-strong-inhibitor', gene: 'CYP2D6', severity: 'serious' },
  paroxetine: { effect: 'serotonergic+CYP2D6-strong-inhibitor', gene: 'CYP2D6', severity: 'serious' },
  dextromethorphan: { effect: 'serotonergic', severity: 'caution' },
  ondansetron: { effect: 'serotonergic+QT', severity: 'caution' },

  // --- CYP2D6 STRONG inhibitors -> phenoconversion to Poor on CYP2D6 ---
  // (fluoxetine + paroxetine already listed above with the same gene tag)
  bupropion: { effect: 'CYP2D6-strong-inhibitor', gene: 'CYP2D6', severity: 'serious' },
  quinidine: { effect: 'CYP2D6-strong-inhibitor', gene: 'CYP2D6', severity: 'serious' },
  terbinafine: { effect: 'CYP2D6-strong-inhibitor', gene: 'CYP2D6', severity: 'serious' },
  // CYP2D6 MODERATE inhibitors -> caution, not full phenoconversion
  duloxetine_cyp: { effect: 'CYP2D6-moderate-inhibitor', gene: 'CYP2D6', severity: 'caution' },
  cinacalcet: { effect: 'CYP2D6-moderate-inhibitor', gene: 'CYP2D6', severity: 'caution' },
  mirabegron: { effect: 'CYP2D6-moderate-inhibitor', gene: 'CYP2D6', severity: 'caution' },

  // --- CYP2C19 inhibitors -> phenoconversion on CYP2C19 ---
  fluvoxamine: { effect: 'serotonergic+CYP2C19-strong-inhibitor', gene: 'CYP2C19', severity: 'serious' },
  omeprazole: { effect: 'CYP2C19-moderate-inhibitor', gene: 'CYP2C19', severity: 'caution' },
  esomeprazole: { effect: 'CYP2C19-moderate-inhibitor', gene: 'CYP2C19', severity: 'caution' },
  fluconazole: { effect: 'CYP2C19-strong-inhibitor', gene: 'CYP2C19', severity: 'serious' },
  cimetidine: { effect: 'CYP2C19-moderate-inhibitor', gene: 'CYP2C19', severity: 'caution' },
  ticlopidine: { effect: 'CYP2C19-strong-inhibitor', gene: 'CYP2C19', severity: 'serious' },

  // --- CYP inducers -> reduced exposure (loss of efficacy), not phenoconversion to Poor ---
  rifampicin: { effect: 'CYP-inducer', gene: 'CYP2C19/CYP2D6', severity: 'caution' },
  rifampin: { effect: 'CYP-inducer', gene: 'CYP2C19/CYP2D6', severity: 'caution' },
  carbamazepine: { effect: 'CYP-inducer', gene: 'CYP2C19/CYP2B6', severity: 'caution' },
  phenytoin: { effect: 'CYP-inducer', gene: 'CYP2C19', severity: 'caution' },
  phenobarbital: { effect: 'CYP-inducer', gene: 'CYP2C19/CYP2B6', severity: 'caution' },
  rifabutin: { effect: 'CYP-inducer', gene: 'CYP2C19', severity: 'caution' },
  // St John's Wort is both serotonergic (above) and a CYP inducer:
  'st johns wort': { effect: 'serotonergic+CYP-inducer', gene: 'CYP2C19/CYP2D6', severity: 'serious' },

  // --- QT-prolonging agents (additive with citalopram/escitalopram/amitriptyline) ---
  amiodarone: { effect: 'QT', severity: 'serious' },
  sotalol: { effect: 'QT', severity: 'serious' },
  methadone: { effect: 'QT+sedation', severity: 'serious' },
  haloperidol: { effect: 'QT', severity: 'caution' },
  quetiapine: { effect: 'QT+sedation', severity: 'caution' },
  ziprasidone: { effect: 'QT', severity: 'serious' },
  domperidone: { effect: 'QT', severity: 'caution' },
  hydroxyzine: { effect: 'QT+sedation', severity: 'caution' },
  erythromycin: { effect: 'QT', severity: 'caution' },
  clarithromycin: { effect: 'QT', severity: 'caution' },
  moxifloxacin: { effect: 'QT', severity: 'caution' },

  // --- Bleeding risk (additive with SSRIs) ---
  warfarin: { effect: 'bleeding', severity: 'serious' },
  apixaban: { effect: 'bleeding', severity: 'caution' },
  rivaroxaban: { effect: 'bleeding', severity: 'caution' },
  dabigatran: { effect: 'bleeding', severity: 'caution' },
  edoxaban: { effect: 'bleeding', severity: 'caution' },
  aspirin: { effect: 'bleeding', severity: 'caution' },
  clopidogrel: { effect: 'bleeding', severity: 'caution' },
  ibuprofen: { effect: 'bleeding', severity: 'caution' },
  naproxen: { effect: 'bleeding', severity: 'caution' },
  diclofenac: { effect: 'bleeding', severity: 'caution' },
  ketorolac: { effect: 'bleeding', severity: 'serious' },

  // --- Sedation / CNS depression ---
  diazepam: { effect: 'sedation', severity: 'caution' },
  lorazepam: { effect: 'sedation', severity: 'caution' },
  oxazepam: { effect: 'sedation', severity: 'caution' },
  alprazolam: { effect: 'sedation', severity: 'caution' },
  clonazepam: { effect: 'sedation', severity: 'caution' },
  zopiclone: { effect: 'sedation', severity: 'caution' },
  zolpidem: { effect: 'sedation', severity: 'caution' },
  alcohol: { effect: 'sedation', severity: 'caution' },
  oxycodone: { effect: 'sedation+serotonergic', severity: 'caution' },
  morphine: { effect: 'sedation', severity: 'caution' },
  codeine: { effect: 'sedation+serotonergic', severity: 'caution' },
  pregabalin: { effect: 'sedation', severity: 'caution' },
  gabapentin: { effect: 'sedation', severity: 'caution' },
};

// Source labels (kept short, traceable).
const SRC = {
  fda_citalopram: 'FDA Celexa label 2012/2022 (QT dose limits)',
  escit_qt: 'Lexapro label / MHRA advice (advisory QT dosing, not an FDA cap)',
  cpic_ssri: 'CPIC CYP2D6/CYP2C19 SSRI guideline 2015/2023',
  cpic_tca: 'CPIC CYP2D6/CYP2C19 TCA guideline 2016',
  flockhart: 'Flockhart CYP450 interaction table (Indiana)',
  ddi_review: 'PMC6009245 antidepressant PK interaction review',
  serotonin: 'UpToDate / FDA serotonin syndrome guidance',
  bleeding: 'SSRI + NSAID/anticoagulant bleeding meta-analyses',
  general: 'product labels / standard interaction references',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Normalise a med entry (string or {name}) to a lowercase trimmed name.
function medName(med) {
  if (!med) return '';
  const raw = typeof med === 'string' ? med : (med.name || med.drug || '');
  return String(raw).trim().toLowerCase();
}

// Find the INTERACTING_DRUGS record for a med name.
// Word-boundary matching with a minimum key length, so short or partial tokens
// cannot misfire (e.g. a 2-char med must not match "st john" or "sotalol").
// Only key-in-name is allowed; name-in-key (the old bidirectional rule) is gone.
function matchMed(name) {
  if (!name) return null;
  if (INTERACTING_DRUGS[name]) return { key: name, ...INTERACTING_DRUGS[name] };
  const tokens = name.split(/[^a-z0-9']+/i).filter(Boolean);
  for (const key of Object.keys(INTERACTING_DRUGS)) {
    if (key.length < 4) continue; // never match on a 1-3 char fragment
    if (tokens.includes(key)) return { key, ...INTERACTING_DRUGS[key] };
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // key must start at a word boundary in name (handles multi-word keys too)
    const re = new RegExp('(^|[^a-z])' + esc, 'i');
    if (re.test(name)) return { key, ...INTERACTING_DRUGS[key] };
  }
  return null;
}

function hasEffect(effect, tag) {
  return typeof effect === 'string' && effect.indexOf(tag) !== -1;
}

// ---------------------------------------------------------------------------
// checkInteractions(drug, currentMedsList)
//   drug          : one of the 7 supported antidepressant names
//   currentMedsList: array of strings or {name} objects
// Returns array of { type, severity, message, gene?, phenoconversion?, source }
// ---------------------------------------------------------------------------
function checkInteractions(drug, currentMedsList) {
  const out = [];
  const candidate = String(drug || '').trim().toLowerCase();
  const meds = Array.isArray(currentMedsList) ? currentMedsList : [];

  for (const med of meds) {
    const name = medName(med);
    if (!name || name === candidate) continue; // skip blanks and self
    const hit = matchMed(name);
    if (!hit) continue;
    const eff = hit.effect;

    // (a) MAOIs -> serotonin syndrome, hard avoid for any serotonergic AD
    if (eff === 'MAOI' && SEROTONERGIC_ANTIDEPRESSANTS.has(candidate)) {
      out.push({
        type: 'serotonin',
        severity: 'serious',
        contraindicated: true,
        message: `Do not combine ${candidate} with the MAOI ${hit.key}. High risk of serotonin syndrome. A washout is required between agents (around 2 weeks for an irreversible MAOI, longer after fluoxetine; about 24 hours after moclobemide).`,
        source: SRC.serotonin,
      });
      continue;
    }

    // (a) Other serotonergic agents -> additive serotonin syndrome risk.
    // Capped at 'caution': this is a monitor-and-counsel signal, not an absolute
    // contraindication. Only MAOIs (handled above) are serious enough to 'avoid'.
    if (hasEffect(eff, 'serotonergic') && SEROTONERGIC_ANTIDEPRESSANTS.has(candidate)) {
      out.push({
        type: 'serotonin',
        severity: 'caution',
        message: `${candidate} plus ${hit.key} adds serotonergic load. Watch for serotonin syndrome (agitation, tremor, clonus, hyperthermia), use the lowest effective doses, and counsel the patient.`,
        source: SRC.serotonin,
      });
    }

    // (b) CYP inhibitors -> phenoconversion note (only if gene clears this drug)
    if (hasEffect(eff, 'inhibitor') && hit.gene) {
      const relevant = (DRUG_PRIMARY_GENES[candidate] || []).includes(hit.gene);
      const strong = hasEffect(eff, 'strong');
      if (relevant) {
        out.push({
          type: 'cyp-inhibition',
          severity: strong ? 'serious' : 'caution',
          message: strong
            ? `${hit.key} is a strong ${hit.gene} inhibitor. It raises ${candidate} exposure and can make a genetically normal ${hit.gene} metabolizer behave like a poor metabolizer (phenoconversion). Treat as ${hit.gene} Poor: start low, go slow, cap the dose.`
            : `${hit.key} is a moderate ${hit.gene} inhibitor. Expect somewhat higher ${candidate} exposure. Consider a lower starting dose and monitor for side effects.`,
          gene: hit.gene,
          source: SRC.flockhart,
        });
      } else {
        out.push({
          type: 'cyp-inhibition',
          severity: 'info',
          message: `${hit.key} inhibits ${hit.gene}, but ${candidate} is not primarily cleared by ${hit.gene}, so the effect on exposure is limited.`,
          gene: hit.gene,
          source: SRC.flockhart,
        });
      }
    }

    // (b) CYP inducers -> reduced exposure, risk of loss of efficacy
    if (hasEffect(eff, 'inducer')) {
      const drugGenes = DRUG_PRIMARY_GENES[candidate] || [];
      const relevant = drugGenes.some((g) => (hit.gene || '').includes(g));
      out.push({
        type: 'cyp-induction',
        severity: relevant ? 'caution' : 'info',
        message: relevant
          ? `${hit.key} induces ${hit.gene}. It can lower ${candidate} exposure and reduce efficacy. Monitor response and consider a higher dose or an alternative not cleared by the induced enzyme. This is the opposite of phenoconversion to poor, so genotype-based low-dosing does not apply here.`
          : `${hit.key} is a CYP inducer but does not clearly affect the enzymes that clear ${candidate}.`,
        gene: hit.gene,
        source: SRC.ddi_review,
      });
    }

    // (c) QT prolongation: additive with QT-bearing antidepressants
    if (hasEffect(eff, 'QT') && QT_ANTIDEPRESSANTS.has(candidate)) {
      out.push({
        type: 'qt',
        severity: 'serious',
        message: `${candidate} and ${hit.key} both prolong the QT interval. Avoid the combination where possible, or check baseline and on-treatment ECG and electrolytes (K+, Mg2+) and keep ${candidate} at the low end of the dose range.`,
        source: SRC.fda_citalopram,
      });
    }

    // (d) Bleeding: SSRIs + NSAIDs/anticoagulants/antiplatelets
    if (eff === 'bleeding' && SSRIS.has(candidate)) {
      out.push({
        type: 'bleeding',
        severity: hit.severity === 'serious' ? 'serious' : 'caution',
        message: `${candidate} (an SSRI) plus ${hit.key} raises GI and general bleeding risk. Consider gastroprotection (e.g. a PPI) and review the need for the antiplatelet/anticoagulant/NSAID.`,
        source: SRC.bleeding,
      });
    }

    // (e) Sedation / CNS depression
    if (hasEffect(eff, 'sedation')) {
      out.push({
        type: 'sedation',
        severity: 'caution',
        message: `${candidate} with ${hit.key} can add sedation and CNS depression. Warn about drowsiness, driving, and falls; with opioids/benzodiazepines use the lowest doses.`,
        source: SRC.general,
      });
    }
  }

  // (c) Standalone QT dose-cap reminders for citalopram / escitalopram,
  //     independent of co-meds (genotype-side caps are applied in the
  //     genetics layer; this is the fixed FDA cap).
  if (candidate === 'citalopram') {
    out.push({
      type: 'qt',
      severity: 'info',
      message: 'Citalopram is QT dose-dependent. Maximum 40 mg/day in general, and maximum 20 mg/day in patients over 60, with hepatic impairment, who are CYP2C19 poor metabolizers, or who take a CYP2C19 inhibitor (e.g. cimetidine, fluvoxamine, omeprazole).',
      gene: 'CYP2C19',
      source: SRC.fda_citalopram,
    });
  } else if (candidate === 'escitalopram') {
    out.push({
      type: 'qt',
      severity: 'info',
      message: 'Escitalopram is also QT dose-dependent. By clinical convention consider a usual maximum of 20 mg/day, and 10 mg/day in patients over 65, CYP2C19 poor metabolizers, or those on a CYP2C19 inhibitor. Note this is advisory, not an FDA-mandated cap like citalopram.',
      gene: 'CYP2C19',
      source: SRC.escit_qt,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// applyPhenoconversion(phenotypeMap, currentMedsList)
//   phenotypeMap : { CYP2C19: 'Normal Metabolizer', CYP2D6: 'Normal Metabolizer', ... }
//   currentMedsList: array of strings or {name}
// Downgrades a gene's EFFECTIVE phenotype when a strong inhibitor of that gene
// is present. A strong inhibitor pushes the effective phenotype to Poor; a
// moderate inhibitor pushes Normal/Rapid down by one step toward Intermediate.
// Returns { adjustedPhenotypeMap, conversions:[ {gene, from, to, culprit, strength, source} ] }
// ---------------------------------------------------------------------------

// Ordered ladder used to step a phenotype downward.
const PHENO_LADDER = [
  'Ultrarapid Metabolizer',
  'Rapid Metabolizer',
  'Normal Metabolizer',
  'Intermediate Metabolizer',
  'Poor Metabolizer',
];

function normalisePheno(p) {
  if (!p) return null;
  const s = String(p).toLowerCase();
  if (s.includes('ultra')) return 'Ultrarapid Metabolizer';
  if (s.includes('rapid')) return 'Rapid Metabolizer';
  if (s.includes('poor')) return 'Poor Metabolizer';
  if (s.includes('intermediate')) return 'Intermediate Metabolizer';
  if (s.includes('normal') || s.includes('extensive')) return 'Normal Metabolizer';
  return p; // unknown / indeterminate left as-is
}

function stepDown(pheno) {
  const norm = normalisePheno(pheno);
  const i = PHENO_LADDER.indexOf(norm);
  if (i === -1 || i === PHENO_LADDER.length - 1) return norm; // unknown or already Poor
  return PHENO_LADDER[i + 1];
}

function applyPhenoconversion(phenotypeMap, currentMedsList) {
  const adjusted = Object.assign({}, phenotypeMap || {});
  const conversions = [];
  const meds = Array.isArray(currentMedsList) ? currentMedsList : [];

  // Strongest inhibitor seen per gene wins (strong beats moderate).
  const strongestByGene = {}; // gene -> { culprit, strength }

  for (const med of meds) {
    const hit = matchMed(medName(med));
    if (!hit || !hit.gene || !hasEffect(hit.effect, 'inhibitor')) continue;
    // gene may be a single gene here (inhibitors are gene-specific in this table)
    const gene = hit.gene;
    if (!(gene in adjusted)) continue; // only convert genes we have a phenotype for
    const strength = hasEffect(hit.effect, 'strong') ? 'strong' : 'moderate';
    const cur = strongestByGene[gene];
    if (!cur || (cur.strength === 'moderate' && strength === 'strong')) {
      strongestByGene[gene] = { culprit: hit.key, strength };
    }
  }

  for (const gene of Object.keys(strongestByGene)) {
    const { culprit, strength } = strongestByGene[gene];
    const from = normalisePheno(adjusted[gene]);
    if (from === 'Poor Metabolizer' || from == null) continue; // nothing to downgrade

    let to;
    if (strength === 'strong') {
      to = 'Poor Metabolizer'; // strong inhibitor collapses to Poor
    } else {
      to = stepDown(from); // moderate inhibitor: one step toward Poor
    }
    if (to === from) continue;

    adjusted[gene] = to;
    conversions.push({
      gene,
      from,
      to,
      culprit,
      strength,
      source: SRC.flockhart,
      note: `${culprit} is a ${strength} ${gene} inhibitor. Effective ${gene} phenotype treated as ${to} for prescribing (phenoconversion), regardless of genotype.`,
    });
  }

  return { adjustedPhenotypeMap: adjusted, conversions };
}

module.exports = {
  INTERACTING_DRUGS,
  DRUG_PRIMARY_GENES,
  checkInteractions,
  applyPhenoconversion,
};
