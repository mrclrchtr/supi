// LspClient diagnostic publication and version-gating behavior.

import { describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { PublishDiagnosticsParams } from "../../src/config/types.ts";
import { fileToUri } from "../../src/utils.ts";
import { createRunningTestClient } from "../helpers/client-test-harness.ts";

const FILE = "/project/a.ts";
const URI = fileToUri(FILE);

function makeDiagnostic(message: string) {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

function publish(client: LspClient, params: PublishDiagnosticsParams): void {
  client.handlePublishDiagnostics(params);
}

function openAtVersion(client: LspClient, version: number): void {
  client.didOpen(FILE, "const value = 1;");
  for (let current = 1; current < version; current++) {
    client.didChange(FILE, `const value = ${current + 1};`);
  }
}

describe("LspClient diagnostic cache", () => {
  it("stores diagnostics received from the server", () => {
    const { client } = createRunningTestClient();

    publish(client, { uri: URI, diagnostics: [makeDiagnostic("err")] });

    expect(client.getDiagnostics(FILE)).toEqual([makeDiagnostic("err")]);
  });

  it("replaces an earlier publication for the same document", () => {
    const { client } = createRunningTestClient();

    publish(client, { uri: URI, diagnostics: [makeDiagnostic("first")] });
    publish(client, { uri: URI, diagnostics: [makeDiagnostic("second")] });

    expect(client.getDiagnostics(FILE)).toEqual([makeDiagnostic("second")]);
  });

  it("accepts diagnostics that match the open document version", () => {
    const { client } = createRunningTestClient();
    openAtVersion(client, 5);

    publish(client, { uri: URI, version: 5, diagnostics: [makeDiagnostic("matching")] });

    expect(client.getDiagnostics(FILE)).toEqual([makeDiagnostic("matching")]);
  });

  it("ignores diagnostics older than the open document version", () => {
    const { client } = createRunningTestClient();
    publish(client, { uri: URI, diagnostics: [makeDiagnostic("current")] });
    openAtVersion(client, 5);

    publish(client, { uri: URI, version: 4, diagnostics: [makeDiagnostic("stale")] });

    expect(client.getDiagnostics(FILE)).toEqual([makeDiagnostic("current")]);
  });

  it("accepts versioned diagnostics for a document that is not open", () => {
    const { client } = createRunningTestClient();

    publish(client, { uri: URI, version: 3, diagnostics: [makeDiagnostic("accepted")] });

    expect(client.getDiagnostics(FILE)).toEqual([makeDiagnostic("accepted")]);
  });

  it("clears pull result IDs safely when the cache is empty", () => {
    const { client } = createRunningTestClient();
    expect(() => client.clearPullResultIds()).not.toThrow();
  });
});
