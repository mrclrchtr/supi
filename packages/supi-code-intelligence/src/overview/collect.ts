import { statSync } from "node:fs";
import { loadAutomaticExclusionPatterns } from "@mrclrchtr/supi-core/config";
import { observeWorkspace } from "../analysis/workspace/observe.ts";
import { workspaceOrientationData } from "../session/orientation/workspace-context.ts";
import { prepareWorkspaceOutput } from "../tool/code_orientation/workspace-output.ts";

/** Capture a first-turn map without requiring any project metadata or provider. */
export async function collectOverview(
  cwd: string,
  projectTrusted: boolean,
  homeDir?: string,
  gradleObserver?: import("../analysis/gradle/types.ts").GradleObserver,
) {
  try {
    if (!statSync(cwd).isDirectory()) return null;
  } catch {
    return null;
  }
  const exclude = loadAutomaticExclusionPatterns(cwd, { projectTrusted, homeDir });
  const control = { deadline: Date.now() + 10_000 };
  let observation = await observeWorkspace(cwd, {
    exclude,
    control,
  });
  const gradle = await gradleObserver?.observe(cwd, control);
  if (gradle) observation = { ...observation, gradle };
  return prepareWorkspaceOutput(
    workspaceOrientationData({ observation, cwd, focus: null, maxResults: 10, overview: true }),
  );
}
