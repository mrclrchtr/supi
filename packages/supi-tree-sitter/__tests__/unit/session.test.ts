import { describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../../src/session/session.ts";

describe("createTreeSitterSession", () => {
  it("creates a session with the expected methods", () => {
    // Note: Creating a real session initializes web-tree-sitter WASM,
    // which may not be available in all test environments.
    // This test verifies the factory produces a correctly-shaped session object.
    const session = createTreeSitterSession("/tmp");
    expect(session).toBeDefined();
    expect(typeof session.outline).toBe("function");
    expect(typeof session.imports).toBe("function");
    expect(typeof session.exports).toBe("function");
    expect(typeof session.nodeAt).toBe("function");
    expect(typeof session.calleesAt).toBe("function");
    expect(typeof session.canParse).toBe("function");
    expect(typeof session.query).toBe("function");
    expect(typeof session.dispose).toBe("function");
    session.dispose();
  });
});
