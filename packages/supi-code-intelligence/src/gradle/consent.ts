import { isAbsolute, join, relative, sep } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
} from "@earendil-works/pi-coding-agent";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import {
  loadSupiConfigSectionForScope,
  removeSupiConfigKey,
  writeSupiConfig,
} from "@mrclrchtr/supi-core/config";
import { registerSettings } from "@mrclrchtr/supi-core/settings";
import { queryGradleModel } from "../analysis/gradle/query.ts";
import {
  GradlePrerequisiteError,
  hasGradleSettings,
  selectGradleRuntime,
} from "../analysis/gradle/runtime.ts";
import type {
  GradleFailureStage,
  GradleModelQuery,
  GradleObservation,
  GradleObserver,
} from "../analysis/gradle/types.ts";

const section = "code-intelligence";
const key = "gradleObservation";
const explanation =
  "Gradle model collection executes settings and plugins; it may download distributions or dependencies, write caches, and access files or services outside the reporting root. Reporting bounds are not a sandbox.";

function permission(cwd: string): "allow" | "deny" | undefined {
  const value = loadSupiConfigSectionForScope(section, cwd, { scope: "project" })?.[key];
  return value === "allow" || value === "deny" ? value : undefined;
}

function collectionFailure(
  root: string,
  stage: GradleFailureStage,
  error: unknown,
): GradleObservation {
  return {
    selectedRoot: root,
    query: "GradleBuild/BasicGradleProject",
    stage,
    status:
      error instanceof GradlePrerequisiteError
        ? error.status
        : stage === "query" || stage === "unknown"
          ? "failed"
          : "unavailable",
    reason: error instanceof Error ? error.message.slice(0, 500) : "Gradle collection failed.",
  };
}

/** Owned, live-authorized Gradle requests for one Pi session working directory. */
class SessionGradleObserver implements GradleObserver {
  readonly active = new Set<AbortController>();
  constructor(
    readonly cwd: string,
    readonly trusted: (root: string) => boolean,
    readonly query: GradleModelQuery,
  ) {}
  cancel(): void {
    for (const controller of this.active) controller.abort();
  }
  async observe(
    root: string,
    control?: CodeRequestControl,
  ): Promise<GradleObservation | undefined> {
    const base = { selectedRoot: root, query: "GradleBuild/BasicGradleProject" as const };
    let stage: GradleFailureStage = "prerequisites";
    try {
      if (!(await hasGradleSettings(root))) return undefined;
      stage = "authorization";
      if (!this.trusted(root))
        return {
          ...base,
          status: "blocked",
          stage: "authorization",
          reason:
            "Gradle execution requires an actual Pi project-trust gate. Use /trust and reload; a bare SuPi config is insufficient.",
        };
      const decision = permission(this.cwd);
      if (decision !== "allow")
        return {
          ...base,
          status: "blocked",
          stage: "authorization",
          reason:
            decision === "deny"
              ? "Gradle model collection was denied in project settings."
              : "Gradle model permission is unset; no execution occurred.",
        };
      return await this.collect(root, control);
    } catch (error) {
      return collectionFailure(root, stage, error);
    }
  }

  private async collect(root: string, control?: CodeRequestControl): Promise<GradleObservation> {
    const base = { selectedRoot: root, query: "GradleBuild/BasicGradleProject" as const };
    const controller = new AbortController();
    this.active.add(controller);
    let stage: GradleFailureStage = "prerequisites";
    try {
      const signal = control?.signal
        ? AbortSignal.any([control.signal, controller.signal])
        : controller.signal;
      if (signal.aborted)
        return {
          ...base,
          status: "interrupted",
          stage,
          reason: "Gradle model collection was cancelled.",
        };
      if (control?.deadline !== undefined && Date.now() >= control.deadline)
        return {
          ...base,
          status: "timeout",
          stage,
          reason: "Gradle observation deadline expired before runtime selection.",
        };
      const runtime = await selectGradleRuntime(root);
      if (!this.trusted(root) || permission(this.cwd) !== "allow" || signal.aborted)
        return {
          ...base,
          status: "interrupted",
          stage: "authorization",
          reason: "Gradle authorization was revoked; no new query was started.",
        };
      stage = "unknown";
      const result = await this.query(root, runtime, { ...control, signal });
      if (signal.aborted || !this.trusted(root) || permission(this.cwd) !== "allow")
        return {
          ...base,
          runtime,
          status: "interrupted",
          stage: result.status === "complete" ? "query" : result.stage,
          gradleVersion: result.gradleVersion,
          reason:
            "Gradle authorization changed or collection was cancelled; prior side effects may remain.",
        };
      return { ...result, runtime };
    } catch (error) {
      return collectionFailure(root, stage, error);
    } finally {
      this.active.delete(controller);
    }
  }
}

