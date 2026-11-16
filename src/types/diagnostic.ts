export type EvidenceLevel =
  | "DIRECT"
  | "PROPERTY"
  | "DERIVED"
  | "MANUAL"
  | "UNAVAILABLE";

export type InspectionStatus =
  | "PASS"
  | "FAIL"
  | "WARNING"
  | "UNAVAILABLE"
  | "INFO";

export type OverallAssessment =
  | "NO MAJOR DISCREPANCIES DETECTED"
  | "POTENTIAL DISCREPANCIES FOUND"
  | "ADDITIONAL VERIFICATION REQUIRED"
  | "INCOMPLETE INSPECTION";

export type SectionId =
  | "overview"
  | "identity"
  | "storage"
  | "ram"
  | "battery"
  | "processor"
  | "display"
  | "network"
  | "security"
  | "sensors"
  | "performance"
  | "system"
  | "hardware-tests"
  | "report"
  | "history";

export interface CommandRecord {
  command: string;
  ok: boolean;
  outputPreview?: string;
  error?: string;
}

export interface InspectedItem {
  key: string;
  label: string;
  value: string;
  status: InspectionStatus;
  statusReason: string;
  evidence: EvidenceLevel;
  whatWasChecked: string;
  whatItMeans: string;
  whyItMatters: string;
  rawPropertyOrSource?: string;
}

export interface DiagnosticFinding {
  id: Exclude<SectionId, "overview" | "hardware-tests" | "report" | "history">;
  title: string;
  subtitle: string;
  status: InspectionStatus;
  summary: string;
  buyerGuidance: string;
  items: InspectedItem[];
  limitations: string[];
  evidence: EvidenceLevel;
  commands: CommandRecord[];
  rawValues: Record<string, string | number | null>;
}

export interface DiagnosticRunResult {
  findings: DiagnosticFinding[];
  errors: { key: string; message: string }[];
}

export interface ManualTestResult {
  id: string;
  name: string;
  category: "display" | "sensors" | "hardware";
  status: InspectionStatus;
  notes: string;
  testedAt: number;
}
