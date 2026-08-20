import { Type } from "typebox";
import { MAX_PAGE_CHARACTERS, MIN_PAGE_CHARACTERS } from "./output-page.ts";

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
