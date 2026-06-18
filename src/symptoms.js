// src/symptoms.js
//
// Symptom-profile layer for Datum PGx.
// This is the FIRST layer of the decision support: a GP tags the patient's
// clinical picture, and we surface symptom-relevant suitability notes for each
// supported drug. Genetics and interactions are applied as later filters in
// server.js; nothing here diagnoses or prescribes.
//
// Rule-based and auditable. Every non-neutral note carries a short clinical
// rationale and a source label. Where the evidence does not clearly separate
// drugs, we say "limited differentiation" rather than inventing a signal.
//
// Scope: 7 drugs only. Mirtazapine, trazodone, bupropion etc. are NOT in scope
// and must never be referenced as alternatives in output.

'use strict';

const SUPPORTED_DRUGS = [
  'amitriptyline',
  'citalopram',
  'escitalopram',
  'paroxetine',
  'sertraline',
  'venlafaxine',
  'vortioxetine',
];

// The symptom-profile tags a GP picks. Kept to a focused set a prescriber
// recognises at the point of care. Plain copy, no em dashes.
const SYMPTOM_PROFILES = [
  {
    id: 'depression_insomnia',
    label: 'depression with insomnia',
    description:
      'sleep onset or maintenance problems are a prominent part of the picture. a more sedating agent, or evening dosing, can help, but sedation is not a reason to accept a riskier drug.',
  },
  {
    id: 'depression_anxiety',
    label: 'depression with anxiety or agitation',
    description:
      'marked anxiety, restlessness or agitation alongside low mood. activating agents may worsen early jitteriness, so start low and review.',
  },
  {
    id: 'fatigue_low_energy',
    label: 'fatigue or low energy dominant',
    description:
      'low drive, tiredness and psychomotor slowing dominate. heavily sedating agents are less attractive here.',
  },
  {
    id: 'weight_gain_concern',
    label: 'weight gain concern',
    description:
      'the patient is concerned about weight, or weight gain would undermine adherence or comorbidity (for example metabolic risk).',
  },
  {
    id: 'sexual_side_effect_concern',
    label: 'sexual side effect concern',
    description:
      'preserving sexual function is a stated priority, or prior treatment failed on sexual side effects.',
  },
  {
    id: 'comorbid_pain',
    label: 'comorbid pain',
    description:
      'coexisting chronic or neuropathic pain where a single agent treating both mood and pain would simplify care.',
  },
  {
    id: 'suicide_overdose_concern',
    label: 'high suicide risk or overdose safety concern',
    description:
      'elevated suicide or impulsive-overdose risk, or limited supervision of supply. toxicity in overdose becomes a primary safety filter.',
  },
];

const PROFILE_IDS = new Set(SYMPTOM_PROFILES.map((p) => p.id));

// Source labels used in notes. Kept short and citable.
const SRC = {
  NICE_NG222: 'NICE NG222 (depression in adults)',
  FASS: 'FASS product information',
  AMITRIP_TOX:
    'Taylor et al. 2024, cardiovascular safety of TCAs in overdose (Ther Adv Psychopharmacol)',
  VORTIO_SEX:
    'Jacobsen et al. 2015, vortioxetine vs escitalopram sexual functioning (J Sex Med)',
  VENLA_TOX:
    'Howell et al. 2007, venlafaxine cardiovascular toxicity in overdose (Br J Clin Pharmacol)',
  VENLA_BP:
    'venlafaxine product information, dose-dependent blood pressure rise >150 mg/day',
  SSRI_SEX: 'class effect, SSRI treatment-emergent sexual dysfunction',
  PAROX_PROFILE:
    'Sanchez et al. 2014, comparative review of escitalopram, paroxetine, sertraline',
};

