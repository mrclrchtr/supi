/**
 * Parse the Tool Selection lines that retrospective prompts ask for (`buildToolSelectionPrompt`
 * in `@mrclrchtr/supi-core/debug`): `- <family> | <question> | <tool> | <code> | <note>` or
 * `- <family> | No such moment.`. Keep the families and codes in sync with that module.
 */

export const TOOL_SELECTION_FAMILIES = Object.freeze(["code_*", "codemode"]);
export const TOOL_SELECTION_CODES = Object.freeze([
  "not-considered",
  "rule-not-followed",
  "guidance-mismatch",
  "other-tool-preferred",
  "prior-result",
  "unknown",
  "faulty-result",
  "rechecked",
]);

const LINE = /^\s*[-*]\s*`?(code_\*|codemode)`?\s*\|(.*)$/;
const NO_MOMENT = /^no such moment\.?$/i;
const field = (value) => value.trim().replace(/^`(.*)`$/, "$1");

/**
 * Return `{ status, moments, noMoment, invalidLines }`. `status` is `parsed` when at least one
 * line is valid, `invalid` when only malformed lines were found, and `missing` when the text has
 * no Tool Selection line, as in reports from older prompts or runs without these tools.
 */
export function parseToolSelection(text) {
  const moments = [];
  const noMoment = [];
  let invalidLines = 0;
  for (const line of typeof text === "string" ? text.split(/\r?\n/) : []) {
    const parsed = parseLine(line);
    if (parsed === null) continue;
    if (parsed === INVALID) invalidLines++;
    else if (parsed.noMoment) noMoment.push(parsed.family);
    else moments.push(parsed);
  }
  const valid = moments.length + noMoment.length;
  const status = valid > 0 ? "parsed" : invalidLines > 0 ? "invalid" : "missing";
  return { status, moments, noMoment, invalidLines };
}

const INVALID = Symbol("invalid");

// Return null for a line that is not a Tool Selection line, INVALID for a malformed one.
function parseLine(line) {
  const match = LINE.exec(line);
  if (!match) return null;
  const family = match[1];
  const fields = match[2].split("|").map(field);
  if (fields.length === 1 && NO_MOMENT.test(fields[0])) return { family, noMoment: true };
  const [question, tool, code, ...rest] = fields;
  if (!question || !tool || !TOOL_SELECTION_CODES.includes(code)) return INVALID;
  const note = rest.join(" | ");
  return { family, question, tool, code, ...(note ? { note } : {}) };
}
