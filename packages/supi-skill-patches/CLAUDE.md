# supi-skill-patches

## Sources and outputs

- `patches/mattpocock-skills/files/` is the source of truth for SuPi changes. Keep one patch fragment for each file added or changed in the patched dependency. Maintain SuPi-owned skills directly in repository-root `skills/<name>/` with their own license, never as upstream patch fragments or inside generated groups.
- `patches/mattpocock-skills/combined.patch` is generated for pnpm. Run `pnpm skills:patches:compose` after a fragment changes.
- `upstream.json` records every upstream group and skill name. Its `includedGroups` map selects eligible stable groups; only skills with per-file patch fragments are mirrored to root `skills/`.
- Each selected root `skills/<group>/` directory is generated output for skills.sh and is replaced as one unit. Do not put unmanaged files in these directories. `skills:sync` also generates `.claude-plugin/marketplace.json` to group the public catalog into Matt Pocock and SuPi skills for skills.sh. Project-local `.pi/skills/` entries link to selected skill directories. Run `pnpm skills:sync` after the dependency changes.

## Update sequence

1. Update the `mattpocock-skills` Git tag in `package.json`.
2. Run `pnpm install`. If a patch no longer applies, fix the affected fragments, run `pnpm skills:patches:compose`, then retry installation.
3. Use `pnpm skills:patches:split` only to import a complete refreshed combined patch: it deletes and rebuilds the fragment tree.
4. Run `pnpm skills:sync`, review added, removed, and changed skills, and update affected `.pi/skills/` links manually.
5. Run `pnpm verify:ai`.

For a newly patched upstream skill, add its patch fragment, then run `pnpm skills:patches:compose`, `pnpm install`, and `pnpm skills:sync`.

Add and review patches one at a time only when they are necessary. Keep changes narrow. Each generated skill must include a license. The mirror adds `LICENSE.mattpocock` when a skill has no license; keep a license file directly in each SuPi-owned skill directory.
