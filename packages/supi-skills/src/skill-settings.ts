import {
  DefaultPackageManager,
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
  type ResolvedResource,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  registerSettings,
  type ScopedFieldValue,
  type SettingsAction,
  type SettingsApplyResult,
  type SettingsContext,
  type SettingsModule,
  type SettingsScope,
  type ValueSource,
} from "@mrclrchtr/supi-core/settings";
import {
  buildSkillCatalog,
  mergeRuntimeSkills,
  type SkillCatalog,
  type SkillRecord,
  skillSourceIdentity,
} from "./skill-catalog.ts";
import {
  hasExactSkillLoadOverride,
  type SkillLoadOverride,
  updateSkillLoadOverrides,
} from "./skill-load-settings.ts";
import {
  applyPromptOverrides,
  DISABLED,
  ENABLED,
  MODEL_DISABLED,
  persistInvocation,
  resolveInvocation,
} from "./skill-model-invocation.ts";

const SETTINGS_SECTION_ID = "skills";

interface SkillSettingsOptions {
  agentDir?: string;
  homeDir?: string;
}

interface SkillSettingsControllerOptions {
  cwd: string;
  agentDir: string;
  homeDir?: string;
  projectTrusted: boolean;
  settingsManager: SettingsManager;
  globalSettingsManager: SettingsManager;
}

function recordResources(record: SkillRecord): ResolvedResource[] {
  return record.sources.flatMap((source) => (source.resource ? [source.resource] : []));
}

function isLoaded(record: SkillRecord): boolean {
  return (
    record.activeSkill !== undefined ||
    record.sources.some((source) => source.runtime || source.resource?.enabled)
  );
}

function canDisable(record: SkillRecord): boolean {
  return record.sources.length > 0 && record.sources.every((source) => !source.runtime);
}

function sourceDefault(record: SkillRecord): boolean {
  const winner =
    record.activeSkill ??
    record.sources.find((source) => source.runtime || source.resource?.enabled)?.skill ??
    record.sources[0]?.skill;
  return winner?.disableModelInvocation ?? false;
}

function moreSpecificSource(left: ValueSource, right: ValueSource): ValueSource {
  const rank: Record<ValueSource, number> = { default: 0, global: 1, project: 2 };
  return rank[left] >= rank[right] ? left : right;
}

function displayValue(value: string, source: ValueSource): string {
  return `${value} (${source})`;
}

function validateAction(record: SkillRecord, action: SettingsAction): void {
  if (action.kind !== "set") return;
  if (![ENABLED, MODEL_DISABLED, DISABLED].includes(action.value)) {
    throw new Error(`Invalid skill state: "${action.value}"`);
  }
  if (action.value === DISABLED && !canDisable(record)) {
    throw new Error(`Full disable is unavailable for skill "${record.name}"`);
  }
}

function loadOverride(
  record: SkillRecord,
  action: SettingsAction,
  hasExactOverride: boolean,
): SkillLoadOverride | undefined {
  if (action.kind === "unset") return hasExactOverride ? "inherit" : undefined;
  if (action.value === DISABLED) return "unload";
  return isLoaded(record) ? undefined : "load";
}

class SkillSettingsController {
  private readonly cwd: string;
  private readonly agentDir: string;
  private readonly homeDir: string | undefined;
  private readonly projectTrusted: boolean;
  private readonly settingsManager: SettingsManager;
  private readonly globalSettingsManager: SettingsManager;
  private readonly pendingDisabled = new Map<string, Set<string>>();
  private globalCatalog: SkillCatalog = new Map();
  private projectCatalog: SkillCatalog = new Map();

  private constructor(options: SkillSettingsControllerOptions) {
    this.cwd = options.cwd;
    this.agentDir = options.agentDir;
    this.homeDir = options.homeDir;
    this.projectTrusted = options.projectTrusted;
    this.settingsManager = options.settingsManager;
    this.globalSettingsManager = options.globalSettingsManager;
  }

  static async create(
    cwd: string,
    projectTrusted: boolean,
    options: SkillSettingsOptions,
  ): Promise<SkillSettingsController> {
    const agentDir = options.agentDir ?? getAgentDir();
    const controller = new SkillSettingsController({
      cwd,
      agentDir,
      homeDir: options.homeDir,
      projectTrusted,
      settingsManager: SettingsManager.create(cwd, agentDir, { projectTrusted }),
      globalSettingsManager: SettingsManager.create(cwd, agentDir, { projectTrusted: false }),
    });
    await controller.refreshCatalogs();
    return controller;
  }

