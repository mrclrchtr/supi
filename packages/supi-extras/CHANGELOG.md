# Changelog

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-extras-v0.1.0...supi-extras-v0.2.0) (2026-05-14)


### Features

* **extras,review:** activate tab spinner during supi-review runs ([ef0e37f](https://github.com/mrclrchtr/supi/commit/ef0e37f460e6da834b4577e75c8b21b9b249d6fc))
* **extras:** consolidate stash commands into /supi-stash action menu ([d78b3d5](https://github.com/mrclrchtr/supi/commit/d78b3d5c175a35df597d6af4c96073f6ceb583f6))
* **extras:** custom TUI overlay for /supi-stash with single-key actions ([5bcca95](https://github.com/mrclrchtr/supi/commit/5bcca9555bb9fcd6200ac18c7e34f4220a76cb6d))
* **extras:** global D key for clear-all, d for single delete ([c92884b](https://github.com/mrclrchtr/supi/commit/c92884b4061bed42727e302bd5b71a98a6fe00a9))
* **extras:** overlay stays open on delete, refreshes in-place ([816364d](https://github.com/mrclrchtr/supi/commit/816364db53c5e76b7a8e0a135b7a394d38989323))
* **extras:** persist prompt stash to disk ([16802e6](https://github.com/mrclrchtr/supi/commit/16802e690c7c254b8206d80de4bb78f302f2c1cb))
* **extras:** rename stash commands to supi-* and add delete action ([f019de6](https://github.com/mrclrchtr/supi/commit/f019de6903e0820feb8b4c096681faa05a72a1e7))
* **supi-extras:** add prompt-stash with hotkeys and clipboard ([ab592c6](https://github.com/mrclrchtr/supi/commit/ab592c68317f8b860f437919c370390165277590))
* **supi-extras:** add tab-spinner extension package ([2d2d24a](https://github.com/mrclrchtr/supi/commit/2d2d24a69b15f206ddabf444aa80840a84028948))
* **supi-extras:** prevent git from opening interactive editors ([c5e96d5](https://github.com/mrclrchtr/supi/commit/c5e96d5c04c4a27b3eed245d9ffe47eb7a03489d))


### Bug Fixes

* **biome:** resolve workspace check diagnostics ([53d4d39](https://github.com/mrclrchtr/supi/commit/53d4d39360dea7c38b81a57453beef081c4390ec))
* **extras,ask-user:** coordinate terminal title via events to prevent race ([7465efb](https://github.com/mrclrchtr/supi/commit/7465efb01e12773235ddbd8907269d1cddafc2c0))
* **extras:** ship clipboardy on all install surfaces ([3573458](https://github.com/mrclrchtr/supi/commit/35734581b335709626b4f9aaa92daed4dd427277))
* **extras:** silence ENOENT on prompt-stash load ([24a141a](https://github.com/mrclrchtr/supi/commit/24a141acf78f0ee4f2b8a7b498b9d4531159b2b0))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **supi-extras:** avoid ctrl+s shortcut conflict with app.models.save ([4eee834](https://github.com/mrclrchtr/supi/commit/4eee834c3fb74936b04508da4c58ee80cfde53a3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
