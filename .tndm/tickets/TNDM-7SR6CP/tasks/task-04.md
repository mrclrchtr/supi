# Task 4: Wave 1d: Remove unsupported code_apply modes

Reduce CodeApplyParameters mode enum from 3 to just ["apply"]. Remove the explicit-unavailable check since the schema won't accept other modes. Update tool-specs guidelines.
