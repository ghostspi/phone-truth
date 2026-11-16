import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

export async function collectDisplay(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const [size, density, dumpsys] = await Promise.all([
    runReadOnlyCommand(adb, "wm size", 5000),
    runReadOnlyCommand(adb, "wm density", 5000),
    runReadOnlyCommand(adb, "dumpsys display", 8000),
  ]);

  for (const r of [size, density, dumpsys]) {
    commands.push({
      command: r.record.command,
      ok: r.record.ok,
      outputPreview: r.output.slice(0, 120),
      error: r.record.error,
    });
  }

  const physicalRes = size.ok ? size.output.match(/Physical size:\s*(\d+x\d+)/)?.[1] ?? "" : "";
  const overrideRes = size.ok ? size.output.match(/Override size:\s*(\d+x\d+)/)?.[1] ?? "" : "";
  const physicalDpi = density.ok ? density.output.match(/Physical density:\s*(\d+)/)?.[1] ?? "" : "";
  const overrideDpi = density.ok ? density.output.match(/Override density:\s*(\d+)/)?.[1] ?? "" : "";
  const refreshRate = dumpsys.ok ? dumpsys.output.match(/refreshRate[=:]\s*([\d.]+)/i)?.[1] ?? "" : "";

  if (physicalRes) rawValues["physicalResolution"] = physicalRes;
  if (overrideRes) rawValues["logicalResolution"] = overrideRes;
  if (physicalDpi) rawValues["physicalDensityDpi"] = Number(physicalDpi);
  if (refreshRate) rawValues["refreshRateHz"] = Number(Number(refreshRate).toFixed(1));

  let approxInches = "";
  if (physicalRes && physicalDpi) {
    const [w, h] = physicalRes.split("x").map(Number);
    const dpi = Number(physicalDpi);
    if (w > 0 && h > 0 && dpi > 0) {
      const diagPx = Math.hypot(w, h);
      approxInches = `${(diagPx / dpi).toFixed(2)} inches (estimated from resolution & DPI)`;
      rawValues["estimatedDiagonalInches"] = Number((diagPx / dpi).toFixed(2));
    }
  }

  const items: InspectedItem[] = [
    {
      key: "physicalResolution",
      label: "Physical Display Resolution",
      value: physicalRes || "Unavailable",
      status: physicalRes ? "PASS" : "UNAVAILABLE",
      statusReason: physicalRes ? "Native panel resolution reported by WindowManager." : "Could not read wm size.",
      evidence: physicalRes ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Native pixel dimensions reported to Android WindowManager",
      whatItMeans: physicalRes
        ? `Android is configured for a native resolution of ${physicalRes} pixels.`
        : "Not exposed.",
      whyItMatters: "Low-cost replacement screens or counterfeit phones sometimes run lower resolutions than advertised (e.g., 720p instead of 1080p/1440p).",
      rawPropertyOrSource: `wm size -> Physical size: ${physicalRes || "unavailable"}`,
    },
    {
      key: "logicalResolution",
      label: "Logical / Override Resolution",
      value: overrideRes || (physicalRes ? `${physicalRes} (Native — no override active)` : "Unavailable"),
      status: overrideRes ? "WARNING" : physicalRes ? "INFO" : "UNAVAILABLE",
      statusReason: overrideRes
        ? "A software resolution override is active (may be battery saver or display scaling)."
        : "Display is running at its native logical resolution.",
      evidence: size.ok ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Active software resolution scaling override",
      whatItMeans: overrideRes
        ? `Software is scaling the screen to ${overrideRes} instead of ${physicalRes}.`
        : "No resolution downscaling is active.",
      whyItMatters: "Confirms whether a battery-saver resolution reduction is turned on.",
      rawPropertyOrSource: `wm size -> Override size: ${overrideRes || "none"}`,
    },
    {
      key: "density",
      label: "Display Pixel Density",
      value: physicalDpi
        ? `${physicalDpi} DPI${overrideDpi ? ` (Override: ${overrideDpi} DPI)` : ""}`
        : "Unavailable",
      status: physicalDpi ? "INFO" : "UNAVAILABLE",
      statusReason: physicalDpi ? "Screen pixel density retrieved." : "Unavailable.",
      evidence: physicalDpi ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Physical screen pixel density (DPI)",
      whatItMeans: physicalDpi ? `Panel density is configured at ${physicalDpi} dots per inch.` : "Not reported.",
      whyItMatters: "Higher DPI produces sharper text and icons.",
      rawPropertyOrSource: `wm density -> Physical density: ${physicalDpi || "unavailable"}`,
    },
    {
      key: "refreshRate",
      label: "Refresh Rate",
      value: refreshRate ? `${Number(refreshRate).toFixed(0)} Hz` : "Unavailable",
      status: refreshRate ? "INFO" : "UNAVAILABLE",
      statusReason: refreshRate ? "Active display refresh rate retrieved." : "Refresh rate not parsed from dumpsys display.",
      evidence: refreshRate ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Active display refresh rate",
      whatItMeans: refreshRate
        ? `The screen is currently refreshing at ${Number(refreshRate).toFixed(0)} Hz (note: LTPO/adaptive screens may drop to 60 Hz when idle).`
        : "Not exposed.",
      whyItMatters: "Verifies whether 90 Hz / 120 Hz smooth display modes are supported and active.",
      rawPropertyOrSource: `dumpsys display -> refreshRate=${refreshRate || "unavailable"}`,
    },
    {
      key: "screenSize",
      label: "Estimated Screen Size",
      value: approxInches || "Unavailable",
      status: approxInches ? "INFO" : "UNAVAILABLE",
      statusReason: approxInches ? "Calculated from native pixels and DPI." : "Insufficient metrics to estimate size.",
      evidence: approxInches ? "DERIVED" : "UNAVAILABLE",
      whatWasChecked: "Diagonal screen size derived from pixel dimensions and DPI",
      whatItMeans: approxInches
        ? `Approximate diagonal size is ${approxInches}.`
        : "Cannot be calculated without both resolution and DPI.",
      whyItMatters: "Cross-checks whether the display dimensions match the advertised screen size.",
      rawPropertyOrSource: "Derived from wm size + wm density",
    },
    {
      key: "panelQuality",
      label: "Physical Panel Quality & Touch Verification",
      value: "Requires Guided Manual Tests",
      status: "WARNING",
      statusReason: "Software resolution cannot detect dead pixels, OLED burn-in, backlight bleed, or dead touch zones.",
      evidence: "MANUAL",
      whatWasChecked: "Visual panel defects and digitizer responsiveness",
      whatItMeans: "Use the Hardware Tests page to run Dead Pixel, Touch Screen, Color, Brightness, and Uniformity checks.",
      whyItMatters: "Used and refurbished phones frequently suffer from screen burn-in or unresponsive touch strips.",
      rawPropertyOrSource: "Manual visual & touch inspection required",
    },
  ];

  return {
    id: "display",
    title: "Display",
    subtitle: "Native resolution, scaling override, DPI, refresh rate, and panel test status",
    status: physicalRes ? "WARNING" : "UNAVAILABLE",
    summary: physicalRes
      ? `Native resolution: ${physicalRes} at ${physicalDpi || "?"} DPI${refreshRate ? `, ${Number(refreshRate).toFixed(0)} Hz` : ""}. Manual panel tests are required to confirm screen quality.`
      : "Display metrics could not be retrieved.",
    buyerGuidance:
      "Software-reported resolution does NOT prove the physical screen is an original OLED/LCD panel. Always run the interactive Dead Pixel, Color, Uniformity, and Touch tests in Hardware Tests.",
    items,
    limitations: [
      "Aftermarket replacement screens can report the exact same resolution to Android while having poorer brightness, color accuracy, or touch sensitivity.",
      "Adaptive refresh displays may report 60 Hz when sitting idle on a static screen.",
    ],
    evidence: physicalRes ? "DIRECT" : "UNAVAILABLE",
    commands,
    rawValues,
  };
}
