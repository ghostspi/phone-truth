import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

export async function collectProcessor(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string | number> = {};
  const notes: string[] = [];

  const cpuinfo = await runReadOnlyCommand(adb, "cat /proc/cpuinfo", 8000);
  commands.push(cpuinfo.record);

  if (cpuinfo.ok) {
    const logical = (cpuinfo.output.match(/^processor\s*:/gm) ?? []).length;
    values["Logical processors (reported)"] = logical;
    const hardware = cpuinfo.output.match(/^Hardware\s*:\s*(.+)$/m)?.[1];
    if (hardware) values["Hardware (cpuinfo)"] = hardware;
  } else {
    values["CPU information"] = "unavailable";
  }

  return {
    id: "processor",
    title: "Processor",
    status: cpuinfo.ok ? "ok" : "warning",
    values,
    evidence: "PROPERTY",
    notes,
    commands,
  };
}