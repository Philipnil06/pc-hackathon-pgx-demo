import type { Patient, Medication, Condition } from "../domain/types";
import { mapPatient, mapMedication, mapCondition } from "./mappers";

export async function getPatient(client: any): Promise<Patient> {
  const resource = await client.patient.read();
  return mapPatient(resource);
}

export async function getActiveMedications(client: any): Promise<Medication[]> {
  const results = await client.request(
    `MedicationRequest?patient=${client.patient.id}&status=active`,
    { flat: true }
  );
  return (results || []).map(mapMedication);
}

export async function getConditions(client: any): Promise<Condition[]> {
  const results = await client.request(`Condition?patient=${client.patient.id}`, { flat: true });
  return (results || []).map(mapCondition);
}
