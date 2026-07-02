# Changelog

## [2.0.4](https://github.com/mrclrchtr/supi/compare/v2.0.3...v2.0.4) (2026-07-02)


### Bug Fixes

* **deps:** update dependency hk to v1.49.0 ([227457c](https://github.com/mrclrchtr/supi/commit/227457cc4d82de2a3b201874aa3a7006731e2247))
* **deps:** update dependency tree-sitter-cli to v0.26.10 ([899d550](https://github.com/mrclrchtr/supi/commit/899d5509880da327b22618a54a84ef3b7c851b4e))
* **deps:** update dependency web-tree-sitter to v0.26.10 ([f9d0673](https://github.com/mrclrchtr/supi/commit/f9d0673e76cc384d1a5ad4bd9cbcf3cdc5d800f4))
* **deps:** update dependency web-tree-sitter to v0.26.10 ([0a7ef15](https://github.com/mrclrchtr/supi/commit/0a7ef158d86cc43e2f9a230773c68cbfb306b6a0))

## [2.0.3](https://github.com/mrclrchtr/supi/compare/v2.0.2...v2.0.3) (2026-06-29)


### Bug Fixes

* **supi-debug:** throw on denied access, truncate output, fix schema and status-log ([5713965](https://github.com/mrclrchtr/supi/commit/5713965d003a8488de914828387f4eb836a76727))

## [2.0.2](https://github.com/mrclrchtr/supi/compare/v2.0.1...v2.0.2) (2026-06-29)


### Bug Fixes

* **deps:** lock file maintenance ([bac65e2](https://github.com/mrclrchtr/supi/commit/bac65e2d8b74292a4b46b7073b8187103be9259d))
* **supi-prompt-suggestions:** add debug logging for model errors ([c9f831e](https://github.com/mrclrchtr/supi/commit/c9f831ec73778956611a30324f25262ef0cb6055))

## [2.0.1](https://github.com/mrclrchtr/supi/compare/v2.0.0...v2.0.1) (2026-06-29)


### Bug Fixes

* **supi-prompt-suggestions:** add missing repository, bugs, homepage, keywords, publishConfig ([a8efd55](https://github.com/mrclrchtr/supi/commit/a8efd5537d0a9685ffe2229ec00031929522d91e))

## [2.0.0](https://github.com/mrclrchtr/supi/compare/v1.16.1...v2.0.0) (2026-06-29)


### ⚠ BREAKING CHANGES

* **supi-code-intelligence:** v2 workflow tool surface ([#82](https://github.com/mrclrchtr/supi/issues/82))
* **supi-code-intel, TNDM-A9AQF4:** remove lsp_*/tree_sitter_* from public surface, add code_health
* **supi:** consolidate install surface under code-intelligence

### Features

* **supi-ci, supi-lsp:** enforce always-on coverage policy and degraded-coverage warnings ([78fc349](https://github.com/mrclrchtr/supi/commit/78fc34947918b542eec315d3577abdc1d0181344))
* **supi-code-intel, TNDM-99VDZS:** absorb lsp_hover into code_brief anchored output ([79c5780](https://github.com/mrclrchtr/supi/commit/79c5780266a92d0b34a2bab8d040808cab042d61))
* **supi-code-intel, TNDM-A9AQF4:** remove lsp_*/tree_sitter_* from public surface, add code_health ([004811a](https://github.com/mrclrchtr/supi/commit/004811abb5826fdf97299590d7d514cd226cbaa5))
* **supi-code-intel, TNDM-AQSQ4R:** add code_context workflow tool ([d84d71c](https://github.com/mrclrchtr/supi/commit/d84d71cc6183e092364f1801f587cb7129af390c))
* **supi-code-intel, TNDM-CE3914:** add code action suggestions to code_health detailed output ([3341b27](https://github.com/mrclrchtr/supi/commit/3341b27baf57e22df2e0245610eda34861495ed3))
* **supi-code-intel, TNDM-D7KHN3:** enrich code_brief with outline, imports, exports, diagnostics ([a78da45](https://github.com/mrclrchtr/supi/commit/a78da45c9d2424ab8a5cd7fa704c9781193eb9a3))
* **supi-code-intel, TNDM-D7KHN3:** merge code_map into code_brief as directory inventory enrichment ([c019702](https://github.com/mrclrchtr/supi/commit/c019702b05ded0e02046de17e5869c31f58bb19c))
* **supi-code-intel, TNDM-HDP0J4:** merge references/calls/implementations into code_graph ([f94a64b](https://github.com/mrclrchtr/supi/commit/f94a64bad6130adb19461335e615f0492549b8da))
* **supi-code-intel, TNDM-HX7YGV:** activate code_impact ([01eab40](https://github.com/mrclrchtr/supi/commit/01eab4053c9eb20fa0e230a0787ddda8ee0d8ead))
* **supi-code-intel, TNDM-J9QHYW:** split code_relations/code_refactor into 5 focused tools ([3076c64](https://github.com/mrclrchtr/supi/commit/3076c643b9f2fc8b96ddb3191354a9d3867f9b22))
* **supi-code-intel, TNDM-JSDGJP:** add workflow v2 skeleton ([c3f7c13](https://github.com/mrclrchtr/supi/commit/c3f7c13cf487494d424e66483c69852bb74c321b))
* **supi-code-intel, TNDM-K58BNX:** extract code_inspect tool ([7fa5f1c](https://github.com/mrclrchtr/supi/commit/7fa5f1c67d5dea1cce968bfa37a541e79f01d0cc))
* **supi-code-intel, TNDM-QNNVTH:** harden code-only surface ([8a7fd56](https://github.com/mrclrchtr/supi/commit/8a7fd56166746049800bff88666e51abee3141b8))
* **supi-code-intel, TNDM-WS4F5Z:** generalize refactor plans ([0ff3a12](https://github.com/mrclrchtr/supi/commit/0ff3a1237cbf992b2cb53bf5b66640598bfb4728))
* **supi-code-intel, TNDM-XR4Z47:** activate code_resolve with targetId handles ([837f7d1](https://github.com/mrclrchtr/supi/commit/837f7d11de0cb93e428f47690448452482d0a87c))
* **supi-code-intel,supi-lsp:** harden workflow tool contracts ([5b17a20](https://github.com/mrclrchtr/supi/commit/5b17a2091c9b6d059af6f63eea73491365982434))
* **supi-code-intel,supi-tree-sitter:** support AST call search ([ac3d553](https://github.com/mrclrchtr/supi/commit/ac3d55317fc9caab54fe46965e4fc3fa2fdf3180))
* **supi-code-intel:** add TUI rendering for all code-intelligence tools ([7b855a3](https://github.com/mrclrchtr/supi/commit/7b855a3a3f5abb5a771b7c1186f1841a51fd907b))
* **supi-code-intel:** calleeDepth, AST kinds, tool params, LSP footer ([ccf9fd4](https://github.com/mrclrchtr/supi/commit/ccf9fd45499da82a117272c3489f6a23dd589054))
* **supi-code-intel:** chain-next resolve hints, enriched defs, staleness banner, auto-detect find ([4cb9d91](https://github.com/mrclrchtr/supi/commit/4cb9d9127feee7415be3957f01e8f1987a8af0c3))
* **supi-code-intel:** compress reference and impact output with smart line ranges ([8ae7001](https://github.com/mrclrchtr/supi/commit/8ae700189604f35f54a6fccbae2d5b614b5b2bd7))
* **supi-code-intel:** evidence-list truncation disclosure for public tools ([9231a4a](https://github.com/mrclrchtr/supi/commit/9231a4ad1d559601922cc5523bf5456d94aaa98d))
* **supi-code-intel:** finalize workflow tool surface ([4eca291](https://github.com/mrclrchtr/supi/commit/4eca2912a97ca7732965775af4478e57dca5263d))
* **supi-code-intel:** honor include in orientation mode, drop Next-steps from renderers ([a656b1e](https://github.com/mrclrchtr/supi/commit/a656b1e77cc41d6a965baf3cc40aafe4ac1952cc))
* **supi-code-intel:** implement imports/exports in code_graph, tune context budget ([2f602d1](https://github.com/mrclrchtr/supi/commit/2f602d1bc2e36263604e471bbee6a305611fdc28))
* **supi-code-intel:** language-agnostic structured search with tree-sitter callSites ([ae85014](https://github.com/mrclrchtr/supi/commit/ae8501428646d99e2dbe9458dc86c45b84534cde))
* **supi-code-intelligence:** v2 workflow tool surface ([#82](https://github.com/mrclrchtr/supi/issues/82)) ([2f879f2](https://github.com/mrclrchtr/supi/commit/2f879f286f10032142a9fbf3f4f6d058f667c69e))
* **supi-code-intel:** refuse rename on declaration anchor targets ([c4ae45d](https://github.com/mrclrchtr/supi/commit/c4ae45d2793da70b041d75f334b53d2642aff843))
* **supi-code-intel:** resolve real symbol targets from anchored coordinates ([eefb6ea](https://github.com/mrclrchtr/supi/commit/eefb6ea1870054c2d400a52534bda4ed50df2a41))
* **supi-code-intel:** restore CI status as interactive /supi-ci-status overlay ([b637141](https://github.com/mrclrchtr/supi/commit/b637141de5bdc6f91f505de9d9530f4f61ca0444))
* **supi-code-intel:** tool-guidance compliance pass ([f57770b](https://github.com/mrclrchtr/supi/commit/f57770b301fec61a3d4958d48eb32b19491242bd))
* **supi-context:** render context tool output ([ada92c1](https://github.com/mrclrchtr/supi/commit/ada92c137cac21b71fd25f4ab7cddd9eae156ad5))
* **supi-lsp,supi-code-intel:** semantic readiness pipeline with pending state and bounded auto-wait ([6aa0aed](https://github.com/mrclrchtr/supi/commit/6aa0aed50e927cbe3c10650b0d26c855f9830730))
* **supi-lsp:** gate semantic queries on server readiness via work-done-progress ([e58953c](https://github.com/mrclrchtr/supi/commit/e58953cb5cf90270ff1168254e458539c328e732))
* **supi-prompt-suggestions:** add prompt-suggestions extension ([c874386](https://github.com/mrclrchtr/supi/commit/c8743867c634051d03ba5ea7ebdda801b73fd264))


### Bug Fixes

* **deps:** lock file maintenance ([6cfdce3](https://github.com/mrclrchtr/supi/commit/6cfdce3f99a99f46d57b19bcacf39038c4202425))
* **pack-staged:** add missing report export, remove unused biome-ignore ([2ee70a9](https://github.com/mrclrchtr/supi/commit/2ee70a9ce3e128377371141c3724548032c5c4cc))
* **pack:** relax system-dir guard so test fixtures in /tmp pass on Linux CI ([4ea2877](https://github.com/mrclrchtr/supi/commit/4ea28775cf4b23d60481f579aed590acb4d2be1c))
* **pack:** remove dangling symlinks before staging ([020315a](https://github.com/mrclrchtr/supi/commit/020315a1d8a36e6150e0ba238bbd82e7918acac9))
* **supi-code-intel, TNDM-JSDGJP:** tighten workflow skeleton contracts ([20635b1](https://github.com/mrclrchtr/supi/commit/20635b140ba8ab625b9bb4afcdc3d752af8bad01))
* **supi-code-intel:** add container to targetId hash ([1b30cfb](https://github.com/mrclrchtr/supi/commit/1b30cfb0a1cd00d8c2053d4d32e0e0cef1ccc0ac))
* **supi-code-intel:** address tool review — paths, filters, dead code, enum gaps ([b794397](https://github.com/mrclrchtr/supi/commit/b7943979c41fece6912e547fb9499d074d50ee64))
* **supi-code-intel:** align trust surfaces with evidence contract ([b9f9d8f](https://github.com/mrclrchtr/supi/commit/b9f9d8fd5aef9cb22af184baf576b37ce8501469))
* **supi-code-intel:** bounded tool/package-aware test discovery and deduplicate reference display ([fe874eb](https://github.com/mrclrchtr/supi/commit/fe874eb3b8873d4d068a4db9cb28a5a81960f9c1))
* **supi-code-intel:** close review follow-ups ([70c3aea](https://github.com/mrclrchtr/supi/commit/70c3aeab137f4ebf23f6093428fb6f8f48897feb))
* **supi-code-intel:** expose tests provenance and details ([7042c11](https://github.com/mrclrchtr/supi/commit/7042c11280567cb13647be67b5d2f3c0b702904c))
* **supi-code-intel:** handle vscode-languageserver-types v3.18.0 Diagnostic.message widening ([6796467](https://github.com/mrclrchtr/supi/commit/6796467436966eefbeaf3d74c949d66ec88d5b8d))
* **supi-code-intel:** harden code_find evidence contract and align schema ([df332da](https://github.com/mrclrchtr/supi/commit/df332da77f6b127cc8271cf1a489b7d3241abb7c))
* **supi-code-intel:** harden evidence contract for code_graph, code_impact, and test discovery ([815603f](https://github.com/mrclrchtr/supi/commit/815603fdb0843cec78924c44f1eb010b70d67ac5))
* **supi-code-intel:** ignore zero-count health diagnostics ([491df15](https://github.com/mrclrchtr/supi/commit/491df152e0adf16f77ea86c26105fde2f97cd761))
* **supi-code-intel:** make truncation test order-independent to fix flaky failure ([062173f](https://github.com/mrclrchtr/supi/commit/062173f5e44c1500dbd86354936127f4287b2372))
* **supi-code-intel:** pass resolved position to test discovery, dedupe results ([6c442fe](https://github.com/mrclrchtr/supi/commit/6c442fecc0493638e4d091088ccc841d2c75c042))
* **supi-code-intel:** preserve positional data in code_inspect ancestry rendering ([736ff09](https://github.com/mrclrchtr/supi/commit/736ff096b08e6a72f6358963399f442de3219861))
* **supi-code-intel:** redirect section mode to orientation when no target is available ([991a083](https://github.com/mrclrchtr/supi/commit/991a083869cca7d21bd88b61653aedceded9079c))
* **supi-code-intel:** refine disambiguation anchors, stabilize targetId ([c7e7ee5](https://github.com/mrclrchtr/supi/commit/c7e7ee596f7780d5447d99f76c7c1ec441f7b92c))
* **supi-code-intel:** refuse declaration anchors for code_graph and code_context callees ([da4e31b](https://github.com/mrclrchtr/supi/commit/da4e31be178fcf3628cfe578432536fbee24284e))
* **supi-code-intel:** remove dead tests for removed refactor operations ([52403d0](https://github.com/mrclrchtr/supi/commit/52403d07721ca543f58c19e8f010e58312c1ee2a))
* **supi-code-intel:** remove invalid kind values from code_resolve schema ([1afb121](https://github.com/mrclrchtr/supi/commit/1afb121c3c7391c6f7d1203822d5043840482cbc))
* **supi-code-intel:** rename code_graph path param to scope for consistency ([15f2d04](https://github.com/mrclrchtr/supi/commit/15f2d04d4f401e4538d07639f31cdab32a30b27c))
* **supi-code-intel:** replace AST file cap with ripgrep pre-filter ([4676a91](https://github.com/mrclrchtr/supi/commit/4676a9155d082466e7d7142e2897430439930669))
* **supi-code-intel:** replace filesystem walk with ripgrep pre-filter in call-site search ([ce8aa63](https://github.com/mrclrchtr/supi/commit/ce8aa635ad0c1b7363b28a491363ff88b7d7ef22))
* **supi-code-intel:** scope-based context, test discovery fallback, resolve token waste ([4c31dcd](https://github.com/mrclrchtr/supi/commit/4c31dcd70839c59cf8a5fcfc9193aef9f9be3db1))
* **supi-code-intel:** shorten AST-call output note and sync docs/schema/tests ([195781c](https://github.com/mrclrchtr/supi/commit/195781ca2f9a25aeddec55a42e66fcd9f49d237c))
* **supi-code-intel:** support file+symbol in code_graph via scoped symbol lookup ([aa85459](https://github.com/mrclrchtr/supi/commit/aa85459570cc77b7cc8155b7bf479094820e0d45))
* **supi-code-intel:** unbrittle surface — narrow to solid, finish tests+call-sites ([0b5339e](https://github.com/mrclrchtr/supi/commit/0b5339e61b6f3b71727c29381e03b4b12c17db95))
* **supi-code-intel:** unify likely-test discovery across tools ([b952b6f](https://github.com/mrclrchtr/supi/commit/b952b6f096c58db1dac2368952459161ec30e74d))
* **supi-code-intel:** unify test-analysis contract and provenance across tools ([43dd5bd](https://github.com/mrclrchtr/supi/commit/43dd5bd1377cdf857e61b18fb3e03155900ced6d))
* **supi-code-intel:** use character-based hover truncation in code_context ([9fbbdd4](https://github.com/mrclrchtr/supi/commit/9fbbdd4300e6601c459498b92f76401910156b9a))
* **supi-lsp:** prevent unhandled promise rejections in client and transport ([2568994](https://github.com/mrclrchtr/supi/commit/2568994cdae956b9709559c1a4712835385e57d9))
* **supi-lsp:** scope diagnostic injection to project root directory ([debd33a](https://github.com/mrclrchtr/supi/commit/debd33a1031bb6777364170db6a1a4f893c1bd83))
* **supi:** deduplicate shared types, remove hollow alias layer ([d4c93b0](https://github.com/mrclrchtr/supi/commit/d4c93b0f17c11af451040d1eb5a767a2eaef2551))


### Code Refactoring

* **supi:** consolidate install surface under code-intelligence ([4a184bf](https://github.com/mrclrchtr/supi/commit/4a184bf46e690c4a7125c0b19e5d266d14e3bb95))

## [1.16.1](https://github.com/mrclrchtr/supi/compare/v1.16.0...v1.16.1) (2026-06-26)


### Bug Fixes

* **deps:** update commitlint monorepo to v21.1.0 ([99040bb](https://github.com/mrclrchtr/supi/commit/99040bbc7ab5f57c90da2927a3ebd36421c63a1c))
* **deps:** update dependency @biomejs/biome to v2.5.1 ([ce9a3b6](https://github.com/mrclrchtr/supi/commit/ce9a3b69ec9dbe89f5821ab7a59593685b805a38))
* **deps:** update dependency vscode-languageserver-protocol to v3.18.1 ([e0d02e3](https://github.com/mrclrchtr/supi/commit/e0d02e3abf1409211833941e6011a6d47d29b0b5))
* **deps:** update pnpm to v11.9.0 ([cb46f61](https://github.com/mrclrchtr/supi/commit/cb46f6130ec5562a810a16e052862c5826f0f410))

## [1.16.0](https://github.com/mrclrchtr/supi/compare/v1.15.0...v1.16.0) (2026-06-25)


### Features

* **supi-context:** add supi_context agent tool gated on config ([86037b1](https://github.com/mrclrchtr/supi/commit/86037b15634723766d937a9bc2e2e841c95f1e75))


### Bug Fixes

* **config:** remove redundant supi- prefix from section keys ([4902301](https://github.com/mrclrchtr/supi/commit/49023015dc674eb25c2c2fb32d2decc337f782ad))

## [1.15.0](https://github.com/mrclrchtr/supi/compare/v1.14.3...v1.15.0) (2026-06-23)


### Features

* **supi-web:** collapse tool output by default, expand for full text ([531205a](https://github.com/mrclrchtr/supi/commit/531205ad7466152530081d787769b62db33dd882))


### Bug Fixes

* **supi-web:** align tool behavior with pi guidance ([6dcf683](https://github.com/mrclrchtr/supi/commit/6dcf683a7e0701b553ea8662b93a7709236a5ff8))


### Performance Improvements

* **supi-web:** compress tool guidance, truncation, and search output ([7918134](https://github.com/mrclrchtr/supi/commit/79181341064d9806762ca71d6a72555b0c0ec62b))

## [1.14.3](https://github.com/mrclrchtr/supi/compare/v1.14.2...v1.14.3) (2026-06-23)


### Bug Fixes

* **deps:** update vscode-languageserver-node ([e9c5ff2](https://github.com/mrclrchtr/supi/commit/e9c5ff2688bb966677bdab2f434ecf805c176319))
* **supi-ask-user:** align tool behavior with pi guidance ([669e7de](https://github.com/mrclrchtr/supi/commit/669e7de291f60a92dfbe6a5f4f077dee9d11a93e))
* **supi-ask-user:** clarify recommendation semantics in guidance and error messages ([60d5a96](https://github.com/mrclrchtr/supi/commit/60d5a96e57b8267dafb1800c23ea1c25911e1ef6))

## [1.14.2](https://github.com/mrclrchtr/supi/compare/v1.14.1...v1.14.2) (2026-06-22)


### Bug Fixes

* **build:** skip unused tree-sitter native build on Node 24 ([c46ad6c](https://github.com/mrclrchtr/supi/commit/c46ad6c0f3ee34c1ca4a161f4a3c2a514b679511))
* **deps:** deduplicate pi packages in lockfile ([a43b829](https://github.com/mrclrchtr/supi/commit/a43b82904a96e0b6e54aded349ec669b1de6ba61))
* **deps:** update dependency @davisvaughan/tree-sitter-r to v1.3.0 ([63070db](https://github.com/mrclrchtr/supi/commit/63070db017275bde5de37a0197a5878b312262fc))

## [1.14.1](https://github.com/mrclrchtr/supi/compare/v1.14.0...v1.14.1) (2026-06-19)


### Bug Fixes

* **scripts:** add -L to find in pack-staged for broken symlinks ([7400098](https://github.com/mrclrchtr/supi/commit/7400098c7f79f605430ac2c582c427ade3825698))

## [1.14.0](https://github.com/mrclrchtr/supi/compare/v1.13.0...v1.14.0) (2026-06-18)


### Features

* **supi-ask-user:** redesign form UX and result contract ([418552f](https://github.com/mrclrchtr/supi/commit/418552fdf04487adcc07989a55b66d7feb69a8ed))
* **supi-core:** redesign progress widget as two-line layout ([ee30cde](https://github.com/mrclrchtr/supi/commit/ee30cde868fdc1be3d392be27ab302ab18d56515))
* **supi-extras:** trigger skill autocomplete on $ ([f146556](https://github.com/mrclrchtr/supi/commit/f146556ced0df692c9e03ae016e93890791f11df))


### Bug Fixes

* **supi-core:** add missing ./report export to pack-staged test ([84f3d74](https://github.com/mrclrchtr/supi/commit/84f3d74362f60b8286e7aaac7dffe0ba565785a7))

## [1.13.0](https://github.com/mrclrchtr/supi/compare/v1.12.1...v1.13.0) (2026-06-17)


### Features

* **supi-core:** add footer contribution registry with TCH display ([336e9a9](https://github.com/mrclrchtr/supi/commit/336e9a998190d61751dbb5ad466fadc379194717))

## [1.12.1](https://github.com/mrclrchtr/supi/compare/v1.12.0...v1.12.1) (2026-06-15)


### Bug Fixes

* **supi-web:** make CONTEXT7_API_KEY optional, drop context7-sdk ([8ef9ad8](https://github.com/mrclrchtr/supi/commit/8ef9ad821e45b34034057b323ecbe3084f0ca2ac))
* update biome config for v2.5.0 breaking changes ([1fb1ce8](https://github.com/mrclrchtr/supi/commit/1fb1ce8f4093db173f5b856acfb7bb2b4196c385))

## [1.12.0](https://github.com/mrclrchtr/supi/compare/v1.11.3...v1.12.0) (2026-06-07)


### Features

* **supi-ask-user:** increase max questions from 4 to 10 ([58b04c8](https://github.com/mrclrchtr/supi/commit/58b04c80d5ce99b7734d855f815bbfef7930350a))
* **supi-ask-user:** make discuss always available with text input ([a6bc44e](https://github.com/mrclrchtr/supi/commit/a6bc44ed6d548bfebc08e719844aee35e7f002b1))

## [1.11.3](https://github.com/mrclrchtr/supi/compare/v1.11.2...v1.11.3) (2026-06-07)


### Bug Fixes

* **supi-lsp:** handle vscode-languageserver-types v3.18.0 type widenings ([493b2a7](https://github.com/mrclrchtr/supi/commit/493b2a76a5d04acc723c45b04290696caee64980))

## [1.11.2](https://github.com/mrclrchtr/supi/compare/v1.11.1...v1.11.2) (2026-06-06)


### Bug Fixes

* **deps:** update dependency vscode-jsonrpc to v9 ([7c0ca28](https://github.com/mrclrchtr/supi/commit/7c0ca289a2564f6ee51a606926265413bd5e0f13))

## [1.11.1](https://github.com/mrclrchtr/supi/compare/v1.11.0...v1.11.1) (2026-06-01)


### Bug Fixes

* **supi-review:** auto-steer reviewer when it stops without calling submit_review ([a588ff4](https://github.com/mrclrchtr/supi/commit/a588ff4f422b6ec6453de6656b3526f766923ef2))

## [1.11.0](https://github.com/mrclrchtr/supi/compare/v1.10.0...v1.11.0) (2026-05-31)


### Features

* **supi-review, TNDM-40PB8Y:** add in-app preview inspector ([7486716](https://github.com/mrclrchtr/supi/commit/7486716794fcace44f03235372c688afa7633ba5))
* **supi-review, TNDM-C4VKYH:** redesign review triage contract ([976763f](https://github.com/mrclrchtr/supi/commit/976763f92a9a95ca2c2f07cac2e62595527d2b41))
* **supi-review, TNDM-SA72H8:** brief-select instruction blocks ([223c7be](https://github.com/mrclrchtr/supi/commit/223c7be4e5c8e1d79956f95c5331f609d8a51587))
* **TNDM-TETRM4:** add expandable ask_user history review ([ec129ca](https://github.com/mrclrchtr/supi/commit/ec129ca77869e80952380384a056115909bfc056))


### Bug Fixes

* **supi-review:** add review failure diagnostics ([89fb8ac](https://github.com/mrclrchtr/supi/commit/89fb8ac437768130ed2646ae07a82f226cf7b805))
* **supi-review:** clarify Verify findings instruction for code reinspection ([18bfd89](https://github.com/mrclrchtr/supi/commit/18bfd8964c679e798f21bb08b9f245848c00d9eb))
* **supi-review:** format review item fields consistently ([7698fa9](https://github.com/mrclrchtr/supi/commit/7698fa9575715f8b5c1ee44f190207417c040f4d))

## [1.10.0](https://github.com/mrclrchtr/supi/compare/v1.9.1...v1.10.0) (2026-05-25)


### Features

* **supi:** add planner-backed code_refactor workflow ([3ff0f48](https://github.com/mrclrchtr/supi/commit/3ff0f488eed563dc2067f6401e0e420347f841fa))

## [1.9.1](https://github.com/mrclrchtr/supi/compare/v1.9.0...v1.9.1) (2026-05-25)


### Bug Fixes

* **supi-lsp:** bundle typescript and ignore in published tarball ([c301a41](https://github.com/mrclrchtr/supi/commit/c301a41fa6bca0a353e64dd9682d65ae6a3bd60d))

## [1.9.0](https://github.com/mrclrchtr/supi/compare/v1.8.1...v1.9.0) (2026-05-25)


### Features

* **supi-review:** emit events and show title icons on brief/review completion ([2b932a0](https://github.com/mrclrchtr/supi/commit/2b932a02a852d8724bffa87fb7571cb5dc25ff09))

## [1.8.1](https://github.com/mrclrchtr/supi/compare/v1.8.0...v1.8.1) (2026-05-25)


### Bug Fixes

* **biome:** resolve CI lint and format errors across packages and scripts ([3aa2bab](https://github.com/mrclrchtr/supi/commit/3aa2bab75eaadec15ada6fb021fee12d8ad4ef9e))
* **scripts:** handle cyclic devDep symlinks in packaging pipeline ([c5b8c24](https://github.com/mrclrchtr/supi/commit/c5b8c2407194ca7f3d658ff2130a85902bd19ce3))
* **scripts:** recursively clean nested devDep symlinks to avoid cp cycles ([789e219](https://github.com/mrclrchtr/supi/commit/789e2193f2fe627eb7c37569a760ecbc08d9a8de))
* **supi-code-intelligence:** fix type errors in test files ([3783f34](https://github.com/mrclrchtr/supi/commit/3783f342b175f90257d6e0c59c303b757d2a2761))
* **supi:** restore verify for shared test-utils consumers ([34dd420](https://github.com/mrclrchtr/supi/commit/34dd4202e8d78e1e32ee3c7202692272af1477a4))


### Performance Improvements

* **supi:** 60% faster vitest suite with threads pool, fs cache, and concurrent tests ([b6a9763](https://github.com/mrclrchtr/supi/commit/b6a9763235bd8bc46273e6b7c720d42ffc31ff7e))

## [1.8.0](https://github.com/mrclrchtr/supi/compare/v1.7.0...v1.8.0) (2026-05-25)


### Features

* **code-intelligence:** add substrate adapters ([f9d1df3](https://github.com/mrclrchtr/supi/commit/f9d1df339fcf1cfd4f1bedca475e4bfc92370386))
* **supi-review:** add v key to view full reviewer prompt in pager ([94c7dc0](https://github.com/mrclrchtr/supi/commit/94c7dc0fbf5bdc864a14c8eb394e2597928a9d1f))
* **supi-review:** replace bulk inline diffs with compact packet and on-demand snapshot tools ([45ffb02](https://github.com/mrclrchtr/supi/commit/45ffb02596d7e5451fc679271a37fcaaba5e93ba))
* **supi:** add install-all script with global and project-local support ([2b58c6b](https://github.com/mrclrchtr/supi/commit/2b58c6bdb9ef891c6f3c51aa371bcf392d8e8e8c))


### Bug Fixes

* **ask-user:** wrap long form text instead of crashing on overwidth lines ([c6d89b8](https://github.com/mrclrchtr/supi/commit/c6d89b873b5b6ef008b03d65c461279a9fdf851a))
* **code-intelligence:** use ripgrep -F for literal pattern search, surface regex hint on no-match ([f97187f](https://github.com/mrclrchtr/supi/commit/f97187fb02e7083216107e4aa2549b80ecec4f40))
* **pack-staged:** resolve bundled deps missing from pnpm-hoisted node_modules ([b4ced84](https://github.com/mrclrchtr/supi/commit/b4ced841dc3923b11589029dc5915939e34f628b))
* **supi-lsp:** align e2e-smoke test expectations with tool descriptions ([b8d8a67](https://github.com/mrclrchtr/supi/commit/b8d8a67767cd2a192372377f923780cd05ff997b))
* **supi-review:** populate ReviewPacket fields after interface restoration ([2f7555a](https://github.com/mrclrchtr/supi/commit/2f7555aae9eab91792498bb55bba5058e5a42888))
* **supi-review:** sync consumers with simplified ReviewPacket type ([095c453](https://github.com/mrclrchtr/supi/commit/095c453b3ed2cf0940f47e6381466604bb3949ee))

## [1.7.0](https://github.com/mrclrchtr/supi/compare/v1.6.0...v1.7.0) (2026-05-24)


### Features

* **code-intelligence:** split code_intel into focused tools ([ebe7bdc](https://github.com/mrclrchtr/supi/commit/ebe7bdc75c8ebe4c910efc4b95ed2adafd67563f))
* **core:** add shared tool-spec/registration framework ([f624de6](https://github.com/mrclrchtr/supi/commit/f624de6d7898fa2318e56b8f3ddb5281fe202c0b))
* **supi-review:** add file overview, skip annotations, calibration, smart follow-up ([456d8f7](https://github.com/mrclrchtr/supi/commit/456d8f7b50232ecb5257aaee0fe64001e92b252f))
* **supi-review:** bump brief synthesis thinking level to xhigh ([d2e4a39](https://github.com/mrclrchtr/supi/commit/d2e4a39ab35b3c9784e4823a10b8ed445fcbe404))


### Bug Fixes

* **lsp:** add timeout guard for exit notification flush ([4dc3be8](https://github.com/mrclrchtr/supi/commit/4dc3be889b50fc9f3a6fdf55f7af8cce39dde0e9))
* **lsp:** avoid vscode-jsonrpc shutdown noise ([c37ef54](https://github.com/mrclrchtr/supi/commit/c37ef5458c3235318f50130d21b22d941d73a542))
* **test:** mock spawnSync in web.test.ts to prevent CI flake ([784967b](https://github.com/mrclrchtr/supi/commit/784967bade2cf5fcee223942101faa5bdc41a8ec))
* **test:** update pack-staged bundledDependencies assertion for vscode-* ([0982c24](https://github.com/mrclrchtr/supi/commit/0982c24cde62d712c88178bdfbce081b42d37ab4))

## [1.6.0](https://github.com/mrclrchtr/supi/compare/v1.5.0...v1.6.0) (2026-05-22)


### Features

* **supi-review:** show reviewer prompt preview in colored confirmation dialog ([d6e4edd](https://github.com/mrclrchtr/supi/commit/d6e4edd8511fd57c39670dc2cec5ffa512119c76))


### Bug Fixes

* **ci:** use GitHub App token for release-please ([4d61d69](https://github.com/mrclrchtr/supi/commit/4d61d6955077c8d64dee20a7507303b8e2e64d5d))

## [1.5.0](https://github.com/mrclrchtr/supi/compare/v1.4.0...v1.5.0) (2026-05-21)


### Features

* **supi-ask-user:** add per-option notes to choice questions ([98f81bb](https://github.com/mrclrchtr/supi/commit/98f81bb378e255d86d7c95b3d5aff38c3c3d1fae))
* **supi-ask-user:** forward Ctrl+O to PI when overlay is open ([2a071e5](https://github.com/mrclrchtr/supi/commit/2a071e583958b2105b625dee08a9b6e38a8f37a5))


### Bug Fixes

* **lsp:** use partial core API mocks in unit tests ([c8fd85a](https://github.com/mrclrchtr/supi/commit/c8fd85a50fbb7d40e15c9df6616d7ca880b365b8))
* **packaging:** bundle meta-package runtime deps ([252b83b](https://github.com/mrclrchtr/supi/commit/252b83bd87f7f5b1ab4db7fc052bfa876364f575))
* **supi-ask-user:** wrap choice descriptions across multiple lines ([6aa8305](https://github.com/mrclrchtr/supi/commit/6aa8305728172732c0ae21dcfdaee8bdbbcf0944))

## [1.4.0](https://github.com/mrclrchtr/supi/compare/v1.3.1...v1.4.0) (2026-05-21)


### Features

* **supi-claude-md:** hide improver and revision skills from auto-invocation ([a5a563d](https://github.com/mrclrchtr/supi/commit/a5a563dc921ec218406ab85cb5f1879e76915758))
* **supi-context:** add guideline source attribution and per-tool snippet breakdown ([f71e3a1](https://github.com/mrclrchtr/supi/commit/f71e3a11d9888c358de43f90dbe13ba4810ee516))
* **supi-context:** add tool definition breakdown with full mode support ([86b66f3](https://github.com/mrclrchtr/supi/commit/86b66f3a15c82c074aa0543fa53bfa733846d55a))
* **supi-context:** redesign context usage report ([2b859af](https://github.com/mrclrchtr/supi/commit/2b859aff0ab6e3c0a20858ca58c51d842815edb1))
* **supi-context:** show instruction files, guideline details, and file origins ([c5574dd](https://github.com/mrclrchtr/supi/commit/c5574ddf23fde45ecbe2bedeac4340461298654b))
* **supi-extras:** add model-effort-colors footer extension ([5f31b99](https://github.com/mrclrchtr/supi/commit/5f31b99c275ccbe964b47cbaebeb18168c3496fe))
* **supi-review:** redesign around brief-driven review pipeline ([a28cf79](https://github.com/mrclrchtr/supi/commit/a28cf7987b47986ce4cb6f6c0b90e243a2a8b2a7))


### Bug Fixes

* **lsp:** harden request handling and config scope recovery ([a26aa91](https://github.com/mrclrchtr/supi/commit/a26aa91bef7aed419acb0b52ecab2a9cdb947395))
* **lsp:** normalize session path handling ([5146b2e](https://github.com/mrclrchtr/supi/commit/5146b2e3d4caa2ecd305a8ee29eb380d7c5e0d02))
* **pi:** tighten upgrade follow-up typings ([d7d4201](https://github.com/mrclrchtr/supi/commit/d7d4201ed59ab8ba549ef967c41784a44f7affb5))
* **pi:** upgrade framework deps and restore typecheck ([983de3c](https://github.com/mrclrchtr/supi/commit/983de3cce97f29ac0cd2f2eeec9b42c12693e458))
* **supi-ask-user:** wrap note text in renderNoteStatus to prevent TUI overflow crash ([f92cc17](https://github.com/mrclrchtr/supi/commit/f92cc17de3e990ab85397d5788711c419cb924f0))

## [1.3.1](https://github.com/mrclrchtr/supi/compare/v1.3.0...v1.3.1) (2026-05-17)


### Bug Fixes

* reference bundled pi dependency extensions in pi.extensions manifests ([ced114c](https://github.com/mrclrchtr/supi/commit/ced114c24ff68ca9995828664a5d1bbf6d88a672))

## [1.3.0](https://github.com/mrclrchtr/supi/compare/v1.2.0...v1.3.0) (2026-05-17)


### Features

* adopt explicit /api and /extension package surfaces across all published packages ([dc4dedf](https://github.com/mrclrchtr/supi/commit/dc4dedf664fa31a53c15bfe6c5592bd7a3e3c448))

## [1.2.0](https://github.com/mrclrchtr/supi/compare/v1.1.3...v1.2.0) (2026-05-17)


### Features

* **supi-claude-md:** remove re-injection after x turns ([0406c8d](https://github.com/mrclrchtr/supi/commit/0406c8d888133a807e462a14ccc59cd60cfb4565))


### Bug Fixes

* mark meta-package peer dep as optional to prevent koffi build failure ([af9564b](https://github.com/mrclrchtr/supi/commit/af9564bda3e8ae9b75a93a3d9aa4bb25735c88e1))

## [1.1.3](https://github.com/mrclrchtr/supi/compare/v1.1.2...v1.1.3) (2026-05-17)


### Bug Fixes

* mark pi-provided peer deps as optional via peerDependenciesMeta ([d9565c3](https://github.com/mrclrchtr/supi/commit/d9565c3341b0e1eca6a5afc8b4569fe560946cb5))

## [1.1.2](https://github.com/mrclrchtr/supi/compare/v1.1.1...v1.1.2) (2026-05-17)


### Bug Fixes

* **ci:** expand '.' to workspace packages in publish-released ([53f8553](https://github.com/mrclrchtr/supi/commit/53f8553c192b07fc9b54ebc0864af219452ce361))
* **ci:** sort imports alphabetically in publish-released ([9992982](https://github.com/mrclrchtr/supi/commit/99929829af9ac45479a7d74e9e230e1dabd24e46))

## [1.1.1](https://github.com/mrclrchtr/supi/compare/v1.1.0...v1.1.1) (2026-05-17)


### Bug Fixes

* **ci:** skip private packages in publish-released ([96697f3](https://github.com/mrclrchtr/supi/commit/96697f3c4a7165cdc98113d7d99877f4f66a6e49))

## [1.1.0](https://github.com/mrclrchtr/supi/compare/v1.0.0...v1.1.0) (2026-05-17)


### Features

* **code-intel:** ship bundled analysis improvements ([47ed970](https://github.com/mrclrchtr/supi/commit/47ed9704bd47da62aaf00a20bc13e5e12448a074))


### Bug Fixes

* **ci:** align release-please config coverage check with single-root config ([22ce1f8](https://github.com/mrclrchtr/supi/commit/22ce1f809e27abe7778a3c43642b35657f0d4849))
* resolve pre-existing test failures in pack-staged and concurrency guard ([747b788](https://github.com/mrclrchtr/supi/commit/747b788e2a7cc8bdb4975e55b20363fbcaf6bf46))
