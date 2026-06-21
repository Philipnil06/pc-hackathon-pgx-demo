# Attune SMART on FHIR Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SMART on FHIR React SPA that launches inside a simulated EHR, reads the live patient + medication list via FHIR R4, and renders a sourced antidepressant recommendation whose logic is mocked (scripted lines plus one real phenoconversion check).

**Architecture:** Pure browser SPA. `fhirclient` performs the SMART App Launch OAuth2 dance and returns a client bound to the launching EHR's FHIR endpoint. Typed FHIR mappers feed a pure `recommend()` function; React renders the panel and re-runs `recommend()` live when the phenotype dropdown changes. No backend (a Node proxy is a documented fallback only). Dev target: `launch.smarthealthit.org`. Demo target: self-hosted OpenEMR.

**Tech Stack:** React + Vite + TypeScript, `fhirclient`, `react-router-dom`, Vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-06-21-attune-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json` | Scaffold + Vitest config |
| `src/test/setup.ts` | Test setup (jest-dom matchers) |
| `src/domain/types.ts` | Shared domain models (Patient, Medication, Condition, Phenotype, Recommendation) |
| `src/recommendation/engine.ts` | Mocked recommendation engine — pure function |
| `src/recommendation/engine.test.ts` | Engine unit tests (hero cases) |
| `src/fhir/mappers.ts` | FHIR resource → typed model mappers |
| `src/fhir/mappers.test.ts` | Mapper unit tests |
| `src/fhir/client.ts` | Read functions over a ready fhirclient |
| `src/fhir/client.test.ts` | Read-function tests with a fake client |
| `src/auth/smart.ts` | SMART launch + ready helpers |
| `src/ui/SourceTag.tsx` | Per-line source chip |
| `src/ui/RecommendationPanel.tsx` | Renders recommendation lines |
| `src/ui/MedicationList.tsx` | Live active medication list |
| `src/ui/PatientHeader.tsx` | Patient name/age/sex |
| `src/ui/PhenotypeSelector.tsx` | UM/NM/IM/PM dropdown |
| `src/ui/RecommendationPanel.test.tsx` | Panel + selector component tests |
| `src/pages/LaunchPage.tsx` | `/launch` route — kicks off OAuth2 |
| `src/pages/AppPage.tsx` | `/app` route — completes auth, fetches, renders |
| `src/mock/bundle.ts` | Synthetic FHIR Bundle + fake client (offline fallback) |
| `src/main.tsx`, `src/App.tsx`, `src/styles.css` | Entry + routing + styling |
| `public/_redirects` | SPA history fallback for deploy |
| `README.md` | Demo runbook (launcher + OpenEMR) |

---

## Task 1: Scaffold the Vite React TS app with Vitest

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`, `src/smoke.test.ts`

- [ ] **Step 1: Scaffold the app**

Run from the repo root (`/Users/erikfornlund/code/attune`):

```bash
npm create vite@latest . -- --template react-ts
```

If prompted that the directory is not empty, choose "Ignore files and continue" (it must NOT delete `docs/`, `.git/`, `.gitignore`).

- [ ] **Step 2: Install dependencies**

```bash
npm install fhirclient react-router-dom
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

Replace the file with (import `defineConfig` from `vitest/config`, not `vite` — the
triple-slash reference does not type the `test` block under `tsc -b`, which breaks
`npm run build`):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
```

- [ ] **Step 4: Create the test setup file `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Add test scripts to `package.json`**

In the `"scripts"` block add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write a smoke test `src/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test runner", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run the smoke test**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run dev` then stop it with Ctrl-C.
Expected: Vite prints a `http://localhost:5173` URL with no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Scaffold Vite React TS app with Vitest"
```

---

## Task 2: Define domain types

**Files:**
- Create: `src/domain/types.ts`

- [ ] **Step 1: Write the types**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "Add domain types"
```

---

## Task 3: Recommendation engine (mocked, TDD)

