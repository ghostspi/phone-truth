import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

const IDENTITY_PROPS = [
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
  "ro.boot.flash.locked",
  "ro.boot.verifiedbootstate",
];

export async function collectIdentity(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  for (const key of IDENTITY_PROPS) {
    const res = await runReadOnlyCommand(adb, `getprop ${key}`, 5000);
    commands.push({
      command: res.record.command,
      ok: res.record.ok,
      outputPreview: res.output ? res.output.slice(0, 120) : undefined,
      error: res.record.error,
    });
    if (res.ok && res.output) {
      rawValues[key] = res.output;
    }
  }

  const get = (k: string) => (rawValues[k] ? String(rawValues[k]) : "");

  const mfg = get("ro.product.manufacturer");
  const model = get("ro.product.model");
  const brand = get("ro.product.brand");
  const codename = get("ro.product.device");
  const androidVer = get("ro.build.version.release");
  const sdkVer = get("ro.build.version.sdk");
  const patch = get("ro.build.version.security_patch");
  const fingerprint = get("ro.build.fingerprint");
  const hardware = get("ro.hardware");
  const platform = get("ro.board.platform");
  const socMfg = get("ro.soc.manufacturer");
  const socModel = get("ro.soc.model");
  const flashLocked = get("ro.boot.flash.locked");

  let bootloaderLabel = "Unavailable";
  let bootloaderStatus: InspectedItem["status"] = "UNAVAILABLE";
  let bootloaderReason = "Android did not expose the bootloader lock property to shell.";
  if (flashLocked === "1") {
    bootloaderLabel = "Locked";
    bootloaderStatus = "PASS";
    bootloaderReason = "Bootloader reports locked state (standard factory condition).";
  } else if (flashLocked === "0") {
    bootloaderLabel = "Unlocked";
    bootloaderStatus = "WARNING";
    bootloaderReason = "Bootloader reports unlocked state—custom firmware may have been flashed.";
  }

  const items: InspectedItem[] = [
    {
      key: "manufacturer",
      label: "Manufacturer",
      value: mfg || "Unavailable",
      status: mfg ? "PASS" : "UNAVAILABLE",
      statusReason: mfg ? "Manufacturer identity successfully retrieved." : "Manufacturer property not exposed.",
      evidence: mfg ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "System manufacturer identifier",
      whatItMeans: mfg ? `The device firmware identifies its manufacturer as ${mfg}.` : "Manufacturer property could not be read.",
      whyItMatters: "Confirms the brand reported by the operating system matches the physical phone branding.",
      rawPropertyOrSource: `ro.product.manufacturer = ${mfg || "(empty)"}`,
    },
    {
      key: "model",
      label: "Phone Model",
      value: model || "Unavailable",
      status: model ? "PASS" : "UNAVAILABLE",
      statusReason: model ? "Model information successfully retrieved." : "Model property not exposed.",
      evidence: model ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Official hardware model code",
      whatItMeans: model ? `The operating system identifies this unit as model ${model}.` : "Model number was unavailable.",
      whyItMatters: "Used to verify regional variants, 5G band support, and whether the listing matches the actual unit.",
      rawPropertyOrSource: `ro.product.model = ${model || "(empty)"}`,
    },
    {
      key: "brand",
      label: "Brand",
      value: brand || "Unavailable",
      status: brand ? "INFO" : "UNAVAILABLE",
      statusReason: brand ? "Commercial brand name retrieved." : "Brand property not exposed.",
      evidence: brand ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Commercial marketing brand",
      whatItMeans: brand ? `Marketed under the ${brand} brand.` : "Not reported.",
      whyItMatters: "Helps distinguish sub-brands (such as Redmi/POCO under Xiaomi or iQOO under Vivo).",
      rawPropertyOrSource: `ro.product.brand = ${brand || "(empty)"}`,
    },
    {
      key: "codename",
      label: "Device Codename",
      value: codename || "Unavailable",
      status: codename ? "INFO" : "UNAVAILABLE",
      statusReason: codename ? "Internal board/device codename retrieved." : "Device codename not exposed.",
      evidence: codename ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Internal engineering codename",
      whatItMeans: codename ? `Internal hardware codename is "${codename}".` : "Not reported.",
      whyItMatters: "Even when marketing names vary by country, the internal codename identifies the exact hardware board.",
      rawPropertyOrSource: `ro.product.device = ${codename || "(empty)"}`,
    },
    {
      key: "androidVersion",
      label: "Android Version",
      value: androidVer ? `Android ${androidVer}` : "Unavailable",
      status: androidVer ? "PASS" : "UNAVAILABLE",
      statusReason: androidVer ? `Running Android ${androidVer}.` : "Android release version unavailable.",
      evidence: androidVer ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Installed Android OS release",
      whatItMeans: androidVer ? `This phone is running Android ${androidVer}.` : "OS release could not be read.",
      whyItMatters: "Determines app compatibility and whether the phone has received promised OS upgrades.",
      rawPropertyOrSource: `ro.build.version.release = ${androidVer || "(empty)"}`,
    },
    {
      key: "sdkVersion",
      label: "Android SDK Version",
      value: sdkVer ? `API Level ${sdkVer}` : "Unavailable",
      status: sdkVer ? "INFO" : "UNAVAILABLE",
      statusReason: sdkVer ? `Android API level ${sdkVer} reported.` : "SDK level not exposed.",
      evidence: sdkVer ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Android API / SDK level",
      whatItMeans: sdkVer ? `Internal platform API level is ${sdkVer}.` : "Not reported.",
      whyItMatters: "Provides an exact numeric check against spoofed Android version strings on counterfeit phones.",
      rawPropertyOrSource: `ro.build.version.sdk = ${sdkVer || "(empty)"}`,
    },
    {
      key: "securityPatch",
      label: "Security Update",
      value: patch || "Unavailable",
      status: patch ? "INFO" : "UNAVAILABLE",
      statusReason: patch ? `Security patch level dated ${patch}.` : "Security patch date not exposed.",
      evidence: patch ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Android security patch date",
      whatItMeans: patch ? `Last security patch integrated into firmware: ${patch}.` : "Not reported.",
      whyItMatters: "Shows how recently the device received official security updates.",
      rawPropertyOrSource: `ro.build.version.security_patch = ${patch || "(empty)"}`,
    },
    {
      key: "hardwarePlatform",
      label: "Hardware Platform",
      value: platform || hardware || "Unavailable",
      status: platform || hardware ? "INFO" : "UNAVAILABLE",
      statusReason: platform || hardware ? "Board platform identifier retrieved." : "Platform identifier restricted.",
      evidence: platform || hardware ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "SoC / motherboard platform code",
      whatItMeans: platform || hardware ? `Board platform reports "${platform || hardware}".` : "Not exposed.",
      whyItMatters: "Cross-checks the processor family against the advertised chipset.",
      rawPropertyOrSource: `ro.board.platform = ${platform || "(empty)"}, ro.hardware = ${hardware || "(empty)"}`,
    },
    {
      key: "chipsetManufacturer",
      label: "Chipset Manufacturer",
      value: socMfg || "Unavailable",
      status: socMfg ? "INFO" : "UNAVAILABLE",
      statusReason: socMfg ? "SoC vendor reported by Android." : "OEM did not populate ro.soc.manufacturer.",
      evidence: socMfg ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "System-on-Chip (SoC) vendor",
      whatItMeans: socMfg ? `Chipset vendor is reported as ${socMfg}.` : "Not populated on this Android build.",
      whyItMatters: "Confirms whether the phone uses Qualcomm, MediaTek, Samsung Exynos, Google Tensor, or Unisoc silicon.",
      rawPropertyOrSource: `ro.soc.manufacturer = ${socMfg || "(empty)"}`,
    },
    {
      key: "chipsetModel",
      label: "Chipset Model",
      value: socModel || "Unavailable",
      status: socModel ? "INFO" : "UNAVAILABLE",
      statusReason: socModel ? "SoC model identifier retrieved." : "OEM did not expose ro.soc.model.",
      evidence: socModel ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "System-on-Chip (SoC) model code",
      whatItMeans: socModel ? `Reported processor part code is ${socModel}.` : "Not populated by this OEM.",
      whyItMatters: "Helps detect clone devices advertising flagship processors while running low-end chips.",
      rawPropertyOrSource: `ro.soc.model = ${socModel || "(empty)"}`,
    },
    {
      key: "bootloader",
      label: "Bootloader Status",
      value: bootloaderLabel,
      status: bootloaderStatus,
      statusReason: bootloaderReason,
      evidence: flashLocked ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Bootloader flash lock state",
      whatItMeans: bootloaderReason,
      whyItMatters: "An unlocked bootloader means third-party software or modified system partitions could have been installed.",
      rawPropertyOrSource: `ro.boot.flash.locked = ${flashLocked || "(empty)"}`,
    },
    {
      key: "fingerprint",
      label: "Build Fingerprint",
      value: fingerprint || "Unavailable",
      status: fingerprint ? "INFO" : "UNAVAILABLE",
      statusReason: fingerprint ? "Full firmware build fingerprint retrieved." : "Build fingerprint unavailable.",
      evidence: fingerprint ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Unique Android firmware build signature",
      whatItMeans: fingerprint ? "Identifies the exact OEM software release, build ID, and signing keys." : "Not reported.",
      whyItMatters: "Used to verify whether the firmware is an official retail release or a test/custom build.",
      rawPropertyOrSource: `ro.build.fingerprint = ${fingerprint || "(empty)"}`,
    },
  ];

  const retrievedCount = Object.keys(rawValues).length;

  return {
    id: "identity",
    title: "Device Identity",
    subtitle: "Manufacturer, model, OS release, chipset properties, and firmware signature",
    status: retrievedCount >= 4 ? "PASS" : "WARNING",
    summary: retrievedCount >= 4
      ? `Retrieved ${retrievedCount} core identity properties for ${mfg || "Unknown"} ${model || "Device"}.`
      : "Limited identity properties were exposed by this device.",
    buyerGuidance:
      "Compare the retrieved model number, Android API level, and chipset codes against the seller's listing. Note that firmware properties are strong evidence, not cryptographic proof.",
    items,
    limitations: [
      "Android build properties can be altered on rooted or custom-ROM devices.",
      "Some manufacturers leave ro.soc.model or ro.boot.flash.locked blank for non-root shell queries.",
    ],
    evidence: "PROPERTY",
    commands,
    rawValues,
  };
}
