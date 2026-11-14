import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

const PROPS = [
  "ro.build.version.release",
  "ro.build.version.sdk",
  "ro.build.version.security_patch",
  "ro.build.type",
];

export async function collectSystem(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string> = {};

  for (const key of PROPS) {
    const result = await runReadOnlyCommand(adb, `getprop ${key}`, 5000);
    commands.push(result.record);
    if (result.ok && result.output) values[key] = result.output;
  }

  return {
    id: "system",
    title: "System Information",
    status: Object.keys(values).length > 2 ? "ok" : "warning",
    values,
    evidence: "PROPERTY",
    notes: [],
    commands,
  };
}