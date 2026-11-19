/**
 * Native calls that a code_* tool could have answered ("missed opportunities"),
 * next to the code_* calls of the same kind. Classification reads only the
 * search pattern and call arguments; it is a heuristic, not a judgment of
 * whether the code_* tool would have been better. See docs/ops/code-tool-usage.md.
 */

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const KEYWORDS = [
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "const",
  "let",
  "var",
  "def",
  "fn",
  "func",
  "struct",
].join("|");
const DECLARATION = new RegExp(
  `^(?:export )?(?:async )?\\(?(?:${KEYWORDS})(?:\\|(?:${KEYWORDS}))*\\)? ${IDENTIFIER}$`,
);
const IMPLEMENTATION = new RegExp(`(?:implements|extends)\\)? ${IDENTIFIER}$`);
const PLAIN_IDENTIFIER = new RegExp(`^${IDENTIFIER}$`);
/** camelCase, PascalCase with a second word, or snake_case: unlikely to be prose. */
const SYMBOL_SHAPE = /[a-z0-9][A-Z]|[A-Za-z0-9]_[A-Za-z0-9]/;
const NON_CODE_PATH = /\.(md|mdx|json|jsonl|ya?ml|toml|txt|log|lock|csv|sql)$/;
const CODE_PATH = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|swift)$/;
const MIN_FULL_READ_LINES = 100;

/** Flags that consume the next word, per search tool. `-e`/`--regexp` is handled as the pattern. */
const VALUE_FLAGS = {
  rg: new Set(
    "-g --glob --iglob -t --type -T --type-not -A -B -C --context --after-context --before-context -m --max-count -f --file -d --max-depth -M --max-columns -j --threads --sort --sortr -r --replace -E --encoding --pre --engine".split(
      " ",
    ),
  ),
  grep: new Set("-A -B -C -m -f --include --exclude --exclude-dir".split(" ")),
};

/**
 * Search categories. `benchmark` names the arm that wins the matching
 * scenarios of the tool-output benchmark (packages/supi-code-intelligence/docs/bench.md).
 */
export const SEARCH_CATEGORIES = {
  references: { codeTool: "code_graph references", benchmark: "code_* (ambiguous names)" },
  implementations: { codeTool: "code_graph implements", benchmark: "code_*" },
  declaration: { codeTool: "code_resolve / code_find", benchmark: "grep (exact names)" },
};

/** Quoted text, escapes, command separators, whitespace, and bare text of a shell command. */
const SHELL_TOKEN =
  /'([^']*)'|"((?:\\[\s\S]|[^"\\])*)"|\\([\s\S])|(\|\||&&|\|&|[;|&\n()])|(\s+)|([^\s'"\\;|&()]+)/g;

/**
 * Split a shell command into simple commands: unquoted `words`, and `piped`
 * when the command reads the previous command's output.
 */
