/**
 * Shared Tool Selection question for retrospective prompts: Agent and Reviewer Run
 * retrospectives and `/supi-tooling-retro` ask it word for word, so their answers can be
 * compared. Each answer is one line, `- <family> | <question> | <tool> | <code> | <note>`,
 * or `- <family> | No such moment.`; the `gather-retrospectives` collector parses these lines.
 */

/** Tool families the Tool Selection question covers, as written at the start of each line. */
export const TOOL_SELECTION_FAMILIES = ["code_*", "codemode"] as const;

/** Codes for a moment answered with another tool than the family that fit. */
export const TOOL_SELECTION_NON_USE_CODES = [
  "not-considered",
  "rule-not-followed",
  "guidance-mismatch",
  "other-tool-preferred",
  "prior-result",
  "unknown",
] as const;

/** Codes for a call of the family whose result did not settle the question. */
export const TOOL_SELECTION_CALL_CODES = ["faulty-result", "rechecked"] as const;

const FAMILY_CRITERIA = {
  "code_*": `- \`code_*\` (Code Intelligence): a question about a code symbol (its definition, references or callers, implementations, type, or a file's declarations) or about diagnostics. Skip text that is not a symbol, such as string keys, prose, or config values.`,
  codemode: `- \`codemode\`: consecutive calls where an intermediate result set the next call's arguments without needing judgment; a verbose result, such as a log, broad search, or JSON response, of which a small part was used; or counting, filtering, or classifying about ten or more items by hand. Skip a single standalone call that needed no processing.`,
} as const;

/** Families whose tools are in `availableTools`, in the order of `TOOL_SELECTION_FAMILIES`. */
function availableToolSelectionFamilies(
  availableTools: readonly string[],
): Array<(typeof TOOL_SELECTION_FAMILIES)[number]> {
  return TOOL_SELECTION_FAMILIES.filter((family) =>
    family === "codemode"
      ? availableTools.includes("codemode")
      : availableTools.some((name) => name.startsWith("code_")),
  );
}

/**
 * Build the Tool Selection question for the families available in the assessed task, or
 * `undefined` when neither is available, so no answer is asked about missing tools.
 */
export function buildToolSelectionPrompt(availableTools: readonly string[]): string | undefined {
  const families = availableToolSelectionFamilies(availableTools);
  if (families.length === 0) return undefined;
  return `Tool selection: for each tool family below, list the task moments where a tool of that family fit, one line each, and report these moments nowhere else.
${families.map((family) => FAMILY_CRITERIA[family]).join("\n")}

Write each moment as one line: \`- <family> | <question> | <tool> | <code> | <note>\`, with \`<family>\` written exactly as \`${families.join("` or `")}\` and \`<tool>\` the tool that answered the question, or \`none\` when it was answered without a tool call. Use exactly one code; when unsure, use \`unknown\`.
- Another tool answered instead: \`not-considered\` (the family did not come up), \`rule-not-followed\` (a visible rule covered the moment, but it was not followed; quote the rule in the note), \`guidance-mismatch\` (no visible rule covered the moment; quote the closest rule in the note), \`other-tool-preferred\` (the other tool seemed faster, more complete, or more reliable; say why in the note), \`prior-result\` (an earlier result of that family in this task was unhelpful; name it in the note), or \`unknown\`.
- A tool of the family was called: \`faulty-result\` (its result was incomplete, oversized, ambiguous, or failed; name the problem and the follow-up call in the note) or \`rechecked\` (after its result arrived, the same question was answered again with another tool; say why in the note). Omit calls whose result answered the question and calls made in the same batch as another tool for the same question.

A visible rule is guidance the task could see when it chose the tool, such as the system prompt, tool descriptions, or loaded skills; the criteria in this question do not count. Codes are self-reports: cite reasoning visible in the transcript, and otherwise use \`unknown\` rather than constructing a rationale. List at most four moments per family. When a family had no such moment after checking every call, write \`- <family> | No such moment.\` instead. Do not state which tools were called or how often; that is measured separately.`;
}
