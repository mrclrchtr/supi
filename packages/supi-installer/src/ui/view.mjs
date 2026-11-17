import stringWidth from "string-width";
import { cleanLine, formatReview } from "../format.mjs";
import { canEdit, getPlan } from "../matrix.mjs";
import { sourceOf } from "../sources.mjs";

/** @typedef {{matrix: import('../matrix.mjs').Matrix, index: number, scope: import('../types.ts').Scope, review: boolean, offset: number, color?: boolean}} View */
/** A styled text run. `sgr` holds ANSI SGR parameters such as "1;32"; it is ignored without color. @typedef {Array<string | undefined>} Segment */
/** @typedef {Segment[]} Line */

const SGR = { bold: "1", dim: "2", inverse: "7", red: "31", green: "32", yellow: "33", cyan: "36" };
const NAME_WIDTH = 34;
const CELL_WIDTH = 9;
/** Review tones mapped to SGR parameters. @type {Record<string, string>} */
const TONES = {
  heading: SGR.bold,
  install: SGR.green,
  remove: SGR.red,
  warning: SGR.yellow,
  muted: SGR.dim,
};

/** @param {Line} line */
function lineWidth(line) {
  return line.reduce((size, [text = ""]) => size + stringWidth(cleanLine(text)), 0);
}

/** Pad a line with spaces to a cell width. @param {Line} line @param {number} width @returns {Line} */
function pad(line, width) {
  return [...line, [" ".repeat(Math.max(0, width - lineWidth(line)))]];
}

/** Clip by terminal cells, not UTF-16 units, and apply styles only to the visible part. @param {Line} line @param {number} width @param {boolean} color */
function renderLine(line, width, color) {
  let result = "";
  let size = 0;
  for (const [text = "", sgr] of line) {
    let part = "";
    for (const char of cleanLine(text)) {
      const cells = stringWidth(char);
      if (size + cells > width) break;
      size += cells;
      part += char;
    }
    if (part) result += color && sgr ? `\u001b[${sgr}m${part}\u001b[0m` : part;
    if (size >= width) break;
  }
  return result;
}

/** Keep every source character available in the scrollable review. @param {string} line @param {number} width */
function wrapLine(line, width) {
  const lines = [];
  let part = "";
  let size = 0;
  for (const char of cleanLine(line)) {
    const cells = stringWidth(char);
    if (size + cells > width) {
      lines.push(part);
      part = "";
      size = 0;
    }
    part += char;
    size += cells;
  }
  return [...lines, part];
}

/**
 * Show the draft against the current declaration: `[x]` kept, `[+]` added, `[-]` removed, and
 * parentheses for cells that cannot change. Without color, a `>` marks the focused cell.
 * @param {View} view @param {number} index @param {import('../types.ts').Scope} scope @returns {Line}
 */
function cell(view, index, scope) {
  const row = view.matrix.rows[index];
  const declared = Boolean(row.initial[scope]);
  const selected = row.selected[scope];
  const focused = view.index === index && view.scope === scope;
  const locked = !canEdit(view.matrix, index, scope);
  const mark = selected === declared ? (selected ? "x" : " ") : selected ? "+" : "-";
  const tone = locked
    ? SGR.dim
    : selected === declared
      ? undefined
      : `${SGR.bold};${selected ? SGR.green : SGR.red}`;
  const text = locked ? `(${mark})` : `[${mark}]`;
  if (!focused) return [[" "], [text, tone]];
  if (view.color) return [[" "], [text, [tone, SGR.inverse].filter(Boolean).join(";")]];
  return [[">"], [text]];
}

/** Recommended packages get a star; release-stage and opt-in labels stay next to the name. @param {import('../types.ts').CatalogItem} item @returns {Line} */
function tags(item) {
  /** @type {Line} */
  const line = [];
  if (item.recommended) line.push([" ★", SGR.yellow]);
  const inline = item.labels.filter((label) => label === "Beta" || label === "Opt-in");
  if (inline.length) line.push([` ${inline.join(" ").toLowerCase()}`, SGR.dim]);
  return line;
}

/** @param {View} view @param {number} index @returns {Line} */
function rowLine(view, index) {
  const { item } = view.matrix.rows[index];
  const focused = view.index === index;
  /** @type {Line} */
  const name = [
    [focused ? "› " : "  ", SGR.cyan],
    [item.name, focused ? SGR.bold : undefined],
    ...tags(item),
  ];
  return [
    ...pad(name, NAME_WIDTH),
    ...pad(cell(view, index, "project"), CELL_WIDTH),
    ...cell(view, index, "global"),
  ];
}

/** Interleave a section heading before the first removal-only row. @param {View} view */
function displayItems(view) {
  /** @type {Array<{index: number} | {heading: string}>} */
  const items = [];
  for (const [index, row] of view.matrix.rows.entries()) {
    if (row.item.obsolete && !view.matrix.rows[index - 1]?.item.obsolete)
      items.push({ heading: "Obsolete · removal only" });
    items.push({ index });
  }
  return items;
}

