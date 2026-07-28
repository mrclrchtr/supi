import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileToUri,
  resolveToolPath,
  stripToolPathPrefix,
  uriToFile,
} from "../../src/path-utils.ts";

describe("stripToolPathPrefix", () => {
  it.concurrent("removes a leading @", () => {
    expect(stripToolPathPrefix("@src/index.ts")).toBe("src/index.ts");
  });

  it.concurrent("leaves ordinary paths unchanged", () => {
    expect(stripToolPathPrefix("src/index.ts")).toBe("src/index.ts");
  });
});

describe("resolveToolPath", () => {
  it.concurrent("resolves a relative path from cwd", () => {
    expect(resolveToolPath("/project", "src/index.ts")).toBe("/project/src/index.ts");
  });

  it.concurrent("strips a leading @ before resolving", () => {
    expect(resolveToolPath("/project", "@src/index.ts")).toBe("/project/src/index.ts");
  });
});

describe("fileToUri", () => {
  it("converts an absolute unix path", () => {
    expect(fileToUri("/home/user/file.ts")).toBe("file:///home/user/file.ts");
  });

  it("round-trips spaces, URI delimiters, percent signs, and Unicode", () => {
    const file = path.resolve("tmp", "my #100% 😀 file.ts");
    const uri = fileToUri(file);

    expect(uri).toContain("%20");
    expect(uri).toContain("%23");
    expect(uri).toContain("%25");
    expect(uri).toContain(encodeURIComponent("😀"));
    expect(uriToFile(uri)).toBe(file);
  });

  it.runIf(process.platform === "win32")("round-trips Windows drive paths", () => {
    const file = String.raw`C:\Users\Test User\source#1.ts`;
    expect(uriToFile(fileToUri(file))).toBe(file);
  });

  it.runIf(process.platform === "win32")("round-trips Windows UNC paths", () => {
    const file = String.raw`\\server\share\source file.ts`;
    expect(uriToFile(fileToUri(file))).toBe(file);
  });
});

describe("uriToFile", () => {
  it.concurrent("decodes a file URI", () => {
    expect(uriToFile("file:///home/user/my%20project/file.ts")).toBe(
      "/home/user/my project/file.ts",
    );
  });

  it.concurrent("passes through non-file URIs", () => {
    expect(uriToFile("https://example.com")).toBe("https://example.com");
  });

  it.concurrent("passes through malformed file URIs", () => {
    expect(uriToFile("file:///%ZZ")).toBe("file:///%ZZ");
  });
});
