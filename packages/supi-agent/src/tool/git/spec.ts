import { Type } from "typebox";

export const GIT_TOOL_NAME = "git";

/** Git subcommands the tool admits; each one only reads repository state. */
export const GIT_READ_SUBCOMMANDS = [
  "diff",
  "log",
  "show",
  "blame",
  "status",
  "rev-parse",
  "ls-files",
] as const;

/** Maximum arguments in one call. */
export const MAX_GIT_ARGS = 64;
/** Maximum characters per argument. */
export const MAX_GIT_ARG_CHARS = 4096;

/** Canonical public interface for read-only Git queries in Agent Runs. */
export const gitSpec = {
  name: GIT_TOOL_NAME,
  label: "Git",
  // Runs only allowlisted read subcommands without a shell, pager, or optional index locks.
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  parameters: Type.Object(
    {
      args: Type.Array(Type.String({ minLength: 1, maxLength: MAX_GIT_ARG_CHARS }), {
        minItems: 1,
        maxItems: MAX_GIT_ARGS,
        description: `Git arguments without the leading "git", for example ["diff", "main...HEAD", "--stat"]. The first argument must be one of: ${GIT_READ_SUBCOMMANDS.join(", ")}.`,
      }),
    },
    { additionalProperties: false },
  ),
} as const;
