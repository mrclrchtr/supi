import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { javaRuntimeBuildMarker, requireBinaryDigest } from "./prerequisite-evidence.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const pins = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function requireVersion(command, args, expected, label) {
  if (!command) throw new Error(`${label} command is not set.`);
  const result = spawnSync(command, args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error || result.status !== 0 || !output.includes(expected)) {
    throw new Error(
      `${label} must report ${expected}; command=${command}; output=${output.trim() || result.error?.message}`,
    );
  }
}

function packageVersion(executable, expectedName) {
  if (!executable || !existsSync(executable)) {
    throw new Error(`Required executable is missing: ${executable || expectedName}.`);
  }
  let directory = dirname(realpathSync(executable));
  while (directory !== dirname(directory)) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      const metadata = JSON.parse(readFileSync(manifest, "utf8"));
      if (metadata.name === expectedName) return metadata.version;
    }
    directory = dirname(directory);
  }
  throw new Error(`Could not find ${expectedName}/package.json for ${executable}.`);
}

function requirePackageVersion(executable, name, expected) {
  const actual = packageVersion(executable, name);
  if (actual !== expected) throw new Error(`${name} must be ${expected}; found ${actual}.`);
}

function requireJdtlsVersion(command) {
  if (!command || !existsSync(command))
    throw new Error(`Required JDTLS executable is missing: ${command}.`);
  const resolved = realpathSync(command);
  let directory = dirname(resolved);
  while (directory !== dirname(directory)) {
    const marker = join(directory, ".artifact.json");
    if (existsSync(marker)) {
      const artifact = JSON.parse(readFileSync(marker, "utf8"));
      if (
        artifact.version === pins.referenceServers.jdtls.version &&
        artifact.sha256 === pins.referenceServers.jdtls.sha256
      ) {
        return;
      }
    }
    directory = dirname(directory);
  }
  const expectedPathPart = `/jdtls/${pins.referenceServers.jdtls.version}/`;
  if (resolved.includes(expectedPathPart)) return;
  throw new Error(
    `JDTLS ${pins.referenceServers.jdtls.version} must come from its pinned artifact.`,
  );
}

if (process.versions.node !== pins.toolchains.node) {
  throw new Error(`Node ${pins.toolchains.node} is required; found ${process.versions.node}.`);
}
if (packageJson.packageManager !== `pnpm@${pins.toolchains.pnpm}`) {
  throw new Error("The root pnpm package manager does not match pins.json.");
}
if (
  packageJson.devDependencies?.[pins.referenceServers.typescriptLanguageServer.package] !==
  pins.referenceServers.typescriptLanguageServer.version
) {
  throw new Error("The root TypeScript language-server dependency does not match pins.json.");
}
requireVersion("pnpm", ["--version"], pins.toolchains.pnpm, "pnpm");

const servers = pins.referenceServers;
requireVersion(
  process.env.CODE_BASELINE_TYPESCRIPT_SERVER ??
    join(root, "node_modules/.bin/typescript-language-server"),
  ["--version"],
  servers.typescriptLanguageServer.version,
  "typescript-language-server",
);
requirePackageVersion(
  process.env.CODE_BASELINE_PYTHON_SERVER,
  servers.basedpyright.package,
  servers.basedpyright.version,
);
requireJdtlsVersion(process.env.CODE_BASELINE_JDTLS_SERVER);
requireVersion(
  process.env.CODE_BASELINE_GOPLS_SERVER ?? "gopls",
  ["version"],
  servers.gopls.version,
  "gopls",
);
const rustAnalyzer = process.env.CODE_BASELINE_RUST_ANALYZER_SERVER;
const rustHost = {
  "linux:x64": "x86_64-unknown-linux-gnu",
  "darwin:arm64": "aarch64-apple-darwin",
}[`${process.platform}:${process.arch}`];
const rustArtifact = servers.rustAnalyzer.artifacts[rustHost];
if (!rustAnalyzer || !rustArtifact) {
  throw new Error("A pinned standalone Rust Analyzer executable is required for this platform.");
}
// Some release builds omit the source commit from --version. Verify the exact binary instead.
requireBinaryDigest(rustAnalyzer, rustArtifact.binarySha256, "rust-analyzer");
requireVersion(
  rustAnalyzer,
  ["--version"],
  `${servers.rustAnalyzer.version}-standalone`,
  "rust-analyzer",
);
requireVersion(
  process.env.CODE_BASELINE_RUSTC ?? "rustc",
  ["--version"],
  pins.toolchains.rust,
  "Rust",
);
requireVersion(
  process.env.CODE_BASELINE_RUSTUP ?? "rustup",
  ["--version"],
  pins.toolchains.rustup,
  "rustup",
);
const clangd = process.env.CODE_BASELINE_CLANGD_SERVER ?? "clangd";
requireVersion(clangd, ["--version"], servers.clangd.version, "clangd");
requireVersion(
  join(dirname(realpathSync(clangd)), "clang"),
  ["--version"],
  servers.clangd.version,
  "clang",
);
requireVersion(
  join(dirname(realpathSync(clangd)), "clang++"),
  ["--version"],
  servers.clangd.version,
  "clang++",
);
requireVersion(
  process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin/java") : "java",
  ["-version"],
  javaRuntimeBuildMarker(pins.toolchains.java.version),
  "Java",
);
requireVersion("go", ["version"], `go${pins.toolchains.go}`, "Go");
