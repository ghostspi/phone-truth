import type { Adb } from "@yume-chan/adb";
import { TextDecoderStream } from "@yume-chan/stream-extra";
import type { CommandRecord } from "../types/diagnostic";

export async function runReadOnlyCommand(
  adb: Adb,
  command: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; output: string; record: CommandRecord }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );

  const record: CommandRecord = { command, ok: false };

  try {
    const service = adb.subprocess.shellProtocol ?? adb.subprocess.noneProtocol;
    if (!service) {
      record.error = "No ADB subprocess protocol available.";
      return { ok: false, output: "", record };
    }

    const process = await service.spawn(command, controller.signal);
    const stream = "stdout" in process ? process.stdout : process.output;
    const decoder = stream.pipeThrough(new TextDecoderStream());

    let output = "";
    for await (const chunk of decoder) {
      output += chunk;
    }
    await process.exited;

    record.ok = true;
    return { ok: true, output: output.trim(), record };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record.error = message;
    return { ok: false, output: "", record };
  } finally {
    clearTimeout(timer);
  }
}
