// Package-root re-export surface.
// Re-exports the full API surface from api.ts so that both the package root
// and the "/api" subpath resolve to the same exports.
//
//   import { createPiMock } from "@mrclrchtr/supi-test-utils";
//   import { createPiMock } from "@mrclrchtr/supi-test-utils/api";

export type { ToolDef } from "./api.ts";
export { createPiMock, getHandler, getHandlerOrThrow, getTool, getTools, makeCtx } from "./api.ts";
