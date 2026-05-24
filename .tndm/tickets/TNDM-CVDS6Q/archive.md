# Archive

## Verification Evidence

### Sync test (fresh)
```
pnpm vitest run packages/supi-claude-md/__tests__/unit/skill-references-sync.test.ts
→ PASS (6) FAIL (0)
```
All 3 reference files byte-identical between improver/ and revision/ copies.

### Delivered changes (7 files)
| File | Changes |
|------|---------|
| `quality-criteria.md` (both copies) | Criterion 1 → "Non-Obvious Commands & Workflows"; 200-line hard cap; "Every token earns its place" in Conciseness |
| `templates.md` (both copies) | Commands → "Non-Obvious Commands & Workflows"; dropped from Minimal/Comprehensive; Key Principles updated |
| `update-guidelines.md` (both copies) | Routine commands → "What NOT to Add"; new "What to REMOVE or Compress" (non-negotiable); Core Principle hardened |
| `improver SKILL.md` | Phase 1/3/5 reframed; token savings in report format; removal as step 1; anti-churn language; 200-line cap |
| `revision SKILL.md` | "What TO capture" qualified; removal step with MUST language; 200-line cap; anti-rationalization guardrails |
| `evals.json` | Anti-routine-command expectation added to eval 1 |

### Design compliance
All six planned changes delivered:
- ✅ Scoring rewards non-obvious, penalizes routine
- ✅ Templates no longer show routine commands as recommended
- ✅ Update guidelines use non-obvious examples, include removal section
- ✅ SKILL.md files qualified and hardened (MUST remove, anti-churn)
- ✅ Token savings motivation throughout (Context Baseline waste estimates)
- ✅ 200-line hard cap with score downgrade
- ✅ Package layout / project structure flagged for unconditional removal
- ✅ "Every token must earn its place" unifying philosophy

### Biome
- `.md` files not processed by this repo's Biome config (no Markdown formatter override)
- `evals.json` passes biome check
