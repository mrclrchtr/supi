/**
 * Static Maven `pom.xml` reader.
 *
 * Reads only literal project identity (`artifactId`), description, and explicit
 * aggregation (`modules` / `subprojects`). It never runs Maven, resolves parents,
 * interpolates properties, or activates profiles. Parent inheritance is not
 * module membership.
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { DocumentContribution, ParsedDocument, WorkspaceConfig } from "./metadata-types.ts";
import { baseProject, isRecord, issue } from "./metadata-utils.ts";
import type { MetadataIssue } from "./types.ts";

const SUPPORTED_MODEL_VERSIONS = new Set(["4.0.0", "4.1.0"]);
const NAMESPACE_PREFIX = "http://maven.apache.org/POM/";
const TEXT = "#text";
const CDATA = "#cdata";
const XMLNS = "@_xmlns";

const parser = new XMLParser({
  // Custom DOCTYPE entities are never expanded; predefined entities are decoded below.
  processEntities: false,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  textNodeName: TEXT,
  // Keep CDATA separate so its literal text is never entity-decoded.
  cdataPropName: CDATA,
  isArray: (_name, _path, _leaf, isAttribute) => !isAttribute,
});

/** Parse POM text into the shared parsed-document payload, or throw a readable error. */
export function parsePom(text: string): unknown {
  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    const { msg, line } = validation.err;
    throw new Error(`Invalid XML at line ${line}: ${msg}`);
  }
  return parser.parse(text);
}

/** Read one parsed `pom.xml` without resolving inherited or build-time behavior. */
export function readMavenDocument(document: ParsedDocument): DocumentContribution {
  const issues: MetadataIssue[] = [];
  const project = rootProject(document, issues);
  if (!project) return { project: null, workspace: null, issues };
  const modelVersion = readModelVersion(document.path, project, issues);
  if (modelVersion === null) return { project: null, workspace: null, issues };
  const name = readText(document.path, project, "artifactId", issues);
  if (name === null && !issues.some((entry) => entry.field === "project.artifactId")) {
    issues.push(
      issue(document.path, "project.artifactId", "malformed", "POM declares no artifactId."),
    );
  }
  const description = readText(document.path, project, "description", issues);
  discloseProfileModules(document.path, project, issues);
  return {
    project: baseProject({
      manifestPath: document.path,
      kind: "maven-project",
      directory: document.directory,
      name,
      nameField: name === null ? null : "project.artifactId",
      description,
      descriptionField: description === null ? null : "project.description",
    }),
    workspace: readAggregation(document, project, modelVersion, issues),
    issues,
  };
}

function rootProject(
  document: ParsedDocument,
  issues: MetadataIssue[],
): Record<string, unknown> | null {
  const data = document.data;
  const roots = isRecord(data) ? Object.keys(data) : [];
  const project = isRecord(data) && Array.isArray(data.project) ? data.project : null;
  if (roots.length !== 1 || project?.length !== 1 || !isRecord(project[0])) {
    issues.push(
      issue(document.path, null, "malformed", "pom.xml must have one <project> root element."),
    );
    return null;
  }
  return project[0];
}

function readModelVersion(
  path: string,
  project: Record<string, unknown>,
  issues: MetadataIssue[],
): string | null {
  const declared = readText(path, project, "modelVersion", issues);
  const namespace = typeof project[XMLNS] === "string" ? project[XMLNS] : null;
  const fromNamespace = namespace?.startsWith(NAMESPACE_PREFIX)
    ? namespace.slice(NAMESPACE_PREFIX.length)
    : null;
  const version = declared ?? fromNamespace;
  if (version !== null && SUPPORTED_MODEL_VERSIONS.has(version)) return version;
  issues.push(
    issue(
      path,
      "project.modelVersion",
      "unsupported",
      version === null
        ? "POM model version is not declared; only 4.0.0 and 4.1.0 are read."
        : `Unsupported POM model version \`${version}\`; only 4.0.0 and 4.1.0 are read.`,
    ),
  );
  return null;
}

function readAggregation(
  document: ParsedDocument,
  project: Record<string, unknown>,
  modelVersion: string,
  issues: MetadataIssue[],
): WorkspaceConfig | null {
  const hasModules = Object.hasOwn(project, "modules");
  const hasSubprojects = Object.hasOwn(project, "subprojects");
  if (hasSubprojects && modelVersion === "4.0.0") {
    issues.push(
      issue(
        document.path,
        "project.subprojects",
        "unsupported",
        "subprojects requires POM model version 4.1.0.",
      ),
    );
  }
  const useSubprojects = hasSubprojects && modelVersion !== "4.0.0";
  if (useSubprojects && hasModules) {
    issues.push(
      issue(
        document.path,
        "project.modules",
        "unsupported",
        "modules is not combined with subprojects; only subprojects is read.",
      ),
    );
  }
  const [container, child] = useSubprojects
    ? ["subprojects", "subproject"]
    : hasModules
      ? ["modules", "module"]
      : [null, null];
  if (container === null || child === null) return null;
  const field = `project.${container}.${child}`;
  const values = readList(document.path, project[container], { container, child }, issues);
  if (values === null) return null;
  return {
    kind: "maven-modules",
    manifestPath: document.path,
    directory: document.directory,
    field,
    patterns: values,
    excludeField: null,
    excludes: [],
  };
}

