# Changelog

## [1.1.0](https://github.com/mrclrchtr/supi/compare/supi-v1.0.0...supi-v1.1.0) (2026-05-16)


### Features

* add resources_discover handlers and bundled skills to extensions ([4dc3d8a](https://github.com/mrclrchtr/supi/commit/4dc3d8ad362fcd01655ee6f468d6f35c551faad7))
* **cache-monitor:** continuous prompt cache health monitoring ([71b1735](https://github.com/mrclrchtr/supi/commit/71b1735d9efa370e35b38f104f98f10d4be980e1))
* **cache:** add cross-session forensics, rename supu-cache-monitor to supi-cache ([5d5a25b](https://github.com/mrclrchtr/supi/commit/5d5a25bf9a07a7f0183b900055ba1ccd25454fb9))
* **claude-md:** add claude-md-improver skill ([3fe7460](https://github.com/mrclrchtr/supi/commit/3fe746011109ca94175f5f0a9e53090a4b6e1ba8))
* **code-intelligence:** add supi-code-intelligence package ([8617b21](https://github.com/mrclrchtr/supi/commit/8617b21c580a42b66c7ad0286c405b289033ed3e))
* **context:** add /supi-context command for detailed context usage ([a34d655](https://github.com/mrclrchtr/supi/commit/a34d6552ea3b04284f6d08f13f606f2afaa6583f))
* **debug:** add shared SuPi debug registry and supi-debug extension ([c51f20e](https://github.com/mrclrchtr/supi/commit/c51f20e98d89fa54a751f8603136757d336fdb6a))
* **flow:** add supi-flow workflow package ([ec64e91](https://github.com/mrclrchtr/supi/commit/ec64e9195ec81efb5e2a4f9a30ea7d28934e8d89))
* **insights:** add PI session insights report ([f09881a](https://github.com/mrclrchtr/supi/commit/f09881a1333bd63af38df217330e5e060aa38b4a))
* **lsp,tree-sitter:** stabilize code-intelligence substrates ([7584cb4](https://github.com/mrclrchtr/supi/commit/7584cb4b7c931830578af72742737b86a2b69617))
* **lsp:** redesign session-start guidance and status UI ([7731cb1](https://github.com/mrclrchtr/supi/commit/7731cb17de7830a46f7de788ba3b709bbde8e0a0))
* **repo:** migrate to pnpm monorepo with individually installable extensions ([eea81af](https://github.com/mrclrchtr/supi/commit/eea81afb3d5d8b80dd07f5d595d4423450766919))
* **review:** add /review command with structured code review ([66b36cf](https://github.com/mrclrchtr/supi/commit/66b36cfb406bf699731af531e45386b1fc4cf5f9))
* **rtk:** implement RTK bash command rewriting with token savings tracking ([72c1a89](https://github.com/mrclrchtr/supi/commit/72c1a89a5ffee5cae9277a372840a4fe54d05fdb))
* **settings:** add shared settings registry with unified /supi-settings UI ([88251e1](https://github.com/mrclrchtr/supi/commit/88251e1e09c66805383f7f6a85296d53d2b56301))
* **supi-claude-md:** add subdirectory context injection and root refresh ([7caa051](https://github.com/mrclrchtr/supi/commit/7caa051cb1f0e7b698b039967248184a47ea3b2e))
* **tree-sitter:** add structural analysis extension ([4931859](https://github.com/mrclrchtr/supi/commit/49318592a3a0d7160b1850eb81d88c97e30f4f76))
* **web:** add supi-web extension with web_fetch_md tool ([0157251](https://github.com/mrclrchtr/supi/commit/01572511a129342c67d891d58c33d486fbe052f5))


### Bug Fixes

* **context:** ensure supi-context loads via workspace root and meta-package ([3641391](https://github.com/mrclrchtr/supi/commit/3641391b02bb06dd08b95dba38c0eb215b74e7f5))
* **deps:** update dependency diff to v9 ([bcadaf3](https://github.com/mrclrchtr/supi/commit/bcadaf3df9b1c9a6cb10cc684b738009ff304372))
* **extras:** ship clipboardy on all install surfaces ([3573458](https://github.com/mrclrchtr/supi/commit/35734581b335709626b4f9aaa92daed4dd427277))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **rtk,lsp,review,ci:** merge best review follow-ups ([c84e883](https://github.com/mrclrchtr/supi/commit/c84e8837b8f7d755209f34d0913a34450378e05b))
* **supi,lsp:** update tests and remove stale skills references ([2d14e7c](https://github.com/mrclrchtr/supi/commit/2d14e7c0d9fd1eb9aede49dd13b85d5a0d5a1e99))
* **supi:** update bundled deps and CLAUDE.md after supi-cache rename ([a8da48c](https://github.com/mrclrchtr/supi/commit/a8da48c21a76c08e66cf3d1c21db7c525eefda39))


### Performance Improvements

* **supi-tree-sitter:** vendor all grammar WASM, drop native deps from runtime bundle ([8d44234](https://github.com/mrclrchtr/supi/commit/8d44234fd70f0cd626c9d1bd74af894914b72f4f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-ask-user bumped to 1.1.0
    * @mrclrchtr/supi-bash-timeout bumped to 1.1.0
    * @mrclrchtr/supi-claude-md bumped to 1.1.0
    * @mrclrchtr/supi-core bumped to 1.1.0
    * @mrclrchtr/supi-debug bumped to 1.1.0
    * @mrclrchtr/supi-lsp bumped to 2.0.0
    * @mrclrchtr/supi-context bumped to 1.1.0
    * @mrclrchtr/supi-tree-sitter bumped to 2.0.0
    * @mrclrchtr/supi-code-intelligence bumped to 1.1.0
    * @mrclrchtr/supi-extras bumped to 1.1.0

## [0.2.1](https://github.com/mrclrchtr/supi/compare/supi-v0.2.0...supi-v0.2.1) (2026-05-15)


### Bug Fixes

* **deps:** update dependency diff to v9 ([bcadaf3](https://github.com/mrclrchtr/supi/commit/bcadaf3df9b1c9a6cb10cc684b738009ff304372))

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-v0.1.1...supi-v0.2.0) (2026-05-14)


### Features

* add resources_discover handlers and bundled skills to extensions ([4dc3d8a](https://github.com/mrclrchtr/supi/commit/4dc3d8ad362fcd01655ee6f468d6f35c551faad7))
* **cache-monitor:** continuous prompt cache health monitoring ([71b1735](https://github.com/mrclrchtr/supi/commit/71b1735d9efa370e35b38f104f98f10d4be980e1))
* **cache:** add cross-session forensics, rename supu-cache-monitor to supi-cache ([5d5a25b](https://github.com/mrclrchtr/supi/commit/5d5a25bf9a07a7f0183b900055ba1ccd25454fb9))
* **claude-md:** add claude-md-improver skill ([3fe7460](https://github.com/mrclrchtr/supi/commit/3fe746011109ca94175f5f0a9e53090a4b6e1ba8))
* **code-intelligence:** add supi-code-intelligence package ([8617b21](https://github.com/mrclrchtr/supi/commit/8617b21c580a42b66c7ad0286c405b289033ed3e))
* **context:** add /supi-context command for detailed context usage ([a34d655](https://github.com/mrclrchtr/supi/commit/a34d6552ea3b04284f6d08f13f606f2afaa6583f))
* **debug:** add shared SuPi debug registry and supi-debug extension ([c51f20e](https://github.com/mrclrchtr/supi/commit/c51f20e98d89fa54a751f8603136757d336fdb6a))
* **flow:** add supi-flow workflow package ([ec64e91](https://github.com/mrclrchtr/supi/commit/ec64e9195ec81efb5e2a4f9a30ea7d28934e8d89))
* **insights:** add PI session insights report ([f09881a](https://github.com/mrclrchtr/supi/commit/f09881a1333bd63af38df217330e5e060aa38b4a))
* **lsp,tree-sitter:** stabilize code-intelligence substrates ([7584cb4](https://github.com/mrclrchtr/supi/commit/7584cb4b7c931830578af72742737b86a2b69617))
* **lsp:** redesign session-start guidance and status UI ([7731cb1](https://github.com/mrclrchtr/supi/commit/7731cb17de7830a46f7de788ba3b709bbde8e0a0))
* **repo:** migrate to pnpm monorepo with individually installable extensions ([eea81af](https://github.com/mrclrchtr/supi/commit/eea81afb3d5d8b80dd07f5d595d4423450766919))
* **review:** add /review command with structured code review ([66b36cf](https://github.com/mrclrchtr/supi/commit/66b36cfb406bf699731af531e45386b1fc4cf5f9))
* **rtk:** implement RTK bash command rewriting with token savings tracking ([72c1a89](https://github.com/mrclrchtr/supi/commit/72c1a89a5ffee5cae9277a372840a4fe54d05fdb))
* **settings:** add shared settings registry with unified /supi-settings UI ([88251e1](https://github.com/mrclrchtr/supi/commit/88251e1e09c66805383f7f6a85296d53d2b56301))
* **supi-claude-md:** add subdirectory context injection and root refresh ([7caa051](https://github.com/mrclrchtr/supi/commit/7caa051cb1f0e7b698b039967248184a47ea3b2e))
* **tree-sitter:** add structural analysis extension ([4931859](https://github.com/mrclrchtr/supi/commit/49318592a3a0d7160b1850eb81d88c97e30f4f76))
* **web:** add supi-web extension with web_fetch_md tool ([0157251](https://github.com/mrclrchtr/supi/commit/01572511a129342c67d891d58c33d486fbe052f5))


### Bug Fixes

* **context:** ensure supi-context loads via workspace root and meta-package ([3641391](https://github.com/mrclrchtr/supi/commit/3641391b02bb06dd08b95dba38c0eb215b74e7f5))
* **extras:** ship clipboardy on all install surfaces ([3573458](https://github.com/mrclrchtr/supi/commit/35734581b335709626b4f9aaa92daed4dd427277))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **rtk,lsp,review,ci:** merge best review follow-ups ([c84e883](https://github.com/mrclrchtr/supi/commit/c84e8837b8f7d755209f34d0913a34450378e05b))
* **supi,lsp:** update tests and remove stale skills references ([2d14e7c](https://github.com/mrclrchtr/supi/commit/2d14e7c0d9fd1eb9aede49dd13b85d5a0d5a1e99))
* **supi:** update bundled deps and CLAUDE.md after supi-cache rename ([a8da48c](https://github.com/mrclrchtr/supi/commit/a8da48c21a76c08e66cf3d1c21db7c525eefda39))


### Performance Improvements

* **supi-tree-sitter:** vendor all grammar WASM, drop native deps from runtime bundle ([8d44234](https://github.com/mrclrchtr/supi/commit/8d44234fd70f0cd626c9d1bd74af894914b72f4f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-ask-user bumped to 0.2.0
    * @mrclrchtr/supi-bash-timeout bumped to 0.2.0
    * @mrclrchtr/supi-claude-md bumped to 0.2.0
    * @mrclrchtr/supi-core bumped to 0.2.0
    * @mrclrchtr/supi-debug bumped to 0.2.0
    * @mrclrchtr/supi-lsp bumped to 1.0.0
    * @mrclrchtr/supi-context bumped to 0.2.0
    * @mrclrchtr/supi-tree-sitter bumped to 1.0.0
    * @mrclrchtr/supi-code-intelligence bumped to 0.2.0
    * @mrclrchtr/supi-extras bumped to 0.2.0
