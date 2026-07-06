import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import claudeMdExtension from "../../src/claude-md.ts";

type DiscoverResult = {
  skillPaths?: string[];
};

function setup(): Map<string, (...args: unknown[]) => unknown> {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
  };
  claudeMdExtension(pi as never);
  return handlers;
}

function getDiscoverHandler(handlers: Map<string, (...args: unknown[]) => unknown>) {
  const handler = handlers.get("resources_discover");
  expect(handler).toBeDefined();
  return handler as (...args: unknown[]) => Promise<DiscoverResult>;
}

describe("supi-claude-md resources_discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers only a resources_discover handler", () => {
    const handlers = setup();
    expect([...handlers.keys()]).toEqual(["resources_discover"]);
  });

  it("returns absolute skill paths", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    expect(result.skillPaths).toBeDefined();
    expect(result.skillPaths?.length).toBeGreaterThan(0);
    for (const p of result.skillPaths ?? []) {
      expect(p).toMatch(/^\//);
    }
  });

  it("points at a skills directory that exists on disk", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    for (const p of result.skillPaths ?? []) {
      expect(existsSync(p)).toBe(true);
    }
  });

  it("points at a directory containing a SKILL.md", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    for (const p of result.skillPaths ?? []) {
      expect(findSkillFile(p)).toBeTruthy();
    }
  });
});

function findSkillFile(dir: string): string | null {
  if (existsSync(join(dir, "SKILL.md"))) return join(dir, "SKILL.md");
  const entries = existsSync(dir) ? readdirSync(dir) : [];
  for (const entry of entries) {
    const sub = join(dir, entry);
    if (statSync(sub).isDirectory()) {
      const found = findSkillFile(sub);
      if (found) return found;
    }
  }
  return null;
}
