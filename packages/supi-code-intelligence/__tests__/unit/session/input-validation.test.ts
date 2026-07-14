import { describe, expect, it } from "vitest";
import { parseResolveRequest, parseTargetInput } from "../../../src/session/input/common.ts";
import {
  parseHealthWorkflowInput,
  parseRefactorPlanWorkflowInput,
} from "../../../src/session/input/health-refactor.ts";
import {
  parseGraphWorkflowInput,
  parseInspectWorkflowInput,
  parseOrientationWorkflowInput,
} from "../../../src/session/input/workflows.ts";

describe("session runtime input validation", () => {
  it.each([
    [
      "rejects fractional inspection coordinates",
      () => parseInspectWorkflowInput({ point: { file: "src/a.ts", line: 1.5, character: 1 } }),
    ],
    [
      "rejects an unknown Orientation focus branch",
      () => parseOrientationWorkflowInput({ focus: { package: "supi" } }),
    ],
    [
      "rejects unsupported graph relations",
      () => parseGraphWorkflowInput({ target: { handle: "tg-1" }, relations: ["imports"] }),
    ],
    ["rejects non-boolean health refresh", () => parseHealthWorkflowInput({ refresh: "yes" })],
    [
      "rejects the removed refactor rename alias",
      () =>
        parseRefactorPlanWorkflowInput({
          target: { handle: "tg-1" },
          operation: { rename: { newName: "next" } },
        }),
    ],
    [
      "rejects malformed target anchors",
      () => parseTargetInput({ anchor: { file: "src/a.ts", line: 0, character: 1 } }, ["anchor"]),
    ],
    [
      "rejects unsupported resolve input fields",
      () => parseResolveRequest({ target: { file: "src/a.ts" }, legacy: true }),
    ],
  ])("%s", (_name, parse) => {
    const outcome = parse();

    expect(outcome.kind).toBe("invalid-input");
  });
});