  private async refreshCatalogs(): Promise<void> {
    await Promise.all([this.settingsManager.reload(), this.globalSettingsManager.reload()]);
    const [globalPaths, projectPaths] = await Promise.all([
      new DefaultPackageManager({
        cwd: this.cwd,
        agentDir: this.agentDir,
        settingsManager: this.globalSettingsManager,
      }).resolve(async () => "skip"),
      new DefaultPackageManager({
        cwd: this.cwd,
        agentDir: this.agentDir,
        settingsManager: this.settingsManager,
      }).resolve(async () => "skip"),
    ]);
    this.globalCatalog = buildSkillCatalog(globalPaths.skills, this.cwd, this.agentDir);
    this.projectCatalog = buildSkillCatalog(projectPaths.skills, this.cwd, this.agentDir);
  }

  private records(scope: SettingsScope, ctx?: ExtensionContext): SkillCatalog {
    return mergeRuntimeSkills(
      scope === "project" ? this.projectCatalog : this.globalCatalog,
      ctx,
      scope,
      this.pendingDisabled,
    );
  }

  /**
   * Prefer original global provenance when a project support path resolves the
   * same file as a project resource. This lets Unset remove both the exact
   * override and the generated support path after a catalog refresh.
   */
  private actionResources(record: SkillRecord, scope: SettingsScope): ResolvedResource[] {
    const globalResources =
      scope === "project" ? recordResources(this.globalCatalog.get(record.name) ?? record) : [];
    const unique = new Map<string, ResolvedResource>();
    for (const resource of [...globalResources, ...recordResources(record)]) {
      const key = `${resource.path}\0${resource.metadata.origin}\0${resource.metadata.source}`;
      if (!unique.has(key)) unique.set(key, resource);
    }
    return Array.from(unique.values());
  }

  /**
   * Attribute the effective load value to the narrowest scoped override.
   * Project resources can be support-path surrogates, so attribution compares
   * their effective load state with the original global catalog.
   */
  private loadSource(record: SkillRecord, scope: SettingsScope): ValueSource {
    const resources = recordResources(record);
    const exact = hasExactSkillLoadOverride({
      settingsManager: this.settingsManager,
      resources,
      scope,
      cwd: this.cwd,
      agentDir: this.agentDir,
    });
    if (exact) return scope;
    if (scope === "global") {
      return resources.some((resource) => !resource.enabled) ? "global" : "default";
    }
    if (resources.some((resource) => resource.metadata.scope === "project" && !resource.enabled)) {
      return "project";
    }
    const globalRecord = this.globalCatalog.get(record.name);
    if (!globalRecord) return "default";
    const globalResources = recordResources(globalRecord);
    const projectLoaded = resources.some((resource) => resource.enabled);
    const globalLoaded = globalResources.some((resource) => resource.enabled);
    if (projectLoaded !== globalLoaded) return "project";
    return this.loadSource(globalRecord, "global");
  }

  private rowSource(
    record: SkillRecord,
    scope: SettingsScope,
    invocationSource: ValueSource,
  ): ValueSource {
    return moreSpecificSource(this.loadSource(record, scope), invocationSource);
  }

  private row(record: SkillRecord, scope: SettingsScope): ScopedFieldValue {
    const invocation = resolveInvocation({
      name: record.name,
      sourceDefault: sourceDefault(record),
      scope,
      cwd: this.cwd,
      projectTrusted: this.projectTrusted,
      homeDir: this.homeDir,
    });
    const value = !isLoaded(record) ? DISABLED : invocation.disabled ? MODEL_DISABLED : ENABLED;
    const source = this.rowSource(record, scope, invocation.source);
    const values = canDisable(record)
      ? [ENABLED, MODEL_DISABLED, DISABLED]
      : [ENABLED, MODEL_DISABLED];
    const sourceCount = record.sources.length;
    const limitation = canDisable(record)
      ? ""
      : " Full disable is unavailable because PI does not expose a load setting for one or more sources.";
    return {
      field: {
        kind: "enum",
        key: record.name,
        label: record.name,
        values,
        description: `${record.description}${sourceCount > 1 ? ` ${sourceCount} sources.` : ""}${limitation}`,
      },
      displayValue: displayValue(value, source),
      editValue: value,
      source,
      ...(scope === "project" && source === "project"
        ? {
            inheritanceSource:
              this.globalRowSource(record.name) === "global" ? "global" : "default",
          }
        : {}),
    };
  }

