/**
 * Shared clipboard utility for supi-extras.
 *
 * Copies text to the system clipboard via `clipboardy`, a cross-platform
 * wrapper around platform-native clipboard tools.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import clipboard from "clipboardy";

/**
 * Copy text to the system clipboard.
 *
 * @returns `true` on success, `false` on failure.
 */
export async function copyToClipboard(
  text: string,
  _cwd: string,
  _pi: ExtensionAPI,
): Promise<boolean> {
  try {
    await clipboard.write(text);
    return true;
  } catch {
    return false;
  }
}
