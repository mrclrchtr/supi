import { existsSync, lstatSync, statSync } from "node:fs";
import * as path from "node:path";
import { loadAutomaticExclusionPatterns } from "@mrclrchtr/supi-core/config";
import ignore from "ignore";
import { isGitIgnoredDirectory } from "../../analysis/workspace/git.ts";
import { observeWorkspace } from "../../analysis/workspace/observe.ts";
import { assertUnlinkedPath, WorkspaceSymlinkError } from "../../analysis/workspace/safe-path.ts";
import type { WorkspaceObservation } from "../../analysis/workspace/types.ts";
import type {
  OrientationResultData,
  OrientationWorkflowInput,
  OrientationWorkflowOutcome,
} from "../orientation-types.ts";
import type { WorkflowControl } from "../workflow-control.ts";

/** Captured facts for workspace and directory presentation; no provider or live state. */
export interface WorkspaceOrientationFacts {
  readonly observation: WorkspaceObservation;
  readonly cwd: string;
  /** Absolute explicit focus, or null for the session working directory. */
  readonly focus: string | null;
  readonly maxResults: number;
  readonly overview?: boolean;
}

/** Select the new navigation path without changing file or symbol-focused workflows. */
export async function orientWorkspaceContext(
  request: OrientationWorkflowInput,
  options: {
    cwd: string;
    homeDir?: string;
    projectTrusted: boolean;
    gradleObserver?: import("../../analysis/gradle/types.ts").GradleObserver;
  },
  control?: WorkflowControl,
): Promise<
  | { kind: "completed"; data: OrientationResultData; directory: string | null }
  | Extract<OrientationWorkflowOutcome, { kind: "invalid-input" }>
  | null
> {
  try {
    const selected = directoryFocus(request, options.cwd);
    if (!selected) return null;
    let focus = selected.path;
    const exclude = loadAutomaticExclusionPatterns(options.cwd, options);
    if (focus) await assertFocusPath(options.cwd, focus);
    let observation = await initialObservation(options.cwd, focus, exclude, control);
    if (request.focus && "module" in request.focus) {
      const selected = resolveModule(observation, request.focus.module);
      if (selected.kind === "invalid-input") return selected;
      focus = selected.path;
    }
    if (focus) observation = await focusObservation(observation, focus, exclude, control);
    const selectedRoot =
      request.focus && "path" in request.focus ? (focus ?? options.cwd) : options.cwd;
    const gradle = await options.gradleObserver?.observe(selectedRoot, control);
    if (gradle) observation = { ...observation, gradle };
    return {
      kind: "completed",
      directory: focus,
      data: {
        ...workspaceOrientationData({
          observation,
          cwd: options.cwd,
          focus,
          maxResults: request.maxResults ?? 10,
        }),
        focusKind: workspaceFocusKind(request),
      },
    };
  } catch (error) {
    if (!(error instanceof WorkspaceSymlinkError)) throw error;
    return {
      kind: "invalid-input",
      message: error.message,
      symlinkRejection: { requestedPath: error.requestedPath, blockedPath: error.blockedPath },
    };
  }
}

function workspaceFocusKind(
  request: OrientationWorkflowInput,
): "workspace" | "module" | "directory" {
  if (!request.focus) return "workspace";
  return "module" in request.focus ? "module" : "directory";
}

async function initialObservation(
  cwd: string,
  focus: string | null,
  exclude: readonly string[],
  control?: WorkflowControl,
): Promise<WorkspaceObservation> {
  const root = focus && !within(cwd, focus) ? focus : cwd;
  const separate = root !== cwd;
  return observeWorkspace(root, {
    exclude: separate ? [] : exclude,
    control,
    prioritizeDirectory: !separate && focus ? focus : undefined,
    includeIgnored: separate && (await isGitIgnoredDirectory(root, control)),
  });
}

async function focusObservation(
  observation: WorkspaceObservation,
  focus: string,
  exclude: readonly string[],
  control?: WorkflowControl,
): Promise<WorkspaceObservation> {
  const inside = within(observation.root, focus);
  const relative = path.relative(observation.root, focus).replaceAll(path.sep, "/");
  await assertFocusPath(observation.root, focus);
  const excluded =
    inside &&
    relative !== "" &&
    ignore()
      .add([...exclude])
      .ignores(`${relative}/`);
  const ignored = await isGitIgnoredDirectory(focus, control);
  if (!inside || excluded || (ignored && !observation.inclusion.includeIgnored))
    return observeWorkspace(focus, { includeIgnored: excluded || ignored, control });
  return observation;
}

/** Check new path components from the shared ancestor, including external focuses. */
async function assertFocusPath(cwd: string, focus: string): Promise<void> {
  let common = path.resolve(cwd);
  while (!within(common, focus)) {
    const parent = path.dirname(common);
    if (parent === common) {
      common = path.parse(focus).root;
      break;
    }
    common = parent;
  }
  await assertUnlinkedPath(common, path.relative(common, focus).replaceAll(path.sep, "/"), true);
}

function directoryFocus(
  request: OrientationWorkflowInput,
  cwd: string,
): { kind: "directory"; path: string | null } | null {
  if (!request.focus || "module" in request.focus) return { kind: "directory", path: null };
  if ("target" in request.focus) return null;
  const focus = path.resolve(cwd, request.focus.path.replace(/^@/, ""));
  if (!existsSync(focus) || !statSync(focus).isDirectory()) return null;
  if (lstatSync(focus).isSymbolicLink()) throw new WorkspaceSymlinkError(focus, focus);
  return { kind: "directory", path: focus };
}

function resolveModule(
  observation: WorkspaceObservation,
  name: string,
): { kind: "resolved"; path: string } | { kind: "invalid-input"; message: string } {
  const matches = observation.projects.filter(
    (project) =>
      project.name === name ||
      (project.kind === "node-package" && project.name?.replace(/^@[^/]+\//, "") === name),
  );
  if (matches.length === 1)
    return { kind: "resolved", path: path.resolve(observation.root, matches[0].directory) };
  return {
    kind: "invalid-input",
    message:
      matches.length === 0
        ? `Module focus not found: ${name}.`
        : `Module focus is ambiguous: ${matches.map((project) => `${project.name} (${project.manifestPath})`).join(", ")}.`,
  };
}

/** Create the immutable workflow envelope; result assembly owns display selection. */
export function workspaceOrientationData(
  workspace: WorkspaceOrientationFacts,
): OrientationResultData {
  return {
    title: "Workspace Orientation",
    notes: [],
    sections: [],
    confidence: "unavailable",
    focusTarget: workspace.focus,
    requestedSections: [],
    renderedSections: [],
    omittedCount: 0,
    nextQueries: [],
    readNext: [],
    workspace,
  };
}

/** Test containment without treating a common path prefix as ancestry. */
export function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}
