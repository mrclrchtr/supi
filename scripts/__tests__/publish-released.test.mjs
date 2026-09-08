import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReleaseFixture } from "./helpers/release-fixture.mjs";

let fixture;
beforeEach(() => {
  fixture = createReleaseFixture();
});
afterEach(() => {
  fixture.cleanup();
});

function expectBlocked(result, fields) {
  expect(result.status, result.stderr).toBe(1);
  for (const field of fields) expect(result.stderr).toContain(field);
  expect(fixture.events()).toEqual([]);
}

describe("release identity validation", () => {
  it.each([
    ["RELEASE_SHA", undefined],
    ["RELEASE_SHA", ""],
    ["RELEASE_SHA", "main"],
    ["RELEASE_SHA", "abcd123"],
    ["RELEASE_SHA", `${"a".repeat(40)}\n`],
    ["RELEASE_VERSION", undefined],
    ["RELEASE_VERSION", ""],
    ["RELEASE_VERSION", "v6.3.1"],
    ["RELEASE_VERSION", "6.3"],
    ["RELEASE_VERSION", "06.3.1"],
    ["RELEASE_VERSION", "6.3.1-01"],
    ["RELEASE_VERSION", "6.3.1 "],
    ["RELEASE_VERSION", "6.3.1\n"],
  ])("rejects invalid %s value %j before npm access", (field, value) => {
    expectBlocked(fixture.run({ [field]: value }), [field, "expected", "actual"]);
  });

  it("rejects another commit even when package versions match", () => {
    const suppliedSha = "a".repeat(40);
    expectBlocked(fixture.run({ RELEASE_SHA: suppliedSha }), ["HEAD", suppliedSha, fixture.sha]);
  });

  it.each([
    ["package.json", { version: "6.3.0" }, "version"],
    ["package.json", { version: undefined }, "version"],
    [".release-please-manifest.json", { ".": "6.3.0" }, '["."]'],
    [".release-please-manifest.json", { ".": undefined }, '["."]'],
    ["packages/a-app/package.json", { version: "6.3.0" }, "version"],
    ["packages/z-core/package.json", { version: "6.3.0" }, "version"],
    ["packages/z-core/package.json", { version: undefined }, "version"],
    ["packages/z-core/package.json", { version: 631 }, "version"],
    ["packages/z-core/package.json", { name: undefined }, "name"],
    ["packages/z-core/package.json", { private: "false" }, "private"],
  ])("rejects invalid %s data before the first npm command", (path, fields, field) => {
    fixture.updateJson(path, fields);
    const result = fixture.run({
      RELEASE_SHA: fixture.commit(),
      TEST_NPM_EXISTING: JSON.stringify([
        "@mrclrchtr/test-app@6.3.1",
        "@mrclrchtr/test-core@6.3.0",
      ]),
    });
    expectBlocked(result, [path, field, "expected", "actual"]);
    if (fields.version === "6.3.0") {
      expect(result.stderr).toContain('expected "6.3.1"; actual "6.3.0"');
    }
  });

  it.each(["package.json", ".release-please-manifest.json", "packages/z-core/package.json"])(
    "rejects unreadable or invalid JSON in %s",
    (path) => {
      writeFileSync(join(fixture.cwd, path), "not JSON");
      expectBlocked(fixture.run(), [path, "expected a readable JSON object"]);
      rmSync(join(fixture.cwd, path));
      expectBlocked(fixture.run(), [path, "expected a readable JSON object"]);
    },
  );

  it.each([null, [], "6.3.1"])("rejects a non-object manifest %j", (value) => {
    fixture.writeJson("packages/z-core/package.json", value);
    expectBlocked(fixture.run(), ["packages/z-core/package.json", "expected a JSON object"]);
  });

  it("does not accept an empty package set as a successful release", () => {
    rmSync(join(fixture.cwd, "packages/a-app"), { recursive: true });
    rmSync(join(fixture.cwd, "packages/z-core"), { recursive: true });
    expectBlocked(fixture.run(), ["packages/", "at least one public package", "actual 0"]);
  });

  it("validates without npm access before workspace dependency setup", () => {
    const result = fixture.run({}, { validateOnly: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Validated release 6.3.1: 2 public packages.");
    expect(fixture.events()).toEqual([]);
  });
});

describe("release publication", () => {
  it("checks all versions again when publication starts after validation", () => {
    const validation = fixture.run({}, { validateOnly: true });
    expect(validation.status, validation.stderr).toBe(0);
    fixture.updateJson("packages/z-core/package.json", { version: "6.3.0" });
    expectBlocked(fixture.run(), [
      "packages/z-core/package.json#version",
      'expected "6.3.1"; actual "6.3.0"',
    ]);
  });

  it("publishes every public package at the release version in dependency order", () => {
    // A stale path list must not restrict the release checkout's package set.
    const result = fixture.run({ PATHS_RELEASED: '["packages/a-app"]' });
    expect(result.status, result.stderr).toBe(0);
    const events = fixture.events();
    expect(events.map((event) => event.args[0])).toEqual([
      "view",
      "pack",
      "publish",
      "view",
      "pack",
      "publish",
    ]);
    expect(events.filter((event) => event.args[0] === "view").map((event) => event.args)).toEqual([
      ["view", "@mrclrchtr/test-core@6.3.1", "version"],
      ["view", "@mrclrchtr/test-app@6.3.1", "version"],
    ]);
    const published = events.filter((event) => event.args[0] === "publish");
    expect(published.map((event) => event.manifest)).toEqual([
      { name: "@mrclrchtr/test-core", version: "6.3.1" },
      {
        name: "@mrclrchtr/test-app",
        version: "6.3.1",
        dependencies: { "@mrclrchtr/test-core": "6.3.1" },
      },
    ]);
    for (const event of published) {
      expect(event.args.slice(2)).toEqual(["--access", "public", "--provenance"]);
      expect(existsSync(event.args[1])).toBe(false);
    }
  });

  it("skips an existing target version but publishes a missing target version", () => {
    const result = fixture.run({
      TEST_NPM_EXISTING: JSON.stringify([
        "@mrclrchtr/test-core@6.3.1",
        "@mrclrchtr/test-app@6.3.0",
      ]),
    });
    expect(result.status, result.stderr).toBe(0);
    const events = fixture.events();
    expect(events.map((event) => event.args[0])).toEqual(["view", "view", "pack", "publish"]);
    expect(events.at(-1).manifest.name).toBe("@mrclrchtr/test-app");
    expect(events.at(-1).manifest.version).toBe("6.3.1");
    expect(result.stdout).toContain("@mrclrchtr/test-core@6.3.1 already published");
  });

  it("succeeds without packing when every target version exists", () => {
    const result = fixture.run({
      TEST_NPM_EXISTING: JSON.stringify([
        "@mrclrchtr/test-core@6.3.1",
        "@mrclrchtr/test-app@6.3.1",
      ]),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(fixture.events().map((event) => event.args)).toEqual([
      ["view", "@mrclrchtr/test-core@6.3.1", "version"],
      ["view", "@mrclrchtr/test-app@6.3.1", "version"],
    ]);
  });

  it("accepts a valid prerelease version without changing it", () => {
    fixture.updateJson("package.json", { version: "7.0.0-rc.1+build.2" });
    fixture.writeJson(".release-please-manifest.json", { ".": "7.0.0-rc.1+build.2" });
    fixture.updateJson("packages/a-app/package.json", { version: "7.0.0-rc.1+build.2" });
    fixture.updateJson("packages/z-core/package.json", { version: "7.0.0-rc.1+build.2" });
    const result = fixture.run({
      RELEASE_SHA: fixture.commit(),
      RELEASE_VERSION: "7.0.0-rc.1+build.2",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      fixture
        .events()
        .filter((event) => event.args[0] === "view")
        .map((event) => event.args[1]),
    ).toEqual([
      "@mrclrchtr/test-core@7.0.0-rc.1+build.2",
      "@mrclrchtr/test-app@7.0.0-rc.1+build.2",
    ]);
  });

  it("stops on publication failure and removes staged tarballs", () => {
    const result = fixture.run({ TEST_NPM_PUBLISH_FAIL: "true" });
    expect(result.status).toBe(1);
    const events = fixture.events();
    expect(events.map((event) => event.args[0])).toEqual(["view", "pack", "publish"]);
    expect(existsSync(events.at(-1).args[1])).toBe(false);
  });
});
