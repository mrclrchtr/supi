import { catalog } from "./catalog.mjs";
import { skillsHint } from "./skills.mjs";
import { sourceOf } from "./sources.mjs";

/** Successor hints for obsolete declarations removed by these operations. @param {import('./types.ts').Operation[]} operations */
function replacementLines(operations) {
  const names = new Set(
    operations.filter((operation) => operation.action === "remove").map(({ name }) => name),
  );
  return catalog
    .filter((item) => item.replacement && names.has(item.name))
    .map((item) => `  ${item.name}: ${item.replacement}`);
}

/** Keep settings and child output from sending terminal control sequences. @param {string} text */
export function cleanLine(text) {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, " ");
}

/** Read-only declarations, not a claim about loaded resources. @param {import('./types.ts').Inventory} inventory */
export function formatInventory(inventory) {
  const lines = [
    "Direct package declarations",
    `Project: ${inventory.context.project}`,
    `Global: ${inventory.context.settingsPaths.global}`,
  ];
  if (inventory.context.project === inventory.context.home)
    lines.push("Warning: Project is your home directory.");
  for (const scope of /** @type {const} */ (["project", "global"]))
    lines.push(...formatScope(inventory, scope));
  return lines.map(cleanLine);
}

/** @param {import('./types.ts').Inventory} inventory @param {import('./types.ts').Scope} scope */
function formatScope(inventory, scope) {
  const lines = ["", `${scope.toUpperCase()} (${inventory.context.settingsPaths[scope]})`];
  if (inventory.entries[scope].length === 0) lines.push("  No package declarations.");
  for (const entry of inventory.entries[scope])
    lines.push(
      `  ${sourceOf(entry)}${typeof entry === "string" ? "" : ` (filtered/object entry: ${JSON.stringify(entry)})`}`,
    );
  for (const source of inventory.blocked[scope]) {
    lines.push(
      `  BLOCKED: ${source}`,
      `  Remove this source with PI before changing this scope: pi remove <source>${scope === "project" ? " --local" : ""}`,
    );
  }
  for (const source of inventory.unmanaged[scope]) lines.push(`  Unmanaged; retained: ${source}`);
  return lines;
}

/** Show exact scoped sources and the accepted independent-failure policy. @param {import('./matrix.mjs').Matrix} matrix @param {import('./types.ts').Operation[]} operations */
export function formatReview(matrix, operations) {
  return [
    ...formatInventory(matrix.inventory),
    "",
    "Planned changes:",
    ...operations.map(
      (operation) => `${operation.action.toUpperCase()} ${operation.scope}: ${operation.source}`,
    ),
    ...(operations.length === 0 ? ["No changes. No package commands will run."] : []),
    ...withHeading("Replacements for removed obsolete declarations:", replacementLines(operations)),
    "",
    "Clearing Project can expose a global declaration.",
    "Removal retains user data. Bundled behavior can remain available.",
    "Commands are independent. A failed destination install does NOT prevent source removal.",
    "A failed scope move can leave neither declaration. There is no automatic rollback.",
  ].map(cleanLine);
}

/** Prefix nonempty sections with a blank line and heading. @param {string} heading @param {string[]} lines */
function withHeading(heading, lines) {
  return lines.length === 0 ? [] : ["", heading, ...lines];
}

/** @param {import('./types.ts').ExecutionReport} report */
export function formatReport(report) {
  const lines = [report.ok ? "Changes complete." : "Changes did not complete successfully."];
  for (const { operation, status, output } of report.results) {
    lines.push(
      `${status.toUpperCase()}: ${operation.action} ${operation.scope}: ${operation.source}`,
    );
    if (output.trim())
      lines.push(
        ...output
          .trim()
          .split(/\r?\n/)
          .map((line) => `  ${line}`),
      );
  }
  if (report.cancelled) lines.push("Cancelled. No more commands will start.");
  if (report.error) lines.push(`Error: ${report.error}`);
  if (report.inventory) lines.push("", ...formatInventory(report.inventory));
  else lines.push("Final declarations could not be read. Inspect them with PI before retrying.");
  if (report.results.some((result) => result.status !== "unattempted"))
    lines.push("", "Run /reload or restart PI after package changes.");
  const removed = report.results
    .filter((result) => result.status === "success")
    .map((result) => result.operation);
  lines.push(
    ...withHeading("Replacements for removed obsolete declarations:", replacementLines(removed)),
  );
  if (report.ok) lines.push("", ...skillsHint());
  return lines.map(cleanLine).join("\n");
}
