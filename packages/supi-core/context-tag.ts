// XML context tag wrapping for SuPi extensions.
//
// Produces machine-parseable <extension-context> blocks that:
// - Are LLM-friendly (structured XML)
// - Carry metadata via attributes (source, file, turn, etc.)
// - Can be reconstructed from session history via regex

/**
 * Wrap content in an `<extension-context>` XML tag.
 *
 * @param source - Extension identifier (e.g. "supi-claude-md", "supi-lsp")
 * @param content - The text content to wrap
 * @param attrs - Optional additional attributes (rendered as key="value")
 * @returns Formatted XML string
 */
export function wrapExtensionContext(
  source: string,
  content: string,
  attrs?: Record<string, string | number>,
): string {
  const attrParts = [`source="${source}"`];

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      attrParts.push(`${key}="${String(value)}"`);
    }
  }

  const openTag = `<extension-context ${attrParts.join(" ")}>`;
  return `${openTag}\n${content}\n</extension-context>`;
}
