# supi-skill-patches

Private maintenance workspace for SuPi-compatible third-party skills.

## Sources and outputs

- `mattpocock-skills` is a pinned development dependency.
- `patches/mattpocock-skills/files/` is the source of truth for SuPi changes. Keep one patch fragment for each changed upstream file.
- `patches/mattpocock-skills/combined.patch` is generated for pnpm. Run `pnpm skills:patches:compose` after a fragment changes.
- `upstream.json` records every upstream group and skill name. Its `includedGroups` map selects the stable groups mirrored to root `skills/`.
- Each selected root `skills/<group>/` directory is a generated output for skills.sh and is replaced as one unit. Do not put unmanaged files in these directories. Run `pnpm skills:sync` after the dependency changes.

## Update sequence

1. Update the `mattpocock-skills` Git tag in `package.json`.
2. Run `pnpm install`. Resolve patch conflicts through `pnpm patch` when necessary.
3. Split a refreshed combined patch with `pnpm skills:patches:split`, then compose it again.
4. Run `pnpm skills:sync` and review added, removed, and changed skills.
5. Run `pnpm verify:ai`.

Add and review patches one at a time only when they are necessary. Keep changes narrow. Each generated skill must include `LICENSE.mattpocock`.
