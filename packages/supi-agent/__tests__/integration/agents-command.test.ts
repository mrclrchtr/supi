import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import agentExtension from "../../src/extension.ts";
import { agentProfileCatalogueStore } from "../../src/session.ts";

const temporaryDirectories: string[] = [];
const startedPis: ReturnType<typeof createPiMock>[] = [];

afterEach(async () => {
  await Promise.all(
    startedPis
      .splice(0)
      .map((pi) =>
        pi.emit("session_shutdown", { type: "session_shutdown", reason: "test" }, makeCtx()),
      ),
  );
  agentProfileCatalogueStore.clear();
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

type OverlayComponent = {
  render: (width: number) => string[];
  handleInput: (data: string) => void;
  dispose?: () => void;
};

async function startExtension(): Promise<ReturnType<typeof createPiMock>> {
  const agentDir = await mkdtemp(join(tmpdir(), "supi-agent-command-"));
  temporaryDirectories.push(agentDir);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  const directory = join(agentDir, "supi", "agents", "broken");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "profile.json"), "{", "utf8");
  const pi = createPiMock();
  startedPis.push(pi);
  agentExtension(pi as unknown as ExtensionAPI);
  await getHandlerOrThrow(pi, "session_start")(
    { type: "session_start", reason: "startup" },
    makeCtx({ cwd: process.cwd(), isProjectTrusted: () => false }),
  );
  return pi;
}

describe("Agent Profile pages in /agents", () => {
  it("keeps effective Profiles and bounded Profile Diagnostics in the shared viewer", async () => {
    const pi = await startExtension();
    const handler = pi.getCommandHandler("agents") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    let overlay: OverlayComponent | undefined;
    const base = makeCtx({ mode: "tui" });
    const custom = vi.fn(async (factory: (...args: unknown[]) => unknown) => {
      overlay = factory(
        { requestRender: vi.fn(), terminal: { rows: 24 } },
        base.ui.theme,
        {},
        vi.fn(),
      ) as OverlayComponent;
    });

    await handler("", makeCtx({ mode: "tui", ui: { ...base.ui, custom } }));
    if (!overlay) throw new Error("The /agents viewer did not open.");
    overlay.handleInput("\t");
    overlay.handleInput("\t");
    const profiles = overlay.render(100).join("\n");
    expect(profiles).toContain("explore — package");
    expect(profiles).toContain("general — package");
    overlay.handleInput("\t");
    const diagnostics = overlay.render(100).join("\n");
    expect(diagnostics).toContain("broken");
    expect(diagnostics).toContain("invalid-manifest");
    overlay.dispose?.();
  });
});
