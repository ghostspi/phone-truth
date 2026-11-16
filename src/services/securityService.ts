import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

function explainVerifiedBoot(state: string): { label: string; status: InspectedItem["status"]; detail: string } {
  const s = state.toLowerCase();
  if (s === "green") {
    return {
      label: "Green (Official locked firmware verified)",
      status: "PASS",
      detail: "Boot chain is locked and verified with the manufacturer's official cryptographic key.",
    };
  }
  if (s === "yellow") {
    return {
      label: "Yellow (Locked with custom user key)",
      status: "WARNING",
      detail: "Bootloader is locked using a custom signing key rather than the factory OEM key.",
    };
  }
  if (s === "orange") {
    return {
      label: "Orange (Bootloader unlocked — unverified boot)",
      status: "WARNING",
      detail: "Bootloader is unlocked. Custom recovery, root, or modified system images can be loaded.",
    };
  }
  if (s === "red") {
    return {
      label: "Red (Boot verification failed / corrupt image)",
      status: "FAIL",
      detail: "Android Verified Boot reported a signature verification failure.",
    };
  }
  return {
    label: state ? `Unknown (${state})` : "Unavailable (Not exposed by OEM)",
    status: "UNAVAILABLE",
    detail: "Android did not expose ro.boot.verifiedbootstate to shell.",
  };
}

