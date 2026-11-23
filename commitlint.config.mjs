/**
 * Commit types that may mark a breaking change. A breaking marker makes the next
 * release a major one (cliff.toml), so it belongs only to commits that change what
 * users install: APIs, commands, config, or extension behavior.
 */
const BREAKING_TYPES = ["feat", "fix", "perf", "refactor", "revert"];

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "breaking-type-enum": ({ type, header, notes }, _when, allowed = BREAKING_TYPES) => {
          const breaking =
            /^[\w-]+(\([^)]*\))?!:/.test(header ?? "") ||
            notes.some((note) => /^BREAKING[ -]CHANGE$/.test(note.title));
          return [
            !breaking || allowed.includes(type),
            `breaking changes must use one of [${allowed.join(", ")}]: a breaking marker forces a major release. ` +
              "For repository-only changes such as CI job names, state the required maintainer step in the body without a BREAKING CHANGE footer.",
          ];
        },
      },
    },
  ],
  rules: {
    "breaking-type-enum": [2, "always", BREAKING_TYPES],
  },
};
