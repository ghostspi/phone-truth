import { useState } from "react";
import { useAdbConnection } from "../connection/useAdbConnection";
import { ConnectionGuard } from "../components/ConnectionGuard";
import { DiagnosticCard } from "../components/DiagnosticCard";
import { runFullDiagnostics } from "../services/diagnosticService";
import type { DiagnosticFinding, OverallAssessment } from "../types/diagnostic";
import { saveReport } from "../storage/reportRepository";
import type { Report } from "../types/report";

function computeOverallAssessment(findings: DiagnosticFinding[], errorCount: number): OverallAssessment {
  if (findings.length === 0 || errorCount > 3) {
    return "INCOMPLETE INSPECTION";
  }
  if (findings.some((f) => f.status === "FAIL")) {
    return "POTENTIAL DISCREPANCIES FOUND";
  }
  if (findings.some((f) => f.status === "WARNING")) {
    return "ADDITIONAL VERIFICATION REQUIRED";
  }
  return "NO MAJOR DISCREPANCIES DETECTED";
}

export function DiagnosticsPage() {
  const { session } = useAdbConnection();
  const [findings, setFindings] = useState<DiagnosticFinding[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const handleRunAll = async () => {
    if (!session) return;
    setRunning(true);
    setFindings([]);

    const result = await runFullDiagnostics(session.adb, (stepName, index, total) => {
      setProgress(`Running (${index + 1}/${total}): ${stepName}...`);
    });

    setFindings(result.findings);
    setRunning(false);
    setProgress("");

    const overall = computeOverallAssessment(result.findings, result.errors.length);

    const report: Report = {
      id: `report-${Date.now()}`,
      createdAt: Date.now(),
      device: session.snapshot,
      findings: result.findings,
      comparisons: [],
      manualTests: [],
      overall,
    };
    await saveReport(report);
  };

  return (
    <ConnectionGuard>
      <div className="page-container">
        <div className="page-header">
          <h2>Diagnostics Suite</h2>
          <button onClick={handleRunAll} disabled={running} className="btn-primary">
            {running ? progress : "Run Full Scan"}
          </button>
        </div>

        {findings.length === 0 && !running && (
          <p className="empty-state">Click "Run Full Scan" above to query your connected device.</p>
        )}

        <div className="grid-container">
          {findings.map((finding) => (
            <DiagnosticCard key={finding.id} finding={finding} />
          ))}
        </div>
      </div>
    </ConnectionGuard>
  );
}
