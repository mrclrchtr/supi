import spawn from "cross-spawn";
import { terminateTree } from "./process-tree.mjs";

/** Portable Pi command boundary. cross-spawn handles Windows npm shims and escaping. @param {{command?: string, prefix?: string[], env?: NodeJS.ProcessEnv}} [options] @returns {import('./types.ts').Runner} */
export function createPiRunner(options = {}) {
  return (args, { cwd, signal }) =>
    new Promise((resolve) => {
      if (signal.aborted) {
        resolve({ code: 130, output: "Cancelled" });
        return;
      }
      const child = spawn(options.command ?? "pi", [...(options.prefix ?? []), ...args], {
        cwd,
        env: options.env ?? process.env,
        detached: process.platform !== "win32",
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const append = /** @param {Buffer} chunk */ (chunk) => {
        output = `${output}${chunk.toString()}`.slice(-65_536);
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      let failed = false;
      /** @type {NodeJS.Timeout | undefined} */
      let killTimer;
      let termination = Promise.resolve();
      const stopError = /** @param {unknown} error */ (error) => {
        output += `\n${error instanceof Error ? error.message : String(error)}`;
      };
      const stop = () => {
        termination = terminateTree(child.pid, false).catch(stopError);
        killTimer = setTimeout(() => {
          void terminateTree(child.pid, true).catch(stopError);
        }, 2_000);
        killTimer.unref();
      };
      signal.addEventListener("abort", stop, { once: true });
      child.once("error", (error) => {
        failed = true;
        output += `\n${error.message}`;
      });
      /** @param {number | null} code */
      async function finish(code) {
        signal.removeEventListener("abort", stop);
        clearTimeout(killTimer);
        if (signal.aborted) {
          await termination;
          await terminateTree(child.pid, true).catch(stopError);
        }
        resolve({ code: signal.aborted ? 130 : failed ? 1 : (code ?? 1), output });
      }
      child.once("close", (code) => {
        void finish(code);
      });
    });
}

/** Check the executable without starting an agent session. The caller can cancel; a stalled version check also has a time limit. @param {import('./types.ts').Runner} runner @param {string} cwd @param {AbortSignal} [signal] */
export async function requirePi(runner, cwd, signal = new AbortController().signal) {
  if (signal.aborted) throw new Error("Cancelled while checking Pi.");
  const timeout = AbortSignal.timeout(10_000);
  const result = await runner(["--version"], { cwd, signal: AbortSignal.any([signal, timeout]) });
  if (signal.aborted) throw new Error("Cancelled while checking Pi.");
  if (timeout.aborted) throw new Error("Pi did not respond to --version within 10 seconds.");
  if (result.code !== 0)
    throw new Error(
      "Pi is not available on PATH. Install Pi from https://pi.dev, then rerun the installer.",
    );
}
