import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { selectClangArtifact } from "./clang-artifacts.mjs";

if (process.env.CI !== "true" || !process.env.RUNNER_TEMP) {
  throw new Error("Run language-server provisioning only in an isolated CI job.");
}
if (!process.env.GITHUB_ENV || !process.env.GITHUB_PATH) {
  throw new Error("GitHub Actions environment files are required for provisioning.");
}

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const pins = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const clangArtifact = selectClangArtifact(pins, process.platform, process.arch);
const home = join(process.env.RUNNER_TEMP, "supi-language-baseline");
const bin = join(home, "bin");
const jdtlsHome = join(home, "jdtls");
const pythonHome = join(home, "basedpyright");
const rustupHome = join(home, "rustup");
const cargoHome = join(home, "cargo");

rmSync(home, { recursive: true, force: true });
mkdirSync(bin, { recursive: true });

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function runOutput(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}

async function download(url, destination, expectedHash) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  if (!response.body) throw new Error(`Download has no response body: ${url}`);

  const hash = expectedHash ? createHash("sha256") : null;
  const verifyHash = new Transform({
    transform(chunk, _encoding, callback) {
      hash?.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), verifyHash, createWriteStream(destination));
  if (expectedHash) {
    const actualHash = hash.digest("hex");
    if (actualHash !== expectedHash) {
      rmSync(destination, { force: true });
      throw new Error(`SHA-256 mismatch for ${basename(destination)}: ${actualHash}`);
    }
  }
}

function setGitHubEnvironment(values) {
  appendFileSync(
    process.env.GITHUB_ENV,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  );
}

function addGitHubPath(value) {
  appendFileSync(process.env.GITHUB_PATH, `${value}\n`);
}

function rustHost() {
  const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
  const operatingSystem = process.platform === "darwin" ? "apple-darwin" : "unknown-linux-gnu";
  return `${architecture}-${operatingSystem}`;
}

async function installClangToolchain(pin) {
  const archive = join(home, pin.file);
  const destination = join(home, "llvm");
  await download(pin.url, archive, pin.sha256);
  mkdirSync(destination, { recursive: true });
  run("tar", ["-xJf", archive, "-C", destination]);

  const llvmBin = findClangBin(destination);
  if (!llvmBin) {
    throw new Error(`Pinned LLVM artifact has no clangd, clang, and clang++ bundle: ${pin.file}`);
  }
  addGitHubPath(llvmBin);
  return join(llvmBin, "clangd");
}

function findClangBin(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (["clangd", "clang", "clang++"].every((name) => existsSync(join(directory, name)))) {
    return directory;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findClangBin(join(directory, entry.name));
    if (found) return found;
  }
  return null;
}

async function installJdtls() {
  const pin = pins.referenceServers.jdtls;
  const archive = join(home, pin.artifact);
  await download(pin.url, archive, pin.sha256);
  mkdirSync(jdtlsHome, { recursive: true });
  run("tar", ["-xzf", archive, "-C", jdtlsHome]);
  const launcher = join(jdtlsHome, "bin", "jdtls");
  if (!existsSync(launcher))
    throw new Error(`The pinned JDTLS archive has no launcher: ${launcher}`);
  chmodSync(launcher, 0o755);
  writeFileSync(
    join(jdtlsHome, ".artifact.json"),
    `${JSON.stringify({ version: pin.version, artifact: pin.artifact, sha256: pin.sha256 })}\n`,
  );
  return launcher;
}

async function installBasedpyright() {
  const pin = pins.referenceServers.basedpyright;
  run(
    "npm",
    [
      "install",
      "--prefix",
      pythonHome,
      "--no-save",
      "--package-lock=false",
      `${pin.package}@${pin.version}`,
    ],
    { env: { ...process.env, npm_config_cache: join(home, "npm-cache") } },
  );
  const executable = join(pythonHome, "node_modules", ".bin", pin.executable);
  if (!existsSync(executable)) throw new Error(`Missing pinned ${pin.executable}: ${executable}`);
  return executable;
}

function installGopls() {
  const destination = join(bin, "gopls");
  run(
    "go",
    ["install", `${pins.referenceServers.gopls.module}@v${pins.referenceServers.gopls.version}`],
    {
      env: {
        ...process.env,
        GOBIN: bin,
        GOPATH: join(home, "gopath"),
        GOMODCACHE: join(home, "gomodcache"),
        GOCACHE: join(home, "gocache"),
      },
    },
  );
  if (!existsSync(destination)) throw new Error(`Missing pinned gopls: ${destination}`);
  return destination;
}

