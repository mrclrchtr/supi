import type { GradleObservation } from "../../analysis/gradle/types.ts";
import type { OrientationSectionData } from "../../session/orientation-types.ts";
import { code, plain, tableSection } from "./workspace-format.ts";

/** Project identities and runtime provenance stay separate from parsed Project declarations. */
export function gradleSections(
  observation: GradleObservation | undefined,
  limit: number,
): OrientationSectionData[] {
  if (!observation) return [];
  const detail = `Selected build ${observation.selectedRoot}; model query ${observation.query}${observation.status === "complete" ? `; Gradle ${observation.gradleVersion}` : ""}${observation.runtime ? `; ${observation.runtime.kind} from ${observation.runtime.source}` : ""}`;
  const provenance = [{ source: "runtime" as const, capability: observation.query, detail }];
  const common: OrientationSectionData = {
    key: "gradle.observation",
    title: "Gradle model observation",
    status: observation.status === "complete" ? "complete" : "unavailable",
    reason: observation.status === "complete" ? null : observation.reason,
    confidence: "unavailable",
    provenance,
    evidenceLists: [],
    items: [
      {
        kind: "paragraph",
        text: `Selected build: ${code(observation.selectedRoot)}. Model query: ${code(observation.query)}. ${observation.status === "complete" ? `Gradle ${code(observation.gradleVersion)}. Runtime-reported facts, not parsed Project declarations. Included-build trees are not expanded. Directories do not establish source ownership, dependency resolution, or runtime architecture.` : `${observation.status}: ${plain(observation.reason)} This does not establish that the build has no projects.`}`,
      },
    ],
  };
  if (observation.status !== "complete") return [common];
  const projects = tableSection("gradle.projects", "Gradle-reported projects", {
    headers: [
      "Build identity (root directory)",
      "Logical project path",
      "Name",
      "Parent path",
      "Actual project directory",
    ],
    rows: observation.projects.map((project) => [
      code(project.buildRoot),
      code(project.path),
      code(project.name),
      project.parentPath === null ? "—" : code(project.parentPath),
      code(project.directory),
    ]),
    limit,
    source: "runtime",
    detail,
  });
  const included = tableSection(
    "gradle.included-builds",
    "Gradle included-build references (not expanded)",
    {
      headers: ["Build identity (root directory)"],
      rows: observation.includedBuilds.map((build) => [code(build.buildRoot)]),
      limit,
      source: "runtime",
      detail,
    },
  );
  return [common, { ...projects, provenance }, { ...included, provenance }];
}
