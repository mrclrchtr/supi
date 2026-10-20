import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@mrclrchtr/supi-lsp/api";
import { WorkspaceCodeIntelligenceSession } from "../../src/session/session.ts";
import {
  acquireWorkspaceProviderHost,
  type WorkspaceProviderHostLease,
} from "../../src/substrate/workspace-provider-host.ts";

const FIXTURE = fileURLToPath(new URL("../fixtures/c-family-associations/", import.meta.url));
const CLANGD_WRAPPER = fileURLToPath(
  new URL("../fixtures/clangd-protocol-recorder.mjs", import.meta.url),
);
const PROTOCOL_LOG_ENV = "SUPI_C_FAMILY_PROTOCOL_LOG";

export interface RealCFamilyAssociationWorkspace {
  readonly cwd: string;
  readonly homeDir: string;
  readonly protocolLogPath: string;
  readonly session: WorkspaceCodeIntelligenceSession;
  readonly lease: WorkspaceProviderHostLease;
  dispose(): Promise<void>;
}

/** Start the production shared provider host for trusted C-family acceptance. */
export async function createRealCFamilyAssociationWorkspace(
  clangdPath: string,
): Promise<RealCFamilyAssociationWorkspace> {
  assertExecutable(clangdPath, "clangd");
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "code-c-family-association-")));
  const homeDir = realpathSync(mkdtempSync(join(tmpdir(), "code-c-family-home-")));
  const protocolLogPath = join(cwd, "protocol.jsonl");
  const previousHome = process.env.HOME;
  const previousProtocolLog = process.env[PROTOCOL_LOG_ENV];
  let lease: WorkspaceProviderHostLease | undefined;

  try {
    cpSync(FIXTURE, cwd, { recursive: true });
    mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
    writeCompilationDatabase(cwd);
    writeTrustedProjectConfig(cwd, homeDir, clangdPath);
    process.env.HOME = homeDir;
    process.env[PROTOCOL_LOG_ENV] = protocolLogPath;
    lease = await acquireWorkspaceProviderHost(cwd, { projectTrusted: true, homeDir });
    const controller = lease.lspController;
    if (controller?.kind !== "ready" || !controller.workspaceRuntime) {
      throw new Error(`The real clangd workspace did not start: ${controller?.kind ?? "missing"}.`);
    }

    const session = new WorkspaceCodeIntelligenceSession(cwd);
    session.setHomeDir(homeDir);
    session.setProjectTrusted(true);
    session.setAutomaticPathPolicy(lease.automaticPathPolicy);
    session.attachLspController(controller);
    session.seedSentinelSnapshot(lease.sentinelSnapshot);
    return {
      cwd,
      homeDir,
      protocolLogPath,
      session,
      lease,
      dispose: async () => {
        session.clearStores();
        let processCleanupComplete = false;
        try {
          await lease?.release();
          await waitForControllerShutdown(controller);
          processCleanupComplete = true;
        } finally {
          restoreEnvironment(previousHome, previousProtocolLog);
          if (processCleanupComplete) {
            rmSync(cwd, { recursive: true, force: true });
            rmSync(homeDir, { recursive: true, force: true });
          }
        }
      },
    };
  } catch (error) {
    let processCleanupComplete = false;
    try {
      await lease?.release();
      if (lease?.lspController) await waitForControllerShutdown(lease.lspController);
      processCleanupComplete = true;
    } finally {
      restoreEnvironment(previousHome, previousProtocolLog);
      if (processCleanupComplete) {
        rmSync(cwd, { recursive: true, force: true });
        rmSync(homeDir, { recursive: true, force: true });
      }
    }
    throw error;
  }
}

function writeTrustedProjectConfig(cwd: string, homeDir: string, clangdPath: string): void {
  const defaults = loadConfig(cwd, { homeDir, projectTrusted: true }).servers;
  const servers = Object.fromEntries(
    Object.entries(defaults).map(([name, config]) => [
      name,
      name === "c"
        ? {
            ...config,
            enabled: true,
            command: process.execPath,
            args: [CLANGD_WRAPPER, clangdPath, "--background-index"],
          }
        : { ...config, enabled: false },
    ]),
  );
  writeFileSync(
    join(cwd, ".pi", "supi", "config.json"),
    JSON.stringify({
      lsp: { servers },
      "code-intelligence": {
        fileAssociations: [
          { pattern: "vendor/**/*.h", language: "c" },
          { pattern: "vendor/sdk/*.h", language: "cpp" },
          { pattern: "include/cpp/*.h", language: "cpp" },
        ],
      },
    }),
  );
}

function writeCompilationDatabase(cwd: string): void {
  const include = resolve(cwd);
  const cFile = resolve(cwd, "src/c_main.c");
  const cppFile = resolve(cwd, "src/cpp_main.cpp");
  const entries = [
    {
      directory: cwd,
      file: cFile,
      arguments: ["clang", "-std=c11", "-I", include, "-c", cFile],
    },
    {
      directory: cwd,
      file: cppFile,
      arguments: ["clang++", "-std=c++17", "-I", include, "-c", cppFile],
    },
  ];
  writeFileSync(join(cwd, "compile_commands.json"), JSON.stringify(entries));
}

function assertExecutable(command: string, label: string): void {
  if (!isAbsolute(command)) {
    throw new Error(`The ${label} command must use an absolute path: ${command}.`);
  }
  if (!existsSync(command)) throw new Error(`The ${label} command is missing: ${command}.`);
  try {
    accessSync(command, constants.X_OK);
  } catch (error) {
    throw new Error(`The ${label} command is not executable: ${command}.`, { cause: error });
  }
}

async function waitForControllerShutdown(
  controller: NonNullable<WorkspaceProviderHostLease["lspController"]>,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (controller.kind !== "initial" && Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  if (controller.kind !== "initial") {
    throw new Error("The shared LSP host did not finish process cleanup before fixture removal.");
  }
}

function restoreEnvironment(homeDir: string | undefined, protocolLog: string | undefined): void {
  if (homeDir === undefined) delete process.env.HOME;
  else process.env.HOME = homeDir;
  if (protocolLog === undefined) delete process.env[PROTOCOL_LOG_ENV];
  else process.env[PROTOCOL_LOG_ENV] = protocolLog;
}

export function readProtocolLog(filePath: string): readonly ProtocolRecord[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ProtocolRecord);
}

export interface ProtocolRecord {
  readonly method: string;
  readonly documentId?: string;
  readonly languageId?: string;
}
