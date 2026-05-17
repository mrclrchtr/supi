The published @mrclrchtr/supi@1.2.0 has two load failures:

1. Cannot find module '../status-log.ts' — The file is at packages/supi-debug/status-log.ts (package root) but supisu-pi-debug's package.json `files: ["src/**/*.ts", "README.md"]` excludes root-level .ts files. npm pack respects the sub-package's `files` field for bundled dependencies, so status-log.ts is omitted from the tarball.

2. Cannot find module 'clipboardy' — clipboardy is imported statically in packages/supi-extras/src/clipboard.ts. In the pnpm hoisted workspace, clipboardy lives at root node_modules/ (shared dep of both supi and supi-extras), not inside packages/supi/node_modules/. The cp -RL staging only copies what's inside packages/supi/, missing clipboardy. Even worse, pi's extension module isolation may not resolve hoisted global node_modules deps.

Fixes:
- Move status-log.ts to packages/supi-debug/src/ and update the import path
- Make the clipboardy import dynamic/lazy so the extension always loads; clipboard functionality degrades gracefully when clipboardy is unavailable