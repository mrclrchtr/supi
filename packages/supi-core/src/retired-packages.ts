// supi-core retired-packages domain — warn when a retired SuPi package is still declared.
//
// Retired packages keep loading after an upgrade until the user removes them, and their
// surfaces can shadow the package that absorbed them. Detection reads the declared Pi
// packages per scope, the same view `pi remove` acts on, and never infers identity from paths.

import type {
  ExtensionAPI,
  ExtensionContext,
  PackageSource,
} from "@earendil-works/pi-coding-agent";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { recordDebugEvent } from "./debug-registry.ts";

/** A retired npm package and the package that now ships its features. */
export interface RetiredPackage {
  /** npm package name, e.g. `"@mrclrchtr/supi-cache"`. */
  name: string;
  /** npm package name that absorbed it, e.g. `"@mrclrchtr/supi-debug"`. */
  replacement: string;
}

/** Pi settings scope of a package declaration. */
export type PackageDeclarationScope = "user" | "project";

/** One declaration of a retired package found in Pi settings. */
export interface RetiredPackageDeclaration {
  package: RetiredPackage;
  scope: PackageDeclarationScope;
  /** Exact command that removes this declaration. */
  removeCommand: string;
}

/** Declared Pi packages per scope. Omit `project` when the project is not trusted. */
export interface DeclaredPackages {
  user: readonly PackageSource[];
  project?: readonly PackageSource[];
}

/** Options for {@link warnRetiredPackages}. */
export interface WarnRetiredPackagesOptions {
  /** Debug event source, e.g. `"supi-debug"`. */
  source: string;
  /** Override Pi's agent directory (tests). */
  agentDir?: string;
}

const WARNED_KEY = Symbol.for("@mrclrchtr/supi-core/retired-packages-warned");
const NPM_PREFIX = "npm:";
const NPM_NAME_RE = /^(@[^/\s]+\/[^@\s]+|[^@\s]+)(?:@.+)?$/;

/** npm package name of a Pi package source, ignoring version pins; `undefined` for non-npm sources. */
export function npmPackageName(source: PackageSource): string | undefined {
  const value = (typeof source === "string" ? source : source.source).trim();
  if (!value.startsWith(NPM_PREFIX)) return undefined;
  return NPM_NAME_RE.exec(value.slice(NPM_PREFIX.length).trim())?.[1];
}

/** Find declarations of retired packages, project scope first (Pi's load precedence). */
export function findRetiredPackageDeclarations(
  declared: DeclaredPackages,
  retired: readonly RetiredPackage[],
): RetiredPackageDeclaration[] {
  const scopes: Array<[PackageDeclarationScope, readonly PackageSource[] | undefined]> = [
    ["project", declared.project],
    ["user", declared.user],
  ];
  const found: RetiredPackageDeclaration[] = [];
  for (const [scope, sources] of scopes) {
    const names = new Set((sources ?? []).map(npmPackageName));
    for (const pkg of retired) {
      if (!names.has(pkg.name)) continue;
      const local = scope === "project" ? " --local" : "";
      found.push({ package: pkg, scope, removeCommand: `pi remove npm:${pkg.name}${local}` });
    }
  }
  return found;
}

/** Format one bounded, actionable warning for one retired package. */
export function formatRetiredPackageWarning(
  pkg: RetiredPackage,
  declarations: readonly RetiredPackageDeclaration[],
): string {
  const commands = declarations.map((declaration) => `  ${declaration.removeCommand}`);
  return [
    `${pkg.name} is retired; ${pkg.replacement} now ships its features, and the old package can override them. Remove it:`,
    ...commands,
  ].join("\n");
}

function warnedNames(): Set<string> {
  const store = globalThis as Record<symbol, Set<string> | undefined>;
  store[WARNED_KEY] ??= new Set();
  return store[WARNED_KEY];
}

function readDeclaredPackages(
  ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted">,
  agentDir: string | undefined,
): DeclaredPackages {
  const projectTrusted = ctx.isProjectTrusted();
  const settings = SettingsManager.create(ctx.cwd, agentDir, { projectTrusted });
  return {
    user: settings.getGlobalSettings().packages ?? [],
    ...(projectTrusted ? { project: settings.getProjectSettings().packages ?? [] } : {}),
  };
}

/**
 * Warn once per Pi process for each retired package that is still declared in user or
 * trusted project settings. Shows a UI warning, or writes to stderr without UI, and records
 * a `retired-package` Debug event. Never throws; unreadable settings skip the check.
 */
export function warnRetiredPackages(
  pi: ExtensionAPI,
  retired: readonly RetiredPackage[],
  options: WarnRetiredPackagesOptions,
): void {
  pi.on("session_start", (_event, ctx) => {
    const warned = warnedNames();
    const pending = retired.filter((pkg) => !warned.has(pkg.name));
    if (pending.length === 0) return;

    let declarations: RetiredPackageDeclaration[];
    try {
      declarations = findRetiredPackageDeclarations(
        readDeclaredPackages(ctx, options.agentDir),
        pending,
      );
    } catch {
      return;
    }

    for (const pkg of pending) {
      const matches = declarations.filter((declaration) => declaration.package === pkg);
      if (matches.length === 0) continue;
      warned.add(pkg.name);
      const message = formatRetiredPackageWarning(pkg, matches);
      if (ctx.hasUI) ctx.ui.notify(message, "warning");
      else process.stderr.write(`${message}\n`);
      recordDebugEvent({
        source: options.source,
        level: "warning",
        category: "retired-package",
        message: `${pkg.name} is retired but still declared`,
        cwd: ctx.cwd,
        data: { name: pkg.name, replacement: pkg.replacement, scopes: matches.map((m) => m.scope) },
      });
    }
  });
}
