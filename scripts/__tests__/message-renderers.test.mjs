// Displayed custom messages need a registered message renderer. Without one, Pi shows the raw
// `[customType]` header and the model-facing `content`, which may carry IDs and instructions
// meant for the model (see docs/conventions/tool-rendering.md § Custom messages).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../..", import.meta.url).pathname;
const PACKAGES = join(ROOT, "packages");

/**
 * Displayed custom message types that intentionally use Pi's fallback rendering.
 * Each entry needs a reason; prefer adding a renderer.
 */
const FALLBACK_ALLOWED = new Map([]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter(
      (entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts"),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

function propertyName(property) {
  return ts.isPropertyAssignment(property) &&
    (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text
    : undefined;
}

function stringConstant(node) {
  return ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    ts.isStringLiteralLike(node.initializer)
    ? [node.name.text, node.initializer.text]
    : undefined;
}

/** The `customType` expression of a `{ customType, display: true }` object literal. */
function displayedType(node) {
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  const props = new Map(node.properties.map((property) => [propertyName(property), property]));
  const display = props.get("display");
  return display?.initializer.kind === ts.SyntaxKind.TrueKeyword
    ? props.get("customType")?.initializer
    : undefined;
}

/** The type argument of a `*.registerMessageRenderer(type, …)` call. */
function renderedType(node) {
  return ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "registerMessageRenderer"
    ? node.arguments[0]
    : undefined;
}

/** Collect string constants, displayed message types, and renderer registrations for one package. */
function scanPackage(directory) {
  const constants = new Map();
  const displayed = [];
  const rendered = [];
  for (const file of sourceFiles(directory)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      const constant = stringConstant(node);
      if (constant) constants.set(...constant);
      const shown = displayedType(node);
      if (shown) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        displayed.push({ expression: shown, at: `${relative(ROOT, file)}:${line}` });
      }
      const registered = renderedType(node);
      if (registered) rendered.push(registered);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const resolve = (expression) => {
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isIdentifier(expression)) return constants.get(expression.text);
    return undefined;
  };
  return {
    displayed: displayed.map(({ expression, at }) => ({ type: resolve(expression), at })),
    rendered: new Set(rendered.map(resolve)),
  };
}

const packageSources = readdirSync(PACKAGES)
  .map((pkg) => join(PACKAGES, pkg, "src"))
  .filter((directory) => existsSync(directory));

describe("displayed custom messages", () => {
  it("have a message renderer in the same package or a documented fallback exception", () => {
    const scans = packageSources.map(scanPackage);
    const shown = scans.flatMap(({ displayed, rendered }) =>
      displayed.map((message) => ({ ...message, rendered: rendered.has(message.type) })),
    );
    // Message types must be string literals or same-package string constants to stay checkable.
    expect(shown.filter(({ type }) => !type).map(({ at }) => at)).toEqual([]);
    expect(
      shown
        .filter(({ type, rendered }) => type && !rendered && !FALLBACK_ALLOWED.has(type))
        .map(({ type, at }) => `${type} (${at})`),
    ).toEqual([]);
  });
});