**Files:**
- Create: `src/recommendation/engine.ts`
- Test: `src/recommendation/engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { recommend } from "./engine";
import type { Medication } from "../domain/types";

const patient = { id: "p1", name: "Test", age: 40, sex: "female" };
const noMeds: Medication[] = [];
const med = (name: string): Medication => ({ name, display: name });

describe("recommend", () => {
  it("flags dose reduction for CYP2C19 poor metabolizer", () => {
    const rec = recommend({ patient, medications: noMeds, conditions: [], phenotype: "PM" });
    expect(rec.lines.some((l) => /reduce starting dose/i.test(l.text))).toBe(true);
    expect(rec.lines.every((l) => l.source.length > 0)).toBe(true);
  });

  it("flags underexposure for CYP2C19 ultrarapid metabolizer", () => {
    const rec = recommend({ patient, medications: noMeds, conditions: [], phenotype: "UM" });
    expect(rec.lines.some((l) => /underexpose/i.test(l.text))).toBe(true);
  });

  it("fires phenoconversion line when a strong CYP2D6 inhibitor is present, even with NM", () => {
    const rec = recommend({ patient, medications: [med("paroxetine")], conditions: [], phenotype: "NM" });
    expect(rec.lines.some((l) => /effective cyp2d6 poor metabolizer/i.test(l.text))).toBe(true);
  });

  it("does NOT fire phenoconversion when no inhibitor is present", () => {
    const rec = recommend({ patient, medications: noMeds, conditions: [], phenotype: "NM" });
    expect(rec.lines.some((l) => /effective cyp2d6 poor metabolizer/i.test(l.text))).toBe(false);
  });

  it("flags a serotonergic combination", () => {
    const rec = recommend({ patient, medications: [med("tramadol")], conditions: [], phenotype: "NM" });
    expect(rec.lines.some((l) => /serotonin syndrome/i.test(l.text))).toBe(true);
  });

  it("defaults the candidate to escitalopram", () => {
    const rec = recommend({ patient, medications: noMeds, conditions: [], phenotype: "NM" });
    expect(rec.candidate).toBe("escitalopram");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/recommendation/engine.test.ts`
Expected: FAIL with "Cannot find module './engine'" or "recommend is not a function".

- [ ] **Step 3: Implement the engine**

```ts
import type {
  Condition,
  Medication,
  Patient,
  Phenotype,
  Recommendation,
  RecommendationLine,
} from "../domain/types";

const CYP2D6_STRONG_INHIBITORS = ["paroxetine", "fluoxetine", "bupropion", "quinidine"];
const SEROTONERGIC = ["tramadol", "sumatriptan", "sertraline", "venlafaxine", "duloxetine", "phenelzine"];

export interface RecommendInput {
  patient: Patient;
  medications: Medication[];
  conditions: Condition[];
  phenotype: Phenotype; // entered CYP2C19 phenotype for the candidate
  candidate?: string;
}

export function recommend(input: RecommendInput): Recommendation {
  const candidate = input.candidate ?? "escitalopram";
  const lines: RecommendationLine[] = [];
  const medNames = input.medications.map((m) => m.name);

  // Layer 1: CYP2C19 phenotype dosing for the candidate (hard-coded worked cases)
  if (input.phenotype === "PM") {
    lines.push({
      level: "caution",
      text: "Reduce starting dose or consider an alternative. CYP2C19 poor metabolizer, roughly 2 to 3x higher escitalopram exposure.",
      source: "CPIC/DPWG 2023",
    });
  } else if (input.phenotype === "UM") {
    lines.push({
      level: "caution",
      text: "Standard dose may underexpose; monitor response and consider an alternative. CYP2C19 ultrarapid metabolizer.",
      source: "CPIC/DPWG 2023",
    });
  } else if (input.phenotype === "IM") {
    lines.push({
      level: "info",
      text: "Intermediate metabolizer. Standard dose reasonable; monitor for early side effects.",
      source: "DPWG 2023",
    });
  } else {
    lines.push({
      level: "info",
      text: "Standard starting dose reasonable for a CYP2C19 normal metabolizer.",
      source: "CPIC 2023",
    });
  }

  // Layer 2: phenoconversion (the real check, the hero moment)
  const inhibitor = CYP2D6_STRONG_INHIBITORS.find((d) => medNames.includes(d));
  if (inhibitor) {
    lines.push({
      level: "caution",
      text: `Effective CYP2D6 poor metabolizer due to an interacting drug (${inhibitor}, strong inhibitor present). Genotype alone would miss this.`,
      source: "CPIC 2023",
    });
  }

  // Layer 3: serotonergic combination flag
  const serotonergic = SEROTONERGIC.find((d) => medNames.includes(d));
  if (serotonergic) {
    lines.push({
      level: "caution",
      text: `Serotonergic combination caution. Patient already on ${serotonergic}; monitor for serotonin syndrome when adding an SSRI.`,
      source: "FASS",
    });
  }

  return { candidate, lines };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/recommendation/engine.test.ts`
