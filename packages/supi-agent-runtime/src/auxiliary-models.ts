import type { ClassifierApi, ClassifierModel, ImageApi, ImageModel } from "@earendil-works/pi-ai";
import type { AgentRunProviderAuthority } from "./provider-authority.ts";

/** Immutable catalogue of classifier and image models authorized for one invocation. */
export interface AgentRunAuxiliaryModelSnapshot {
  readonly classifiers: readonly ClassifierModel<ClassifierApi>[];
  readonly images: readonly ImageModel<ImageApi>[];
}

/** Caller-visible startup result and settlement for an underlying uncancelable operation. */
export interface AgentRunStartupRace<T> {
  /** Settles on the first of startup completion or caller cancellation. */
  readonly result: Promise<T>;
  /** Settles only when the underlying startup operation itself has settled. */
  readonly settled: Promise<void>;
}

/**
 * Race an uncancelable startup operation against invocation cancellation while retaining an
 * explicit settlement signal for its owner. The underlying operation is not canceled; any late
 * value is ignored by `result` and callers must await `settled` before releasing ownership.
 */
export function raceAgentRunStartup<T>(
  startup: Promise<T>,
  signal?: AbortSignal,
): AgentRunStartupRace<T> {
  const settled = startup.then(
    () => undefined,
    () => undefined,
  );
  if (!signal) return { result: startup, settled };

  let removeAbortListener: () => void = () => {};
  const canceled = new Promise<never>((_resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Agent Run startup canceled."));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", abort);
  });
  const result = Promise.race([startup, canceled]).finally(removeAbortListener);
  return { result, settled };
}

/**
 * Capture a fixed, caller-owned snapshot of currently available classifiers and image models.
 * Missing catalogue support or a catalogue lookup failure yields an empty snapshot, never broader
 * access. Call once per top-level invocation and pass the result through `AgentSessionInputs`.
 */
export async function captureAgentRunAuxiliaryModels(
  authority: AgentRunProviderAuthority,
): Promise<AgentRunAuxiliaryModelSnapshot> {
  if (!authority.getAvailableAuxiliaryModels)
    return freezeAuxiliaryModels({ classifiers: [], images: [] });
  try {
    const available = await authority.getAvailableAuxiliaryModels();
    return freezeAuxiliaryModels({
      classifiers: authority.classify ? available.classifiers : [],
      images: authority.generateImages ? available.images : [],
    });
  } catch {
    return freezeAuxiliaryModels({ classifiers: [], images: [] });
  }
}

/** Clone and freeze an auxiliary catalogue before it is retained by a runtime. */
export function freezeAuxiliaryModels(
  models: AgentRunAuxiliaryModelSnapshot,
): AgentRunAuxiliaryModelSnapshot {
  return Object.freeze({
    classifiers: Object.freeze(models.classifiers.map(cloneAndFreeze)),
    images: Object.freeze(models.images.map(cloneAndFreeze)),
  });
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreeze)) as T;
  if (typeof value === "object" && value !== null) {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneAndFreeze(entry)])),
    ) as T;
  }
  return value;
}
