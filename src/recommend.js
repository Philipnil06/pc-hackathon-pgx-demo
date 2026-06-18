'use strict';

/**
 * src/recommend.js — Datum PGx combined-recommendation engine.
 *
 * Merges the three layers into ONE verdict per drug plus a short journal note:
 *   1. symptom fit       (symptoms.js: symptomFit -> {fit, note, sources})
 *   2. interactions      (interactions.js: checkInteractions -> [{type, severity, message, gene?, source}])
 *   3. pharmacogenetics  (the per-drug CPIC verdict from the fan-out)
 *
 * THE PIVOT RULE (load-bearing): genetics is ONE filter, never the chooser.
 *   - Only a SERIOUS interaction or a symptom-level "avoid" makes a drug 'avoid'.
 *   - A PGx flag (CPIC alert OR caution) can only pull a drug down to 'caution',
 *     never to 'avoid'. A CYP poor-metabolizer caps the dose, it does not
 *     contraindicate the drug. The genetics line is never the headline.
 *   - Only symptom 'favored' with no cautions lifts a drug to 'preferred'.
 *
 * Advisory only. Plain copy, no em dashes, never "prescribe X".
 */

// pgx verdict shape (from the fan-out): { verdictLevel: 'alert'|'caution'|'ok'|'none',
//   recommendationText, gene, phenotype, source }

function combineRecommendation({ drug, symptomFit, interactionFlags, pgxVerdict }) {
  const flags = Array.isArray(interactionFlags) ? interactionFlags : [];
  const reasons = [];

  // ---- Layer 1: symptom fit ----
  const symptomLevel = symptomFit && symptomFit.fit ? symptomFit.fit : 'neutral';
  if (symptomLevel !== 'neutral' && symptomFit && symptomFit.note) {
    reasons.push({
      layer: 'symptom',
      text: symptomFit.note,
      source: ['symptom profile'].concat(symptomFit.sources || []).join('; '),
    });
  }

  // ---- Layer 2: interactions (incl. phenoconversion, surfaced as interaction) ----
  for (const f of flags) {
    if (f.severity === 'info' && f.type !== 'qt') continue; // keep QT info caps, drop pure notes
    reasons.push({ layer: 'interaction', text: f.message, source: f.source });
  }
  // Only a true contraindication (e.g. MAOI combo) forces avoid. Other "serious"
  // interactions (CYP inhibition, QT, bleeding) are manageable and cap at caution.
  const hasContraindication = flags.some((f) => f.contraindicated);
  const hasInteractionConcern = flags.some((f) => f.severity === 'serious' || f.severity === 'caution');

  // ---- Layer 3: pharmacogenetics (filter only) ----
  const pgxLevel = pgxVerdict ? pgxVerdict.verdictLevel : 'none';
  const pgxFlagged = pgxLevel === 'alert' || pgxLevel === 'caution';
  if (pgxFlagged && pgxVerdict.recommendationText) {
    reasons.push({
      layer: 'pgx',
      text: pgxVerdict.recommendationText,
      source: pgxVerdict.source || ('CPIC' + (pgxVerdict.gene ? ', ' + pgxVerdict.gene : '')),
    });
  }

  // ---- Resolve precedence ----
  // avoid: only a serious interaction or a symptom-level contraindication.
  // PGx NEVER reaches 'avoid' on its own — that is the whole point of the pivot.
  let overallLevel;
  if (hasContraindication || symptomLevel === 'avoid') {
    overallLevel = 'avoid';
  } else if (symptomLevel === 'caution' || hasInteractionConcern || pgxFlagged) {
    overallLevel = 'caution';
  } else if (symptomLevel === 'favored') {
    overallLevel = 'preferred';
  } else {
    overallLevel = 'neutral';
  }

  return {
    drug,
    overallLevel,
    reasons,
    oneLine: buildOneLine(drug, overallLevel, reasons, symptomFit),
  };
}

