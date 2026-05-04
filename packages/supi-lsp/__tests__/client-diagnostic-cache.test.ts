// Unit tests for LspClient diagnostic cache metadata and version gating.
// Tests directly access private state via `as any` since these behaviors
// are internal to the client and not exposed through public API.

import { describe, expect, it } from "vitest";
import { LspClient } from "../src/client/client.ts";
import type { PublishDiagnosticsParams } from "../src/types.ts";

function createClient(): LspClient {
  return new LspClient(
    "test",
    { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
    "/project",
  );
}

function publish(client: LspClient, params: PublishDiagnosticsParams): void {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
  (client as any).handlePublishDiagnostics(params);
}

function getCacheEntry(client: LspClient, uri: string) {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
  return (client as any).diagnosticStore.get(uri);
}

function setOpenDoc(client: LspClient, uri: string, version: number): void {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
  (client as any).openDocs.set(uri, { version, languageId: "typescript" });
}

function makeDiagnostic(message: string) {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

describe("LspClient diagnostic cache", () => {
  it("stores diagnostics with receivedAt timestamp", () => {
    const client = createClient();
    const before = Date.now();

    publish(client, { uri: "file:///project/a.ts", diagnostics: [makeDiagnostic("err")] });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry).toBeDefined();
    expect(entry.diagnostics).toHaveLength(1);
    expect(entry.diagnostics[0].message).toBe("err");
    expect(entry.receivedAt).toBeGreaterThanOrEqual(before);
    expect(entry.receivedAt).toBeLessThanOrEqual(Date.now());
  });

  it("stores diagnostics with version when provided", () => {
    const client = createClient();

    publish(client, {
      uri: "file:///project/a.ts",
      version: 5,
      diagnostics: [makeDiagnostic("err")],
    });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry).toBeDefined();
    expect(entry.version).toBe(5);
  });

  it("stores diagnostics without version when omitted", () => {
    const client = createClient();

    publish(client, { uri: "file:///project/a.ts", diagnostics: [makeDiagnostic("err")] });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry).toBeDefined();
    expect(entry.version).toBeUndefined();
  });

  it("replaces diagnostics for same uri (unversioned)", () => {
    const client = createClient();

    publish(client, { uri: "file:///project/a.ts", diagnostics: [makeDiagnostic("first")] });
    publish(client, { uri: "file:///project/a.ts", diagnostics: [makeDiagnostic("second")] });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry.diagnostics).toHaveLength(1);
    expect(entry.diagnostics[0].message).toBe("second");
  });

  it("replaces diagnostics when version matches open doc version", () => {
    const client = createClient();
    setOpenDoc(client, "file:///project/a.ts", 5);

    publish(client, {
      uri: "file:///project/a.ts",
      version: 5,
      diagnostics: [makeDiagnostic("current")],
    });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry.diagnostics[0].message).toBe("current");
  });

  it("ignores diagnostics with version older than open doc version", () => {
    const client = createClient();

    publish(client, { uri: "file:///project/a.ts", diagnostics: [makeDiagnostic("current")] });
    setOpenDoc(client, "file:///project/a.ts", 5);

    publish(client, {
      uri: "file:///project/a.ts",
      version: 4,
      diagnostics: [makeDiagnostic("stale")],
    });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry.diagnostics[0].message).toBe("current");
  });

  it("accepts diagnostics with version equal to open doc version", () => {
    const client = createClient();
    setOpenDoc(client, "file:///project/a.ts", 5);

    publish(client, {
      uri: "file:///project/a.ts",
      version: 5,
      diagnostics: [makeDiagnostic("matching")],
    });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry.diagnostics[0].message).toBe("matching");
  });

  it("accepts versioned diagnostics for documents not in openDocs", () => {
    const client = createClient();

    publish(client, {
      uri: "file:///project/a.ts",
      version: 3,
      diagnostics: [makeDiagnostic("accepted")],
    });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry.diagnostics[0].message).toBe("accepted");
  });

  it("preserves existing diagnostics when ignoring stale versioned publication", () => {
    const client = createClient();

    publish(client, {
      uri: "file:///project/a.ts",
      version: 5,
      diagnostics: [makeDiagnostic("v5-diag")],
    });

    const originalEntry = getCacheEntry(client, "file:///project/a.ts");
    setOpenDoc(client, "file:///project/a.ts", 6);

    publish(client, {
      uri: "file:///project/a.ts",
      version: 3,
      diagnostics: [makeDiagnostic("v3-stale")],
    });

    const entry = getCacheEntry(client, "file:///project/a.ts");
    expect(entry).toBe(originalEntry); // Same reference — not replaced
    expect(entry.diagnostics[0].message).toBe("v5-diag");
  });
});
