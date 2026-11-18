/**
 * Detection of fetched content that is not text: images and other binary data.
 */

/** Largest image or PDF body accepted; the whole body is held in memory. */
export const BINARY_MAX_BYTES = 32 * 1024 * 1024;

/** Image types the `read` tool can show, with the extension used for the saved file. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

/** Media type without parameters, lowercased. */
export function mediaTypeOf(contentType: string): string {
  return (contentType.split(";", 1)[0] ?? "").trim().toLowerCase();
}

/** File extension for a supported image content type, or undefined for anything else. */
export function imageExtension(contentType: string): string | undefined {
  return IMAGE_EXTENSIONS[mediaTypeOf(contentType)];
}

/** Whether decoded leading text holds NUL characters, which text formats do not contain. */
export function looksBinary(leadingText: string): boolean {
  return leadingText.includes("\0");
}
