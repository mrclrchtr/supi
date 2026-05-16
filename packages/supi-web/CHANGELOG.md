# Changelog

## [1.1.0](https://github.com/mrclrchtr/supi/compare/supi-web-v1.0.0...supi-web-v1.1.0) (2026-05-16)


### Features

* **web:** add supi-web extension with web_fetch_md tool ([0157251](https://github.com/mrclrchtr/supi/commit/01572511a129342c67d891d58c33d486fbe052f5))
* **web:** add web_docs_search and web_docs_fetch Context7 tools ([487d516](https://github.com/mrclrchtr/supi/commit/487d516f9ef492eb142127e0c9fcf34f1b824210))
* **web:** make gh CLI preference conditional on gh availability ([6b70ab3](https://github.com/mrclrchtr/supi/commit/6b70ab3dbf663efdc4aacecc381c3d4defd1e350))
* **web:** prefer gh CLI for GitHub URLs in web_fetch_md guidelines ([558d774](https://github.com/mrclrchtr/supi/commit/558d774853bf6796a90192960efb6145467355e6))


### Bug Fixes

* **deps:** update dependency jsdom to v29 ([097d6ec](https://github.com/mrclrchtr/supi/commit/097d6ec269d943ab1c0c6536b0dd5bbb8049c6a6))
* resolve pre-existing test failures in pack-staged and concurrency guard ([747b788](https://github.com/mrclrchtr/supi/commit/747b788e2a7cc8bdb4975e55b20363fbcaf6bf46))
* **snyk:** resolve 20 SAST findings (ReDoS, XSS, Path Traversal) ([5802df1](https://github.com/mrclrchtr/supi/commit/5802df132556cfbab870e3581595bbd0df9beca3))
* **web:** guard isPlainTextContentType against text/html, expand guessLanguage ([c34eca8](https://github.com/mrclrchtr/supi/commit/c34eca82c783cadd05355422445a4f8358b8931f))
* **web:** use browser-like User-Agent to reduce 403 errors ([90c96da](https://github.com/mrclrchtr/supi/commit/90c96da6ca29ca6c1ed63df49aacd207c1c2c333))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 1.1.0

## [0.2.1](https://github.com/mrclrchtr/supi/compare/supi-web-v0.2.0...supi-web-v0.2.1) (2026-05-15)


### Bug Fixes

* **deps:** update dependency jsdom to v29 ([097d6ec](https://github.com/mrclrchtr/supi/commit/097d6ec269d943ab1c0c6536b0dd5bbb8049c6a6))

## [0.2.0](https://github.com/mrclrchtr/supi/compare/supi-web-v0.1.0...supi-web-v0.2.0) (2026-05-14)


### Features

* **web:** add supi-web extension with web_fetch_md tool ([0157251](https://github.com/mrclrchtr/supi/commit/01572511a129342c67d891d58c33d486fbe052f5))
* **web:** add web_docs_search and web_docs_fetch Context7 tools ([487d516](https://github.com/mrclrchtr/supi/commit/487d516f9ef492eb142127e0c9fcf34f1b824210))


### Bug Fixes

* **web:** guard isPlainTextContentType against text/html, expand guessLanguage ([c34eca8](https://github.com/mrclrchtr/supi/commit/c34eca82c783cadd05355422445a4f8358b8931f))
* **web:** use browser-like User-Agent to reduce 403 errors ([90c96da](https://github.com/mrclrchtr/supi/commit/90c96da6ca29ca6c1ed63df49aacd207c1c2c333))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @mrclrchtr/supi-core bumped to 0.2.0
