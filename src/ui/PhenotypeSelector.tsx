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
