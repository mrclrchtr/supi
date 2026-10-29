import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadConfig } from "../../src/config/config.ts";
import { resolveTypeScriptLaunch } from "../../src/config/typescript-launch.ts";
import { scanMissingServers, scanProjectCapabilities } from "../../src/session/scanner.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "supi-ts-launch-"));
  roots.push(root);
  return fs.realpathSync(root);
}
function write(root: string, file: string, content: unknown): string {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  return target;
}
function compiler(root: string, installedName = "typescript", version = "6.0.3"): string {
  const dir = path.join(root, "node_modules", installedName);
  write(dir, "package.json", { name: "typescript", version });
  return write(dir, "lib/tsserver.js", "// test compiler");
}
function config(root: string, overrides = {}, global = {}) {
  write(root, ".pi/supi/config.json", { lsp: { servers: { typescript: overrides } } });
  write(root, "home/.pi/agent/supi/config.json", { lsp: { servers: { typescript: global } } });
  const server = loadConfig(root, { homeDir: path.join(root, "home") }).servers.typescript;
  if (!server) throw new Error("Missing TypeScript configuration");
  return server;
}

it("uses the route root's hoisted compiler and preserves other initialization options", () => {
  const root = project();
  const tsserver = compiler(root);
  const server = config(root, {
    initializationOptions: {
      preferences: { quotePreference: "single" },
      tsserver: { logVerbosity: "off" },
    },
  });
  const nested = path.join(root, "packages/app");
  fs.mkdirSync(nested, { recursive: true });
  const launch = resolveTypeScriptLaunch("typescript", server, nested);
  expect(launch.initializationOptions).toEqual({
    preferences: { quotePreference: "single" },
    tsserver: { logVerbosity: "off", path: tsserver },
  });
  expect(launch.typescript).toMatchObject({
    backend: "tsserver",
    packageName: "typescript",
    compilerVersion: "6.0.3",
  });
  expect(server.initializationOptions).not.toHaveProperty("tsserver.path");
});

it.each(["7.0.2", "v7.0.2"])(
  "reports unsupported canonical %s consistently without falling back",
  (version) => {
    const root = project();
    compiler(root, "typescript", version);
    compiler(root, "@typescript/typescript6");
    write(root, "tsconfig.json", {});
    write(root, "index.ts", "export const x = 1;");
    const server = config(root);
    const lsp = { servers: { typescript: server } };
    const detected = scanProjectCapabilities(lsp, root);
    expect(detected).toHaveLength(1);
    expect(detected[0]?.failureMessage).toContain("Unsupported automatic TypeScript backend");
    expect(scanMissingServers(lsp, root)).toMatchObject([
      { name: "typescript", failureMessage: detected[0]?.failureMessage },
    ]);
  },
);

it.each(["typescript", "@typescript/typescript6", "my-ts6"])(
  "resolves symlinked wrapper %s from its own dependency graph",
  (installedName) => {
    const root = project();
    const wrapper = path.join(root, "dependencies/compat");
    write(wrapper, "package.json", { name: "@typescript/typescript6", version: "6.0.2" });
    const underlying = compiler(wrapper, "@typescript/old", "6.0.3");
    const link = path.join(root, "node_modules", installedName);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(wrapper, link, "dir");
    const launch = resolveTypeScriptLaunch(
      "typescript",
      config(root, installedName === "my-ts6" ? { typescriptPackage: installedName } : {}),
      root,
    );
    expect(launch.initializationOptions).toEqual({ tsserver: { path: underlying } });
    expect(launch.typescript).toEqual({
      backend: "tsserver",
      packageName: installedName,
      wrapperVersion: "6.0.2",
      compilerVersion: "6.0.3",
    });
  },
);

it("prefers canonical TypeScript over the named wrapper and an explicit alias over canonical", () => {
  const root = project();
  const canonical = compiler(root);
  compiler(root, "@typescript/typescript6", "6.0.2");
  const alias = compiler(root, "selected-ts6", "6.0.4");
  expect(resolveTypeScriptLaunch("typescript", config(root), root).initializationOptions).toEqual({
    tsserver: { path: canonical },
  });
  expect(
    resolveTypeScriptLaunch("typescript", config(root, { typescriptPackage: "selected-ts6" }), root)
      .initializationOptions,
  ).toEqual({ tsserver: { path: alias } });
});

it.each(["bad manifest", "missing tsserver", "broken symlink", "missing wrapper dependency"])(
  "does not treat %s as an absent canonical package",
  (fault) => {
    const root = project();
    compiler(root, "@typescript/typescript6");
    if (fault === "broken symlink") {
      fs.symlinkSync(path.join(root, "missing"), path.join(root, "node_modules/typescript"), "dir");
    } else if (fault === "missing wrapper dependency") {
      write(root, "node_modules/typescript/package.json", {
        name: "@typescript/typescript6",
        version: "6.0.2",
      });
    } else {
      write(
        root,
        "node_modules/typescript/package.json",
        fault === "bad manifest" ? "{" : { name: "typescript", version: "6.0.3" },
      );
    }
    expect(() => resolveTypeScriptLaunch("typescript", config(root), root)).toThrow(
      /package "typescript".*Repair\/install/s,
    );
  },
);

