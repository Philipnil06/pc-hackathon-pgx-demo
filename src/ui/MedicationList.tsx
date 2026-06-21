import type { Medication } from "../domain/types";

export function MedicationList({ medications }: { medications: Medication[] }) {
  return (
    <section className="med-list">
      <h3>Active medications (live from FHIR)</h3>
      {medications.length === 0 ? (
        <p className="muted">No active medications found.</p>
      ) : (
        <ul>
          {medications.map((m, i) => (
            <li key={i}>{m.display}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
