# supi-skill-patches

Private maintenance workspace for SuPi-compatible third-party skills.

## Sources and outputs

- `mattpocock-skills` is a pinned development dependency.
- No patches are active. Root skills must match the pinned upstream files.
- When a SuPi change is necessary, keep one fragment for each changed upstream file under `patches/mattpocock-skills/files/`.
- `patches/mattpocock-skills/combined.patch` is generated for pnpm only when patch fragments exist.
- `upstream.json` records every upstream group and skill name. Its `includedGroups` map selects the stable groups mirrored to root `skills/`.
- Root `skills/<name>/` directories are generated outputs for skills.sh. Run `pnpm skills:sync` after the dependency changes.

## Update sequence

1. Update the `mattpocock-skills` Git tag in `package.json`.
2. Run `pnpm install`.
3. Run `pnpm skills:sync` and review added, removed, and changed skills.
4. Run `pnpm verify:ai`.

Add and review patches one at a time only when they are necessary. Register the combined patch in `pnpm-workspace.yaml` when the first patch becomes active. Keep changes narrow. Each generated skill must include `LICENSE.mattpocock`.
