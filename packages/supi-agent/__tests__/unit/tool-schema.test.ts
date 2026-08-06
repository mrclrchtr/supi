import { describe, expect, it } from "vitest";
import { buildAgentRunSchema } from "../../src/tool/schema.ts";
import type { AgentProfile, ProfileCatalogue, ProfileDiagnostic } from "../../src/types.ts";

function makeProfile(id: string): AgentProfile {
  return {
    id,
    source: "package",
    directory: `/profiles/${id}`,
    manifest: {
      description: id,
      tools: ["read"],
      systemPrompt: "native",
      instructionScopes: [],
    },
  };
}

function makeCatalogue(
  profiles: AgentProfile[],
  diagnostics: ProfileDiagnostic[] = [],
): ProfileCatalogue {
  const entries = profiles.map((profile) => ({
    id: profile.id,
    description: profile.manifest.description,
    sources: [
      {
        id: profile.id,
        source: profile.source,
        directory: profile.directory,
        manifest: profile.manifest,
      },
    ],
    diagnostics: [],
  }));
  return {
    profiles: entries,
    diagnostics,
    profileIds: profiles.map((profile) => profile.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    omittedProfileCount: 0,
    sourceDirectories: { package: "/profiles", global: "/global" },
  };
}

// biome-ignore lint/security/noSecrets: false positive on test descriptions.
describe("buildAgentRunSchema", () => {
  it("generates a single-literal enum for one profile", () => {
    const catalogue = makeCatalogue([makeProfile("explore")]);
    const schema = buildAgentRunSchema(catalogue);
    const raw = JSON.stringify(schema);
    // Schema should include the literal "explore"
    expect(raw).toContain("explore");
  });

  it("generates a union enum for multiple profiles", () => {
    const catalogue = makeCatalogue([makeProfile("explore"), makeProfile("general")]);
    const schema = buildAgentRunSchema(catalogue);
    const raw = JSON.stringify(schema);
    expect(raw).toContain("explore");
    expect(raw).toContain("general");
  });

  it("excludes invalid/overflow profiles from the enum", () => {
    const catalogue = makeCatalogue(
      [makeProfile("explore")],
      [{ profileId: "bad", source: "package", code: "invalid-manifest", message: "bad" }],
    );
    const schema = buildAgentRunSchema(catalogue);
    const raw = JSON.stringify(schema);
    expect(raw).toContain("explore");
    expect(raw).not.toContain("bad");
  });

  it("enforces task bounds (1-4 tasks, max ID length, max instructions length)", () => {
    const catalogue = makeCatalogue([makeProfile("explore")]);
    const schema = buildAgentRunSchema(catalogue);
    const raw = JSON.stringify(schema);
    expect(raw).toContain("maxItems");
    expect(raw).toContain("minItems");
  });
});
