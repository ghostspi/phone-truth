import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

export async function collectStorage(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const df = await runReadOnlyCommand(adb, "df -k /data", 8000);
  commands.push({
    command: df.record.command,
    ok: df.record.ok,
    outputPreview: df.output.slice(0, 120),
    error: df.record.error,
  });

  let totalGB = 0;
  let usedGB = 0;
  let availGB = 0;
  let filesystemDev = "";

  if (df.ok) {
    const rows = df.output
      .split("\n")
      .slice(1)
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length >= 4);
    const dataRow = rows.find((p) => p[p.length - 1] === "/data") ?? rows[0];
    if (dataRow) {
      filesystemDev = dataRow[0] ?? "";
      const sizeKb = Number(dataRow[1]);
      const usedKb = Number(dataRow[2]);
      const availKb = Number(dataRow[3]);
      if (Number.isFinite(sizeKb) && sizeKb > 0) {
        totalGB = sizeKb / 1024 / 1024;
        usedGB = usedKb / 1024 / 1024;
        availGB = availKb / 1024 / 1024;
        rawValues["dataTotalGB"] = Number(totalGB.toFixed(2));
        rawValues["dataUsedGB"] = Number(usedGB.toFixed(2));
        rawValues["dataAvailGB"] = Number(availGB.toFixed(2));
        rawValues["dataFilesystem"] = filesystemDev;
      }
    }
  }

  const partitions = await runReadOnlyCommand(adb, "cat /proc/partitions", 8000);
  commands.push({
    command: partitions.record.command,
    ok: partitions.record.ok,
    outputPreview: partitions.output.slice(0, 120),
    error: partitions.record.error,
  });

  let blockCount = 0;
  let largestBlockGB = 0;
  if (partitions.ok) {
    const lines = partitions.output.split("\n").slice(2).filter(Boolean);
    blockCount = lines.length;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const blocks = Number(parts[2]);
      if (Number.isFinite(blocks)) {
        const gb = blocks / 1024 / 1024;
        if (gb > largestBlockGB) largestBlockGB = gb;
      }
    }
    rawValues["partitionEntryCount"] = blockCount;
    if (largestBlockGB > 0) rawValues["largestBlockGB"] = Number(largestBlockGB.toFixed(2));
  }

  const extStorage = await runReadOnlyCommand(adb, "sm list-volumes public", 5000);
  commands.push({
    command: extStorage.record.command,
    ok: extStorage.record.ok,
    outputPreview: extStorage.output.slice(0, 120),
    error: extStorage.record.error,
  });
  const hasExternal = extStorage.ok && extStorage.output.trim().length > 0;
  if (hasExternal) rawValues["externalVolumes"] = extStorage.output.trim();

  const items: InspectedItem[] = [
    {
      key: "filesystemSize",
      label: "Formatted User Storage (/data)",
      value: totalGB > 0 ? `${totalGB.toFixed(2)} GB` : "Unavailable",
      status: totalGB > 0 ? "INFO" : "UNAVAILABLE",
      statusReason:
        totalGB > 0
          ? "Formatted /data partition size retrieved. Compare against advertised storage in Verification."
          : "Could not read /data partition capacity.",
      evidence: totalGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Formatted /data user partition size",
      whatItMeans:
        totalGB > 0
          ? `Android allocates ${totalGB.toFixed(2)} GB to the user data partition after OS and recovery partitions.`
          : "Partition size was not accessible.",
      whyItMatters:
        "A 128 GB phone typically shows ~105–116 GB here; a 256 GB phone shows ~220–238 GB. Much smaller values indicate a lower-tier model.",
      rawPropertyOrSource: `df -k /data (${filesystemDev || "unknown device"})`,
    },
    {
      key: "usedStorage",
      label: "Used Storage",
      value: totalGB > 0 ? `${usedGB.toFixed(2)} GB` : "Unavailable",
      status: totalGB > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: totalGB > 0 ? "Current space occupied by apps and user data." : "Unavailable.",
      evidence: totalGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Used space on /data partition",
      whatItMeans: totalGB > 0 ? `${usedGB.toFixed(2)} GB is currently in use.` : "Not reported.",
      whyItMatters: "Shows whether the device has been factory-reset or still holds previous user files.",
      rawPropertyOrSource: "df -k /data (Used column)",
    },
    {
      key: "availableStorage",
      label: "Available Storage",
      value: totalGB > 0 ? `${availGB.toFixed(2)} GB` : "Unavailable",
      status: totalGB > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: totalGB > 0 ? "Free space immediately available to the user." : "Unavailable.",
      evidence: totalGB > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Free space on /data partition",
      whatItMeans: totalGB > 0 ? `${availGB.toFixed(2)} GB is currently free for apps, photos, and videos.` : "Not reported.",
      whyItMatters: "Confirms usable headroom without needing to delete system files.",
      rawPropertyOrSource: "df -k /data (Available column)",
    },
    {
      key: "blockDevices",
      label: "Partition & Block Device Entries",
      value: blockCount > 0 ? `${blockCount} entries (largest block: ${largestBlockGB.toFixed(2)} GB)` : "Unavailable",
      status: blockCount > 0 ? "INFO" : "UNAVAILABLE",
      statusReason:
        blockCount > 0
          ? "Kernel partition table retrieved."
          : "Kernel /proc/partitions was restricted.",
      evidence: blockCount > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Kernel block device table (/proc/partitions)",
      whatItMeans:
        blockCount > 0
          ? `Kernel exposes ${blockCount} block partitions; the largest single block device is ${largestBlockGB.toFixed(2)} GB.`
          : "Restricted on this Android version.",
      whyItMatters: "Provides secondary confirmation of the underlying flash layout.",
      rawPropertyOrSource: "cat /proc/partitions",
    },
    {
      key: "externalStorage",
      label: "External / Adoptable Storage",
      value: hasExternal ? extStorage.output.trim() : "None detected",
      status: extStorage.ok ? "INFO" : "UNAVAILABLE",
      statusReason: extStorage.ok
        ? hasExternal
          ? "External volume reported by Storage Manager."
          : "No SD card or external volume mounted."
        : "Storage Manager volume list restricted.",
      evidence: extStorage.ok ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Mounted SD card / external storage volumes",
      whatItMeans: hasExternal ? `External volume present: ${extStorage.output.trim()}` : "No external SD card detected.",
      whyItMatters: "Ensures an SD card is not being confused with built-in internal storage.",
      rawPropertyOrSource: "sm list-volumes public",
    },
    {
      key: "chipVerification",
      label: "Physical Flash Chip Verification",
      value: "Requires Verification / Cannot Cryptographically Verify Chip",
      status: "WARNING",
      statusReason:
        "Formatted partition size aligns with filesystem reporting, but raw NAND/UFS chip authenticity cannot be proven by read-only queries.",
      evidence: "UNAVAILABLE",
      whatWasChecked: "Physical NAND/UFS flash controller integrity",
      whatItMeans:
        "Marketed storage (e.g. 256 GB) is measured in decimal gigabytes (1 GB = 1,000 MB), while Android reports binary GiB (1 GiB = 1,024 MiB) and reserves space for the OS, vendor, and recovery partitions.",
      whyItMatters:
        "Counterfeit phones can spoof partition tables. Confirm the formatted size in the Specification Verification tab, and never rely solely on Settings text.",
      rawPropertyOrSource: "Read-only inspection limitation",
    },
  ];

  return {
    id: "storage",
    title: "Storage",
    subtitle: "Formatted /data capacity, free space, block partitions, and external volumes",
    status: totalGB > 0 ? "WARNING" : "UNAVAILABLE",
    summary:
      totalGB > 0
        ? `Formatted user partition is ${totalGB.toFixed(2)} GB (${availGB.toFixed(2)} GB free). Physical chip capacity cannot be independently verified via read-only ADB.`
        : "Storage partition information could not be retrieved.",
    buyerGuidance:
      "Compare the formatted /data size against the seller's advertised storage on the Verification tab. Remember: a 128 GB phone normally shows ~108–115 GB formatted.",
    items,
    limitations: [
      "Marketed storage uses decimal GB (1000³ bytes) while Android reports binary GiB (1024³ bytes), creating an ~7% difference before OS partitions.",
      "System, vendor, modem, and A/B OTA partitions occupy 12–25 GB on modern Android phones.",
      "Read-only ADB inspects partition sizes, not raw flash blocks—it does not perform destructive write-read capacity tests.",
    ],
    evidence: totalGB > 0 ? "DIRECT" : "UNAVAILABLE",
    commands,
    rawValues,
  };
}
