import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { clangArchiveMembers, selectClangArtifact } from "./clang-artifacts.mjs";

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
const pythonHome = join(home, "basedpyright");
const rustupHome = join(home, "rustup");
const cargoHome = join(home, "cargo");
// Optional directory restored by actions/cache; ci-env.mjs derives its key from the cached pins.
const cacheRoot = process.env.SUPI_LANGUAGE_BASELINE_CACHE;

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

/**
 * Install one pinned artifact into the cache directory, or reuse it when its marker exists.
 * `identity` names the directory, so a changed pin never reuses an older install. The marker is
 * written last so an interrupted install is never reused from the cache.
 */
async function installCached(name, identity, marker, install) {
  const destination = cacheRoot ? join(cacheRoot, name, identity) : join(home, name);
  const markerFile = join(destination, ".artifact.json");
  if (!existsSync(markerFile)) {
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    await install(destination);
    writeFileSync(markerFile, `${JSON.stringify(marker)}\n`);
  }
  return destination;
}

async function installClangToolchain(pin) {
  const destination = await installCached(
    "llvm",
    pin.sha256,
    { file: pin.file, sha256: pin.sha256 },
    async (directory) => {
      const archive = join(home, pin.file);
      await download(pin.url, archive, pin.sha256);
      run("tar", [
        "-xJf",
        archive,
        "-C",
        directory,
        ...clangArchiveMembers(pin, pins.referenceServers.clangd.version, process.platform),
      ]);
      rmSync(archive, { force: true });
    },
  );

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
  // The launcher gets per-workspace -data and -configuration directories, so the install stays
  // unchanged and can be cached.
  const destination = await installCached(
    "jdtls",
    pin.sha256,
    { version: pin.version, artifact: pin.artifact, sha256: pin.sha256 },
    async (directory) => {
      const archive = join(home, pin.artifact);
      await download(pin.url, archive, pin.sha256);
      run("tar", ["-xzf", archive, "-C", directory]);
      rmSync(archive, { force: true });
    },
  );
  const launcher = join(destination, "bin", "jdtls");
  if (!existsSync(launcher))
    throw new Error(`The pinned JDTLS archive has no launcher: ${launcher}`);
  chmodSync(launcher, 0o755);
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

async function installGopls() {
  const pin = pins.referenceServers.gopls;
  // `go install` compiles gopls, which takes most of the provisioning time; cache the binary by
  // the gopls and Go versions that produced it.
  const identity = `${pin.version}-go${pins.toolchains.go}`;
  const built = await installCached(
    "gopls",
    identity,
    { version: pin.version, go: pins.toolchains.go },
    (directory) => {
      run("go", ["install", `${pin.module}@v${pin.version}`], {
        env: {
          ...process.env,
          GOBIN: directory,
          GOPATH: join(home, "gopath"),
          GOMODCACHE: join(home, "gomodcache"),
          GOCACHE: join(home, "gocache"),
        },
      });
    },
  );
  const source = join(built, "gopls");
  if (!existsSync(source)) throw new Error(`Missing pinned gopls: ${source}`);
  // Server tests find gopls on PATH, so it lives in the shared bin directory.
  const destination = join(bin, "gopls");
  copyFileSync(source, destination);
  chmodSync(destination, 0o755);
  return destination;
}

async function installRustAnalyzer() {
  const host = rustHost();
  const artifact = pins.referenceServers.rustAnalyzer.artifacts[host];
  if (!artifact) throw new Error(`No pinned standalone Rust Analyzer artifact exists for ${host}.`);
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
  const archive = join(home, artifact.file);
  const analyzer = join(bin, "rust-analyzer");
  await download(artifact.url, archive, artifact.sha256);
  await pipeline(createReadStream(archive), createGunzip(), createWriteStream(analyzer));
  chmodSync(analyzer, 0o755);
  addGitHubPath(join(cargoHome, "bin"));
  return analyzer;
}

const clangd = await installClangToolchain(clangArtifact);
const jdtls = await installJdtls();
const basedpyright = await installBasedpyright();
const gopls = await installGopls();
const rustAnalyzer = await installRustAnalyzer();
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