export async function collectSecurity(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const [
    flashLocked,
    verifiedState,
    verifiedMode,
    buildTags,
    buildType,
    debuggable,
    secureProp,
    patchLevel,
    cryptoState,
    oemUnlockAllowed,
    suCheck,
  ] = await Promise.all([
    runReadOnlyCommand(adb, "getprop ro.boot.flash.locked", 4000),
    runReadOnlyCommand(adb, "getprop ro.boot.verifiedbootstate", 4000),
    runReadOnlyCommand(adb, "getprop ro.boot.veritymode", 4000),
    runReadOnlyCommand(adb, "getprop ro.build.tags", 4000),
    runReadOnlyCommand(adb, "getprop ro.build.type", 4000),
    runReadOnlyCommand(adb, "getprop ro.debuggable", 4000),
    runReadOnlyCommand(adb, "getprop ro.secure", 4000),
    runReadOnlyCommand(adb, "getprop ro.build.version.security_patch", 4000),
    runReadOnlyCommand(adb, "getprop ro.crypto.state", 4000),
    runReadOnlyCommand(adb, "getprop sys.oem_unlock_allowed", 4000),
    runReadOnlyCommand(adb, "which su", 4000),
  ]);

  for (const r of [
    flashLocked,
    verifiedState,
    verifiedMode,
    buildTags,
    buildType,
    debuggable,
    secureProp,
    patchLevel,
    cryptoState,
    oemUnlockAllowed,
    suCheck,
  ]) {
    commands.push({
      command: r.record.command,
      ok: r.record.ok,
      outputPreview: r.output.slice(0, 100),
      error: r.record.error,
    });
  }

  if (flashLocked.output) rawValues["bootloaderLockedProp"] = flashLocked.output;
  if (verifiedState.output) rawValues["verifiedBootState"] = verifiedState.output;
  if (verifiedMode.output) rawValues["verityMode"] = verifiedMode.output;
  if (buildTags.output) rawValues["buildTags"] = buildTags.output;
  if (buildType.output) rawValues["buildType"] = buildType.output;
  if (debuggable.output) rawValues["roDebuggable"] = debuggable.output;
  if (patchLevel.output) rawValues["securityPatch"] = patchLevel.output;
  if (cryptoState.output) rawValues["cryptoState"] = cryptoState.output;

  const vboot = explainVerifiedBoot(verifiedState.output);

  let bootloaderText = "Unknown / Unavailable";
  let bootloaderStatus: InspectedItem["status"] = "UNAVAILABLE";
  if (flashLocked.output === "1") {
    bootloaderText = "Locked";
    bootloaderStatus = "PASS";
  } else if (flashLocked.output === "0") {
    bootloaderText = "Unlocked";
    bootloaderStatus = "WARNING";
  }

  const suFound = suCheck.ok && suCheck.output.trim().startsWith("/");
  const testKeys = buildTags.output.includes("test-keys");
  const isDebuggable = debuggable.output === "1";

  let rootText = "Not detected (Standard user build)";
  let rootStatus: InspectedItem["status"] = "PASS";
  if (suFound) {
    rootText = `Detected (su binary found at ${suCheck.output.trim()})`;
    rootStatus = "FAIL";
  } else if (testKeys || isDebuggable) {
    rootText = "Possible modification (test-keys or debuggable build detected)";
    rootStatus = "WARNING";
  } else if (!buildTags.output && !debuggable.output) {
    rootText = "Unable to determine";
    rootStatus = "UNAVAILABLE";
  }

  const items: InspectedItem[] = [
    {
      key: "bootloader",
      label: "Bootloader Locked Status",
      value: bootloaderText,
      status: bootloaderStatus,
      statusReason:
        bootloaderStatus === "PASS"
          ? "Bootloader reports Locked."
          : bootloaderStatus === "WARNING"
            ? "Bootloader reports Unlocked."
            : "Bootloader lock flag is not exposed on this device.",
      evidence: flashLocked.output ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Bootloader flash lock state (ro.boot.flash.locked)",
      whatItMeans:
        bootloaderStatus === "PASS"
          ? "The bootloader is locked, preventing unauthorized operating system images from being flashed."
          : bootloaderStatus === "WARNING"
            ? "The bootloader is unlocked. The device may run modified software, and banking apps or DRM (Netflix HD) may be restricted."
            : "This OEM does not expose the bootloader lock property over standard ADB.",
      whyItMatters: "An unlocked bootloader can break Google Play Integrity / banking apps and indicates prior tinkering.",
      rawPropertyOrSource: `ro.boot.flash.locked = ${flashLocked.output || "(empty)"}`,
    },
    {
      key: "verifiedBoot",
      label: "Android Verified Boot State",
      value: vboot.label,
      status: vboot.status,
      statusReason: vboot.detail,
      evidence: verifiedState.output ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Cryptographic boot chain state (ro.boot.verifiedbootstate)",
      whatItMeans: vboot.detail,
      whyItMatters: "Green indicates intact OEM firmware; Orange or Red indicates an unlocked or altered boot image.",
      rawPropertyOrSource: `ro.boot.verifiedbootstate = ${verifiedState.output || "(empty)"}, veritymode = ${verifiedMode.output || "(empty)"}`,
    },
    {
      key: "rootStatus",
      label: "Root & Firmware Signing Indicators",
      value: rootText,
      status: rootStatus,
      statusReason:
        rootStatus === "PASS"
          ? "No su binary, test-keys, or debuggable kernel flags found."
          : "Root binary or non-retail build flags detected.",
      evidence: "PROPERTY",
      whatWasChecked: "Presence of su binary, ro.build.tags (release-keys vs test-keys), and ro.debuggable",
      whatItMeans:
        rootStatus === "PASS"
          ? `Firmware uses ${buildTags.output || "standard"} keys and non-debuggable configuration.`
          : "Non-retail signing keys, debuggable flag, or su binary was found.",
      whyItMatters: "Rooted or test-key builds may fail banking security checks and carry higher malware risk.",
      rawPropertyOrSource: `tags=${buildTags.output || "?"}, type=${buildType.output || "?"}, debuggable=${debuggable.output || "?"}, which su=${suCheck.output || "none"}`,
    },
    {
      key: "encryption",
      label: "Device Storage Encryption",
      value: cryptoState.output
        ? cryptoState.output === "encrypted"
          ? "Encrypted (Active)"
          : cryptoState.output
        : "Unavailable",
      status: cryptoState.output === "encrypted" ? "PASS" : cryptoState.output ? "WARNING" : "UNAVAILABLE",
      statusReason:
        cryptoState.output === "encrypted"
          ? "User data partition encryption is active."
          : "Encryption state not exposed or unencrypted.",
      evidence: cryptoState.output ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "File-based / full-disk encryption status (ro.crypto.state)",
      whatItMeans:
        cryptoState.output === "encrypted"
          ? "User files are encrypted on flash storage."
          : "Encryption flag could not be confirmed.",
      whyItMatters: "All modern retail Android devices ship with active storage encryption.",
      rawPropertyOrSource: `ro.crypto.state = ${cryptoState.output || "(empty)"}`,
    },
    {
      key: "securityPatch",
      label: "Android Security Patch Level",
      value: patchLevel.output || "Unavailable",
      status: patchLevel.output ? "INFO" : "UNAVAILABLE",
      statusReason: patchLevel.output ? `Firmware includes patches up to ${patchLevel.output}.` : "Patch date unavailable.",
      evidence: patchLevel.output ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Operating system security patch date",
      whatItMeans: patchLevel.output
        ? `Android security updates are current as of ${patchLevel.output}.`
        : "Not reported.",
      whyItMatters: "Older patch dates may indicate an abandoned device or older firmware build.",
      rawPropertyOrSource: `ro.build.version.security_patch = ${patchLevel.output || "(empty)"}`,
    },
    {
      key: "usbDebuggingAndOem",
      label: "USB Debugging & OEM Unlocking Flag",
      value: `USB Debugging: Enabled (Active session) • OEM Unlock Allowed: ${
        oemUnlockAllowed.output === "1"
          ? "Yes (1)"
          : oemUnlockAllowed.output === "0"
            ? "No (0)"
            : "Restricted / Unavailable"
      }`,
      status: "INFO",
      statusReason: "USB debugging is active because this inspection session is connected.",
      evidence: "PROPERTY",
      whatWasChecked: "Developer Options USB debugging and OEM unlock permission flag",
      whatItMeans:
        "Remember to turn off USB Debugging in Developer Options after finishing your inspection if you do not need it.",
      whyItMatters: "Leaving USB debugging enabled on a daily-driver phone exposes ADB access if unlocked near untrusted computers.",
      rawPropertyOrSource: `sys.oem_unlock_allowed = ${oemUnlockAllowed.output || "(restricted)"}`,
    },
    {
      key: "carrierLock",
      label: "Carrier / Network Lock Status",
      value: "Not Verifiable via Standard ADB (Test with target carrier SIM)",
      status: "WARNING",
      statusReason: "Android does not expose reliable carrier-lock status over read-only ADB.",
      evidence: "UNAVAILABLE",
      whatWasChecked: "Carrier subsidy / SIM lock policy",
      whatItMeans:
        "PHONE TRUTH never guesses carrier lock status or accesses private carrier billing records.",
      whyItMatters: "Insert a SIM card from your carrier to verify network compatibility before buying.",
      rawPropertyOrSource: "Read-only permission boundary",
    },
  ];

  const hasFail = items.some((i) => i.status === "FAIL");
  const hasWarn = items.some((i) => i.status === "WARNING");

  return {
    id: "security",
    title: "Security & Lock Status",
    subtitle: "Bootloader lock, Verified Boot state, root indicators, encryption, and patch level",
    status: hasFail ? "FAIL" : hasWarn ? "WARNING" : "PASS",
    summary: `Bootloader: ${bootloaderText} • Verified Boot: ${vboot.label.split(" (")[0]} • Root: ${rootText.split(" (")[0]}.`,
    buyerGuidance:
      "For a stock retail phone, expect Bootloader: Locked, Verified Boot: Green, and Root: Not detected. If an OEM hides bootloader properties, check Settings > Developer Options > OEM unlocking.",
    items,
    limitations: [
      "PHONE TRUTH never bypasses locks, never unlocks bootloaders, and never accesses private accounts or billing data.",
    ],
    evidence: "PROPERTY",
    commands,
    rawValues,
  };
}
