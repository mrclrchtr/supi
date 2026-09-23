/** Session-only tool and skill visibility state. */
export interface SessionCapabilityState {
  version: 1;
  eligibleToolNames: string[];
  initiallyInactiveToolNames: string[];
  toolDenylist: string[];
  /** Tools that the user explicitly enabled for this session. */
  toolEnabledNames?: string[];
  hiddenSkillNames: string[];
}

/** A model-visible skill that a provider can offer to the selector. */
export interface SessionCapabilitySkill {
  name: string;
  description: string;
}

/** Skill inventory provider registered by the skills extension. */
export interface SessionCapabilitySkillProvider<TContext = unknown> {
  listEligibleSkills(
    context: TContext,
  ): Promise<SessionCapabilitySkill[]> | SessionCapabilitySkill[];
}

/** Custom session-entry type used for hidden capability snapshots. */
export const SESSION_CAPABILITIES_ENTRY = "supi-capabilities";

const REGISTRY_PREFIX = "@mrclrchtr/supi-core/session-capabilities/";
const STATE_KEY = Symbol.for(`${REGISTRY_PREFIX}state`);
const PROVIDER_KEY = Symbol.for(`${REGISTRY_PREFIX}skill-providers`);
const FORK_KEY = Symbol.for(`${REGISTRY_PREFIX}pending-forks`);

type GlobalRegistry = typeof globalThis & Record<symbol, unknown>;

type SkillProviderMap = Map<string, SessionCapabilitySkillProvider<unknown>>;
type ForkStateMap = Map<string, SessionCapabilityState>;

function getStateMap(): Map<string, SessionCapabilityState> {
  const target = globalThis as GlobalRegistry;
  let map = target[STATE_KEY] as Map<string, SessionCapabilityState> | undefined;
  if (!map) {
    map = new Map();
    target[STATE_KEY] = map;
  }
  return map;
}

function getProviderMap(): SkillProviderMap {
  const target = globalThis as GlobalRegistry;
  let map = target[PROVIDER_KEY] as SkillProviderMap | undefined;
  if (!map) {
    map = new Map();
    target[PROVIDER_KEY] = map;
  }
  return map;
}

function getForkMap(): ForkStateMap {
  const target = globalThis as GlobalRegistry;
  let map = target[FORK_KEY] as ForkStateMap | undefined;
  if (!map) {
    map = new Map();
    target[FORK_KEY] = map;
  }
  return map;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string")));
}

/** Create an empty state snapshot. */
export function createEmptySessionCapabilityState(): SessionCapabilityState {
  return {
    version: 1,
    eligibleToolNames: [],
    initiallyInactiveToolNames: [],
    toolDenylist: [],
    toolEnabledNames: [],
    hiddenSkillNames: [],
  };
}

/** Validate and copy one stored snapshot. */
export function decodeSessionCapabilities(value: unknown): SessionCapabilityState | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return undefined;

  const initiallyInactiveToolNames = stringList(record.initiallyInactiveToolNames);
  const initiallyInactive = new Set(initiallyInactiveToolNames);
  const eligibleToolNames = stringList(record.eligibleToolNames).filter(
    (name) => !initiallyInactive.has(name),
  );
  const eligible = new Set(eligibleToolNames);
  const toolDenylist = stringList(record.toolDenylist).filter((name) => eligible.has(name));
  const denied = new Set(toolDenylist);

  return {
    version: 1,
    eligibleToolNames,
    initiallyInactiveToolNames,
    toolDenylist,
    toolEnabledNames: stringList(record.toolEnabledNames).filter(
      (name) => eligible.has(name) && !denied.has(name),
    ),
    hiddenSkillNames: stringList(record.hiddenSkillNames),
  };
}

/** Return a safe copy of the latest valid snapshot in all session entries. */
export function findSessionCapabilities(
  entries: readonly unknown[],
): SessionCapabilityState | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== "custom" || record.customType !== SESSION_CAPABILITIES_ENTRY) continue;
    const state = decodeSessionCapabilities(record.data);
    if (state) return state;
  }
  return undefined;
}

/** Shared session state. Session IDs keep sessions in the same cwd separate. */
export const sessionCapabilityState = {
  get(sessionId: string): SessionCapabilityState | undefined {
    const state = getStateMap().get(sessionId);
    return state ? decodeSessionCapabilities(state) : undefined;
  },
  set(sessionId: string, state: SessionCapabilityState): void {
    const decoded = decodeSessionCapabilities(state);
    if (decoded) getStateMap().set(sessionId, decoded);
  },
  clear(sessionId: string): void {
    getStateMap().delete(sessionId);
  },
};

/** Register the current session's skill inventory provider. */
export function registerSessionCapabilitySkillProvider<TContext>(
  sessionId: string,
  provider: SessionCapabilitySkillProvider<TContext>,
): () => void {
  const providers = getProviderMap();
  providers.set(sessionId, provider as SessionCapabilitySkillProvider<unknown>);
  return () => {
    if (providers.get(sessionId) === provider) providers.delete(sessionId);
  };
}

/** Get the current session's skill inventory provider, if one is loaded. */
export function getSessionCapabilitySkillProvider<TContext = unknown>(
  sessionId: string,
): SessionCapabilitySkillProvider<TContext> | undefined {
  return getProviderMap().get(sessionId) as SessionCapabilitySkillProvider<TContext> | undefined;
}

function forkKey(sourceSessionFile: string | undefined): string {
  return sourceSessionFile ?? "<memory-session>";
}

/** Hold a state copy until PI starts the forked session. */
export function setPendingSessionCapabilityFork(
  sourceSessionFile: string | undefined,
  state: SessionCapabilityState,
): void {
  const decoded = decodeSessionCapabilities(state);
  if (decoded) getForkMap().set(forkKey(sourceSessionFile), decoded);
}

/** Take the state copy for one fork. The copy is used once. */
export function readPendingSessionCapabilityFork(
  sourceSessionFile: string | undefined,
): SessionCapabilityState | undefined {
  const forks = getForkMap();
  const key = forkKey(sourceSessionFile);
  const state = forks.get(key);
  forks.delete(key);
  return state ? decodeSessionCapabilities(state) : undefined;
}

/** Clear pending fork copies after a cancelled or unrelated transition. */
export function clearPendingSessionCapabilityForks(): void {
  getForkMap().clear();
}