Expected: PASS, 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/recommendation/engine.ts src/recommendation/engine.test.ts
git commit -m "Add mocked recommendation engine with phenoconversion check"
```

---

## Task 4: FHIR mappers (TDD)

**Files:**
- Create: `src/fhir/mappers.ts`
- Test: `src/fhir/mappers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/fhir/mappers.test.ts`
Expected: FAIL with "Cannot find module './mappers'".

- [ ] **Step 3: Implement the mappers**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/fhir/mappers.test.ts`
Expected: PASS, 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/fhir/mappers.ts src/fhir/mappers.test.ts
git commit -m "Add FHIR resource mappers"
```

---

## Task 5: FHIR read functions (TDD with a fake client)

**Files:**
- Create: `src/fhir/client.ts`
- Test: `src/fhir/client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/fhir/client.test.ts`
Expected: FAIL with "Cannot find module './client'".

- [ ] **Step 3: Implement the read functions**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/fhir/client.test.ts`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/fhir/client.ts src/fhir/client.test.ts
git commit -m "Add FHIR read functions"
```

---

## Task 6: SMART auth helpers

**Files:**
- Create: `src/auth/smart.ts`

- [ ] **Step 1: Write the helpers**

```ts
import FHIR from "fhirclient";

export function launch(): void {
  FHIR.oauth2.authorize({
    clientId: "attune",
    scope: "launch openid fhirUser patient/*.read",
    redirectUri: window.location.origin + "/app",
  });
}

