/**
 * The Theme-like interface consumed by review plan preview helpers.
 *
 * pi's `Theme` type is not publicly re-exported from
 * `@earendil-works/pi-coding-agent`, so we define the subset of
 * methods we use. A full `Theme` object is assignable to this type
 * because `Theme.fg` accepts a superset of the color names listed
 * here (contravariance: wider parameter type accepts narrower args).
 */
export type ReviewTheme = {
  fg: (
    color: "accent" | "dim" | "success" | "muted" | "warning" | "toolDiffAdded" | "toolDiffRemoved",
    text: string,
  ) => string;
  bold: (text: string) => string;
};
