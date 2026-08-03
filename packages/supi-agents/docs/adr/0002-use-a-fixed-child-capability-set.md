# Use a fixed child capability set

Agent Profiles may select only from a fixed package-owned Agent Capability Set: PI built-ins plus explicitly supported child-capable extensions, initially headless Code Intelligence. Agent Runs do not load ambient extensions because inactive tools do not prevent extension handlers and side effects from entering the child; unknown profile tools fail before prompting, and `supi_agent_run` is absent. This prevents model-tool recursion but makes no shell-level prevention claim for bash-capable profiles.
