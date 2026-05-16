# Changelog

## [1.1.0](https://github.com/mrclrchtr/supi/compare/supi-claude-md-v1.0.0...supi-claude-md-v1.1.0) (2026-05-16)


### Features

* add resources_discover handlers and bundled skills to extensions ([4dc3d8a](https://github.com/mrclrchtr/supi/commit/4dc3d8ad362fcd01655ee6f468d6f35c551faad7))
* **claude-md-improver:** add Auto-Delivered Overlap quality criterion ([4f019b3](https://github.com/mrclrchtr/supi/commit/4f019b35be329da162581afae0d14c525ff3c6c9))
* **claude-md-improver:** add Phase 2.5 SuPi Overlap Check to workflow ([9193126](https://github.com/mrclrchtr/supi/commit/91931268368a1ea40e4d937a9151bfafb09bf2bb))
* **claude-md-improver:** add SuPi auto-delivery awareness to update guidelines ([0b55459](https://github.com/mrclrchtr/supi/commit/0b5545958722989c5286c4db1f897b197caf77af))
* **claude-md-improver:** add SuPi-Optimized template and Monorepo Root warning ([abc395d](https://github.com/mrclrchtr/supi/commit/abc395d61718c824aa684d579f03147c5ff32fc8))
* **claude-md-revision:** add SuPi auto-delivery note to capture guidelines ([e181a04](https://github.com/mrclrchtr/supi/commit/e181a04a30439b4e4c890a1741fb08d02acedc1d))
* **claude-md,lsp:** add message renderers with shared restorePromptContent ([8153d08](https://github.com/mrclrchtr/supi/commit/8153d087132ff670a3d61f40210b4ecf196bedeb))
* **claude-md:** add claude-md-improver skill ([3fe7460](https://github.com/mrclrchtr/supi/commit/3fe746011109ca94175f5f0a9e53090a4b6e1ba8))
* **claude-md:** add context threshold gating ([92d35ef](https://github.com/mrclrchtr/supi/commit/92d35efc090940194f2666b77f9b807c04160940))
* **claude-md:** add interactive settings UI, replace text subcommands ([c3586be](https://github.com/mrclrchtr/supi/commit/c3586bec6438493cd7012c6eab5f64df03044229))
* **claude-md:** align revision skill with improver patterns and enforce reference sync ([db488c8](https://github.com/mrclrchtr/supi/commit/db488c805276b2305d0ed81a83b3488accb77990))
* **claude-md:** remove root context refresh ([24cf8ca](https://github.com/mrclrchtr/supi/commit/24cf8cab90336dda2891633167dfc1dee2ffb368))
* **claude-md:** replace revise-claude-md prompt with skill ([7e703bb](https://github.com/mrclrchtr/supi/commit/7e703bb5762e9e76eab92fd241dd1a62a65961a2))
* **claude-md:** sync updated references to revision skill ([4845817](https://github.com/mrclrchtr/supi/commit/4845817dbfefb9b94113d966fc43d2ecb7c53824))
* **core,claude-md,lsp:** add registerConfigSettings helper ([02ea068](https://github.com/mrclrchtr/supi/commit/02ea068a1d4d15f7441a8e1e03f3cd2cddce52ea))
* **settings:** add shared settings registry with unified /supi-settings UI ([88251e1](https://github.com/mrclrchtr/supi/commit/88251e1e09c66805383f7f6a85296d53d2b56301))
* **supi-claude-md:** add subdirectory context injection and root refresh ([7caa051](https://github.com/mrclrchtr/supi/commit/7caa051cb1f0e7b698b039967248184a47ea3b2e))


### Bug Fixes

* **claude-md,core,lsp:** restore state and scope-aware settings ([c1ec97c](https://github.com/mrclrchtr/supi/commit/c1ec97cb59e745250f6e6e1b65b494c005d14ba8))
* **claude-md:** filter native context files to project scope ([e6dac77](https://github.com/mrclrchtr/supi/commit/e6dac775de4c8323c86ed5b8ea0c3bcbd5261b85))
* **claude-md:** remove as-unknown cast for systemPromptOptions ([f90fcf2](https://github.com/mrclrchtr/supi/commit/f90fcf22aa13e8cd3b6feecbb99aef72c6bff5b0))
* **claude-md:** skip root refresh on turn 0 to avoid duplicate context ([97ad76d](https://github.com/mrclrchtr/supi/commit/97ad76d611d5f065380c3dbd89ebc2270308832d))
* **claude-md:** tighten claude-md-revision skill triggers ([e782dd6](https://github.com/mrclrchtr/supi/commit/e782dd650d7d9e97543b828767e16c301a75dde7))
* **hk:** run tests on commit, remove stale prompt-path tests ([ed355b6](https://github.com/mrclrchtr/supi/commit/ed355b6e01dd8f3b8214d853a963ee6d62ea056b))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **lsp,tree-sitter:** use StringEnum for Google API compat; persist LSP state across /tree; remove dead skills entry; drop unused _cwd params ([8843a8d](https://github.com/mrclrchtr/supi/commit/8843a8d96fa2dc5867954c6b858b38bd03b01593))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **supi-claude-md:** remove redundant registerCommand for revise-claude-md ([8ffcb54](https://github.com/mrclrchtr/supi/commit/8ffcb5440871f40faf896ea31f13ec503a7401a6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 1.1.0

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-claude-md-v0.1.0...supi-claude-md-v0.2.0) (2026-05-14)


### Features

* add resources_discover handlers and bundled skills to extensions ([4dc3d8a](https://github.com/mrclrchtr/supi/commit/4dc3d8ad362fcd01655ee6f468d6f35c551faad7))
* **claude-md-improver:** add Auto-Delivered Overlap quality criterion ([4f019b3](https://github.com/mrclrchtr/supi/commit/4f019b35be329da162581afae0d14c525ff3c6c9))
* **claude-md-improver:** add Phase 2.5 SuPi Overlap Check to workflow ([9193126](https://github.com/mrclrchtr/supi/commit/91931268368a1ea40e4d937a9151bfafb09bf2bb))
* **claude-md-improver:** add SuPi auto-delivery awareness to update guidelines ([0b55459](https://github.com/mrclrchtr/supi/commit/0b5545958722989c5286c4db1f897b197caf77af))
* **claude-md-improver:** add SuPi-Optimized template and Monorepo Root warning ([abc395d](https://github.com/mrclrchtr/supi/commit/abc395d61718c824aa684d579f03147c5ff32fc8))
* **claude-md-revision:** add SuPi auto-delivery note to capture guidelines ([e181a04](https://github.com/mrclrchtr/supi/commit/e181a04a30439b4e4c890a1741fb08d02acedc1d))
* **claude-md,lsp:** add message renderers with shared restorePromptContent ([8153d08](https://github.com/mrclrchtr/supi/commit/8153d087132ff670a3d61f40210b4ecf196bedeb))
* **claude-md:** add claude-md-improver skill ([3fe7460](https://github.com/mrclrchtr/supi/commit/3fe746011109ca94175f5f0a9e53090a4b6e1ba8))
* **claude-md:** add context threshold gating ([92d35ef](https://github.com/mrclrchtr/supi/commit/92d35efc090940194f2666b77f9b807c04160940))
* **claude-md:** add interactive settings UI, replace text subcommands ([c3586be](https://github.com/mrclrchtr/supi/commit/c3586bec6438493cd7012c6eab5f64df03044229))
* **claude-md:** align revision skill with improver patterns and enforce reference sync ([db488c8](https://github.com/mrclrchtr/supi/commit/db488c805276b2305d0ed81a83b3488accb77990))
* **claude-md:** remove root context refresh ([24cf8ca](https://github.com/mrclrchtr/supi/commit/24cf8cab90336dda2891633167dfc1dee2ffb368))
* **claude-md:** replace revise-claude-md prompt with skill ([7e703bb](https://github.com/mrclrchtr/supi/commit/7e703bb5762e9e76eab92fd241dd1a62a65961a2))
* **claude-md:** sync updated references to revision skill ([4845817](https://github.com/mrclrchtr/supi/commit/4845817dbfefb9b94113d966fc43d2ecb7c53824))
* **core,claude-md,lsp:** add registerConfigSettings helper ([02ea068](https://github.com/mrclrchtr/supi/commit/02ea068a1d4d15f7441a8e1e03f3cd2cddce52ea))
* **settings:** add shared settings registry with unified /supi-settings UI ([88251e1](https://github.com/mrclrchtr/supi/commit/88251e1e09c66805383f7f6a85296d53d2b56301))
* **supi-claude-md:** add subdirectory context injection and root refresh ([7caa051](https://github.com/mrclrchtr/supi/commit/7caa051cb1f0e7b698b039967248184a47ea3b2e))


### Bug Fixes

* **claude-md,core,lsp:** restore state and scope-aware settings ([c1ec97c](https://github.com/mrclrchtr/supi/commit/c1ec97cb59e745250f6e6e1b65b494c005d14ba8))
* **claude-md:** filter native context files to project scope ([e6dac77](https://github.com/mrclrchtr/supi/commit/e6dac775de4c8323c86ed5b8ea0c3bcbd5261b85))
* **claude-md:** remove as-unknown cast for systemPromptOptions ([f90fcf2](https://github.com/mrclrchtr/supi/commit/f90fcf22aa13e8cd3b6feecbb99aef72c6bff5b0))
* **claude-md:** skip root refresh on turn 0 to avoid duplicate context ([97ad76d](https://github.com/mrclrchtr/supi/commit/97ad76d611d5f065380c3dbd89ebc2270308832d))
* **claude-md:** tighten claude-md-revision skill triggers ([e782dd6](https://github.com/mrclrchtr/supi/commit/e782dd650d7d9e97543b828767e16c301a75dde7))
* **hk:** run tests on commit, remove stale prompt-path tests ([ed355b6](https://github.com/mrclrchtr/supi/commit/ed355b6e01dd8f3b8214d853a963ee6d62ea056b))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **lsp,tree-sitter:** use StringEnum for Google API compat; persist LSP state across /tree; remove dead skills entry; drop unused _cwd params ([8843a8d](https://github.com/mrclrchtr/supi/commit/8843a8d96fa2dc5867954c6b858b38bd03b01593))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **supi-claude-md:** remove redundant registerCommand for revise-claude-md ([8ffcb54](https://github.com/mrclrchtr/supi/commit/8ffcb5440871f40faf896ea31f13ec503a7401a6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