  private globalRowSource(name: string): ValueSource {
    const record = this.globalCatalog.get(name);
    if (!record) return "default";
    const invocation = resolveInvocation({
      name,
      sourceDefault: sourceDefault(record),
      scope: "global",
      cwd: this.cwd,
      projectTrusted: false,
      homeDir: this.homeDir,
    });
    return this.rowSource(record, "global", invocation.source);
  }

  read(scope: SettingsScope, ctx?: ExtensionContext): ScopedFieldValue[] {
    return Array.from(this.records(scope, ctx).values())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((record) => this.row(record, scope));
  }

  private updatePendingDisabled(
    fieldKey: string,
    nextLoadOverride: SkillLoadOverride,
    activeSkillIdentity: string | undefined,
  ): void {
    if (nextLoadOverride !== "unload") {
      this.pendingDisabled.delete(fieldKey);
      return;
    }
    if (activeSkillIdentity) {
      this.pendingDisabled.set(fieldKey, new Set([activeSkillIdentity]));
    }
  }

  async apply(
    scope: SettingsScope,
    fieldKey: string,
    action: SettingsAction,
    ctx?: ExtensionContext,
  ): Promise<SettingsApplyResult> {
    if (scope === "project" && !this.projectTrusted) {
      throw new Error("Project is not trusted; refusing to write project skill settings");
    }
    const record = this.records(scope, ctx).get(fieldKey);
    if (!record) return {};
    validateAction(record, action);
    const activeSkillIdentity = record.activeSkill
      ? skillSourceIdentity(record.activeSkill)
      : undefined;

    if (action.kind !== "set" || action.value !== DISABLED) {
      persistInvocation({
        name: fieldKey,
        disabled: action.kind === "set" ? action.value === MODEL_DISABLED : undefined,
        scope,
        cwd: this.cwd,
        homeDir: this.homeDir,
      });
    }

    const resources = this.actionResources(record, scope);
    const hasLoadOverride = hasExactSkillLoadOverride({
      settingsManager: this.settingsManager,
      resources,
      scope,
      cwd: this.cwd,
      agentDir: this.agentDir,
    });
    const nextLoadOverride = loadOverride(record, action, hasLoadOverride);
    if (nextLoadOverride && resources.length > 0) {
      updateSkillLoadOverrides({
        settingsManager: this.settingsManager,
        resources,
        scope,
        state: nextLoadOverride,
        cwd: this.cwd,
        agentDir: this.agentDir,
      });
      await this.settingsManager.flush();
      const error = this.settingsManager.drainErrors()[0];
      await this.refreshCatalogs();
      if (error) throw error.error;
      this.updatePendingDisabled(fieldKey, nextLoadOverride, activeSkillIdentity);
      return {
        notice: { message: "Reload required for skill load changes", level: "info" },
      };
    }
    return {};
  }
}

function createSkillSettingsModule(options: SkillSettingsOptions): SettingsModule {
  let controllerKey: string | undefined;
  let controllerPromise: Promise<SkillSettingsController> | undefined;

  const getController = (context: SettingsContext): Promise<SkillSettingsController> => {
    const projectTrusted = context.ctx?.isProjectTrusted() ?? false;
    const key = `${context.cwd}\0${projectTrusted}`;
    if (!controllerPromise || controllerKey !== key) {
      controllerKey = key;
      controllerPromise = SkillSettingsController.create(context.cwd, projectTrusted, options);
    }
    return controllerPromise;
  };

  return {
    id: SETTINGS_SECTION_ID,
    label: "Skills",
    read: async (context) => ({
      rows: (await getController(context)).read(context.scope, context.ctx),
    }),
    apply: async (request) =>
      (await getController(request)).apply(
        request.scope,
        request.fieldKey,
        request.action,
        request.ctx,
      ),
  };
}

/** Register scoped skill availability settings and prompt overrides. */
export default function skillSettings(pi: ExtensionAPI, options: SkillSettingsOptions = {}): void {
  registerSettings(pi, createSkillSettingsModule(options));

  pi.on("before_agent_start", (event, ctx) => {
    const systemPrompt = applyPromptOverrides({
      options: event.systemPromptOptions,
      systemPrompt: event.systemPrompt,
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
      homeDir: options.homeDir,
    });
    return systemPrompt === undefined ? undefined : { systemPrompt };
  });
}
