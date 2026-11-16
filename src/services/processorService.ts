import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

export async function collectProcessor(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const [cpuinfo, socModel, socMfg, platform, abiList, arch, gpuProp, maxFreq] =
    await Promise.all([
      runReadOnlyCommand(adb, "cat /proc/cpuinfo", 8000),
      runReadOnlyCommand(adb, "getprop ro.soc.model", 4000),
      runReadOnlyCommand(adb, "getprop ro.soc.manufacturer", 4000),
      runReadOnlyCommand(adb, "getprop ro.board.platform", 4000),
      runReadOnlyCommand(adb, "getprop ro.product.cpu.abilist", 4000),
      runReadOnlyCommand(adb, "uname -m", 4000),
      runReadOnlyCommand(adb, "getprop ro.hardware.egl", 4000),
      runReadOnlyCommand(adb, "cat /sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq", 4000),
    ]);

  for (const r of [cpuinfo, socModel, socMfg, platform, abiList, arch, gpuProp, maxFreq]) {
    commands.push({
      command: r.record.command,
      ok: r.record.ok,
      outputPreview: r.output.slice(0, 100),
      error: r.record.error,
    });
  }

  let logicalCores = 0;
  let cpuHardware = "";
  let implementer = "";
  if (cpuinfo.ok) {
    logicalCores = (cpuinfo.output.match(/^processor\s*:/gm) ?? []).length;
    cpuHardware = cpuinfo.output.match(/^Hardware\s*:\s*(.+)$/m)?.[1]?.trim() ?? "";
    implementer = cpuinfo.output.match(/^CPU implementer\s*:\s*(.+)$/m)?.[1]?.trim() ?? "";
    if (logicalCores > 0) rawValues["logicalCores"] = logicalCores;
    if (cpuHardware) rawValues["cpuinfoHardware"] = cpuHardware;
  }

  if (socModel.ok && socModel.output) rawValues["socModel"] = socModel.output;
  if (socMfg.ok && socMfg.output) rawValues["socManufacturer"] = socMfg.output;
  if (platform.ok && platform.output) rawValues["boardPlatform"] = platform.output;
  if (abiList.ok && abiList.output) rawValues["abiList"] = abiList.output;
  if (gpuProp.ok && gpuProp.output) rawValues["eglDriver"] = gpuProp.output;

  const maxKhz = maxFreq.ok && /^\d+$/.test(maxFreq.output.trim()) ? Number(maxFreq.output.trim()) : 0;
  const maxGhz = maxKhz > 0 ? (maxKhz / 1_000_000).toFixed(2) : "";
  if (maxGhz) rawValues["cpu0MaxFreqGhz"] = Number(maxGhz);

  const items: InspectedItem[] = [
    {
      key: "socManufacturer",
      label: "Chipset Manufacturer",
      value: socMfg.output || "Unavailable",
      status: socMfg.output ? "INFO" : "UNAVAILABLE",
      statusReason: socMfg.output ? "SoC manufacturer property retrieved." : "Not populated by OEM firmware.",
      evidence: socMfg.output ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "System-on-Chip manufacturer",
      whatItMeans: socMfg.output ? `Silicon vendor reported as ${socMfg.output}.` : "Not reported.",
      whyItMatters: "Identifies the chipset family powering the device.",
      rawPropertyOrSource: `getprop ro.soc.manufacturer -> ${socMfg.output || "(empty)"}`,
    },
    {
      key: "socModel",
      label: "Chipset Model / Hardware",
      value: socModel.output || cpuHardware || platform.output || "Unavailable",
      status: socModel.output || cpuHardware || platform.output ? "PASS" : "UNAVAILABLE",
      statusReason:
        socModel.output || cpuHardware || platform.output
          ? "Chipset model / platform string retrieved."
          : "No chipset identifier exposed.",
      evidence: socModel.output || platform.output ? "PROPERTY" : cpuHardware ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Processor model code and kernel Hardware string",
      whatItMeans:
        socModel.output || cpuHardware || platform.output
          ? `Reported chipset identifier: ${socModel.output || cpuHardware || platform.output}.`
          : "Not exposed.",
      whyItMatters: "Helps verify the phone has the advertised Snapdragon, Dimensity, Exynos, or Tensor processor.",
      rawPropertyOrSource: `ro.soc.model=${socModel.output || "?"}, Hardware=${cpuHardware || "?"}, platform=${platform.output || "?"}`,
    },
    {
      key: "architecture",
      label: "CPU Architecture & Supported ABIs",
      value:
        arch.output || abiList.output
          ? `${arch.output || "ARM"} (${abiList.output || "ABI unavailable"})`
          : "Unavailable",
      status: arch.output || abiList.output ? "INFO" : "UNAVAILABLE",
      statusReason: arch.output || abiList.output ? "CPU instruction set retrieved." : "Unavailable.",
      evidence: arch.output ? "DIRECT" : "PROPERTY",
      whatWasChecked: "Kernel CPU architecture (uname -m) and supported Android ABIs",
      whatItMeans: abiList.output
        ? `Supports ${abiList.output.includes("arm64-v8a") ? "64-bit ARM (arm64-v8a)" : abiList.output}.`
        : "Architecture reported by kernel.",
      whyItMatters: "Modern Android apps require 64-bit (arm64-v8a) support; 32-bit-only chips are outdated.",
      rawPropertyOrSource: `uname -m=${arch.output || "?"}, ro.product.cpu.abilist=${abiList.output || "?"}`,
    },
    {
      key: "cores",
      label: "Logical Processor Count",
      value: logicalCores > 0 ? `${logicalCores} logical CPU cores` : "Unavailable",
      status: logicalCores > 0 ? "PASS" : "UNAVAILABLE",
      statusReason: logicalCores > 0 ? `Kernel reports ${logicalCores} active CPU threads.` : "Could not read /proc/cpuinfo.",
      evidence: logicalCores > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Active processor entries in /proc/cpuinfo",
      whatItMeans:
        logicalCores > 0
          ? `The kernel sees ${logicalCores} logical cores (most modern smartphones are octa-core / 8 cores).`
          : "Not exposed.",
      whyItMatters: "Confirms all CPU cores are online and recognized by the kernel.",
      rawPropertyOrSource: `cat /proc/cpuinfo (${logicalCores} processor entries, implementer ${implementer || "?"})`,
    },
    {
      key: "frequency",
      label: "CPU Frequency (Cluster 0 Max)",
      value: maxGhz ? `${maxGhz} GHz (${maxKhz} kHz)` : "Unavailable (Restricted by kernel)",
      status: maxGhz ? "INFO" : "UNAVAILABLE",
      statusReason: maxGhz ? "Maximum frequency read from cpufreq sysfs." : "cpufreq sysfs restricted on this device.",
      evidence: maxGhz ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "CPU0 maximum clock frequency",
      whatItMeans: maxGhz
        ? `Core 0 reports a peak clock of ${maxGhz} GHz (note: efficiency cores often have lower max clocks than prime cores).`
        : "Restricted by Android SELinux policy.",
      whyItMatters: "Provides clock-speed context for the processor cluster.",
      rawPropertyOrSource: `/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq`,
    },
    {
      key: "gpu",
      label: "GPU / Graphics Driver",
      value: gpuProp.output || "Unavailable",
      status: gpuProp.output ? "INFO" : "UNAVAILABLE",
      statusReason: gpuProp.output ? "EGL graphics driver property retrieved." : "EGL property not exposed.",
      evidence: gpuProp.output ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Hardware EGL graphics subsystem (ro.hardware.egl)",
      whatItMeans: gpuProp.output ? `Graphics driver reports "${gpuProp.output}".` : "Not reported.",
      whyItMatters: "Adreno indicates Qualcomm, Mali/Immortalis indicates ARM/MediaTek/Exynos, PowerVR indicates Imagination.",
      rawPropertyOrSource: `getprop ro.hardware.egl -> ${gpuProp.output || "(empty)"}`,
    },
  ];

  return {
    id: "processor",
    title: "Processor & Hardware",
    subtitle: "SoC model, architecture, core count, clock frequency, and GPU subsystem",
    status: logicalCores > 0 || Boolean(socModel.output || platform.output) ? "PASS" : "UNAVAILABLE",
    summary: `Detected ${logicalCores > 0 ? logicalCores + "-core " : ""}${socModel.output || cpuHardware || platform.output || "processor"} (${abiList.output || arch.output || "architecture unknown"}).`,
    buyerGuidance:
      "Reported chipset properties are strong evidence of the processor inside, though firmware properties alone cannot cryptographically prove physical silicon.",
    items,
    limitations: [
      "Reported SoC properties come from firmware and kernel tables; they do not cryptographically authenticate the physical silicon die.",
      "Big.LITTLE / tri-cluster mobile chips have different max clock speeds per core cluster; cpu0 is usually an efficiency core.",
    ],
    evidence: logicalCores > 0 ? "DIRECT" : "PROPERTY",
    commands,
    rawValues,
  };
}
