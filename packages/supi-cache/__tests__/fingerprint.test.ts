import { describe, expect, it } from "vitest";
import {
  computePromptFingerprint,
  diffFingerprints,
  type PromptFingerprint,
} from "../src/fingerprint.ts";

// ── Fixtures ──────────────────────────────────────────────────

/** Minimal BuildSystemPromptOptions-compatible shape for tests. */
function opts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cwd: "/project",
    ...overrides,
  };
}

// ── 1.2: computePromptFingerprint —— basic computation ────

describe("computePromptFingerprint", () => {
  it("returns zero-valued fingerprint for undefined options", () => {
    const fp = computePromptFingerprint(undefined);
    expect(fp.customPromptHash).toBe(0);
    expect(fp.appendSystemPromptHash).toBe(0);
    expect(fp.promptGuidelinesHash).toBe(0);
    expect(fp.selectedToolsHash).toBe(0);
    expect(fp.toolSnippetsHash).toBe(0);
    expect(fp.contextFiles).toEqual([]);
    expect(fp.skills).toEqual([]);
  });

  it("returns zero-valued fingerprint for empty options", () => {
    const fp = computePromptFingerprint(opts() as never);
    expect(fp.customPromptHash).toBe(0);
    expect(fp.appendSystemPromptHash).toBe(0);
    expect(fp.promptGuidelinesHash).toBe(0);
    expect(fp.selectedToolsHash).toBe(0);
    expect(fp.toolSnippetsHash).toBe(0);
    expect(fp.contextFiles).toEqual([]);
    expect(fp.skills).toEqual([]);
  });

  it("hashes customPrompt", () => {
    const fp = computePromptFingerprint(
      opts({ customPrompt: "You are a helpful assistant" }) as never,
    );
    expect(fp.customPromptHash).not.toBe(0);
    expect(fp.selectedToolsHash).toBe(0);
    expect(fp.contextFiles).toEqual([]);
  });

  it("hashes appendSystemPrompt", () => {
    const fp = computePromptFingerprint(
      opts({ appendSystemPrompt: "Always respond in French" }) as never,
    );
    expect(fp.appendSystemPromptHash).not.toBe(0);
  });

  it("hashes promptGuidelines", () => {
    const fp = computePromptFingerprint(
      opts({ promptGuidelines: ["Be concise", "Use bullet points"] }) as never,
    );
    expect(fp.promptGuidelinesHash).not.toBe(0);
  });

  it("hashes selectedTools sorted", () => {
    const fp = computePromptFingerprint(
      opts({ selectedTools: ["write", "bash", "read"] }) as never,
    );
    expect(fp.selectedToolsHash).not.toBe(0);
  });

  it("hashes toolSnippets sorted by key", () => {
    const fp = computePromptFingerprint(
      opts({
        toolSnippets: { bash: "Run shell commands", read: "Read files" },
      }) as never,
    );
    expect(fp.toolSnippetsHash).not.toBe(0);
  });

  it("hashes each context file content", () => {
    const fp = computePromptFingerprint(
      opts({
        contextFiles: [
          { path: "AGENTS.md", content: "# Agent rules" },
          { path: "TESTING.md", content: "# Test guidelines" },
        ],
      }) as never,
    );
    expect(fp.contextFiles).toHaveLength(2);
    expect(fp.contextFiles[0].path).toBe("AGENTS.md");
    expect(fp.contextFiles[0].hash).not.toBe(0);
    expect(fp.contextFiles[1].path).toBe("TESTING.md");
    expect(fp.contextFiles[1].hash).not.toBe(0);
  });

  it("hashes each skill", () => {
    const fp = computePromptFingerprint(
      opts({
        skills: [
          { name: "test", description: "Run tests", filePath: "/skills/test.md" },
          { name: "lint", description: "Lint code", filePath: "/skills/lint.md" },
        ],
      }) as never,
    );
    expect(fp.skills).toHaveLength(2);
    expect(fp.skills[0].name).toBe("test");
    expect(fp.skills[0].hash).not.toBe(0);
    expect(fp.skills[1].name).toBe("lint");
    expect(fp.skills[1].hash).not.toBe(0);
  });

  it("produces same hash for identical selectedTools regardless of order", () => {
    const fp1 = computePromptFingerprint(
      opts({ selectedTools: ["write", "bash", "read"] }) as never,
    );
    const fp2 = computePromptFingerprint(
      opts({ selectedTools: ["read", "bash", "write"] }) as never,
    );
    expect(fp1.selectedToolsHash).toBe(fp2.selectedToolsHash);
  });

  it("produces different hashes for different custom prompts", () => {
    const fp1 = computePromptFingerprint(opts({ customPrompt: "Be concise" }) as never);
    const fp2 = computePromptFingerprint(opts({ customPrompt: "Be detailed" }) as never);
    expect(fp1.customPromptHash).not.toBe(fp2.customPromptHash);
  });
});

