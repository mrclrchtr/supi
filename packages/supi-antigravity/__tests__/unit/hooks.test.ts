import { describe, expect, it } from "vitest";
import { classifyHookOutput } from "../../src/process/hooks.ts";

describe("project hook discovery", () => {
  it("identifies active project hooks without retaining hook commands", () => {
    const result = classifyHookOutput(
      JSON.stringify({ hooks: [{ scope: "project", enabled: true, command: "secret" }] }),
      0,
    );
    expect(result.state).toBe("active");
    expect(result.warning).not.toContain("secret");
  });

  it("does not treat global-only hooks as project hooks", () => {
    expect(
      classifyHookOutput(JSON.stringify({ hooks: [{ scope: "global", enabled: true }] }), 0).state,
    ).toBe("inactive");
  });

  it("warns when output cannot be classified", () => {
    expect(classifyHookOutput("not json", 1)).toMatchObject({ state: "unknown" });
    expect(classifyHookOutput(JSON.stringify({}), 0)).toMatchObject({ state: "unknown" });
  });
});
