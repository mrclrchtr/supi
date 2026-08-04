import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentProfileManifest } from "../../src/api.ts";

export async function writeProfile(
  root: string,
  id: string,
  manifest: object,
  customPrompt?: string,
): Promise<string> {
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "profile.json"), JSON.stringify(manifest), "utf8");
  if (customPrompt !== undefined)
    await writeFile(join(directory, "SYSTEM.md"), customPrompt, "utf8");
  return directory;
}

export function manifest(overrides: Partial<AgentProfileManifest> = {}): AgentProfileManifest {
  return {
    description: "Test profile",
    tools: [],
    systemPrompt: "native",
    instructionScopes: [],
    ...overrides,
  };
}
