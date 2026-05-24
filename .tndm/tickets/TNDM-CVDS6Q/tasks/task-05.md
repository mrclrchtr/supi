# Task 5: Update evals.json to discourage routine command additions

Evals 1-3 already test for gotcha/non-obvious content — no prompt/expected_output changes needed.

Add an expectation to eval 1 to explicitly test that the skill does NOT propose adding routine commands from package.json:

```json
"The assistant does NOT propose adding routine commands like 'npm test' or 'npm run build'"
```

No changes to evals 2 or 3 — they already test for gotcha content and are aligned with the stricter standard.
