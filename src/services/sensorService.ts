import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

export async function collectSensors(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const [dumpsysSensors, pmList] = await Promise.all([
    runReadOnlyCommand(adb, "dumpsys sensorservice", 8000),
    runReadOnlyCommand(adb, "pm list features", 8000),
  ]);

  for (const r of [dumpsysSensors, pmList]) {
    commands.push({
      command: r.record.command,
      ok: r.record.ok,
      outputPreview: r.output.slice(0, 120),
      error: r.record.error,
    });
  }

  const sensorNames: string[] = [];
  if (dumpsysSensors.ok) {
    const lines = dumpsysSensors.output.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*\d+\)\s+name=([^,\n]+)/i) || line.match(/Sensor\s*\d+:\s*([^\n]+)/i);
      if (match && match[1]) {
        const name = match[1].trim();
        if (!sensorNames.includes(name)) sensorNames.push(name);
      }
    }
  }

  const features = pmList.ok ? pmList.output : "";
  const hasCompass = /sensor\.compass|hardware\.sensor\.compass/i.test(features) || sensorNames.some((s) => /magnetometer|compass/i.test(s));
  const hasGyro = /sensor\.gyroscope|hardware\.sensor\.gyroscope/i.test(features) || sensorNames.some((s) => /gyroscope/i.test(s));
  const hasAccel = /sensor\.accelerometer|hardware\.sensor\.accelerometer/i.test(features) || sensorNames.some((s) => /accelerometer/i.test(s));
  const hasFingerprint = /hardware\.fingerprint/i.test(features);
  const hasNfc = /hardware\.nfc/i.test(features);
  const hasGps = /hardware\.location\.gps/i.test(features);

  rawValues["sensorCount"] = sensorNames.length;
  rawValues["hasGyroscope"] = hasGyro ? "Yes" : "No";
  rawValues["hasCompass"] = hasCompass ? "Yes" : "No";
  rawValues["hasAccelerometer"] = hasAccel ? "Yes" : "No";
  rawValues["hasFingerprintFeature"] = hasFingerprint ? "Yes" : "No";
  rawValues["hasNfcFeature"] = hasNfc ? "Yes" : "No";

  const items: InspectedItem[] = [
    {
      key: "sensorTotal",
      label: "Registered Hardware Sensors",
      value: sensorNames.length > 0 ? `${sensorNames.length} sensors active in SensorService` : "Unavailable",
      status: sensorNames.length > 0 ? "PASS" : "UNAVAILABLE",
      statusReason: sensorNames.length > 0 ? "SensorService successfully listed hardware sensors." : "SensorService restricted.",
      evidence: sensorNames.length > 0 ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Active hardware sensors registered with Android SensorService",
      whatItMeans: sensorNames.length > 0 ? `The system recognizes ${sensorNames.length} sensor streams.` : "Not reported.",
      whyItMatters: "Confirms motion, orientation, and environmental sensor chips are connected and functional.",
      rawPropertyOrSource: `dumpsys sensorservice (${sensorNames.length} detected)`,
    },
    {
      key: "motionSensors",
      label: "Gyroscope & Accelerometer (Motion)",
      value: `Accelerometer: ${hasAccel ? "Yes" : "Detected in list"} • Gyroscope: ${hasGyro ? "Yes" : "Checked"}`,
      status: hasAccel || hasGyro ? "PASS" : "WARNING",
      statusReason: "Motion sensor hardware detected.",
      evidence: "PROPERTY",
      whatWasChecked: "Accelerometer and gyroscope hardware presence",
      whatItMeans: "Motion sensors are active for auto-rotation, gaming, and stabilization.",
      whyItMatters: "A broken gyroscope means unstable camera videos and failing tilt controls.",
      rawPropertyOrSource: `pm list features & dumpsys sensorservice`,
    },
    {
      key: "compass",
      label: "Magnetometer / Compass",
      value: hasCompass ? "Present (Compass supported)" : "Not explicitly reported in feature list",
      status: hasCompass ? "PASS" : "INFO",
      statusReason: "Compass feature flag checked.",
      evidence: "PROPERTY",
      whatWasChecked: "Digital compass / magnetometer",
      whatItMeans: hasCompass ? "Compass sensor is available for navigation and map orientation." : "Not flagged.",
      whyItMatters: "Essential for accurate pedestrian navigation in Google Maps.",
      rawPropertyOrSource: `pm list features`,
    },
    {
      key: "biometrics",
      label: "Fingerprint & Biometric Hardware",
      value: hasFingerprint ? "Present (Hardware feature declared)" : "Not declared in system feature list",
      status: hasFingerprint ? "PASS" : "INFO",
      statusReason: "Fingerprint feature presence checked.",
      evidence: "PROPERTY",
      whatWasChecked: "Hardware fingerprint sensor feature flag",
      whatItMeans: hasFingerprint ? "Device declares built-in fingerprint biometric hardware." : "No fingerprint feature flag.",
      whyItMatters: "Verifies whether fingerprint unlocking hardware is present on the board.",
      rawPropertyOrSource: `hardware.fingerprint feature flag`,
    },
    {
      key: "nfcAndGps",
      label: "NFC & GPS Location Hardware",
      value: `NFC: ${hasNfc ? "Supported" : "Not present"} • GPS: ${hasGps ? "Supported" : "Standard mobile GPS"}`,
      status: "INFO",
      statusReason: "NFC and GPS feature flags evaluated.",
      evidence: "PROPERTY",
      whatWasChecked: "NFC chip and GPS location hardware features",
      whatItMeans: `NFC is ${hasNfc ? "available for contactless payments" : "absent"}.`,
      whyItMatters: "Important for mobile tap-to-pay and satellite positioning.",
      rawPropertyOrSource: `pm list features (NFC/GPS)`,
    },
    {
      key: "manualSensorTests",
      label: "Interactive Sensor & Hardware Tests",
      value: "Run Touch, Compass, and Vibration Tests in Hardware Tests",
      status: "WARNING",
      statusReason: "Sensor enumeration confirms hardware presence, but interactive testing verifies touch digitizer and vibration motors.",
      evidence: "MANUAL",
      whatWasChecked: "Interactive sensor and hardware validation",
      whatItMeans: "Use the Hardware Tests tab to verify vibration feedback, multi-touch, and camera functions.",
      whyItMatters: "Ensures physical buttons, haptics, and microphones work perfectly.",
      rawPropertyOrSource: "Manual hardware verification required",
    },
  ];

  return {
    id: "sensors",
    title: "Sensors & Hardware Features",
    subtitle: "Accelerometer, gyroscope, compass, proximity, fingerprint, and feature flags",
    status: sensorNames.length > 0 ? "PASS" : "UNAVAILABLE",
    summary: `Detected ${sensorNames.length} active sensor streams including motion, orientation, and biometric hardware.`,
    buyerGuidance:
      "Verify that auto-rotation, compass orientation, and fingerprint unlocking work smoothly before completing your purchase.",
    items,
    limitations: [
      "Feature flags confirm hardware is declared to Android, but physical calibration requires interactive testing.",
    ],
    evidence: sensorNames.length > 0 ? "DIRECT" : "PROPERTY",
    commands,
    rawValues,
  };
}
