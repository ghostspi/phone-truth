import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

function parseMemInfo(output: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+):\s+(\d+)\s+kB/);
    if (match) map[match[1]] = Number(match[2]);
  }
  return map;
}

export async function collectRam(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const mem = await runReadOnlyCommand(adb, "cat /proc/meminfo", 8000);
  commands.push({
    command: mem.record.command,
    ok: mem.record.ok,
    outputPreview: mem.output.slice(0, 120),
    error: mem.record.error,
  });

  const zram = await runReadOnlyCommand(adb, "cat /sys/block/zram0/disksize", 4000);
  commands.push({
    command: zram.record.command,
    ok: zram.record.ok,
    outputPreview: zram.output.slice(0, 80),
    error: zram.record.error,
  });

  const info = mem.ok ? parseMemInfo(mem.output) : {};
  const toGB = (kb?: number) => (kb && kb > 0 ? kb / 1024 / 1024 : 0);

  const memTotalGB = toGB(info.MemTotal);
  const memAvailGB = toGB(info.MemAvailable);
  const memFreeGB = toGB(info.MemFree);
  const cachedGB = toGB(info.Cached);
  const swapTotalGB = toGB(info.SwapTotal);
  const zramBytes = zram.ok && /^\d+$/.test(zram.output.trim()) ? Number(zram.output.trim()) : 0;
  const zramGB = zramBytes > 0 ? zramBytes / 1024 / 1024 / 1024 : 0;

  if (memTotalGB > 0) rawValues["memTotalGB"] = Number(memTotalGB.toFixed(2));
  if (memAvailGB > 0) rawValues["memAvailableGB"] = Number(memAvailGB.toFixed(2));
  if (memFreeGB > 0) rawValues["memFreeGB"] = Number(memFreeGB.toFixed(2));
  if (cachedGB > 0) rawValues["cachedGB"] = Number(cachedGB.toFixed(2));
  rawValues["swapTotalGB"] = Number(swapTotalGB.toFixed(2));
  if (zramGB > 0) rawValues["zramDiskGB"] = Number(zramGB.toFixed(2));

  const items: InspectedItem[] = [
    {
      key: "kernelRam",
      label: "Kernel-Reported Physical RAM",
      value: memTotalGB > 0 ? `${memTotalGB.toFixed(2)} GB` : "Unavailable",
      status: memTotalGB > 0 ? "PASS" : "UNAVAILABLE",
      statusReason:
        memTotalGB > 0
          ? "Kernel physical memory capacity successfully read from /proc/meminfo."
          : "Kernel memory table could not be read.",
      evidence: memTotalGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Usable physical DRAM reported by the Linux kernel (MemTotal)",
      whatItMeans:
        memTotalGB > 0
          ? `The Android system reports approximately ${memTotalGB.toFixed(2)} GB of usable physical memory. This is slightly lower than the advertised RAM figure because some memory is permanently reserved for the GPU, modem, and firmware. Virtual RAM is not included.`
          : "Kernel memory size was unavailable.",
      whyItMatters:
        "Sellers often advertise '12 GB RAM (6 GB + 6 GB Extended)'. Only physical DRAM delivers true hardware speed.",
      rawPropertyOrSource: `MemTotal = ${info.MemTotal ?? 0} kB`,
    },
    {
      key: "availableRam",
      label: "Available RAM",
      value: memAvailGB > 0 ? `${memAvailGB.toFixed(2)} GB` : "Unavailable",
      status: memAvailGB > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: memAvailGB > 0 ? "Memory currently available for launching new apps." : "Unavailable.",
      evidence: memAvailGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Available memory without swapping (MemAvailable)",
      whatItMeans:
        memAvailGB > 0
          ? `${memAvailGB.toFixed(2)} GB of physical RAM is immediately available for apps right now.`
          : "Not reported.",
      whyItMatters: "Indicates real-time memory breathing room.",
      rawPropertyOrSource: `MemAvailable = ${info.MemAvailable ?? 0} kB`,
    },
    {
      key: "freeRam",
      label: "Free RAM",
      value: memFreeGB > 0 ? `${memFreeGB.toFixed(2)} GB` : "Unavailable",
      status: memFreeGB > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: memFreeGB > 0 ? "Completely unallocated RAM pages." : "Unavailable.",
      evidence: memFreeGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Unallocated memory pages (MemFree)",
      whatItMeans:
        memFreeGB > 0
          ? `${memFreeGB.toFixed(2)} GB is completely unused. Android intentionally keeps RAM busy with app caches for faster launches.`
          : "Not reported.",
      whyItMatters: "Low 'Free RAM' on Android is normal as long as 'Available RAM' is healthy.",
      rawPropertyOrSource: `MemFree = ${info.MemFree ?? 0} kB`,
    },
    {
      key: "cachedRam",
      label: "Cached RAM",
      value: cachedGB > 0 ? `${cachedGB.toFixed(2)} GB` : "Unavailable",
      status: cachedGB > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: cachedGB > 0 ? "File and app cache held in physical memory." : "Unavailable.",
      evidence: cachedGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Page cache memory (Cached)",
      whatItMeans:
        cachedGB > 0
          ? `${cachedGB.toFixed(2)} GB is used to cache recently opened apps and files and can be reclaimed instantly.`
          : "Not reported.",
      whyItMatters: "Helps explain why used + free does not equal total memory.",
      rawPropertyOrSource: `Cached = ${info.Cached ?? 0} kB`,
    },
    {
      key: "swapRam",
      label: "Virtual Swap Memory (Separate from Physical RAM)",
      value: mem.ok ? (swapTotalGB > 0 ? `${swapTotalGB.toFixed(2)} GB` : "0.00 GB (None active)") : "Unavailable",
      status: mem.ok ? "INFO" : "UNAVAILABLE",
      statusReason: "Virtual swap is separated from physical RAM and never added to MemTotal.",
      evidence: mem.ok ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Kernel virtual swap space (SwapTotal)",
      whatItMeans:
        swapTotalGB > 0
          ? `${swapTotalGB.toFixed(2)} GB of compressed/disk swap is configured. This is virtual memory, NOT physical RAM chips.`
          : "No active swap space reported.",
      whyItMatters: "Prevents marketing tricks like 'RAM Plus' or 'Extended RAM' from disguising a 4 GB phone as an 8 GB phone.",
      rawPropertyOrSource: `SwapTotal = ${info.SwapTotal ?? 0} kB`,
    },
    {
      key: "zram",
      label: "ZRAM Compressed Block",
      value: zramGB > 0 ? `${zramGB.toFixed(2)} GB` : "Unavailable or Not Active",
      status: zramGB > 0 ? "INFO" : "UNAVAILABLE",
      statusReason:
        zramGB > 0
          ? "ZRAM compressed RAM disk size retrieved separately from physical DRAM."
          : "ZRAM sysfs node was restricted or inactive.",
      evidence: zramGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Compressed in-memory swap device (/sys/block/zram0/disksize)",
      whatItMeans:
        zramGB > 0
          ? `Android compresses inactive data into a ${zramGB.toFixed(2)} GB ZRAM pool inside existing RAM.`
          : "Not exposed by this kernel.",
      whyItMatters: "ZRAM improves multitasking slightly but does not add physical memory hardware.",
      rawPropertyOrSource: `/sys/block/zram0/disksize = ${zramBytes || "(restricted)"}`,
    },
  ];

  return {
    id: "ram",
    title: "RAM (Physical vs. Virtual)",
    subtitle: "Kernel-reported physical DRAM separated from Swap and ZRAM",
    status: memTotalGB > 0 ? "PASS" : "UNAVAILABLE",
    summary:
      memTotalGB > 0
        ? `Kernel reports ${memTotalGB.toFixed(2)} GB of usable physical RAM (${memAvailGB.toFixed(2)} GB available). Virtual swap (${swapTotalGB.toFixed(2)} GB) is kept separate.`
        : "Kernel memory information could not be retrieved.",
    buyerGuidance:
      "An 8 GB phone typically reports ~7.2–7.6 GB in MemTotal; a 6 GB phone reports ~5.3–5.7 GB; a 4 GB phone reports ~3.5–3.8 GB. Always compare against physical RAM, never Swap/ZRAM.",
    items,
    limitations: [
      "Hardware subsystems (GPU framebuffers, camera ISP, cellular modem, and TrustZone) reserve 300 MB to 900 MB before Android boots, so MemTotal is always slightly below the sticker RAM.",
      "PHONE TRUTH never adds SwapTotal or ZRAM to physical RAM.",
    ],
    evidence: memTotalGB > 0 ? "DIRECT" : "UNAVAILABLE",
    commands,
    rawValues,
  };
}
