# Changelog

## [6.0.1](https://github.com/mrclrchtr/supi/compare/v6.0.0...v6.0.1) (2026-08-28)


### Bug Fixes

* **deps:** update dependency typebox to v1.3.17 ([ba68b9d](https://github.com/mrclrchtr/supi/commit/ba68b9ddd5229ab13ca67c3868195c7d9bc0baf3))
* **deps:** update dependency typebox to v1.3.18 ([7da74dd](https://github.com/mrclrchtr/supi/commit/7da74dd3d1cf47f9775ce57ca16a73b9719d8b3d))
* **deps:** update dependency typebox to v1.3.19 ([ab236a4](https://github.com/mrclrchtr/supi/commit/ab236a407bb934f73f88a89723af23492e499484))
* **deps:** update dependency web-tree-sitter to v0.26.13 ([018d793](https://github.com/mrclrchtr/supi/commit/018d79369c03e74d6c726282fcf20171836c67c0))
* **deps:** update dependency web-tree-sitter to v0.26.13 ([d57096b](https://github.com/mrclrchtr/supi/commit/d57096b0fa6e40855ac33102bd2d215e1d337431))
* **deps:** update pnpm to v11.23.0 ([68d42fc](https://github.com/mrclrchtr/supi/commit/68d42fc75891d1ded33db41c0023811b97e79621))
* **deps:** update pnpm to v11.24.0 ([578d7b6](https://github.com/mrclrchtr/supi/commit/578d7b6f12cf839d1e47a5d2117afd347fa5576a))

## [6.0.0](https://github.com/mrclrchtr/supi/compare/v5.0.0...v6.0.0) (2026-08-25)


### ⚠ BREAKING CHANGES

* **review:** use explicit target source objects
* seven agent tools are renamed. Settings, agent profiles, scripts, or prompts that reference the old names must use debug, context_report, cache_forensics, agent_run, review_run, review_output, and review_audit instead.

### Features

* **code-intelligence:** include one-line manifest descriptions in the overview ([a2178c3](https://github.com/mrclrchtr/supi/commit/a2178c3095c3467d593e908e3e8a9a1fd6926fbe))
* **code-intelligence:** render tsconfig scope verdict in file-scope health output ([7c807ba](https://github.com/mrclrchtr/supi/commit/7c807ba146a351d14b809e949962065ead8d9291))
* **code-intelligence:** scope first-turn overview and drop unconditional next-query advice ([c8d6c38](https://github.com/mrclrchtr/supi/commit/c8d6c380b00660eae9829a030af8064da494cfa6))
* **debug:** expand supi-tooling-retro evidence and failure capture ([0083f9a](https://github.com/mrclrchtr/supi/commit/0083f9a32dd1756af04b39be2fe65bb36d9e6a9e))
* **lsp,code-intelligence:** discover new files on refresh and surface tsconfig scope decisions ([8e2e27c](https://github.com/mrclrchtr/supi/commit/8e2e27c476473b518e98d434a222b8f8b46cfce6))
* **lsp:** improve server handshake and incremental sync ([87ea23c](https://github.com/mrclrchtr/supi/commit/87ea23c536503be332a8cb2fe1b3556c8e17de74))
* **review:** use explicit target source objects ([25306c1](https://github.com/mrclrchtr/supi/commit/25306c16adda6dd5fc711023f724e84e72dcfb24))
* **skills:** add skill for writing commit messages ([aa632b0](https://github.com/mrclrchtr/supi/commit/aa632b06c52fa1abe5fa4c373f306b77f7ca42e5))


### Bug Fixes

* address review findings on result ownership and tool layout ([de4cd79](https://github.com/mrclrchtr/supi/commit/de4cd79138bbd070ad3830b57fdf668256cb7aec))
* **ask-user:** raise form height budget and fix scroll hints ([07ad301](https://github.com/mrclrchtr/supi/commit/07ad3013907cb779a08e60c753cd4a4c769acf8f))
* **ask-user:** register ask_user only in TUI sessions ([4bb63fa](https://github.com/mrclrchtr/supi/commit/4bb63fa7ee4f2d2e9c2e08f51a757d2b332401e0))
* **code-intelligence:** clarify semantic readiness timeouts ([62f2a8f](https://github.com/mrclrchtr/supi/commit/62f2a8f860d7f9c5e35b42f41909ad8e22e78433))
* **code-intelligence:** make the overview budget warning visible ([2d14eab](https://github.com/mrclrchtr/supi/commit/2d14eab64764e6526cc823656924b17e9bcedc0c))
* **code-intelligence:** remove wall-clock race from deterministic deadline tests ([d910fdf](https://github.com/mrclrchtr/supi/commit/d910fdfa9e73877101450e4b4455b68624715158))
* **code-intelligence:** reuse maintenance refresh in health recovery ([924a77f](https://github.com/mrclrchtr/supi/commit/924a77f9192d3ae023580729409220d6d86052e5))
* **deps:** lock file maintenance ([a698991](https://github.com/mrclrchtr/supi/commit/a6989911d63f717a882f8f6252c6065cd3cabea2))
* **deps:** lock file maintenance ([9c6c419](https://github.com/mrclrchtr/supi/commit/9c6c41946f375cb2649398f223e7ad47df6469f6))
* **deps:** update commitlint monorepo to v21.2.2 ([eb9d87f](https://github.com/mrclrchtr/supi/commit/eb9d87f10259fffde6319798e09e54067db761ba))
* **deps:** update dependency @biomejs/biome to v2.5.10 ([5e46ef4](https://github.com/mrclrchtr/supi/commit/5e46ef453c089135987fd2903209780b3236b6e8))
* **deps:** update dependency @biomejs/biome to v2.5.9 ([d448be3](https://github.com/mrclrchtr/supi/commit/d448be3e7674d73acfe347b8d14a252fbc37f6d3))
* **deps:** update dependency hk to v1.56.0 ([b10a460](https://github.com/mrclrchtr/supi/commit/b10a4600e0cbc174e5200e90c74edcd1268ac311))
* **deps:** update dependency hk to v1.56.1 ([edefd14](https://github.com/mrclrchtr/supi/commit/edefd147de416a306a09e015def9062a72ec0a3b))
* **deps:** update dependency typebox to v1.3.13 ([8775038](https://github.com/mrclrchtr/supi/commit/8775038beff6e31d21031230e713763dc049862b))
* **deps:** update dependency typebox to v1.3.15 ([dae1eba](https://github.com/mrclrchtr/supi/commit/dae1ebab42add3c7b1a4cad64220f28583f2bf1b))
* **deps:** update dependency typebox to v1.3.16 ([294f6c4](https://github.com/mrclrchtr/supi/commit/294f6c4fbf3800fc0cb1657a1e37052726309b4a))
* **deps:** update dependency typescript-language-server to v6 ([e38bd45](https://github.com/mrclrchtr/supi/commit/e38bd457d001b532ac2a271256b3527984fc2f1c))
* **deps:** update dependency vitest to v4.1.11 ([74921d1](https://github.com/mrclrchtr/supi/commit/74921d1f8049d46b36ec393e13920f14a5ad382d))
* **deps:** update pnpm to v11.22.0 ([c2bfb64](https://github.com/mrclrchtr/supi/commit/c2bfb64863e0e269be006ff08dff72cfbab085b5))
* **lsp:** extend push diagnostic reopen wait ([3a9dcaf](https://github.com/mrclrchtr/supi/commit/3a9dcafb6dd601f7973d73170101080af45818a7))
* **lsp:** handle server-requested diagnostic refresh ([4718d66](https://github.com/mrclrchtr/supi/commit/4718d66a16fb07dd804cd15ad19af10c5bdce574))
* **lsp:** include every tracked document in scope-decision telemetry ([197c3d5](https://github.com/mrclrchtr/supi/commit/197c3d51d9d647615db13997ab51fec219ca7e49))
* **lsp:** include files created after the first tsconfig parse on case-insensitive filesystems ([8288eaf](https://github.com/mrclrchtr/supi/commit/8288eaffd26faf184a6af2bda58545736397603e))
* **lsp:** invalidate cached tsconfig extends dependents ([ce3a24b](https://github.com/mrclrchtr/supi/commit/ce3a24bf3018082f045bde62a531d520c74905a6))
* **lsp:** keep code_health diagnostics coherent ([ba95f06](https://github.com/mrclrchtr/supi/commit/ba95f06673dac163632ad0c6807dd56c7545007c))
* **lsp:** rename reopen timing phase and bound server identity ([c8a4f42](https://github.com/mrclrchtr/supi/commit/c8a4f4230a4bec45e14472080fb596b6edf18ea3))
* **lsp:** require push diagnostic republishing ([bba9811](https://github.com/mrclrchtr/supi/commit/bba9811342b1f2417dac0b7dd03b3fad0080f1b7))
* **lsp:** retain unchanged documents in push refresh ([53254cc](https://github.com/mrclrchtr/supi/commit/53254cc37420fd02d1894d9fd2db3383bfc56b64))
* **lsp:** reuse current push diagnostic evidence ([63d280c](https://github.com/mrclrchtr/supi/commit/63d280cca4864d7af8387f4379fb8913435a026a))
* **lsp:** strengthen diagnostic evidence handling ([44dd1bd](https://github.com/mrclrchtr/supi/commit/44dd1bde5857911b5f44943f1ef2ef03abb170cd))
* **lsp:** tighten tsconfig extends cache coverage ([f15642c](https://github.com/mrclrchtr/supi/commit/f15642cc848cae7cdfea189b8ada6c1591cb7700))
* **orientation:** reduce instruction revision noise ([f655ffc](https://github.com/mrclrchtr/supi/commit/f655ffcd9eec916fcece3a70b1c03b4f93065eb7))
* **review:** break schema cycle that corrupted review_output parameters ([46e3503](https://github.com/mrclrchtr/supi/commit/46e3503674a4e3e7fa2f14971659a9bf1f26704f))
* **skill-patches:** generate canonical patch text ([106612b](https://github.com/mrclrchtr/supi/commit/106612b6b063580408960509e078ab1d11ea93fe))
* **skills:** include commit skill in generated mirror ([957a823](https://github.com/mrclrchtr/supi/commit/957a823057306901a59962e61675820f682aec31))
* **supi-review:** make clean reviews pass and paths placement explicit ([886e81e](https://github.com/mrclrchtr/supi/commit/886e81e1069ffe3848acea010a561f2b43770bb3))
* **web:** break spec/execute cycle in web_fetch_md ([8c20599](https://github.com/mrclrchtr/supi/commit/8c2059926b9450ed0b4e455f86964e5e3822b3fc))


### Code Refactoring

* drop supi_ prefix from tool names and add naming rules ([4f88da0](https://github.com/mrclrchtr/supi/commit/4f88da0497539ba1c9c14786f78149b3d574913f))

## [5.0.0](https://github.com/mrclrchtr/supi/compare/v4.10.0...v5.0.0) (2026-08-15)


### ⚠ BREAKING CHANGES

* **supi-review:** unify exact-target review flow
* **supi-agent-runtime:** @mrclrchtr/supi-agent-runtime/api no longer exports internal builders, collectors, limits, grace constants, or sanitizers. The package-root barrel is removed.

### Features

* **agent:** bound the aggregate delegation result ([cde1008](https://github.com/mrclrchtr/supi/commit/cde10082ccc22e5c6609daee51e9d9541c89ce2b))
* **cache:** bound forensics output with a summary envelope ([6f1fd68](https://github.com/mrclrchtr/supi/commit/6f1fd68a6bfc6ab2b589300cb5150d651d930ed7))
* **code-intelligence:** propagate tool signal and deadline through workflows ([caeb4d3](https://github.com/mrclrchtr/supi/commit/caeb4d38959a08383b05ef320623e2360d47a675))
* **code-runtime:** expand providers with request control ([df26327](https://github.com/mrclrchtr/supi/commit/df263271430bf3bfa1431db7d1060c0064ca7894))
* **debug:** correlate public code operations ([4e46368](https://github.com/mrclrchtr/supi/commit/4e46368d6a8a19aa24f63d1a65bb49592d6dc8a1))
* **debug:** ship supi-tooling-retro as installable prompt template ([24dfb43](https://github.com/mrclrchtr/supi/commit/24dfb43514801b1a50a627a9d5c12cc73f5816b2))
* gate agent-facing tools behind per-package settings ([fd192d4](https://github.com/mrclrchtr/supi/commit/fd192d463e400ece14eb87f5596092ed993e04ac))
* **lsp:** cancel diagnostic recovery mid-pass ([d3409d2](https://github.com/mrclrchtr/supi/commit/d3409d2a47e90e39a0aeb68522a7e27630543a40))
* **lsp:** cancel semantic requests, readiness, and diagnostic waits ([07fa4cb](https://github.com/mrclrchtr/supi/commit/07fa4cb24d9b357a8b3a74c4e5bac233c487cc86))
* **lsp:** expand LSP debug telemetry identity ([96503f1](https://github.com/mrclrchtr/supi/commit/96503f1b7325ed37b6fe56004d513987e0e0847d))
* **lsp:** publish lifecycle transitions ([ccad1da](https://github.com/mrclrchtr/supi/commit/ccad1da203dda2ca05a886d3c5be2ec0dd9b8976)), closes [#312](https://github.com/mrclrchtr/supi/issues/312)
* **lsp:** recover push-only diagnostics after invalidation ([e7871a3](https://github.com/mrclrchtr/supi/commit/e7871a3f36d5a3a5ab2585ca22b907a85519fbd6))
* **lsp:** track exact diagnostic evidence coverage ([892cb1f](https://github.com/mrclrchtr/supi/commit/892cb1f9aaf57360a7d30f5be1ac3ed34c843cd1))
* **settings:** apply Agent and Review settings without reload ([4b8d29c](https://github.com/mrclrchtr/supi/commit/4b8d29cdd6894e7a1a2dbb83b29ba9ea4ed35d7a))
* **settings:** group Agent Profile settings ([69d575a](https://github.com/mrclrchtr/supi/commit/69d575a4c87fdb6425833afa2c7a62e31f15c5b3))
* **skills:** improve model invocation config schema ([45b75a4](https://github.com/mrclrchtr/supi/commit/45b75a4235ab8cf213554e3cd55791e1371ae904))
* **supi-agent-runtime:** extract neutral Agent Run lifecycle ([d45ec38](https://github.com/mrclrchtr/supi/commit/d45ec38bb3b9aacad380f90e8629d24323a6e8f9))
* **supi-agent:** add Agent Runs overlay ([ec0fd9e](https://github.com/mrclrchtr/supi/commit/ec0fd9e29c357dca29a6ecd884aeff2ac7654471)), closes [#271](https://github.com/mrclrchtr/supi/issues/271)
* **supi-agent:** add foreground delegation tool with bounded rendering ([cd3c968](https://github.com/mrclrchtr/supi/commit/cd3c9689a538658a6cbffab75f8fa2e6c72ffa70))
* **supi-agent:** add profile overlays and settings ([28c6148](https://github.com/mrclrchtr/supi/commit/28c61483db93740e6aa0eba76ef9494d68723ba0))
* **supi-agent:** record Agent Run timing telemetry ([33e2e0d](https://github.com/mrclrchtr/supi/commit/33e2e0da2ec94d61df7251df55a7a7e7776b5c96))
* **supi-agents:** add profile catalogue and resource policy ([f2cf9a5](https://github.com/mrclrchtr/supi/commit/f2cf9a522c4b3bdabe37c6ce93b70c9902d8f9a4))
* **supi-agent:** show field-level profile provenance in /agents ([f138714](https://github.com/mrclrchtr/supi/commit/f138714a6639af0c807b3f417f711a1b821c3b95))
* **supi-review:** add replay outline navigation ([b747863](https://github.com/mrclrchtr/supi/commit/b747863542b6e104f60cd14b3ebc86c43227deb1))
* **supi-review:** gate fixing policies on finding applicability ([7674c6e](https://github.com/mrclrchtr/supi/commit/7674c6ed698e07efbcbdcd14f8c27b268460873a))
* **supi-review:** recover structured reviewer submissions ([42984fa](https://github.com/mrclrchtr/supi/commit/42984fa6a401ef212c521a08c8d290720e9c38d6))
* **supi-review:** unify exact-target review flow ([c1c7063](https://github.com/mrclrchtr/supi/commit/c1c7063af696e6dfa4e57dd2f0abc937a693e10f))
* **tree-sitter:** cancel structural operations ([71a4ff2](https://github.com/mrclrchtr/supi/commit/71a4ff2ea0399589b563b26b83bc45ec15a3fee9))
* **tree-sitter:** isolate structural work in a worker ([0f5197b](https://github.com/mrclrchtr/supi/commit/0f5197bbabb5c7176f5331ede49e1e92a16c2bd1))
* **tree-sitter:** reuse parsed files and queries ([0d2bad7](https://github.com/mrclrchtr/supi/commit/0d2bad72c8e97987cd862f5869923ea65b0ec4e1)), closes [#310](https://github.com/mrclrchtr/supi/issues/310)


### Bug Fixes

* **ask-user:** scroll overflowing decision forms ([e545b56](https://github.com/mrclrchtr/supi/commit/e545b564e71590c7966143b7de7dee485904aef7))
* **code-intelligence:** clarify provider evidence ([06ac04f](https://github.com/mrclrchtr/supi/commit/06ac04fbac2f2eb82eecaf5c132486f645f095bc))
* **code-intelligence:** constrain semantic mutation roots ([2e07ece](https://github.com/mrclrchtr/supi/commit/2e07ece391c32d6d479790f764980684f444ae52)), closes [#305](https://github.com/mrclrchtr/supi/issues/305)
* **code-intelligence:** improve tool transcript rendering ([0a893a3](https://github.com/mrclrchtr/supi/commit/0a893a3b052bf6d469424e75989c6595847f28c6))
* **code-intelligence:** normalize semantic edits fail closed ([46d5bc5](https://github.com/mrclrchtr/supi/commit/46d5bc5d8ee6d0ab5428814a26a898afce4e8502)), closes [#304](https://github.com/mrclrchtr/supi/issues/304)
* **debug:** render and bound debug tool output ([411fb49](https://github.com/mrclrchtr/supi/commit/411fb492ac68508f5d7c4dbaba375448fedb1acf))
* **deps:** refresh rebased lockfile ([96aa6d6](https://github.com/mrclrchtr/supi/commit/96aa6d63c7cfb4aac1609892e71f67a024bbcc4f))
* **deps:** update dependency @biomejs/biome to v2.5.8 ([1c50a4e](https://github.com/mrclrchtr/supi/commit/1c50a4e352fcbb7e66bd63d1ece83b67c95afd6a))
* **deps:** update dependency typebox to v1.3.12 ([ce4e64a](https://github.com/mrclrchtr/supi/commit/ce4e64a2bfb2094c27601d3b70f8a9c2856426f5))
* **lsp:** confirm push-only diagnostic evidence without restarting clients ([14baa17](https://github.com/mrclrchtr/supi/commit/14baa178827784a7282feb60b85b3a0610358f0f))
* **lsp:** correct conditional pull-diagnostic configuration ([4b4cd8e](https://github.com/mrclrchtr/supi/commit/4b4cd8eafbc5a8c31aabad6d906bb05ab5118e31)), closes [#321](https://github.com/mrclrchtr/supi/issues/321)
* **lsp:** model work-done progress readiness as pending-create ([9064cda](https://github.com/mrclrchtr/supi/commit/9064cda72a491806ff921d4532e9c15bd54afeec))
* **lsp:** preserve diagnostic freshness ([6f7dc42](https://github.com/mrclrchtr/supi/commit/6f7dc42ed41f3d78d5b641d4b1843e25b43463e5))
* **lsp:** require fresh diagnostic evidence ([9c9833a](https://github.com/mrclrchtr/supi/commit/9c9833a0f04834a3ccaf310af9e2e01b65ad2751)), closes [#306](https://github.com/mrclrchtr/supi/issues/306)
* sever terminal callback and history helper references ([368b043](https://github.com/mrclrchtr/supi/commit/368b043f5bee490d1e7837dfc441835f2fdfd98c))
* **supi-agent-runtime:** add the package-root barrel ([ddaec90](https://github.com/mrclrchtr/supi/commit/ddaec90a8d1cf8ab9f72ab7d263a697fe92b6cc5))
* **supi-agent-runtime:** align new package version with workspace release ([41e5234](https://github.com/mrclrchtr/supi/commit/41e5234986004e5e28f7d6c3981100cf58d1781a))
* **supi-agent-runtime:** bound cancellation and completion waits ([e957da9](https://github.com/mrclrchtr/supi/commit/e957da9e4766196f032a47df042632d277712ad9))
* **supi-agent-runtime:** close final diagnostic gaps ([6429147](https://github.com/mrclrchtr/supi/commit/642914797b4ee2470e53ad563cb3436c06359f91))
* **supi-agent-runtime:** close usage and callback isolation gaps ([fcceb74](https://github.com/mrclrchtr/supi/commit/fcceb7459fd4ad2363030c3c3a6d5c51427dc412))
* **supi-agent-runtime:** finish review hardening ([50cea4b](https://github.com/mrclrchtr/supi/commit/50cea4b9657f780afc61a09e869af251a904fd19))
* **supi-agent-runtime:** harden lifecycle teardown and diagnostics ([4ca93df](https://github.com/mrclrchtr/supi/commit/4ca93df03d2d5caf0fa1030831f7a838c52eb2f2))
* **supi-agent-runtime:** harden local child run lifecycle ([4862a0f](https://github.com/mrclrchtr/supi/commit/4862a0fbaa9a59a013a1b6213105988a86294a42))
* **supi-agent-runtime:** preserve PI lifecycle semantics ([574b0ad](https://github.com/mrclrchtr/supi/commit/574b0ad4ff4d5e2c78adf03b21db61db23a4cd35))
* **supi-agent-runtime:** retain reviewer tool-error progress ([f321c6d](https://github.com/mrclrchtr/supi/commit/f321c6d9af7d7fef3871233d4af969cf6ea15506))
* **supi-agent-runtime:** serialize cancellation races safely ([dd48fde](https://github.com/mrclrchtr/supi/commit/dd48fde21ddff5029d8dd5c5a9fd8ec16a833734))
* **supi-agent-runtime:** support nullable Pi headers ([8393c42](https://github.com/mrclrchtr/supi/commit/8393c4223ca460b9d906b458bdc2b5a29871323e))
* **supi-agent-runtime:** tighten redaction and callback boundaries ([ba47029](https://github.com/mrclrchtr/supi/commit/ba47029f18f06f2a313a75e25a658c15364ba25e))
* **supi-agent:** harden Agent Run rendering bounds ([66dc23b](https://github.com/mrclrchtr/supi/commit/66dc23b83b4340bfbeeb48c7b71000d952afa6a3))
* **supi-agent:** keep invalid profiles out of the effective catalogue ([2565f96](https://github.com/mrclrchtr/supi/commit/2565f965fb2652b0e7e7445d4075e70b917173cb))
* **supi-agent:** preserve missing child completion as failure ([b4ac1a5](https://github.com/mrclrchtr/supi/commit/b4ac1a568eda9fad7b0f691e9c2c8a3919a3ab93))
* **supi-agent:** record failed Agent Run diagnostics ([64dca68](https://github.com/mrclrchtr/supi/commit/64dca68dffb211bba6515bb711e40f1e07df7fce))
* **supi-agent:** redact spaced and quoted bash secrets in previews ([3d28817](https://github.com/mrclrchtr/supi/commit/3d288172f48c83ecc56b1b3d7dde741957eedd73))
* **supi-agent:** sharpen Explorer evidence policy ([b94cf1b](https://github.com/mrclrchtr/supi/commit/b94cf1b37259495fccfcae917a561a87873e98b5))
* **supi-agent:** show profile IDs in settings ([ea85e77](https://github.com/mrclrchtr/supi/commit/ea85e77a5d43364f91818dc3cf9f65c82b419433))
* **supi-agent:** store shared context once per Delegation Batch ([cb04d22](https://github.com/mrclrchtr/supi/commit/cb04d222b5faa8a1e85a73312391858c2195bfc8))
* **supi-review:** capture audit replay before run teardown ([3435390](https://github.com/mrclrchtr/supi/commit/3435390da3bfce1095aa6bc89fe18966ebbe4424))
* **supi-review:** defer tool sync until session start ([9e2e193](https://github.com/mrclrchtr/supi/commit/9e2e1939ac492011646b37d43a0082df625741aa))
* **supi-review:** harden exact review flow ([8f9972d](https://github.com/mrclrchtr/supi/commit/8f9972dcedbab23ca8a23de345d40d7dd9148be8))
* **supi-review:** tighten exact review contracts ([0d60de7](https://github.com/mrclrchtr/supi/commit/0d60de73d6daa498031855f6100f4ebb85d266dc))
* **tree-sitter:** fence runtime startup races ([6b0f08c](https://github.com/mrclrchtr/supi/commit/6b0f08c35c3f64a2e04bd4e1e9f3454cdefc55c5))


### Code Refactoring

* **supi-agent-runtime:** narrow public interface ([791e40f](https://github.com/mrclrchtr/supi/commit/791e40f2a0a231d0b40aa19b2e82b3c6e8f0ea05))

## [4.10.0](https://github.com/mrclrchtr/supi/compare/v4.9.0...v4.10.0) (2026-08-12)


### Features

* **code-intelligence:** add substrate performance baselines ([90238b7](https://github.com/mrclrchtr/supi/commit/90238b702ba2c170e5cd9a9f9b8168aea2c3355c)), closes [#302](https://github.com/mrclrchtr/supi/issues/302)
* **skills:** publish adapted skills through skills.sh ([372e0bc](https://github.com/mrclrchtr/supi/commit/372e0bc9684f1610723ccba61b52e40c60e7529f))
* **skills:** use ask_user for grilling rounds ([931c9e4](https://github.com/mrclrchtr/supi/commit/931c9e44384cfbee1db320b3d67cac83d9f70f30))


### Bug Fixes

* **code-intelligence:** follow LSP text-edit rules ([ab4dd5e](https://github.com/mrclrchtr/supi/commit/ab4dd5e5a2d35b456eaa37a434f64440a51c9472)), closes [#303](https://github.com/mrclrchtr/supi/issues/303)
* **deps:** update dependency hk to v1.55.0 ([0e91e67](https://github.com/mrclrchtr/supi/commit/0e91e6781f2a6431a5d1dfa1f4f39f9008b536f0))
* **deps:** update dependency tree-sitter-cli to v0.26.12 ([b9fe9a6](https://github.com/mrclrchtr/supi/commit/b9fe9a6dab34ce905dab77507a632fb4e59cf961))
* **deps:** update dependency web-tree-sitter to v0.26.12 ([bd76fc3](https://github.com/mrclrchtr/supi/commit/bd76fc37d3cdc7422e1cbc35bbe2003a2e6bd455))
* **deps:** update dependency web-tree-sitter to v0.26.12 ([52b9d34](https://github.com/mrclrchtr/supi/commit/52b9d345df1069301d84f48b6b7f70b49c4e7d66))
* **deps:** update pnpm to v11.21.0 ([00a45ff](https://github.com/mrclrchtr/supi/commit/00a45ff72dd4196ff887757c7105c929ffe68ed7))
* **settings:** keep skills section last ([ca765d7](https://github.com/mrclrchtr/supi/commit/ca765d7ea6167e96e824c4f6476b412f6d8c3b8c))
* **settings:** stabilize settings menu height ([6a481e4](https://github.com/mrclrchtr/supi/commit/6a481e48497668681ebc6bdf94e55ca8eee5295a))
* **skills:** sync generated patch hash ([80b2e1b](https://github.com/mrclrchtr/supi/commit/80b2e1b8c0a36b82d83d9c51760f3a01a1a9ffb3))
* **skills:** sync generated patch hash ([3c27c21](https://github.com/mrclrchtr/supi/commit/3c27c21277815bb73d3aaf1c74c5774d73ef9757))
* **tree-sitter:** refresh CLI metadata ([2a7e897](https://github.com/mrclrchtr/supi/commit/2a7e897721a6b7e1d95c970990ce2d2a50ec8fd0))

## [4.9.0](https://github.com/mrclrchtr/supi/compare/v4.8.0...v4.9.0) (2026-08-11)


### Features

* **debug:** add generic operation timing ([2e52016](https://github.com/mrclrchtr/supi/commit/2e52016c6086581cf69ece6e4f9f43896118677b))
* **supi-prompt-suggestions:** accept suggestion with Tab ([ff837d5](https://github.com/mrclrchtr/supi/commit/ff837d5b52a58a1cb1de0215489789465db035ce)), closes [#295](https://github.com/mrclrchtr/supi/issues/295)

## [4.8.0](https://github.com/mrclrchtr/supi/compare/v4.7.0...v4.8.0) (2026-08-10)


### Features

* **prompt-suggestions:** restore suppressed suggestions ([db733b8](https://github.com/mrclrchtr/supi/commit/db733b8d6809ff5f8e021ffeed2d2ae7fc615b2b))
* **settings:** group settings in unified UI ([d925939](https://github.com/mrclrchtr/supi/commit/d925939a6c8c837b100b79ff268986f8f48055cc))
* **skills:** add scoped skill management ([c078a8d](https://github.com/mrclrchtr/supi/commit/c078a8d52bcac396801fb8e83aa8bb0cc4f3c021))


### Bug Fixes

* **ask-user:** wrap mini-box body text ([2c018ae](https://github.com/mrclrchtr/supi/commit/2c018ae154c46bc73f03f7369e5f97d3b676ccd0))
* **deps:** lock file maintenance ([bd7be34](https://github.com/mrclrchtr/supi/commit/bd7be34f77dd61969374dc55a42fae9bccf1f3fe))
* **deps:** update dependency @types/jsdom to v30 ([f81eb14](https://github.com/mrclrchtr/supi/commit/f81eb147056644901742896b6a4e83cd9433897c))
* **deps:** update dependency typebox to v1.3.11 ([0c04150](https://github.com/mrclrchtr/supi/commit/0c041506e1a7f72d0f0b2f62b6d893601fa42f15))
* **deps:** update pi to v0.84.1 ([84bf770](https://github.com/mrclrchtr/supi/commit/84bf770ab35b1c6d64d86dcaeded2724761e0f98))
* **prompt-suggestions:** wrap full ghost suggestions ([81169c1](https://github.com/mrclrchtr/supi/commit/81169c1b173d23b6c7f18c2afab36923c31bf882))
* **skills:** use package name for config section ([5e287e8](https://github.com/mrclrchtr/supi/commit/5e287e8f4e5ec0fb17bdf7f78c3d9699deef15e5))
* **web:** validate fetch timeout range ([8d192e8](https://github.com/mrclrchtr/supi/commit/8d192e808fbe360211b23045f9b6255605a1793e))

## [4.7.0](https://github.com/mrclrchtr/supi/compare/v4.6.0...v4.7.0) (2026-08-07)


### Features

* **supi-review:** add Current-State Audit ([59eedac](https://github.com/mrclrchtr/supi/commit/59eedaca20cf1636b37e02b2acde21dbbc13e7b4))


### Bug Fixes

* comply with biome 2.5.7 useNullishCoalescing rule ([ab2816b](https://github.com/mrclrchtr/supi/commit/ab2816b7e4ca487fbb76cc9cbc02c4ca5fd5c5ec))
* **deps:** lock file maintenance ([f5ffcbc](https://github.com/mrclrchtr/supi/commit/f5ffcbc0348fa5dcdebadbe0f0d88b4004db1aed))
* **deps:** update dependency @biomejs/biome to v2.5.7 ([6686752](https://github.com/mrclrchtr/supi/commit/66867529a0121370df98cec18ab2e188867f26b9))
* **deps:** update dependency hk to v1.54.1 ([d99fc3e](https://github.com/mrclrchtr/supi/commit/d99fc3ed2abd991696cd9be5d57c09a91eb4dee0))
* **prompt-suggestions:** declare pi core packages as peer deps ([c95d177](https://github.com/mrclrchtr/supi/commit/c95d1779b697647877e760c79fbbe2059bfa310e)), closes [#282](https://github.com/mrclrchtr/supi/issues/282)

## [4.6.0](https://github.com/mrclrchtr/supi/compare/v4.5.1...v4.6.0) (2026-08-04)


### Features

* **supi-debug:** inspect persisted session events ([baeba47](https://github.com/mrclrchtr/supi/commit/baeba476337cffa4b1049b51c422a9340aa87d0e))

## [4.5.1](https://github.com/mrclrchtr/supi/compare/v4.5.0...v4.5.1) (2026-08-04)


### Bug Fixes

* **deps:** lock file maintenance ([76f8af2](https://github.com/mrclrchtr/supi/commit/76f8af2f6ac760fbf02b88c01817e494d2ad1fd0))

## [4.5.0](https://github.com/mrclrchtr/supi/compare/v4.4.0...v4.5.0) (2026-08-04)


### Features

* **supi-review:** prefer managed reviews ([6516145](https://github.com/mrclrchtr/supi/commit/6516145be9cb6bb37c7d7a3b133665b2ca86f29a))


### Bug Fixes

* **deps:** lock file maintenance ([a6bfbfb](https://github.com/mrclrchtr/supi/commit/a6bfbfb628ba009bb98b8f01c3d0f173202d5536))
* **deps:** lock file maintenance ([803a963](https://github.com/mrclrchtr/supi/commit/803a96366a16851a6c27b384cb6241cefbc18239))
* **deps:** update dependency @biomejs/biome to v2.5.6 ([068972c](https://github.com/mrclrchtr/supi/commit/068972cfd1dfaf9cdf479ea982205766c40b691a))
* **deps:** update dependency hk to v1.54.0 ([29b41e9](https://github.com/mrclrchtr/supi/commit/29b41e9cb73ecffb7a5bebf83ee188fb455f1e11))
* **deps:** update dependency tree-sitter to v0.25.1 ([1776667](https://github.com/mrclrchtr/supi/commit/17766677ba32627909419e96ea46a61cbbb7edd6))
* **deps:** update dependency typebox to v1.3.10 ([96c05b3](https://github.com/mrclrchtr/supi/commit/96c05b33efd6915253ec93f6250238488f40d131))
* **deps:** update pnpm to v11.18.0 ([41bfe25](https://github.com/mrclrchtr/supi/commit/41bfe254239d31190ee8cdb5a3735f27ee2d9563))
* **deps:** update pnpm to v11.19.0 ([3e175f2](https://github.com/mrclrchtr/supi/commit/3e175f2af35da8eae584731e8232aeccc3b1c467))
* **deps:** update pnpm to v11.20.0 ([d7487cf](https://github.com/mrclrchtr/supi/commit/d7487cf38b4c2b6deed63091caf41673ef960a74))
* **deps:** update pnpm/action-setup action to v6.0.10 ([3406b6f](https://github.com/mrclrchtr/supi/commit/3406b6fded3ebd6356a34d9004ec3e9dc6332637))
* **hk:** run commitlint via pnpm exec ([c0e6e82](https://github.com/mrclrchtr/supi/commit/c0e6e82e6fe892ad2bb99a58005097220324b415))
* mark intentional fire-and-forget promises for biome 2.5.6 ([76634ae](https://github.com/mrclrchtr/supi/commit/76634ae747a1814790b0448d4c61386adba52fbf))
* **scripts:** approve local installs and surface command failures ([c3718ac](https://github.com/mrclrchtr/supi/commit/c3718ac420eef3008a6689f42a4e4e254dcfae60))

## [4.4.0](https://github.com/mrclrchtr/supi/compare/v4.3.0...v4.4.0) (2026-07-30)


### Features

* **supi-review:** configure post-review agent behavior ([75359e3](https://github.com/mrclrchtr/supi/commit/75359e38c74a92917794c92cdb061df99371be69))


### Bug Fixes

* **deps:** update dependency jsdom to v30 ([5547f8a](https://github.com/mrclrchtr/supi/commit/5547f8af880ec2551966fd025df522679734f439))

## [4.3.0](https://github.com/mrclrchtr/supi/compare/v4.2.0...v4.3.0) (2026-07-30)


### Features

* **supi-code-intelligence:** show live LSP server states in footer ([e0ce64b](https://github.com/mrclrchtr/supi/commit/e0ce64b0690a71345bfc621d4c75aedc0eeb4849))


### Bug Fixes

* **supi-review:** avoid duplicate Code Intelligence tools ([50c6190](https://github.com/mrclrchtr/supi/commit/50c619007d85c836935ae373466128062dc042b0))

## [4.2.0](https://github.com/mrclrchtr/supi/compare/v4.1.0...v4.2.0) (2026-07-29)


### Features

* make code-intelligence overview comprehensive ([e095cdf](https://github.com/mrclrchtr/supi/commit/e095cdfea0d9caca65f434496db7ccff09a6f89b))
* **supi-extras:** add cross-worktree session cloning ([fdea663](https://github.com/mrclrchtr/supi/commit/fdea66359f2c0ec268dd96b3c778f358db852c53))
* **supi-tree-sitter:** add C and JVM outline support ([73d62d3](https://github.com/mrclrchtr/supi/commit/73d62d340c0fc06eb315efeae4d4e4beba426c5b))
* **supi-tree-sitter:** add HTML and SQL outline support ([290a0c1](https://github.com/mrclrchtr/supi/commit/290a0c1f90c0b25948efd3f06c26a919fc87d00f))
* **supi-tree-sitter:** add scripting outline support ([e4a4e27](https://github.com/mrclrchtr/supi/commit/e4a4e27a4e994c094bd1c6ca3e6a2975209adcb2))
* **supi-tree-sitter:** expand polyglot outline support ([ff951f1](https://github.com/mrclrchtr/supi/commit/ff951f1c00fa601f2dfb39291464342b8f7776fe))


### Bug Fixes

* align code intelligence language compatibility ([75a6b1e](https://github.com/mrclrchtr/supi/commit/75a6b1e258e3493c9f2e993ecfe85c931635519e))
* **supi-ask-user:** decode Unicode escapes in display text ([ed4671f](https://github.com/mrclrchtr/supi/commit/ed4671f304ae833265ba88c43448617f0f20a127))
* **supi-code-intelligence:** add recovery hints to symbol-not-found errors ([5aff058](https://github.com/mrclrchtr/supi/commit/5aff058f66be2a7fa40d408922dba48a4b6aeb88))
* **supi-code-intelligence:** skip tool registration when already loaded ([62650fb](https://github.com/mrclrchtr/supi/commit/62650fb2ab9821b44f2728de4c229efae06acc93))
* **supi-code-intelligence:** use WeakSet guard instead of getAllTools ([f068a32](https://github.com/mrclrchtr/supi/commit/f068a32ca80a6e7887304da89ef34b4744661cf5))

## [4.1.0](https://github.com/mrclrchtr/supi/compare/v4.0.0...v4.1.0) (2026-07-29)


### Features

* **supi-review:** add configurable review bootstrap ([4418130](https://github.com/mrclrchtr/supi/commit/441813048edc047784eb026edaea200f308564f9))
* **supi-review:** add local reviewer replay audits ([05c6b83](https://github.com/mrclrchtr/supi/commit/05c6b83a5b2d84f91074bb2803a0b6e870c90513))
* **supi-review:** distinguish advisory review findings ([fb5c6fb](https://github.com/mrclrchtr/supi/commit/fb5c6fb24ac7c9d1fc734eb4c1529ea3ba627cfd))
* **supi-review:** enrich collapsed review results ([#252](https://github.com/mrclrchtr/supi/issues/252)) ([9d6e33f](https://github.com/mrclrchtr/supi/commit/9d6e33f230f2c87ff6cf79e16d2000dd3ab971f7))
* **supi-review:** improve agent tool schemas ([665b502](https://github.com/mrclrchtr/supi/commit/665b502c7bd1a799ccc04179fc3eabbde5464f4c))
* **supi-review:** improve tool output rendering ([596a1ed](https://github.com/mrclrchtr/supi/commit/596a1ed46146fd7f78f512939421368519f69b35))
* **supi-review:** refine reviewer finding scopes ([4721e50](https://github.com/mrclrchtr/supi/commit/4721e50c61bbb74dedb95d4bba56ecf75086f72b))
* **supi-review:** run reviewers in frozen workspaces ([#252](https://github.com/mrclrchtr/supi/issues/252)) ([4f25660](https://github.com/mrclrchtr/supi/commit/4f2566057a991d3cc1a54b4cf5a908c8f60efea9))
* **supi-review:** show running review details ([#252](https://github.com/mrclrchtr/supi/issues/252)) ([dddf507](https://github.com/mrclrchtr/supi/commit/dddf50771a6e21824b659275ca51e899f378422b))


### Bug Fixes

* approve local package uninstalls ([0fd75f9](https://github.com/mrclrchtr/supi/commit/0fd75f99c533ad3ac8c5504d26d4924a230e4fe0))
* harden review runtime contracts ([7433898](https://github.com/mrclrchtr/supi/commit/7433898b5b5555796108b61cea9633f8ad43ae1f))

## [4.0.0](https://github.com/mrclrchtr/supi/compare/v3.2.0...v4.0.0) (2026-07-29)


### ⚠ BREAKING CHANGES

* **supi-code-intelligence:** The code_* family is now eight tools with nested exact-one target selectors and closed one-key schemas. code_impact is removed. code_graph exposes only references, structural callees, and implementations. Flat targetId/file/line/character/symbol fields are retired without aliases.

### Features

* **supi-code-intelligence:** deepen session and LSP runtime, remove code_impact ([eaebb8a](https://github.com/mrclrchtr/supi/commit/eaebb8a6be2563190e150a33bfaa1d1d8f827f67))
* **supi-code-intelligence:** narrow code_find to code-aware search ([a895c47](https://github.com/mrclrchtr/supi/commit/a895c476ea0e11f8e0ded5290f4ea4bf658b59fa)), closes [#203](https://github.com/mrclrchtr/supi/issues/203)
* **supi-code-intelligence:** remove ambient diagnostics and built-in tool overrides ([1eacb06](https://github.com/mrclrchtr/supi/commit/1eacb06ab9d2d6de42aae7c84473860772ed0864)), closes [#207](https://github.com/mrclrchtr/supi/issues/207)
* **supi-code-intelligence:** restrict health to live observations ([3efddab](https://github.com/mrclrchtr/supi/commit/3efddab3e8fdb20ebba219b998e7c2b94c486309)), closes [#199](https://github.com/mrclrchtr/supi/issues/199)
* **supi-code-intelligence:** show diagnostic messages in detailed code_health ([8cefacf](https://github.com/mrclrchtr/supi/commit/8cefacfd706c3b78006d2d23d8bf7ad2441ad9b0))


### Bug Fixes

* harden trust, paths, timers, coordinates, and refactor application ([8cb3088](https://github.com/mrclrchtr/supi/commit/8cb3088b5462d777a7c11a0f08a097d79bb8f358))
* harden trust, paths, timers, coordinates, and refactor application ([28027d2](https://github.com/mrclrchtr/supi/commit/28027d2338a45001c25960d7a069e7ef94a9641d))
* **supi-code-intelligence:** assemble requested health evidence ([5af08f0](https://github.com/mrclrchtr/supi/commit/5af08f0ff848ba14dbfbc5fa80d8fdc5713bba1e)), closes [#187](https://github.com/mrclrchtr/supi/issues/187)
* **supi-code-intelligence:** avoid duplicate resolve error prefixes ([fe69382](https://github.com/mrclrchtr/supi/commit/fe6938205bcc170a0c3c7f3022e402ade3c5df72))
* **supi-code-intelligence:** correct live tool edge cases ([5cf94f3](https://github.com/mrclrchtr/supi/commit/5cf94f36b703946b07a00576782d24fdb710587c))
* **supi-code-intelligence:** correct refactor tool reporting ([62b89b6](https://github.com/mrclrchtr/supi/commit/62b89b6a93646610a2fce4742ba4485aac3244ac))
* **supi-code-intelligence:** correct target and health evidence ([6a049dc](https://github.com/mrclrchtr/supi/commit/6a049dc19872bafae171adb9d3aaf9957b60635d))
* **supi-code-intelligence:** harden code evidence contracts ([72e398d](https://github.com/mrclrchtr/supi/commit/72e398d4c35edb9827c6359a0293baabca374569))
* **supi-code-intelligence:** import token budget utils, handle refactor-apply recovery ([df806f3](https://github.com/mrclrchtr/supi/commit/df806f3d472381b039907fe546830c7182981088))
* **supi-code-intelligence:** make AST scans operation-aware ([e7edaa7](https://github.com/mrclrchtr/supi/commit/e7edaa777f65498841853b5b0814ae0166901065))
* **supi-code-intelligence:** make point inspection truthful ([4a35a93](https://github.com/mrclrchtr/supi/commit/4a35a9395ecb5a0617659a585670260438f7046b)), closes [#209](https://github.com/mrclrchtr/supi/issues/209)
* **supi-code-intelligence:** merge type-alias target evidence ([2dac5de](https://github.com/mrclrchtr/supi/commit/2dac5de3afe569d06849171c1a65fa8a7f63b27b)), closes [#201](https://github.com/mrclrchtr/supi/issues/201)
* **supi-code-intelligence:** normalize graph provider locations ([162b347](https://github.com/mrclrchtr/supi/commit/162b3476cc1f9a91ca77e8d4605b7ed97f24246e)), closes [#211](https://github.com/mrclrchtr/supi/issues/211)
* **supi-code-intelligence:** preserve code_find query semantics ([f75c089](https://github.com/mrclrchtr/supi/commit/f75c0898832e0286802aad1c5549d2b74e888b3d))
* **supi-code-intelligence:** prioritize top-level declarations ([3bb0532](https://github.com/mrclrchtr/supi/commit/3bb0532f6e5a0dc1a83f0a30904eeed023343a27)), closes [#235](https://github.com/mrclrchtr/supi/issues/235)
* **supi-code-intelligence:** refine target display kind ([b331406](https://github.com/mrclrchtr/supi/commit/b33140609c89766c8525a5e7e7045f7ff7a317e9))
* **supi-code-intelligence:** remove dead capability warning state, simplify language detection ([c68425f](https://github.com/mrclrchtr/supi/commit/c68425f069e33065940030fba0f599fac85dc0e3))
* **supi-code-intelligence:** remove unsupported AST test kind ([6de41f8](https://github.com/mrclrchtr/supi/commit/6de41f889ce03b04ea8983337553e2e9ad4433a1)), closes [#202](https://github.com/mrclrchtr/supi/issues/202)
* **supi-code-intelligence:** report health evidence truthfully ([f8de7d7](https://github.com/mrclrchtr/supi/commit/f8de7d7c8b06e88107358ce2f063d3e682fba504))
* **supi-code-intelligence:** restrict orientation to observed facts ([ce03087](https://github.com/mrclrchtr/supi/commit/ce030876f2f66d2a4c8051fe28e131181d5bbeb3))
* **supi-code-intelligence:** search nested outline declarations ([91a754c](https://github.com/mrclrchtr/supi/commit/91a754c8de241bada148be61f019dd6b955f0f6a))
* **supi-code-intelligence:** sync discovery metadata ([8e4ac62](https://github.com/mrclrchtr/supi/commit/8e4ac62ba8a725174d39c339286a989725c00739))
* **supi-code-intelligence:** unify tool evidence summaries ([4fae196](https://github.com/mrclrchtr/supi/commit/4fae1964c2d08ead3d806749ed8cb50318de1fbc)), closes [#188](https://github.com/mrclrchtr/supi/issues/188)
* **supi-extras:** add @ path guidance ([dd8127d](https://github.com/mrclrchtr/supi/commit/dd8127d1b272533aab5f04a7c56a016f992d4f32))

## [3.2.0](https://github.com/mrclrchtr/supi/compare/v3.1.0...v3.2.0) (2026-07-28)


### Features

* **supi-review:** expand target-aware review tools ([6a15c7f](https://github.com/mrclrchtr/supi/commit/6a15c7fcd84f440e575cf29f22af0e85916cae34))


### Bug Fixes

* **supi-review:** harden review execution lifecycle ([cba4750](https://github.com/mrclrchtr/supi/commit/cba4750f80c37604bf77956bcd6b220a8a914825))

## [3.1.0](https://github.com/mrclrchtr/supi/compare/v3.0.0...v3.1.0) (2026-07-27)


### Features

* **supi-review:** replace JSON editor with step-by-step task wizard ([0f686ba](https://github.com/mrclrchtr/supi/commit/0f686ba7cfd55e5bcaf2b83c0cc19a6ff2e0ebb8))


### Bug Fixes

* **supi-review:** accept short commit hashes and resolve to full ids ([70d3e1b](https://github.com/mrclrchtr/supi/commit/70d3e1b898a1f2d288dd2f747263ef14284dfb27))
* **supi-review:** make target parsing lenient and report specific snapshot errors ([a56db12](https://github.com/mrclrchtr/supi/commit/a56db1258aa927a35907abb16e36c2561449aa1d))
* **supi-review:** surface model error details in failed review diagnostics ([82afc31](https://github.com/mrclrchtr/supi/commit/82afc31c3cde6e342dcc75fcdfe319aed94e039e))

## [3.0.0](https://github.com/mrclrchtr/supi/compare/v2.8.0...v3.0.0) (2026-07-27)


### ⚠ BREAKING CHANGES

* **supi-review:** separate review policy from execution

### Features

* **supi-review:** add dual-surface TUI rendering for review tools ([74404a0](https://github.com/mrclrchtr/supi/commit/74404a0eff68795c356106126f66e1bc2f23b48d))
* **supi-review:** separate review policy from execution ([88976d8](https://github.com/mrclrchtr/supi/commit/88976d89bfe5a8e56133224eae90b0aa5dae9a51))


### Bug Fixes

* **deps:** lock file maintenance ([b4d1d90](https://github.com/mrclrchtr/supi/commit/b4d1d906ac46fdf09dfd0d018ba6a11267b72e69))
* **deps:** update pnpm to v11.17.0 ([a3d8027](https://github.com/mrclrchtr/supi/commit/a3d8027c82b8f6210d187c0b855ab59f52310fe6))
* **supi-code-intelligence:** prevent test timeouts from slow dynamic imports ([bc05d29](https://github.com/mrclrchtr/supi/commit/bc05d29788b45c1b2d45090277d8ccafc63449d1))
* **supi-review:** improve spinner lifecycle, error messages, and collapsed labels ([5c466ac](https://github.com/mrclrchtr/supi/commit/5c466ac146de7ac2a7edf36cae3418d6aafda4a7))

## [2.8.0](https://github.com/mrclrchtr/supi/compare/v2.7.0...v2.8.0) (2026-07-26)


### Features

* **supi-review:** configure agent tool model ([d42325a](https://github.com/mrclrchtr/supi/commit/d42325af6dcac1fe1ba016a23d26ea572659067d))

## [2.7.0](https://github.com/mrclrchtr/supi/compare/v2.6.1...v2.7.0) (2026-07-26)


### Features

* **supi-context:** separate concise snapshots from TUI reports ([c9b2947](https://github.com/mrclrchtr/supi/commit/c9b294783285b9299d2b70c99c9faa65440b0100))
* **supi-review:** retain child lifecycle traces ([cad02e0](https://github.com/mrclrchtr/supi/commit/cad02e0482956c4e1562196676352ac0461ca05e)), closes [#223](https://github.com/mrclrchtr/supi/issues/223)


### Bug Fixes

* **deps:** update dependency clipboardy to v5.3.2 ([2134e71](https://github.com/mrclrchtr/supi/commit/2134e715876f17732cfa61de866b07d19819e716))
* **deps:** update dependency clipboardy to v5.3.2 ([86f337d](https://github.com/mrclrchtr/supi/commit/86f337d93f85f0442e8933563906711a1fb3ceaf))
* **deps:** update pnpm to v11.16.0 ([9061ba5](https://github.com/mrclrchtr/supi/commit/9061ba55d9129dc42a75837620f4400e9e6ed1ef))

## [2.6.1](https://github.com/mrclrchtr/supi/compare/v2.6.0...v2.6.1) (2026-07-25)


### Bug Fixes

* **deps:** lock file maintenance ([1d8912f](https://github.com/mrclrchtr/supi/commit/1d8912f0fb0d6f49598216c3a1da429e38a3cb6f))
* **deps:** upgrade pi to v0.82.0 ([f6998be](https://github.com/mrclrchtr/supi/commit/f6998be6e831120f422fa8f1630b1a05a68672f9))

## [2.6.0](https://github.com/mrclrchtr/supi/compare/v2.5.0...v2.6.0) (2026-07-25)


### Features

* **supi-review:** add agent-driven review workflow ([fc01b6e](https://github.com/mrclrchtr/supi/commit/fc01b6ed71b9e21d82548429d6c3bdafd9ab2c6d))


### Bug Fixes

* **deps:** update actions/checkout action to v7.0.1 ([d54a27d](https://github.com/mrclrchtr/supi/commit/d54a27d5a92f5a38bdb09f3ad2b21169e766a230))
* **deps:** update dependency @biomejs/biome to v2.5.5 ([6ed6ebd](https://github.com/mrclrchtr/supi/commit/6ed6ebde4cdca03de1f8b363113ddd2d2b53051f))
* **deps:** update dependency hk to v1.52.0 ([a26c2a8](https://github.com/mrclrchtr/supi/commit/a26c2a8e6c4115cf3ddc0d3b7eee240528ca6728))
* **deps:** update dependency hk to v1.53.0 ([4573f1f](https://github.com/mrclrchtr/supi/commit/4573f1ff7e527644232226bcb0dcf026758b48d5))
* **deps:** update dependency pkl to v0.32.1 ([cbdaa82](https://github.com/mrclrchtr/supi/commit/cbdaa823444a166c4ae1cc8da9f76171a9f646e8))
* **deps:** update pnpm to v11.14.0 ([74df414](https://github.com/mrclrchtr/supi/commit/74df414c4870432d3ad36ac72c7609406bde7d8e))
* **deps:** update pnpm to v11.15.0 ([8f4cc4c](https://github.com/mrclrchtr/supi/commit/8f4cc4c188eaa487c312cfc2a2f54f4dfd9ff941))
* **deps:** update pnpm to v11.15.1 ([da63bb2](https://github.com/mrclrchtr/supi/commit/da63bb266b24c09443a2c948ffb4e2d354ede2d5))
* **supi-review:** allow context overflow recovery ([b087655](https://github.com/mrclrchtr/supi/commit/b087655e84f45c330e77adc414df4a06a88bb4cd))

## [2.5.0](https://github.com/mrclrchtr/supi/compare/v2.4.1...v2.5.0) (2026-07-19)


### Features

* **ask-user:** reuse registered custom editor for the dialog text field ([4012414](https://github.com/mrclrchtr/supi/commit/40124143d288b6233eed3a9f554eb521b6a1d8dd)), closes [#195](https://github.com/mrclrchtr/supi/issues/195)


### Bug Fixes

* **ask-user:** preserve modal custom editor behavior ([58478b7](https://github.com/mrclrchtr/supi/commit/58478b7cce5a74d9eca6258184b96adf2d5bd622))
* **ci:** adapt to biome 2.5.4 ([2b763a2](https://github.com/mrclrchtr/supi/commit/2b763a294189f40fb3c8c547f5cb4bb65ffbf9fc))
* **deps:** update dependency @biomejs/biome to v2.5.4 ([0b3406b](https://github.com/mrclrchtr/supi/commit/0b3406bac70e6d4d76aa86e913caed50e0c30826))
* **deps:** update pnpm to v11.13.1 ([c393580](https://github.com/mrclrchtr/supi/commit/c393580781ef8bb4912288333057b902b92b1ea1))
* **test-utils:** stabilize makeCtx declaration type ([1f37694](https://github.com/mrclrchtr/supi/commit/1f37694cdc882c5a95b174cfe489f956c18bef08))

## [2.4.1](https://github.com/mrclrchtr/supi/compare/v2.4.0...v2.4.1) (2026-07-15)


### Bug Fixes

* **deps:** update dependency tree-sitter-cli to v0.26.11 ([f11d93b](https://github.com/mrclrchtr/supi/commit/f11d93b7d988c045f2bb5ce6466272c7791436ed))
* **deps:** update dependency web-tree-sitter to v0.26.11 ([508bbb5](https://github.com/mrclrchtr/supi/commit/508bbb5ec28fe6751bbccd18d916e4dad9c8bdcc))
* **deps:** update dependency web-tree-sitter to v0.26.11 ([973acbd](https://github.com/mrclrchtr/supi/commit/973acbd6e428c17eaff4aa776eb63df6ce198464))
* **deps:** update pnpm to v11.12.0 ([40b1a1f](https://github.com/mrclrchtr/supi/commit/40b1a1fab470f6d502be9c523bd68572b34487ee))
* **deps:** update pnpm to v11.13.0 ([098655f](https://github.com/mrclrchtr/supi/commit/098655f0eed310e6971d6074a19bfc54e0ee5ae8))

## [2.4.0](https://github.com/mrclrchtr/supi/compare/v2.3.2...v2.4.0) (2026-07-14)


### Features

* **supi-review:** use max thinking for child sessions ([faa09cc](https://github.com/mrclrchtr/supi/commit/faa09ccbc98a8d13afc94d9be05f168592df1e7b))


### Bug Fixes

* **deps:** lock file maintenance ([d06669b](https://github.com/mrclrchtr/supi/commit/d06669b3438f626e7398b03a25df0f68ef2b49b1))
* **deps:** update actions/setup-node action to v6.5.0 ([caafb53](https://github.com/mrclrchtr/supi/commit/caafb531ccb17a19a789ba41f68a24da4c714c84))
* **deps:** update actions/setup-node action to v7 ([0ea0e0b](https://github.com/mrclrchtr/supi/commit/0ea0e0bdb55f2e8f73a6c66307e8ea29b88603af))
* **deps:** update dependency hk to v1.51.0 ([29d3a79](https://github.com/mrclrchtr/supi/commit/29d3a79e9b517e872026148163e83828cf127126))
* **deps:** update pnpm to v11.11.0 ([6a6ab73](https://github.com/mrclrchtr/supi/commit/6a6ab73e29372839c5e86fd0ef6eb8af20b3d73c))

## [2.3.2](https://github.com/mrclrchtr/supi/compare/v2.3.1...v2.3.2) (2026-07-12)


### Bug Fixes

* **deps:** update dependency typebox to v1.3.6 ([df48a20](https://github.com/mrclrchtr/supi/commit/df48a20b86799665d8a72ee7df2bcc1439658590))
* **supi-extras:** rename model-effort-colors to supi-footer ([7509f52](https://github.com/mrclrchtr/supi/commit/7509f5210db21a22c2319ff99f17ec0130c1853a))

## [2.3.1](https://github.com/mrclrchtr/supi/compare/v2.3.0...v2.3.1) (2026-07-11)


### Bug Fixes

* **deps:** update dependency @biomejs/biome to v2.5.3 ([086327e](https://github.com/mrclrchtr/supi/commit/086327e554a203b41052dc3395a995c5dcd83b61))
* **deps:** update dependency @commitlint/cli to v21.2.1 ([c85d835](https://github.com/mrclrchtr/supi/commit/c85d83558a39898edc25c560d03513cb902a0b97))
* **deps:** update dependency @types/node to v25.9.5 ([a927397](https://github.com/mrclrchtr/supi/commit/a9273974fde53138c127e18c2e9bc5c6406ae096))
* **deps:** update dependency typebox to v1.3.5 ([78d8663](https://github.com/mrclrchtr/supi/commit/78d8663a1cce0405a62b57f1c55b18f252efc6a6))

## [2.3.0](https://github.com/mrclrchtr/supi/compare/v2.2.1...v2.3.0) (2026-07-10)


### Features

* **supi-ask-user:** label tool results with "decision" for tree visibility ([15c5782](https://github.com/mrclrchtr/supi/commit/15c57823ec5ae89ff413b0e0b913d8e4c7eaa651))
* **supi-ask-user:** rename option.preview to option.details with model-facing guidance ([f8ede36](https://github.com/mrclrchtr/supi/commit/f8ede363c27bd546367cd930d90fd3a07082d121))


### Bug Fixes

* **deps:** update dependency vitest to v4.1.10 ([0d87e50](https://github.com/mrclrchtr/supi/commit/0d87e5082c0500a4ba60be85323177f318c9f805))

## [2.2.1](https://github.com/mrclrchtr/supi/compare/v2.2.0...v2.2.1) (2026-07-08)


### Bug Fixes

* **deps:** update dependency pkl to v0.32.0 ([be321b5](https://github.com/mrclrchtr/supi/commit/be321b52cb6fb21690b84b5e9859c7d44bbf781b))
* **supi-lsp:** prevent orphaned LSP servers after PI shutdown ([16544d7](https://github.com/mrclrchtr/supi/commit/16544d7e90f54e56506191a19350290a2097edab))
* **supi-review:** increase reviewer timeout from 20m to 60m ([db7e769](https://github.com/mrclrchtr/supi/commit/db7e769d6150fbbf8173d417fab8942a913cd053))

## [2.2.0](https://github.com/mrclrchtr/supi/compare/v2.1.0...v2.2.0) (2026-07-08)


### Features

* **supi-core:** declarative settings schema with source-aware inheritance ([054a4ee](https://github.com/mrclrchtr/supi/commit/054a4ee5a0b2d14ee55232c03b94b796236bf5f9))
* **supi-prompt-suggestions:** secure ghost-suggestion lifecycle, auth, and TUI gating ([7de8194](https://github.com/mrclrchtr/supi/commit/7de81946efbc51ac1613f2a31aa21761028343de))


### Bug Fixes

* **deps:** update dependency hk to v1.50.0 ([a5949f3](https://github.com/mrclrchtr/supi/commit/a5949f3239056099475176200e5fb109ce435127))
* **deps:** update dependency typebox to v1.3.4 ([4b58167](https://github.com/mrclrchtr/supi/commit/4b58167b22f530c9896d627c05a2e22e2c16a6ed))
* **deps:** update pnpm to v11.10.0 ([3b5a545](https://github.com/mrclrchtr/supi/commit/3b5a54549c303b12f174e437084261cfc944a192))
* **supi-review:** compute SelectList primary column width from actual labels ([8e93987](https://github.com/mrclrchtr/supi/commit/8e9398791ad885fd364b41a9368219940a9d63d4))
* **supi:** truncate TUI lines in footer stats and context report file rows ([13cc6ab](https://github.com/mrclrchtr/supi/commit/13cc6ab7fb2d29884165a5afc92a11b0c015686a))

## [2.1.0](https://github.com/mrclrchtr/supi/compare/v2.0.6...v2.1.0) (2026-07-06)


### Features

* **supi-code-intelligence:** support multi-scope code_find ([84aea5f](https://github.com/mrclrchtr/supi/commit/84aea5fb0e69a65fe8fcbfb5d1f1119818cacd4c))
* **supi-core:** migrate settings to event-bus, add prompt-surface overrides ([50dfed2](https://github.com/mrclrchtr/supi/commit/50dfed2948cbdf37ae8627a7f8dbc515cf7f5428))
* **supi-prompt-suggestions:** improve prompt specificity and skip/abort generation on input ([bf88bc2](https://github.com/mrclrchtr/supi/commit/bf88bc2b305ef16e67d2163943b80dcdafd557fc))


### Bug Fixes

* **deps:** lock file maintenance ([d6169c7](https://github.com/mrclrchtr/supi/commit/d6169c722e8e8c601313acf42a824fe7731dcf47))
* **deps:** update dependency @biomejs/biome to v2.5.2 ([1adcaee](https://github.com/mrclrchtr/supi/commit/1adcaeef359503ac30d150b69a78aeeee85cb924))

## [2.0.6](https://github.com/mrclrchtr/supi/compare/v2.0.5...v2.0.6) (2026-07-05)


### Bug Fixes

* **deps:** update dependency typebox to v1.3.3 ([9ed0178](https://github.com/mrclrchtr/supi/commit/9ed017807fd562fa16179f27a78847b8ed000751))

## [2.0.5](https://github.com/mrclrchtr/supi/compare/v2.0.4...v2.0.5) (2026-07-03)


### Bug Fixes

* **deps:** update commitlint monorepo to v21.2.0 ([67afb7c](https://github.com/mrclrchtr/supi/commit/67afb7cc170a6537cfcc94ca5e7db729232bdb05))
* **deps:** update dependency vscode-jsonrpc to v9.0.1 ([0dd8bd9](https://github.com/mrclrchtr/supi/commit/0dd8bd937d687fd57592767b9e8af206aac9c84a))
* **deps:** update dependency vscode-languageserver-protocol to v3.18.2 ([0b8ebc4](https://github.com/mrclrchtr/supi/commit/0b8ebc4a4835617ff174ac38c4dcce1fbc5fb9ae))

## [2.0.4](https://github.com/mrclrchtr/supi/compare/v2.0.3...v2.0.4) (2026-07-02)


### Bug Fixes

* **deps:** update dependency hk to v1.49.0 ([227457c](https://github.com/mrclrchtr/supi/commit/227457cc4d82de2a3b201874aa3a7006731e2247))
* **deps:** update dependency tree-sitter-cli to v0.26.10 ([899d550](https://github.com/mrclrchtr/supi/commit/899d5509880da327b22618a54a84ef3b7c851b4e))
* **deps:** update dependency typebox to v1.3.2 ([02c467c](https://github.com/mrclrchtr/supi/commit/02c467c7f64fb51670627c95c1739b73622d1746))
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
