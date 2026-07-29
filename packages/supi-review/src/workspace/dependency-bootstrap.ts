import { spawn } from "node:child_process";

/** Run the configured shell command once without retaining its output. */
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
