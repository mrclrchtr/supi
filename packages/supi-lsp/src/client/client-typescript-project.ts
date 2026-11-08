/**
 * Whether tsserver placed an open file in a configured project.
 *
 * - `configured`: a `tsconfig.json` / `jsconfig.json` program owns the file.
 * - `inferred`: tsserver created an inferred project for the file alone, so
 *   project-wide requests such as `workspace/symbol` do not cover the
 *   configured program.
 * - `unknown`: the route is not TypeScript or tsserver could not answer.
 */
export type ProjectMembership = "configured" | "inferred" | "unknown";

/** Build `workspace/executeCommand` params for tsserver `projectInfo`. */
export function typeScriptProjectInfoParams(uri: string): unknown {
  return {
    command: "typescript.tsserverRequest",
    arguments: [
      "projectInfo",
      { file: uri, needFileNameList: false },
      // Semantic execution target; the project must be loaded to answer.
      { executionTarget: 0, expectsResult: true, isAsync: false },
    ],
  };
}

/**
 * Read project membership from a tsserver `projectInfo` response.
 * tsserver names projects without a config file `/dev/null/<kind>Project<N>*`.
 */
export function readTypeScriptProjectMembership(response: unknown): ProjectMembership {
  if (!isRecord(response) || response.type !== "response" || response.success !== true) {
    return "unknown";
  }
  const body = response.body;
  if (!isRecord(body) || typeof body.configFileName !== "string") return "unknown";
  return body.configFileName.startsWith("/dev/null/") ? "inferred" : "configured";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
