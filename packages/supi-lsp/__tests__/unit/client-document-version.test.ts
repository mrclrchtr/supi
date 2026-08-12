import { describe, expect, it } from "vitest";
import { createRunningTestClient } from "../helpers/client-test-harness.ts";

describe("LspClient open document versions", () => {
  it("reports the current version only while a document is open", () => {
    const { client } = createRunningTestClient();
    const file = "/project/src/index.ts";

    expect(client.getOpenDocumentVersion(file)).toBeNull();

    client.didOpen(file, "const value = 1;\n");
    expect(client.getOpenDocumentVersion(file)).toBe(1);

    client.didChange(file, "const value = 2;\n");
    expect(client.getOpenDocumentVersion(file)).toBe(2);

    client.didClose(file);
    expect(client.getOpenDocumentVersion(file)).toBeNull();
  });
});
