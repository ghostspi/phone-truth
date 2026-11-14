import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

export async function collectBattery(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string> = {};
  const notes: string[] = [];

  const dumpsys = await runReadOnlyCommand(adb, "dumpsys battery", 8000);
  commands.push(dumpsys.record);

  if (dumpsys.ok) {
    const raw = dumpsys.output;
    const pick = (label: string) => {
      const regex = new RegExp(`^\\s*${label}:\\s*(.+)$`, "im");
      return raw.match(regex)?.[1]?.trim() ?? null;
    };

    const level = pick("level");
    const temp = pick("temperature");
    const voltage = pick("voltage");
    const status = pick("status");
    const health = pick("health");

    if (level) values["Current charge level"] = `${level}%`;
    if (temp) values["Temperature"] = `${(Number(temp) / 10).toFixed(1)} °C`;
    if (voltage) values["Voltage"] = `${voltage} mV`;
    if (status) values["Status (raw)"] = status;
    if (health) values["Health (raw)"] = health;
  } else {
    values["dumpsys battery"] = "unavailable";
  }

  return {
    id: "battery",
    title: "Battery",
    status: dumpsys.ok ? "ok" : "warning",
    values,
    evidence: "DERIVED",
    notes,
    commands,
  };
}