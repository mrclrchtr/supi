/**
 * Single source of truth for the public `code_intel` action surface.
 *
 * The action list, prompt guidance, and router validation should derive from
 * these specs so the high-level orchestration tool stays internally coherent.
 */
export const CODE_INTEL_ACTION_SPECS = [
  {
    name: "brief",
    promptGuideline:
      'Use code_intel with `action: "brief"` for a project, package, directory, file, or anchored-position brief before opening more files.',
  },
  {
    name: "callers",
    promptGuideline:
      'Use code_intel with `action: "callers"` to find who invokes a symbol or file-level surface before falling back to text search.',
  },
  {
    name: "callees",
    promptGuideline:
      'Use code_intel with `action: "callees"` for outgoing calls from a function or method at a known `file`, `line`, and `character`.',
  },
  {
    name: "implementations",
    promptGuideline:
      'Use code_intel with `action: "implementations"` to find which concrete types implement a declaration.',
  },
  {
    name: "affected",
    promptGuideline:
      'Use code_intel with `action: "affected"` before edits for blast radius, downstream modules, risk, and likely follow-up checks or tests.',
  },
  {
    name: "pattern",
    promptGuideline:
      'Use code_intel with `action: "pattern"` for bounded search within a path; `pattern` is literal by default, set `regex: true` for regex, and use `kind: "definition" | "export" | "import"` for structured search.',
  },
  {
    name: "index",
    promptGuideline:
      'Use code_intel with `action: "index"` for a project map, top-level directories, language mix, or landmark files.',
  },
] as const;

export type CodeIntelAction = (typeof CODE_INTEL_ACTION_SPECS)[number]["name"];
export type CodeIntelActionSpec = (typeof CODE_INTEL_ACTION_SPECS)[number];

/** Ordered action names for schemas, validation messages, and docs. */
export const CODE_INTEL_ACTION_NAMES = CODE_INTEL_ACTION_SPECS.map(
  (spec) => spec.name,
) as readonly CodeIntelAction[];

const CODE_INTEL_ACTION_NAME_SET = new Set<string>(CODE_INTEL_ACTION_NAMES);

/** Check whether a runtime string is a supported `code_intel` action. */
export function isCodeIntelAction(action: string): action is CodeIntelAction {
  return CODE_INTEL_ACTION_NAME_SET.has(action);
}

/** Format the public action list for validation messages and docs. */
export function formatCodeIntelActionList(options?: { fenced?: boolean }): string {
  if (options?.fenced) {
    return CODE_INTEL_ACTION_NAMES.map((name) => `\`${name}\``).join(", ");
  }
  return CODE_INTEL_ACTION_NAMES.join(", ");
}
