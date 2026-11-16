import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

export async function collectSystem(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const [kernelRes, sepolicyRes, packagesRes] = await Promise.all([
    runReadOnlyCommand(adb, "uname -a", 4000),
    runReadOnlyCommand(adb, "getenforce", 4000),
    runReadOnlyCommand(adb, "pm list packages -3", 8000),
  ]);

  for (const r of [kernelRes, sepolicyRes, packagesRes]) {
    commands.push({
      command: r.record.command,
      ok: r.record.ok,
      outputPreview: r.output.slice(0, 100),
      error: r.record.error,
    });
  }

  if (kernelRes.output) rawValues["kernelVersion"] = kernelRes.output.trim();
  if (sepolicyRes.output) rawValues["selinuxMode"] = sepolicyRes.output.trim();

  let thirdPartyCount = 0;
  if (packagesRes.ok && packagesRes.output) {
    thirdPartyCount = packagesRes.output.split("\n").filter((l) => l.startsWith("package:")).length;
    rawValues["thirdPartyPackageCount"] = thirdPartyCount;
  }

  const items: InspectedItem[] = [
    {
      key: "kernel",
      label: "Linux Kernel Version",
      value: kernelRes.output ? kernelRes.output.trim() : "Unavailable",
      status: kernelRes.ok ? "PASS" : "UNAVAILABLE",
      statusReason: kernelRes.ok ? "Kernel version successfully retrieved." : "Kernel version unavailable.",
      evidence: kernelRes.ok ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Linux kernel build release and architecture (uname -a)",
      whatItMeans: kernelRes.output ? `Kernel build string: ${kernelRes.output.trim()}` : "Not reported.",
      whyItMatters: "Provides exact kernel compilation details and build date.",
      rawPropertyOrSource: `uname -a`,
    },
    {
      key: "selinux",
      label: "SELinux Enforcement Mode",
      value: sepolicyRes.output ? sepolicyRes.output.trim() : "Unavailable",
      status: sepolicyRes.output.trim().toLowerCase() === "enforcing" ? "PASS" : "WARNING",
      statusReason: sepolicyRes.output ? `SELinux reports ${sepolicyRes.output.trim()}.` : "Unavailable.",
      evidence: sepolicyRes.output ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Security-Enhanced Linux (SELinux) enforcement status",
      whatItMeans: sepolicyRes.output
        ? `SELinux is running in "${sepolicyRes.output.trim()}" mode.`
        : "Not reported.",
      whyItMatters: "Enforcing mode protects system sandbox integrity; Permissive mode lowers security sandboxes.",
      rawPropertyOrSource: `getenforce`,
    },
    {
      key: "thirdPartyPackages",
      label: "Installed Third-Party Apps",
      value: packagesRes.ok ? `${thirdPartyCount} third-party user apps installed` : "Unavailable",
      status: "INFO",
      statusReason: packagesRes.ok ? "Third-party package list retrieved." : "Restricted.",
      evidence: packagesRes.ok ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Count of non-system user-installed APK packages",
      whatItMeans: packagesRes.ok ? `Found ${thirdPartyCount} user-installed apps on the device.` : "Restricted.",
      whyItMatters: "Shows whether the device still has apps from the previous owner.",
      rawPropertyOrSource: `pm list packages -3`,
    },
  ];

  return {
    id: "system",
    title: "Operating System & Kernel",
    subtitle: "Linux kernel build, SELinux enforcement, and installed user packages",
    status: kernelRes.ok ? "PASS" : "UNAVAILABLE",
    summary: `Kernel: ${kernelRes.output ? kernelRes.output.trim().slice(0, 50) + "..." : "Unavailable"} • SELinux: ${sepolicyRes.output ? sepolicyRes.output.trim() : "Unknown"}.`,
    buyerGuidance: "Review installed apps and kernel integrity to ensure a clean operating environment.",
    items,
    limitations: ["Inspects package counts without viewing personal app content."],
    evidence: kernelRes.ok ? "DIRECT" : "PROPERTY",
    commands,
    rawValues,
  };
}
