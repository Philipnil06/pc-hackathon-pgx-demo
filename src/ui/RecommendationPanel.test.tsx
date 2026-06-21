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