/**
 * Register project-only consent, startup prompting, and owned-request cancellation.
 * Pi's effective trust boolean alone is insufficient in a directory containing only
 * .pi/supi/config.json: Pi implicitly trusts directories without protected resources.
 * Snapshot the protected-resource gate at session_start, or require Pi's user-owned
 * saved trust decision. Explicit external focuses require their own saved trust.
 */
export function registerGradleObservations(
  pi: ExtensionAPI,
  options: {
    homeDir?: string;
    query?: GradleModelQuery;
    interactive?: boolean;
  } = {},
): {
  forContext(ctx: ExtensionContext): GradleObserver;
} {
  const { homeDir, query = queryGradleModel, interactive = true } = options;
  const sessions = new Map<string, SessionGradleObserver>();
  const contexts = new Map<string, ExtensionContext>();
  const gatedRoots = new Set<string>();
  const trustStore = new ProjectTrustStore(homeDir ? join(homeDir, ".pi/agent") : getAgentDir());
  const savedTrust = (root: string) => {
    try {
      return trustStore.get(root) === true;
    } catch {
      return false;
    }
  };
  const forContext = (ctx: ExtensionContext): SessionGradleObserver => {
    contexts.set(ctx.cwd, ctx);
    let observer = sessions.get(ctx.cwd);
    if (!observer) {
      observer = new SessionGradleObserver(
        ctx.cwd,
        (root) => {
          if (!contexts.get(ctx.cwd)?.isProjectTrusted()) return false;
          const local = relative(ctx.cwd, root);
          const inside =
            local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
          return inside ? gatedRoots.has(ctx.cwd) || savedTrust(ctx.cwd) : savedTrust(root);
        },
        query,
      );
      sessions.set(ctx.cwd, observer);
    }
    return observer;
  };
  if (interactive)
    registerSettings(pi, {
      id: "code-intelligence-gradle",
      label: "Code Intelligence",
      subsection: "Gradle observations",
      async read(context) {
        if (context.scope !== "project") return { rows: [] };
        const value = permission(context.cwd);
        return {
          rows: [
            {
              field: {
                kind: "enum",
                key,
                label: "Gradle Model Permission",
                values: ["allow", "deny"],
                description: `${explanation} Project only. Reset asks at the next eligible startup. Changes affect the next query; Deny cancels owned work where possible, not side effects or unrelated daemons.`,
              },
              displayValue: value ? (value === "allow" ? "Allow" : "Deny") : "Unset",
              editValue: value ?? "",
              source: value ? "project" : "default",
              inheritanceSource: "default",
            },
          ],
        };
      },
      async apply(request) {
        if (request.scope !== "project" || request.fieldKey !== key)
          throw new Error("Gradle consent is project-only.");
        if (request.action.kind === "unset")
          removeSupiConfigKey({ section, cwd: request.cwd, scope: "project" }, key);
        else {
          if (!["allow", "deny"].includes(request.action.value))
            throw new Error("Expected Allow or Deny.");
          writeSupiConfig(
            { section, cwd: request.cwd, scope: "project" },
            { [key]: request.action.value },
          );
        }
        if (permission(request.cwd) !== "allow") sessions.get(request.cwd)?.cancel();
        return {
          notice: {
            level: "info",
            message:
              "Gradle permission saved. Applies to the next query; cancellation cannot undo side effects or stop unrelated daemons.",
          },
        };
      },
    });
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.isProjectTrusted() && hasTrustRequiringProjectResources(ctx.cwd))
      gatedRoots.add(ctx.cwd);
    const observer = forContext(ctx);
    if (
      !interactive ||
      !ctx.hasUI ||
      !observer.trusted(ctx.cwd) ||
      permission(ctx.cwd) !== undefined ||
      !(await hasGradleSettings(ctx.cwd).catch(() => false))
    )
      return;
    const answer = await ctx.ui.select(`Allow Gradle model collection? ${explanation}`, [
      "Allow",
      "Deny",
      "Cancel",
    ]);
    if (answer === "Allow" || answer === "Deny")
      writeSupiConfig({ section, cwd: ctx.cwd, scope: "project" }, { [key]: answer.toLowerCase() });
  });
  pi.on("session_shutdown", () => {
    for (const observer of sessions.values()) observer.cancel();
    sessions.clear();
    contexts.clear();
    gatedRoots.clear();
  });
  return { forContext };
}
