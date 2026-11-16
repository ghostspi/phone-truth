import type {
  DiagnosticFinding,
  InspectionStatus,
  OverallAssessment,
} from "../types/diagnostic";
import type { AdvertisedSpecs } from "../types/device";

export interface SpecComparisonRow {
  field: string;
  advertised: string;
  retrieved: string;
  status: InspectionStatus;
  explanation: string;
  buyerAdvice: string;
}

function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function getRaw(findings: DiagnosticFinding[], id: DiagnosticFinding["id"], key: string): string {
  const f = findings.find((item) => item.id === id);
  const val = f?.rawValues?.[key];
  return val !== undefined && val !== null ? String(val).trim() : "";
}

export function compareAdvertisedSpecs(
  specs: AdvertisedSpecs,
  findings: DiagnosticFinding[],
): SpecComparisonRow[] {
  const rows: SpecComparisonRow[] = [];

  // 1. Manufacturer
  const retMfg = getRaw(findings, "identity", "ro.product.manufacturer");
  if (specs.manufacturer.trim()) {
    if (!retMfg) {
      rows.push({
        field: "Manufacturer",
        advertised: specs.manufacturer.trim(),
        retrieved: "Unavailable",
        status: "UNAVAILABLE",
        explanation: "Android did not expose the manufacturer property.",
        buyerAdvice: "Verify the manufacturer name in Settings > About phone.",
      });
    } else if (norm(retMfg).includes(norm(specs.manufacturer)) || norm(specs.manufacturer).includes(norm(retMfg))) {
      rows.push({
        field: "Manufacturer",
        advertised: specs.manufacturer.trim(),
        retrieved: retMfg,
        status: "PASS",
        explanation: "Retrieved manufacturer matches the advertised brand.",
        buyerAdvice: "Consistent with the listing.",
      });
    } else {
      rows.push({
        field: "Manufacturer",
        advertised: specs.manufacturer.trim(),
        retrieved: retMfg,
        status: "FAIL",
        explanation: `Phone reports "${retMfg}", which contradicts "${specs.manufacturer.trim()}".`,
        buyerAdvice: "Stop and clarify with the seller—this may be a different brand or a re-shelled device.",
      });
    }
  }

  // 2. Model
  const retModel = getRaw(findings, "identity", "ro.product.model");
  if (specs.model.trim()) {
    if (!retModel) {
      rows.push({
        field: "Model Number",
        advertised: specs.model.trim(),
        retrieved: "Unavailable",
        status: "UNAVAILABLE",
        explanation: "Model property was not readable.",
        buyerAdvice: "Check the model number printed on the SIM tray or Settings > About phone.",
      });
    } else if (norm(retModel).includes(norm(specs.model)) || norm(specs.model).includes(norm(retModel))) {
      rows.push({
        field: "Model Number",
        advertised: specs.model.trim(),
        retrieved: retModel,
        status: "PASS",
        explanation: "Retrieved model identifier matches the seller's advertised model.",
        buyerAdvice: "Consistent with the listing.",
      });
    } else {
      rows.push({
        field: "Model Number",
        advertised: specs.model.trim(),
        retrieved: retModel,
        status: "FAIL",
        explanation: `Retrieved model (${retModel}) conflicts with the seller's advertised model (${specs.model.trim()}).`,
        buyerAdvice: "Verify regional model variants or ask the seller why the model code differs.",
      });
    }
  }

  // 3. Internal Storage
  const retStorageGb = Number(getRaw(findings, "storage", "dataTotalGB"));
  if (specs.storageGB.trim()) {
    const advGb = Number(specs.storageGB);
    if (!Number.isFinite(advGb) || advGb <= 0) {
      rows.push({
        field: "Internal Storage",
        advertised: specs.storageGB,
        retrieved: retStorageGb ? `${retStorageGb.toFixed(2)} GB (/data)` : "Unavailable",
        status: "WARNING",
        explanation: "Enter a numeric storage size in GB (for example: 128 or 256).",
        buyerAdvice: "Re-enter the advertised storage as a number.",
      });
    } else if (!retStorageGb) {
      rows.push({
        field: "Internal Storage",
        advertised: `${advGb} GB`,
        retrieved: "Unavailable",
        status: "UNAVAILABLE",
        explanation: "Could not read /data partition size.",
        buyerAdvice: "Inspect storage manually in Settings > Storage.",
      });
    } else {
      const ratio = retStorageGb / advGb;
      if (ratio >= 0.78 && ratio <= 1.05) {
        rows.push({
          field: "Internal Storage",
          advertised: `${advGb} GB`,
          retrieved: `${retStorageGb.toFixed(2)} GB formatted user partition`,
          status: "PASS",
          explanation: "Formatted /data partition aligns with advertised storage after Android OS and system partition overhead.",
          buyerAdvice: "Note that formatted partition size does not independently prove raw NAND/UFS chip capacity.",
        });
      } else if (ratio < 0.78) {
        rows.push({
          field: "Internal Storage",
          advertised: `${advGb} GB`,
          retrieved: `${retStorageGb.toFixed(2)} GB formatted user partition`,
          status: "FAIL",
          explanation: `User data partition (${retStorageGb.toFixed(2)} GB) is substantially smaller than expected for a ${advGb} GB phone.`,
          buyerAdvice: "High risk that this is a lower-storage variant than advertised.",
        });
      } else {
        rows.push({
          field: "Internal Storage",
          advertised: `${advGb} GB`,
          retrieved: `${retStorageGb.toFixed(2)} GB formatted user partition`,
          status: "WARNING",
          explanation: "Reported partition is larger than the entered advertised figure.",
          buyerAdvice: "Confirm whether the phone is actually a higher-capacity model.",
        });
      }
    }
  }

  // 4. Physical RAM
  const retRamGb = Number(getRaw(findings, "ram", "memTotalGB"));
  if (specs.ramGB.trim()) {
    const advRam = Number(specs.ramGB);
    if (!Number.isFinite(advRam) || advRam <= 0) {
      rows.push({
        field: "Physical RAM",
        advertised: specs.ramGB,
        retrieved: retRamGb ? `${retRamGb.toFixed(2)} GB` : "Unavailable",
        status: "WARNING",
        explanation: "Enter advertised physical RAM as a number in GB (e.g., 6, 8, 12).",
        buyerAdvice: "Do not include virtual 'RAM Plus' / 'Extended RAM' when entering physical RAM.",
      });
    } else if (!retRamGb) {
      rows.push({
        field: "Physical RAM",
        advertised: `${advRam} GB`,
        retrieved: "Unavailable",
        status: "UNAVAILABLE",
        explanation: "Kernel memory information (/proc/meminfo) was unavailable.",
        buyerAdvice: "Check Settings > About phone for RAM details.",
      });
    } else {
      const reserved = advRam - retRamGb;
      if (reserved >= -0.3 && reserved <= Math.max(1.8, advRam * 0.22)) {
        rows.push({
          field: "Physical RAM",
          advertised: `${advRam} GB`,
          retrieved: `${retRamGb.toFixed(2)} GB usable physical RAM`,
          status: "PASS",
          explanation: "Advertised RAM is consistent with the kernel-reported memory after normal GPU/modem hardware reservations.",
          buyerAdvice: "Virtual swap/ZRAM is excluded from this figure.",
        });
      } else if (reserved > Math.max(1.8, advRam * 0.22)) {
        rows.push({
          field: "Physical RAM",
          advertised: `${advRam} GB`,
          retrieved: `${retRamGb.toFixed(2)} GB usable physical RAM`,
          status: "FAIL",
          explanation: `Kernel-reported physical RAM (${retRamGb.toFixed(2)} GB) is significantly lower than ${advRam} GB. Seller may be counting virtual RAM expansion.`,
          buyerAdvice: "Ask the seller to clarify physical RAM vs. software RAM expansion.",
        });
      } else {
        rows.push({
          field: "Physical RAM",
          advertised: `${advRam} GB`,
          retrieved: `${retRamGb.toFixed(2)} GB usable physical RAM`,
          status: "WARNING",
          explanation: "Kernel reports more physical RAM than entered.",
          buyerAdvice: "Confirm the exact memory configuration of this unit.",
        });
      }
    }
  }

  // 5. Android Version
  const retAndroid = getRaw(findings, "identity", "ro.build.version.release");
  if (specs.androidVersion.trim()) {
    if (!retAndroid) {
      rows.push({
        field: "Android Version",
        advertised: specs.androidVersion.trim(),
        retrieved: "Unavailable",
        status: "UNAVAILABLE",
        explanation: "Android release version was not readable.",
        buyerAdvice: "Check Settings > About phone > Android version.",
      });
    } else if (norm(retAndroid) === norm(specs.androidVersion) || norm(retAndroid).startsWith(norm(specs.androidVersion))) {
      rows.push({
        field: "Android Version",
        advertised: specs.androidVersion.trim(),
        retrieved: `Android ${retAndroid}`,
        status: "PASS",
        explanation: "Installed Android OS version matches the advertised version.",
        buyerAdvice: "Consistent with the listing.",
      });
    } else {
      rows.push({
        field: "Android Version",
        advertised: specs.androidVersion.trim(),
        retrieved: `Android ${retAndroid}`,
        status: "WARNING",
        explanation: `Phone runs Android ${retAndroid}, while listing stated ${specs.androidVersion.trim()}.`,
        buyerAdvice: "The phone may have received an OS update or run a different firmware build.",
      });
    }
  }

  // 6. Display Resolution
  const retRes = getRaw(findings, "display", "physicalResolution");
  if (specs.displayResolution.trim()) {
    if (!retRes) {
      rows.push({
        field: "Display Resolution",
        advertised: specs.displayResolution.trim(),
        retrieved: "Unavailable",
        status: "UNAVAILABLE",
        explanation: "Physical display resolution was not exposed.",
        buyerAdvice: "Run the manual display tests in Hardware Tests.",
      });
    } else if (norm(retRes) === norm(specs.displayResolution)) {
      rows.push({
        field: "Display Resolution",
        advertised: specs.displayResolution.trim(),
        retrieved: retRes,
        status: "PASS",
        explanation: "Reported physical resolution matches the advertised resolution.",
        buyerAdvice: "Run manual pixel, color, and touch tests to verify panel quality.",
      });
    } else {
      rows.push({
        field: "Display Resolution",
        advertised: specs.displayResolution.trim(),
        retrieved: retRes,
        status: "WARNING",
        explanation: `Reported physical resolution (${retRes}) differs from ${specs.displayResolution.trim()}.`,
        buyerAdvice: "Confirm whether the phone is in a power-saving resolution mode or is a different model.",
      });
    }
  }

  return rows;
}

export function computeOverallAssessment(
  findings: DiagnosticFinding[],
  comparisons: SpecComparisonRow[],
): OverallAssessment {
  if (findings.length === 0) {
    return "INCOMPLETE INSPECTION";
  }

  const hasFail =
    findings.some((f) => f.status === "FAIL") ||
    comparisons.some((c) => c.status === "FAIL");

  if (hasFail) {
    return "POTENTIAL DISCREPANCIES FOUND";
  }

  const hasWarningOrMissing =
    findings.some((f) => f.status === "WARNING" || f.status === "UNAVAILABLE") ||
    comparisons.some((c) => c.status === "WARNING" || c.status === "UNAVAILABLE");

  if (hasWarningOrMissing) {
    return "ADDITIONAL VERIFICATION REQUIRED";
  }

  return "NO MAJOR DISCREPANCIES DETECTED";
}
