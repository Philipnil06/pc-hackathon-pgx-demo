import { describe, it, expect } from "vitest";
import { getPatient, getActiveMedications, getConditions } from "./client";

const fakeClient = {
  patient: {
    id: "p1",
    read: async () => ({ id: "p1", gender: "male", birthDate: "1970-05-05", name: [{ given: ["Bo"], family: "Berg" }] }),
  },
  request: async (query: string) => {
    if (query.startsWith("MedicationRequest")) {
      return [{ medicationCodeableConcept: { text: "Paroxetine 20 MG Oral Tablet" } }];
    }
    if (query.startsWith("Condition")) {
      return [{ code: { text: "Major depressive disorder" } }];
    }
    return [];
  },
};

describe("fhir client reads", () => {
  it("reads and maps the patient", async () => {
    const p = await getPatient(fakeClient as any);
    expect(p.name).toBe("Bo Berg");
    expect(p.sex).toBe("male");
  });

  it("reads and maps active medications", async () => {
    const meds = await getActiveMedications(fakeClient as any);
    expect(meds).toHaveLength(1);
    expect(meds[0].name).toBe("paroxetine");
  });

  it("reads and maps conditions", async () => {
    const conds = await getConditions(fakeClient as any);
    expect(conds[0].display).toBe("Major depressive disorder");
  });
});
