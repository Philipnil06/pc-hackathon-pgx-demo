// Offline fallback (spec section 6). Synthetic data — state this clearly on stage.
// This patient is on paroxetine so the phenoconversion hero case fires.
export function makeMockClient() {
  return {
    patient: {
      id: "mock-1",
      read: async () => ({
        id: "mock-1",
        gender: "female",
        birthDate: "1979-03-14",
        name: [{ given: ["Synthetic"], family: "Testsson" }],
      }),
    },
    request: async (query: string) => {
      if (query.startsWith("MedicationRequest")) {
        return [
          { medicationCodeableConcept: { text: "Paroxetine 20 MG Oral Tablet" } },
          { medicationCodeableConcept: { text: "Omeprazole 20 MG Oral Capsule" } },
        ];
      }
      if (query.startsWith("Condition")) {
        return [{ code: { text: "Major depressive disorder" } }];
      }
      return [];
    },
  };
}
