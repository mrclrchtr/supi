# Task 2: Update api.ts, index.ts, and package.json exports

### 1. `packages/supi-core/src/api.ts`
Rewrite as thin re-export layer using domain barrels:
- Replace direct re-exports from source modules with `export * from "./config.ts"`, `export * from "./context.ts"`, etc.
- Keep identical JSDoc header and comment structure.
- This means `@mrclrchtr/supi-core/api` still works for all existing consumers.

### 2. `packages/supi-core/src/index.ts`
Apply same changes as api.ts (it mirrors api.ts's structure).

### 3. `packages/supi-core/package.json`
Add new subpath exports under `"exports"`:
```json
"./config": "./src/config.ts",
"./context": "./src/context.ts",
"./debug": "./src/debug-registry.ts",
"./path": "./src/path.ts",
"./project": "./src/project.ts",
"./session": "./src/session.ts",
"./settings": "./src/settings.ts",
"./settings-ui": "./src/settings-ui.ts",
"./terminal": "./src/terminal.ts",
"./tool-framework": "./src/tool-framework.ts",
"./types": "./src/types.ts"
```
Keep existing `"./api"`, `"./extension"`, `"./package.json"` exports.

### Verification
- `tsc -b packages/*/tsconfig.json` must pass (typecheck source)
- `node -e "require('@mrclrchtr/supi-core/config')"` must resolve via exports map
