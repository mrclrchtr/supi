import { describe, expect, it } from "vitest";
import { runDependencyBootstrap } from "../../src/workspace/dependency-bootstrap.ts";

describe("dependency bootstrap", () => {
  it("accepts a successful command and rejects a failing command", async () => {
    await expect(
      runDependencyBootstrap(process.cwd(), `${process.execPath} -e "process.exit(0)"`),
    ).resolves.toBeUndefined();
    await expect(
      runDependencyBootstrap(process.cwd(), `${process.execPath} -e "process.exit(1)"`),
    ).rejects.toThrow("Dependency Bootstrap failed.");
  });
});
