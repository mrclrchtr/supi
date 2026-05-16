# Changelog

## [1.1.0](https://github.com/mrclrchtr/supi/compare/supi-ask-user-v1.0.0...supi-ask-user-v1.1.0) (2026-05-16)


### Features

* add resources_discover handlers and bundled skills to extensions ([4dc3d8a](https://github.com/mrclrchtr/supi/commit/4dc3d8ad362fcd01655ee6f468d6f35c551faad7))
* **ask-user:** add default pre-selection for structured questions and raise prompt limit ([4710d7f](https://github.com/mrclrchtr/supi/commit/4710d7f3b294c1328914725bfa2af6162393199c))
* **ask-user:** add default value for text questions and raise header limit ([dfb282c](https://github.com/mrclrchtr/supi/commit/dfb282c30b27b5eb59a1da99c186d8e737867753))
* **ask-user:** add markdown preview rendering with syntax highlighting ([e2f7aef](https://github.com/mrclrchtr/supi/commit/e2f7aef6005fc19c612113ad8706161d60f3039e))
* **ask-user:** add optional questions and skip action ([3e70786](https://github.com/mrclrchtr/supi/commit/3e7078615d614681d3705782131f57e790ba5661))
* **ask-user:** allow up to 12 choice options ([ec9e908](https://github.com/mrclrchtr/supi/commit/ec9e90844202deeed00950805975be1088f1f54a))
* **ask-user:** append tree-friendly summary entry after questionnaire completion ([c68b4ba](https://github.com/mrclrchtr/supi/commit/c68b4ba6e6380eaa5d5c98e27d2112e44c8ee14d))
* **ask-user:** extend markdown rendering to prompts, descriptions, and review answers ([24e590c](https://github.com/mrclrchtr/supi/commit/24e590ca1a6b7dd1e30998952cb3ce43945d6322))
* **ask-user:** signal user attention with terminal title and alert bell ([4e8d3f1](https://github.com/mrclrchtr/supi/commit/4e8d3f11e9c99309fe81383617f9ec258a8d414a))
* **ask-user:** unify choice/multichoice/yesno into single choice type ([5c22dd8](https://github.com/mrclrchtr/supi/commit/5c22dd8e5f399369adb5908bc7e14493492047af))
* **repo:** migrate to pnpm monorepo with individually installable extensions ([eea81af](https://github.com/mrclrchtr/supi/commit/eea81afb3d5d8b80dd07f5d595d4423450766919))


### Bug Fixes

* **ask-user:** abort agent turn on cancel instead of triggering LLM response ([70f847d](https://github.com/mrclrchtr/supi/commit/70f847dba3cf48c6a4186a0a6a7fd2e1b795ce31))
* **ask-user:** clarify yesno vs choice usage in tool description and guidelines ([17e70a0](https://github.com/mrclrchtr/supi/commit/17e70a0bc0c910f23fc95a761d5ff00e0b2e19db))
* **ask-user:** navigate inline Other/Discuss editors with Up/Down without ESC ([a465875](https://github.com/mrclrchtr/supi/commit/a465875e4b91c9e7ae38daf2aeec64b38e67b768))
* **ask-user:** prevent truncation of headers and overlay content ([8f6a5c6](https://github.com/mrclrchtr/supi/commit/8f6a5c6aea5f4d93422dc9267839a23411b72f40))
* **ask-user:** skip advances past current question in multi-question mode ([fc9d57b](https://github.com/mrclrchtr/supi/commit/fc9d57b0b961934ae23c341b3db20fbb06da4d45))
* **ask-user:** stabilize render height and fix double decoration ([9abca60](https://github.com/mrclrchtr/supi/commit/9abca609978b9792d84320bd37305c3dcb2eb30e))
* **ask-user:** support multichoice other and review revisions ([83a95f3](https://github.com/mrclrchtr/supi/commit/83a95f3e76eed9a9c03e13ce234668c032f4bee5))
* **ask-user:** support text skip keybinding ([e7082c9](https://github.com/mrclrchtr/supi/commit/e7082c94796b3039b7e3c44bce167e14373d0e28))
* **ask-user:** wrap long inline input in rich UI ([a519a47](https://github.com/mrclrchtr/supi/commit/a519a47525136bef3661f350f84890f043047e68))
* **ask-user:** wrap option descriptions in split view instead of truncating ([42e7403](https://github.com/mrclrchtr/supi/commit/42e7403eb1437aac289884c4d7a07e1140d0e9b2))
* **extras,ask-user:** coordinate terminal title via events to prevent race ([7465efb](https://github.com/mrclrchtr/supi/commit/7465efb01e12773235ddbd8907269d1cddafc2c0))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 1.1.0

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-ask-user-v0.1.0...supi-ask-user-v0.2.0) (2026-05-14)


### Features

* add resources_discover handlers and bundled skills to extensions ([4dc3d8a](https://github.com/mrclrchtr/supi/commit/4dc3d8ad362fcd01655ee6f468d6f35c551faad7))
* **ask-user:** add default pre-selection for structured questions and raise prompt limit ([4710d7f](https://github.com/mrclrchtr/supi/commit/4710d7f3b294c1328914725bfa2af6162393199c))
* **ask-user:** add default value for text questions and raise header limit ([dfb282c](https://github.com/mrclrchtr/supi/commit/dfb282c30b27b5eb59a1da99c186d8e737867753))
* **ask-user:** add markdown preview rendering with syntax highlighting ([e2f7aef](https://github.com/mrclrchtr/supi/commit/e2f7aef6005fc19c612113ad8706161d60f3039e))
* **ask-user:** add optional questions and skip action ([3e70786](https://github.com/mrclrchtr/supi/commit/3e7078615d614681d3705782131f57e790ba5661))
* **ask-user:** allow up to 12 choice options ([ec9e908](https://github.com/mrclrchtr/supi/commit/ec9e90844202deeed00950805975be1088f1f54a))
* **ask-user:** append tree-friendly summary entry after questionnaire completion ([c68b4ba](https://github.com/mrclrchtr/supi/commit/c68b4ba6e6380eaa5d5c98e27d2112e44c8ee14d))
* **ask-user:** extend markdown rendering to prompts, descriptions, and review answers ([24e590c](https://github.com/mrclrchtr/supi/commit/24e590ca1a6b7dd1e30998952cb3ce43945d6322))
* **ask-user:** signal user attention with terminal title and alert bell ([4e8d3f1](https://github.com/mrclrchtr/supi/commit/4e8d3f11e9c99309fe81383617f9ec258a8d414a))
* **ask-user:** unify choice/multichoice/yesno into single choice type ([5c22dd8](https://github.com/mrclrchtr/supi/commit/5c22dd8e5f399369adb5908bc7e14493492047af))
* **repo:** migrate to pnpm monorepo with individually installable extensions ([eea81af](https://github.com/mrclrchtr/supi/commit/eea81afb3d5d8b80dd07f5d595d4423450766919))


### Bug Fixes

* **ask-user:** abort agent turn on cancel instead of triggering LLM response ([70f847d](https://github.com/mrclrchtr/supi/commit/70f847dba3cf48c6a4186a0a6a7fd2e1b795ce31))
* **ask-user:** clarify yesno vs choice usage in tool description and guidelines ([17e70a0](https://github.com/mrclrchtr/supi/commit/17e70a0bc0c910f23fc95a761d5ff00e0b2e19db))
* **ask-user:** navigate inline Other/Discuss editors with Up/Down without ESC ([a465875](https://github.com/mrclrchtr/supi/commit/a465875e4b91c9e7ae38daf2aeec64b38e67b768))
* **ask-user:** prevent truncation of headers and overlay content ([8f6a5c6](https://github.com/mrclrchtr/supi/commit/8f6a5c6aea5f4d93422dc9267839a23411b72f40))
* **ask-user:** skip advances past current question in multi-question mode ([fc9d57b](https://github.com/mrclrchtr/supi/commit/fc9d57b0b961934ae23c341b3db20fbb06da4d45))
* **ask-user:** stabilize render height and fix double decoration ([9abca60](https://github.com/mrclrchtr/supi/commit/9abca609978b9792d84320bd37305c3dcb2eb30e))
* **ask-user:** support multichoice other and review revisions ([83a95f3](https://github.com/mrclrchtr/supi/commit/83a95f3e76eed9a9c03e13ce234668c032f4bee5))
* **ask-user:** support text skip keybinding ([e7082c9](https://github.com/mrclrchtr/supi/commit/e7082c94796b3039b7e3c44bce167e14373d0e28))
* **ask-user:** wrap long inline input in rich UI ([a519a47](https://github.com/mrclrchtr/supi/commit/a519a47525136bef3661f350f84890f043047e68))
* **ask-user:** wrap option descriptions in split view instead of truncating ([42e7403](https://github.com/mrclrchtr/supi/commit/42e7403eb1437aac289884c4d7a07e1140d0e9b2))
* **extras,ask-user:** coordinate terminal title via events to prevent race ([7465efb](https://github.com/mrclrchtr/supi/commit/7465efb01e12773235ddbd8907269d1cddafc2c0))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
