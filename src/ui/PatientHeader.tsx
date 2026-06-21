import type { Patient } from "../domain/types";

export function PatientHeader({ patient }: { patient: Patient }) {
  return (
    <header className="patient-header">
      <strong>{patient.name}</strong>
      <span>{patient.age !== null ? `${patient.age} y` : "age unknown"}</span>
      <span>{patient.sex ?? "sex unknown"}</span>
    </header>
  );
}
