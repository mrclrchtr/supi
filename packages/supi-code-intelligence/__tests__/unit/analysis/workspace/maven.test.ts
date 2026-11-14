// biome-ignore-all lint/security/noSecrets: POM XML fixtures, not secrets
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Maven property syntax is the fixture under test
import { afterEach, describe, expect, it } from "vitest";
import { observeWorkspace } from "../../../../src/analysis/workspace/index.ts";
import { cleanupWorkspaces, makeWorkspace, write, writeJson } from "./helpers.ts";

afterEach(cleanupWorkspaces);

const NS = 'xmlns="http://maven.apache.org/POM/4.0.0"';

function pom(body: string, open = `<project ${NS}>\n  <modelVersion>4.0.0</modelVersion>`): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${open}\n${body}\n</project>\n`;
}

function byPath(result: Awaited<ReturnType<typeof observeWorkspace>>, manifestPath: string) {
  return result.projects.find((project) => project.manifestPath === manifestPath);
}

describe("observeWorkspace Maven declarations", () => {
  it("reads a single POM's artifactId and description without coordinates or membership", async () => {
    const root = makeWorkspace();
    write(
      root,
      "pom.xml",
      pom(
        [
          "  <groupId>com.example</groupId>",
          "  <artifactId>billing&amp;core</artifactId>",
          "  <version>1.0.0</version>",
          "  <name>Billing display name</name>",
          "  <description><![CDATA[Billing <core> service.]]></description>",
        ].join("\n"),
      ),
    );

    const result = await observeWorkspace(root);

    expect(result.collection.status).toBe("complete");
    expect(result.projects).toEqual([
      {
        id: "pom.xml",
        manifestPath: "pom.xml",
        kind: "maven-project",
        directory: ".",
        name: "billing&core",
        nameField: "project.artifactId",
        description: "Billing <core> service.",
        descriptionField: "project.description",
        memberships: [],
        declaredPaths: [],
        dependencies: [],
      },
    ]);
    expect(result.workspaces).toEqual([]);
  });

  it("keeps aggregation separate from parent inheritance", async () => {
    const root = makeWorkspace();
    write(
      root,
      "pom.xml",
      pom(
        [
          "  <artifactId>aggregator</artifactId>",
          "  <packaging>pom</packaging>",
          "  <modules>",
          "    <module>services/api</module>",
          "    <module>./libs/util/pom.xml</module>",
          "  </modules>",
        ].join("\n"),
      ),
    );
    // Aggregated module whose parent is a different POM.
    write(
      root,
      "services/api/pom.xml",
      pom(
        [
          "  <parent><groupId>g</groupId><artifactId>parent</artifactId><version>1</version>",
          "    <relativePath>../../parent/pom.xml</relativePath></parent>",
          "  <artifactId>api</artifactId>",
        ].join("\n"),
      ),
    );
    write(root, "libs/util/pom.xml", pom("  <artifactId>util</artifactId>"));
    write(root, "parent/pom.xml", pom("  <artifactId>parent</artifactId>"));
    // Inherits from the aggregator but is not listed as a module.
    write(
      root,
      "tools/inherit-only/pom.xml",
      pom(
        [
          "  <parent><groupId>g</groupId><artifactId>aggregator</artifactId><version>1</version>",
          "    <relativePath>../../pom.xml</relativePath></parent>",
          "  <artifactId>inherit-only</artifactId>",
        ].join("\n"),
      ),
    );

    const result = await observeWorkspace(root);

    expect(result.collection.status).toBe("complete");
    expect(result.workspaces).toEqual([
      {
        kind: "maven-modules",
        manifestPath: "pom.xml",
        directory: ".",
        field: "project.modules.module",
        patterns: ["services/api", "./libs/util/pom.xml"],
        excludeField: null,
        excludes: [],
      },
    ]);
    expect(byPath(result, "services/api/pom.xml")?.memberships).toEqual([
      {
        kind: "maven-modules",
        manifestPath: "pom.xml",
        field: "project.modules.module",
        value: "services/api",
      },
    ]);
    expect(byPath(result, "libs/util/pom.xml")?.memberships).toEqual([
      {
        kind: "maven-modules",
        manifestPath: "pom.xml",
        field: "project.modules.module",
        value: "./libs/util/pom.xml",
      },
    ]);
    expect(byPath(result, "pom.xml")?.memberships).toEqual([]);
    expect(byPath(result, "parent/pom.xml")?.memberships).toEqual([]);
    expect(byPath(result, "tools/inherit-only/pom.xml")?.memberships).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it("reads Maven 4.1.0 subprojects with sibling-relative paths", async () => {
    const root = makeWorkspace();
    write(
      root,
      "build/pom.xml",
      pom(
        [
          "  <artifactId>build</artifactId>",
          "  <subprojects><subproject>../app</subproject></subprojects>",
        ].join("\n"),
        '<project xmlns="http://maven.apache.org/POM/4.1.0">\n  <modelVersion>4.1.0</modelVersion>',
      ),
    );
    write(
      root,
      "app/pom.xml",
      pom("  <artifactId>app</artifactId>", '<project xmlns="http://maven.apache.org/POM/4.1.0">'),
    );

    const result = await observeWorkspace(root);

    expect(result.metadata.issues).toEqual([]);
    expect(byPath(result, "app/pom.xml")).toMatchObject({
      name: "app",
      memberships: [
        {
          kind: "maven-modules",
          manifestPath: "build/pom.xml",
          field: "project.subprojects.subproject",
          value: "../app",
        },
      ],
    });
  });

  it("discloses dynamic, profile, out-of-root, and unmatched modules while keeping usable facts", async () => {
    const root = makeWorkspace();
    write(
      root,
      "pom.xml",
      pom(
        [
          "  <artifactId>${project.name}</artifactId>",
          "  <description>Root &custom; text</description>",
          "  <modules>",
          "    <module>core</module>",
          "    <module>${extra.module}</module>",
          "    <module>../outside</module>",
          "    <module>missing</module>",
          "    <module></module>",
          "  </modules>",
          "  <profiles><profile><id>it</id><modules><module>it</module></modules></profile></profiles>",
        ].join("\n"),
      ),
    );
    write(root, "core/pom.xml", pom("  <artifactId>core</artifactId>"));
    write(root, "it/pom.xml", pom("  <artifactId>it</artifactId>"));

    const result = await observeWorkspace(root);

    expect(result.collection.status).toBe("partial");
    expect(byPath(result, "pom.xml")).toMatchObject({
      name: null,
      nameField: null,
      description: null,
    });
    expect(byPath(result, "core/pom.xml")?.memberships).toHaveLength(1);
    expect(byPath(result, "it/pom.xml")?.memberships).toEqual([]);
    expect(result.metadata.issues.map(({ field, kind }) => ({ field, kind }))).toEqual(
      expect.arrayContaining([
        { field: "project.artifactId", kind: "dynamic" },
        { field: "project.description", kind: "unsupported" },
        { field: "project.modules.module[4]", kind: "malformed" },
        { field: "project.profiles.profile[0].modules", kind: "unsupported" },
        { field: "project.modules.module", kind: "dynamic" },
        { field: "project.modules.module", kind: "unresolved" },
      ]),
    );
    const reasons = result.metadata.issues.map((entry) => entry.reason).join("\n");
    expect(reasons).toContain("`../outside` points outside the observation root");
    expect(reasons).toContain("`missing` has no observed pom.xml project");
  });

  it("normalizes equivalent module spellings and discloses unsupported path forms", async () => {
    const root = makeWorkspace();
    write(
      root,
      "pom.xml",
      pom(
        [
          "  <artifactId>agg</artifactId>",
          "  <modules>",
          "    <module>core</module>",
          "    <module>core/</module>",
          "    <module>.\\core\\pom.xml</module>",
          "    <module>.</module>",
          "    <module>/abs/core</module>",
          "    <module>core/build.xml</module>",
          "  </modules>",
          "  <subprojects><subproject>ignored</subproject></subprojects>",
        ].join("\n"),
      ),
    );
    write(root, "core/pom.xml", pom("  <artifactId>core</artifactId>"));

    const result = await observeWorkspace(root);

    expect(byPath(result, "core/pom.xml")?.memberships).toEqual([
      expect.objectContaining({ kind: "maven-modules", value: "core" }),
    ]);
    expect(byPath(result, "pom.xml")?.memberships).toEqual([]);
    expect(result.metadata.issues.map(({ field, reason }) => [field, reason])).toEqual([
      ["project.subprojects", "subprojects requires POM model version 4.1.0."],
      ["project.modules.module", "Module path `.` refers to the aggregator itself."],
      ["project.modules.module", "Absolute module path `/abs/core` is not read."],
      ["project.modules.module", "Module path `core/build.xml` names a non-pom.xml file."],
    ]);
  });

  it("keeps CDATA literal and discloses an empty artifactId", async () => {
    const root = makeWorkspace();
    write(
      root,
      "pom.xml",
      pom("  <artifactId/>\n  <description><![CDATA[a &amp; b &custom;]]></description>"),
    );

    const result = await observeWorkspace(root);

    expect(byPath(result, "pom.xml")).toMatchObject({
      name: null,
      description: "a &amp; b &custom;",
    });
    expect(result.metadata.issues).toEqual([
      expect.objectContaining({ field: "project.artifactId", kind: "malformed" }),
    ]);
  });

  it("reports malformed and unsupported POMs without inventing projects", async () => {
    const root = makeWorkspace();
    write(root, "broken/pom.xml", "<project><artifactId>x</project>");
    write(
      root,
      "old/pom.xml",
      "<project><modelVersion>3.0.0</modelVersion><artifactId>old</artifactId></project>",
    );
    write(root, "unversioned/pom.xml", "<project><artifactId>bare</artifactId></project>");
    write(root, "nameless/pom.xml", pom("  <groupId>g</groupId>"));

    const result = await observeWorkspace(root);

    expect(result.projects.map((project) => [project.manifestPath, project.name])).toEqual([
      ["nameless/pom.xml", null],
    ]);
    expect(result.metadata.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "broken/pom.xml", kind: "maven-pom", status: "failed" }),
      ]),
    );
    expect(result.metadata.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "broken/pom.xml", kind: "malformed" }),
        expect.objectContaining({ path: "old/pom.xml", kind: "unsupported" }),
        expect.objectContaining({ path: "unversioned/pom.xml", kind: "unsupported" }),
        expect.objectContaining({
          path: "nameless/pom.xml",
          field: "project.artifactId",
          kind: "malformed",
        }),
      ]),
    );
  });

  it("does not join Maven aggregation with other ecosystems in the same directories", async () => {
    const root = makeWorkspace();
    write(
      root,
      "pom.xml",
      pom("  <artifactId>root</artifactId>\n  <modules><module>web</module></modules>"),
    );
    writeJson(root, "package.json", { name: "root-js", workspaces: ["web"] });
    writeJson(root, "web/package.json", { name: "web-js" });

    const result = await observeWorkspace(root);
    const web = result.projects.find((project) => project.name === "web-js");

    expect(web?.memberships.map((membership) => membership.kind)).toEqual(["node-workspace"]);
    expect(result.metadata.issues).toEqual([
      expect.objectContaining({
        path: "pom.xml",
        kind: "unresolved",
        reason: "Maven module path `web` has no observed pom.xml project.",
      }),
    ]);
  });
});