function readList(
  path: string,
  nodes: unknown,
  { container, child }: { container: string; child: string },
  issues: MetadataIssue[],
): string[] | null {
  const field = `project.${container}`;
  if (!Array.isArray(nodes) || nodes.length !== 1) {
    issues.push(issue(path, field, "malformed", `${field} must appear once.`));
    return null;
  }
  const node = nodes[0];
  // An empty container element parses as an empty string.
  if (node === "") return [];
  if (!isRecord(node)) {
    issues.push(issue(path, field, "malformed", `${field} must contain <${child}> elements.`));
    return null;
  }
  const values: string[] = [];
  const entries = Array.isArray(node[child]) ? node[child] : [];
  for (const [index, entry] of entries.entries()) {
    const value = elementText(entry);
    if (value === null || value === "") {
      issues.push(
        issue(
          path,
          `${field}.${child}[${index}]`,
          "malformed",
          `${child} must be a non-empty path.`,
        ),
      );
      continue;
    }
    values.push(value);
  }
  return values;
}

function discloseProfileModules(
  path: string,
  project: Record<string, unknown>,
  issues: MetadataIssue[],
): void {
  const profiles = Array.isArray(project.profiles) ? project.profiles[0] : null;
  const entries = isRecord(profiles) && Array.isArray(profiles.profile) ? profiles.profile : [];
  for (const [index, profile] of entries.entries()) {
    if (!isRecord(profile)) continue;
    for (const container of ["modules", "subprojects"]) {
      if (!Object.hasOwn(profile, container)) continue;
      issues.push(
        issue(
          path,
          `project.profiles.profile[${index}].${container}`,
          "unsupported",
          "Profile-scoped aggregation is not read; profile activation is not evaluated.",
        ),
      );
    }
  }
}

/** Read one optional single text element, disclosing unsupported shapes. */
function readText(
  path: string,
  project: Record<string, unknown>,
  key: string,
  issues: MetadataIssue[],
): string | null {
  if (!Object.hasOwn(project, key)) return null;
  const field = `project.${key}`;
  const nodes = project[key];
  if (!Array.isArray(nodes) || nodes.length !== 1) {
    issues.push(issue(path, field, "malformed", `${field} must appear once.`));
    return null;
  }
  const value = elementText(nodes[0]);
  if (value === null) {
    issues.push(
      issue(
        path,
        field,
        "unsupported",
        `${field} must be plain text without nested elements or custom entities.`,
      ),
    );
    return null;
  }
  if (value === "") return null;
  if (value.includes("${")) {
    issues.push(
      issue(path, field, "dynamic", `${field} uses property interpolation; it is not resolved.`),
    );
    return null;
  }
  return value;
}

/**
 * Read one element's text. Plain text is entity-decoded; a single CDATA section
 * is literal. Nested elements and text mixed with CDATA are unsupported (null).
 */
function elementText(node: unknown): string | null {
  if (typeof node === "string") return decodeText(node);
  if (!isRecord(node)) return null;
  const keys = Object.keys(node).filter((key) => !key.startsWith("@_"));
  if (keys.length === 0) return "";
  if (keys.length !== 1) return null;
  const value = node[keys[0] ?? ""];
  if (keys[0] === TEXT && typeof value === "string") return decodeText(value);
  if (keys[0] === CDATA && Array.isArray(value) && value.length === 1) {
    return typeof value[0] === "string" ? value[0] : null;
  }
  return null;
}

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decode predefined and numeric character references; custom entities return null. */
function decodeText(value: string): string | null {
  let unsupported = false;
  const decoded = value.replaceAll(
    /&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z_][\w.-]*);/g,
    (_match, ref) => {
      if (ref.startsWith("#x")) return safeCodePoint(Number.parseInt(ref.slice(2), 16));
      if (ref.startsWith("#")) return safeCodePoint(Number.parseInt(ref.slice(1), 10));
      const entity = PREDEFINED_ENTITIES[ref];
      if (entity === undefined) unsupported = true;
      return entity ?? "";
    },
  );
  return unsupported ? null : decoded;

  function safeCodePoint(code: number): string {
    if (code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    unsupported = true;
    return "";
  }
}
