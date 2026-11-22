import { spawn } from "node:child_process";
import { join } from "node:path";

/** Stop the owned command group on Unix, or the npm shim and its descendants on Windows. @param {number | undefined} pid @param {boolean} force */
export async function terminateTree(pid, force) {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const command = join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
      const child = spawn(command, ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("close", (code) => {
        // A second stop can find that the root process has already exited.
        if (code === 0 || code === 128) resolve(undefined);
        else reject(new Error(`Could not stop the Pi process tree (taskkill status ${code}).`));
      });
    });
    return;
  }
  try {
    process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}
