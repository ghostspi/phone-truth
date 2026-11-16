import type { Adb } from "@yume-chan/adb";
import { runReadOnlyCommand } from "./adbShell";
import type { DiagnosticFinding, InspectedItem } from "../types/diagnostic";

function translateSimState(raw: string): { label: string; detected: boolean } {
  const upper = raw.toUpperCase();
  if (upper.includes("LOADED") || upper.includes("READY")) {
    return { label: "SIM detected (Ready / Loaded)", detected: true };
  }
  if (upper.includes("ABSENT")) {
    return { label: "Empty (No SIM inserted)", detected: false };
  }
  if (upper.includes("PIN_REQUIRED") || upper.includes("PUK_REQUIRED")) {
    return { label: "SIM detected (SIM PIN/PUK locked)", detected: true };
  }
  if (upper.includes("NETWORK_LOCKED")) {
    return { label: "SIM detected (Carrier / Network locked)", detected: true };
  }
  if (upper.includes("NOT_READY")) {
    return { label: "SIM initializing (Not ready)", detected: false };
  }
  return { label: raw || "Unavailable", detected: false };
}

function formatNetworkGen(raw: string): string {
  const s = raw.toUpperCase();
  if (!s || s === "UNKNOWN" || s === "0") return "Unavailable / No mobile data";
  if (s.includes("NR")) return `5G NR (${raw})`;
  if (s.includes("LTE")) return `4G LTE (${raw})`;
  if (s.includes("HSPAP") || s.includes("HSPA") || s.includes("UMTS") || s.includes("HSDPA") || s.includes("HSUPA")) {
    return `3G (${raw})`;
  }
  if (s.includes("EDGE") || s.includes("GPRS") || s.includes("GSM") || s.includes("1XRTT")) {
    return `2G (${raw})`;
  }
  return raw;
}