// Per-drug, per-profile rules.
// fit: 'favored' | 'neutral' | 'caution' | 'avoid'
// Only deviations from neutral are listed; anything not listed is neutral.
// Notes are conservative. "limited differentiation" is used where the
// evidence does not clearly separate this drug from its class.
const RULES = {
  amitriptyline: {
    depression_insomnia: {
      fit: 'favored',
      note:
        'sedating tricyclic, useful at low dose where insomnia coexists. dose in the evening and review.',
      sources: [SRC.AMITRIP_TOX, SRC.FASS],
    },
    comorbid_pain: {
      fit: 'favored',
      note:
        'established option for neuropathic pain at low dose, so it can address mood and pain together.',
      sources: [SRC.NICE_NG222, SRC.FASS],
    },
    fatigue_low_energy: {
      fit: 'caution',
      note:
        'anticholinergic and sedating, which can deepen fatigue and cognitive fog where low energy dominates.',
      sources: [SRC.AMITRIP_TOX],
    },
    weight_gain_concern: {
      fit: 'caution',
      note:
        'tricyclics are associated with weight gain, less suitable where weight is a concern.',
      sources: [SRC.FASS],
    },
    suicide_overdose_concern: {
      fit: 'avoid',
      note:
        'one of the most cardiotoxic agents in overdose (sodium-channel blockade, QRS and QT widening, arrhythmia). avoid where suicide or overdose risk is elevated or supply is unsupervised.',
      sources: [SRC.AMITRIP_TOX, SRC.NICE_NG222],
    },
    // sexual side effect: TCAs can cause sexual dysfunction but data are
    // sparser than for SSRIs, so left neutral rather than overclaimed.
  },

  citalopram: {
    sexual_side_effect_concern: {
      fit: 'caution',
      note:
        'as an SSRI, associated with treatment-emergent sexual dysfunction. flag if preserving sexual function is a priority.',
      sources: [SRC.SSRI_SEX, SRC.FASS],
    },
    suicide_overdose_concern: {
      fit: 'caution',
      note:
        'note the dose-dependent QT prolongation signal and regulatory dose ceiling. relatively safer than TCAs in overdose but not neutral.',
      sources: [SRC.FASS],
    },
    // insomnia / anxiety / fatigue: limited differentiation within the SSRI
    // class, kept neutral.
  },

  escitalopram: {
    sexual_side_effect_concern: {
      fit: 'caution',
      note:
        'as an SSRI, associated with treatment-emergent sexual dysfunction. flag if preserving sexual function is a priority.',
      sources: [SRC.SSRI_SEX, SRC.PAROX_PROFILE],
    },
    suicide_overdose_concern: {
      fit: 'caution',
      note:
        'shares a dose-dependent QT signal with citalopram, though generally well tolerated and far safer than TCAs in overdose.',
      sources: [SRC.FASS],
    },
    // broadly neutral elsewhere; limited differentiation within class.
  },

  paroxetine: {
    depression_insomnia: {
      fit: 'favored',
      note:
        'the most sedating SSRI due to antihistaminic and anticholinergic activity, which can help where insomnia coexists.',
      sources: [SRC.PAROX_PROFILE],
    },
    fatigue_low_energy: {
      fit: 'caution',
      note:
        'more sedating than other SSRIs and can cause cognitive fog, less suitable where low energy dominates.',
      sources: [SRC.PAROX_PROFILE],
    },
    sexual_side_effect_concern: {
      fit: 'avoid',
      note:
        'among the highest rates of sexual dysfunction of the SSRIs. avoid where preserving sexual function is a priority.',
      sources: [SRC.SSRI_SEX, SRC.PAROX_PROFILE],
    },
    weight_gain_concern: {
      fit: 'caution',
      note:
        'the SSRI most associated with weight gain, less suitable where weight is a concern.',
      sources: [SRC.PAROX_PROFILE],
    },
  },

  sertraline: {
    fatigue_low_energy: {
      fit: 'neutral',
      note:
        'broadly neutral to mildly activating as mood lifts, so it does not aggravate low energy the way more sedating agents can. limited differentiation, listed for context only.',
      sources: [SRC.PAROX_PROFILE],
    },
    sexual_side_effect_concern: {
      fit: 'caution',
      note:
        'as an SSRI, associated with treatment-emergent sexual dysfunction. flag if preserving sexual function is a priority.',
      sources: [SRC.SSRI_SEX, SRC.PAROX_PROFILE],
    },
    // good general overdose safety relative to TCAs; left neutral to avoid
    // implying a within-SSRI advantage the evidence does not strongly support.
  },

  venlafaxine: {
    depression_anxiety: {
      fit: 'caution',
      note:
        'noradrenergic action can increase early jitteriness and anxiety, start low and review where agitation is prominent.',
      sources: [SRC.FASS],
    },
    sexual_side_effect_concern: {
      fit: 'avoid',
      note:
        'high rate of sexual dysfunction, comparable to or above SSRIs. avoid where preserving sexual function is a priority.',
      sources: [SRC.VORTIO_SEX, SRC.FASS],
    },
    suicide_overdose_concern: {
      fit: 'avoid',
      note:
        'higher overdose toxicity than SSRIs (dose-related QT and QRS prolongation, arrhythmia at high dose). avoid where overdose risk is elevated.',
      sources: [SRC.VENLA_TOX],
    },
    // blood pressure is a monitoring point rather than a symptom-profile tag,
    // surfaced in the medication/interaction layer instead.
  },

  vortioxetine: {
    sexual_side_effect_concern: {
      fit: 'favored',
      note:
        'lower treatment-emergent sexual dysfunction than SSRIs, particularly at 5 to 10 mg, and switching to it improved SSRI-induced dysfunction versus switching to escitalopram. favored where preserving sexual function is a priority.',
      sources: [SRC.VORTIO_SEX],
    },
    weight_gain_concern: {
      fit: 'neutral',
      note:
        'weight-neutral in trials, no specific concern. listed for reassurance only.',
      sources: [SRC.FASS],
    },
  },
};

