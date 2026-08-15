// Unit tests for LSP pull diagnostic capability detection — static provider
// from the initialize result, and dynamic registration state per client.

import { describe, expect, it, vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import { JsonRpcRequestError } from "../../src/client/transport.ts";
import { CLIENT_CAPABILITIES } from "../../src/config/capabilities.ts";
import type { ServerCapabilities } from "../../src/config/types.ts";

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
    dispose: vi.fn(),
  };
  return client;
}

/** Client without static capabilities, for dynamic-registration scenarios. */
function createDynamicClient(): LspClient {
  return createClientWithCapabilities({});
}

const PYRIGHT_REGISTRATION = {
  registrations: [
    {
      id: "reg-1",
      method: "textDocument/diagnostic",
      registerOptions: {
        interFileDependencies: true,
        workspaceDiagnostics: false,
        documentSelector: null,
        identifier: "Pyright",
      },
    },
  ],
};

describe("LSP client capability advertisement", () => {
  it("advertises pull diagnostics, dynamic registration, and related document support", () => {
    expect(CLIENT_CAPABILITIES.textDocument?.diagnostic).toEqual({
      dynamicRegistration: true,
      relatedDocumentSupport: true,
    });
    expect(CLIENT_CAPABILITIES.workspace?.diagnostics).toEqual({ refreshSupport: false });
  });

  it("advertises only UTF-16 positions and text-only document changes", () => {
    expect(CLIENT_CAPABILITIES.general?.positionEncodings).toEqual(["utf-16"]);
    expect(CLIENT_CAPABILITIES.workspace?.workspaceEdit).toEqual({ documentChanges: true });
  });
});

