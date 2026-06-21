import type {
  Condition,
  Medication,
  Patient,
  Phenotype,
  Recommendation,
  RecommendationLine,
} from "../domain/types";

const CYP2D6_STRONG_INHIBITORS = ["paroxetine", "fluoxetine", "bupropion", "quinidine"];
const SEROTONERGIC = ["tramadol", "sumatriptan", "sertraline", "venlafaxine", "duloxetine", "phenelzine"];

export interface RecommendInput {
  patient: Patient;
  medications: Medication[];
  conditions: Condition[];
  phenotype: Phenotype; // entered CYP2C19 phenotype for the candidate
  candidate?: string;
}

export function recommend(input: RecommendInput): Recommendation {
  const candidate = input.candidate ?? "escitalopram";
  const lines: RecommendationLine[] = [];
  const medNames = input.medications.map((m) => m.name);

  // Layer 1: CYP2C19 phenotype dosing for the candidate (hard-coded worked cases)
  if (input.phenotype === "PM") {
    lines.push({
      level: "caution",
      text: "Reduce starting dose or consider an alternative. CYP2C19 poor metabolizer, roughly 2 to 3x higher escitalopram exposure.",
      source: "CPIC/DPWG 2023",
    });
  } else if (input.phenotype === "UM") {
    lines.push({
      level: "caution",
      text: "Standard dose may underexpose; monitor response and consider an alternative. CYP2C19 ultrarapid metabolizer.",
      source: "CPIC/DPWG 2023",
    });
  } else if (input.phenotype === "IM") {
    lines.push({
      level: "info",
      text: "Intermediate metabolizer. Standard dose reasonable; monitor for early side effects.",
      source: "DPWG 2023",
    });
  } else {
    lines.push({
      level: "info",
      text: "Standard starting dose reasonable for a CYP2C19 normal metabolizer.",
      source: "CPIC 2023",
    });
  }

  // Layer 2: phenoconversion (the real check, the hero moment)
  const inhibitor = CYP2D6_STRONG_INHIBITORS.find((d) => medNames.includes(d));
  if (inhibitor) {
    lines.push({
      level: "caution",
      text: `Effective CYP2D6 poor metabolizer due to an interacting drug (${inhibitor}, strong inhibitor present). Genotype alone would miss this.`,
      source: "CPIC 2023",
    });
  }

  // Layer 3: serotonergic combination flag
  const serotonergic = SEROTONERGIC.find((d) => medNames.includes(d));
  if (serotonergic) {
    lines.push({
      level: "caution",
      text: `Serotonergic combination caution. Patient already on ${serotonergic}; monitor for serotonin syndrome when adding an SSRI.`,
      source: "FASS",
    });
  }

  return { candidate, lines };
}
