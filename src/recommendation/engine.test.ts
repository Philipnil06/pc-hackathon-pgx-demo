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
