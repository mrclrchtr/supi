/**
 * Central planner for code-intelligence tool routing.
 *
 * Reads capability state from the shared workspace broker and returns
 * routing decisions for each tool intent. Keeps the execution strategy
 * explicit and centralized instead of scattering capability checks
 * across per-tool execute files.
 *
 * This is the canonical planner — src/planner/planner.ts becomes a
 * thin forwarder to here.
 */

import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeIntelligenceToolName, PlannerRoute } from "../../intent/types.ts";

interface RouteAvailability {
  semanticAvailable: boolean;
  structuralAvailable: boolean;
  refactorAvailable: boolean;
}

function readAvailability(cwd: string): RouteAvailability {
  const runtime = getDefaultWorkspaceRuntime();
  const workspace = runtime.getWorkspace(cwd);
  return {
    semanticAvailable:
      workspace.semantic.state.kind === "ready" && workspace.semantic.provider !== null,
    structuralAvailable:
      workspace.structural.state.kind === "ready" && workspace.structural.provider !== null,
    refactorAvailable: workspace.semantic.refactorAvailable,
  };
}

function withPreferred(
  availability: RouteAvailability,
  preferred: PlannerRoute["preferred"],
): PlannerRoute {
  return { ...availability, preferred };
}

function semanticOnly(availability: RouteAvailability): PlannerRoute["preferred"] {
  return availability.semanticAvailable ? "semantic" : "unavailable";
}

function briefPreferred(availability: RouteAvailability): PlannerRoute["preferred"] {
  if (availability.semanticAvailable) return "semantic";
  if (availability.structuralAvailable) return "structural";
  return "unavailable";
}

/**
 * Get the routing decision for a tool intent in a workspace.
 */
export function routeFor(cwd: string, tool: CodeIntelligenceToolName): PlannerRoute {
  const availability = readAvailability(cwd);

  if (tool === "code_graph") {
    // code_graph dispatches per-relation at execution time. Return the best
    // available preference; the executor handles per-relation unavailability.
    if (availability.semanticAvailable) return withPreferred(availability, "semantic");
    if (availability.structuralAvailable) return withPreferred(availability, "structural");
    return withPreferred(availability, "unavailable");
  }

  if (tool === "code_context") {
    return withPreferred(availability, briefPreferred(availability));
  }

  if (tool === "code_impact" || tool === "code_affected") {
    return withPreferred(availability, semanticOnly(availability));
  }

  if (tool === "code_refactor_plan") {
    return withPreferred(availability, availability.refactorAvailable ? "semantic" : "unavailable");
  }

  if (tool === "code_refactor_apply") {
    // Plan application does not require a live semantic provider — validity
    // is enforced through fingerprint comparison in the executor.
    // Return semantic-preferred so the route check never blocks valid plans.
    return withPreferred(availability, "semantic");
  }

  if (tool === "code_health") {
    // code_health reads diagnostics and server state from the LSP service
    // directly; it does not require live semantic/structural providers.
    return withPreferred(availability, "search");
  }

  return withPreferred(availability, briefPreferred(availability));
}
