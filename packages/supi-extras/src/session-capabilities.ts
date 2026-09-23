import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { FOOTER_INVALIDATE_EVENT, footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import {
  clearPendingSessionCapabilityForks,
  createEmptySessionCapabilityState,
  decodeSessionCapabilities,
  findSessionCapabilities,
  getSessionCapabilitySkillProvider,
  readPendingSessionCapabilityFork,
  SESSION_CAPABILITIES_ENTRY,
  type SessionCapabilitySkill,
  type SessionCapabilityState,
  sessionCapabilityState,
  setPendingSessionCapabilityFork,
} from "@mrclrchtr/supi-core/session";
import {
  addActiveToolsToBaseline,
  baselineFromState,
  captureToolBaseline,
  initialSessionCapabilityState,
  isExtensionTool,
  type ToolBaseline,
} from "./session-capabilities-state.ts";
import {
  applyToolDenylist,
  observeNewTools,
  reconcileToolInventory,
} from "./session-capabilities-tools.ts";
import { type CapabilityToolItem, createCapabilitySelector } from "./session-capabilities-ui.ts";

const COMMAND_NAME = "supi-capabilities";
const FOOTER_KEY = "supi-capabilities";
const FOOTER_ICON = "◈";

type SkillProviderContext = ExtensionCommandContext;

function currentSessionState(ctx: ExtensionContext): SessionCapabilityState | undefined {
  return sessionCapabilityState.get(ctx.sessionManager.getSessionId());
}

function saveState(pi: ExtensionAPI, ctx: ExtensionContext, state: SessionCapabilityState): void {
  const normalized = decodeSessionCapabilities(state) ?? createEmptySessionCapabilityState();
  sessionCapabilityState.set(ctx.sessionManager.getSessionId(), normalized);
  pi.appendEntry(SESSION_CAPABILITIES_ENTRY, normalized);
  updateFooter(pi, ctx, normalized);
}

function updateFooter(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: SessionCapabilityState,
): void {
  if (ctx.mode !== "tui") return;
  const count =
    state.toolDenylist.length +
    (state.toolEnabledNames?.length ?? 0) +
    state.hiddenSkillNames.length;
  if (count === 0) {
    footerContributions.unregister(FOOTER_KEY);
    ctx.ui.setStatus(FOOTER_KEY, undefined);
  } else {
    const render = (): string => ctx.ui.theme.fg("accent", `${FOOTER_ICON}${count}`);
    footerContributions.register({ key: FOOTER_KEY, placement: "stats-end", render });
    ctx.ui.setStatus(FOOTER_KEY, render());
  }
  pi.events.emit(FOOTER_INVALIDATE_EVENT, {});
}

function readSessionFileState(sessionFile: string | undefined): SessionCapabilityState | undefined {
  if (!sessionFile) return undefined;
  try {
    return findSessionCapabilities(SessionManager.open(sessionFile).getEntries());
  } catch {
    return undefined;
  }
}

interface ToolGroupOptions {
  enabled: boolean;
  names: readonly string[];
  pi: ExtensionAPI;
  restorableNames: ReadonlySet<string>;
  state: SessionCapabilityState;
}

function setToolGroup(options: ToolGroupOptions): void {
  const { pi, state, names, enabled, restorableNames } = options;
  const eligible = new Set(state.eligibleToolNames);
  const initiallyInactive = new Set(state.initiallyInactiveToolNames);
  const denylist = new Set(state.toolDenylist);
  const enabledNames = new Set(state.toolEnabledNames ?? []);
  const active = new Set(pi.getActiveTools());
  const restoreNames: string[] = [];

  for (const name of names) {
    if (!eligible.has(name) || initiallyInactive.has(name)) continue;
    if (enabled) {
      denylist.delete(name);
      enabledNames.add(name);
      restoreNames.push(name);
    } else {
      enabledNames.delete(name);
      if (active.has(name)) denylist.add(name);
    }
  }

  state.toolDenylist = Array.from(denylist);
  state.toolEnabledNames = Array.from(enabledNames);
  applyToolDenylist(pi, state, restoreNames, restorableNames);
}

function restoreAllTools(
  pi: ExtensionAPI,
  state: SessionCapabilityState,
  restorableNames: ReadonlySet<string>,
): void {
  const restoreNames = [...state.toolDenylist];
  state.toolDenylist = [];
  state.toolEnabledNames = [];
  applyToolDenylist(pi, state, restoreNames, restorableNames);
}

function resetTools(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: SessionCapabilityState,
  restorableNames: ReadonlySet<string>,
): void {
  restoreAllTools(pi, state, restorableNames);
  saveState(pi, ctx, state);
}

function resetSkills(pi: ExtensionAPI, ctx: ExtensionContext, state: SessionCapabilityState): void {
  state.hiddenSkillNames = [];
  saveState(pi, ctx, state);
}

function resetAll(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: SessionCapabilityState,
  restorableNames: ReadonlySet<string>,
): void {
  restoreAllTools(pi, state, restorableNames);
  state.hiddenSkillNames = [];
  saveState(pi, ctx, state);
}

interface ToolSelectionOptions {
  ctx: ExtensionContext;
  id: string;
  pi: ExtensionAPI;
  restorableNames: ReadonlySet<string>;
  state: SessionCapabilityState;
  tools: CapabilityToolItem[];
  value: string;
}

function updateToolSelection(options: ToolSelectionOptions): void {
  const { pi, ctx, state, tools, id, value, restorableNames } = options;
  const isPackage = id.startsWith("package:");
  const key = id.slice(isPackage ? "package:".length : "tool:".length);
  const names = isPackage
    ? tools.filter((tool) => tool.source === key).map((tool) => tool.name)
    : [key];
  setToolGroup({
    pi,
    state,
    names,
    enabled: isPackage ? value === "enable" : value === "Enabled",
    restorableNames,
  });
  saveState(pi, ctx, state);
}

interface SelectorChangeOptions extends ToolSelectionOptions {
  id: string;
  skills: SessionCapabilitySkill[] | undefined;
  value: string;
}

function handleSelectorChange(options: SelectorChangeOptions): void {
  const { id, pi, ctx, state, tools, skills, value } = options;
  switch (id) {
    case "disable-all-tools":
      setToolGroup({
        pi,
        state,
        names: tools.map((tool) => tool.name),
        enabled: false,
        restorableNames: options.restorableNames,
      });
      saveState(pi, ctx, state);
      return;
    case "hide-all-skills":
      state.hiddenSkillNames = Array.from(new Set((skills ?? []).map((skill) => skill.name)));
      saveState(pi, ctx, state);
      return;
    case "reset-tools":
      resetTools(pi, ctx, state, options.restorableNames);
      return;
    case "reset-skills":
      resetSkills(pi, ctx, state);
      return;
    case "reset-all":
      resetAll(pi, ctx, state, options.restorableNames);
      return;
    default:
      if (id.startsWith("tool:") || id.startsWith("package:")) {
        updateToolSelection(options);
      } else if (id.startsWith("skill:")) {
        const name = id.slice("skill:".length);
        const hidden = new Set(state.hiddenSkillNames);
        if (value === "Hidden") hidden.add(name);
        else hidden.delete(name);
        state.hiddenSkillNames = Array.from(hidden);
        saveState(pi, ctx, state);
      }
  }
}

/** Register session-only controls for extension tools and model-visible skills. */
export default function sessionCapabilities(pi: ExtensionAPI): void {
  let toolBaseline: ToolBaseline | undefined;
  let knownToolNames = new Set<string>();
  let restorableToolNames = new Set<string>();
  pi.registerCommand(COMMAND_NAME, {
    description: "Choose which extension tools and skills appear in this session",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/supi-capabilities requires TUI mode", "warning");
        return;
      }

      const sessionId = ctx.sessionManager.getSessionId();
      const state =
        currentSessionState(ctx) ??
        initialSessionCapabilityState(toolBaseline ?? captureToolBaseline(pi));
      observeNewTools(pi, state, knownToolNames, restorableToolNames);
      const toolInventory = reconcileToolInventory(pi, state);
      if (toolInventory.changed) saveState(pi, ctx, state);

      const provider = getSessionCapabilitySkillProvider<SkillProviderContext>(sessionId);
      let skills: SessionCapabilitySkill[] | undefined;
      if (provider) {
        try {
          skills = await provider.listEligibleSkills(ctx);
          const names = new Set(skills.map((skill) => skill.name));
          const previous = state.hiddenSkillNames;
          state.hiddenSkillNames = previous.filter((name) => names.has(name));
          if (previous.length !== state.hiddenSkillNames.length) saveState(pi, ctx, state);
        } catch {
          ctx.ui.notify("Could not load the skill list", "warning");
        }
      }

      await ctx.ui.custom(
        (tui, theme, _keybindings, done) =>
          createCapabilitySelector({
            state,
            tools: toolInventory.tools,
            skills,
            theme,
            tui,
            done,
            onChange: (id, value) =>
              handleSelectorChange({
                pi,
                ctx,
                state,
                tools: toolInventory.tools,
                skills,
                id,
                value,
                restorableNames: restorableToolNames,
              }),
          }),
        { overlay: true },
      );
    },
  });

  pi.on("session_start", (event, ctx) => {
    const startupTools = pi.getAllTools().filter(isExtensionTool);
    const startupActiveNames = new Set(pi.getActiveTools());
    knownToolNames = new Set(startupTools.map((tool) => tool.name));
    restorableToolNames = new Set(
      startupTools.filter((tool) => startupActiveNames.has(tool.name)).map((tool) => tool.name),
    );
    const entries = ctx.sessionManager.getEntries();
    const currentEntryState = findSessionCapabilities(entries);
    let state: SessionCapabilityState | undefined;

    if (event.reason === "new") {
      state = undefined;
    } else if (event.reason === "fork") {
      const fileState = readSessionFileState(event.previousSessionFile);
      const pendingState = readPendingSessionCapabilityFork(event.previousSessionFile);
      state = fileState ?? pendingState ?? currentEntryState;
    } else {
      state = currentEntryState;
    }

    const copiedForkState = event.reason === "fork" && state !== undefined;
    toolBaseline ??=
      event.reason !== "new" && state ? baselineFromState(state) : captureToolBaseline(pi);
    addActiveToolsToBaseline(pi, toolBaseline);
    state ??= initialSessionCapabilityState(toolBaseline);
    const toolStateChanged = reconcileToolInventory(pi, state).changed;
    sessionCapabilityState.set(ctx.sessionManager.getSessionId(), state);
    applyToolDenylist(pi, state, state.toolEnabledNames ?? [], restorableToolNames);
    if (!currentEntryState || copiedForkState || event.reason === "new" || toolStateChanged) {
      pi.appendEntry(SESSION_CAPABILITIES_ENTRY, state);
    }
    updateFooter(pi, ctx, state);
    if (event.reason !== "fork") clearPendingSessionCapabilityForks();
  });

  pi.on("before_agent_start", (_event, ctx) => {
    const state = currentSessionState(ctx);
    if (!state) return;
    observeNewTools(pi, state, knownToolNames, restorableToolNames);
    applyToolDenylist(pi, state, state.toolEnabledNames ?? [], restorableToolNames);
  });

  pi.on("session_tree", (_event, ctx) => {
    const state = currentSessionState(ctx);
    if (!state) return;
    observeNewTools(pi, state, knownToolNames, restorableToolNames);
    applyToolDenylist(pi, state, state.toolEnabledNames ?? [], restorableToolNames);
  });

  pi.on("session_before_fork", (_event, ctx) => {
    const state =
      currentSessionState(ctx) ?? findSessionCapabilities(ctx.sessionManager.getEntries());
    if (state) setPendingSessionCapabilityFork(ctx.sessionManager.getSessionFile(), state);
  });

  pi.on("session_shutdown", (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    footerContributions.unregister(FOOTER_KEY);
    if (ctx.mode === "tui") ctx.ui.setStatus(FOOTER_KEY, undefined);
    pi.events.emit(FOOTER_INVALIDATE_EVENT, {});
    sessionCapabilityState.clear(sessionId);
    if (event.reason !== "fork") clearPendingSessionCapabilityForks();
  });
}
