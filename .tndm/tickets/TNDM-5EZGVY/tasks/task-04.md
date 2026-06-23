# Task 4: supi-core: add declarative persistChange to config-settings

## Goal
Extend `registerConfigSettings` in `packages/supi-core/src/config/config-settings.ts` to support declarative `persistChange`. When every `SettingItem` in `buildItems()` returns a `configType`, the `persistChange` callback is auto-generated. Packages no longer need to write manual `switch`/`if-else` handlers for simple boolean, number, and stringList settings.

## Files
- **Modify:** `packages/supi-core/src/config/config-settings.ts`
- **Test:** `packages/supi-core/__tests__/unit/config/config-settings.test.ts` (add test block or new test file)

## Types
```ts
type ConfigSettingType = "boolean" | "number" | "stringList";

interface ConfigSettingItem extends SettingItem {
  configType?: ConfigSettingType;
  configDefault?: unknown;
}
```

Update `ConfigSettingsOptions.buildItems` to return `ConfigSettingItem[]`.

## Auto-generated persistChange logic
```ts
function autoPersistChange(
  _scope: SettingsScope,
  _cwd: string,
  settingId: string,
  value: string,
  helpers: ConfigSettingsHelpers,
  items: ConfigSettingItem[],
): void {
  const item = items.find(i => i.id === settingId);
  if (!item?.configType) return;

  switch (item.configType) {
    case "boolean":
      helpers.set(settingId, value === "on");
      break;
    case "number": {
      const num = Number.parseInt(value, 10);
      if (Number.isFinite(num) && num > 0) {
        helpers.set(settingId, num);
      } else {
        helpers.unset(settingId);
      }
      break;
    }
    case "stringList": {
      const names = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
      if (names.length > 0) {
        helpers.set(settingId, names);
      } else {
        helpers.unset(settingId);
      }
      break;
    }
  }
}
```

When all items have `configType`, use the auto-generated handler. When any item lacks `configType`, require a manual `persistChange` as before (backwards compatible).

## TDD
- Test: auto-persist for boolean (on → true, off → false)
- Test: auto-persist for number (valid → set, invalid → unset)
- Test: auto-persist for stringList (comma-separated → array, empty → unset)
- Test: mixed items (some with configType, some without) → manual persistChange required
- Test: all items with configType → auto handler used

## Verification
- `pnpm vitest run packages/supi-core/__tests__/unit/config/config-settings.test.ts` passes
- `pnpm exec tsc -b packages/supi-core/tsconfig.json` passes
