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
