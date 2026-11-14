import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AdbDaemonWebUsbDeviceManager,
  type AdbDaemonWebUsbDevice,
} from "@yume-chan/adb-daemon-webusb";
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import type { DeviceSnapshot } from "../types/device";

export type ConnectionState =
  | "NOT_CONNECTED"
  | "WAITING_FOR_DEVICE"
  | "AUTHORIZATION_REQUIRED"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "CONNECTION_FAILED";

export interface AdbSession {
  adb: Adb;
  device: AdbDaemonWebUsbDevice;
  snapshot: DeviceSnapshot;
}

interface AdbConnectionValue {
  state: ConnectionState;
  error: string | null;
  session: AdbSession | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

export const AdbConnectionContext = createContext<AdbConnectionValue | null>(null);

const credentialStore = new AdbWebCredentialStore("phone-truth");

export function AdbConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>("NOT_CONNECTED");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AdbSession | null>(null);

  const sessionRef = useRef<AdbSession | null>(null);
  sessionRef.current = session;

  const clearError = useCallback(() => setError(null), []);

  const disconnect = useCallback(async () => {
    const current = sessionRef.current;
    if (current) {
      try {
        await current.adb.close();
      } catch {
        // Cable may already be unplugged
      }
    }
    setSession(null);
    setState("DISCONNECTED");
  }, []);

  useEffect(() => {
    const usb = (navigator as unknown as { usb?: USB }).usb;
    if (!usb) return;

    const handleDisconnect = () => {
      if (sessionRef.current) {
        setSession(null);
        setState("DISCONNECTED");
      }
    };

    usb.addEventListener("disconnect", handleDisconnect);
    return () => usb.removeEventListener("disconnect", handleDisconnect);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setState("WAITING_FOR_DEVICE");

    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      setError(
        "WebUSB is unavailable. Use desktop Chrome or Edge over HTTPS or localhost.",
      );
      setState("CONNECTION_FAILED");
      return;
    }

    let device: AdbDaemonWebUsbDevice | undefined;
    try {
      device = await manager.requestDevice();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("CONNECTION_FAILED");
      return;
    }

    if (!device) {
      setError("No device was selected in the USB picker.");
      setState("NOT_CONNECTED");
      return;
    }

    setState("AUTHORIZATION_REQUIRED");
    setState("CONNECTING");

    try {
      const connection = await device.connect();

      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore,
      });

      const adb = new Adb(transport);

      const manufacturer = await readProp(adb, "ro.product.manufacturer");
      const model = await readProp(adb, "ro.product.model");
      const androidVersion = await readProp(adb, "ro.build.version.release");

      const snapshot: DeviceSnapshot = {
        manufacturer: manufacturer || "Unknown",
        model: model || "Unknown",
        androidVersion: androidVersion || "Unknown",
        serial: device.serial,
      };

      setSession({ adb, device, snapshot });
      setState("CONNECTED");
    } catch (e) {
      const message = formatAdbError(e);
      setError(message);
      setState("CONNECTION_FAILED");
    }
  }, []);

  const value = useMemo(
    () => ({ state, error, session, connect, disconnect, clearError }),
    [state, error, session, connect, disconnect, clearError],
  );

  return (
    <AdbConnectionContext.Provider value={value}>
      {children}
    </AdbConnectionContext.Provider>
  );
}

async function readProp(adb: Adb, key: string): Promise<string> {
  try {
    const service = adb.subprocess.shellProtocol ?? adb.subprocess.noneProtocol;
    if (!service) return "";
    const process = await service.spawn(`getprop ${key}`);
    const { TextDecoderStream } = await import("@yume-chan/stream-extra");
    const stream = "stdout" in process ? process.stdout : process.output;
    const decoder = stream.pipeThrough(new TextDecoderStream());
    let output = "";
    for await (const chunk of decoder) output += chunk;
    await process.exited;
    return output.trim();
  } catch {
    return "";
  }
}

function formatAdbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("DeviceBusyError") || message.includes("already in use")) {
    return "The device is already in use by another program (for example, Android Studio or a running adb server). Close that program and try again.";
  }
  if (message.includes("authorization") || message.includes("AUTH")) {
    return "USB debugging authorization was rejected. Unlock the phone, tap 'Allow' on the debugging prompt, or revoke old authorizations in Developer Options and retry.";
  }
  return message;
}
