import type { DiagnosticFinding } from "../types/diagnostic";

interface Props {
  finding: DiagnosticFinding;
}

const statusColors: Record<string, string> = {
  PASS: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  WARNING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  FAIL: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  INFO: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  UNAVAILABLE: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function DiagnosticCard({ finding }: Props) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{finding.title}</h3>
          <p className="text-sm text-slate-400">{finding.subtitle}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            statusColors[finding.status] ?? statusColors.INFO
          }`}
        >
          {finding.status}
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-200">{finding.summary}</p>

      <div className="mt-4 space-y-3">
        {finding.items.map((item) => (
          <div
            key={item.key}
            className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-200">{item.label}</span>
              <span
                className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                  statusColors[item.status] ?? statusColors.INFO
                }`}
              >
                {item.status}
              </span>
            </div>
            <div className="mt-1 font-mono text-sm text-cyan-300">{item.value}</div>
            <p className="mt-1 text-xs text-slate-400">{item.whatItMeans}</p>
          </div>
        ))}
      </div>

      {finding.buyerGuidance && (
        <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3 text-xs text-cyan-200">
          <strong className="font-semibold">Buyer Guidance:</strong> {finding.buyerGuidance}
        </div>
      )}

      {finding.limitations.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-400">
          {finding.limitations.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
