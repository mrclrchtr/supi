import type { ServerCapabilities } from "vscode-languageserver-protocol";

/** Refactor operations that the public LSP runtime can report. */
export type ServerOperationName =
  | "rename_symbol"
  | "prepare_rename"
  | "extract_function"
  | "extract_variable"
  | "update_imports"
  | "delete_dead_code"
  | "code_action_resolve";

/** Whether a server advertises one operation in its negotiated capabilities. */
export type ServerAdvertisement = "advertised" | "not-advertised" | "unknown";

/** SuPi support and server advertisement for one operation. */
export interface ServerOperationSupport {
  readonly server: ServerAdvertisement;
  readonly supi: "supported" | "limited" | "unsupported";
  /** A stable explanation for a SuPi planning limitation or deferral. */
  readonly reason?: string;
}

/** Operation support projected onto a project-server health entry. */
export type ServerOperationSupportMap = Partial<
  Record<ServerOperationName, ServerOperationSupport>
>;

/** Code-action kinds requested by each operation-specific planner. */
export const REFACTOR_CODE_ACTION_KINDS = {
  extract_function: ["refactor.extract.function"],
  extract_variable: ["refactor.extract.constant", "refactor.extract.variable"],
  update_imports: ["source.organizeImports"],
  delete_dead_code: ["source.removeUnused"],
} as const satisfies Record<
  "extract_function" | "extract_variable" | "update_imports" | "delete_dead_code",
  readonly string[]
>;

const EXTRACTION_NAME_LIMITATION =
  "Standard LSP code actions do not provide a safe exact extraction-name contract.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codeActionOptions(capabilities: ServerCapabilities | null): {
  kinds?: readonly string[];
  resolveProvider?: boolean;
} | null {
  const provider = capabilities?.codeActionProvider;
  if (provider === true) return {};
  if (!isRecord(provider)) return null;
  return {
    ...(Array.isArray(provider.codeActionKinds)
      ? {
          kinds: provider.codeActionKinds.filter(
            (kind): kind is string => typeof kind === "string",
          ),
        }
      : {}),
    ...(provider.resolveProvider === true ? { resolveProvider: true } : {}),
  };
}

function renameProvider(
  capabilities: ServerCapabilities | null,
): Record<string, unknown> | true | null {
  const provider = capabilities?.renameProvider;
  if (provider === true) return true;
  return isRecord(provider) ? provider : null;
}

/** Return true when a server advertises rename requests. */
export function supportsRename(capabilities: ServerCapabilities | null): boolean {
  return renameProvider(capabilities) !== null;
}

/** Return true when a server advertises `prepareRename`. */
export function supportsPrepareRename(capabilities: ServerCapabilities | null): boolean {
  const provider = renameProvider(capabilities);
  return isRecord(provider) && provider.prepareProvider === true;
}

/** Return true when a server advertises code actions. */
export function supportsCodeActions(capabilities: ServerCapabilities | null): boolean {
  return codeActionOptions(capabilities) !== null;
}

/** Return true when a server advertises code-action resolution. */
export function supportsCodeActionResolve(capabilities: ServerCapabilities | null): boolean {
  return codeActionOptions(capabilities)?.resolveProvider === true;
}

/** Test the documented hierarchical relationship between two code-action kinds. */
export function isCodeActionKindInRange(kind: string, requested: string): boolean {
  if (kind === "" || requested === "") return true;
  return kind === requested || kind.startsWith(`${requested}.`) || requested.startsWith(`${kind}.`);
}

/**
 * Check whether a requested kind can be supplied by a server's advertised
 * code-action kinds. An absent kind list means the server did not narrow its
 * provider, so the request remains eligible.
 */
export function supportsRequestedCodeActionKinds(
  capabilities: ServerCapabilities | null,
  requested: readonly string[],
): boolean {
  const options = codeActionOptions(capabilities);
  if (!options || requested.length === 0 || !options.kinds) return options !== null;
  if (options.kinds.length === 0) return false;
  return requested.some((wanted) =>
    options.kinds?.some((kind) => isCodeActionKindInRange(kind, wanted)),
  );
}

function codeActionAdvertisement(
  capabilities: ServerCapabilities | null,
  requested: readonly string[],
): ServerAdvertisement {
  if (capabilities === null) return "unknown";
  const options = codeActionOptions(capabilities);
  if (!options) return "not-advertised";
  if (requested.length === 0 || !options.kinds) return "unknown";
  if (!supportsRequestedCodeActionKinds(capabilities, requested)) return "not-advertised";

  // A generic parent or the empty kind proves eligibility, but it does not
  // prove that this exact operation is implemented by the server.
  const exactOrChild = requested.some((wanted) =>
    options.kinds?.some(
      (kind) => kind === wanted || (wanted !== "" && kind.startsWith(`${wanted}.`)),
    ),
  );
  return exactOrChild ? "advertised" : "unknown";
}

function supportedOperation(
  server: ServerAdvertisement,
  supi: ServerOperationSupport["supi"] = "supported",
  reason?: string,
): ServerOperationSupport {
  return { server, supi, ...(reason ? { reason } : {}) };
}

/** Build the honest operation-support projection for one negotiated server. */
export function getServerOperationSupport(
  capabilities: ServerCapabilities | null,
): ServerOperationSupportMap {
  const renameServer =
    capabilities === null
      ? "unknown"
      : supportsRename(capabilities)
        ? "advertised"
        : "not-advertised";
  const prepareServer =
    capabilities === null
      ? "unknown"
      : supportsPrepareRename(capabilities)
        ? "advertised"
        : "not-advertised";
  const resolveServer =
    capabilities === null
      ? "unknown"
      : supportsCodeActionResolve(capabilities)
        ? "advertised"
        : "not-advertised";
  return {
    rename_symbol: supportedOperation(renameServer),
    prepare_rename: supportedOperation(prepareServer),
    extract_function: supportedOperation(
      codeActionAdvertisement(capabilities, REFACTOR_CODE_ACTION_KINDS.extract_function),
      "limited",
      EXTRACTION_NAME_LIMITATION,
    ),
    extract_variable: supportedOperation(
      codeActionAdvertisement(capabilities, REFACTOR_CODE_ACTION_KINDS.extract_variable),
      "limited",
      EXTRACTION_NAME_LIMITATION,
    ),
    update_imports: supportedOperation(
      codeActionAdvertisement(capabilities, REFACTOR_CODE_ACTION_KINDS.update_imports),
    ),
    delete_dead_code: supportedOperation(
      codeActionAdvertisement(capabilities, REFACTOR_CODE_ACTION_KINDS.delete_dead_code),
    ),
    code_action_resolve: supportedOperation(resolveServer),
  };
}

/** Get the exact operation-specific kinds used in a code-action request. */
export function codeActionKindsForOperation(
  operation: keyof typeof REFACTOR_CODE_ACTION_KINDS,
): readonly string[] {
  return REFACTOR_CODE_ACTION_KINDS[operation];
}
