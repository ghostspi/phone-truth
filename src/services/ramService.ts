import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

function parseMemInfo(output: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+):\s+(\d+)\s+kB/);
    if (match) map[match[1]] = Number(match[2]);
  }
  return map;
}

export async function collectRam(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string> = {};
  const notes: string[] = [];

  const mem = await runReadOnlyCommand(adb, "cat /proc/meminfo", 8000);
  commands.push(mem.record);

  if (mem.ok) {
    const info = parseMemInfo(mem.output);
    if (info.MemTotal) {
      values["MemTotal (kernel-reported)"] = `${(info.MemTotal / 1024 / 1024).toFixed(2)} GB`;
    }
    if (info.MemAvailable) {
      values["MemAvailable"] = `${(info.MemAvailable / 1024 / 1024).toFixed(2)} GB`;
    }
    if (info.SwapTotal !== undefined) {
      values["SwapTotal"] = info.SwapTotal
        ? `${(info.SwapTotal / 1024 / 1024).toFixed(2)} GB`
        : "0 (no swap reported)";
    }

    notes.push(
      "MemTotal is the memory the kernel makes available to user space. It is typically lower than physical RAM because the GPU and modem reserve memory.",
    );
  } else {
    values["Memory information"] = "unavailable";
  }

  return {
    id: "ram",
    title: "RAM",
    status: mem.ok && values["MemTotal (kernel-reported)"] ? "ok" : "warning",
    values,
    evidence: "DIRECT",
    notes,
    commands,
  };
}