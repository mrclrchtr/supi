import { describe, expect, it } from "vitest";
import { parseNonInteractiveArgs } from "../args.ts";

describe("parseNonInteractiveArgs", () => {
  it("parses base-branch with default depth", () => {
    const result = parseNonInteractiveArgs("base-branch main");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.type).toBe("base-branch");
    if (result.target.type !== "base-branch") return;
    expect(result.target.branch).toBe("main");
    expect(result.depth).toBe("inherit");
  });

  it("parses base-branch with explicit depth", () => {
    const result = parseNonInteractiveArgs("base-branch main --depth fast");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.depth).toBe("fast");
  });

  it("parses uncommitted", () => {
    const result = parseNonInteractiveArgs("uncommitted");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.type).toBe("uncommitted");
  });

  it("parses commit", () => {
    const result = parseNonInteractiveArgs("commit abc123 --depth deep");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.type).toBe("commit");
    if (result.target.type !== "commit") return;
    expect(result.target.sha).toBe("abc123");
    expect(result.depth).toBe("deep");
  });

  it("parses custom with -- separator", () => {
    const result = parseNonInteractiveArgs("custom --depth fast -- Focus on security");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.type).toBe("custom");
    if (result.target.type !== "custom") return;
    expect(result.target.instructions).toBe("Focus on security");
    expect(result.depth).toBe("fast");
  });

  it("parses custom without -- separator", () => {
    const result = parseNonInteractiveArgs("custom Focus on security");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.target.type !== "custom") return;
    expect(result.target.instructions).toBe("Focus on security");
  });

  it("consumes --depth before --", () => {
    const result = parseNonInteractiveArgs("custom --depth deep -- --depth fast");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.depth).toBe("deep");
    if (result.target.type !== "custom") return;
    expect(result.target.instructions).toBe("--depth fast");
  });

  it("errors on missing branch", () => {
    const result = parseNonInteractiveArgs("base-branch");
    expect(result.ok).toBe(false);
  });

  it("errors on missing commit sha", () => {
    const result = parseNonInteractiveArgs("commit");
    expect(result.ok).toBe(false);
  });

  it("errors on missing custom instructions", () => {
    const result = parseNonInteractiveArgs("custom");
    expect(result.ok).toBe(false);
  });

  it("errors on unknown subcommand", () => {
    const result = parseNonInteractiveArgs("unknown");
    expect(result.ok).toBe(false);
  });

  it("errors on empty args", () => {
    const result = parseNonInteractiveArgs("");
    expect(result.ok).toBe(false);
  });
});