// ── 1.2: Fingerprint stability ────────────────────────────

describe("fingerprint stability", () => {
  it("is stable for identical options", () => {
    const options = {
      cwd: "/project",
      customPrompt: "You are a coding assistant",
      selectedTools: ["read", "bash", "edit", "write"],
      toolSnippets: { read: "Read files", bash: "Run commands" },
      promptGuidelines: ["Be concise"],
      appendSystemPrompt: "Use TypeScript",
      contextFiles: [{ path: ".clinerules", content: "Rules" }],
      skills: [{ name: "test", description: "Test", filePath: "/test.md" }],
    };
    const fp1 = computePromptFingerprint(options as never);
    const fp2 = computePromptFingerprint(options as never);
    expect(fp1).toEqual(fp2);
  });

  it("produces different fingerprints for different context files", () => {
    const options = {
      cwd: "/project",
      contextFiles: [{ path: "AGENTS.md", content: "v1 rules" }],
    };
    const fp1 = computePromptFingerprint(options as never);
    const fp2 = computePromptFingerprint({
      ...options,
      contextFiles: [{ path: "AGENTS.md", content: "v2 rules" }],
    } as never);
    expect(fp1).not.toEqual(fp2);
  });

  it("handles context file order differences", () => {
    const fp1 = computePromptFingerprint(
      opts({
        contextFiles: [
          { path: "a.md", content: "a" },
          { path: "b.md", content: "b" },
        ],
      }) as never,
    );
    const fp2 = computePromptFingerprint(
      opts({
        contextFiles: [
          { path: "b.md", content: "b" },
          { path: "a.md", content: "a" },
        ],
      }) as never,
    );
    // Different order → different fingerprints
    expect(fp1.contextFiles[0].path).toBe("a.md");
    expect(fp2.contextFiles[0].path).toBe("b.md");
    expect(fp1).not.toEqual(fp2);
  });
});

// ── 1.3 + 1.4: diffFingerprints ───────────────────────────