export async function collectNetwork(adb: Adb): Promise<DiagnosticFinding> {
  const commands: DiagnosticFinding["commands"] = [];
  const rawValues: Record<string, string | number | null> = {};

  const [
    simStateProp,
    operatorAlpha,
    operatorNumeric,
    networkAlpha,
    networkTypeProp,
    roamingProp,
    multiSimConfig,
    telephonyDump,
  ] = await Promise.all([
    runReadOnlyCommand(adb, "getprop gsm.sim.state", 4000),
    runReadOnlyCommand(adb, "getprop gsm.sim.operator.alpha", 4000),
    runReadOnlyCommand(adb, "getprop gsm.sim.operator.numeric", 4000),
    runReadOnlyCommand(adb, "getprop gsm.operator.alpha", 4000),
    runReadOnlyCommand(adb, "getprop gsm.network.type", 4000),
    runReadOnlyCommand(adb, "getprop gsm.operator.isroaming", 4000),
    runReadOnlyCommand(adb, "getprop persist.radio.multisim.config", 4000),
    runReadOnlyCommand(adb, "dumpsys telephony.registry", 8000),
  ]);

  for (const r of [
    simStateProp,
    operatorAlpha,
    operatorNumeric,
    networkAlpha,
    networkTypeProp,
    roamingProp,
    multiSimConfig,
    telephonyDump,
  ]) {
    commands.push({
      command: r.record.command,
      ok: r.record.ok,
      outputPreview: r.output.slice(0, 110),
      error: r.record.error,
    });
  }

  const splitSlots = (val: string) =>
    val
      ? val.split(",").map((s) => s.trim())
      : [];

  const simStates = splitSlots(simStateProp.output);
  const simOperators = splitSlots(operatorAlpha.output);
  const simMccMnc = splitSlots(operatorNumeric.output);
  const netOperators = splitSlots(networkAlpha.output);
  const netTypes = splitSlots(networkTypeProp.output);
  const roamings = splitSlots(roamingProp.output);

  const slotCount = Math.max(
    simStates.length,
    multiSimConfig.output === "dsds" || multiSimConfig.output === "dsda" ? 2 : 1,
  );

  const sim1 = translateSimState(simStates[0] ?? "");
  const sim2 = translateSimState(simStates[1] ?? "");

  rawValues["simSlotCount"] = slotCount;
  if (simStates[0]) rawValues["sim1State"] = simStates[0];
  if (simStates[1]) rawValues["sim2State"] = simStates[1];
  if (simOperators[0]) rawValues["sim1Operator"] = simOperators[0];
  if (simOperators[1]) rawValues["sim2Operator"] = simOperators[1];
  if (netTypes[0]) rawValues["slot1NetworkType"] = netTypes[0];

  let dataConnState = "";
  let signalLevel = "";
  let serviceState = "";
  let esimMentioned = false;

  if (telephonyDump.ok && telephonyDump.output) {
    const out = telephonyDump.output;
    const dataMatch = out.match(/mDataConnectionState\s*=\s*(-?\d+)/);
    if (dataMatch) {
      const code = dataMatch[1];
      dataConnState =
        code === "2"
          ? "Connected"
          : code === "1"
            ? "Connecting"
            : code === "0"
              ? "Disconnected"
              : code === "3"
                ? "Suspended"
                : `State ${code}`;
      rawValues["mobileDataState"] = dataConnState;
    }

    const sigMatch = out.match(/level\s*=\s*([0-4])/);
    if (sigMatch) {
      const lvl = Number(sigMatch[1]);
      const labels = ["0 / 4 (No signal)", "1 / 4 (Poor)", "2 / 4 (Fair)", "3 / 4 (Good)", "4 / 4 (Excellent)"];
      signalLevel = labels[lvl] ?? `${lvl} / 4`;
      rawValues["signalLevel"] = signalLevel;
    }

    const svcMatch = out.match(/mServiceState\s*=\s*\{?([^}\n]+)/);
    if (svcMatch) {
      if (/IN_SERVICE/i.test(svcMatch[1])) serviceState = "In Service (Registered on cellular network)";
      else if (/OUT_OF_SERVICE/i.test(svcMatch[1])) serviceState = "Out of Service";
      else if (/EMERGENCY_ONLY/i.test(svcMatch[1])) serviceState = "Emergency Calls Only";
      if (serviceState) rawValues["registrationStatus"] = serviceState;
    }

    esimMentioned = /isEmbedded\s*=\s*true|euicc/i.test(out);
    rawValues["esimCapabilityDetected"] = esimMentioned ? "Yes" : "Not detected in registry";
  }

  const items: InspectedItem[] = [
    {
      key: "simSlots",
      label: "SIM Slot Configuration",
      value: `${slotCount === 2 ? "Dual SIM" : "Single SIM"} (${slotCount} slot${slotCount > 1 ? "s" : ""})${esimMentioned ? " • eSIM/eUICC supported" : ""}`,
      status: "INFO",
      statusReason: "Radio slot configuration retrieved from system properties.",
      evidence: "PROPERTY",
      whatWasChecked: "Number of active cellular SIM slots and eSIM support",
      whatItMeans: `Firmware reports ${slotCount} SIM slot(s)${multiSimConfig.output ? ` (mode: ${multiSimConfig.output})` : ""}.`,
      whyItMatters: "Confirms whether the unit is a Dual-SIM or Single-SIM hardware variant.",
      rawPropertyOrSource: `persist.radio.multisim.config = ${multiSimConfig.output || "(default)"}`,
    },
    {
      key: "sim1",
      label: "SIM Slot 1",
      value: simStates[0]
        ? `${sim1.label}${simOperators[0] ? ` • Operator: ${simOperators[0]}` : ""}${netTypes[0] ? ` • Network: ${formatNetworkGen(netTypes[0])}` : ""}`
        : "Unavailable",
      status: !simStates[0]
        ? "UNAVAILABLE"
        : simStates[0].toUpperCase().includes("NETWORK_LOCKED")
          ? "FAIL"
          : sim1.detected
            ? "PASS"
            : "INFO",
      statusReason: !simStates[0]
        ? "SIM 1 state was not exposed by Android."
        : simStates[0].toUpperCase().includes("NETWORK_LOCKED")
          ? "SIM 1 reports NETWORK_LOCKED—the phone appears carrier-locked against this SIM."
          : sim1.detected
            ? "SIM 1 card is detected and active."
            : "SIM 1 slot appears empty.",
      evidence: simStates[0] ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "SIM Slot 1 presence, operator name, and radio generation",
      whatItMeans: simStates[0]
        ? `Status: ${sim1.label}. ${simOperators[0] ? `SIM operator: ${simOperators[0]}.` : ""} ${netOperators[0] ? `Registered network: ${netOperators[0]}.` : ""}`
        : "Android restricted SIM status properties.",
      whyItMatters: "Verifies the primary SIM reader hardware detects a physical/eSIM card and registers on a network.",
      rawPropertyOrSource: `gsm.sim.state[0]=${simStates[0] || "?"}, gsm.sim.operator.alpha[0]=${simOperators[0] || "?"}`,
    },
    {
      key: "sim2",
      label: "SIM Slot 2",
      value:
        slotCount < 2 && !simStates[1]
          ? "Not present (Single-SIM configuration)"
          : simStates[1]
            ? `${sim2.label}${simOperators[1] ? ` • Operator: ${simOperators[1]}` : ""}${netTypes[1] ? ` • Network: ${formatNetworkGen(netTypes[1])}` : ""}`
            : "Empty or unavailable",
      status:
        slotCount < 2 && !simStates[1]
          ? "INFO"
          : simStates[1]?.toUpperCase().includes("NETWORK_LOCKED")
            ? "FAIL"
            : sim2.detected
              ? "PASS"
              : "INFO",
      statusReason:
        slotCount < 2 && !simStates[1]
          ? "Device is configured as single-SIM."
          : sim2.detected
            ? "SIM 2 card is detected."
            : "SIM 2 slot is empty or not exposed.",
      evidence: simStates[1] ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "SIM Slot 2 presence and carrier registration",
      whatItMeans: simStates[1]
        ? `Status: ${sim2.label}. ${simOperators[1] ? `Operator: ${simOperators[1]}.` : ""}`
        : "No second SIM detected.",
      whyItMatters: "If buying a Dual-SIM phone, test both SIM trays with an active card.",
      rawPropertyOrSource: `gsm.sim.state[1]=${simStates[1] || "(none)"}`,
    },
    {
      key: "networkRegistration",
      label: "Network Registration & Mobile Data",
      value:
        serviceState || dataConnState
          ? `${serviceState || "Registration unknown"}${dataConnState ? ` • Data: ${dataConnState}` : ""}`
          : "Unavailable (Restricted by Android)",
      status: serviceState.includes("In Service") ? "PASS" : serviceState || dataConnState ? "INFO" : "UNAVAILABLE",
      statusReason: serviceState
        ? `Cellular registration reports: ${serviceState}.`
        : "Android restricted telephony registry details.",
      evidence: serviceState || dataConnState ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Cellular service registration state and mobile data connection",
      whatItMeans: serviceState
        ? `${serviceState}. Mobile data state: ${dataConnState || "unknown"}.`
        : "Not exposed without elevated telephony permissions.",
      whyItMatters: "Confirms the cellular baseband modem can register with a carrier tower.",
      rawPropertyOrSource: "dumpsys telephony.registry (mServiceState / mDataConnectionState)",
    },
    {
      key: "radioAndSignal",
      label: "Mobile Network Type & Signal Strength",
      value:
        netTypes[0] || signalLevel
          ? `${formatNetworkGen(netTypes[0] ?? "")}${signalLevel ? ` • Signal: ${signalLevel}` : ""}`
          : "Unavailable",
      status: netTypes[0] || signalLevel ? "INFO" : "UNAVAILABLE",
      statusReason: netTypes[0] || signalLevel ? "Active radio generation and signal bars retrieved." : "Unavailable.",
      evidence: netTypes[0] ? "PROPERTY" : signalLevel ? "DIRECT" : "UNAVAILABLE",
      whatWasChecked: "Voice/data radio technology and signal level",
      whatItMeans: `Network technology: ${formatNetworkGen(netTypes[0] ?? "")}. Signal strength: ${signalLevel || "not reported"}.`,
      whyItMatters: "Confirms the phone's cellular radio hardware connects properly.",
      rawPropertyOrSource: `gsm.network.type=${networkTypeProp.output || "?"}`,
    },
    {
      key: "carrierAndRoaming",
      label: "Carrier Code (MCC/MNC) & Roaming Status",
      value:
        simMccMnc[0] || roamings[0]
          ? `MCC/MNC: ${simMccMnc[0] || "N/A"} • Roaming: ${roamings[0] === "true" ? "Yes (Roaming)" : "No (Home network)"}`
          : "Unavailable",
      status: simMccMnc[0] || roamings[0] ? "INFO" : "UNAVAILABLE",
      statusReason: "Public carrier network code and roaming flag read.",
      evidence: simMccMnc[0] ? "PROPERTY" : "UNAVAILABLE",
      whatWasChecked: "Public Mobile Country Code / Mobile Network Code and roaming flag",
      whatItMeans: simMccMnc[0]
        ? `Public carrier code is ${simMccMnc[0]}. Private identifiers (IMSI, ICCID, phone number) are intentionally never collected.`
        : "No active carrier code exposed.",
      whyItMatters: "Identifies active carrier network safely without exposing personal SIM secrets.",
      rawPropertyOrSource: `gsm.sim.operator.numeric=${operatorNumeric.output || "?"}`,
    },
    {
      key: "carrierLockDisclaimer",
      label: "Carrier / SIM Unlock Verification",
      value: simStates.some((s) => s.toUpperCase().includes("NETWORK_LOCKED"))
        ? "Carrier Locked (NETWORK_LOCKED reported)"
        : "Not Independently Verifiable (Insert target carrier SIM to test)",
      status: simStates.some((s) => s.toUpperCase().includes("NETWORK_LOCKED")) ? "FAIL" : "WARNING",
      statusReason: "Detecting one working SIM does NOT prove the phone is unlocked for all carriers.",
      evidence: "UNAVAILABLE",
      whatWasChecked: "Carrier SIM-lock status",
      whatItMeans: "Android does not expose a universal carrier-unlock flag over standard ADB.",
      whyItMatters: "Always insert a SIM card from the actual mobile network you plan to use before completing a purchase.",
      rawPropertyOrSource: "Android security limitation",
    },
  ];

  return {
    id: "network",
    title: "SIM & Network",
    subtitle: "SIM slot detection, operator name, 4G/5G radio type, signal level, and registration",
    status: sim1.detected || sim2.detected ? "PASS" : simStates.length > 0 ? "WARNING" : "UNAVAILABLE",
    summary:
      sim1.detected || sim2.detected
        ? `SIM detected (${simOperators.filter(Boolean).join(", ") || "Operator hidden"}), network: ${formatNetworkGen(netTypes[0] ?? "")}.`
        : "No active SIM card detected or SIM state is restricted by Android.",
    buyerGuidance:
      "Insert your own active SIM card before buying. Detecting one SIM does NOT guarantee the phone is carrier-unlocked for other networks.",
    items,
    limitations: [
      "PHONE TRUTH respects Android privacy rules and never collects or displays IMSI, ICCID, or phone numbers.",
    ],
    evidence: simStates.length > 0 ? "PROPERTY" : "UNAVAILABLE",
    commands,
    rawValues,
  };
}
