import { spawn } from "node:child_process";

/**
 * Run a Dependency Bootstrap shell command once in `cwd` without retaining its output.
 * Rejects with `Dependency Bootstrap failed.` for an empty command, a non-zero exit, a spawn
 * error, or an abort (which kills the command).
 */
export async function runDependencyBootstrap(
  cwd: string,
  command: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!command.trim() || signal?.aborted) throw new Error("Dependency Bootstrap failed.");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, { cwd, signal, shell: true, stdio: "ignore" });
    child.once("error", () => reject(new Error("Dependency Bootstrap failed.")));
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Dependency Bootstrap failed.")),
    );
  });
}
