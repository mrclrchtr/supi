import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDiagnosticTestFile, createPullTestClient } from "../helpers/client-test-harness.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Node can fire a deadline timer while Date.now() still reads just before the
 * deadline. Freezing the wall clock while real timers run reproduces that.
 */
function freezeWallClock(): number {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  return now;
}

describe("LSP file diagnostics caller deadline", () => {
  it("rejects when the deadline fires during first-open admission before the clock reaches it", async () => {
    const held = createDiagnosticTestFile("held.ts", "const held = true;\n");
    const cold = createDiagnosticTestFile("cold.ts", "const cold = true;\n");
    temporaryDirectories.push(held.tmpDir, cold.tmpDir);
    const { client, rpc } = createPullTestClient({ root: held.tmpDir, cwd: held.tmpDir });
    client.didOpen(held.filePath, "const held = true;\n");
    // A pending semantic request holds admission, so the first open of
    // `cold` waits until its deadline timer cancels it.
    rpc.sendRequest.mockImplementationOnce(() => new Promise(() => {}));
    void client.hover(held.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    const now = freezeWallClock();
    const request = client.syncAndWaitForDiagnostics(
      cold.filePath,
      "const cold = true;\n",
      { deadline: now + 20 },
      { contentIsAuthoritative: false },
    );

    await expect(request).rejects.toThrow("Code request deadline exceeded");
    expect(client.getOpenDocumentVersion(cold.filePath)).toBeNull();
  });

  it("rejects when the deadline fires during the diagnostic request before the clock reaches it", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createPullTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    client.didOpen(target.filePath, "const target = true;\n");
    rpc.sendRequest.mockImplementation(() => new Promise(() => {}));

    const now = freezeWallClock();
    const request = client.syncAndWaitForDiagnostics(target.filePath, "const target = true;\n", {
      deadline: now + 20,
    });

    await expect(request).rejects.toThrow("Code request deadline exceeded");
  });
});
