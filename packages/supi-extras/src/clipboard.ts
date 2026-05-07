/**
 * Shared clipboard utility for supi-extras.
 *
 * Copies text to the system clipboard using the best available tool for the
 * current platform (macOS `pbcopy`, Linux `wl-copy`/`xclip`, Windows
 * `powershell Set-Clipboard`).
 */
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Copy text to the system clipboard. Writes to a temp file and pipes it to
 * the platform clipboard tool via `pi.exec()`.
 *
 * @returns `true` on success, `false` on failure.
 */
export async function copyToClipboard(
  text: string,
  cwd: string,
  pi: ExtensionAPI,
): Promise<boolean> {
  const tmpFile = join(tmpdir(), `pi-clipboard-${Date.now()}.txt`);

  try {
    writeFileSync(tmpFile, text, "utf8");

    const platform = process.platform;
    let result: { code: number; stdout: string; stderr: string };

    if (platform === "darwin") {
      result = await pi.exec("sh", ["-c", `pbcopy < "${tmpFile}"`], {
        timeout: 2000,
        cwd,
      });
    } else if (platform === "linux") {
      result = await pi.exec(
        "sh",
        [
          "-c",
          `if command -v wl-copy >/dev/null 2>&1; then wl-copy < "${tmpFile}"; elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard < "${tmpFile}"; else exit 1; fi`,
        ],
        { timeout: 3000, cwd },
      );
    } else if (platform === "win32") {
      result = await pi.exec(
        "powershell",
        ["-Command", `Get-Content -Path '${tmpFile.replace(/'/g, "''")}' -Raw | Set-Clipboard`],
        { timeout: 5000, cwd },
      );
    } else {
      return false;
    }

    return result.code === 0;
  } catch {
    return false;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore temp file cleanup errors */
    }
  }
}
