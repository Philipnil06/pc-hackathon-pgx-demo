# Attune OpenEMR Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SMART on FHIR React SPA that launches inside a self-hosted OpenEMR, reads the patient's entire journal (incl. a genome `Observation`), and renders a sourced antidepressant recommendation whose correlation logic is mocked (scripted gene→drug lines + a real phenoconversion check).

**Architecture:** Browser SPA. `fhirclient` runs the SMART App Launch with PKCE (required by OpenEMR public clients) and returns a client bound to OpenEMR's FHIR R4 endpoint. Typed mappers turn the full journal into plain models; the genome phenotype is extracted from an `Observation` and fed to a pure `recommend()`. OpenEMR is stood up entirely via Docker and seeded with a mock profile. Dev rig: `launch.smarthealthit.org`. Offline fallback: `?mock=1`.

**Tech Stack:** React + Vite + TypeScript, `fhirclient`, `react-router-dom`, Vitest + `@testing-library/react`, OpenEMR + MariaDB (Docker).

**Spec:** `docs/superpowers/specs/2026-06-21-attune-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example` | Scaffold + Vitest + env vars |
| `src/test/setup.ts` | Test setup (jest-dom) |
| `src/domain/types.ts` | Shared models incl. `Journal`, `GenomePhenotype` |
| `src/recommendation/engine.ts` (+ `.test.ts`) | Mocked correlation engine |
| `src/fhir/mappers.ts` (+ `.test.ts`) | FHIR → model mappers + genome extraction |
| `src/fhir/client.ts` (+ `.test.ts`) | Full-journal read functions |
| `src/auth/smart.ts` | SMART launch (PKCE + env config) |
| `src/ui/*.tsx` (+ `RecommendationPanel.test.tsx`) | Journal + recommendation UI |
| `src/pages/LaunchPage.tsx`, `src/pages/AppPage.tsx` | Routes |
| `src/mock/bundle.ts` | Offline synthetic journal (genome + paroxetine) |
| `src/App.tsx`, `src/main.tsx`, `src/styles.css` | Entry + routing + styling |
| `docker-compose.yml` | OpenEMR + MariaDB |
| `scripts/seed/seed.sh` | Seed mock profile via FHIR |
| `OPENEMR.md` | OpenEMR setup + registration + seeding runbook |
| `public/_redirects`, `README.md` | Deploy fallback + project readme |

---

## Task 1: Scaffold the Vite React TS app with Vitest

**Files:** Create `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`, `src/smoke.test.ts`, `.env.example`

- [ ] **Step 1: Scaffold** — run from repo root (`/Users/erikfornlund/code/attune`):

```bash
npm create vite@latest . -- --template react-ts
```

If prompted that the directory is not empty, choose "Ignore files and continue" (must NOT delete `docs/`, `.git/`, `.gitignore`).

- [ ] **Step 2: Install dependencies**

```bash
npm install fhirclient react-router-dom
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.ts" },
});
```

- [ ] **Step 4: Create `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Add scripts to `package.json`** (inside `"scripts"`):

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Create `.env.example`**

```
# Attune app OAuth2 client id issued by OpenEMR registration (see OPENEMR.md)
VITE_ATTUNE_CLIENT_ID=attune
# OpenEMR FHIR base URL (standalone launch). Leave blank to use the launcher.
VITE_FHIR_ISS=https://localhost:9300/apis/default/fhir
```

- [ ] **Step 7: Write `src/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 8: Run** — `npm test` → PASS (1 test). Then `npm run dev` boots without errors; stop with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Scaffold Vite React TS app with Vitest"
```

---

## Task 2: Domain types

**Files:** Create `src/domain/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type Phenotype = "UM" | "NM" | "IM" | "PM";
export type Gene = "CYP2C19" | "CYP2D6";

export interface Patient { id: string; name: string; age: number | null; sex: string | null; }
export interface Medication { name: string; display: string; }
export interface Condition { code: string | null; display: string; }
export interface LabObservation { code: string | null; display: string; value: string | null; }
export interface GenomePhenotype { gene: Gene; phenotype: Phenotype; source: string; }
export interface ClinicalDocument { title: string; date: string | null; }
export interface Allergy { display: string; }

export interface Journal {
  patient: Patient;
  medications: Medication[];
  conditions: Condition[];
  observations: LabObservation[];
  genome: GenomePhenotype[];
  documents: ClinicalDocument[];
  allergies: Allergy[];
}

export type RecommendationLevel = "preferred" | "caution" | "avoid" | "info";
export interface RecommendationLine { text: string; level: RecommendationLevel; source: string; }
export interface Recommendation { candidate: string; lines: RecommendationLine[]; }
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts && git commit -m "Add domain types incl. journal and genome models"
```

---

## Task 3: Recommendation engine (mocked, TDD)

**Files:** Create `src/recommendation/engine.ts`, `src/recommendation/engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { recommend } from "./engine";
import type { Medication } from "../domain/types";

const patient = { id: "p1", name: "Test", age: 40, sex: "female" };
const med = (name: string): Medication => ({ name, display: name });