/**
 * symptomFit(drug, profileIds)
 *
 * Returns the symptom-layer view for one drug given the GP's selected
 * symptom-profile tags. Aggregates across selected tags by worst-case fit,
 * which is the safety-conservative choice: any 'avoid' wins, then 'caution',
 * then 'favored', else 'neutral'. Returns the contributing notes and the
 * union of their source labels so the recommendation stays traceable.
 *
 * @param {string} drug - one of the 7 supported drug names (lowercase).
 * @param {string[]} profileIds - selected SYMPTOM_PROFILES ids.
 * @returns {{fit:'favored'|'neutral'|'caution'|'avoid', note:string, sources:string[]}}
 */
function symptomFit(drug, profileIds) {
  if (!SUPPORTED_DRUGS.includes(drug)) {
    return {
      fit: 'neutral',
      note: 'drug not in scope for the symptom layer.',
      sources: [],
    };
  }

  const ids = Array.isArray(profileIds) ? profileIds : [];
  const drugRules = RULES[drug] || {};

  const hits = [];
  for (const id of ids) {
    if (!PROFILE_IDS.has(id)) continue; // ignore unknown tags rather than guess
    const rule = drugRules[id];
    if (rule) hits.push({ id, ...rule });
  }

  if (hits.length === 0) {
    return {
      fit: 'neutral',
      note: 'no symptom-specific signal for the selected profile.',
      sources: [],
    };
  }

  // Worst-case aggregation. Higher rank wins.
  const rank = { neutral: 0, favored: 1, caution: 2, avoid: 3 };
  let overall = 'neutral';
  for (const h of hits) {
    if (rank[h.fit] > rank[overall]) overall = h.fit;
  }

  // Build the note from the hits that match the overall fit, so the rationale
  // explains why the worst-case verdict was reached. Favored notes are still
  // surfaced when nothing more cautionary applies.
  const drivers = hits.filter((h) => h.fit === overall);
  const note = drivers.map((d) => d.note).join(' ');
  const sources = [...new Set(drivers.flatMap((d) => d.sources))];

  return { fit: overall, note, sources };
}

const SYMPTOMS_API = { SYMPTOM_PROFILES, symptomFit, SUPPORTED_DRUGS };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SYMPTOMS_API;
}
if (typeof window !== 'undefined') {
  window.DatumSymptoms = SYMPTOMS_API;
}
