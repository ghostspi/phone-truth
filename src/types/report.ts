import type {
  DiagnosticFinding,
  ManualTestResult,
  OverallAssessment,
} from "./diagnostic";
import type { AdvertisedSpecs, DeviceSnapshot } from "./device";
import type { SpecComparisonRow } from "../utils/classification";

export interface Report {
  id: string;
  createdAt: number;
  device: DeviceSnapshot;
  advertisedSpecs?: AdvertisedSpecs;
  comparisons: SpecComparisonRow[];
  findings: DiagnosticFinding[];
  manualTests: ManualTestResult[];
  overall: OverallAssessment;
}
