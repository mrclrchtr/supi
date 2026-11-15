/**
 * Static `CMakeLists.txt` reader for explicit `project()` declarations.
 *
 * A project is reported only for exactly one top-level `project()` call with
 * a literal name. Repeated, conditional, function/macro-body, and
 * variable-dependent calls are disclosed instead of guessed. Targets,
 * `add_subdirectory()`, included files, presets, and configured build trees
 * are not observed, and CMake is never run.
 */

import type { CMakeArgument, CMakeCommand } from "./cmake-parser.ts";
import { parseCMakeFile } from "./cmake-parser.ts";
import type { DocumentContribution, ParsedDocument } from "./metadata-types.ts";
import { baseProject, issue } from "./metadata-utils.ts";
import type { MetadataIssue } from "./types.ts";

const DYNAMIC_REFERENCE = /\$(?:\{|ENV\{|CACHE\{|<)/;

/** Read one `CMakeLists.txt` document. */
export function readCMakeDocument(document: ParsedDocument): DocumentContribution {
  if (document.kind !== "cmake-lists") return { project: null, workspace: null, issues: [] };
  if (typeof document.data !== "string") {
    return {
      project: null,
      workspace: null,
      issues: [issue(document.path, null, "malformed", "CMakeLists.txt must be text.")],
    };
  }
  const parsed = parseCMakeFile(document.data);
  if (parsed.issue) {
    return {
      project: null,
      workspace: null,
      issues: [issue(document.path, `line ${parsed.issue.line}`, "malformed", parsed.issue.reason)],
    };
  }
  const calls = parsed.commands.filter((command) => command.name === "project");
  if (calls.length === 0) return { project: null, workspace: null, issues: [] };
  const issues: MetadataIssue[] = [];
  const nested = calls.filter((call) => call.depth > 0);
  for (const call of nested) {
    issues.push(
      issue(
        document.path,
        `project line ${call.line}`,
        "dynamic",
        "project() inside a control block, function, macro, or block() depends on evaluation.",
      ),
    );
  }
  if (calls.length > 1) {
    issues.push(
      issue(
        document.path,
        "project",
        "unresolved",
        `Multiple project() calls (lines ${calls.map((call) => call.line).join(", ")}); none is selected.`,
      ),
    );
  }
  const call = calls[0];
  if (calls.length !== 1 || nested.length > 0 || !call) {
    return { project: null, workspace: null, issues };
  }
  return readProjectCall(document, call, issues);
}

function readProjectCall(
  document: ParsedDocument,
  call: CMakeCommand,
  issues: MetadataIssue[],
): DocumentContribution {
  const field = `project line ${call.line}`;
  const nameArgument = call.args[0];
  const name = nameArgument ? literalValue(nameArgument) : null;
  if (!nameArgument || name === null) {
    issues.push(
      issue(
        document.path,
        field,
        nameArgument && DYNAMIC_REFERENCE.test(nameArgument.text) ? "dynamic" : "unsupported",
        nameArgument
          ? "project() name is not a single literal value."
          : "project() declares no name.",
      ),
    );
    return { project: null, workspace: null, issues };
  }
  const description = readDescription(document.path, call, issues);
  return {
    project: baseProject({
      manifestPath: document.path,
      kind: "cmake-project",
      directory: document.directory,
      name,
      nameField: "project",
      description,
      descriptionField: description === null ? null : "project.DESCRIPTION",
    }),
    workspace: null,
    issues,
  };
}

function readDescription(path: string, call: CMakeCommand, issues: MetadataIssue[]): string | null {
  const keyword = call.args.findIndex(
    (argument, index) =>
      index > 0 && argument.form === "unquoted" && argument.text === "DESCRIPTION",
  );
  if (keyword < 0) return null;
  const argument = call.args[keyword + 1];
  const value = argument ? literalValue(argument) : null;
  if (value === null) {
    issues.push(
      issue(
        path,
        "project.DESCRIPTION",
        argument && DYNAMIC_REFERENCE.test(argument.text) ? "dynamic" : "unsupported",
        "project() DESCRIPTION is not a single-line literal value.",
      ),
    );
    return null;
  }
  return value;
}

/**
 * Return a literal argument value, or null when evaluation would be required.
 *
 * Multi-line values are rejected. Bracket arguments are otherwise literal. Quoted and unquoted arguments are
 * literal only without variable or generator-expression references, escapes,
 * or list separators.
 */
function literalValue(argument: CMakeArgument): string | null {
  if (argument.form === "paren") return null;
  const text = argument.text;
  if (text.length === 0 || /[\r\n]/.test(text)) return null;
  if (argument.form === "bracket") return text;
  if (DYNAMIC_REFERENCE.test(text) || text.includes("\\") || text.includes(";")) return null;
  return text;
}
