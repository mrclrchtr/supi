// Registered SuPi tools carry the namespace and annotation metadata that codemode and
// permission extensions read from `pi.getAllTools()`. Spec-level hints are checked in
// tool-schema-integrity.test.mjs; this test covers what registration actually forwards.

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const PACKAGES = new URL("../../packages", import.meta.url).pathname;
const TOOL_PACKAGES = [
  "supi-agent",
  "supi-cache",
  "supi-code-intelligence",
  "supi-debug",
  "supi-review",
  "supi-web",
];
const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];

describe("registered tool metadata", () => {
  it("forwards annotations to every tool and one shared namespace to script-callable tools", {
    timeout: 30_000,
  }, async () => {
    const factories = await Promise.all(
      TOOL_PACKAGES.map(
        async (pkg) => (await import(`${PACKAGES}/${pkg}/src/extension.ts`)).default,
      ),
    );
    const directory = mkdtempSync(join(tmpdir(), "supi-tool-metadata-"));
    const cwd = join(directory, "workspace");
    const agentDir = join(directory, "agent");
    mkdirSync(cwd);
    mkdirSync(agentDir);
    let session;
    try {
      const settingsManager = SettingsManager.inMemory({
        defaultTools: ["+codemode"],
        compaction: { enabled: false },
        retry: { enabled: false },
      });
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        extensionFactories: [createCodemodeExtension(), ...factories],
      });
      await resourceLoader.reload();
      const modelRuntime = await ModelRuntime.create({
        authPath: join(agentDir, "auth.json"),
        modelsPath: null,
        allowModelNetwork: false,
        refreshOnCreate: false,
      });
      ({ session } = await createAgentSession({
        cwd,
        agentDir,
        model: modelRuntime.getModels()[0],
        modelRuntime,
        settingsManager,
        resourceLoader,
        sessionManager: SessionManager.inMemory(cwd),
      }));
      await session.bindExtensions({});

      const tools = session.getAllTools().filter((tool) => tool.sourceInfo.source !== "builtin");
      const supi = tools.filter((tool) => tool.name !== "codemode");
      expect(supi.length).toBeGreaterThanOrEqual(20);

      const namespaces = new Map();
      for (const tool of supi) {
        for (const hint of HINTS) {
          expect(typeof tool.annotations?.[hint], `${tool.name} ${hint}`).toBe("boolean");
        }
        if (tool.exposure === "model-only") {
          // Codemode never lists model-only tools, so they stay ungrouped.
          expect(tool.namespace, `${tool.name} namespace`).toBeUndefined();
          continue;
        }
        expect(tool.namespace?.description, `${tool.name} namespace`).toEqual(expect.any(String));
        const shared = namespaces.get(tool.namespace.name) ?? tool.namespace;
        expect(tool.namespace, `${tool.name} shares its package namespace`).toBe(shared);
        namespaces.set(tool.namespace.name, shared);
      }
      expect([...namespaces.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
        "cache",
        "code",
        "debug",
        "review",
        "web",
      ]);
    } finally {
      session?.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
