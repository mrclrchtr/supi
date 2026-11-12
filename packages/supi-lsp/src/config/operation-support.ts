import type { ServerCapabilities } from "vscode-languageserver-protocol";

/** Refactor operations that the public LSP runtime can report. */
export type ServerOperationName =
  | "rename_symbol"
  | "prepare_rename"
  | "code_action"
  | "source_action"
  | "code_action_resolve";

/** Whether a server advertises one operation in its negotiated capabilities. */
export type ServerAdvertisement = "advertised" | "not-advertised" | "unknown";

/** SuPi support and server advertisement for one operation. */
export interface ServerOperationSupport {
  readonly server: ServerAdvertisement;
  readonly supi: "supported" | "limited" | "unsupported";
  /** A stable explanation for a SuPi planning limitation or deferral. */
  readonly reason?: string;
  /** Advertised CodeActionKinds in this operation's family (`refactor*` or `source*`). */
  readonly kinds?: readonly string[];
  /**
   * The server may return kinds beyond `kinds`: it advertises CodeActionKind.Empty
   * (`""`) or does not narrow `codeActionKinds` at all.
   */
  readonly anyKind?: boolean;
}

/** Operation support projected onto a project-server health entry. */
export type ServerOperationSupportMap = Partial<
  Record<ServerOperationName, ServerOperationSupport>
>;

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

/**
 * Test whether a returned CodeActionKind falls under a requested kind: the same
 * kind or a dotted descendant. The empty kind requests every kind.
 */
export function isCodeActionKindWithin(kind: unknown, requested: string): boolean {
  if (requested === "") return true;
  return typeof kind === "string" && (kind === requested || kind.startsWith(`${requested}.`));
}

/** Return the negotiated `codeActionKinds`, or undefined when the server did not narrow them. */
export function advertisedCodeActionKinds(
  capabilities: ServerCapabilities | null,
): readonly string[] | undefined {
  return codeActionOptions(capabilities)?.kinds;
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

function supportedOperation(server: ServerAdvertisement): ServerOperationSupport {
  return { server, supi: "supported" };
}

/** Project advertised kinds for one CodeActionKind family, such as `refactor` or `source`. */
function codeActionFamilySupport(
  capabilities: ServerCapabilities | null,
  family: "refactor" | "source",
): ServerOperationSupport {
  if (capabilities === null) return supportedOperation("unknown");
  const options = codeActionOptions(capabilities);
  if (!options) return supportedOperation("not-advertised");
  // An unnarrowed provider or the empty kind may return kinds it does not list.
  const anyKind = !options.kinds || options.kinds.includes("");
  const kinds = (options.kinds ?? []).filter(
    (kind) => kind !== "" && isCodeActionKindWithin(kind, family),
  );
  if (kinds.length === 0 && !anyKind) return supportedOperation("not-advertised");
  return {
    server: "advertised",
    supi: "supported",
    ...(kinds.length > 0 ? { kinds } : {}),
    ...(anyKind ? { anyKind } : {}),
  };
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
    code_action: codeActionFamilySupport(capabilities, "refactor"),
    source_action: codeActionFamilySupport(capabilities, "source"),
    code_action_resolve: supportedOperation(resolveServer),
  };
}
