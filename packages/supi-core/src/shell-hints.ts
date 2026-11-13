// Shell hints — explain BSD sed script errors once per session.
//
// On macOS, `sed` is BSD sed: `-i` requires a backup-suffix argument and script errors read
// `sed: 1: "...": ...`. Agents trained on GNU sed retry the same shape repeatedly. This hook adds
// one hint to the first matching bash result in a session. It costs no context until it fires.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Marker that identifies the hint in tool results and on the session branch. */
export const BSD_SED_HINT_MARKER = "[supi shell hint]";

/** Text appended to the first BSD sed script error in a session. */
export const BSD_SED_HINT = `${BSD_SED_HINT_MARKER} This is BSD sed (macOS): \`sed -i\` needs a suffix argument (\`sed -i '' ...\`), and the substitute delimiter must not occur in the pattern. Prefer the edit tool for file changes when it is available, or \`gsed\` if installed.`;

const BSD_SED_ERROR = /^sed: (?:\d+: |-i may not be used|-I or -i may not be used)/m;

function resultText(content: readonly { type: string; text?: string }[]): string {
  return content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("\n");
}

function hintAlreadyShown(ctx: ExtensionContext): boolean {
  return ctx.sessionManager
    .getBranch()
    .some(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        JSON.stringify(entry.message.content).includes(BSD_SED_HINT_MARKER),
    );
}

/**
 * Register a `tool_result` hook that appends {@link BSD_SED_HINT} to the first bash result in a
 * session that contains a BSD sed script error. Safe to register from several extensions: the hook
 * skips results that already carry the hint and sessions whose branch already shows it.
 * Usable directly as a child-session extension factory.
 */
export function registerShellHints(pi: ExtensionAPI): void {
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "bash") return;
    const text = resultText(event.content);
    if (!BSD_SED_ERROR.test(text) || text.includes(BSD_SED_HINT_MARKER)) return;
    if (hintAlreadyShown(ctx)) return;
    return { content: [...event.content, { type: "text", text: BSD_SED_HINT }] };
  });
}
