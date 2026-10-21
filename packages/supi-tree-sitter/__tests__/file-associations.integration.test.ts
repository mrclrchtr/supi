import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/api.ts";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("C-family Tree-sitter file associations", () => {
  it("uses trusted ordered rules and keeps the default for unmatched headers", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tree-sitter-file-associations-"));
    workspaces.push(cwd);
    mkdirSync(join(cwd, "vendor"), { recursive: true });
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "include"), { recursive: true });
    const template = join(cwd, "src", "template.h");
    const vendor = join(cwd, "vendor", "vendor.h");
    const unmatched = join(cwd, "include", "default.h");
    writeFileSync(template, "template <typename T> class Box { T value; };");
    writeFileSync(vendor, "struct Vendor { int value; };");
    writeFileSync(unmatched, "struct DefaultHeader { int value; };");

    const session = createTreeSitterSession(cwd, {
      fileAssociations: [
        { pattern: "vendor/**/*.h", language: "c" },
        { pattern: "src/**/*.h", language: "cpp" },
      ],
    });
    try {
      await expect(session.canParse(template)).resolves.toMatchObject({
        kind: "success",
        data: { language: "cpp" },
      });
      await expect(session.canParse(vendor)).resolves.toMatchObject({
        kind: "success",
        data: { language: "c" },
      });
      await expect(session.canParse(unmatched)).resolves.toMatchObject({
        kind: "success",
        data: { language: "c" },
      });
      await expect(session.outline(template)).resolves.toMatchObject({
        kind: "success",
        data: [expect.objectContaining({ name: "Box" })],
      });
      await expect(session.outline(vendor)).resolves.toMatchObject({
        kind: "success",
        data: [expect.objectContaining({ name: "Vendor" })],
      });
    } finally {
      await session.dispose();
    }
  });

  it("uses the associated C++ grammar for direct and deep header callees", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tree-sitter-associated-callees-"));
    workspaces.push(cwd);
    const file = join(cwd, "configured.h");
    writeFileSync(
      file,
      "void first(); void second();\nvoid outer() { first(); auto nested = []() { second(); }; }\n",
    );
    const session = createTreeSitterSession(cwd, {
      fileAssociations: [{ pattern: "**/*.h", language: "cpp" }],
    });
    try {
      await expect(session.calleesAt(file, 2, 6, "direct")).resolves.toMatchObject({
        kind: "success",
        data: { depth: "direct", callees: [{ name: "first" }] },
      });
      await expect(session.calleesAt(file, 2, 6, "deep")).resolves.toMatchObject({
        kind: "success",
        data: { depth: "deep", callees: [{ name: "first" }, { name: "second" }] },
      });
      await expect(session.calleesAt(file, 2, 46, "direct")).resolves.toMatchObject({
        kind: "success",
        data: { depth: "direct", callees: [{ name: "second" }] },
      });
      await expect(session.callSites(file)).resolves.toMatchObject({
        kind: "success",
        data: [{ name: "first" }, { name: "second" }],
      });
    } finally {
      await session.dispose();
    }
  });

  it.each(["configured.hpp", "configured.cpp"])(
    "uses the associated C grammar for callees in %s",
    async (name) => {
      const cwd = mkdtempSync(join(tmpdir(), "tree-sitter-associated-c-callees-"));
      workspaces.push(cwd);
      const file = join(cwd, name);
      writeFileSync(file, "void first();\nvoid outer() { first(); }\n");
      const session = createTreeSitterSession(cwd, {
        fileAssociations: [{ pattern: name, language: "c" }],
      });
      try {
        for (const depth of ["direct", "deep"] as const) {
          await expect(session.calleesAt(file, 2, 6, depth)).resolves.toMatchObject({
            kind: "success",
            data: { depth, callees: [{ name: "first" }] },
          });
        }
        await expect(session.callSites(file)).resolves.toMatchObject({
          kind: "success",
          data: [{ name: "first" }],
        });
      } finally {
        await session.dispose();
      }
    },
  );

  it("keeps standalone defaults and does not add support for other suffixes", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tree-sitter-file-associations-default-"));
    workspaces.push(cwd);
    const header = join(cwd, "default.h");
    const text = join(cwd, "unknown.txt");
    writeFileSync(header, "struct Header { int value; };");
    writeFileSync(text, "template <typename T> class Box {};");
    const session = createTreeSitterSession(cwd, {
      fileAssociations: [{ pattern: "**/*.h", language: "cpp" }],
    });
    try {
      await expect(session.canParse(header)).resolves.toMatchObject({
        kind: "success",
        data: { language: "cpp" },
      });
      await expect(session.canParse(text)).resolves.toMatchObject({
        kind: "unsupported-language",
      });
    } finally {
      await session.dispose();
    }

    const standalone = createTreeSitterSession(cwd);
    try {
      await expect(standalone.canParse(header)).resolves.toMatchObject({
        kind: "success",
        data: { language: "c" },
      });
    } finally {
      await standalone.dispose();
    }
  });
});
