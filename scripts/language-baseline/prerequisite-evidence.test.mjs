import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { javaRuntimeBuildMarker, requireBinaryDigest } from "./prerequisite-evidence.mjs";

const JAVA_OUTPUT = `openjdk version "27" 2026-09-15
OpenJDK Runtime Environment Temurin-27+35 (build 27+35)
OpenJDK 64-Bit Server VM Temurin-27+35 (build 27+35, mixed mode, sharing)`;

describe("pinned prerequisite evidence", () => {
  it("matches the observed Java build without discarding patch or build identity", () => {
    expect(JAVA_OUTPUT).toContain(javaRuntimeBuildMarker("27.0.0+35"));
    expect(JAVA_OUTPUT).not.toContain(javaRuntimeBuildMarker("27.0.0+36"));
    expect(JAVA_OUTPUT).not.toContain(javaRuntimeBuildMarker("27.0.1+35"));
    expect(JAVA_OUTPUT).not.toContain(javaRuntimeBuildMarker("28.0.0+35"));
    expect(javaRuntimeBuildMarker("21.0.9+10")).toBe("(build 21.0.9+10)");
  });

  it("accepts only the exact binary, not another executable with the same version text", () => {
    const root = mkdtempSync(join(tmpdir(), "supi-pinned-binary-"));
    const command = join(root, "server");
    const bytes = "pinned server fixture\n";
    const digest = createHash("sha256").update(bytes).digest("hex");
    try {
      writeFileSync(command, bytes);
      expect(() => requireBinaryDigest(command, digest, "fixture")).not.toThrow();
      writeFileSync(command, `${bytes}changed\n`);
      expect(() => requireBinaryDigest(command, digest, "fixture")).toThrow("pinned SHA-256");
      expect(() => requireBinaryDigest(command, undefined, "fixture")).toThrow("pinned SHA-256");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
