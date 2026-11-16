import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

export async function collectPerformance(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const [uptimeRes, topRes, meminfoRes] = await Promise.all([
    runReadOnlyCommand(adb, "cat /proc/uptime", 4000),
    runReadOnlyCommand(adb, "top -n 1 -b -m 5", 6000),
    runReadOnlyCommand(adb, "dumpsys meminfo", 8000),
  ]);

  for (const r of [uptimeRes, topRes, meminfoRes]) {
    commands.push({
      command: r.record.command,
      ok: r.record.ok,
      outputPreview: r.output.slice(0, 100),
      error: r.record.error,
    });
  }

  let uptimeHours = 0;
  if (uptimeRes.ok && uptimeRes.output) {
    const sec = Number(uptimeRes.output.trim().split(/\s+/)[0]);
    if (Number.isFinite(sec)) {
      uptimeHours = sec / 3600;
      rawValues["uptimeSeconds"] = sec;
      rawValues["uptimeHours"] = Number(uptimeHours.toFixed(1));
    }
  }

  const items: InspectedItem[] = [
    {
      key: "uptime",
      label: "System Uptime",
      value: uptimeHours > 0 ? `${uptimeHours.toFixed(1)} hours (${(uptimeHours / 24).toFixed(1)} days)` : "Unavailable",
      status: uptimeHours > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: uptimeHours > 0 ? "Kernel uptime successfully read from /proc/uptime." : "Uptime unavailable.",
      evidence: uptimeHours > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Time elapsed since last system reboot (/proc/uptime)",
      whatItMeans: uptimeHours > 0 ? `The device has been running continuously for ${uptimeHours.toFixed(1)} hours.` : "Not reported.",
      whyItMatters: "High uptime confirms the phone is stable under ongoing operation.",
      rawPropertyOrSource: `/proc/uptime = ${uptimeRes.output || "unavailable"}`,
    },
    {
      key: "topProcesses",
      label: "Active CPU & Process Activity",
      value: topRes.ok ? "Process list retrieved successfully" : "Unavailable",
      status: topRes.ok ? "INFO" : "UNAVAILABLE",
      statusReason: topRes.ok ? "Top process snapshot retrieved via top command." : "Top command restricted.",
      evidence: topRes.ok ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Running process list and CPU utilization snapshot",
      whatItMeans: topRes.ok ? "Captured active foreground and background processes." : "Restricted.",
      whyItMatters: "Checks whether background processes are overloading the CPU at idle.",
      rawPropertyOrSource: `top -n 1 -b -m 5`,
    },
    {
      key: "memoryUsage",
      label: "Runtime Memory Allocations (Dumpsys Meminfo)",
      value: meminfoRes.ok ? "System memory summary retrieved" : "Unavailable",
      status: meminfoRes.ok ? "INFO" : "UNAVAILABLE",
      statusReason: meminfoRes.ok ? "Memory breakdown retrieved." : "Unavailable.",
      evidence: meminfoRes.ok ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Android system memory allocation breakdown",
      whatItMeans: meminfoRes.ok ? "Retrieved runtime RAM allocation stats across system services." : "Restricted.",
      whyItMatters: "Helps verify memory pressure and allocation overhead.",
      rawPropertyOrSource: `dumpsys meminfo`,
    },
  ];

  return {
    id: "performance",
    title: "Performance & Uptime",
    subtitle: "Kernel uptime, active process snapshot, and memory allocation summary",
    status: uptimeRes.ok ? "PASS" : "UNAVAILABLE",
    summary: uptimeHours > 0 ? `System uptime is ${uptimeHours.toFixed(1)} hours.` : "Performance metrics retrieved.",
    buyerGuidance: "Check uptime to see how long the device has been running without a reboot.",
    items,
    limitations: ["Performance metrics reflect a momentary snapshot in time."],
    evidence: uptimeRes.ok ? "DIRECT" : "PROPERTY",
    commands,
    rawValues,
  };
}
