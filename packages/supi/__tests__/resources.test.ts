import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import resourcesExtension from "../src/resources.ts";

function setup(): Map<string, (...args: unknown[]) => unknown> {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
  };
  resourcesExtension(pi as never);
  return handlers;
}

function getDiscoverHandler(handlers: Map<string, (...args: unknown[]) => unknown>) {
  const handler = handlers.get("resources_discover");
  expect(handler).toBeDefined();
  return handler as (...args: unknown[]) => Promise<{
    promptPaths: string[];
  }>;
}

describe("resources extension", () => {
  it("registers a resources_discover handler", () => {
    const handlers = setup();
    expect(handlers.has("resources_discover")).toBe(true);
  });

  it("returns absolute prompt paths", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    expect(result).toEqual({
      promptPaths: [expect.stringContaining(join("packages", "supi", "prompts"))],
    });

    for (const p of result.promptPaths) {
      expect(p).toMatch(/^\//);
    }
  });

  it("points at directories that exist on disk", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    for (const p of result.promptPaths) {
      expect(existsSync(p)).toBe(true);
    }
  });
});
