'use strict';

/**
 * src/phenotype.js — Star-allele DIPLOTYPE -> PHENOTYPE translation
 * ==================================================================
 *
 * Converts a raw star-allele diplotype (e.g. "CYP2C19 *2/*2", "CYP2D6 *1xN/*4")
 * into the standardized CPIC metabolizer phenotype. This sits UPSTREAM of the
 * CPIC API lookup in src/cpic.js, which expects a phenotype string.
 *
 * Runs in BOTH Node (module.exports) and the browser (window.DatumPhenotype).
 *
 * DESIGN PRINCIPLE — ANTI-HALLUCINATION / SAFE-FAIL
 * -------------------------------------------------
 * A silent miscall is the worst possible failure mode for a clinical tool.
 * This module therefore NEVER guesses:
 *   - Any allele not present in the curated ALLELE_FUNCTION table for that gene
 *     causes diplotypeToPhenotype() to return { phenotype: null, reason: ... }.
 *   - Any diplotype string it cannot confidently parse returns a null phenotype.
 * Downstream code must treat a null phenotype as "indeterminate — do not advise".
 *
 * AUTHORITATIVE SOURCES (verified June 2026)
 * ------------------------------------------
 * CYP2C19: CPIC Medical Genetics Summaries, "CPIC Assignment of CYP2C19
 *   Phenotype based on Genotype (2017)", NCBI Bookshelf NBK379740.
 *   *1 normal, *17 increased, *2/*3 no function. *17/*17 = Ultrarapid,
 *   *1/*17 = Rapid, *1/*1 = Normal, *1/*2 & *2/*17 = Intermediate, *2/*2 = Poor.
 * CYP2D6: Caudle KE, Sangkuhl K, et al. "Standardizing CYP2D6 Genotype to
 *   Phenotype Translation: Consensus Recommendations from CPIC and DPWG."
 *   Clin Transl Sci. 2020;13(1):116-124 (PMC6951851); allele functionality
 *   table NBK574601. Activity values *1=*2=1.0, *4=*5=0, *10=0.25, *17=*41=0.5;
 *   xN multiplies. Bands: 0=PM, 0<AS<1.25=IM, 1.25-2.25=NM, >2.25=UM.
 * CYP2B6: CPIC efavirenz guideline / ClinPGx allele functionality. *1 normal,
 *   *6 decreased, *4 increased; count of decreased/no-function alleles -> NM/IM/PM.
 */

const PHENO = {
  UM: 'Ultrarapid Metabolizer',
  RM: 'Rapid Metabolizer',
  NM: 'Normal Metabolizer',
  LIM: 'Likely Intermediate Metabolizer',
  IM: 'Intermediate Metabolizer',
  LPM: 'Likely Poor Metabolizer',
  PM: 'Poor Metabolizer',
};

// Any allele NOT in this table is treated as UNKNOWN -> safe-fail.
const ALLELE_FUNCTION = {
  CYP2C19: {
    '*1':  { function: 'Normal function',    value: 'normal' },
    '*2':  { function: 'No function',        value: 'none' },
    '*3':  { function: 'No function',        value: 'none' },
    '*17': { function: 'Increased function', value: 'increased' },
  },
  CYP2D6: {
    '*1':  { function: 'Normal function',            value: 1.0 },
    '*2':  { function: 'Normal function',            value: 1.0 },
    '*4':  { function: 'No function',                value: 0 },
    '*5':  { function: 'No function (gene deletion)', value: 0 },
    '*10': { function: 'Decreased function (severe)', value: 0.25 },
    '*17': { function: 'Decreased function',          value: 0.5 },
    '*41': { function: 'Decreased function',          value: 0.5 },
  },
  CYP2B6: {
    '*1': { function: 'Normal function',    value: 'normal' },
    '*6': { function: 'Decreased function', value: 'decreased' },
    '*4': { function: 'Increased function', value: 'increased' },
  },
};

// Explicit, auditable diplotype -> phenotype lookups (categorical genes).
const PHENOTYPE_TABLE = {
  CYP2C19: {
    '*17/*17': PHENO.UM,
    '*1/*17':  PHENO.RM,
    '*1/*1':   PHENO.NM,
    '*1/*2':   PHENO.IM,
    '*1/*3':   PHENO.IM,
    '*2/*17':  PHENO.IM, // *17 cannot fully compensate for a no-function allele
    '*3/*17':  PHENO.IM,
    '*2/*2':   PHENO.PM,
    '*2/*3':   PHENO.PM,
    '*3/*3':   PHENO.PM,
  },
  CYP2B6: {
    '*1/*1': PHENO.NM,
    '*1/*4': PHENO.NM,
    '*4/*4': PHENO.NM,
    '*1/*6': PHENO.IM,
    '*4/*6': PHENO.IM,
    '*6/*6': PHENO.PM,
  },
};

// Activity-score -> phenotype (CPIC/DPWG 2020 consensus, contiguous bands).
function activityScoreToPhenotype(score) {
  if (score === 0) return PHENO.PM;
  if (score > 0 && score < 1.25) return PHENO.IM;
  if (score >= 1.25 && score <= 2.25) return PHENO.NM;
  if (score > 2.25) return PHENO.UM;
  return null;
}

