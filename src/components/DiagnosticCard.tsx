import type { DiagnosticFinding } from "../types/diagnostic";

interface Props {
  finding: DiagnosticFinding;
}

export function DiagnosticCard({ finding }: Props) {
  return (
    <div className={`diagnostic-card status-${finding.status}`}>
      <div className="card-header">
        <h3>{finding.title}</h3>
        <span className="evidence-badge">{finding.evidence}</span>
      </div>
      <div className="card-body">
        <table className="values-table">
          <tbody>
            {Object.entries(finding.values).map(([key, val]) => (
              <tr key={key}>
                <td className="key-cell">{key}</td>
                <td className="val-cell">{val !== null ? String(val) : "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {finding.notes.length > 0 && (
          <ul className="notes-list">
            {finding.notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}