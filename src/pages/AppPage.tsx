import { useEffect, useState } from "react";
import { ready } from "../auth/smart";
import { getPatient, getActiveMedications, getConditions } from "../fhir/client";
import { recommend } from "../recommendation/engine";
import { makeMockClient } from "../mock/bundle";
import type { Patient, Medication, Condition, Phenotype } from "../domain/types";
import { PatientHeader } from "../ui/PatientHeader";
import { MedicationList } from "../ui/MedicationList";
import { PhenotypeSelector } from "../ui/PhenotypeSelector";
import { RecommendationPanel } from "../ui/RecommendationPanel";

export function AppPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [phenotype, setPhenotype] = useState<Phenotype>("NM");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const useMock = new URLSearchParams(window.location.search).has("mock");
    const clientPromise = useMock ? Promise.resolve(makeMockClient()) : ready();
    clientPromise
      .then(async (client: any) => {
        setPatient(await getPatient(client));
        setMedications(await getActiveMedications(client));
        setConditions(await getConditions(client));
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <main className="app"><p className="error">Launch failed: {error}. Try ?mock=1 for an offline demo.</p></main>;
  if (!patient) return <main className="app"><p>Loading patient context...</p></main>;

  const recommendation = recommend({ patient, medications, conditions, phenotype });

  return (
    <main className="app">
      <PatientHeader patient={patient} />
      <MedicationList medications={medications} />
      <PhenotypeSelector value={phenotype} onChange={setPhenotype} />
      <RecommendationPanel recommendation={recommendation} />
    </main>
  );
}
