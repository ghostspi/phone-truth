import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

export async function collectStorage(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string | number> = {};
  const notes: string[] = [];

  const df = await runReadOnlyCommand(adb, "df -k /data", 8000);
  commands.push(df.record);

  if (df.ok) {
    const rows = df.output
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 4);

    const dataRow = rows.find((parts) => parts[parts.length - 1] === "/data") ?? rows[0];
    if (dataRow) {
      const sizeKb = Number(dataRow[1]);
      const usedKb = Number(dataRow[2]);
      const availKb = Number(dataRow[3]);
      if (Number.isFinite(sizeKb)) {
        values["Data partition filesystem size"] = `${(sizeKb / 1024 / 1024).toFixed(2)} GB`;
        values["Used"] = `${(usedKb / 1024 / 1024).toFixed(2)} GB`;
        values["Available to user"] = `${(availKb / 1024 / 1024).toFixed(2)} GB`;
      }
    }
  } else {
    values["/data filesystem"] = "unavailable";
  }

  const partitions = await runReadOnlyCommand(adb, "cat /proc/partitions", 8000);
  commands.push(partitions.record);
  if (partitions.ok) {
    values["Block device entries"] = partitions.output.split("\n").filter(Boolean).length;
  }

  notes.push(
    "The /data filesystem size is the formatted partition capacity, not the physical NAND/UFS chip size.",
    "System partitions, reserved blocks and filesystem overhead reduce user-available space.",
    "A normal filesystem reading does NOT prove that the flash chip is genuine or that its physical capacity matches the label.",
  );

  return {
    id: "storage",
    title: "Storage",
    status: df.ok ? "ok" : "warning",
    values,
    evidence: "DIRECT",
    notes,
    commands,
  };
}