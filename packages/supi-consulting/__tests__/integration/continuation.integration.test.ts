import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAntigravityAdapter } from "../../src/agents/antigravity/adapter.ts";
import { getIsolatedAntigravityPaths } from "../../src/agents/antigravity/isolated-home.ts";
import {
  CONSULTING_HANDLE_ENTRY_TYPE,
  ConversationHandleStore,
} from "../../src/conversation/handles.ts";
import { registerConsultingRunTool } from "../../src/tool/consulting_run/register.ts";
import { fixtureDirectory } from "../helpers/test-paths.ts";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("consulting_run continuation identity", () => {
  it("retires a handle when its agent returns a different conversation", async () => {
    const root = await mkdtemp(join(tmpdir(), "supi-consulting-continuation-"));
    roots.push(root);
    vi.stubEnv("PATH", `${fixtureDirectory(import.meta.dirname)}:${process.env.PATH ?? ""}`);
    const paths = getIsolatedAntigravityPaths(root);
    const adapter = createAntigravityAdapter(paths);
    const availability = await adapter.discover();
    expect(availability.status).toBe("available");
    if (availability.status !== "available") throw new Error("Fixture agent is not available.");
    const execute = vi.spyOn(adapter, "execute");
    const pi = createPiMock();
    registerConsultingRunTool({
      pi: pi as never,
      adapter,
      availability,
      handles: new ConversationHandleStore(),
    });
    const tool = pi.tools[0] as {
      execute: (...args: unknown[]) => Promise<{ details: { handle: string } }>;
    };
    const context = makeCtx({ cwd: root });
    const first = await tool.execute(
      "first",
      {
        prompt: "begin",
        new: { agent: "antigravity", model: "gemini-3.8-flash-low", workspace: false },
      },
      undefined,
      undefined,
      context,
    );
    const handle = first.details.handle;
    await expect(
      tool.execute(
        "changed-conversation",
        { prompt: "different-conversation", continue: { handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toMatchObject({ name: "ConsultingAgentError", kind: "conversation-mismatch" });
    expect(pi.entries).toContainEqual({
      type: CONSULTING_HANDLE_ENTRY_TYPE,
      data: expect.objectContaining({ action: "retired", handle }),
    });
    expect(execute).toHaveBeenCalledTimes(2);
    await expect(
      tool.execute(
        "retry",
        { prompt: "retry", continue: { handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow(/retired/);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
