import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

export async function collectSensors(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string | number> = {};

  const dumpsys = await runReadOnlyCommand(adb, "dumpsys sensorservice", 10000);
  commands.push(dumpsys.record);

  if (dumpsys.ok) {
    const raw = dumpsys.output;
    values["Accelerometer mentioned"] = /accelerometer/i.test(raw) ? "yes" : "not found";
    values["Gyroscope mentioned"] = /gyroscope/i.test(raw) ? "yes" : "not found";
  }

  return {
    id: "sensors",
    title: "Sensors",
    status: dumpsys.ok ? "ok" : "warning",
    values,
    evidence: "DIRECT",
    notes: [],
    commands,
  };
}