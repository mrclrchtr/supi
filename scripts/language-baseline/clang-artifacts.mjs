/** Return the pinned LLVM artifact for one supported CI runner. */
export function selectClangArtifact(pins, platform, architecture) {
  const operatingSystem = platform === "darwin" ? "macos" : platform;
  const key = `${operatingSystem}-${architecture}`;
  const artifact = pins.referenceServers.clangd.artifacts[key];
  if (!artifact) {
    throw new Error(`Unsupported language-baseline Clang platform: ${platform}/${architecture}.`);
  }
  return artifact;
}

/**
 * Return the archive members the language baseline needs: clangd, the clang drivers it reports,
 * Clang's builtin headers, and the bundled libc++ headers/runtime. The full LLVM archive expands
 * to 8-11 GB; extracting only these members keeps provisioning fast and the CI cache small.
 * `tar` fails when a listed member is missing, so archive layout changes surface immediately.
 */
export function clangArchiveMembers(artifact, version, platform) {
  const root = artifact.file.replace(/\.tar\.xz$/u, "");
  const major = version.split(".")[0];
  const members = [
    "bin/clang",
    "bin/clang++",
    `bin/clang-${major}`,
    "bin/clangd",
    "lib/clang",
    "include/c++",
  ];
  // Linux LLVM releases keep libc++'s target config and shared runtime in triple directories.
  if (platform === "linux") {
    members.push("include/x86_64-unknown-linux-gnu", "lib/x86_64-unknown-linux-gnu");
  }
  return members.map((member) => `${root}/${member}`);
}
