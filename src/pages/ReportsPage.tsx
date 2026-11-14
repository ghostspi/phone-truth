import { useEffect, useState } from "react";
import { ConnectionGuard } from "../components/ConnectionGuard";
import { getAllReports, deleteReport, clearAllReports } from "../storage/reportRepository";
import type { Report } from "../types/report";

export function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);

  const loadReports = async () => {
    const data = await getAllReports();
    setReports(data);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleDelete = async (id: string) => {
    await deleteReport(id);
    loadReports();
  };

  const handleClear = async () => {
    await clearAllReports();
    loadReports();
  };

  return (
    <ConnectionGuard>
      <div className="page-container">
        <div className="page-header">
          <h2>Saved Reports</h2>
          {reports.length > 0 && (
            <button onClick={handleClear} className="btn-danger">Clear All</button>
          )}
        </div>

        {reports.length === 0 ? (
          <p className="empty-state">No saved reports found. Run a diagnostic scan to generate one.</p>
        ) : (
          <div className="reports-list">
            {reports.map((report) => (
              <div key={report.id} className="report-item">
                <div>
                  <h4>{report.device.manufacturer} {report.device.model}</h4>
                  <p>{new Date(report.createdAt).toLocaleString()} — {report.findings.length} checks recorded</p>
                </div>
                <button onClick={() => handleDelete(report.id)} className="btn-small-danger">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ConnectionGuard>
  );
}