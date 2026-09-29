import { ActiveQuestionnaireLock } from "./session/lock.ts";
import type { AskUserInteractionResult, AskUserOutcome, NormalizedQuestionnaire } from "./types.ts";
import { runQuestionnaire } from "./ui/choose-renderer.ts";
import type { AskUserUiContext } from "./ui/types.ts";

interface SharedFormLockState {
  readonly locks: WeakMap<object, ActiveQuestionnaireLock>;
}

const formLocksKey = Symbol.for("@mrclrchtr/supi-ask-user/form-locks");

function sharedFormLockState(): SharedFormLockState {
  const global = globalThis as unknown as Record<symbol, unknown>;
  const existing = global[formLocksKey] as SharedFormLockState | undefined;
  if (existing) return existing;
  const created: SharedFormLockState = { locks: new WeakMap() };
  global[formLocksKey] = created;
  return created;
}

function formLockFor(uiRuntime: object): ActiveQuestionnaireLock {
  const locks = sharedFormLockState().locks;
  let lock = locks.get(uiRuntime);
  if (!lock) {
    lock = new ActiveQuestionnaireLock();
    locks.set(uiRuntime, lock);
  }
  return lock;
}

/** UI capabilities used by the reusable Ask User form. */
export type AskUserFormUi = AskUserUiContext;

/** Options for {@link openAskUserForm}. */
export interface OpenAskUserFormOptions {
  /** UI adapter. Forms require custom TUI support. */
  ui: AskUserFormUi;
  /** Use an overlay instead of Pi's editor area. Defaults to false. */
  overlay?: boolean;
  /** Signal owned by the caller. Abort closes the form and returns an abort result. */
  signal?: AbortSignal;
  /** Called after the shared lock is acquired and before the form opens. */
  onAcquire?: () => void;
  /** Called before the shared lock is released, if it was acquired. */
  onRelease?: () => void;
  /** Toggle Pi's expanded tool output state when the form receives its binding. */
  onToggleToolsExpanded?: () => void;
}

/**
 * Open the shared Ask User form and return its temporary result.
 *
 * This API does not persist results, label transcript entries, or abort a Pi
 * agent turn. It uses Pi's editor area by default and one shared lock for all callers.
 */
export async function openAskUserForm(
  questionnaire: NormalizedQuestionnaire,
  options: OpenAskUserFormOptions,
): Promise<AskUserOutcome | AskUserInteractionResult> {
  const custom = options.ui.custom?.bind(options.ui);
  if (typeof custom !== "function") {
    throw new Error(
      "ask_user requires a TUI with custom form support. Do not use ask_user in non-interactive or degraded UI sessions.",
    );
  }

  let acquiredLock: ActiveQuestionnaireLock | undefined;
  let ownershipStarted = false;
  try {
    const result = await runQuestionnaire(questionnaire, {
      ui: {
        ...options.ui,
        custom: (factory) =>
          custom(
            (tui, theme, keybindings, done) => {
              const lock = formLockFor(tui);
              if (!lock.acquire()) {
                throw new Error(
                  "another ask_user form is already in flight. Wait for it to complete first.",
                );
              }
              acquiredLock = lock;
              ownershipStarted = true;
              options.onAcquire?.();
              return factory(tui, theme, keybindings, done);
            },
            options.overlay ? { overlay: true } : undefined,
          ),
      },
      signal: options.signal,
      onToggleToolsExpanded: options.onToggleToolsExpanded,
    });
    if (result === "unsupported") {
      throw new Error(
        "ask_user requires a TUI with custom form support. Do not use ask_user in non-interactive or degraded UI sessions.",
      );
    }
    return result;
  } finally {
    try {
      if (ownershipStarted) options.onRelease?.();
    } finally {
      acquiredLock?.release();
    }
  }
}
