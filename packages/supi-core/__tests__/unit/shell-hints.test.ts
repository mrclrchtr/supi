import { createPiMock, getHandlerOrThrow } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shell = vi.hoisted(() => ({
  calls: [] as Array<{ shellPath?: string; command: string }>,
  result: { exitCode: 0 as number | null, output: "" },
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createLocalBashOperations: ({ shellPath }: { shellPath?: string } = {}) => ({
    exec: async (command: string, _cwd: string, { onData }: { onData: (d: Buffer) => void }) => {
      shell.calls.push({ shellPath, command });
      onData(Buffer.from(shell.result.output));
      return { exitCode: shell.result.exitCode };
    },
  }),
}));

import {
  classifySed,
  registerShellHints,
  resetSedProbeForTests,
  SED_RULES,
  SHELL_SECTION,
} from "../../src/shell-hints.ts";

const gnu = { exitCode: 0, output: "sed (GNU sed) 4.10\nCopyright ..." };
const bsd = {
  exitCode: 1,
  output: "sed: illegal option -- -\nusage: sed script [-EHalnru] [-i extension] [file ...]",
};

function setup(settings: Record<string, string> = {}, tools = ["read", "bash"]) {
  const pi = createPiMock();
  Object.assign(pi, { getSettings: () => settings });
  registerShellHints(pi as never);
  const handler = getHandlerOrThrow(pi, "before_agent_start");
  return async (sections: Record<string, string> = {}) => {
    const systemPromptOptions = { selectedTools: tools, sections };
    await handler({ systemPromptOptions } as never, { cwd: "/repo" } as never);
    return sections;
  };
}

describe("classifySed", () => {
  it("recognizes GNU and BSD sed and leaves other output unknown", () => {
    expect(classifySed(gnu.exitCode, gnu.output)).toBe("gnu");
    expect(classifySed(bsd.exitCode, bsd.output)).toBe("bsd");
    expect(classifySed(0, "BusyBox v1.36")).toBeUndefined();
    expect(classifySed(127, "bash: sed: command not found")).toBeUndefined();
  });
});

describe("registerShellHints", () => {
  beforeEach(() => {
    resetSedProbeForTests();
    shell.calls.length = 0;
    shell.result = gnu;
  });

  it("probes sed with the bash tool's shell path and command prefix", async () => {
    shell.result = bsd;
    const sections = await setup({ shellPath: "/bin/zsh", shellCommandPrefix: "source ~/.env" })();
    expect(shell.calls).toEqual([
      { shellPath: "/bin/zsh", command: "source ~/.env\nsed --version" },
    ]);
    expect(sections[SHELL_SECTION]).toBe(`- ${SED_RULES.bsd}`);
  });

  it("probes once per shell setup and separately for a different setup", async () => {
    await setup()();
    await setup()();
    await setup({ shellCommandPrefix: "export PATH=/x:$PATH" })();
    expect(shell.calls).toHaveLength(2);
  });

  it("removes the section without bash or when the probe is inconclusive", async () => {
    const stale = { [SHELL_SECTION]: `- ${SED_RULES.gnu}` };
    expect(await setup({}, ["read"])({ ...stale })).toEqual({});
    expect(shell.calls).toHaveLength(0);

    shell.result = { exitCode: 127, output: "" };
    expect(await setup()({ ...stale })).toEqual({});
  });
});
