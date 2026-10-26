import type { GradleObservation } from "../../analysis/gradle/types.ts";
import type { OrientationSectionData } from "../../session/orientation-types.ts";
import { code, tableSection } from "./workspace-format.ts";

/** Project identities and runtime provenance stay separate from parsed Project declarations. */
export function gradleSections(
  observation: GradleObservation | undefined,
  limit: number,
): OrientationSectionData[] {
  if (!observation) return [];
  const attempted = observation.status === "complete" || observation.stage === "query";
  const uncertain = observation.status !== "complete" && observation.stage === "unknown";
  let queryStatement = "Model query was not run";
  if (attempted) queryStatement = "Model query was attempted";
  if (uncertain) queryStatement = "Model query execution is unknown";
  const detail = `Selected build ${observation.selectedRoot}; requested model ${observation.query}; ${queryStatement}${observation.gradleVersion ? `; Gradle ${observation.gradleVersion}` : ""}${observation.runtime ? `; ${observation.runtime.kind} from ${observation.runtime.source}` : ""}`;
  const source = attempted || uncertain ? "runtime" : "configuration";
  const capability = uncertain ? "Gradle collection" : observation.query;
  const provenance = [{ source, capability, detail }] as const;
  const common: OrientationSectionData = {
    key: "gradle.observation",
    title: "Gradle model observation",
    status: observation.status === "complete" ? "complete" : "unavailable",
    reason:
      observation.status === "complete" ? null : `${observation.status}: ${observation.reason}`,
    confidence: "unavailable",
    provenance,
    evidenceLists: [],
    items: [
      {
        kind: "paragraph",
        text: `Selected build: ${code(observation.selectedRoot)}. Requested model: ${code(observation.query)}. ${observation.gradleVersion ? `Gradle ${code(observation.gradleVersion)}. ` : ""}${observation.status === "complete" ? "Runtime-reported facts, not parsed Project declarations. Included-build trees are not expanded. Directories do not establish source ownership, dependency resolution, or runtime architecture." : `${queryStatement}. This does not establish that the build has no projects.`}`,
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
