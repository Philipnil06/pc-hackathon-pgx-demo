import { describe, it, expect } from "vitest";
import { mapPatient, mapMedication, mapCondition, normalizeDrug } from "./mappers";

describe("mappers", () => {
  it("maps a Patient resource to name/sex and a non-negative age", () => {
    const p = mapPatient({
      id: "p1",
      gender: "female",
      birthDate: "1980-01-01",
      name: [{ given: ["Anna"], family: "Andersson" }],
    });
    expect(p.id).toBe("p1");
    expect(p.name).toBe("Anna Andersson");
    expect(p.sex).toBe("female");
    expect(p.age).not.toBeNull();
    expect(p.age as number).toBeGreaterThan(0);
  });

  it("falls back gracefully when Patient fields are missing", () => {
    const p = mapPatient({ id: "p2" });
    expect(p.name).toBe("Unknown");
    expect(p.age).toBeNull();
    expect(p.sex).toBeNull();
  });

  it("normalizes a medication display to a lowercase generic", () => {
    expect(normalizeDrug("Paroxetine 20 MG Oral Tablet")).toBe("paroxetine");
  });

  it("maps a MedicationRequest using medicationCodeableConcept text", () => {
    const m = mapMedication({ medicationCodeableConcept: { text: "Paroxetine 20 MG Oral Tablet" } });
    expect(m.name).toBe("paroxetine");
    expect(m.display).toBe("Paroxetine 20 MG Oral Tablet");
  });

  it("maps a Condition using code text", () => {
    const c = mapCondition({ code: { text: "Major depressive disorder", coding: [{ code: "370143000" }] } });
    expect(c.display).toBe("Major depressive disorder");
    expect(c.code).toBe("370143000");
  });
});
