import { useState } from "react";
import { useAdbConnection } from "../connection/useAdbConnection";
import { ConnectionGuard } from "../components/ConnectionGuard";
import { DiagnosticCard } from "../components/DiagnosticCard";
import { runAll, type DiagnosticKey } from "../services/diagnosticService";
import type { DiagnosticFinding } from "../types/diagnostic";
import { saveReport } from "../storage/reportRepository";
import type { Report } from "../types/report";

export function DiagnosticsPage() {
  const { session } = useAdbConnection();
  const [findings, setFindings] = useState<DiagnosticFinding[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const handleRunAll = async () => {
    if (!session) return;
    setRunning(true);
    setFindings([]);

    const result = await runAll(session.adb, (key: DiagnosticKey) => {
      setProgress(`Running check: ${key}...`);
    });

    setFindings(result.findings);
    setRunning(false);
    setProgress("");

    // Automatically save report
    const report: Report = {
      id: `report-${Date.now()}`,
      createdAt: Date.now(),
      device: session.snapshot,
      findings: result.findings,
      overall: "Completed scan",
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