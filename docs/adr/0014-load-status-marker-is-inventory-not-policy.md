# Load Status Marker is Inventory, Not Policy

The `SUPI_STATUS` load status marker is a versioned diagnostic emitted for external harnesses that need to inspect what SuPi resources loaded. We will bump the marker to version 2 and make it report observed tool and command inventory only, rather than embedding expected resource maps or deciding whether a harness-specific policy passed. Validation policy belongs to each consumer, which avoids duplicating full-stack expectations inside `supi-debug` and prevents stale expected lists from becoming false failures.
