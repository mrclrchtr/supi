# Changelog

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-code-intelligence-v0.1.0...supi-code-intelligence-v0.2.0) (2026-05-14)


### Features

* **code-intelligence:** add supi-code-intelligence package ([8617b21](https://github.com/mrclrchtr/supi/commit/8617b21c580a42b66c7ad0286c405b289033ed3e))
* **code-intelligence:** expand source file recognition to all supported languages ([475e705](https://github.com/mrclrchtr/supi/commit/475e705a1fd62b980613f5c60347bae61162b52d))
* **supi-code-intelligence:** add code_intel index action ([64c78cb](https://github.com/mrclrchtr/supi/commit/64c78cbcff4f0583b4cfe7414fca9ec4567d2a44))
* **supi-code-intelligence:** add git context helpers ([f8238ed](https://github.com/mrclrchtr/supi/commit/f8238ed17a27dd374f538852d3a112d980722eef))
* **supi-code-intelligence:** add summary mode to pattern action ([bf6d347](https://github.com/mrclrchtr/supi/commit/bf6d347c85d1ced25087ab1d31d6e3f488833292))
* **supi-code-intelligence:** include git context in brief output ([c175a73](https://github.com/mrclrchtr/supi/commit/c175a73d061ecd7e5b76259d56858a2c022e91e5))
* **supi-tree-sitter, supi-code-intelligence:** cross-language structural callee support ([801e22e](https://github.com/mrclrchtr/supi/commit/801e22ecfa0d7baa5e22b0d5dcbb3bc78d0ecb83))


### Bug Fixes

* **code-intelligence:** address review findings ([e6af270](https://github.com/mrclrchtr/supi/commit/e6af27086ba5c9410d7cc48d5558e7dbf177c581))
* **code-intelligence:** align public contract across schema, docs, and behavior ([df852ed](https://github.com/mrclrchtr/supi/commit/df852ed644c97d3396ceaa5b84e78850cbebac9d))
* **code-intelligence:** always return details from action handlers ([9538a4a](https://github.com/mrclrchtr/supi/commit/9538a4ad7e966596442d1058cbfa775272122009))
* **code-intelligence:** propagate summary param through regex branch of pattern action ([b04c5f5](https://github.com/mrclrchtr/supi/commit/b04c5f5be79f6b63dc62ec0536d9bb7ae4a07e57))
* **code-intel:** literal-default pattern, regex opt-in, invalid-regex errors ([de12a93](https://github.com/mrclrchtr/supi/commit/de12a93eef96c921e578f652e01d1b4f4d3da8aa))
* include src dirs in all __tests__/tsconfig.json for LSP import resolution ([d65eb8b](https://github.com/mrclrchtr/supi/commit/d65eb8be3bb2bc3da54496d73065e4243b1461fa))
* **lsp,code-intel:** summarize external references ([926aa42](https://github.com/mrclrchtr/supi/commit/926aa4288790cd560d44a933de6bcae175b2bfd4))
* **packages:** add bundledDependencies per pi packages.md conventions ([de7e7a0](https://github.com/mrclrchtr/supi/commit/de7e7a0ef4b14a77e464627e4f4d58283dd74da6))
* **packages:** add package entrypoints ([65e8e88](https://github.com/mrclrchtr/supi/commit/65e8e8881eca4e106e9adb43bde506a2f291eca1))
* **release:** align package surfaces and README claims ([ec20cbe](https://github.com/mrclrchtr/supi/commit/ec20cbeaf621c501c702374235f63db1e968d3dd))
* **test:** force git default branch to main in brief test ([e94a644](https://github.com/mrclrchtr/supi/commit/e94a6445d4513b5b9003056a41d1f213f25f8f0c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
    * @mrclrchtr/supi-lsp bumped to 1.0.0
    * @mrclrchtr/supi-tree-sitter bumped to 1.0.0
