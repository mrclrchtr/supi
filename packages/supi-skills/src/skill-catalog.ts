import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ExtensionCommandContext,
  type ExtensionContext,
  loadSkills,
  type ResolvedResource,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { SettingsScope } from "@mrclrchtr/supi-core/settings";

export interface SkillSource {
  skill: Skill;
  resource?: ResolvedResource;
  runtime: boolean;
}

export interface SkillRecord {
  name: string;
  description: string;
  sources: SkillSource[];
  activeSkill?: Skill;
}

export type SkillCatalog = Map<string, SkillRecord>;

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function skillSourceIdentity(skill: Skill): string {
  return [
    canonicalPath(skill.filePath),
    skill.sourceInfo.source,
    skill.sourceInfo.scope,
    skill.sourceInfo.origin,
  ].join("\0");
}

function hasStaticProvenance(skill: Skill, source: SkillSource): boolean {
  const resource = source.resource;
  if (!resource) return false;
  const scope = resource.metadata.scope === "project" ? "project" : "user";
  return (
    skill.sourceInfo.source === resource.metadata.source &&
    skill.sourceInfo.scope === scope &&
    skill.sourceInfo.origin === resource.metadata.origin
  );
}

function addSource(catalog: SkillCatalog, source: SkillSource): void {
  const current = catalog.get(source.skill.name);
  if (current) {
    current.sources.push(source);
    return;
  }
  catalog.set(source.skill.name, {
    name: source.skill.name,
    description: source.skill.description,
    sources: [source],
  });
}

/** Load every resolved resource, including resources that PI currently filters out. */
export function buildSkillCatalog(
  resources: ResolvedResource[],
  cwd: string,
  agentDir: string,
): SkillCatalog {
  const catalog: SkillCatalog = new Map();
  for (const resource of resources) {
    const result = loadSkills({
      cwd,
      agentDir,
      skillPaths: [resource.path],
      includeDefaults: false,
    });
    for (const skill of result.skills) {
      addSource(catalog, { skill, resource, runtime: false });
    }
  }
  return catalog;
}

function cloneCatalog(catalog: SkillCatalog): SkillCatalog {
  return new Map(
    Array.from(catalog, ([name, record]) => [
      name,
      { ...record, sources: record.sources.map((source) => ({ ...source })) },
    ]),
  );
}

function contextSkills(ctx?: ExtensionContext): Skill[] {
  const commandCtx = ctx as Partial<ExtensionCommandContext> | undefined;
  return commandCtx?.getSystemPromptOptions?.().skills ?? [];
}

/**
 * Reconcile PI's active winner with resolved static sources.
 *
 * A pending identity suppresses only the stale pre-reload static winner. A
 * different public provenance remains a runtime source and prevents full disable.
 */
function mergeRuntimeSkill(
  catalog: SkillCatalog,
  skill: Skill,
  pendingDisabled: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  const record = catalog.get(skill.name);
  if (!record) {
    addSource(catalog, { skill, runtime: true });
    const added = catalog.get(skill.name);
    if (added) added.activeSkill = skill;
    return;
  }
  if (pendingDisabled.get(skill.name)?.has(skillSourceIdentity(skill))) return;
  const path = canonicalPath(skill.filePath);
  const staticSource = record.sources.find(
    (source) => source.resource && canonicalPath(source.skill.filePath) === path,
  );
  if (staticSource && hasStaticProvenance(skill, staticSource)) {
    if (staticSource.resource?.enabled) record.activeSkill = skill;
    else {
      record.activeSkill = skill;
      record.sources.push({ skill, runtime: true });
    }
    return;
  }
  // ponytail: PI exposes only winning runtime skills; use an aggregate resource API if PI adds one.
  record.activeSkill = skill;
  record.sources.push({ skill, runtime: true });
}

/** Merge skills that runtime resource events added outside PI's configurable catalog. */
export function mergeRuntimeSkills(
  base: SkillCatalog,
  ctx: ExtensionContext | undefined,
  scope: SettingsScope,
  pendingDisabled: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): SkillCatalog {
  const catalog = cloneCatalog(base);
  for (const skill of contextSkills(ctx)) {
    if (scope !== "global" || skill.sourceInfo.scope !== "project") {
      mergeRuntimeSkill(catalog, skill, pendingDisabled);
    }
  }
  return catalog;
}