describe("recommend", () => {
  it("flags dose reduction for CYP2C19 poor metabolizer", () => {
    const r = recommend({ patient, medications: [], conditions: [], phenotype: "PM" });
    expect(r.lines.some((l) => /reduce starting dose/i.test(l.text))).toBe(true);
    expect(r.lines.every((l) => l.source.length > 0)).toBe(true);
  });
  it("flags underexposure for CYP2C19 ultrarapid metabolizer", () => {
    const r = recommend({ patient, medications: [], conditions: [], phenotype: "UM" });
    expect(r.lines.some((l) => /underexpose/i.test(l.text))).toBe(true);
  });
  it("fires phenoconversion when a strong CYP2D6 inhibitor is present, even at NM", () => {
    const r = recommend({ patient, medications: [med("paroxetine")], conditions: [], phenotype: "NM" });
    expect(r.lines.some((l) => /effective cyp2d6 poor metabolizer/i.test(l.text))).toBe(true);
  });
  it("does NOT fire phenoconversion without an inhibitor", () => {
    const r = recommend({ patient, medications: [], conditions: [], phenotype: "NM" });
    expect(r.lines.some((l) => /effective cyp2d6 poor metabolizer/i.test(l.text))).toBe(false);
  });
  it("flags a serotonergic combination", () => {
    const r = recommend({ patient, medications: [med("tramadol")], conditions: [], phenotype: "NM" });
    expect(r.lines.some((l) => /serotonin syndrome/i.test(l.text))).toBe(true);
  });
  it("defaults candidate to escitalopram", () => {
    expect(recommend({ patient, medications: [], conditions: [], phenotype: "NM" }).candidate).toBe("escitalopram");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- src/recommendation/engine.test.ts` → FAIL ("Cannot find module './engine'").

- [ ] **Step 3: Implement `src/recommendation/engine.ts`**

```ts
import type {
  Condition, Medication, Patient, Phenotype, Recommendation, RecommendationLine,
} from "../domain/types";

const CYP2D6_STRONG_INHIBITORS = ["paroxetine", "fluoxetine", "bupropion", "quinidine"];
const SEROTONERGIC = ["tramadol", "sumatriptan", "sertraline", "venlafaxine", "duloxetine", "phenelzine"];

export interface RecommendInput {
  patient: Patient;
  medications: Medication[];
  conditions: Condition[];
  phenotype: Phenotype; // resolved CYP2C19 phenotype for the candidate
  candidate?: string;
}

export function recommend(input: RecommendInput): Recommendation {
  const candidate = input.candidate ?? "escitalopram";
  const lines: RecommendationLine[] = [];
  const medNames = input.medications.map((m) => m.name);

  // Mocked gene->drug table: CYP2C19 dosing for the candidate
  if (input.phenotype === "PM") {
    lines.push({ level: "caution", source: "CPIC/DPWG 2023",
      text: "Reduce starting dose or consider an alternative. CYP2C19 poor metabolizer, roughly 2 to 3x higher escitalopram exposure." });
  } else if (input.phenotype === "UM") {
    lines.push({ level: "caution", source: "CPIC/DPWG 2023",
      text: "Standard dose may underexpose; monitor response and consider an alternative. CYP2C19 ultrarapid metabolizer." });
  } else if (input.phenotype === "IM") {
    lines.push({ level: "info", source: "DPWG 2023",
      text: "Intermediate metabolizer. Standard dose reasonable; monitor for early side effects." });
  } else {
    lines.push({ level: "info", source: "CPIC 2023",
      text: "Standard starting dose reasonable for a CYP2C19 normal metabolizer." });
  }

  // Phenoconversion (real check, hero moment)
  const inhibitor = CYP2D6_STRONG_INHIBITORS.find((d) => medNames.includes(d));
  if (inhibitor) {
    lines.push({ level: "caution", source: "CPIC 2023",
      text: `Effective CYP2D6 poor metabolizer due to an interacting drug (${inhibitor}, strong inhibitor present). Genotype alone would miss this.` });
  }

  // Serotonergic combination
  const serotonergic = SEROTONERGIC.find((d) => medNames.includes(d));
  if (serotonergic) {
    lines.push({ level: "caution", source: "FASS",
      text: `Serotonergic combination caution. Patient already on ${serotonergic}; monitor for serotonin syndrome when adding an SSRI.` });
  }

  return { candidate, lines };
}
```

- [ ] **Step 4: Run** — `npm test -- src/recommendation/engine.test.ts` → PASS (6).

- [ ] **Step 5: Commit**

```bash
git add src/recommendation && git commit -m "Add mocked recommendation engine with phenoconversion"
```

---

## Task 4: FHIR mappers + genome extraction (TDD)

**Files:** Create `src/fhir/mappers.ts`, `src/fhir/mappers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  mapPatient, mapMedication, mapCondition, mapObservation, mapDocument, mapAllergy,
  normalizeDrug, extractGenomePhenotypes,
} from "./mappers";

describe("mappers", () => {
  it("maps a Patient with name/sex and a positive age", () => {
    const p = mapPatient({ id: "p1", gender: "female", birthDate: "1980-01-01", name: [{ given: ["Anna"], family: "Andersson" }] });
    expect(p.name).toBe("Anna Andersson");
    expect(p.sex).toBe("female");
    expect(p.age as number).toBeGreaterThan(0);
  });
  it("falls back when Patient fields are missing", () => {
    const p = mapPatient({ id: "p2" });
    expect(p.name).toBe("Unknown");
    expect(p.age).toBeNull();
  });
  it("normalizes a medication display to lowercase generic", () => {
    expect(normalizeDrug("Paroxetine 20 MG Oral Tablet")).toBe("paroxetine");
  });
  it("maps a MedicationRequest", () => {
    const m = mapMedication({ medicationCodeableConcept: { text: "Paroxetine 20 MG Oral Tablet" } });
    expect(m.name).toBe("paroxetine");
  });
  it("maps a Condition", () => {
    const c = mapCondition({ code: { text: "Major depressive disorder", coding: [{ code: "370143000" }] } });
    expect(c.code).toBe("370143000");
  });
  it("maps an Observation with a value", () => {
    const o = mapObservation({ code: { text: "Sodium" }, valueQuantity: { value: 140, unit: "mmol/L" } });
    expect(o.display).toBe("Sodium");
    expect(o.value).toContain("140");
  });
  it("maps a DocumentReference title and an AllergyIntolerance", () => {
    expect(mapDocument({ type: { text: "Discharge summary" } }).title).toBe("Discharge summary");
    expect(mapAllergy({ code: { text: "Penicillin" } }).display).toBe("Penicillin");
  });
  it("extracts a CYP2C19 phenotype from a genome Observation", () => {
    const g = extractGenomePhenotypes([
      { code: { text: "CYP2C19 gene phenotype" }, valueCodeableConcept: { text: "Poor metabolizer" } },
      { code: { text: "Sodium" }, valueQuantity: { value: 140 } },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].gene).toBe("CYP2C19");
    expect(g[0].phenotype).toBe("PM");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- src/fhir/mappers.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/fhir/mappers.ts`**

```ts
import type {
  Patient, Medication, Condition, LabObservation, ClinicalDocument, Allergy,
  GenomePhenotype, Gene, Phenotype,
} from "../domain/types";

export function mapPatient(resource: any): Patient {
  const n = resource?.name?.[0];
  const name = n ? [ (n.given || []).join(" "), n.family ].filter(Boolean).join(" ").trim() || "Unknown" : "Unknown";
  return { id: resource?.id ?? "unknown", name, age: resource?.birthDate ? calcAge(resource.birthDate) : null, sex: resource?.gender ?? null };
}
function calcAge(b: string): number {
  const t = new Date(b).getTime();
  return Number.isNaN(t) ? 0 : Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
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
  return { code: cc?.coding?.[0]?.code ?? null, display: cc?.text || cc?.coding?.[0]?.display || "Unknown condition" };
}
export function mapObservation(resource: any): LabObservation {
  const cc = resource?.code;
  const display = cc?.text || cc?.coding?.[0]?.display || "Observation";
  const value =
    resource?.valueQuantity ? `${resource.valueQuantity.value} ${resource.valueQuantity.unit ?? ""}`.trim()
    : resource?.valueCodeableConcept?.text ?? resource?.valueString ?? null;
  return { code: cc?.coding?.[0]?.code ?? null, display, value };
}
export function mapDocument(resource: any): ClinicalDocument {
  return { title: resource?.type?.text || resource?.description || "Document", date: resource?.date ?? null };
}
export function mapAllergy(resource: any): Allergy {
  const cc = resource?.code;
  return { display: cc?.text || cc?.coding?.[0]?.display || "Allergy" };
}

function phenotypeFromText(text: string): Phenotype | null {
  const t = (text || "").toLowerCase();
  if (t.includes("ultrarapid")) return "UM";
  if (t.includes("poor")) return "PM";
  if (t.includes("intermediate")) return "IM";
  if (t.includes("normal") || t.includes("extensive")) return "NM";
  return null;
}
function geneFromText(text: string): Gene | null {
  const t = (text || "").toUpperCase();
  if (t.includes("CYP2C19")) return "CYP2C19";
  if (t.includes("CYP2D6")) return "CYP2D6";
  return null;
}
export function extractGenomePhenotypes(observations: any[]): GenomePhenotype[] {
  const out: GenomePhenotype[] = [];
  for (const o of observations || []) {
    const label = o?.code?.text || o?.code?.coding?.[0]?.display || "";
    const gene = geneFromText(label);
    if (!gene) continue;
    const valueText = o?.valueCodeableConcept?.text || o?.valueString || "";
    const phenotype = phenotypeFromText(valueText);
    if (!phenotype) continue;
    out.push({ gene, phenotype, source: "OpenEMR genome record" });
  }
  return out;
}
```

- [ ] **Step 4: Run** — `npm test -- src/fhir/mappers.test.ts` → PASS (8).

- [ ] **Step 5: Commit**

```bash
git add src/fhir/mappers.ts src/fhir/mappers.test.ts && git commit -m "Add FHIR mappers and genome phenotype extraction"
```

---

## Task 5: Full-journal read functions (TDD with a fake client)

**Files:** Create `src/fhir/client.ts`, `src/fhir/client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  getPatient, getActiveMedications, getConditions, getObservations,
  getDocuments, getAllergies, getGenomePhenotypes,
} from "./client";

const fakeClient = {
  patient: { id: "p1", read: async () => ({ id: "p1", gender: "male", birthDate: "1970-05-05", name: [{ given: ["Bo"], family: "Berg" }] }) },
  request: async (query: string) => {
    if (query.startsWith("MedicationRequest")) return [{ medicationCodeableConcept: { text: "Paroxetine 20 MG Oral Tablet" } }];
    if (query.startsWith("Condition")) return [{ code: { text: "Major depressive disorder" } }];
    if (query.startsWith("Observation")) return [
      { code: { text: "CYP2C19 gene phenotype" }, valueCodeableConcept: { text: "Normal metabolizer" } },
      { code: { text: "Sodium" }, valueQuantity: { value: 140, unit: "mmol/L" } },
    ];
    if (query.startsWith("DocumentReference")) return [{ type: { text: "Discharge summary" } }];
    if (query.startsWith("AllergyIntolerance")) return [{ code: { text: "Penicillin" } }];
    return [];
  },
};

describe("fhir client reads", () => {
  it("reads the patient", async () => expect((await getPatient(fakeClient as any)).name).toBe("Bo Berg"));
  it("reads active medications", async () => expect((await getActiveMedications(fakeClient as any))[0].name).toBe("paroxetine"));
  it("reads conditions", async () => expect((await getConditions(fakeClient as any))[0].display).toBe("Major depressive disorder"));
  it("reads observations", async () => expect((await getObservations(fakeClient as any)).length).toBe(2));
  it("reads documents", async () => expect((await getDocuments(fakeClient as any))[0].title).toBe("Discharge summary"));
  it("reads allergies", async () => expect((await getAllergies(fakeClient as any))[0].display).toBe("Penicillin"));
  it("extracts the genome phenotype", async () => {
    const g = await getGenomePhenotypes(fakeClient as any);
    expect(g[0].gene).toBe("CYP2C19");
    expect(g[0].phenotype).toBe("NM");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- src/fhir/client.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/fhir/client.ts`**

```ts
import type {
  Patient, Medication, Condition, LabObservation, ClinicalDocument, Allergy, GenomePhenotype,
} from "../domain/types";
import {
  mapPatient, mapMedication, mapCondition, mapObservation, mapDocument, mapAllergy, extractGenomePhenotypes,
} from "./mappers";

async function search(client: any, query: string): Promise<any[]> {
  const res = await client.request(query, { flat: true });
  return res || [];
}

export async function getPatient(client: any): Promise<Patient> {
  return mapPatient(await client.patient.read());
}
export async function getActiveMedications(client: any): Promise<Medication[]> {
  return (await search(client, `MedicationRequest?patient=${client.patient.id}&status=active`)).map(mapMedication);
}
export async function getConditions(client: any): Promise<Condition[]> {
  return (await search(client, `Condition?patient=${client.patient.id}`)).map(mapCondition);
}
async function rawObservations(client: any): Promise<any[]> {
  return search(client, `Observation?patient=${client.patient.id}`);
}
export async function getObservations(client: any): Promise<LabObservation[]> {
  return (await rawObservations(client)).map(mapObservation);
}
export async function getGenomePhenotypes(client: any): Promise<GenomePhenotype[]> {
  return extractGenomePhenotypes(await rawObservations(client));
}
export async function getDocuments(client: any): Promise<ClinicalDocument[]> {
  return (await search(client, `DocumentReference?patient=${client.patient.id}`)).map(mapDocument);
}
export async function getAllergies(client: any): Promise<Allergy[]> {
  return (await search(client, `AllergyIntolerance?patient=${client.patient.id}`)).map(mapAllergy);
}
```

- [ ] **Step 4: Run** — `npm test -- src/fhir/client.test.ts` → PASS (7).

- [ ] **Step 5: Commit**

```bash
git add src/fhir/client.ts src/fhir/client.test.ts && git commit -m "Add full-journal FHIR read functions"
```

---

## Task 6: SMART auth (PKCE + env config)

**Files:** Create `src/auth/smart.ts`

- [ ] **Step 1: Write the helpers**

```ts
import FHIR from "fhirclient";

const SCOPE =
  "launch openid fhirUser " +
  "patient/Patient.read patient/MedicationRequest.read patient/Condition.read " +
  "patient/Observation.read patient/DocumentReference.read patient/AllergyIntolerance.read";

export function launch(): void {
  const params = new URLSearchParams(window.location.search);
  const cfg: Record<string, unknown> = {
    clientId: import.meta.env.VITE_ATTUNE_CLIENT_ID || "attune",
    scope: SCOPE,
    redirectUri: window.location.origin + "/app",
    pkceMode: "required", // OpenEMR public clients require PKCE (S256)
  };
  // EHR launch provides iss+launch in the URL; standalone uses the configured iss.
  if (!params.get("iss") && import.meta.env.VITE_FHIR_ISS) {
    cfg.iss = import.meta.env.VITE_FHIR_ISS;
  }
  FHIR.oauth2.authorize(cfg);
}

export function ready() {
  return FHIR.oauth2.ready();
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → no errors (Vite supplies `import.meta.env` types via `src/vite-env.d.ts` from the scaffold).

- [ ] **Step 3: Commit**

```bash
git add src/auth/smart.ts && git commit -m "Add SMART launch with PKCE and env config"
```

---

## Task 7: UI components

**Files:** Create `src/ui/SourceTag.tsx`, `RecommendationPanel.tsx`, `MedicationList.tsx`, `PatientHeader.tsx`, `PhenotypeSelector.tsx`, `GenomeCard.tsx`, `ObservationList.tsx`, `DocumentList.tsx`, `AllergyList.tsx`, `RecommendationPanel.test.tsx`

- [ ] **Step 1: `src/ui/SourceTag.tsx`**

```tsx
export function SourceTag({ source }: { source: string }) {
  return <span className="source-tag">{source}</span>;
}
```

- [ ] **Step 2: `src/ui/RecommendationPanel.tsx`**

```tsx
import type { Recommendation } from "../domain/types";
import { SourceTag } from "./SourceTag";

export function RecommendationPanel({ recommendation }: { recommendation: Recommendation }) {
  return (
    <section className="panel">
      <h2>Starting antidepressant: {recommendation.candidate}</h2>
      <ul className="rec-lines">
        {recommendation.lines.map((line, i) => (
          <li key={i} className={`rec-line level-${line.level}`}>
            <span className="rec-text">{line.text}</span>
            <SourceTag source={line.source} />
          </li>
        ))}
      </ul>
      <p className="disclaimer">Decision support only. The clinician decides.</p>
    </section>
  );
}
```

- [ ] **Step 3: `src/ui/MedicationList.tsx`**

```tsx
import type { Medication } from "../domain/types";

export function MedicationList({ medications }: { medications: Medication[] }) {
  return (
    <section className="med-list">
      <h3>Active medications (live from FHIR)</h3>
      {medications.length === 0 ? <p className="muted">None found.</p> : (
        <ul>{medications.map((m, i) => <li key={i}>{m.display}</li>)}</ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: `src/ui/PatientHeader.tsx`**

```tsx
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
```

- [ ] **Step 5: `src/ui/PhenotypeSelector.tsx`**

```tsx
import type { Phenotype } from "../domain/types";

const OPTIONS: { value: Phenotype; label: string }[] = [
  { value: "UM", label: "Ultrarapid (UM)" },
  { value: "NM", label: "Normal (NM)" },
  { value: "IM", label: "Intermediate (IM)" },
  { value: "PM", label: "Poor (PM)" },
];

export function PhenotypeSelector({ value, onChange }: { value: Phenotype; onChange: (p: Phenotype) => void }) {
  return (
    <label className="phenotype-selector">
      CYP2C19 phenotype (entered / override)
      <select value={value} onChange={(e) => onChange(e.target.value as Phenotype)}>
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
```

- [ ] **Step 6: `src/ui/GenomeCard.tsx`**

```tsx
import type { GenomePhenotype } from "../domain/types";
import { SourceTag } from "./SourceTag";

export function GenomeCard({ genome }: { genome: GenomePhenotype[] }) {
  return (
    <section className="genome-card">
      <h3>Genome (extracted from journal)</h3>
      {genome.length === 0 ? <p className="muted">No genome record in journal.</p> : (
        <ul>
          {genome.map((g, i) => (
            <li key={i}>{g.gene}: <strong>{g.phenotype}</strong> <SourceTag source={g.source} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 7: `src/ui/ObservationList.tsx`**

```tsx
import type { LabObservation } from "../domain/types";

export function ObservationList({ observations }: { observations: LabObservation[] }) {
  if (observations.length === 0) return null;
  return (
    <section className="obs-list">
      <h3>Labs / observations</h3>
      <ul>{observations.map((o, i) => <li key={i}>{o.display}{o.value ? `: ${o.value}` : ""}</li>)}</ul>
    </section>
  );
}
```

- [ ] **Step 8: `src/ui/DocumentList.tsx`**

```tsx
import type { ClinicalDocument } from "../domain/types";

export function DocumentList({ documents }: { documents: ClinicalDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <section className="doc-list">
      <h3>Documents</h3>
      <ul>{documents.map((d, i) => <li key={i}>{d.title}{d.date ? ` (${d.date})` : ""}</li>)}</ul>
    </section>
  );
}
```

- [ ] **Step 9: `src/ui/AllergyList.tsx`**

```tsx
import type { Allergy } from "../domain/types";

export function AllergyList({ allergies }: { allergies: Allergy[] }) {
  if (allergies.length === 0) return null;
  return (
    <section className="allergy-list">
      <h3>Allergies</h3>
      <ul>{allergies.map((a, i) => <li key={i}>{a.display}</li>)}</ul>
    </section>
  );
}
```

- [ ] **Step 10: `src/ui/RecommendationPanel.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecommendationPanel } from "./RecommendationPanel";
import { PhenotypeSelector } from "./PhenotypeSelector";
import { GenomeCard } from "./GenomeCard";
import type { Recommendation } from "../domain/types";

describe("RecommendationPanel", () => {
  it("renders each line with its source", () => {
    const rec: Recommendation = { candidate: "escitalopram", lines: [{ text: "Reduce starting dose.", level: "caution", source: "CPIC/DPWG 2023" }] };
    render(<RecommendationPanel recommendation={rec} />);
    expect(screen.getByText("Reduce starting dose.")).toBeInTheDocument();
    expect(screen.getByText("CPIC/DPWG 2023")).toBeInTheDocument();
  });
});

describe("GenomeCard", () => {
  it("shows the extracted phenotype with its source", () => {
    render(<GenomeCard genome={[{ gene: "CYP2C19", phenotype: "NM", source: "OpenEMR genome record" }]} />);
    expect(screen.getByText(/CYP2C19/)).toBeInTheDocument();
    expect(screen.getByText("OpenEMR genome record")).toBeInTheDocument();
  });
});

describe("PhenotypeSelector", () => {
  it("calls onChange with the selected phenotype", () => {
    const onChange = vi.fn();
    render(<PhenotypeSelector value="NM" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "PM" } });
    expect(onChange).toHaveBeenCalledWith("PM");
  });
});
```

- [ ] **Step 11: Run** — `npm test -- src/ui/RecommendationPanel.test.tsx` → PASS (3).

- [ ] **Step 12: Commit**

```bash
git add src/ui && git commit -m "Add journal + recommendation UI components"
```

---

## Task 8: Routing, pages, mock fallback, and live wiring (integration)

**Files:** Create `src/mock/bundle.ts`, `src/pages/LaunchPage.tsx`, `src/pages/AppPage.tsx`, `src/App.tsx`, `src/styles.css`; Modify `src/main.tsx`

- [ ] **Step 1: `src/mock/bundle.ts`** (offline journal: genome + paroxetine so the hero fires)

```ts
export function makeMockClient() {
  return {
    patient: {
      id: "mock-1",
      read: async () => ({ id: "mock-1", gender: "female", birthDate: "1979-03-14", name: [{ given: ["Synthetic"], family: "Testsson" }] }),
    },
    request: async (query: string) => {
      if (query.startsWith("MedicationRequest")) return [
        { medicationCodeableConcept: { text: "Paroxetine 20 MG Oral Tablet" } },
        { medicationCodeableConcept: { text: "Omeprazole 20 MG Oral Capsule" } },
      ];
      if (query.startsWith("Condition")) return [{ code: { text: "Major depressive disorder" } }];
      if (query.startsWith("Observation")) return [
        { code: { text: "CYP2C19 gene phenotype" }, valueCodeableConcept: { text: "Normal metabolizer" } },
        { code: { text: "Sodium" }, valueQuantity: { value: 140, unit: "mmol/L" } },
      ];
      if (query.startsWith("DocumentReference")) return [{ type: { text: "Referral note" }, date: "2026-02-10" }];
      if (query.startsWith("AllergyIntolerance")) return [];
      return [];
    },
  };
}
```

- [ ] **Step 2: `src/pages/LaunchPage.tsx`**

```tsx
import { useEffect } from "react";
import { launch } from "../auth/smart";

export function LaunchPage() {
  useEffect(() => { launch(); }, []);
  return <p>Starting SMART launch...</p>;
}
```

- [ ] **Step 3: `src/pages/AppPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ready } from "../auth/smart";
import {
  getPatient, getActiveMedications, getConditions, getObservations,
  getDocuments, getAllergies, getGenomePhenotypes,
} from "../fhir/client";
import { recommend } from "../recommendation/engine";
import { makeMockClient } from "../mock/bundle";
import type { Journal, Phenotype } from "../domain/types";
import { PatientHeader } from "../ui/PatientHeader";
import { MedicationList } from "../ui/MedicationList";
import { GenomeCard } from "../ui/GenomeCard";
import { ObservationList } from "../ui/ObservationList";
import { DocumentList } from "../ui/DocumentList";
import { AllergyList } from "../ui/AllergyList";
import { PhenotypeSelector } from "../ui/PhenotypeSelector";
import { RecommendationPanel } from "../ui/RecommendationPanel";

export function AppPage() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [override, setOverride] = useState<Phenotype | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const useMock = new URLSearchParams(window.location.search).has("mock");
    const clientPromise = useMock ? Promise.resolve(makeMockClient()) : ready();
    clientPromise
      .then(async (client: any) => {
        const [patient, medications, conditions, observations, documents, allergies, genome] = await Promise.all([
          getPatient(client), getActiveMedications(client), getConditions(client),
          getObservations(client), getDocuments(client), getAllergies(client), getGenomePhenotypes(client),
        ]);
        setJournal({ patient, medications, conditions, observations, documents, allergies, genome });
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <main className="app"><p className="error">Launch failed: {error}. Try ?mock=1 for an offline demo.</p></main>;
  if (!journal) return <main className="app"><p>Loading journal...</p></main>;

  const extracted = journal.genome.find((g) => g.gene === "CYP2C19")?.phenotype ?? null;
  const phenotype: Phenotype = override ?? extracted ?? "NM";
  const recommendation = recommend({ patient: journal.patient, medications: journal.medications, conditions: journal.conditions, phenotype });

  return (
    <main className="app">
      <PatientHeader patient={journal.patient} />
      <MedicationList medications={journal.medications} />
      <GenomeCard genome={journal.genome} />
      <ObservationList observations={journal.observations} />
      <DocumentList documents={journal.documents} />
      <AllergyList allergies={journal.allergies} />
      <PhenotypeSelector value={phenotype} onChange={setOverride} />
      <RecommendationPanel recommendation={recommendation} />
    </main>
  );
}
```

- [ ] **Step 4: `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LaunchPage } from "./pages/LaunchPage";
import { AppPage } from "./pages/AppPage";
import "./styles.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="*" element={<Navigate to="/app?mock=1" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Replace `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

- [ ] **Step 6: `src/styles.css`**

```css
:root { font-family: system-ui, sans-serif; color: #1a2330; }
.app { max-width: 600px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.patient-header { display: flex; gap: 12px; align-items: baseline; border-bottom: 1px solid #dde3ea; padding-bottom: 8px; }
.patient-header strong { font-size: 1.1rem; }
h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #5a6675; margin: 0 0 4px; }
ul { margin: 0; padding-left: 18px; }
.muted { color: #8a94a3; }
.genome-card { background: #f2f7f4; border: 1px solid #cfe3d8; border-radius: 8px; padding: 10px; }
.phenotype-selector { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
.phenotype-selector select { padding: 6px; max-width: 240px; }
.panel { border: 1px solid #dde3ea; border-radius: 8px; padding: 12px; background: #f7f9fb; }
.panel h2 { font-size: 1rem; margin: 0 0 8px; }
.rec-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rec-line { display: flex; justify-content: space-between; gap: 8px; padding: 8px; border-radius: 6px; background: #fff; border-left: 3px solid #b8c2cf; }
.rec-line.level-caution { border-left-color: #e0a106; }
.rec-line.level-avoid { border-left-color: #d64545; }
.rec-line.level-preferred { border-left-color: #2e9e6b; }
.rec-line.level-info { border-left-color: #4a78c2; }
.source-tag { font-size: 0.72rem; color: #5a6675; background: #eef2f6; border-radius: 4px; padding: 2px 6px; white-space: nowrap; align-self: flex-start; }
.disclaimer { font-size: 0.75rem; color: #8a94a3; margin: 10px 0 0; }
.error { color: #d64545; }
```

- [ ] **Step 7: Verify suite + types** — `npm test && npx tsc --noEmit` → all PASS, no type errors.

- [ ] **Step 8: Verify offline demo** — `npm run dev`, open `http://localhost:5173/app?mock=1`. Expected: patient header; medications show Paroxetine + Omeprazole; genome card shows `CYP2C19: NM (OpenEMR genome record)`; recommendation panel shows the phenoconversion line (paroxetine) at NM; switching the dropdown to PM adds the dose-reduction line. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Wire routing, full-journal fetch, genome extraction, live override, mock"
```

---

## Task 9: Stand up OpenEMR + seed the mock profile

**Files:** Create `docker-compose.yml`, `scripts/seed/seed.sh`, `OPENEMR.md`

> This task is infrastructure; it does not change `src/`. It can run in parallel
> with Tasks 3–7. Version-dependent UI labels are flagged; verify against the
> running instance.

- [ ] **Step 1: `docker-compose.yml`**

```yaml
services:
  mysql:
    image: mariadb:11.4
    command: ["mysqld", "--character-set-server=utf8mb4"]
    environment:
      MYSQL_ROOT_PASSWORD: root
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 30
    volumes:
      - mysql-data:/var/lib/mysql
  openemr:
    image: openemr/openemr:7.0.3
    ports:
      - "9300:443"
    environment:
      MYSQL_HOST: mysql
      MYSQL_ROOT_PASS: root
      MYSQL_USER: openemr
      MYSQL_PASS: openemr
      OE_USER: admin
      OE_PASS: pass
    depends_on:
      mysql:
        condition: service_healthy
    volumes:
      - openemr-sites:/var/www/localhost/htdocs/openemr/sites
volumes:
  mysql-data:
  openemr-sites:
```

- [ ] **Step 2: Start OpenEMR**

```bash
docker compose up -d
```

First boot runs the installer and can take several minutes. Watch:
`docker compose logs -f openemr` until it prints that OpenEMR is ready, then
open `https://localhost:9300` and accept the self-signed certificate. Log in
with `admin` / `pass`.

- [ ] **Step 3: Enable the API (UI)**

In OpenEMR: **Administration → Globals → Connectors**. Set **Site Address Base**
to `https://localhost:9300`. Enable the FHIR REST API toggle ("Enable OpenEMR
Standard FHIR Service" / "...FHIR REST API") and save. (Exact label varies by
version — enable the FHIR service and, for seeding, the OAuth2 password grant.)

- [ ] **Step 4: Register the public app client (PKCE) for Attune**

```bash
curl -ks -X POST https://localhost:9300/oauth2/default/registration \
  -H 'Content-Type: application/json' --data '{
    "application_type": "public",
    "client_name": "Attune",
    "token_endpoint_auth_method": "none",
    "redirect_uris": ["http://localhost:5173/app"],
    "launch_uris": ["http://localhost:5173/launch"],
    "scope": "launch openid fhirUser patient/Patient.read patient/MedicationRequest.read patient/Condition.read patient/Observation.read patient/DocumentReference.read patient/AllergyIntolerance.read"
  }'
```

Copy the returned `client_id`. Then **approve** the client at
**Administration → System → API Clients** (enable it).

- [ ] **Step 5: Point Attune at OpenEMR**

```bash
cp .env.example .env
```

Edit `.env`: set `VITE_ATTUNE_CLIENT_ID=<client_id from Step 4>` and
`VITE_FHIR_ISS=https://localhost:9300/apis/default/fhir`.

- [ ] **Step 6: `scripts/seed/seed.sh`** (seeds the mock profile via FHIR)

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="${OPENEMR_BASE:-https://localhost:9300}"
FHIR="$BASE/apis/default/fhir"
OAUTH="$BASE/oauth2/default"
USER="${OE_USER:-admin}"; PASS="${OE_PASS:-pass}"
C() { curl -ks "$@"; }
J() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo ">> Registering confidential seed client"
REG=$(C -X POST "$OAUTH/registration" -H 'Content-Type: application/json' --data '{
  "application_type": "private",
  "client_name": "Attune Seeder",
  "token_endpoint_auth_method": "client_secret_post",
  "redirect_uris": ["http://localhost:5173/app"],
  "scope": "openid offline_access api:fhir user/Patient.write user/Condition.write user/MedicationRequest.write user/Observation.write"
}')
CID=$(echo "$REG" | J "['client_id']"); CSEC=$(echo "$REG" | J "['client_secret']")
echo ">> Approve 'Attune Seeder' in Admin > System > API Clients, then press Enter"; read -r _

echo ">> Getting token (password grant)"
TOKEN=$(C -X POST "$OAUTH/token" \
  -d grant_type=password -d client_id="$CID" -d client_secret="$CSEC" \
  -d scope="openid offline_access api:fhir user/Patient.write user/Condition.write user/MedicationRequest.write user/Observation.write" \
  -d user_role=users -d username="$USER" -d password="$PASS" | J "['access_token']")
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/fhir+json" -H "Accept: application/fhir+json")

echo ">> Creating patient"
PID=$(C -X POST "$FHIR/Patient" "${AUTH[@]}" --data '{"resourceType":"Patient","name":[{"family":"Testsson","given":["Synthetic"]}],"gender":"female","birthDate":"1979-03-14"}' | J "['id']")
echo "patient=$PID"

echo ">> Condition"
C -X POST "$FHIR/Condition" "${AUTH[@]}" --data "{\"resourceType\":\"Condition\",\"subject\":{\"reference\":\"Patient/$PID\"},\"code\":{\"text\":\"Major depressive disorder\"}}" >/dev/null

echo ">> Active medication: paroxetine (hero case)"
C -X POST "$FHIR/MedicationRequest" "${AUTH[@]}" --data "{\"resourceType\":\"MedicationRequest\",\"status\":\"active\",\"intent\":\"order\",\"subject\":{\"reference\":\"Patient/$PID\"},\"medicationCodeableConcept\":{\"text\":\"Paroxetine 20 MG Oral Tablet\"}}" >/dev/null

echo ">> Genome Observation: CYP2C19 phenotype"
C -X POST "$FHIR/Observation" "${AUTH[@]}" --data "{\"resourceType\":\"Observation\",\"status\":\"final\",\"subject\":{\"reference\":\"Patient/$PID\"},\"code\":{\"text\":\"CYP2C19 gene phenotype\"},\"valueCodeableConcept\":{\"text\":\"Normal metabolizer\"}}" >/dev/null

echo "Seed complete for patient $PID"
```

Make it executable: `chmod +x scripts/seed/seed.sh`. Run: `./scripts/seed/seed.sh`.

> If a given FHIR `POST` is rejected by your OpenEMR version (write support
> varies per resource), create that resource in the OpenEMR UI instead. The
> genome can alternatively be entered as a lab/procedure result or a
> `DocumentReference` — the extractor only needs a code naming CYP2C19/CYP2D6 and
> a value text containing the phenotype word.

- [ ] **Step 7: `OPENEMR.md`** — write the runbook capturing Steps 1–6 (compose up, accept cert, enable Connectors + Site Address, register the public app client + approve, fill `.env`, run the seed script, UI-seeding fallbacks) plus a "Launch Attune" section: standalone via `http://localhost:5173/launch`, or EHR launch from inside OpenEMR's API Clients / app menu.

- [ ] **Step 8: Verify the live integration** — `npm run dev`, open
`http://localhost:5173/launch`. Expected: redirect to OpenEMR login/consent
(PKCE), then back to `/app` showing the seeded patient, Paroxetine in the med
list, and `CYP2C19: NM` in the genome card. If the network/cert misbehaves, fall
back to `?mock=1`.

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml scripts/seed/seed.sh OPENEMR.md && git commit -m "Add OpenEMR Docker stack, seed script, and integration runbook"
```

---

## Task 10: Deploy config + project README

**Files:** Create `public/_redirects`, `README.md`

- [ ] **Step 1: `public/_redirects`** (SPA history fallback for Netlify)

```
/*  /index.html  200
```

- [ ] **Step 2: `README.md`** — write the top-level readme: one-paragraph product
description; "Run locally" (`npm install`, `npm run dev`, offline demo at
`/app?mock=1`, `npm test`); "OpenEMR integration → see `OPENEMR.md`"; "Dev rig:
point `launch.smarthealthit.org`'s App Launch URL at `http://localhost:5173/launch`";
the fallback ladder (spec §6); and a link to the spec and plan under
`docs/superpowers/`.

- [ ] **Step 3: Commit**

```bash
git add public/_redirects README.md && git commit -m "Add deploy fallback and project README"
```

---

## Self-Review Notes

- **Spec coverage:** §1 OpenEMR-first integration → Tasks 6, 9. §2 PKCE/public
  client → Task 6; two-client model → Task 9. §3 targets (OpenEMR / launcher /
  `?mock=1`) → Tasks 6, 8, 9. §4 components: `auth/` T6, `fhir/` T4–5 (+ genome
  extraction), `recommendation/` T3, `ui/` T7, `mock/` T8, OpenEMR env T9. §5
  data flow (extract genome → resolve phenotype → recommend, dropdown override) →
  Task 8. §6 error handling → Task 8 (error + `?mock=1`); cert/CORS in T9/README.
  §7 testing → T3–5, 7. §9 demo script → OPENEMR.md/README. §10 risks → T9 notes.
- **Placeholder scan:** code steps are complete. Tasks 7-step-10, 9-step-7, and
  10-step-2 specify document/runbook contents by required sections rather than
  full prose — acceptable for narrative docs, not code.
- **Type consistency:** `Journal`, `GenomePhenotype { gene, phenotype, source }`,
  `Phenotype`, `RecommendInput { patient, medications, conditions, phenotype }`,
  read-function names (`getPatient`, `getActiveMedications`, `getConditions`,
  `getObservations`, `getDocuments`, `getAllergies`, `getGenomePhenotypes`), and
  mapper names are consistent across Tasks 2, 4, 5, 7, 8. `extractGenomePhenotypes`
  used identically in Tasks 4 and 5.
