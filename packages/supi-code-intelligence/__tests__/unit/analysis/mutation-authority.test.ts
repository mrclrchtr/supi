import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  establishMutationAuthority,
  isMutationPathWithinRoot,
} from "../../../src/analysis/refactor/mutation-authority.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
});

function makeDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "supi-mutation-authority-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeSource(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "export const value = 1;\n", "utf-8");
}

describe("semantic mutation authority", () => {
  it("authorizes an external multi-file edit inside the routed provider root", () => {
    const sessionRoot = makeDirectory();
    const externalProject = path.join(makeDirectory(), "project");
    const first = path.join(externalProject, "src", "first.ts");
    const second = path.join(externalProject, "src", "second.ts");
    writeSource(first);
    writeSource(second);

    const result = establishMutationAuthority([first, second], [externalProject]);

    expect(sessionRoot).not.toBe(path.dirname(externalProject));
    expect(result).toEqual({
      kind: "authorized",
      canonicalRoots: [realpathSync(externalProject)],
    });
  });

  it("rejects a lexical traversal path", () => {
    const parent = makeDirectory();
    const project = path.join(parent, "project");
    const outside = path.join(parent, "outside.ts");
    writeSource(path.join(project, "src", "inside.ts"));
    writeSource(outside);

    const result = establishMutationAuthority([`${project}/../outside.ts`], [project]);

    expect(result).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("normalized absolute path"),
    });
  });

  it("rejects a parent-directory symlink that escapes the provider root", () => {
    const project = path.join(makeDirectory(), "project");
    const outsideDirectory = path.join(makeDirectory(), "outside");
    const outside = path.join(outsideDirectory, "escape.ts");
    writeSource(path.join(project, "src", "inside.ts"));
    writeSource(outside);
    symlinkSync(outsideDirectory, path.join(project, "linked"), "dir");

    const result = establishMutationAuthority(
      [path.join(project, "linked", "escape.ts")],
      [project],
    );

    expect(result).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("outside the authorized provider roots"),
    });
  });

  it("rejects an unresolved canonical parent", () => {
    const project = path.join(makeDirectory(), "project");
    mkdirSync(project, { recursive: true });

    const result = establishMutationAuthority(
      [path.join(project, "missing", "source.ts")],
      [project],
    );

    expect(result).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("resolvable canonical parent"),
    });
  });

  it("rejects a non-regular mutation target", () => {
    const project = path.join(makeDirectory(), "project");
    const directoryTarget = path.join(project, "src");
    mkdirSync(directoryTarget, { recursive: true });

    const result = establishMutationAuthority([directoryTarget], [project]);

    expect(result).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("not a regular file"),
    });
  });

  it("rejects Windows cross-volume and UNC paths", () => {
    expect(isMutationPathWithinRoot("C:\\project", "D:\\outside.ts", path.win32)).toBe(false);
    expect(
      isMutationPathWithinRoot("C:\\project", "\\\\server\\share\\outside.ts", path.win32),
    ).toBe(false);
  });

  it("keeps a nested routed root distinct from its parent project", () => {
    const workspace = path.join(makeDirectory(), "workspace");
    const nestedProject = path.join(workspace, "packages", "nested");
    const nestedFile = path.join(nestedProject, "src", "inside.ts");
    const siblingFile = path.join(workspace, "packages", "sibling", "outside.ts");
    writeSource(nestedFile);
    writeSource(siblingFile);

    expect(establishMutationAuthority([nestedFile], [nestedProject])).toEqual({
      kind: "authorized",
      canonicalRoots: [realpathSync(nestedProject)],
    });
    expect(establishMutationAuthority([siblingFile], [nestedProject])).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("outside the authorized provider roots"),
    });
  });
});
