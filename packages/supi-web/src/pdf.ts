/**
 * PDF text extraction for fetched documents.
 */

const PDF_SIGNATURE = "%PDF-";
/** PDF.js `VerbosityLevel.ERRORS`: keep font and parser warnings off the terminal. */
const PDFJS_VERBOSITY_ERRORS = 0;

/** Whether a response is a PDF, by content type or by the leading file signature. */
export function isPdf(contentType: string, leadingText: string): boolean {
  return (
    contentType.toLowerCase().includes("application/pdf") ||
    leadingText.trimStart().startsWith(PDF_SIGNATURE)
  );
}

/**
 * Extract the text layer of a PDF as Markdown with one `## Page N` section per page,
 * so readers can cite pages. Pages without text are omitted.
 *
 * @returns An empty string when no page has a text layer, such as a scanned document.
 * @throws When the bytes are not a readable PDF, for example encrypted or corrupt.
 */
export async function pdfToMarkdown(data: Uint8Array): Promise<string> {
  // Loaded on first use: PDF.js is large and most fetches never need it.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data, { verbosity: PDFJS_VERBOSITY_ERRORS });
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text
      .map((page, index) => ({ number: index + 1, body: page.trim() }))
      .filter((page) => page.body)
      .map((page) => `## Page ${page.number}\n\n${page.body}`)
      .join("\n\n");
  } finally {
    await pdf.loadingTask.destroy();
  }
}
