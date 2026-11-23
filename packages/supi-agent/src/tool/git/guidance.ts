import { GIT_READ_SUBCOMMANDS } from "./input.ts";

export const toolDescription = `Run one read-only Git query in the working directory without a shell: ${GIT_READ_SUBCOMMANDS.join(", ")}. Other subcommands, --output, --ext-diff, --textconv, and verbose status are rejected. Pipes, redirection, and globs are not interpreted.`;

export const promptSnippet = "inspect repository history, diffs, and blame";

export const promptGuidelines: string[] = [
  "Narrow git output with paths after --, --stat, --name-only, or -n instead of reading full histories.",
];
