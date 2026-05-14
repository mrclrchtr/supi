# Changelog

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-review-v0.1.0...supi-review-v0.2.0) (2026-05-14)


### Features

* **extras,review:** activate tab spinner during supi-review runs ([ef0e37f](https://github.com/mrclrchtr/supi/commit/ef0e37f460e6da834b4577e75c8b21b9b249d6fc))
* **review:** add /review command with structured code review ([66b36cf](https://github.com/mrclrchtr/supi/commit/66b36cfb406bf699731af531e45386b1fc4cf5f9))
* **review:** add rich review content and auto-fix support ([d926613](https://github.com/mrclrchtr/supi/commit/d926613171b27516ed07cfcd5720834f9cadc27d))
* **review:** add timeout setting and review diagnostics ([f9ef500](https://github.com/mrclrchtr/supi/commit/f9ef500b6c7f8887de6afb56198c7313a541b993))
* **review:** changed-files lists, extensions, and context in reviewer sessions ([67258c3](https://github.com/mrclrchtr/supi/commit/67258c3385194ea281b33cc0774c97683bcb7e68))
* **review:** rename command and wire timeout settings ([0f0a93a](https://github.com/mrclrchtr/supi/commit/0f0a93a2d0a97054da9374c168c57bc1a386d376))
* **supi-review:** add diff stats to review user prompt ([2c17f9d](https://github.com/mrclrchtr/supi/commit/2c17f9d4f21d6476c68213643d06bef927e95922))
* **supi-review:** add structured review guidelines to system prompt ([c28ada1](https://github.com/mrclrchtr/supi/commit/c28ada1a07655448d2f9c3a3e46417d72cf0a839))
* **supi-review:** add structured review guidelines to system prompt ([758cffc](https://github.com/mrclrchtr/supi/commit/758cffcc1d565c082eebb967ee570a861f6689e4))
* **supi-review:** respect PI scoped models in review model cycle ([31b33c4](https://github.com/mrclrchtr/supi/commit/31b33c4bd595f1aa22b2e9ca30bb11effb820a0a))
* **supi-review:** tmux-based reviewer with submit_review tool ([cb3e4c8](https://github.com/mrclrchtr/supi/commit/cb3e4c81e04e235ee57825774fd1fa3f4b819b90))


### Bug Fixes

* **biome:** resolve workspace check diagnostics ([53d4d39](https://github.com/mrclrchtr/supi/commit/53d4d39360dea7c38b81a57453beef081c4390ec))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **review:** enable scoped model selection in settings ([ae585ce](https://github.com/mrclrchtr/supi/commit/ae585cee05cd59295d61d52ee4af17211cb56bf7))
* **review:** handle runner cancellation and JSON output ([c7011ba](https://github.com/mrclrchtr/supi/commit/c7011ba11386d657ffafd8a3afcff94f255720c5))
* **review:** honor saved model scope in settings ([061e8be](https://github.com/mrclrchtr/supi/commit/061e8be0ce50d4491574c647dab6abca147d3b4e))
* **review:** isolate reviewer subprocess to prevent shutdown hangs ([6bcbc5b](https://github.com/mrclrchtr/supi/commit/6bcbc5be57708f3345130b16dfd24927f9ff1148))
* **rtk,lsp,review,ci:** merge best review follow-ups ([c84e883](https://github.com/mrclrchtr/supi/commit/c84e8837b8f7d755209f34d0913a34450378e05b))
* **supi-review:** disable thinking for reviewer session ([fd5be0c](https://github.com/mrclrchtr/supi/commit/fd5be0c157ef46e1e640486791720b123dede079))
* **supi-review:** dynamically resolve highest thinking level for reviewer ([d198b05](https://github.com/mrclrchtr/supi/commit/d198b056ba2d46aacc3fc36298f3d6ee3ad8805f))
* **supi-review:** fix vi.mock hoisting and constructor mock in runner.test.ts ([c979da9](https://github.com/mrclrchtr/supi/commit/c979da9920cc22b7896edab8d2f722cc0d6ba9d8))
* **supi-review:** include model response text in failed review error ([b709acf](https://github.com/mrclrchtr/supi/commit/b709acfa6f67d20405310b54696ec0e6f976bf64))
* **supi-review:** only validate thinkingLevelMap against OpenAI standard for OpenRouter ([36df8bb](https://github.com/mrclrchtr/supi/commit/36df8bb00b1bc55f5115267fd80f854d5a1484a3))
* **supi-review:** pass parent modelRegistry to reviewer session ([a1bc774](https://github.com/mrclrchtr/supi/commit/a1bc774dbb87bdf224ee2522190c28ae7c3c8f44))
* **supi-review:** reject non-standard thinkingLevelMap mappings ([0efc040](https://github.com/mrclrchtr/supi/commit/0efc0409592fac20f8622c7cd9ad511805cbd98b))
* **supi-review:** resolve TS type errors in resolveReviewThinkingLevel ([a984b07](https://github.com/mrclrchtr/supi/commit/a984b0760b2ede86bc0561f9430ef0141e4b44e0))
* **supi-review:** simplify reviewer runner ([c717aa1](https://github.com/mrclrchtr/supi/commit/c717aa1094f226440dd98a724db3f763e65a1c99))
* **supi-review:** surface LLM error from failed reviewer session ([ef62381](https://github.com/mrclrchtr/supi/commit/ef62381881b64373da29fe7c97497ea190daa3b5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