export function ready() {
  return FHIR.oauth2.ready();
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/auth/smart.ts
git commit -m "Add SMART launch and ready helpers"
```

---

## Task 7: UI components

**Files:**
- Create: `src/ui/SourceTag.tsx`, `src/ui/RecommendationPanel.tsx`, `src/ui/MedicationList.tsx`, `src/ui/PatientHeader.tsx`, `src/ui/PhenotypeSelector.tsx`
- Test: `src/ui/RecommendationPanel.test.tsx`

- [ ] **Step 1: Write `src/ui/SourceTag.tsx`**

```tsx
export function SourceTag({ source }: { source: string }) {
  return <span className="source-tag">{source}</span>;
}
```

- [ ] **Step 2: Write `src/ui/RecommendationPanel.tsx`**

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

- [ ] **Step 3: Write `src/ui/MedicationList.tsx`**

```tsx
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
```

- [ ] **Step 4: Write `src/ui/PatientHeader.tsx`**

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

- [ ] **Step 5: Write `src/ui/PhenotypeSelector.tsx`**

```tsx
import type { Phenotype } from "../domain/types";

const OPTIONS: { value: Phenotype; label: string }[] = [
  { value: "UM", label: "Ultrarapid (UM)" },
  { value: "NM", label: "Normal (NM)" },
  { value: "IM", label: "Intermediate (IM)" },
  { value: "PM", label: "Poor (PM)" },
];

export function PhenotypeSelector({
  value,
  onChange,
}: {
  value: Phenotype;
  onChange: (p: Phenotype) => void;
}) {
  return (
    <label className="phenotype-selector">
      CYP2C19 phenotype (entered / simulated)
      <select value={value} onChange={(e) => onChange(e.target.value as Phenotype)}>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 6: Write the component test `src/ui/RecommendationPanel.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecommendationPanel } from "./RecommendationPanel";
import { PhenotypeSelector } from "./PhenotypeSelector";
import type { Recommendation } from "../domain/types";

describe("RecommendationPanel", () => {
  it("renders each line with its source", () => {
    const rec: Recommendation = {
      candidate: "escitalopram",
      lines: [{ text: "Reduce starting dose.", level: "caution", source: "CPIC/DPWG 2023" }],
    };
    render(<RecommendationPanel recommendation={rec} />);
    expect(screen.getByText("Reduce starting dose.")).toBeInTheDocument();
    expect(screen.getByText("CPIC/DPWG 2023")).toBeInTheDocument();
    expect(screen.getByText(/decision support only/i)).toBeInTheDocument();
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

- [ ] **Step 7: Run the component tests to verify they pass**

Run: `npm test -- src/ui/RecommendationPanel.test.tsx`
Expected: PASS, 2 tests passed.

- [ ] **Step 8: Commit**

```bash
git add src/ui
git commit -m "Add UI components with panel and selector tests"
```

---

## Task 8: Routing, pages, and live wiring

**Files:**
- Create: `src/mock/bundle.ts`, `src/pages/LaunchPage.tsx`, `src/pages/AppPage.tsx`, `src/App.tsx`, `src/styles.css`
- Modify: `src/main.tsx`

This task wires the real launch flow AND the offline mock fallback (spec §6) so `AppPage` can run with `?mock=1` even before a launcher is reachable.

- [ ] **Step 1: Write the mock Bundle + fake client `src/mock/bundle.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/pages/LaunchPage.tsx`**

```tsx
import { useEffect } from "react";
import { launch } from "../auth/smart";

export function LaunchPage() {
  useEffect(() => {
    launch();
  }, []);
  return <p>Starting SMART launch...</p>;
}
```

- [ ] **Step 3: Write `src/pages/AppPage.tsx`**

```tsx
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
```

- [ ] **Step 4: Write `src/App.tsx`**

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
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Write `src/styles.css`**

```css
:root { font-family: system-ui, sans-serif; color: #1a2330; }
.app { max-width: 560px; margin: 0 auto; padding: 16px; }
.patient-header { display: flex; gap: 12px; align-items: baseline; border-bottom: 1px solid #dde3ea; padding-bottom: 8px; }
.patient-header strong { font-size: 1.1rem; }
.med-list h3 { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.04em; color: #5a6675; }
.med-list ul { margin: 4px 0; padding-left: 18px; }
.muted { color: #8a94a3; }
.phenotype-selector { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; margin: 12px 0; }
.phenotype-selector select { padding: 6px; }
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

- [ ] **Step 7: Verify the full test suite and type check pass**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Verify the offline demo renders**

Run: `npm run dev`, open `http://localhost:5173/app?mock=1`.
Expected: patient header, medication list showing Paroxetine + Omeprazole, phenotype dropdown, and a recommendation panel. Switching the dropdown to PM adds the dose-reduction line; with NM the paroxetine phenoconversion line is visible. Stop the server with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Wire routing, pages, live phenotype updates, and offline mock"
```

---

## Task 9: Deploy config + demo runbook

**Files:**
- Create: `public/_redirects`, `README.md`

- [ ] **Step 1: Write `public/_redirects` (SPA history fallback for Netlify)**

```
/*  /index.html  200
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Attune — SMART on FHIR antidepressant decision-support demo

A SMART on FHIR React SPA that launches inside a (simulated) EHR, reads the live
patient + medication list, and renders a sourced antidepressant recommendation.
The recommendation logic is mocked (scripted lines + one real phenoconversion
check). See `docs/superpowers/specs/2026-06-21-attune-design.md`.

## Run locally

```bash
npm install
npm run dev
```

- Offline demo (no EHR needed): open `http://localhost:5173/app?mock=1`
- Run tests: `npm test`

## Demo against the SMART Health IT launcher (dev)

1. `npm run dev` (serves on `http://localhost:5173`).
2. Open https://launch.smarthealthit.org
3. Set **App Launch URL** to `http://localhost:5173/launch`.
4. Pick a patient and launch. The app redirects to `/app` and reads live FHIR.

## Demo against OpenEMR (the "inside a real EHR" demo)

1. Run OpenEMR via Docker (see https://github.com/openemr/openemr — docker-compose).
2. Enable the FHIR API + register a SMART app:
   - Launch URL: `http://localhost:5173/launch`
   - Redirect URI: `http://localhost:5173/app`
   - Scopes: `launch openid fhirUser patient/*.read`
3. From inside OpenEMR, launch the registered Attune app against a patient.

> Hero case needs a patient whose ACTIVE meds include a strong CYP2D6 inhibitor
> (paroxetine / fluoxetine / bupropion). If the chosen patient has none, add a
> paroxetine medication to that patient in OpenEMR, or use `?mock=1`.

## Deploy (optional, for a public redirect URL)

Deploy to Netlify/Vercel. `public/_redirects` handles SPA history fallback on
Netlify; on Vercel add an equivalent rewrite of all routes to `/index.html`.
Register the deployed `/launch` and `/app` URLs with the launcher/OpenEMR.

## Fallback ladder (spec §6)

- SMART launch won't cooperate → use `?mock=1` (offline synthetic data).
- CORS blocks browser→FHIR → add a small Node proxy forwarding FHIR reads.
````

- [ ] **Step 3: Commit**

```bash
git add public/_redirects README.md
git commit -m "Add deploy config and demo runbook"
```

---

## Self-Review Notes

- **Spec coverage:** §2 architecture → Tasks 6, 8. §4 components: `auth/` Task 6, `fhir/` Tasks 4-5, `recommendation/` Task 3, `ui/` Task 7, `mock/` Task 8. §5 data flow → Task 8 AppPage. §6 error handling → Task 8 (error state + `?mock=1`); CORS proxy documented in README. §7 testing → Tasks 3-5, 7. §8 scope cuts respected (no Observation/AllergyIntolerance, no COS, no backend). §9 demo script → README. §10 data dependency → README hero-case note.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `recommend(RecommendInput)`, `Recommendation { candidate, lines }`, `RecommendationLine { text, level, source }`, `Medication { name, display }` consistent across Tasks 2, 3, 7, 8. FHIR read function names (`getPatient`, `getActiveMedications`, `getConditions`) consistent across Tasks 5 and 8.
