import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_LOG_PREFIX = "SUPI_STATUS ";
const STATUS_LOG_ENV = "SUPI_LOG_STATUS";
function byName(a: string, b: string): number {
  return a.localeCompare(b);
}

function statusLogEnabled(): boolean {
  const value = process.env[STATUS_LOG_ENV];
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/**
 * Emit a stderr-only SuPi load status inventory marker for external log inspection.
 *
 * The marker reports observed tools and commands only; consumers own their
 * harness-specific validation policy.
 *
 * This deliberately does not call `pi.sendMessage()`: custom messages are part
 * of pi's session history and are converted into LLM-visible user messages.
 * `appendEntry()` is pi's native non-LLM context persistence surface, while
 * stderr is captured by Harbor's `2>&1 | tee pi.txt` command for `--no-session`
 * runs where session entries are not inspectable.
 */
export function maybeLogLoadStatus(pi: ExtensionAPI, cwd: string): void {
  if (!statusLogEnabled()) return;

  const allTools = typeof pi.getAllTools === "function" ? pi.getAllTools() : [];
  const activeTools = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
  const commands = typeof pi.getCommands === "function" ? pi.getCommands() : [];
  const registeredToolNames = allTools.map((tool) => tool.name).sort(byName);
  const activeToolNames = [...activeTools].sort(byName);
  const commandNames = commands.map((command) => command.name).sort(byName);

  const status = {
    type: "supi_status",
    version: 2,
    phase: "session_start",
    cwd,
    tools: {
      registered: registeredToolNames,
      active: activeToolNames,
    },
    commands: commandNames,
  };

  pi.appendEntry("supi-status", status);
  process.stderr.write(`${STATUS_LOG_PREFIX}${JSON.stringify(status)}\n`);
}
