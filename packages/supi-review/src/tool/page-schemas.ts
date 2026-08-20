import { Type } from "typebox";

/** Default output page size in UTF-16 code units. */
export const DEFAULT_PAGE_CHARACTERS = 12_000;
/** Smallest page that can retain model-facing continuation metadata. */
export const MIN_PAGE_CHARACTERS = 512;
/** Hard ceiling for a single output page. */
export const MAX_PAGE_CHARACTERS = 12_000;
/** Line-based cap for a single output page (including continuation metadata). */
export const MAX_PAGE_LINES = 2_000;

/** Shared paging offset parameter for paged Review tools. */
export const pageOffsetSchema = Type.Optional(
  Type.Integer({
    minimum: 0,
    default: 0,
    description: "UTF-16 character offset; omit for the first page, then use returned nextOffset.",
  }),
);

/** Shared paging limit parameter for paged Review tools. */
export const pageLimitSchema = Type.Optional(
  Type.Integer({
    minimum: MIN_PAGE_CHARACTERS,
    maximum: MAX_PAGE_CHARACTERS,
    default: MAX_PAGE_CHARACTERS,
    description: `Maximum characters for this page (${MIN_PAGE_CHARACTERS}-${MAX_PAGE_CHARACTERS}); omit for the default.`,
  }),
);
