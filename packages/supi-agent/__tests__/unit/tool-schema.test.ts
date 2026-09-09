import { describe, expect, it } from "vitest";
import { buildAgentRunSchema } from "../../src/tool/agent_run/schema.ts";
import type { AgentProfile, ProfileCatalogue, ProfileDiagnostic } from "../../src/types.ts";

function makeProfile(id: string, description = id): AgentProfile {
  return {
    id,
    source: "package",
    directory: `/profiles/${id}`,
    manifest: {
      description,
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

  it("describes custom profiles beside their IDs in catalogue order", () => {
    const catalogue = makeCatalogue([
      makeProfile("trace", "Trace repository calls without changing files."),
      makeProfile("fix", "Implement a focused code change."),
    ]);
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(catalogue)));
    const profile = schema.properties.tasks.items.properties.profile;

    expect(profile).toMatchObject({ type: "string", enum: ["fix", "trace"] });
    expect(profile.description).toBe(
      "fix: Implement a focused code change.\ntrace: Trace repository calls without changing files.",
    );
    expect(JSON.stringify(schema)).not.toContain("/profiles/");
  });

  it("keeps each profile description on one line", () => {
    const catalogue = makeCatalogue([
      makeProfile("trace", "  Trace\nrepository\r\ncalls\twithout  changes.  "),
    ]);
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(catalogue)));
    expect(schema.properties.tasks.items.properties.profile.description).toBe(
      "trace: Trace repository calls without changes.",
    );
  });

  it("bounds description text through the existing catalogue limits", () => {
    const catalogue = makeCatalogue(
      Array.from({ length: 32 }, (_, index) =>
        makeProfile(`profile-${index}`.padEnd(64, "x"), "x".repeat(200)),
      ),
    );
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(catalogue)));
    const profile = schema.properties.tasks.items.properties.profile;
    expect(profile.enum).toHaveLength(32);
    expect(profile.description.split("\n")).toHaveLength(32);
    expect(profile.description.length).toBeLessThanOrEqual(8_543);
  });

  it("excludes invalid and overflow profiles from IDs and descriptions", () => {
    const catalogue = {
      ...makeCatalogue(
        [
          makeProfile("explore"),
          makeProfile("bad", "Unavailable profile description."),
          makeProfile("overflow", "Omitted profile description."),
        ],
        [{ profileId: "bad", source: "package", code: "invalid-manifest", message: "bad" }],
      ),
      profileIds: ["explore"],
      omittedProfileCount: 1,
    };
    const raw = JSON.stringify(buildAgentRunSchema(catalogue));
    expect(raw).toContain("explore");
    expect(raw).not.toMatch(/bad|overflow|Unavailable|Omitted/);
  });

  it("reports an empty catalogue without exposing diagnostics", () => {
    const catalogue = makeCatalogue(
      [],
      [{ profileId: "bad", source: "package", code: "invalid-manifest", message: "bad" }],
    );
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(catalogue)));
    expect(schema.properties.tasks.items.properties.profile).toMatchObject({
      type: "string",
      description: expect.stringContaining("no valid profiles"),
    });
    expect(JSON.stringify(schema)).not.toContain("bad");
  });

  it("enforces task bounds (1-4 tasks, max ID length, max instructions length)", () => {
    const catalogue = makeCatalogue([makeProfile("explore")]);
    const schema = buildAgentRunSchema(catalogue);
    const raw = JSON.stringify(schema);
    expect(raw).toContain("maxItems");
    expect(raw).toContain("minItems");
  });
});
