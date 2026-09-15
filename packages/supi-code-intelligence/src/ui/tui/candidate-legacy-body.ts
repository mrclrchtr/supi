/** Bounded raw Markdown rendering for legacy target-selection results. */
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Markdown, Text, truncateToWidth } from "@earendil-works/pi-tui";

/** Maximum source characters rendered by the legacy candidate body. */
const MAX_LEGACY_SOURCE_CHARACTERS = 4096;

/** Maximum physical rows rendered by the legacy candidate body. */
const MAX_LEGACY_BODY_ROWS = 40;

const LEGACY_TRUNCATION_NOTICE = `Legacy candidate body truncated for display (source limit: ${MAX_LEGACY_SOURCE_CHARACTERS} characters; body limit: ${MAX_LEGACY_BODY_ROWS} rows).`;

/** Read valid Markdown text blocks without trusting persisted content shape. */
export function readLegacyCandidateText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((block) => {
      if (block === null || typeof block !== "object" || Array.isArray(block)) return [];
      const record = block as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string" ? [record.text] : [];
    })
    .join("\n");
}

/** Create a bounded legacy candidate body, or null when no valid text exists. */
export function createLegacyCandidateBody(markdownText: string, theme: Theme): Component | null {
  if (!markdownText.trim()) return null;
  return new BoundedLegacyCandidateBody(markdownText, theme);
}

class BoundedLegacyCandidateBody implements Component {
  private readonly markdownText: string;
  private readonly sourceTruncated: boolean;

  constructor(
    markdownText: string,
    private readonly theme: Theme,
  ) {
    const sourceCharacters = Array.from(markdownText);
    this.sourceTruncated = sourceCharacters.length > MAX_LEGACY_SOURCE_CHARACTERS;
    this.markdownText = this.sourceTruncated
      ? sourceCharacters.slice(0, MAX_LEGACY_SOURCE_CHARACTERS).join("")
      : markdownText;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const markdownRows = new Markdown(this.markdownText, 0, 0, getMarkdownTheme())
      .render(safeWidth)
      .map((row) => truncateToWidth(row, safeWidth, ""));

    if (!this.sourceTruncated && markdownRows.length <= MAX_LEGACY_BODY_ROWS) {
      return markdownRows;
    }

    const noticeRows = new Text(this.theme.fg("warning", LEGACY_TRUNCATION_NOTICE), 0, 0).render(
      safeWidth,
    );
    const markdownRowBudget = Math.max(0, MAX_LEGACY_BODY_ROWS - noticeRows.length);
    return [...markdownRows.slice(0, markdownRowBudget), ...noticeRows].slice(
      0,
      MAX_LEGACY_BODY_ROWS,
    );
  }

  invalidate(): void {
    // The Markdown and notice components are rebuilt for each render.
  }
}
