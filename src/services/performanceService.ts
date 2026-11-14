import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

export async function collectPerformance(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string | number> = {};

  const loadavg = await runReadOnlyCommand(adb, "cat /proc/loadavg", 5000);
  commands.push(loadavg.record);
  if (loadavg.ok) {
    const parts = loadavg.output.trim().split(/\s+/);
    values["Phone load average"] = parts.slice(0, 3).join(" / ");
  }

  return {
    id: "performance",
    title: "Performance",
    status: loadavg.ok ? "ok" : "warning",
    values,
    evidence: "DIRECT",
    notes: ["Reflects current system load."],
    commands,
  };
}