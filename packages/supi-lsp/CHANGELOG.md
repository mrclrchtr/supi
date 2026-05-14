# Changelog

## [1.0.0](https://github.com/mrclrchtr/supi/compare/supi-lsp-v0.1.0...supi-lsp-v1.0.0) (2026-05-14)


### ⚠ BREAKING CHANGES

* **lsp,tree-sitter:** .pi-lsp.json is no longer read. Server definitions must move to ~/.pi/agent/supi/config.json or .pi/supi/config.json under lsp.servers, keyed by language name (e.g. typescript, python, rust). The settings allowlist key changed from servers to active.

### Features

* add resources_discover handlers and bundled skills to extensions ([4dc3d8a](https://github.com/mrclrchtr/supi/commit/4dc3d8ad362fcd01655ee6f468d6f35c551faad7))
* **claude-md,lsp:** add message renderers with shared restorePromptContent ([8153d08](https://github.com/mrclrchtr/supi/commit/8153d087132ff670a3d61f40210b4ecf196bedeb))
* **core,claude-md,lsp:** add registerConfigSettings helper ([02ea068](https://github.com/mrclrchtr/supi/commit/02ea068a1d4d15f7441a8e1e03f3cd2cddce52ea))
* **lsp,tree-sitter:** add bash, HTML, SQL, and R language support ([83bb0b7](https://github.com/mrclrchtr/supi/commit/83bb0b7d56fac6b359c7387d1f775dc95e740e91))
* **lsp,tree-sitter:** expand language support and unify LSP config ([6f88685](https://github.com/mrclrchtr/supi/commit/6f886853c499d0f72129ae662906cfd43a50653e))
* **lsp,tree-sitter:** stabilize code-intelligence substrates ([7584cb4](https://github.com/mrclrchtr/supi/commit/7584cb4b7c931830578af72742737b86a2b69617))
* **lsp:** add workspace symbol search, search fallback, symbol hover, and diagnostic augmentation ([19b35e8](https://github.com/mrclrchtr/supi/commit/19b35e8c7f93d61c1cfecc28068858e73e873698))
* **lsp:** include diagnostic messages in context when total is small ([c5cad6f](https://github.com/mrclrchtr/supi/commit/c5cad6f4ff170a6ed94bc21835b929063a7bf742))
* **lsp:** redesign session-start guidance and status UI ([7731cb1](https://github.com/mrclrchtr/supi/commit/7731cb17de7830a46f7de788ba3b709bbde8e0a0))
* **lsp:** refresh diagnostics before agent start ([a2bc69d](https://github.com/mrclrchtr/supi/commit/a2bc69de3f2d1bb2e1a20cdb30061e32e8571985))
* **lsp:** replace bash guard parser with wasm ([58efc48](https://github.com/mrclrchtr/supi/commit/58efc4820e69d411918e4ae6c9aed57205ba40ab))
* **lsp:** show which config scope disabled LSP in /lsp-status warning ([4e95396](https://github.com/mrclrchtr/supi/commit/4e95396871f11bc3f26a89d03009389efc16bee5))
* **lsp:** suppress diagnostics for files excluded by tsconfig ([b599c0b](https://github.com/mrclrchtr/supi/commit/b599c0b6022bd0fe6a28a19e308ec4eb40c37459))
* **lsp:** surface cascade diagnostics and stale suppressions ([a8f5b3d](https://github.com/mrclrchtr/supi/commit/a8f5b3d6837c6bfdc6a54cd3154fc76c2ec03b80))
* **lsp:** thread ctx.cwd, add diagnostic overlay detail, improve error guidance ([2b0cbb7](https://github.com/mrclrchtr/supi/commit/2b0cbb7c13427754a2582aba3e8f07f36aaa5d6a))
* **openspec:** review and fix supi-review-native-subagent spec ([890e2ee](https://github.com/mrclrchtr/supi/commit/890e2eedcfe4686454880b0d2545ed18e8d93a63))
* **repo:** migrate to pnpm monorepo with individually installable extensions ([eea81af](https://github.com/mrclrchtr/supi/commit/eea81afb3d5d8b80dd07f5d595d4423450766919))
* **settings:** add shared settings registry with unified /supi-settings UI ([88251e1](https://github.com/mrclrchtr/supi/commit/88251e1e09c66805383f7f6a85296d53d2b56301))
* **supi-lsp:** add exclude patterns to LSP settings ([b44f9c9](https://github.com/mrclrchtr/supi/commit/b44f9c92bac324db185c4cc83bea972134137566))
* **supi-lsp:** add isGlobMatch for gitignore-style path matching ([c075f3a](https://github.com/mrclrchtr/supi/commit/c075f3ad2901366547586bac0ed0486a3f306baf))
* **supi-lsp:** filter diagnostics and coverage by user exclude patterns ([aa872fe](https://github.com/mrclrchtr/supi/commit/aa872fe0c532f64fb502d15e546b0886a1f63cd5))
* **supi-lsp:** wire exclude patterns from settings to LspManager at session start ([12b604b](https://github.com/mrclrchtr/supi/commit/12b604b8bdaf320da6e3b3d8e7899882e1fcf82f))


### Bug Fixes

* **claude-md,core,lsp:** restore state and scope-aware settings ([c1ec97c](https://github.com/mrclrchtr/supi/commit/c1ec97cb59e745250f6e6e1b65b494c005d14ba8))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **lsp,code-intel:** summarize external references ([926aa42](https://github.com/mrclrchtr/supi/commit/926aa4288790cd560d44a933de6bcae175b2bfd4))
* **lsp,tree-sitter:** use StringEnum for Google API compat; persist LSP state across /tree; remove dead skills entry; drop unused _cwd params ([8843a8d](https://github.com/mrclrchtr/supi/commit/8843a8d96fa2dc5867954c6b858b38bd03b01593))
* **lsp:** address review feedback on search paths, types, timer leak ([1b9ef98](https://github.com/mrclrchtr/supi/commit/1b9ef9898da57d89a221b86473b196cb0b6d5c52))
* **lsp:** clear old session service before shutdown and resolve diagnostics paths from cwd ([9cc437d](https://github.com/mrclrchtr/supi/commit/9cc437d50545294171adcf3ecea4337430ec0b01))
* **lsp:** distinguish unsupported workspace symbol server from empty results ([75c5e12](https://github.com/mrclrchtr/supi/commit/75c5e12f23ce24e3d9f26b00a7bc449c5f3b3cde))
* **lsp:** fully deactivate tool and clear context when disabled ([2dc4d11](https://github.com/mrclrchtr/supi/commit/2dc4d11184c76b7ae16169317201463d43b4b451))
* **lsp:** preserve manager this in handleRecover ([caafffd](https://github.com/mrclrchtr/supi/commit/caafffd5d35efb7fd2c3c6eea93b0ac44e40778a))
* **lsp:** recover stale diagnostics after workspace changes ([a20c4fa](https://github.com/mrclrchtr/supi/commit/a20c4faef1aa000a6c274481dfe26419c7692258))
* **lsp:** resolve cache poisoning and broken tsconfig-scope tests ([de02aab](https://github.com/mrclrchtr/supi/commit/de02aab1e264e498b38e6954599c3f0b9e31906a))
* **lsp:** resolve recovery restart paths from session cwd ([a6db29f](https://github.com/mrclrchtr/supi/commit/a6db29fc710c6c7e91e1951228d3ee9ecb707855))
* **lsp:** trigger workspace recovery for new source files matching server extensions ([7027686](https://github.com/mrclrchtr/supi/commit/70276864acb65f8d4758ce4a71c6262770f7841e))
* **lsp:** widen status overlay and diagnostics ([29e739d](https://github.com/mrclrchtr/supi/commit/29e739dbe277fed6d0c1b19e6faecad26de664f2))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **release:** clean insights and lsp lint ([797de2b](https://github.com/mrclrchtr/supi/commit/797de2bfed330905fb6d7fa9d353e875968d74e5))
* **rtk,lsp,review,ci:** merge best review follow-ups ([c84e883](https://github.com/mrclrchtr/supi/commit/c84e8837b8f7d755209f34d0913a34450378e05b))
* **settings:** address post-implementation review findings ([44dfece](https://github.com/mrclrchtr/supi/commit/44dfece42ee0309097aaacf80cbe8c7fefacc8c2))
* **supi-lsp:** add concurrency guard for client start, error wrapper for tool actions ([4af1f95](https://github.com/mrclrchtr/supi/commit/4af1f951d7f9b473b4e8d8d7b738b0d64ce7aa84))
* **supi-lsp:** clear pull result IDs after file write to force full diagnostic refresh ([14c9cf1](https://github.com/mrclrchtr/supi/commit/14c9cf1af2804a3656e41e5978877d1f6ef849e7))
* **supi,lsp:** update tests and remove stale skills references ([2d14e7c](https://github.com/mrclrchtr/supi/commit/2d14e7c0d9fd1eb9aede49dd13b85d5a0d5a1e99))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
