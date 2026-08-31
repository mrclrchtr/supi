import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dedupeTopmostRoots } from "@mrclrchtr/supi-core/project";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import {
  introspectCapabilities,
  scanMissingServers,
  scanProjectCapabilities,
  startDetectedServers,
} from "../../src/session/scanner.ts";
import { createAutomaticLspPathPolicy } from "../../src/workspace-path-policy.ts";

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

  it("uses one policy for built-ins, configured excludes, and repository negation", () => {
    const root = makeTmpProject();
    writeFile(root, ".cache/project/tsconfig.json");
    writeFile(root, ".pi/npm/tsconfig.json");
    writeFile(root, "configured/tsconfig.json");
    writeFile(root, "ignored/drop/tsconfig.json");
    writeFile(root, "ignored/keep/tsconfig.json");
    writeFile(root, ".github/actions/tsconfig.json");
    fs.writeFileSync(path.join(root, ".gitignore"), "ignored/*\n!ignored/keep/\n");
    const policy = createAutomaticLspPathPolicy(root, ["configured/"]);

    const results = scanProjectCapabilities(makeConfig(), root, 3, policy);

    expect(results.map((entry) => path.relative(root, entry.root))).toEqual([
      ".github/actions",
      "ignored/keep",
    ]);
  });

  it("does not detect an extension-only route from a cached shell file", () => {
    const root = makeTmpProject();
    writeFile(root, ".cache/scripts/setup.sh");
    const config: LspConfig = {
      servers: {
        bash: { command: "node", args: [], fileTypes: ["sh"], rootMarkers: [] },
      },
    };

    expect(scanProjectCapabilities(config, root)).toEqual([]);
  });

  it("does not report a missing server from an excluded source file", () => {
    const root = makeTmpProject();
    writeFile(root, ".cache/scripts/setup.sh");
    const config: LspConfig = {
      servers: {
        bash: {
          command: "definitely-missing-bash-server-xyz",
          args: [],
          fileTypes: ["sh"],
          rootMarkers: [],
        },
      },
    };

    expect(scanMissingServers(config, root)).toEqual([]);

    writeFile(root, "scripts/setup.sh");
    expect(scanMissingServers(config, root)).toEqual([
      {
        name: "bash",
        command: "definitely-missing-bash-server-xyz",
        foundExtensions: ["sh"],
      },
    ]);
  });

  it("starts only detected roots allowed by the automatic policy", async () => {
    const root = makeTmpProject();
    const manager = {
      getCwd: () => root,
      startServerForRoot: vi.fn().mockResolvedValue(null),
    } as unknown as LspManager;
    const policy = createAutomaticLspPathPolicy(root, ["excluded/"]);

    await startDetectedServers(
      manager,
      [
        { name: "typescript", root: path.join(root, "excluded"), fileTypes: ["ts"] },
        { name: "typescript", root: path.join(root, ".github"), fileTypes: ["ts"] },
      ],
      policy,
    );

    expect(manager.startServerForRoot).toHaveBeenCalledTimes(1);
    expect(manager.startServerForRoot).toHaveBeenCalledWith(
      "typescript",
      path.join(root, ".github"),
    );
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
      expect.objectContaining({
        name: "typescript",
        root,
        fileTypes: ["ts", "tsx"],
        status: "unavailable",
        supportedActions: [],
        openFiles: [],
      }),
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
      ["diagnostics", " [optional file]"].join(""),
      ["hover", "(file,line,char)"].join(""),
      ["references", "(file,line,char)"].join(""),
    ];

    expect(info).toEqual([
      expect.objectContaining({
        name: "typescript",
        root: "/tmp/lazy",
        fileTypes: ["ts", "tsx"],
        status: "running",
        supportedActions: expectedActions,
        openFiles: ["src/index.ts"],
      }),
    ]);
  });

  it("reports implementation and workspace-symbol support when available", () => {
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
              implementationProvider: boolean;
              workspaceSymbolProvider: boolean;
            };
          }
        >;
      }
    ).clients.set(`typescript:${root}`, {
      name: "typescript",
      root,
      status: "running",
      openFiles: [],
      serverCapabilities: {
        implementationProvider: true,
        workspaceSymbolProvider: true,
      },
    });

    const info = introspectCapabilities(manager, []);

    expect(info).toEqual([
      expect.objectContaining({
        name: "typescript",
        root,
        fileTypes: ["ts", "tsx"],
        status: "running",
        supportedActions: [
          "diagnostics [optional file]",
          "implementation(file,line,char)",
          "workspace_symbols(query)",
        ],
        openFiles: [],
      }),
    ]);
  });
});
