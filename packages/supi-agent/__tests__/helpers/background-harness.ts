import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import {
  type ControlledSdk,
  controlledUsage,
  backgroundHarness as sharedBackgroundHarness,
} from "@mrclrchtr/supi-test-utils/background";
import agentExtension from "../../src/extension.ts";

/** A Delegation Task for a new Agent Run; `harness.child(id)` finds its child session. */
export const task = (id = "one", profile = "explore") => ({
  id,
  new: { profile },
  instructions: `Inspect ${id} module.`,
});

/** Usage billed by every controlled child session. */
export const usage = controlledUsage;

/** The shared background harness loaded with the Agent extension and Agent Profile fixtures. */
export async function backgroundHarness(
  sdk: ControlledSdk,
  options: { timeoutMinutes?: number; persistentParent?: boolean } = {},
) {
  const harness = await sharedBackgroundHarness({
    sdk,
    extension: agentExtension,
    persistentParent: options.persistentParent,
    childPrompt: (id) => `Inspect ${id} module.`,
    prepare: async ({ agentDir }) => {
      if (!options.timeoutMinutes) return;
      await mkdir(join(agentDir, "supi/agents/explore"), { recursive: true });
      await writeFile(
        join(agentDir, "supi/agents/explore/profile.json"),
        JSON.stringify({ timeoutMinutes: options.timeoutMinutes }),
      );
    },
  });
  return Object.defineProperty(harness, "registry", {
    get: () => getAgentRunRegistry(harness.pi as unknown as ExtensionAPI),
  }) as typeof harness & { readonly registry: ReturnType<typeof getAgentRunRegistry> };
}
