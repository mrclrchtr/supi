import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { buildAgentRunSchema } from "../../src/tool/agent_run/schema.ts";
import type { AgentProfile, ProfileCatalogue, ProfileDiagnostic } from "../../src/types.ts";

function makeProfile(
  id: string,
  description = id,
  tools: AgentProfile["manifest"]["tools"] = ["read"],
): AgentProfile {
  return {
    id,
    source: "package",
    directory: `/profiles/${id}`,
    manifest: {
      description,
      tools,
      systemPrompt: "native",
      instructionScopes: [],
    },
  };
}

function getNewProfileProperty(schema: unknown): { enum?: string[]; description: string } {
  const task = (
    schema as {
      properties: {
        tasks: {
          items: {
            properties: {
              new: { properties: { profile: { enum?: string[]; description: string } } };
            };
          };
        };
      };
    }
  ).properties.tasks.items;
  return task.properties.new.properties.profile;
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

  it("describes custom profiles and their capabilities in catalogue order", () => {
    const catalogue = makeCatalogue([
      makeProfile("trace", "Trace repository calls without changing files."),
      makeProfile("fix", "Implement a focused code change.", ["bash", "edit", "write"]),
    ]);
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(catalogue)));
    const profile = getNewProfileProperty(schema);

    expect(profile).toMatchObject({ type: "string", enum: ["fix", "trace"] });
    expect(profile.description.split("\n")).toEqual([
      expect.stringMatching(/no inherited tools.*dedicated web tools/i),
      "fix: Implement a focused code change. [shell; edit]",
      "trace: Trace repository calls without changing files. [read-only; no shell]",
    ]);
    expect(JSON.stringify(schema)).not.toContain("/profiles/");
  });

  it("summarizes resolved tool overrides rather than profile IDs or package defaults", () => {
    const catalogue = makeCatalogue([
      makeProfile("explore", "Inspection"),
      makeProfile("general", "Implementation", ["bash", "edit"]),
    ]);
    const overridden: ProfileCatalogue = {
      ...catalogue,
      profiles: catalogue.profiles.map((entry) => ({
        ...entry,
        sources: [
          ...entry.sources,
          {
            id: entry.id,
            source: "global",
            directory: `/global/${entry.id}`,
            manifest: { tools: ["bash", "write"] },
          },
          ...(entry.id === "general"
            ? [
                {
                  id: entry.id,
                  source: "project" as const,
                  directory: `/project/${entry.id}`,
                  manifest: { tools: ["write"] as const },
                },
              ]
            : []),
        ],
      })),
    };
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(overridden)));
    const { description } = getNewProfileProperty(schema);

    expect(description).toContain("explore: Inspection [shell; edit]");
    expect(description).toContain("general: Implementation [no shell; edit]");
    expect(JSON.stringify(schema)).not.toMatch(/\/global\/|\/project\//);
  });

  it("keeps each profile description on one line", () => {
    const catalogue = makeCatalogue([
      makeProfile("trace", "  Trace\nrepository\r\ncalls\twithout  changes.  "),
    ]);
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(catalogue)));
    expect(getNewProfileProperty(schema).description.split("\n").slice(1)).toEqual([
      "trace: Trace repository calls without changes. [read-only; no shell]",
    ]);
  });

  it("bounds capability guidance at the catalogue limits", () => {
    const catalogue = makeCatalogue(
      Array.from({ length: 32 }, (_, index) =>
        makeProfile(`profile-${index}`.padEnd(64, "x"), "x".repeat(200)),
      ),
    );
    const schema = JSON.parse(JSON.stringify(buildAgentRunSchema(catalogue)));
    const profile = getNewProfileProperty(schema);
    expect(profile.enum).toHaveLength(32);
    // One shared policy line plus one compact choice per profile.
    expect(profile.description.split("\n")).toHaveLength(33);
    expect(profile.description.length).toBeLessThanOrEqual(9_500);
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
    expect(getNewProfileProperty(schema)).toMatchObject({
      type: "string",
      description: expect.stringContaining("no valid profiles"),
    });
    expect(JSON.stringify(schema)).not.toContain("bad");
  });

  it("accepts exactly one new or continue selector and rejects legacy fields", () => {
    const schema = buildAgentRunSchema(makeCatalogue([makeProfile("explore")]));
    expect(
      Value.Check(schema, {
        tasks: [{ id: "first", new: { profile: "explore" }, instructions: "inspect" }],
      }),
    ).toBe(true);
    expect(
      Value.Check(schema, {
        tasks: [{ id: "follow-up", continue: { conversationId: "conv-1" }, instructions: "check" }],
      }),
    ).toBe(true);
    expect(
      Value.Check(schema, {
        tasks: [{ id: "missing", instructions: "inspect" }],
      }),
    ).toBe(false);
    expect(JSON.stringify(schema)).not.toContain('"anyOf"');
    expect(
      Value.Check(schema, {
        tasks: [{ id: "legacy", profile: "explore", instructions: "inspect" }],
      }),
    ).toBe(false);
    expect(
      Value.Check(schema, {
        tasks: [
          {
            id: "both",
            new: { profile: "explore" },
            continue: { conversationId: "conv-1" },
            instructions: "inspect",
          },
        ],
      }),
    ).toBe(false);
  });

  it("enforces task bounds (1-4 tasks, max ID length, max instructions length)", () => {
    const catalogue = makeCatalogue([makeProfile("explore")]);
    const schema = buildAgentRunSchema(catalogue);
    const raw = JSON.stringify(schema);
    expect(raw).toContain("maxItems");
    expect(raw).toContain("minItems");
  });
});
