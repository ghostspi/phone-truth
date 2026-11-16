import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

function translateChargingStatus(code: string | null): string {
  switch (code) {
    case "2":
      return "Charging";
    case "3":
      return "Discharging (Running on battery)";
    case "4":
      return "Not charging";
    case "5":
      return "Full";
    default:
      return code ? `Unknown status (${code})` : "Unavailable";
  }
}

function translateHealthCode(code: string | null): { label: string; ok: boolean } {
  switch (code) {
    case "2":
      return { label: "Good (Android BatteryService reports normal operating condition)", ok: true };
    case "3":
      return { label: "Overheat (Battery temperature exceeds safe threshold)", ok: false };
    case "4":
      return { label: "Dead (Battery reported as failed)", ok: false };
    case "5":
      return { label: "Over voltage", ok: false };
    case "6":
      return { label: "Unspecified failure", ok: false };
    case "7":
      return { label: "Cold (Battery temperature too low)", ok: false };
    default:
      return { label: code ? `Unrecognized health code (${code})` : "Not reported", ok: false };
  }
}

export async function collectBattery(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const dumpsys = await runReadOnlyCommand(adb, "dumpsys battery", 8000);
  commands.push({
    command: dumpsys.record.command,
    ok: dumpsys.record.ok,
    outputPreview: dumpsys.output.slice(0, 140),
    error: dumpsys.record.error,
  });

  const pick = (label: string) => {
    if (!dumpsys.ok) return null;
    const regex = new RegExp(`^\\s*${label}:\\s*(.+)$`, "im");
    return dumpsys.output.match(regex)?.[1]?.trim() ?? null;
  };

  const level = pick("level");
  const tempRaw = pick("temperature");
  const voltageRaw = pick("voltage");
  const statusCode = pick("status");
  const healthCode = pick("health");
  const tech = pick("technology");
  const acPowered = pick("AC powered");
  const usbPowered = pick("USB powered");
  const wirelessPowered = pick("Wireless powered");
  const chargeCounter = pick("Charge counter");

  if (level) rawValues["chargeLevelPct"] = Number(level);
  if (tempRaw) rawValues["temperatureC"] = Number((Number(tempRaw) / 10).toFixed(1));
  if (voltageRaw) rawValues["voltageMv"] = Number(voltageRaw);
  if (statusCode) rawValues["chargingStatusCode"] = statusCode;
  if (healthCode) rawValues["healthStatusCode"] = healthCode;
  if (tech) rawValues["technology"] = tech;

  let chargingSource = "Battery (Unplugged)";
  if (acPowered === "true") chargingSource = "AC Wall Charger";
  else if (usbPowered === "true") chargingSource = "USB Cable (Computer / Port)";
  else if (wirelessPowered === "true") chargingSource = "Wireless Charger";
  else if (!dumpsys.ok) chargingSource = "Unavailable";

  const sysfsNodes: Record<string, string> = {
    cycle_count: "/sys/class/power_supply/battery/cycle_count",
    charge_full: "/sys/class/power_supply/battery/charge_full",
    charge_full_design: "/sys/class/power_supply/battery/charge_full_design",
    current_now: "/sys/class/power_supply/battery/current_now",
  };

  const sysfsValues: Record<string, number> = {};
  for (const [key, path] of Object.entries(sysfsNodes)) {
    const res = await runReadOnlyCommand(adb, `cat ${path}`, 4000);
    commands.push({
      command: res.record.command,
      ok: res.record.ok,
      outputPreview: res.output.slice(0, 60),
      error: res.record.error,
    });
    if (res.ok && /^-?\d+$/.test(res.output.trim())) {
      const num = Number(res.output.trim());
      sysfsValues[key] = num;
      rawValues[key] = num;
    }
  }

  const normalizeMah = (v?: number) => {
    if (!v || v <= 0) return 0;
    return v > 100000 ? v / 1000 : v;
  };

  const designMah = normalizeMah(sysfsValues.charge_full_design);
  const fullMah = normalizeMah(sysfsValues.charge_full);
  const cycleCount = sysfsValues.cycle_count;
  const healthTranslated = translateHealthCode(healthCode);

  let derivedHealthPct: number | null = null;
  if (designMah > 0 && fullMah > 0) {
    derivedHealthPct = (fullMah / designMah) * 100;
    rawValues["derivedBatteryHealthPct"] = Number(derivedHealthPct.toFixed(1));
  }

  const items: InspectedItem[] = [
    {
      key: "chargeLevel",
      label: "Current Battery Charge",
      value: level ? `${level}%` : "Unavailable",
      status: level ? "INFO" : "UNAVAILABLE",
      statusReason: level
        ? "Current state of charge retrieved. Note: charge percentage is NOT battery health."
        : "Battery charge level unavailable.",
      evidence: level ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Current battery charge percentage",
      whatItMeans: level
        ? `The battery is currently charged to ${level}%. This only tells you how full it is right now—not how worn out the battery is.`
        : "Could not read battery level.",
      whyItMatters: "Confirms the battery holds charge and responds to the USB power connection.",
      rawPropertyOrSource: `dumpsys battery -> level: ${level ?? "unavailable"}`,
    },
    {
      key: "chargingStatus",
      label: "Charging Status & Source",
      value: dumpsys.ok ? `${translateChargingStatus(statusCode)} (${chargingSource})` : "Unavailable",
      status: dumpsys.ok ? "INFO" : "UNAVAILABLE",
      statusReason: dumpsys.ok ? "Charging state and power source decoded." : "Unavailable.",
      evidence: dumpsys.ok ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Battery charging state and active power source",
      whatItMeans: dumpsys.ok
        ? `Status is "${translateChargingStatus(statusCode)}" via ${chargingSource}.`
        : "Not exposed.",
      whyItMatters: "Verifies that the USB charging circuit detects incoming power properly.",
      rawPropertyOrSource: `status=${statusCode ?? "?"}, USB=${usbPowered ?? "?"}, AC=${acPowered ?? "?"}`,
    },
    {
      key: "healthStatus",
      label: "Android Battery Health Indicator",
      value: dumpsys.ok ? healthTranslated.label : "Unavailable",
      status: !dumpsys.ok ? "UNAVAILABLE" : healthTranslated.ok ? "PASS" : "FAIL",
      statusReason: !dumpsys.ok
        ? "Battery health status unavailable."
        : healthTranslated.ok
          ? "Android reports no critical battery fault (overheat, dead, or over-voltage)."
          : "Android reports an abnormal battery condition.",
      evidence: dumpsys.ok ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Android BatteryService health flag",
      whatItMeans: dumpsys.ok
        ? `${healthTranslated.label}. Note that Android's 'Good' flag only checks for hardware faults—it does not measure gradual capacity wear.`
        : "Not exposed.",
      whyItMatters: "Immediately flags swollen, overheating, or failing batteries.",
      rawPropertyOrSource: `dumpsys battery -> health: ${healthCode ?? "unavailable"}`,
    },
    {
      key: "derivedHealth",
      label: "Battery Capacity Health (Wear Estimate)",
      value:
        derivedHealthPct !== null
          ? `${derivedHealthPct.toFixed(1)}% (${fullMah.toFixed(0)} mAh / ${designMah.toFixed(0)} mAh)`
          : "Not Verified (Restricted by Android / OEM)",
      status:
        derivedHealthPct === null
          ? "WARNING"
          : derivedHealthPct >= 80
            ? "PASS"
            : "WARNING",
      statusReason:
        derivedHealthPct === null
          ? "Battery health could not be independently verified because kernel capacity nodes are restricted without root."
          : derivedHealthPct >= 80
            ? "Derived full-charge capacity is at least 80% of design capacity."
            : "Derived capacity is below 80% of original design capacity, indicating noticeable battery wear.",
      evidence: derivedHealthPct !== null ? "DERIVED" : "UNAVAILABLE",
      whatWasChecked: "Kernel charge_full vs. charge_full_design sysfs counters",
      whatItMeans:
        derivedHealthPct !== null
          ? `Estimated remaining capacity is ${derivedHealthPct.toFixed(1)}% of original design (${fullMah.toFixed(0)} mAh vs ${designMah.toFixed(0)} mAh).`
          : "Android 10+ and most OEMs block non-root access to /sys/class/power_supply/battery/charge_full. PHONE TRUTH never guesses a health percentage.",
      whyItMatters: "Used phones with heavy wear may need a battery replacement soon.",
      rawPropertyOrSource: `charge_full=${sysfsValues.charge_full ?? "restricted"}, charge_full_design=${sysfsValues.charge_full_design ?? "restricted"}`,
    },
    {
      key: "cycleCount",
      label: "Battery Cycle Count",
      value: cycleCount !== undefined ? `${cycleCount} cycles` : "Unavailable (Restricted by OEM)",
      status: cycleCount !== undefined ? (cycleCount > 800 ? "WARNING" : "INFO") : "UNAVAILABLE",
      statusReason:
        cycleCount !== undefined
          ? `Kernel reports ${cycleCount} charge cycles.`
          : "OEM restricts /sys/class/power_supply/battery/cycle_count without root.",
      evidence: cycleCount !== undefined ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Hardware battery charge cycle counter",
      whatItMeans:
        cycleCount !== undefined
          ? `The battery has completed ${cycleCount} full charge cycles. Most smartphone batteries retain ~80% capacity after 500–800 cycles.`
          : "Not exposed by this phone's kernel permissions.",
      whyItMatters: "High cycle counts indicate heavy prior usage.",
      rawPropertyOrSource: `/sys/class/power_supply/battery/cycle_count = ${cycleCount ?? "(restricted)"}`,
    },
    {
      key: "designCapacity",
      label: "Design Capacity",
      value: designMah > 0 ? `${designMah.toFixed(0)} mAh` : "Unavailable",
      status: designMah > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: designMah > 0 ? "Factory design capacity read from kernel." : "Not exposed without root.",
      evidence: designMah > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Factory rated battery capacity (charge_full_design)",
      whatItMeans: designMah > 0 ? `Factory rated capacity is ${designMah.toFixed(0)} mAh.` : "Restricted by OEM.",
      whyItMatters: "Confirms the installed battery matches the phone's official rated mAh specification.",
      rawPropertyOrSource: `/sys/class/power_supply/battery/charge_full_design`,
    },
    {
      key: "fullCapacity",
      label: "Reported Full-Charge Capacity",
      value: fullMah > 0 ? `${fullMah.toFixed(0)} mAh` : "Unavailable",
      status: fullMah > 0 ? "INFO" : "UNAVAILABLE",
      statusReason: fullMah > 0 ? "Current learned full-charge capacity read from kernel." : "Not exposed without root.",
      evidence: fullMah > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Learned full-charge capacity (charge_full)",
      whatItMeans: fullMah > 0 ? `Battery controller estimates ${fullMah.toFixed(0)} mAh at 100% charge.` : "Restricted by OEM.",
      whyItMatters: "Used together with design capacity to estimate battery wear.",
      rawPropertyOrSource: `/sys/class/power_supply/battery/charge_full`,
    },
    {
      key: "temperature",
      label: "Battery Temperature",
      value: tempRaw ? `${(Number(tempRaw) / 10).toFixed(1)} °C` : "Unavailable",
      status: !tempRaw
        ? "UNAVAILABLE"
        : Number(tempRaw) / 10 > 43
          ? "WARNING"
          : "PASS",
      statusReason: !tempRaw
        ? "Temperature sensor unavailable."
        : Number(tempRaw) / 10 > 43
          ? "Battery temperature is elevated (>43°C)."
          : "Battery temperature is within normal operating range.",
      evidence: tempRaw ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Internal battery thermistor reading",
      whatItMeans: tempRaw
        ? `Current battery temperature is ${(Number(tempRaw) / 10).toFixed(1)} °C (normal idle range is 25°C–38°C).`
        : "Not reported.",
      whyItMatters: "Abnormal heat at idle can point to a degraded battery or board power draw issue.",
      rawPropertyOrSource: `dumpsys battery -> temperature: ${tempRaw ?? "unavailable"} (tenths of °C)`,
    },
    {
      key: "voltage",
      label: "Battery Voltage",
      value: voltageRaw ? `${voltageRaw} mV (${(Number(voltageRaw) / 1000).toFixed(2)} V)` : "Unavailable",
      status: voltageRaw ? "INFO" : "UNAVAILABLE",
      statusReason: voltageRaw ? "Live cell voltage retrieved." : "Unavailable.",
      evidence: voltageRaw ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Live lithium-ion cell voltage",
      whatItMeans: voltageRaw
        ? `Current cell voltage is ${(Number(voltageRaw) / 1000).toFixed(2)} V (healthy Li-ion range is ~3.6 V to 4.4 V).`
        : "Not reported.",
      whyItMatters: "Confirms the fuel-gauge IC is actively reporting live electrical telemetry.",
      rawPropertyOrSource: `dumpsys battery -> voltage: ${voltageRaw ?? "unavailable"} mV`,
    },
    {
      key: "technology",
      label: "Battery Technology & Power Telemetry",
      value: tech ? `${tech}${chargeCounter ? ` • Charge counter: ${chargeCounter} µAh` : ""}` : "Unavailable",
      status: tech ? "INFO" : "UNAVAILABLE",
      statusReason: tech ? "Battery chemistry reported." : "Unavailable.",
      evidence: tech ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Battery cell chemistry & coulomb counter",
      whatItMeans: tech ? `Cell chemistry is reported as ${tech}.` : "Not reported.",
      whyItMatters: "Confirms expected Li-ion / Li-poly chemistry.",
      rawPropertyOrSource: `technology=${tech ?? "?"}, Charge counter=${chargeCounter ?? "?"}`,
    },
  ];

  return {
    id: "battery",
    title: "Battery",
    subtitle: "Charge level, health code translation, voltage, temperature, cycles, and capacity wear",
    status: !dumpsys.ok ? "UNAVAILABLE" : derivedHealthPct === null ? "WARNING" : "PASS",
    summary: dumpsys.ok
      ? `Current charge is ${level ?? "?"}% (${translateChargingStatus(statusCode)}), temperature ${tempRaw ? (Number(tempRaw) / 10).toFixed(1) + "°C" : "?"}, health status: ${healthTranslated.label.split(" (")[0]}.`
      : "Battery telemetry could not be retrieved.",
    buyerGuidance:
      "Never confuse current charge % with battery health. On Android 10+, kernel capacity nodes are often blocked without root—if health shows 'Not Verified', check Settings > Battery or dialer diagnostics if supported by the brand.",
    items,
    limitations: [
      "Android 10 and newer restrict /sys/class/power_supply/battery/charge_full and cycle_count on many phones unless rooted.",
      "Some OEM kernels report charge_full equal to charge_full_design even on aged batteries.",
    ],
    evidence: derivedHealthPct !== null ? "DERIVED" : dumpsys.ok ? "PROPERTY" : "UNAVAILABLE",
    commands,
    rawValues,
  };
}
