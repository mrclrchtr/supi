import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
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
    options.treeSitter.dispose();
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
