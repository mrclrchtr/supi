import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import type { ReviewOutputReference } from "../types.ts";
import { REVIEW_OUTPUT_TOOL_NAME } from "./review_output/spec.ts";

/** Default output page size in UTF-16 code units. */
export const DEFAULT_PAGE_CHARACTERS = 12_000;
/** Smallest page that can retain model-facing continuation metadata. */
export const MIN_PAGE_CHARACTERS = 512;
/** Hard ceiling for a single output page. */
export const MAX_PAGE_CHARACTERS = 12_000;
/** Line-based cap for a single output page (including continuation metadata). */
export const MAX_PAGE_LINES = 2_000;
const CONTINUATION_FOOTER_RESERVE = MIN_PAGE_CHARACTERS;

/** One page of paged tool or rendering output with an optional continuation offset. */
export interface TextPage {
  text: string;
  offset: number;
  nextOffset?: number;
  totalCharacters: number;
}

function lineBoundedEnd(
  text: string,
  start: number,
  proposedEnd: number,
  maxLines: number,
): number {
  let lines = 1;
  for (let index = start; index < proposedEnd; index++) {
    if (text[index] !== "\n") continue;
    if (lines >= maxLines - 2) return index;
    lines++;
  }
  return proposedEnd;
}

/** Replace the raw paging footer with a model-facing continuation instruction for one tool. */
export function modelFacingPage(
  toolName: string,
  nextInput: Record<string, unknown>,
  page: TextPage,
): string {
  if (page.nextOffset === undefined) return page.text;
  const marker = "\n\n[output paged;";
  const body = page.text.slice(0, page.text.lastIndexOf(marker));
  const call = JSON.stringify({ ...nextInput, offset: page.nextOffset });
  return [
    body,
    "",
    `[output paged; call ${toolName} with ${call}; total characters: ${page.totalCharacters}]`,
  ].join("\n");
}

/** Page tool/output text by UTF-16 offsets while staying below Pi's line/byte envelope. */
export function pageText(
  text: string,
  offset = 0,
  limit = DEFAULT_PAGE_CHARACTERS,
  maxLines = MAX_PAGE_LINES,
): TextPage {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    throw new Error(`Offset must be an integer between 0 and ${text.length}.`);
  }
  if (!Number.isSafeInteger(limit) || limit < MIN_PAGE_CHARACTERS || limit > MAX_PAGE_CHARACTERS) {
    throw new Error(
      `Limit must be an integer between ${MIN_PAGE_CHARACTERS} and ${MAX_PAGE_CHARACTERS}.`,
    );
  }
  const proposedEnd = Math.min(text.length, offset + limit);
  const characterEnd =
    proposedEnd < text.length
      ? Math.min(proposedEnd, offset + Math.max(1, limit - CONTINUATION_FOOTER_RESERVE))
      : proposedEnd;
  let end = lineBoundedEnd(text, offset, characterEnd, maxLines);
  if (end < text.length && end > offset && /[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end--;
  const body = text.slice(offset, end) || "[no content]";
  const nextOffset = end < text.length ? end : undefined;
  const notice = nextOffset
    ? `\n\n[output paged; next offset: ${nextOffset}; total characters: ${text.length}]`
    : "";
  return {
    text: `${body}${notice}`,
    offset,
    ...(nextOffset !== undefined ? { nextOffset } : {}),
    totalCharacters: text.length,
  };
}

interface ReviewOutputOptions {
  firstPageCharacters?: number;
  firstPageLines?: number;
}

/** Store complete output and return its first bounded model-facing page. */
export function createReviewOutput(
  store: ReviewArtifactStore,
  text: string,
  options: ReviewOutputOptions = {},
): { text: string; reference: ReviewOutputReference } {
  const artifact = store.create(text);
  const page = store.read(
    artifact.id,
    undefined,
    options.firstPageCharacters,
    options.firstPageLines,
  );
  if (!page) throw new Error("Review output expired before it could be returned.");
  return {
    text: modelFacingPage(REVIEW_OUTPUT_TOOL_NAME, { artifactId: artifact.id }, page),
    reference: {
      artifactId: artifact.id,
      offset: page.offset,
      ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
      totalCharacters: page.totalCharacters,
    },
  };
}
