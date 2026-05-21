/**
 * Single source of truth for the public `tree_sitter` action surface.
 *
 * Tool registration, validation, and prompt guidance should derive from these
 * specs so the action list and per-action requirements do not drift apart.
 */
export const TREE_SITTER_ACTION_SPECS = [
  {
    name: "outline",
    guidanceGroup: "js-ts-structure",
    languageScope: "js-ts-only",
    requiresPosition: false,
    requiresQuery: false,
  },
  {
    name: "imports",
    guidanceGroup: "js-ts-structure",
    languageScope: "js-ts-only",
    requiresPosition: false,
    requiresQuery: false,
  },
  {
    name: "exports",
    guidanceGroup: "js-ts-structure",
    languageScope: "js-ts-only",
    requiresPosition: false,
    requiresQuery: false,
  },
  {
    name: "node_at",
    guidanceGroup: "node-at",
    languageScope: "all-supported",
    requiresPosition: true,
    requiresQuery: false,
  },
  {
    name: "query",
    guidanceGroup: "query",
    languageScope: "all-supported",
    requiresPosition: false,
    requiresQuery: true,
  },
  {
    name: "callees",
    guidanceGroup: "callees",
    languageScope: "many-supported",
    requiresPosition: true,
    requiresQuery: false,
  },
] as const;

export type TreeSitterAction = (typeof TREE_SITTER_ACTION_SPECS)[number]["name"];
export type TreeSitterActionSpec = (typeof TREE_SITTER_ACTION_SPECS)[number];
export type TreeSitterGuidanceGroup = TreeSitterActionSpec["guidanceGroup"];

/** Ordered action names for schemas, validation messages, and docs. */
export const TREE_SITTER_ACTION_NAMES = TREE_SITTER_ACTION_SPECS.map(
  (spec) => spec.name,
) as readonly TreeSitterAction[];

const TREE_SITTER_ACTION_NAME_SET = new Set<string>(TREE_SITTER_ACTION_NAMES);
const TREE_SITTER_ACTION_SPEC_MAP = new Map<TreeSitterAction, TreeSitterActionSpec>(
  TREE_SITTER_ACTION_SPECS.map((spec) => [spec.name, spec]),
);

/** Check whether a runtime string is a supported `tree_sitter` action. */
export function isTreeSitterAction(action: string): action is TreeSitterAction {
  return TREE_SITTER_ACTION_NAME_SET.has(action);
}

/** Look up the spec for one supported `tree_sitter` action. */
export function getTreeSitterActionSpec(action: TreeSitterAction): TreeSitterActionSpec {
  const spec = TREE_SITTER_ACTION_SPEC_MAP.get(action);
  if (!spec) {
    throw new Error(`Unknown tree_sitter action: ${action}`);
  }
  return spec;
}

/** Get the ordered action names that belong to one prompt-guidance group. */
export function getTreeSitterActionNamesByGuidanceGroup(
  group: TreeSitterGuidanceGroup,
): TreeSitterAction[] {
  return TREE_SITTER_ACTION_SPECS.filter((spec) => spec.guidanceGroup === group).map(
    (spec) => spec.name,
  );
}

/** Format the public action list for validation messages and docs. */
export function formatTreeSitterActionList(): string {
  return TREE_SITTER_ACTION_NAMES.join(", ");
}
