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
});
