export type Phenotype = "UM" | "NM" | "IM" | "PM";

export interface Patient {
  id: string;
  name: string;
  age: number | null;
  sex: string | null;
}

export interface Medication {
  name: string; // normalized lowercase generic, e.g. "paroxetine"
  display: string; // original FHIR display text
}

export interface Condition {
  code: string | null;
  display: string;
}

export type RecommendationLevel = "preferred" | "caution" | "avoid" | "info";

export interface RecommendationLine {
  text: string;
  level: RecommendationLevel;
  source: string;
}

export interface Recommendation {
  candidate: string; // the SSRI in focus, e.g. "escitalopram"
  lines: RecommendationLine[];
}
