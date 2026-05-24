#!/usr/bin/env bash
set -euo pipefail

LOCAL_FLAG=""
if [[ "${1:-}" == "-l" ]]; then
  LOCAL_FLAG="-l"
elif [[ -n "${1:-}" ]]; then
  echo "Usage: install-all.sh [-l]"
  echo ""
  echo "  (no args)  Install all SuPi packages globally"
  echo "  -l         Install all SuPi packages project-locally (.pi/settings.json)"
  exit 1
fi

PACKAGES=(
  supi-lsp
  supi-tree-sitter
  supi-code-intelligence
  supi-ask-user
  supi-claude-md
  supi-context
  supi-debug
  supi-extras
  supi-bash-timeout
  supi-web
  supi-cache
  supi-insights
  supi-review
  supi-rtk
)

if ! command -v pi &>/dev/null; then
  echo "error: pi is not installed or not on PATH"
  exit 1
fi

SCOPE="global"
if [[ -n "$LOCAL_FLAG" ]]; then
  SCOPE="project-local"
fi

echo "Installing all SuPi packages ($SCOPE)…"
echo ""

FAILED=()
for pkg in "${PACKAGES[@]}"; do
  printf "  %-30s " "$pkg"
  if pi install "npm:@mrclrchtr/$pkg" $LOCAL_FLAG &>/dev/null; then
    echo "✓"
  else
    echo "✗"
    FAILED+=("$pkg")
  fi
done

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "Done — ${#PACKAGES[@]} packages installed ($SCOPE)."
  echo ""
  echo "Run /reload in pi to pick up new extensions."
else
  echo "Done with ${#FAILED[@]} failure(s): ${FAILED[*]}"
  exit 1
fi
