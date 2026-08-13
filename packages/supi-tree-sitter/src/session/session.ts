// Session factory — creates asynchronous Structural Worker proxies and owned sessions.

import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type {
  CalleesAtResult,
  CallSiteMatch,
  ExportRecord,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  QueryCapture,
  TreeSitterResult,
  TreeSitterService,
  TreeSitterSession,
} from "../types.ts";
import {
  StructuralWorkerClient,
  type StructuralWorkerFactory,
} from "./structural-worker-client.ts";

/** Create one asynchronous service backed by an owned Structural Worker client. */
export function createTreeSitterService(client: StructuralWorkerClient): TreeSitterService {
  return {
    canParse(file, control) {
      return execute(client, { operation: "canParse", file }, control);
    },
    query(file, query, control) {
      return execute<QueryCapture[]>(client, { operation: "query", file, query }, control);
    },
    outline(file, control) {
      return execute<OutlineItem[]>(client, { operation: "outline", file }, control);
    },
    imports(file, control) {
      return execute<ImportRecord[]>(client, { operation: "imports", file }, control);
    },
    exports(file, control) {
      return execute<ExportRecord[]>(client, { operation: "exports", file }, control);
    },
    nodeAt(file, line, character, control) {
      return execute<NodeAtResult>(client, { operation: "nodeAt", file, line, character }, control);
    },
    calleesAt(file, line, character, depthOrOptions) {
      const depth = typeof depthOrOptions === "string" ? depthOrOptions : depthOrOptions?.depth;
      const control = typeof depthOrOptions === "string" ? undefined : depthOrOptions?.control;
      return execute<CalleesAtResult>(
        client,
        { operation: "calleesAt", file, line, character, depth },
        control,
      );
    },
    callSites(file, control) {
      return execute<CallSiteMatch[]>(client, { operation: "callSites", file }, control);
    },
  };
}

/**
 * Create one Tree-sitter session bound to a working directory.
 * Await disposal to prove that its Structural Worker has terminated.
 */
export function createTreeSitterSession(
  cwd: string,
  options: { readonly workerFactory?: StructuralWorkerFactory } = {},
): TreeSitterSession {
  const client = new StructuralWorkerClient(cwd, options.workerFactory);
  const service = createTreeSitterService(client);
  return {
    ...service,
    dispose() {
      return client.dispose();
    },
  };
}

function execute<T>(
  client: StructuralWorkerClient,
  input: Parameters<StructuralWorkerClient["execute"]>[0],
  control?: CodeRequestControl,
): Promise<TreeSitterResult<T>> {
  return control ? client.execute<T>(input, control) : client.execute<T>(input);
}
