# Task 3: Remove @upstash/context7-sdk dependency and run pnpm install

## Goal

Remove the SDK from the dependency tree.

## File

`packages/supi-web/package.json`

## Changes

1. Remove `"@upstash/context7-sdk"` from `dependencies`
2. Run `pnpm install` to update `pnpm-lock.yaml`
3. Verify `node_modules/@upstash/context7-sdk` no longer exists

## Verification

- Run `ls node_modules/@upstash/context7-sdk` — should fail with "No such file"
- Run `pnpm install` — clean exit, no errors
