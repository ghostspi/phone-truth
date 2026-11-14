import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

export async function collectDisplay(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string> = {};
  const notes: string[] = [];

  const size = await runReadOnlyCommand(adb, "wm size", 5000);
  commands.push(size.record);
  if (size.ok) {
    const physical = size.output.match(/Physical size:\s*(\d+x\d+)/)?.[1];
    if (physical) values["Physical resolution"] = physical;
  }

  return {
    id: "display",
    title: "Display",
    status: size.ok ? "ok" : "warning",
    values,
    evidence: "DIRECT",
    notes,
    commands,
  };
}