/** @param {View} view @returns {Line} */
function statusLine(view) {
  const { matrix, index, scope } = view;
  const { blocked, unmanaged } = matrix.inventory;
  const pending = getPlan(matrix).length;
  const unmanagedCount = unmanaged.project.length + unmanaged.global.length;
  return [
    [`${index + 1}/${matrix.rows.length}`, SGR.dim],
    [" · Focus: "],
    [scope === "project" ? "Project" : "Global", SGR.bold],
    [" · "],
    pending
      ? [`${pending} pending change${pending === 1 ? "" : "s"}`, `${SGR.bold};${SGR.yellow}`]
      : ["No pending changes", SGR.dim],
    ...(unmanagedCount ? [[` · Unmanaged: ${unmanagedCount}`, SGR.dim]] : []),
    ...["project", "global"]
      .filter((name) => blocked[/** @type {import('../types.ts').Scope} */ (name)].length)
      .map((name) => [` · ${name} BLOCKED`, `${SGR.bold};${SGR.red}`]),
  ];
}

/** Description and declaration source of the focused row and scope. @param {View} view @returns {Line[]} */
function detailLines(view) {
  const { matrix, index, scope } = view;
  const { blocked } = matrix.inventory;
  const row = matrix.rows[index];
  const source = row.initial[scope];
  const audience = row.item.labels.filter((label) => !["Beta", "Opt-in"].includes(label));
  /** @type {Line} */
  const about = row.item.obsolete
    ? [
        [row.item.name, SGR.bold],
        [" — Obsolete; removal only. "],
        [row.item.replacement ?? "No replacement.", SGR.yellow],
      ]
    : [
        [row.item.name, SGR.bold],
        [` — ${row.item.description}`],
        ...(audience.length ? [[` (${audience.join(", ")})`, SGR.dim]] : []),
      ];
  /** @type {Line} */
  const status = blocked[scope].length
    ? [[`BLOCKED ${scope}: ${blocked[scope][0]}`, `${SGR.bold};${SGR.red}`]]
    : source
      ? [
          ["Source: ", SGR.dim],
          [sourceOf(source)],
          ...(typeof source === "object" ? [[" (filtered)", SGR.dim]] : []),
        ]
      : scope === "project" && row.initial.global
        ? [["No project declaration; declared globally.", SGR.dim]]
        : [[`Not declared in ${scope}.`, SGR.dim]];
  return [about, status];
}

/** @param {View} view @param {number} height @returns {Line[]} */
function matrixLines(view, height) {
  const { matrix, index } = view;
  const { context } = matrix.inventory;
  const items = displayItems(view);
  const count = Math.max(1, height - 10);
  const focus = items.findIndex((item) => "index" in item && item.index === index);
  const start = Math.max(0, Math.min(focus - Math.floor(count / 2), items.length - count));
  return [
    [
      ["SuPi installer", SGR.bold],
      ["  [x] declared [+] add [-] remove ( ) locked", SGR.dim],
    ],
    [
      ["Project: ", SGR.dim],
      [context.project],
      ...(context.project === context.home
        ? [[" [HOME WARNING]", `${SGR.bold};${SGR.yellow}`]]
        : []),
    ],
    [["Global:  ", SGR.dim], [context.settingsPaths.global]],
    [
      ...pad([["  Package", SGR.dim]], NAME_WIDTH),
      ...pad([[" Project", SGR.dim]], CELL_WIDTH),
      [" Global", SGR.dim],
    ],
    ...items
      .slice(start, start + count)
      .map((item) =>
        "heading" in item ? [[`  ${item.heading}`, SGR.dim]] : rowLine(view, item.index),
      ),
    statusLine(view),
    ...detailLines(view),
    [["Up/Down: row  Left/Right: scope  Space: toggle", SGR.dim]],
    [["r: Recommended  a: All  c: Clear (focused column)", SGR.dim]],
    [["Enter: review sources and changes  Esc: cancel", SGR.dim]],
  ];
}

/** @param {View} view @param {number} width @param {number} height @returns {Line[]} */
function reviewLines(view, width, height) {
  const operations = getPlan(view.matrix);
  const installs = operations.filter((operation) => operation.action === "install").length;
  const content = formatReview(view.matrix, operations).flatMap(({ text, tone }) =>
    wrapLine(text, width - 1).map((part) => [[part, tone && TONES[tone]]]),
  );
  const count = height - 5;
  view.offset = Math.max(0, Math.min(view.offset, Math.max(0, content.length - count)));
  return [
    [
      ["Review", SGR.bold],
      [" · failed installs do not block removals", SGR.dim],
    ],
    [["A failed move can leave neither declaration. No rollback.", SGR.yellow]],
    [
      [`${operations.length} changes`, SGR.bold],
      [" ("],
      [`${installs} install`, SGR.green],
      [", "],
      [`${operations.length - installs} remove`, SGR.red],
      [")"],
      [
        ` · lines ${view.offset + 1}-${Math.min(content.length, view.offset + count)}/${content.length}`,
        SGR.dim,
      ],
    ],
    ...content.slice(view.offset, view.offset + count),
    [],
    [["y: Apply  e: Edit  Up/Down: scroll  Esc: cancel", SGR.dim]],
  ];
}

/** Render a bounded frame. Review content scrolls separately from the matrix. @param {View} view @param {{width: number, height: number}} size */
export function renderView(view, { width, height }) {
  /** @type {Line[]} */
  let lines;
  if (width < 60 || height < 12)
    lines = [[["Resize terminal to at least 60 columns and 12 rows."]], [["Esc: cancel"]]];
  else if (view.review) lines = reviewLines(view, width, height);
  else lines = matrixLines(view, height);
  return lines
    .slice(0, height)
    .map((line) => renderLine(line, Math.max(1, width - 1), Boolean(view.color)))
    .join("\r\n");
}