describe("LSP pull diagnostic capability detection (static)", () => {
  it("detects a valid static diagnosticProvider capability", () => {
    const client = createClientWithCapabilities({
      diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
    });
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("tolerates the kotlin-lsp workDoneProgress field in a static provider", () => {
    const client = createClientWithCapabilities({
      diagnosticProvider: {
        interFileDependencies: true,
        workspaceDiagnostics: false,
        workDoneProgress: false,
      },
    });
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("detects missing diagnosticProvider capability", () => {
    const client = createClientWithCapabilities({});
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("fails closed when the static provider is not a record", () => {
    const client = createClientWithCapabilities({ diagnosticProvider: true as never });
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("fails closed when static interFileDependencies is not a boolean", () => {
    const client = createClientWithCapabilities({
      diagnosticProvider: { interFileDependencies: "yes", workspaceDiagnostics: false } as never,
    });
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("fails closed when static workspaceDiagnostics is missing", () => {
    const client = createClientWithCapabilities({
      diagnosticProvider: { interFileDependencies: true } as never,
    });
    expect(client.hasDiagnosticProvider).toBe(false);
  });
});

describe("LSP pull diagnostic capability detection (dynamic)", () => {
  it("does not enable pull before any registration arrives", () => {
    expect(createDynamicClient().hasDiagnosticProvider).toBe(false);
  });

  it("enables pull after a valid registration and disables it after unregister", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    expect(client.hasDiagnosticProvider).toBe(true);

    (client as AnyClient).handleServerRequest("client/unregisterCapability", {
      unregisterations: [{ id: "reg-1", method: "textDocument/diagnostic" }],
    });
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("keeps pull enabled until the last registration id is removed", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    (client as AnyClient).handleServerRequest("client/registerCapability", {
      registrations: [
        {
          id: "reg-2",
          method: "textDocument/diagnostic",
          registerOptions: { interFileDependencies: true, workspaceDiagnostics: false },
        },
      ],
    });
    expect(client.hasDiagnosticProvider).toBe(true);

    (client as AnyClient).handleServerRequest("client/unregisterCapability", {
      unregisterations: [{ id: "reg-1", method: "textDocument/diagnostic" }],
    });
    expect(client.hasDiagnosticProvider).toBe(true);

    (client as AnyClient).handleServerRequest("client/unregisterCapability", {
      unregisterations: [{ id: "reg-2", method: "textDocument/diagnostic" }],
    });
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("treats repeated registrations with distinct ids as harmless", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    // Pyright registers twice with two distinct auto-generated ids.
    (client as AnyClient).handleServerRequest("client/registerCapability", {
      registrations: [
        {
          id: "reg-1b",
          method: "textDocument/diagnostic",
          registerOptions: {
            interFileDependencies: true,
            workspaceDiagnostics: false,
            documentSelector: null,
            identifier: "Pyright",
          },
        },
      ],
    });
    expect(client.hasDiagnosticProvider).toBe(true);

    // Each unregister removes exactly one id; pull stays enabled until the last goes.
    (client as AnyClient).handleServerRequest("client/unregisterCapability", {
      unregisterations: [{ id: "reg-1", method: "textDocument/diagnostic" }],
    });
    expect(client.hasDiagnosticProvider).toBe(true);
    (client as AnyClient).handleServerRequest("client/unregisterCapability", {
      unregisterations: [{ id: "reg-1b", method: "textDocument/diagnostic" }],
    });
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("accepts registration options without identifier and documentSelector", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", {
      registrations: [
        {
          id: "reg-1",
          method: "textDocument/diagnostic",
          registerOptions: { interFileDependencies: true, workspaceDiagnostics: false },
        },
      ],
    });
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("ignores registrations for other methods", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", {
      registrations: [{ id: "reg-1", method: "textDocument/hover", registerOptions: {} }],
    });
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("answers workspace/diagnostic/refresh without an error", () => {
    // pyright sends this request when a document opens in pull mode even
    // though refreshSupport is not advertised; an error response crashes it.
    const client = createDynamicClient();
    expect(
      (client as AnyClient).handleServerRequest("workspace/diagnostic/refresh", {}),
    ).toBeNull();
  });

  it("rejects malformed registration options without enabling pull", () => {
    const client = createDynamicClient();
    expect(() =>
      (client as AnyClient).handleServerRequest("client/registerCapability", {
        registrations: [
          {
            id: "reg-1",
            method: "textDocument/diagnostic",
            registerOptions: { interFileDependencies: "yes", workspaceDiagnostics: false },
          },
        ],
      }),
    ).toThrow(JsonRpcRequestError);
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("rejects a missing workspaceDiagnostics boolean in registration options", () => {
    const client = createDynamicClient();
    expect(() =>
      (client as AnyClient).handleServerRequest("client/registerCapability", {
        registrations: [
          {
            id: "reg-1",
            method: "textDocument/diagnostic",
            registerOptions: { interFileDependencies: true },
          },
        ],
      }),
    ).toThrow(JsonRpcRequestError);
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("rejects a non-null, non-array documentSelector", () => {
    const client = createDynamicClient();
    expect(() =>
      (client as AnyClient).handleServerRequest("client/registerCapability", {
        registrations: [
          {
            id: "reg-1",
            method: "textDocument/diagnostic",
            registerOptions: {
              interFileDependencies: true,
              workspaceDiagnostics: false,
              documentSelector: "all",
            },
          },
        ],
      }),
    ).toThrow(JsonRpcRequestError);
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("rejects malformed registration params", () => {
    const client = createDynamicClient();
    expect(() =>
      (client as AnyClient).handleServerRequest("client/registerCapability", {
        registrations: "nope",
      }),
    ).toThrow(JsonRpcRequestError);
    expect(() =>
      (client as AnyClient).handleServerRequest("client/registerCapability", {
        registrations: [{ id: 7, method: "textDocument/diagnostic" }],
      }),
    ).toThrow(JsonRpcRequestError);
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("rejects malformed unregistration params and entries", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    expect(client.hasDiagnosticProvider).toBe(true);

    expect(() =>
      (client as AnyClient).handleServerRequest("client/unregisterCapability", {
        unregisterations: "nope",
      }),
    ).toThrow(JsonRpcRequestError);
    expect(() =>
      (client as AnyClient).handleServerRequest("client/unregisterCapability", {
        unregisterations: [{ id: 7, method: "textDocument/diagnostic" }],
      }),
    ).toThrow(JsonRpcRequestError);
    // A rejected unregister does not remove capability state.
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("rejects unregistrations that use the corrected (non-wire) spelling", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    expect(() =>
      (client as AnyClient).handleServerRequest("client/unregisterCapability", {
        unregistrations: [{ id: "reg-1", method: "textDocument/diagnostic" }],
      }),
    ).toThrow(JsonRpcRequestError);
    // The wire key is the documented `unregisterations` typo; the corrected
    // spelling is not accepted, so the registration stays active.
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("ignores unregistrations for other methods", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    (client as AnyClient).handleServerRequest("client/unregisterCapability", {
      unregisterations: [{ id: "reg-1", method: "textDocument/hover" }],
    });
    expect(client.hasDiagnosticProvider).toBe(true);
  });

  it("clears dynamic state on shutdown", async () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    expect(client.hasDiagnosticProvider).toBe(true);

    await client.shutdown();
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("clears dynamic state on process failure", () => {
    const client = createDynamicClient();
    (client as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    expect(client.hasDiagnosticProvider).toBe(true);

    (client as AnyClient).handleProcessFailure(new Error("crashed"));
    expect(client.hasDiagnosticProvider).toBe(false);
  });

  it("keeps dynamic state per client instance — a replacement starts empty", () => {
    const first = createDynamicClient();
    (first as AnyClient).handleServerRequest("client/registerCapability", PYRIGHT_REGISTRATION);
    expect(first.hasDiagnosticProvider).toBe(true);

    // A replacement client has no knowledge of the superseded instance's
    // registrations; its own registration enables pull only for itself.
    const replacement = createDynamicClient();
    expect(replacement.hasDiagnosticProvider).toBe(false);
    (replacement as AnyClient).handleServerRequest("client/registerCapability", {
      registrations: [
        {
          id: "replacement-reg",
          method: "textDocument/diagnostic",
          registerOptions: { interFileDependencies: true, workspaceDiagnostics: false },
        },
      ],
    });
    expect(replacement.hasDiagnosticProvider).toBe(true);

    // Late unregister on the superseded instance never affects the replacement.
    (first as AnyClient).handleServerRequest("client/unregisterCapability", {
      unregisterations: [{ id: "reg-1", method: "textDocument/diagnostic" }],
    });
    expect(first.hasDiagnosticProvider).toBe(false);
    expect(replacement.hasDiagnosticProvider).toBe(true);
  });
});
