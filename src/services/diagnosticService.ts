import type { Adb } from "@yume-chan/adb";
import type { DiagnosticFinding, DiagnosticRunResult } from "../types/diagnostic";
import { collectIdentity } from "./deviceService";
import { collectStorage } from "./storageService";
import { collectRam } from "./ramService";
import { collectBattery } from "./batteryService";
import { collectProcessor } from "./processorService";
import { collectDisplay } from "./displayService";
import { collectNetwork } from "./networkService";
import { collectSecurity } from "./securityService";
import { collectSensors } from "./sensorService";
import { collectPerformance } from "./performanceService";
import { collectSystem } from "./systemService";

export async function runFullDiagnostics(
  adb: Adb,
  onProgress?: (stepName: string, index: number, total: number) => void,
): Promise<DiagnosticRunResult> {
  const findings: DiagnosticFinding[] = [];
  const errors: { key: string; message: string }[] = [];

  const tasks: { name: string; fn: (adb: Adb) => Promise<DiagnosticFinding> }[] = [
    { name: "Device Identity", fn: collectIdentity },
    { name: "Storage & Partitions", fn: collectStorage },
    { name: "Physical RAM & Memory", fn: collectRam },
    { name: "Battery & Health", fn: collectBattery },
    { name: "Processor & SoC", fn: collectProcessor },
    { name: "Display & Resolution", fn: collectDisplay },
    { name: "SIM & Network", fn: collectNetwork },
    { name: "Security & Lock Status", fn: collectSecurity },
    { name: "Sensors & Features", fn: collectSensors },
    { name: "Performance & Uptime", fn: collectPerformance },
    { name: "Operating System & Kernel", fn: collectSystem },
  ];

  let completed = 0;
  for (const task of tasks) {
    if (onProgress) {
      onProgress(task.name, completed, tasks.length);
    }
    try {
      const finding = await task.fn(adb);
      findings.push(finding);
    } catch (e) {
      errors.push({
        key: task.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    completed++;
  }

  return { findings, errors };
}
