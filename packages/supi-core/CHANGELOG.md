# Changelog

## [1.1.0](https://github.com/mrclrchtr/supi/compare/supi-core-v1.0.0...supi-core-v1.1.0) (2026-05-16)


### Features

* **cache:** add cross-session forensics, rename supu-cache-monitor to supi-cache ([5d5a25b](https://github.com/mrclrchtr/supi/commit/5d5a25bf9a07a7f0183b900055ba1ccd25454fb9))
* **core,claude-md,lsp:** add registerConfigSettings helper ([02ea068](https://github.com/mrclrchtr/supi/commit/02ea068a1d4d15f7441a8e1e03f3cd2cddce52ea))
* **core:** thread homeDir through registerConfigSettings ([26f925c](https://github.com/mrclrchtr/supi/commit/26f925cb33304820bcce4f40955580c1c206feff))
* **debug:** add shared SuPi debug registry and supi-debug extension ([c51f20e](https://github.com/mrclrchtr/supi/commit/c51f20e98d89fa54a751f8603136757d336fdb6a))
* **rtk:** implement RTK bash command rewriting with token savings tracking ([72c1a89](https://github.com/mrclrchtr/supi/commit/72c1a89a5ffee5cae9277a372840a4fe54d05fdb))
* **settings:** add shared settings registry with unified /supi-settings UI ([88251e1](https://github.com/mrclrchtr/supi/commit/88251e1e09c66805383f7f6a85296d53d2b56301))
* **supi-claude-md:** add subdirectory context injection and root refresh ([7caa051](https://github.com/mrclrchtr/supi/commit/7caa051cb1f0e7b698b039967248184a47ea3b2e))


### Bug Fixes

* **claude-md,core,lsp:** restore state and scope-aware settings ([c1ec97c](https://github.com/mrclrchtr/supi/commit/c1ec97cb59e745250f6e6e1b65b494c005d14ba8))
* **debug:** harden config parsing and debug rendering ([7f1da6c](https://github.com/mrclrchtr/supi/commit/7f1da6c439620497964c08decff031a3c95f9a59))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **review:** enable scoped model selection in settings ([ae585ce](https://github.com/mrclrchtr/supi/commit/ae585cee05cd59295d61d52ee4af17211cb56bf7))
* **settings:** address post-implementation review findings ([44dfece](https://github.com/mrclrchtr/supi/commit/44dfece42ee0309097aaacf80cbe8c7fefacc8c2))
* **supi-core:** preserve cursor position when changing settings ([546e4e4](https://github.com/mrclrchtr/supi/commit/546e4e47f08b8ea22c6f3dd5d9e3e12d7f56f38d))
* **supi-core:** share settings registry across jiti module instances ([84a89b0](https://github.com/mrclrchtr/supi/commit/84a89b013fb19dff47c226306858c9d03cef4b31))

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-core-v0.1.0...supi-core-v0.2.0) (2026-05-14)


### Features

* **cache:** add cross-session forensics, rename supu-cache-monitor to supi-cache ([5d5a25b](https://github.com/mrclrchtr/supi/commit/5d5a25bf9a07a7f0183b900055ba1ccd25454fb9))
* **core,claude-md,lsp:** add registerConfigSettings helper ([02ea068](https://github.com/mrclrchtr/supi/commit/02ea068a1d4d15f7441a8e1e03f3cd2cddce52ea))
* **core:** thread homeDir through registerConfigSettings ([26f925c](https://github.com/mrclrchtr/supi/commit/26f925cb33304820bcce4f40955580c1c206feff))
* **debug:** add shared SuPi debug registry and supi-debug extension ([c51f20e](https://github.com/mrclrchtr/supi/commit/c51f20e98d89fa54a751f8603136757d336fdb6a))
* **rtk:** implement RTK bash command rewriting with token savings tracking ([72c1a89](https://github.com/mrclrchtr/supi/commit/72c1a89a5ffee5cae9277a372840a4fe54d05fdb))
* **settings:** add shared settings registry with unified /supi-settings UI ([88251e1](https://github.com/mrclrchtr/supi/commit/88251e1e09c66805383f7f6a85296d53d2b56301))
* **supi-claude-md:** add subdirectory context injection and root refresh ([7caa051](https://github.com/mrclrchtr/supi/commit/7caa051cb1f0e7b698b039967248184a47ea3b2e))


### Bug Fixes

* **claude-md,core,lsp:** restore state and scope-aware settings ([c1ec97c](https://github.com/mrclrchtr/supi/commit/c1ec97cb59e745250f6e6e1b65b494c005d14ba8))
* **debug:** harden config parsing and debug rendering ([7f1da6c](https://github.com/mrclrchtr/supi/commit/7f1da6c439620497964c08decff031a3c95f9a59))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **review:** enable scoped model selection in settings ([ae585ce](https://github.com/mrclrchtr/supi/commit/ae585cee05cd59295d61d52ee4af17211cb56bf7))
* **settings:** address post-implementation review findings ([44dfece](https://github.com/mrclrchtr/supi/commit/44dfece42ee0309097aaacf80cbe8c7fefacc8c2))
* **supi-core:** preserve cursor position when changing settings ([546e4e4](https://github.com/mrclrchtr/supi/commit/546e4e47f08b8ea22c6f3dd5d9e3e12d7f56f38d))
* **supi-core:** share settings registry across jiti module instances ([84a89b0](https://github.com/mrclrchtr/supi/commit/84a89b013fb19dff47c226306858c9d03cef4b31))