function installRustAnalyzer() {
  const host = rustHost();
  const rustupInit = join(home, "rustup-init");
  const rustupUrl = `https://static.rust-lang.org/rustup/archive/${pins.toolchains.rustup}/${host}/rustup-init`;
  const rustupHashUrl = `${rustupUrl}.sha256`;
  const expectedHashText = runOutput("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--location",
    rustupHashUrl,
  ]);
  const expectedHash = expectedHashText.split(/\s+/u)[0];
  run("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--location",
    rustupUrl,
    "--output",
    rustupInit,
  ]);
  const actualHash = createHash("sha256").update(readFileSync(rustupInit)).digest("hex");
  if (actualHash !== expectedHash)
    throw new Error(`rustup-init ${pins.toolchains.rustup} failed SHA-256 verification.`);
  chmodSync(rustupInit, 0o755);

  const rustEnv = {
    ...process.env,
    CARGO_HOME: cargoHome,
    RUSTUP_HOME: rustupHome,
    RUSTUP_INIT_SKIP_PATH_CHECK: "yes",
  };
  run(
    rustupInit,
    [
      "-y",
      "--no-modify-path",
      "--profile",
      "minimal",
      "--default-toolchain",
      pins.toolchains.rust,
      "--component",
      "rust-src",
    ],
    { env: rustEnv },
  );
  const rustup = join(cargoHome, "bin", "rustup");
  run(
    rustup,
    ["toolchain", "install", pins.referenceServers.rustAnalyzer.toolchain, "--profile", "minimal"],
    {
      env: rustEnv,
    },
  );
  run(
    rustup,
    [
      "component",
      "add",
      "rust-analyzer",
      "rust-src",
      "--toolchain",
      pins.referenceServers.rustAnalyzer.toolchain,
    ],
    { env: rustEnv },
  );
  const analyzer = runOutput(
    rustup,
    ["which", "rust-analyzer", "--toolchain", pins.referenceServers.rustAnalyzer.toolchain],
    {
      env: rustEnv,
    },
  );
  const link = join(bin, "rust-analyzer");
  symlinkSync(analyzer, link);
  addGitHubPath(join(cargoHome, "bin"));
  return link;
}

const clangd = await installClangToolchain(clangArtifact);
const jdtls = await installJdtls();
const basedpyright = await installBasedpyright();
const gopls = installGopls();
const rustAnalyzer = installRustAnalyzer();
const typescriptLanguageServer = join(root, "node_modules", ".bin", "typescript-language-server");
for (const executable of [
  typescriptLanguageServer,
  clangd,
  jdtls,
  basedpyright,
  gopls,
  rustAnalyzer,
]) {
  if (!existsSync(executable))
    throw new Error(`Required reference server is missing: ${executable}`);
}

const environment = {
  CODE_BASELINE_TYPESCRIPT_SERVER: typescriptLanguageServer,
  CODE_BASELINE_PYTHON_SERVER: basedpyright,
  CODE_BASELINE_JDTLS_SERVER: jdtls,
  CODE_BASELINE_GOPLS_SERVER: gopls,
  CODE_BASELINE_RUST_ANALYZER_SERVER: rustAnalyzer,
  CODE_BASELINE_RUSTC: join(cargoHome, "bin", "rustc"),
  CODE_BASELINE_RUSTUP: join(cargoHome, "bin", "rustup"),
  CODE_BASELINE_CLANGD_SERVER: clangd,
  CARGO_HOME: cargoHome,
  RUSTUP_HOME: rustupHome,
  SUPI_LANGUAGE_BASELINE_HOME: home,
};
setGitHubEnvironment(environment);
addGitHubPath(bin);

const verified = spawnSync(
  process.execPath,
  [join(root, "scripts/language-baseline/verify-prerequisites.mjs")],
  {
    cwd: root,
    env: { ...process.env, ...environment, PATH: `${bin}:${process.env.PATH}` },
    stdio: "inherit",
  },
);
if (verified.error || verified.status !== 0) {
  throw new Error(
    `Pinned language-server verification failed: ${verified.error?.message ?? verified.status}`,
  );
}
