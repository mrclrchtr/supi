// Package-root re-export surface.
// Re-exports the full API surface from api.ts so that both the package root
// and the "/api" subpath resolve to the same exports.
//
//   import { createPiMock } from "@mrclrchtr/supi-test-utils";
//   import { createPiMock } from "@mrclrchtr/supi-test-utils/api";

export type { MarkedTheme, ToolDef } from "./api.ts";
export {
  createMarkedTheme,
  createPiMock,
  getHandler,
  getHandlerOrThrow,
  getTool,
  getTools,
  makeCtx,
} from "./api.ts";
