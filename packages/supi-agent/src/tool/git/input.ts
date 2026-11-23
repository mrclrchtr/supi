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
