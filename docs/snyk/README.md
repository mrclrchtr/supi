# Snyk — Fetching Project Findings

How to programmatically retrieve Snyk findings (SAST, open-source, IaC, container) using the Snyk CLI and REST API.

## Prerequisites

- Snyk CLI installed and authenticated (OAuth or token)
- A Snyk project already imported (e.g. via the GitHub app)

## Authentication

The Snyk CLI (≥ v1.1293) uses **OAuth** by default. Tokens are stored in:

```
~/.config/configstore/snyk.json
```

The stored JSON contains an `INTERNAL_OAUTH_TOKEN_STORAGE` field with the OAuth
access token, refresh token, and expiry.

### Extracting the access token

```python
import json
from pathlib import Path

config_path = Path.home() / ".config" / "configstore" / "snyk.json"
with open(config_path) as f:
    data = json.load(f)
storage = json.loads(data["INTERNAL_OAUTH_TOKEN_STORAGE"])
print(storage["access_token"])
```

Or from the shell:

```bash
TOKEN=$(python3 -c "
import json
from pathlib import Path

config_path = Path.home() / '.config' / 'configstore' / 'snyk.json'
with open(config_path) as f:
    data = json.load(f)
storage = json.loads(data['INTERNAL_OAUTH_TOKEN_STORAGE'])
print(storage['access_token'])
")
```

> **Note:** The token scope is `org.read` — sufficient for reading orgs, projects,
> and issues but not for writes.

## Key IDs

You need two IDs to query findings:

| Entity | How to get it |
|---|---|
| **Org ID** (UUID) | `snyk api /rest/orgs?version=2024-10-15&slug=<slug>` |
| **Project ID** (UUID) | From project settings URL: `app.snyk.io/org/<slug>/project/<project-id>` |

### Finding the Org ID

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.snyk.io/rest/orgs?version=2024-10-15&slug=<org-slug>" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data'][0]['id'])"
```

## Fetching Issues

### 1. All issues for a project (REST API v3)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.snyk.io/rest/orgs/$ORG_ID/issues?version=2024-10-15&project_id=$PROJ_ID&limit=100"
```

Returns up to `limit` issues (default/max varies by API version). Results include
both open-source dependency issues and Snyk Code (SAST) issues.

### 2. A single issue by REST API issue ID

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.snyk.io/rest/orgs/$ORG_ID/issues/$ISSUE_ID?version=2024-10-15"
```

### 3. Pagination

The response includes a `links.next` field when more results are available:

```python
import json, urllib.request

url = f"https://api.snyk.io/rest/orgs/{org_id}/issues?version=2024-10-15&project_id={proj_id}&limit=100"
while url:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    resp = json.loads(urllib.request.urlopen(req).read())
    for issue in resp["data"]:
        process(issue)
    url = resp.get("links", {}).get("next")
```

## Understanding Issue IDs

Snyk has **two separate ID systems** for the same issue:

| ID type | Format | Where used | REST API field |
|---|---|---|---|
| **REST issue ID** | UUID (e.g. `4a18d42f-...`) | API paths, programmatic access | `data[].id` |
| **Problem key** | UUID (e.g. `c0bff3ac-...`) | Web UI hash fragments (`#issue-...`) | `data[].attributes.key` / `data[].attributes.problems[].id` |

The URL `https://app.snyk.io/org/<slug>/project/<project-id>#issue-<problem-key>` uses the
**problem key** in the hash fragment, **not** the REST API issue ID. To look up
an issue from a web URL:

1. Fetch all issues for the project
2. Find the issue where `attributes.key` or `attributes.problems[].id` matches
3. Use `data[].id` as the REST API issue ID

## File Locations for Code (SAST) Issues

File locations are nested inside `attributes.coordinates`:

```json
{
  "attributes": {
    "coordinates": [{
      "representations": [{
        "sourceLocation": {
          "file": "packages/foo/src/bar.ts",
          "region": {
            "start": { "line": 42, "column": 1 },
            "end":   { "line": 42, "column": 30 }
          }
        }
      }]
    }]
  }
}
```

Extract in Python:

```python
for coord in issue["attributes"]["coordinates"]:
    for rep in coord["representations"]:
        sl = rep["sourceLocation"]
        print(f"{sl['file']}:{sl['region']['start']['line']}")
```

> Note: The `attributes.locations` field is **empty** for code issues — file
> locations live in `coordinates[].representations[].sourceLocation` instead.

## Complete Example (Python)

```python
import json, urllib.request, os

# Extract token
with open(os.path.expanduser("~/.config/configstore/snyk.json")) as f:
    storage = json.loads(json.load(f)["INTERNAL_OAUTH_TOKEN_STORAGE"])
token = storage["access_token"]

org_id  = "<org-id>"   # e.g. "adde2063-..."
proj_id = "<project-id>"  # e.g. "12eb6d43-..."

url = f"https://api.snyk.io/rest/orgs/{org_id}/issues?version=2024-10-15&project_id={proj_id}&limit=100"

while url:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    resp = json.loads(urllib.request.urlopen(req).read())

    for issue in resp["data"]:
        attrs = issue["attributes"]
        sev   = attrs["effective_severity_level"]
        title = attrs["title"]
        key   = attrs.get("key", "")
        files = [
            r["sourceLocation"]["file"]
            for c in attrs.get("coordinates", [])
            for r in c.get("representations", [])
            if "sourceLocation" in r
        ]
        print(f"[{sev.upper()}] {title}  key={key}  files={files}")

    url = resp.get("links", {}).get("next")
```

## CLI Quick Reference

```bash
# Authenticate (opens browser)
snyk auth

# Test current project
snyk test --all-projects

# Scan with Snyk Code (SAST)
snyk code test

# Monitor (push snapshot to platform)
snyk monitor

# Generate SBOM
snyk sbom --format=cyclonedx1.5+json
```
