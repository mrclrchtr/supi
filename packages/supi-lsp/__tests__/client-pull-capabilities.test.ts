// Unit tests for LSP pull diagnostic capability detection.

import { describe, expect, it, vi } from "vitest";
import { CLIENT_CAPABILITIES } from "../capabilities.ts";
import { LspClient } from "../client.ts";
import type { ServerCapabilities } from "../types.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
type AnyClient = any;

function createClientWithCapabilities(caps: Partial<ServerCapabilities>): LspClient {
  const client = new LspClient(
    "test",
    { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
    "/project",
  );
  (client as AnyClient)._status = "running";
  (client as AnyClient).capabilities = caps;
  (client as AnyClient).rpc = {
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  };
  return client;
}

describe("LSP pull diagnostic capability advertisement", () => {
  it("advertises pull diagnostics and related document support", () => {
    expect(CLIENT_CAPABILITIES.textDocument?.diagnostic).toEqual({
      dynamicRegistration: false,
      relatedDocumentSupport: true,
    });
    expect(CLIENT_CAPABILITIES.workspace?.diagnostics).toEqual({ refreshSupport: false });
  });
});

describe("LSP pull diagnostic capability detection", () => {
  it("detects diagnosticProvider capability", () => {
    const client = createClientWithCapabilities({
      diagnosticProvider: { documentIdentifierProvider: true },
    });
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("detects missing diagnosticProvider capability", () => {
    const client = createClientWithCapabilities({});
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("detects diagnosticProvider: false", () => {
    const client = createClientWithCapabilities({ diagnosticProvider: false });
    expect(client.hasDiagnosticProvider).toBe(false);
  });
});
