export type EvidenceLevel =
  | "DIRECT"
  | "PROPERTY"
  | "DERIVED"
  | "UNAVAILABLE";

export type FindingClass =
  | "MATCH"
  | "POSSIBLE_DISCREPANCY"
  | "UNVERIFIED"
  | "UNAVAILABLE"
  | "REQUIRES_MANUAL_TEST";

export interface CommandRecord {
  command: string;
  ok: boolean;
  error?: string;
}

export interface DiagnosticFinding {
  id: string;
  title: string;
  status: "ok" | "warning" | "unavailable" | "error";
  values: Record<string, string | number | null>;
  evidence: EvidenceLevel;
  notes: string[];
  commands: CommandRecord[];
  classification?: FindingClass;
}

export interface DiagnosticRunResult {
  findings: DiagnosticFinding[];
  errors: { key: string; message: string }[];
}
