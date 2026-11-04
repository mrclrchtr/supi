import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The generated name is deliberately excluded: it prevents workspace-name collisions,
// but is not part of the saved conversation's behavior or compatibility contract.
const DEFINITION = `description: Bounded read-only consultations with observed evidence.
mainAgent: true
subagent: false
tools:
  - search_web
  - read_url_content
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - finish
---
Provide bounded, read-only consultations using the available inspection tools.
Do not run commands, modify files, automate browsers, or delegate work.
For web research, use search_web to discover sources and read_url_content to verify relevant pages before citing them. Report limitations instead of claiming unperformed reads.
Return workspace evidence as workspace-relative paths; omit references outside the selected workspace.
Complete each request with finish using the current output schema.
`;

/** Compatibility marker for the static profile, not an attestation from Antigravity. */
export const INSPECTION_AGENT_FINGERPRINT = createHash("sha256").update(DEFINITION).digest("hex");

/**
 * Create an exclusively owned profile for a new conversation. Antigravity retains
 * its definition in conversation state, so callers remove it after the process ends.
 * Keep this out of general home preparation: discovery and follow-ups need no profile.
 */
export async function createInspectionAgent(
  homeDir: string,
): Promise<{ name: string; dispose: () => Promise<void> }> {
  const parent = join(homeDir, ".gemini", "config", "agents");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const name = `supi-consulting-${randomUUID()}`;
  const directory = join(parent, name);
  await mkdir(directory, { mode: 0o700 });
  const dispose = () => rm(directory, { recursive: true, force: true });
  try {
    await writeFile(join(directory, "agent.md"), `---\nname: ${name}\n${DEFINITION}`, {
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    await dispose();
    throw error;
  }
  return { name, dispose };
}