describe("diffFingerprints", () => {
  function makeFingerprint(overrides: Partial<PromptFingerprint> = {}): PromptFingerprint {
    return {
      customPromptHash: 0,
      appendSystemPromptHash: 0,
      promptGuidelinesHash: 0,
      selectedToolsHash: 0,
      toolSnippetsHash: 0,
      contextFiles: [],
      skills: [],
      ...overrides,
    };
  }

  it("returns empty array for identical fingerprints", () => {
    const fp = makeFingerprint();
    expect(diffFingerprints(fp, fp)).toEqual([]);
  });

  it("detects added context file", () => {
    const prev = makeFingerprint({
      contextFiles: [{ path: "a.md", hash: 100 }],
    });
    const curr = makeFingerprint({
      contextFiles: [
        { path: "a.md", hash: 100 },
        { path: "b.md", hash: 200 },
      ],
    });
    expect(diffFingerprints(prev, curr)).toContain("contextFiles (+1)");
  });

  it("detects removed context file", () => {
    const prev = makeFingerprint({
      contextFiles: [
        { path: "a.md", hash: 100 },
        { path: "b.md", hash: 200 },
      ],
    });
    const curr = makeFingerprint({
      contextFiles: [{ path: "a.md", hash: 100 }],
    });
    expect(diffFingerprints(prev, curr)).toContain("contextFiles (-1)");
  });

  it("detects modified context file (same path, different hash)", () => {
    const prev = makeFingerprint({
      contextFiles: [{ path: "a.md", hash: 100 }],
    });
    const curr = makeFingerprint({
      contextFiles: [{ path: "a.md", hash: 200 }],
    });
    expect(diffFingerprints(prev, curr)).toContain("contextFiles (~1)");
  });

  it("detects added skill", () => {
    const prev = makeFingerprint({
      skills: [{ name: "test", hash: 100 }],
    });
    const curr = makeFingerprint({
      skills: [
        { name: "test", hash: 100 },
        { name: "lint", hash: 200 },
      ],
    });
    expect(diffFingerprints(prev, curr)).toContain("skills (+1)");
  });

  it("detects removed skill", () => {
    const prev = makeFingerprint({
      skills: [
        { name: "test", hash: 100 },
        { name: "lint", hash: 200 },
      ],
    });
    const curr = makeFingerprint({
      skills: [{ name: "test", hash: 100 }],
    });
    expect(diffFingerprints(prev, curr)).toContain("skills (-1)");
  });

  it("detects modified skill (same name, different hash)", () => {
    const prev = makeFingerprint({
      skills: [{ name: "test", hash: 100 }],
    });
    const curr = makeFingerprint({
      skills: [{ name: "test", hash: 200 }],
    });
    expect(diffFingerprints(prev, curr)).toContain("skills (~1)");
  });

  it("detects tools change when selectedToolsHash differs", () => {
    const fp1 = makeFingerprint({ selectedToolsHash: 100 });
    const fp2 = makeFingerprint({ selectedToolsHash: 200 });
    expect(diffFingerprints(fp1, fp2)).toContain("tools");
  });

  it("detects tools change when toolSnippetsHash differs", () => {
    const fp1 = makeFingerprint({ toolSnippetsHash: 100 });
    const fp2 = makeFingerprint({ toolSnippetsHash: 200 });
    expect(diffFingerprints(fp1, fp2)).toContain("tools");
  });

  it("detects guidelines change", () => {
    const fp1 = makeFingerprint({ promptGuidelinesHash: 100 });
    const fp2 = makeFingerprint({ promptGuidelinesHash: 200 });
    expect(diffFingerprints(fp1, fp2)).toContain("guidelines");
  });

  it("detects customPrompt change", () => {
    const fp1 = makeFingerprint({ customPromptHash: 100 });
    const fp2 = makeFingerprint({ customPromptHash: 200 });
    expect(diffFingerprints(fp1, fp2)).toContain("customPrompt");
  });

  it("detects appendText change", () => {
    const fp1 = makeFingerprint({ appendSystemPromptHash: 100 });
    const fp2 = makeFingerprint({ appendSystemPromptHash: 200 });
    expect(diffFingerprints(fp1, fp2)).toContain("appendText");
  });

  it("detects multiple simultaneous changes", () => {
    const fp1 = makeFingerprint({
      selectedToolsHash: 100,
      promptGuidelinesHash: 200,
      customPromptHash: 300,
      contextFiles: [{ path: "a.md", hash: 100 }],
    });
    const fp2 = makeFingerprint({
      selectedToolsHash: 999,
      promptGuidelinesHash: 999,
      customPromptHash: 999,
      contextFiles: [
        { path: "a.md", hash: 100 },
        { path: "b.md", hash: 200 },
      ],
    });
    const diffs = diffFingerprints(fp1, fp2);
    expect(diffs).toContain("tools");
    expect(diffs).toContain("guidelines");
    expect(diffs).toContain("customPrompt");
    expect(diffs).toContain("contextFiles (+1)");
  });

  it("detects replaced context file (different path at same position)", () => {
    const prev = makeFingerprint({
      contextFiles: [{ path: "a.md", hash: 100 }],
    });
    const curr = makeFingerprint({
      contextFiles: [{ path: "b.md", hash: 200 }],
    });
    const diffs = diffFingerprints(prev, curr);
    // One removed, one added at same position
    expect(diffs).toContain("contextFiles (+1, -1)");
  });
});
