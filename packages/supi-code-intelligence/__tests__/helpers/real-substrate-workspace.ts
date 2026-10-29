import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  LspRuntimeController,
  loadConfig,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { createTreeSitterSession, type TreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { WorkspaceCodeIntelligenceSession } from "../../src/session/session.ts";

const TSSERVER_PATH = resolve(
  import.meta.dirname,
  "../../../../node_modules/typescript/lib/tsserver.js",
);

export const CONTRACT_FIXTURE = {
  contracts: "src/contracts.ts",
  consumer: "src/consumer.ts",
  pythonRoot: "python",
  python: "python/contracts.py",
  cppRoot: "cpp",
  cpp: "cpp/contracts.cpp",
  javaRoot: "java",
  java: "java/Contracts.java",
  kotlinRoot: "kotlin",
  kotlin: "kotlin/contracts.kt",
  rubyRoot: "ruby",
  ruby: "ruby/model.rb",
  bashRoot: "bash",
  bash: "bash/task.sh",
  rRoot: "r",
  r: "r/model.r",
  htmlRoot: "html",
  html: "html/index.html",
  sqlRoot: "sql",
  sql: "sql/schema.sql",
  unsupported: "README.md",
} as const;

export const CONTRACT_POINT = {
  coordinateTarget: { file: CONTRACT_FIXTURE.contracts, line: 15, character: 26 },
  consumerHelper: { file: CONTRACT_FIXTURE.consumer, line: 3, character: 10 },
} as const;

export interface RealSubstrateWorkspace {
  readonly cwd: string;
  readonly session: WorkspaceCodeIntelligenceSession;
  disableStructural(): void;
  enableStructural(): void;
  dispose(): Promise<void>;
}

export interface RealLanguageWorkspaceOptions {
  readonly fixturePath: string;
  readonly sourceFile: string;
  readonly language: "typescript" | "javascript" | "python" | "java" | "go" | "rust" | "c" | "cpp";
  readonly command?: string;
  readonly args?: readonly string[];
  /** Test installation to expose as canonical typescript; launch remains automatic. */
  readonly typescriptInstallation?: "typescript" | "@typescript/native";
}

export interface RealLanguageWorkspace extends RealSubstrateWorkspace {
  readonly homeDir: string;
  readonly sourcePath: string;
  readonly runtime: ReturnType<typeof getDefaultWorkspaceRuntime>;
  readonly lspRuntime: WorkspaceLspRuntime;
}

/** Create one temporary workspace backed by real TypeScript LSP and Tree-sitter services. */
export async function createRealSubstrateWorkspace(): Promise<RealSubstrateWorkspace> {
  const cwd = mkdtempSync(join(tmpdir(), "code-intelligence-contract-"));
  const runtime = getDefaultWorkspaceRuntime();
  const treeSitter = createTreeSitterSession(cwd);
  const structural = createTreeSitterProvider(treeSitter);
  const controller = new LspRuntimeController(cwd, runtime);

  try {
    writeContractFixture(cwd);
    runtime.registerStructural(cwd, structural);
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Real TypeScript LSP did not start: ${startFailureReason(started)}`);
    }
    return createWorkspaceHandle({ cwd, runtime, treeSitter, structural, controller });
  } catch (error) {
    await cleanupWorkspace({ cwd, runtime, treeSitter, controller });
    throw error;
  }
}

export async function createRealLanguageWorkspace(
  options: RealLanguageWorkspaceOptions,
): Promise<RealLanguageWorkspace> {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), `code-baseline-${options.language}-`)));
  const homeDir = realpathSync(mkdtempSync(join(tmpdir(), "code-baseline-home-")));
  const sourcePath = join(cwd, options.sourceFile);
  let controller: LspRuntimeController | undefined;
  let treeSitter: TreeSitterSession | undefined;
  const runtime = getDefaultWorkspaceRuntime();

  try {
    cpSync(options.fixturePath, cwd, { recursive: true });
    normalizeCompilationDatabase(cwd);
    if (options.typescriptInstallation) {
      const require = createRequire(import.meta.url);
      mkdirSync(join(cwd, "node_modules"), { recursive: true });
      symlinkSync(
        dirname(require.resolve(`${options.typescriptInstallation}/package.json`)),
        join(cwd, "node_modules/typescript"),
        "dir",
      );
    }
    const routeName = routeNameFor(options.language);
    const serverConfig = loadConfig(cwd, { homeDir }).servers;
    const selected = serverConfig[routeName];
    if (!selected) throw new Error(`No default LSP route exists for ${routeName}.`);
    const command = options.command ?? commandOverride(options.language) ?? selected.command;
    const args = options.args
      ? [...options.args]
      : defaultArgs(homeDir, options, selected.args ?? []);
    const servers = Object.fromEntries(
      Object.entries(serverConfig).map(([name, config]) => [
        name,
        name === routeName
          ? options.typescriptInstallation
            ? { enabled: true }
            : {
                ...config,
                enabled: true,
                command,
                args,
                ...(options.language === "python"
                  ? { settings: { basedpyright: { analysis: { typeCheckingMode: "strict" } } } }
                  : {}),
              }
          : { ...config, enabled: false },
      ]),
    );
    mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
    writeFileSync(join(cwd, ".pi", "supi", "config.json"), JSON.stringify({ lsp: { servers } }));

    treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);
    runtime.registerStructural(cwd, structural);
    controller = new LspRuntimeController(cwd, runtime, { homeDir, projectTrusted: true });
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Real ${options.language} LSP did not start: ${startFailureReason(started)}`);
    }
    if (!(await started.runtime.trackFile(sourcePath))) {
      throw new Error(`The ${options.language} LSP did not track ${sourcePath}.`);
    }
    const readiness = await started.runtime.waitUntilReadyForFile(sourcePath, {
      timeoutMs: 60_000,
    });
    if (readiness.kind !== "ready") {
      throw new Error(
        `The ${options.language} LSP is not ready for ${sourcePath}: ${readiness.kind}.`,
      );
    }
    const activeServer = started.runtime
      .getProjectServers()
      .find((server) => server.name === routeName && server.status === "running");
    if (!activeServer) {
      throw new Error(`No concrete ready ${routeName} server serves ${sourcePath}.`);
    }

    if (
      options.typescriptInstallation &&
      activeServer.typescript?.backend !==
        (options.typescriptInstallation === "typescript" ? "tsserver" : "native")
    ) {
      throw new Error(`Unexpected TypeScript backend: ${JSON.stringify(activeServer)}.`);
    }
    const session = new WorkspaceCodeIntelligenceSession(cwd);
    session.setHomeDir(homeDir);
    return {
      cwd,
      homeDir,
      sourcePath,
      runtime,
      lspRuntime: started.runtime,
      session,
      disableStructural: () => runtime.clearStructural(cwd),
      enableStructural: () => runtime.registerStructural(cwd, structural),
      dispose: async () => {
        try {
          await controller?.shutdown();
        } finally {
          runtime.clearWorkspace(cwd);
          await treeSitter?.dispose();
          rmSync(cwd, { recursive: true, force: true });
          rmSync(homeDir, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await controller?.shutdown();
    runtime.clearWorkspace(cwd);
    await treeSitter?.dispose();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    throw error;
  }
}

function routeNameFor(language: RealLanguageWorkspaceOptions["language"]): string {
  if (language === "javascript" || language === "typescript") return "typescript";
  if (language === "c" || language === "cpp") return "c";
  return language;
}

function commandOverride(language: RealLanguageWorkspaceOptions["language"]): string | undefined {
  const key = serverCommandEnvironment(language);
  const command = process.env[key];
  if (language === "python" && !command) {
    throw new Error("Set CODE_BASELINE_PYTHON_SERVER to the pinned basedpyright-langserver path.");
  }
  return command;
}

function serverCommandEnvironment(language: RealLanguageWorkspaceOptions["language"]): string {
  if (language === "typescript" || language === "javascript")
    return "CODE_BASELINE_TYPESCRIPT_SERVER";
  if (language === "python") return "CODE_BASELINE_PYTHON_SERVER";
  if (language === "java") return "CODE_BASELINE_JDTLS_SERVER";
  if (language === "go") return "CODE_BASELINE_GOPLS_SERVER";
  if (language === "rust") return "CODE_BASELINE_RUST_ANALYZER_SERVER";
  return "CODE_BASELINE_CLANGD_SERVER";
}

function defaultArgs(
  homeDir: string,
  options: RealLanguageWorkspaceOptions,
  selected: readonly string[],
): string[] {
  if (options.language !== "java") return [...selected];
  const data = join(homeDir, "jdtls-data");
  const configuration = join(homeDir, "jdtls-configuration");
  mkdirSync(data, { recursive: true });
  mkdirSync(configuration, { recursive: true });
  return ["-data", data, "-configuration", configuration];
}

function normalizeCompilationDatabase(cwd: string): void {
  const file = join(cwd, "compile_commands.json");
  if (!existsSync(file)) return;
  const entries = JSON.parse(readFileSync(file, "utf8")) as Array<{
    directory: string;
    file: string;
  }>;
  writeFileSync(
    file,
    JSON.stringify(
      entries.map((entry) => ({
        ...entry,
        directory: cwd,
        file: resolve(cwd, entry.file),
      })),
    ),
  );
}

function createWorkspaceHandle(options: {
  cwd: string;
  runtime: ReturnType<typeof getDefaultWorkspaceRuntime>;
  treeSitter: TreeSitterSession;
  structural: ReturnType<typeof createTreeSitterProvider>;
  controller: LspRuntimeController;
}): RealSubstrateWorkspace {
  return {
    cwd: options.cwd,
    session: new WorkspaceCodeIntelligenceSession(options.cwd),
    disableStructural: () => options.runtime.clearStructural(options.cwd),
    enableStructural: () => options.runtime.registerStructural(options.cwd, options.structural),
    dispose: () => cleanupWorkspace(options),
  };
}

async function cleanupWorkspace(options: {
  cwd: string;
  runtime: ReturnType<typeof getDefaultWorkspaceRuntime>;
  treeSitter: TreeSitterSession;
  controller: LspRuntimeController;
}): Promise<void> {
  try {
    await options.controller.shutdown();
  } finally {
    options.runtime.clearWorkspace(options.cwd);
    await options.treeSitter.dispose();
    rmSync(options.cwd, { recursive: true, force: true });
  }
}

function writeContractFixture(cwd: string): void {
  mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
  mkdirSync(join(cwd, "src"), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.pythonRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.cppRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.javaRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.kotlinRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.rubyRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.bashRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.rRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.htmlRoot), { recursive: true });
  mkdirSync(join(cwd, CONTRACT_FIXTURE.sqlRoot), { recursive: true });
  writeFileSync(join(cwd, ".pi", "supi", "config.json"), configuredLspJson());
  writeFileSync(join(cwd, "tsconfig.json"), tsconfigJson());
  writeFileSync(join(cwd, CONTRACT_FIXTURE.contracts), contractsSource());
  writeFileSync(join(cwd, CONTRACT_FIXTURE.consumer), consumerSource());
  writeFileSync(join(cwd, CONTRACT_FIXTURE.python), pythonSource());
  writeFileSync(
    join(cwd, CONTRACT_FIXTURE.cpp),
    "namespace app { struct NativeModel { void run() {} }; }\n",
  );
  writeFileSync(join(cwd, CONTRACT_FIXTURE.java), "record JavaModel(int id) { void run() {} }\n");
  writeFileSync(join(cwd, CONTRACT_FIXTURE.kotlin), "object KotlinModel { fun run() {} }\n");
  writeFileSync(join(cwd, CONTRACT_FIXTURE.ruby), "class RubyModel\n  def run; end\nend\n");
  writeFileSync(join(cwd, CONTRACT_FIXTURE.bash), "shell_task() { echo hi; }\n");
  writeFileSync(join(cwd, CONTRACT_FIXTURE.r), "r_task <- function() 1\n");
  writeFileSync(join(cwd, CONTRACT_FIXTURE.html), '<main id="contract-root"></main>\n');
  writeFileSync(
    join(cwd, CONTRACT_FIXTURE.sql),
    "CREATE TABLE contract_records (id bigint);\nCREATE TYPE contract_state AS ENUM ('ready');\n",
  );
  writeFileSync(join(cwd, CONTRACT_FIXTURE.unsupported), "# unsupported AST fixture\n");
}

function configuredLspJson(): string {
  return JSON.stringify({
    lsp: {
      servers: {
        typescript: {
          enabled: true,
          initializationOptions: { tsserver: { path: TSSERVER_PATH } },
        },
      },
    },
  });
}

function tsconfigJson(): string {
  return JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
    },
    include: ["src/**/*.ts"],
  });
}

function contractsSource(): string {
  return [
    'import { join } from "node:path";',
    "export type ContractAlias = { id: string };",
    "export interface Contract {",
    "  renderContract(): string;",
    "}",
    'export enum ContractState { Ready = "ready" }',
    "export class ContractWidget implements Contract {",
    "  renderContract(): string {",
    "    return helper();",
    "  }",
    "}",
    "export function helper(): string {",
    '  return join("contract", "ready");',
    "}",
    "export /* 😀 */ function coordinateTarget(): string {",
    "  return helper();",
    "}",
    "",
  ].join("\n");
}

function consumerSource(): string {
  return [
    'import { Contract, helper } from "./contracts";',
    "export function invokeContract(value: Contract): string {",
    "  return helper() + value.renderContract();",
    "}",
    "",
  ].join("\n");
}

function pythonSource(): string {
  return ["def invoke_python():", "    return pythonHelper()", ""].join("\n");
}

function startFailureReason(result: Awaited<ReturnType<LspRuntimeController["start"]>>): string {
  if (result.kind === "disabled") return result.message;
  if (result.kind === "unavailable") return result.reason;
  return "unexpected ready result";
}
