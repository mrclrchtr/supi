import type { Static } from "typebox";
import { Type } from "typebox";

/** Short freshness filters accepted by the Brave context service. */
export const WEB_SEARCH_FRESHNESS_CODES = ["pd", "pw", "pm", "py"] as const;

/** Parameter schema for web_search. */
export const webSearchParameters = Type.Object(
  {
    query: Type.String({
      minLength: 1,
      description: "Search terms or a question for the public web",
    }),
    freshness: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          "Freshness filter: pd (24 hours), pw (7 days), pm (31 days), py (365 days), or an ordered YYYY-MM-DDtoYYYY-MM-DD range. Brave uses the page publication or modification date.",
      }),
    ),
  },
  { additionalProperties: false },
);

/** Input type for web_search. */
export type WebSearchInput = Static<typeof webSearchParameters>;

/** Input after runtime validation. */
export interface ValidWebSearchInput {
  query: string;
  freshness?: string;
}

/** Validate tool input used by direct callers as well as Pi. */
export function validateWebSearchInput(params: unknown): ValidWebSearchInput {
  if (!isRecord(params)) throw new Error("web_search input must be an object");

  const query = typeof params.query === "string" ? params.query.trim() : "";
  if (!query) throw new Error("'query' parameter is required");

  const freshness = params.freshness;
  if (freshness !== undefined) {
    if (typeof freshness !== "string" || !isValidFreshness(freshness)) {
      throw new Error(
        "'freshness' must be pd, pw, pm, py, or an ordered YYYY-MM-DDtoYYYY-MM-DD range",
      );
    }
  }

  return { query, ...(freshness === undefined ? {} : { freshness }) };
}

/** Return whether a freshness value is documented and valid. */
export function isValidFreshness(value: string): boolean {
  if ((WEB_SEARCH_FRESHNESS_CODES as readonly string[]).includes(value)) return true;

  const match = /^(\d{4})-(\d{2})-(\d{2})to(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = match;
  if (
    !isValidIsoDate(`${startYear}-${startMonth}-${startDay}`) ||
    !isValidIsoDate(`${endYear}-${endMonth}-${endDay}`)
  ) {
    return false;
  }

  return value.slice(0, 10) <= value.slice(12);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether a value is a real ISO calendar date. */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
