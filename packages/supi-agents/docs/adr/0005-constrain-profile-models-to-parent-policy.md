# Constrain profile models to parent policy

An Agent Profile's explicit model must be authenticated and permitted by the containing PI session's scoped-model policy; otherwise the Delegation Batch is rejected before any Agent Run starts. Project trust authorizes profile instructions and tools but does not authorize bypassing the user's model and cost boundary, while omitted model and thinking values inherit the containing session.