// One short, traceable sentence. Leads with the layer that drove the verdict,
// preferring interaction then symptom then genetics, so genetics never headlines.
function buildOneLine(drug, overallLevel, reasons, symptomFit) {
  const verb = {
    avoid: 'avoid',
    caution: 'use with caution',
    preferred: 'reasonable first option',
    neutral: 'no specific concern',
  }[overallLevel];

  let lead;
  if (overallLevel === 'preferred') {
    lead = symptomFit && symptomFit.note ? symptomFit.note : 'fits the symptom profile';
  } else if (overallLevel === 'neutral') {
    lead = 'no flag from symptoms, interactions, or genetics';
  } else {
    const driver =
      reasons.find((r) => r.layer === 'interaction') ||
      reasons.find((r) => r.layer === 'symptom') ||
      reasons.find((r) => r.layer === 'pgx');
    lead = driver ? driver.text : 'see details';
  }
  return `${drug}: ${verb} (${lead}).`;
}

// Rank weight: preferred first, then neutral, then caution, then avoid.
const RANK_WEIGHT = { preferred: 0, neutral: 1, caution: 2, avoid: 3 };

function rankRecommendations(recs) {
  return [...recs]
    .sort((a, b) => {
      const w = RANK_WEIGHT[a.overallLevel] - RANK_WEIGHT[b.overallLevel];
      return w !== 0 ? w : a.drug.localeCompare(b.drug);
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Short plain-text note a clinician could paste into a record (<= 6 lines).
 * patientContext: { profileLabels:[], genotypeSummary, phenoconversionNote }
 */
function buildClinicalNote(patientContext, rankedRecommendations) {
  const ctx = patientContext || {};
  const ranked = Array.isArray(rankedRecommendations) ? rankedRecommendations : [];
  const profile = ctx.profileLabels && ctx.profileLabels.length ? ctx.profileLabels.join(', ') : 'not specified';

  const preferred = ranked.filter((r) => r.overallLevel === 'preferred');
  const suggested = (preferred.length ? preferred : ranked.filter((r) => r.overallLevel === 'neutral')).slice(0, 2);
  const toAvoid = ranked.filter((r) => r.overallLevel === 'avoid');

  const lines = [];
  lines.push(`Symptom profile considered: ${profile}.`);

  if (suggested.length) {
    const parts = suggested.map((r) => {
      const reason = pickKeyReason(r);
      return reason ? `${r.drug} (${reason})` : r.drug;
    });
    lines.push(`Options to consider: ${parts.join('; ')}.`);
  } else {
    lines.push('No clearly favored option from the symptom profile; choose on clinical grounds.');
  }

  if (toAvoid.length) {
    const parts = toAvoid.slice(0, 2).map((r) => {
      const reason = pickKeyReason(r);
      return reason ? `${r.drug} (${reason})` : r.drug;
    });
    lines.push(`Better avoided: ${parts.join('; ')}.`);
  }

  const caveats = [];
  if (ctx.genotypeSummary) caveats.push(ctx.genotypeSummary);
  if (ctx.phenoconversionNote) caveats.push(ctx.phenoconversionNote);
  if (caveats.length) lines.push(`PGx / interaction caveat: ${caveats.join('; ')}.`);

  lines.push('Decision support only, not a prescription. Confirm against current guidance and clinical judgment.');
  return lines.slice(0, 6).join('\n');
}

function pickKeyReason(rec) {
  if (!rec || !rec.reasons || !rec.reasons.length) return null;
  const byLayer =
    rec.reasons.find((r) => r.layer === 'interaction') ||
    rec.reasons.find((r) => r.layer === 'symptom') ||
    rec.reasons.find((r) => r.layer === 'pgx');
  return byLayer ? byLayer.text : null;
}

module.exports = { combineRecommendation, rankRecommendations, buildClinicalNote, RANK_WEIGHT };
