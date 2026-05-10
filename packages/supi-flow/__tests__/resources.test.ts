import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import flowExtension from "../src/index.ts";

type DiscoverResult = {
  promptPaths?: string[];
  skillPaths?: string[];
};

function setup(): Map<string, (...args: unknown[]) => unknown> {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
    registerCommand() {},
  };
  flowExtension(pi as never);
  return handlers;
}

function getDiscoverHandler(handlers: Map<string, (...args: unknown[]) => unknown>) {
  const handler = handlers.get("resources_discover");
  expect(handler).toBeDefined();
  return handler as (...args: unknown[]) => Promise<DiscoverResult>;
}

describe("supi-flow resources_discover", () => {
  it("registers a resources_discover handler", () => {
    const handlers = setup();
    expect(handlers.has("resources_discover")).toBe(true);
  });

  it("returns absolute skill and prompt paths", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    expect(result.skillPaths).toBeDefined();
    expect(result.promptPaths).toBeDefined();
    expect(result.skillPaths?.length).toBeGreaterThan(0);
    expect(result.promptPaths?.length).toBeGreaterThan(0);

    for (const p of [...(result.skillPaths ?? []), ...(result.promptPaths ?? [])]) {
      expect(p).toMatch(/^\//);
    }
  });

  it("points at existing skills and prompts directories", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    for (const p of [...(result.skillPaths ?? []), ...(result.promptPaths ?? [])]) {
      expect(existsSync(p)).toBe(true);
    }
  });

  it("points at a prompts directory containing the retrospective template", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    for (const p of result.promptPaths ?? []) {
      expect(readdirSync(p)).toContain("supi-coding-retro.md");
      expect(existsSync(join(p, "supi-coding-retro.md"))).toBe(true);
    }
  });
});
