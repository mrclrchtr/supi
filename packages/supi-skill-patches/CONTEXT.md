# supi-skill-patches

Maintenance boundary for the root skills.sh catalog.

## Language

**Upstream Skill Set**:
A third-party collection consumed from a pinned release.

**Skill Patch Fragment**:
The change for one upstream file. Fragments are the source of truth for SuPi compatibility changes.

**Combined Patch**:
The generated patch that pnpm applies when one or more fragments are active.

**Skill Mirror**:
The committed root `skills/<group>/` output generated from the pinned dependency. Each selected group is replaced as one unit. skills.sh installs skills from this catalog.

**Upstream Inventory**:
All observed upstream groups and skill names recorded in `upstream.json`. Its included-groups map selects mirrored groups. Inventory drift reports added, removed, or moved skills.
