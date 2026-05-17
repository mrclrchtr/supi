/**
 * Shared clipboard utility for supi-extras.
 *
 * Copies text to the system clipboard. Uses `clipboardy` when available
 * (preferred cross-platform wrapper), falls back gracefully otherwise.
 *
 * The import is lazy so the extension always loads — clipboard functionality
 * degrades gracefully when `clipboardy` is not installed or unavailable.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Copy text to the system clipboard.
 *
 * Uses a dynamic import of `clipboardy` to avoid hard-load failures.
 *
 * @returns `true` on success, `false` on failure.
 */
export async function copyToClipboard(
  text: string,
  _cwd: string,
  _pi: ExtensionAPI,
): Promise<boolean> {
  try {
    const { default: clipboard } = await import("clipboardy");
    await clipboard.write(text);
    return true;
  } catch {
    return false;
  }
}
