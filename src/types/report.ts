import type { DiagnosticFinding } from "./diagnostic";
import type { DeviceSnapshot } from "./device";

export interface Report {
  id: string;
  createdAt: number;
  device: DeviceSnapshot;
  findings: DiagnosticFinding[];
  overall: string;
}
