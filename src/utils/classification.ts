import type { FindingClass, EvidenceLevel } from "../types/diagnostic";

export function classifyFinding(
  _id: string,
  evidence: EvidenceLevel,
  status: string,
): FindingClass {
  if (status === "unavailable" || status === "error") {
    return "UNAVAILABLE";
  }
  if (evidence === "DIRECT" || evidence === "DERIVED") {
    return "MATCH";
  }
  if (evidence === "PROPERTY") {
    return "POSSIBLE_DISCREPANCY";
  }
  return "UNVERIFIED";
}