it("preserves legacy TLS lookup only when both automatic candidates are genuinely absent", () => {
  const root = project();
  expect(resolveTypeScriptLaunch("typescript", config(root), root)).toEqual({
    initializationOptions: undefined,
  });
  expect(() =>
    resolveTypeScriptLaunch(
      "typescript",
      config(root, { typescriptPackage: "absent-alias" }),
      root,
    ),
  ).toThrow("Selected package is not installed");
});

it.each([
  { command: "typescript-language-server" },
  { args: ["--stdio"] },
  { initializationOptions: { tsserver: { path: "/manual/server.js" }, custom: true } },
])("keeps inherited explicit launch %j manual even at default values", (explicit) => {
  const root = project();
  compiler(root, "typescript", "7.0.2");
  const server = config(root, {}, explicit);
  expect(resolveTypeScriptLaunch("typescript", server, root)).toEqual({
    initializationOptions: server.initializationOptions,
  });
});

it.each([
  { command: "typescript-language-server" },
  { command: "definitely-missing-server" },
  { args: ["--stdio"] },
  { initializationOptions: { tsserver: { path: "/manual/server.js" } } },
])(
  "rejects a selector conflicting with inherited %j during config loading and reports both origins",
  (explicit) => {
    const root = project();
    expect(() => config(root, { typescriptPackage: "selected-ts6" }, explicit)).toThrow(
      /typescriptPackage.*\.pi\/supi\/config.json.*conflicts with.*home\/\.pi\/agent\/supi\/config.json/s,
    );
  },
);

it("discards replaced tsserver-path provenance and ignores untrusted project overrides", () => {
  const root = project();
  const serverPath = compiler(root);
  const server = config(
    root,
    { initializationOptions: { custom: true } },
    { initializationOptions: { tsserver: { path: "/old" } } },
  );
  expect(resolveTypeScriptLaunch("typescript", server, root).initializationOptions).toEqual({
    custom: true,
    tsserver: { path: serverPath },
  });
  config(root, {});
  write(root, ".pi/supi/config.json", {
    lsp: { servers: { typescript: { command: "custom", typescriptPackage: "bad" } } },
  });
  const trustedGlobalOnly = loadConfig(root, {
    homeDir: path.join(root, "home"),
    projectTrusted: false,
  }).servers.typescript;
  expect(trustedGlobalOnly).toBeDefined();
  expect(
    resolveTypeScriptLaunch("typescript", trustedGlobalOnly!, root).typescript?.compilerVersion,
  ).toBe("6.0.3");
});

it.each(
  [
    { version: undefined, expectedError: /package "selected-ts6".*has no compiler version/s },
    { version: 42, expectedError: /package "selected-ts6".*Invalid package manifest/s },
    { version: "06.0.3", expectedError: /package "selected-ts6".*Invalid package manifest/s },
    { version: "6.0.3-01", expectedError: /package "selected-ts6".*Invalid package manifest/s },
  ].flatMap((example) => [
    { ...example, wrapped: false },
    { ...example, wrapped: true },
  ]),
)(
  "rejects invalid implementation metadata before TLS can fall back or downgrade its API (version=$version, wrapper=$wrapped)",
  ({ wrapped, version, expectedError }) => {
    const root = project();
    compiler(root); // TLS could silently fall back to this valid canonical compiler.
    const alias = "selected-ts6";
    const implementationRoot = wrapped ? path.join(root, "node_modules", alias) : root;
    const implementationName = wrapped ? "@typescript/old" : alias;
    compiler(implementationRoot, implementationName);
    write(implementationRoot, `node_modules/${implementationName}/package.json`, {
      name: "typescript",
      version,
    });
    if (wrapped)
      write(root, `node_modules/${alias}/package.json`, {
        name: "@typescript/typescript6",
        version: "6.0.2",
      });
    expect(() =>
      resolveTypeScriptLaunch("typescript", config(root, { typescriptPackage: alias }), root),
    ).toThrow(expectedError);
  },
);

it("does not invent a wrapper version when only its compiler version is known", () => {
  const root = project();
  const wrapper = path.join(root, "node_modules/typescript");
  write(wrapper, "package.json", { name: "@typescript/typescript6" });
  compiler(wrapper, "@typescript/old");
  expect(resolveTypeScriptLaunch("typescript", config(root), root).typescript).toEqual({
    backend: "tsserver",
    packageName: "typescript",
    compilerVersion: "6.0.3",
  });
});

it.each(["../typescript", "/tmp/typescript", "typescript/lib", "npm:typescript@6", ""])(
  "rejects non-package selector %j instead of silently using a default",
  (typescriptPackage) => {
    const root = project();
    expect(() => config(root, { typescriptPackage })).toThrow(
      "Invalid lsp.servers.typescript.typescriptPackage",
    );
  },
);