export function shellSegments(command) {
  const segments = [{ words: [], piped: false }];
  let word = null;
  const endWord = () => {
    if (word !== null) segments.at(-1).words.push(word);
    word = null;
  };
  for (const [, single, double, escaped, operator, space, bare] of command.matchAll(SHELL_TOKEN)) {
    if (operator) {
      endWord();
      segments.push({ words: [], piped: operator === "|" || operator === "|&" });
    } else if (space) endWord();
    else word = (word ?? "") + (single ?? double?.replace(/\\(["\\$`])/g, "$1") ?? escaped ?? bare);
  }
  endWord();
  return segments.filter((segment) => segment.words.length > 0);
}

/** Boolean flags a word sets: one long flag or a cluster of short ones. */
function flagsOf(word) {
  return word.startsWith("--") ? [word.split("=")[0]] : [...word.slice(1)].map((c) => `-${c}`);
}

/** Split `rg`/`grep` arguments into boolean flags, an explicit `-e` pattern, and positional words. */
function readOptions(tool, words) {
  const options = { flags: new Set(), positional: [], pattern: undefined };
  const end = words.indexOf("--");
  const optionWords = end < 0 ? words : words.slice(0, end);
  for (let index = 0; index < optionWords.length; index++) {
    const word = optionWords[index];
    if (word === "-e" || word === "--regexp") options.pattern ??= optionWords[++index];
    else if (!word.startsWith("-") || word === "-") options.positional.push(word);
    else if (VALUE_FLAGS[tool].has(word)) index++;
    else for (const flag of flagsOf(word)) options.flags.add(flag);
  }
  if (end >= 0) options.positional.push(...words.slice(end + 1));
  return options;
}

/**
 * Parse one simple command as an `rg`/`grep` file search; `null` for anything
 * else, including filters over another command's output.
 */
function parseSearch({ words, piped }) {
  if (piped) return null;
  const start = words.findIndex((word) => !/^\w+=/.test(word));
  const tool = words[start];
  if (tool !== "rg" && tool !== "grep") return null;
  const { flags, positional, pattern } = readOptions(tool, words.slice(start + 1));
  if (flags.has("--files")) return null;
  return {
    pattern: pattern ?? positional.shift(),
    paths: positional,
    caseInsensitive: flags.has("-i") || flags.has("--ignore-case"),
  };
}

/** Searches a call performs: `rg`/`grep` commands in bash, or Pi's `grep` tool. */
export function searchesOf(call) {
  const args = call.arguments ?? {};
  if (call.name === "grep" && typeof args.pattern === "string")
    return [
      {
        pattern: args.pattern,
        paths: [args.path, args.glob].filter((value) => typeof value === "string"),
        caseInsensitive: args.ignoreCase === true,
      },
    ];
  if (call.name !== "bash" || typeof args.command !== "string") return [];
  return shellSegments(args.command)
    .map(parseSearch)
    .filter((search) => search !== null);
}

/** Drop regex decoration that does not change which symbol a pattern names. */
function normalizePattern(pattern) {
  return pattern
    .replace(/\\s[+*]| \+/g, " ")
    .replace(/\\b/g, "")
    .replace(/^\^ ?/, "")
    .trim();
}

function withoutCallSuffix(name) {
  return name.replace(/(?:\\\(|\(|\\\.|<| ?=)$/, "");
}

function isSymbolName(name) {
  return (
    name.length >= 4 &&
    !name.endsWith("_") &&
    PLAIN_IDENTIFIER.test(name) &&
    SYMBOL_SHAPE.test(name)
  );
}

/**
 * Category of a native search, or `null` when the pattern does not look like a
 * symbol question: case-insensitive searches, searches limited to non-code
 * files, regular expressions, and single lowercase words (likely prose).
 */
export function classifySearch({ pattern, paths, caseInsensitive }) {
  if (!pattern || caseInsensitive) return null;
  if (paths.length > 0 && paths.every((path) => NON_CODE_PATH.test(path))) return null;
  const normalized = withoutCallSuffix(normalizePattern(pattern));
  if (IMPLEMENTATION.test(normalized)) return "implementations";
  if (DECLARATION.test(normalized)) return "declaration";
  const alternatives = normalized
    .replace(/^\((.*)\)$/, "$1")
    .split("|")
    .map(withoutCallSuffix);
  return alternatives.every(isSymbolName) ? "references" : null;
}

/** Categories a code_* call answers, from its arguments. */
function codeToolCategories(call) {
  const args = call.arguments ?? {};
  if (call.name === "code_graph") {
    const relations = Array.isArray(args.relations) ? args.relations : ["references"];
    const has = (name) => relations.includes(name) || relations.includes("all");
    return [
      ...(has("references") ? ["references"] : []),
      ...(has("implements") ? ["implementations"] : []),
    ];
  }
  if (call.name === "code_resolve" && args.target?.symbol) return ["declaration"];
  const search = args.search ?? {};
  const findsDeclaration = search.semantic || search.ast?.kind === "definition";
  return call.name === "code_find" && findsDeclaration ? ["declaration"] : [];
}

function editedLines(args) {
  const edits = Array.isArray(args.edits) ? args.edits : [args];
  return edits.reduce(
    (sum, edit) => sum + (typeof edit?.oldText === "string" ? edit.oldText.split("\n").length : 0),
    0,
  );
}

/**
 * Whole-file reads of source files (no `offset`/`limit`, at least
 * `MIN_FULL_READ_LINES` lines) whose next mutation of that path is an `edit`:
 * lines read versus lines the edit replaced. Paths must match literally.
 */
export function fullReadsBeforeEdit(calls) {
  const pending = new Map();
  const found = [];
  for (const call of calls) {
    const args = call.arguments ?? {};
    if (typeof args.path !== "string") continue;
    const path = args.path.replace(/^\.\//, "");
    if (call.name === "read") {
      const lines = wholeSourceReadLines(call, path);
      if (lines) pending.set(path, lines);
    } else if (call.name === "edit" && pending.has(path)) {
      found.push({ linesRead: pending.get(path), linesEdited: editedLines(args) });
      pending.delete(path);
    } else if (call.name === "write") pending.delete(path);
  }
  return found;
}

/** Line count of a successful whole-file read of a large source file; 0 otherwise. */
function wholeSourceReadLines(call, path) {
  const { offset, limit } = call.arguments;
  if (call.isError || offset !== undefined || limit !== undefined || !CODE_PATH.test(path))
    return 0;
  const lines = call.text.split("\n").length;
  return lines >= MIN_FULL_READ_LINES ? lines : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function topPatterns(counts, limit = 5) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pattern, count]) => ({ pattern, count }));
}

/** Count one session's code_* calls and native symbol searches per category. */
function recordSearches(searches, calls) {
  const seen = new Set();
  for (const call of calls) {
    for (const category of codeToolCategories(call)) searches[category].codeTool++;
    for (const search of searchesOf(call)) {
      const entry = searches[classifySearch(search)];
      if (!entry) continue;
      entry.native++;
      entry.patterns.set(search.pattern, (entry.patterns.get(search.pattern) ?? 0) + 1);
      seen.add(entry);
    }
  }
  for (const entry of seen) entry.nativeSessions++;
}

/** Aggregate native symbol searches, matching code_* calls, and whole-file reads before edits. */
export function analyzeOpportunities(sessions) {
  const searches = Object.fromEntries(
    Object.keys(SEARCH_CATEGORIES).map((name) => [
      name,
      { native: 0, nativeSessions: 0, codeTool: 0, patterns: new Map() },
    ]),
  );
  const reads = [];
  let readSessions = 0;
  for (const calls of sessions) {
    recordSearches(searches, calls);
    const sessionReads = fullReadsBeforeEdit(calls);
    if (sessionReads.length) readSessions++;
    reads.push(...sessionReads);
  }
  return {
    searches: Object.fromEntries(
      Object.entries(searches).map(([name, { patterns, ...entry }]) => [
        name,
        { ...entry, topPatterns: topPatterns(patterns) },
      ]),
    ),
    fullReadsBeforeEdit: {
      count: reads.length,
      sessions: readSessions,
      medianLinesRead: median(reads.map((read) => read.linesRead)),
      medianLinesEdited: median(reads.map((read) => read.linesEdited)),
    },
  };
}
