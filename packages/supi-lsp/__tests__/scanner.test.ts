import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dedupeTopmostRoots } from "@mrclrchtr/supi-core";
import { afterEach, describe, expect, it } from "vitest";
import { LspManager } from "../manager.ts";
import { introspectCapabilities, scanProjectCapabilities } from "../scanner.ts";
import type { LspConfig } from "../types.ts";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-scan-"));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "{}\n");
}

function makeConfig(command: string = "node"): LspConfig {
  return {
    servers: {
      typescript: {
        command,
        args: [],
        fileTypes: ["ts", "tsx"],
        rootMarkers: ["tsconfig.json"],
      },
      rust: {
        command,
        args: [],
        fileTypes: ["rs"],
        rootMarkers: ["Cargo.toml"],
      },
    },
  };
}

describe("scanProjectCapabilities", () => {
  it("detects root markers for available binaries", () => {
    const root = makeTmpProject();
    writeFile(root, "tsconfig.json");

    const results = scanProjectCapabilities(makeConfig(), root);
    expect(results).toEqual([
      {
        name: "typescript",
        root,
        fileTypes: ["ts", "tsx"],
      },
    ]);
  });

  it("ignores servers whose binary is missing", () => {
    const root = makeTmpProject();
    writeFile(root, "tsconfig.json");

    const results = scanProjectCapabilities(makeConfig("definitely-missing-command-xyz"), root);
    expect(results).toEqual([]);
  });

  it("deduplicates nested roots to the topmost directory", () => {
    const root = makeTmpProject();
    writeFile(root, "tsconfig.json");
    writeFile(root, "packages/frontend/tsconfig.json");
    writeFile(root, "packages/backend/tsconfig.json");

    const results = scanProjectCapabilities(makeConfig(), root);
    expect(results).toEqual([
      {
        name: "typescript",
        root,
        fileTypes: ["ts", "tsx"],
      },
    ]);
  });

  it("keeps independent roots when there is no shared parent marker", () => {
    const root = makeTmpProject();
    writeFile(root, "app-a/tsconfig.json");
    writeFile(root, "app-b/tsconfig.json");

    const results = scanProjectCapabilities(makeConfig(), root);
    expect(results).toEqual([
      {
        name: "typescript",
        root: path.join(root, "app-a"),
        fileTypes: ["ts", "tsx"],
      },
      {
        name: "typescript",
        root: path.join(root, "app-b"),
        fileTypes: ["ts", "tsx"],
      },
    ]);
  });

  it("ignores node_modules and .git directories", () => {
    const root = makeTmpProject();
    writeFile(root, "node_modules/pkg/tsconfig.json");
    writeFile(root, ".git/worktree/tsconfig.json");

    const results = scanProjectCapabilities(makeConfig(), root);
    expect(results).toEqual([]);
  });
});

describe("dedupeTopmostRoots", () => {
  it("keeps shortest parent roots first", () => {
    expect(
      dedupeTopmostRoots(["/tmp/project/packages/a", "/tmp/project", "/tmp/project/packages/b"]),
    ).toEqual(["/tmp/project"]);
  });
});

describe("introspectCapabilities", () => {
  it("returns unavailable status for detected roots without running clients", () => {
    const root = makeTmpProject();
    const manager = new LspManager(makeConfig(), root);

    const info = introspectCapabilities(manager, [
      {
        name: "typescript",
        root,
        fileTypes: ["ts", "tsx"],
      },
    ]);

    expect(info).toEqual([
      {
        name: "typescript",
        root,
        fileTypes: ["ts", "tsx"],
        status: "unavailable",
        supportedActions: [],
        openFiles: [],
      },
    ]);
  });

  it("includes lazily-started servers discovered after the initial scan", () => {
    const root = makeTmpProject();
    const manager = new LspManager(makeConfig(), root);

    (
      manager as unknown as {
        clients: Map<
          string,
          {
            name: string;
            root: string;
            status: "running";
            openFiles: string[];
            serverCapabilities: {
              hoverProvider: boolean;
              referencesProvider: boolean;
            };
          }
        >;
      }
    ).clients.set("typescript:/tmp/lazy", {
      name: "typescript",
      root: "/tmp/lazy",
      status: "running",
      openFiles: [path.join(root, "src", "index.ts")],
      serverCapabilities: {
        hoverProvider: true,
        referencesProvider: true,
      },
    });

    const info = introspectCapabilities(manager, []);
    const expectedActions = [
      ["diagnostics", "(file?)"].join(""),
      ["hover", "(file,line,char)"].join(""),
      ["references", "(file,line,char)"].join(""),
    ];

    expect(info).toEqual([
      {
        name: "typescript",
        root: "/tmp/lazy",
        fileTypes: ["ts", "tsx"],
        status: "running",
        supportedActions: expectedActions,
        openFiles: ["src/index.ts"],
      },
    ]);
  });
});
