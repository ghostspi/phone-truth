import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding } from "../types/diagnostic";

const PROPS = [
  "ro.product.manufacturer",
  "ro.product.model",
  "ro.product.brand",
  "ro.product.device",
  "ro.build.version.release",
  "ro.build.version.sdk",
  "ro.build.version.security_patch",
  "ro.build.fingerprint",
  "ro.build.type",
  "ro.hardware",
  "ro.board.platform",
  "ro.soc.model",
  "ro.soc.manufacturer",
  "ro.boot.verifiedbootstate",
  "ro.boot.flash.locked",
];

export async function collectIdentity(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const values: Record<string, string> = {};

  for (const key of PROPS) {
    const result = await runReadOnlyCommand(adb, `getprop ${key}`, 5000);
    commands.push(result.record);
    if (result.ok && result.output) values[key] = result.output;
  }

  const notes: string[] = [
    "Android build properties are readable by any app and can be modified on rooted or custom firmware.",
    "These values are evidence, not cryptographic proof of authenticity.",
  ];

  if (!values["ro.soc.model"]) {
    notes.push("ro.soc.model is empty on this device. Some OEMs expose chipset data only through ro.board.platform or /proc/cpuinfo.");
  }

  return {
    id: "identity",
    title: "Device Identity",
    status: Object.keys(values).length > 2 ? "ok" : "warning",
    values,
    evidence: "PROPERTY",
    notes,
    commands,
  };
}