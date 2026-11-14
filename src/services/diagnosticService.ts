import type { Adb } from "@yume-chan/adb";
import { collectIdentity } from "./deviceService";
import { collectStorage } from "./storageService";
import { collectRam } from "./ramService";
import { collectBattery } from "./batteryService";
import { collectProcessor } from "./processorService";
import { collectDisplay } from "./displayService";
import { collectSystem } from "./systemService";
import { collectPerformance } from "./performanceService";
import { collectSensors } from "./sensorService";
import type { DiagnosticFinding, DiagnosticRunResult } from "../types/diagnostic";

export type DiagnosticKey =
  | "identity"
  | "storage"
  | "ram"
  | "battery"
  | "processor"
  | "display"
  | "system"
  | "performance"
  | "sensors";

const RUNNERS: Record<DiagnosticKey, (adb: Adb) => Promise<DiagnosticFinding>> = {
  identity: collectIdentity,
  storage: collectStorage,
  ram: collectRam,
  battery: collectBattery,
  processor: collectProcessor,
  display: collectDisplay,
  system: collectSystem,
  performance: collectPerformance,
  sensors: collectSensors,
};

export async function runAll(
  adb: Adb,
  onProgress?: (key: DiagnosticKey, index: number, total: number) => void,
): Promise<DiagnosticRunResult> {
  const keys = Object.keys(RUNNERS) as DiagnosticKey[];
  const findings: DiagnosticFinding[] = [];
  const errors: { key: string; message: string }[] = [];

  for (let i = 0; i < keys.length; i++) {
    onProgress?.(keys[i], i, keys.length);
    try {
      findings.push(await RUNNERS[keys[i]](adb));
    } catch (e) {
      errors.push({
        key: keys[i],
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { findings, errors };
}