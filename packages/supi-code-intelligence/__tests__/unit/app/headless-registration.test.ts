import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import headlessInspectionProfile from "../../../src/headless.ts";

describe("headless inspection profile", () => {
  it("registers exactly the six non-mutating Code Intelligence tools", () => {
    const pi = createPiMock();
    headlessInspectionProfile(pi as unknown as ExtensionAPI);

    expect(
      getTools(pi)
        .map((tool) => tool.name)
        .filter((name) => name.startsWith("code_")),
    ).toEqual([
      "code_resolve",
      "code_inspect",
      "code_orientation",
      "code_graph",
      "code_find",
      "code_health",
    ]);
    expect(pi.commands.size).toBe(0);
  });
});
