/**
 * Map analysis service — typed data generation for factual code maps.
 *
 * Delegates to the existing code_map orchestration.
 */

import { executeMapTool } from "../../tool/execute-map.ts";
import type { MapDetails } from "../../types.ts";

export interface MapServiceInput {
  path?: string;
  cwd: string;
  maxResults?: number;
}

export interface MapServiceResult {
  content: string;
  details: MapDetails;
}

/**
 * Create a factual code map from the given input.
 */
export async function createAnalysisMapService(input: MapServiceInput): Promise<MapServiceResult> {
  const result = await executeMapTool({ path: input.path }, { cwd: input.cwd });
  return {
    content: result.content,
    details: (result.details?.type === "map"
      ? result.details.data
      : {
          scope: input.path ?? null,
          totalFiles: 0,
          childDirectoryCount: 0,
          landmarkCount: 0,
          nextQueries: [],
        }) as MapDetails,
  };
}