(function freezeTables() {
  Object.freeze(ALLELE_FUNCTION.CYP2C19);
  Object.freeze(ALLELE_FUNCTION.CYP2D6);
  Object.freeze(ALLELE_FUNCTION.CYP2B6);
  Object.freeze(ALLELE_FUNCTION);
})();

function normalizeGene(gene) {
  if (!gene || typeof gene !== 'string') return null;
  let g = gene.trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d/.test(g)) g = 'CYP' + g; // allow "2C19"
  return g;
}

function parseAlleleToken(tokenRaw) {
  if (!tokenRaw) return null;
  let t = String(tokenRaw).trim().toUpperCase().replace(/\s+/g, '');
  let copies = 1;
  const dup = t.match(/^(.*?)X(N|\d+)$/);
  if (dup) {
    t = dup[1];
    copies = dup[2] === 'N' ? 2 : parseInt(dup[2], 10);
    if (!Number.isFinite(copies) || copies < 1) return null;
  }
  const m = t.match(/^(\*\d+[A-Z]*)$/);
  if (!m) return null;
  return { allele: m[1], copies };
}

function splitDiplotype(diplotypeString) {
  if (!diplotypeString || typeof diplotypeString !== 'string') return null;
  let s = diplotypeString.trim();
  s = s.replace(/^(CYP\s*\d+[A-Z]\d+)\s*/i, '');
  const parts = s.split('/');
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

function normPair(a, b) {
  const stripDup = (x) => x.replace(/X(N|\d+)$/i, '');
  const aa = stripDup(a.toUpperCase());
  const bb = stripDup(b.toUpperCase());
  const numOf = (x) => parseInt(x.replace(/[^\d]/g, ''), 10) || 0;
  return numOf(aa) <= numOf(bb) ? `${aa}/${bb}` : `${bb}/${aa}`;
}

/**
 * diplotypeToPhenotype(gene, diplotypeString)
 * success: { phenotype, activityScore?, method, sourceNote, gene, diplotype }
 * failure: { phenotype: null, reason }
 * NEVER returns a guessed phenotype for an allele it does not know.
 */
function diplotypeToPhenotype(gene, diplotypeString) {
  const g = normalizeGene(gene);
  if (!g || !ALLELE_FUNCTION[g]) {
    return { phenotype: null, reason: `Unsupported or unrecognized gene: "${gene}". Supported: ${Object.keys(ALLELE_FUNCTION).join(', ')}.` };
  }

  const split = splitDiplotype(diplotypeString);
  if (!split) {
    return { phenotype: null, reason: `Could not parse diplotype "${diplotypeString}" for ${g}. Expected form like "*2/*2" or "*1xN/*4".` };
  }

  const t1 = parseAlleleToken(split[0]);
  const t2 = parseAlleleToken(split[1]);
  if (!t1 || !t2) {
    return { phenotype: null, reason: `Could not parse one or both alleles in "${diplotypeString}" for ${g}.` };
  }

  const known = ALLELE_FUNCTION[g];
  if (!known[t1.allele]) {
    return { phenotype: null, reason: `Unknown ${g} allele "${t1.allele}". Not in curated function table; refusing to guess.` };
  }
  if (!known[t2.allele]) {
    return { phenotype: null, reason: `Unknown ${g} allele "${t2.allele}". Not in curated function table; refusing to guess.` };
  }

  if (g === 'CYP2D6') {
    const v1 = known[t1.allele].value * t1.copies;
    const v2 = known[t2.allele].value * t2.copies;
    const activityScore = Math.round((v1 + v2) * 100) / 100;
    const phenotype = activityScoreToPhenotype(activityScore);
    if (!phenotype) {
      return { phenotype: null, reason: `Computed an invalid activity score (${activityScore}) for ${g} ${diplotypeString}.` };
    }
    return {
      phenotype,
      activityScore,
      method: 'CYP2D6 activity score (sum of allele activity values, xN multiplied), CPIC/DPWG 2020 bands',
      sourceNote: 'Caudle et al., Clin Transl Sci 2020 (PMC6951851); CPIC allele functionality table NBK574601.',
      gene: g,
      diplotype: `${t1.allele}${t1.copies > 1 ? 'x' + t1.copies : ''}/${t2.allele}${t2.copies > 1 ? 'x' + t2.copies : ''}`,
    };
  }

  const key = normPair(t1.allele, t2.allele);
  const table = PHENOTYPE_TABLE[g];
  const hit = table[key];
  if (hit === undefined) {
    return { phenotype: null, reason: `No CPIC phenotype mapping for ${g} ${key}; refusing to guess.` };
  }

  return {
    phenotype: typeof hit === 'string' ? hit : hit.phenotype,
    method: `${g} categorical diplotype-to-phenotype lookup (sum-of-function)`,
    sourceNote: g === 'CYP2C19'
      ? 'CPIC 2017 CYP2C19 phenotype assignment (NCBI NBK379740).'
      : 'CPIC CYP2B6 (efavirenz guideline / ClinPGx allele functionality).',
    gene: g,
    diplotype: key,
  };
}

const API = {
  ALLELE_FUNCTION,
  PHENOTYPE_TABLE,
  PHENO,
  activityScoreToPhenotype,
  diplotypeToPhenotype,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
if (typeof window !== 'undefined') {
  window.DatumPhenotype = API;
}
