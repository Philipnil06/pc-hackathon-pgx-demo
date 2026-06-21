import type { Patient, Medication, Condition } from "../domain/types";

export function mapPatient(resource: any): Patient {
  const n = resource?.name?.[0];
  const name = n
    ? [(n.given || []).join(" "), n.family].filter(Boolean).join(" ").trim() || "Unknown"
    : "Unknown";
  return {
    id: resource?.id ?? "unknown",
    name,
    age: resource?.birthDate ? calcAge(resource.birthDate) : null,
    sex: resource?.gender ?? null,
  };
}

function calcAge(birthDate: string): number {
  const dob = new Date(birthDate).getTime();
  if (Number.isNaN(dob)) return 0;
  return Math.floor((Date.now() - dob) / (365.25 * 24 * 3600 * 1000));
}

export function normalizeDrug(display: string): string {
  return (display || "").toLowerCase().split(/[\s,(]/)[0];
}

export function mapMedication(resource: any): Medication {
  const cc = resource?.medicationCodeableConcept;
  const display = cc?.text || cc?.coding?.[0]?.display || "Unknown medication";
  return { name: normalizeDrug(display), display };
}

export function mapCondition(resource: any): Condition {
  const cc = resource?.code;
  return {
    code: cc?.coding?.[0]?.code ?? null,
    display: cc?.text || cc?.coding?.[0]?.display || "Unknown condition",
  };
}
