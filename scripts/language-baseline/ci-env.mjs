import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { clangArchiveMembers, selectClangArtifact } from "./clang-artifacts.mjs";

const pins = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const servers = pins.referenceServers;
const clangArtifact = selectClangArtifact(pins, process.platform, process.arch);

// Hash only what provision.mjs caches (the LLVM subset, JDTLS, and the compiled gopls), so that
// changing another pin keeps the cache.
const cacheKey = createHash("sha256")
  .update(
    JSON.stringify([
      clangArtifact.sha256,
      clangArchiveMembers(clangArtifact, servers.clangd.version, process.platform),
      servers.jdtls.sha256,
      servers.gopls.version,
      pins.toolchains.go,
    ]),
  )
  .digest("hex");

const output = [
  `SUPI_BASELINE_JAVA_VERSION=${pins.toolchains.java.version}`,
  `SUPI_BASELINE_JAVA_DISTRIBUTION=${pins.toolchains.java.distribution}`,
  `SUPI_BASELINE_GO_VERSION=${pins.toolchains.go}`,
  `SUPI_BASELINE_CACHE_KEY=${cacheKey}`,
];

if (!process.env.GITHUB_ENV) {
  process.stdout.write(`${output.join("\n")}\n`);
} else {
  appendFileSync(process.env.GITHUB_ENV, `${output.join("\n")}\n`);
}
