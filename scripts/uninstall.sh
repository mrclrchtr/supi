#!/usr/bin/env bash
set -euo pipefail

LOCAL_FLAG=""
if [[ "${1:-}" == "-l" ]]; then
  LOCAL_FLAG="-l"
elif [[ -n "${1:-}" ]]; then
  echo "Usage: uninstall.sh [-l]"
  echo ""
  echo "  (no args)  Uninstall the release SuPi stack globally"
  echo "  -l         Uninstall the release SuPi stack project-locally (.pi/settings.json)"
  exit 1
fi

PACKAGES=(
  supi-code-intelligence
  supi-ask-user
  supi-context
  supi-settings
  supi-debug
  supi-extras
  supi-web
  supi-prompt-suggestions
)

# Deprecated or removed packages — best-effort cleanup, not counted as failures.
REMOVED_PACKAGES=(
  supi
  supi-rtk
  supi-lsp
  supi-tree-sitter
)

if ! command -v pi &>/dev/null; then
  echo "error: pi is not installed or on PATH"
  exit 1
fi

SCOPE="global"
if [[ -n "$LOCAL_FLAG" ]]; then
  SCOPE="project-local"
fi

echo "Uninstalling the release SuPi stack ($SCOPE)…"
echo ""

FAILED=()
for pkg in "${PACKAGES[@]}"; do
  printf "  %-30s " "$pkg"
  if pi uninstall "npm:@mrclrchtr/$pkg" $LOCAL_FLAG &>/dev/null; then
    echo "✓"
  else
    echo "✗"
    FAILED+=("$pkg")
  fi
done

# Clean up deprecated / removed packages (best-effort).
if [[ ${#REMOVED_PACKAGES[@]} -gt 0 ]]; then
  echo ""
  echo "Removing deprecated / removed packages…"
  for pkg in "${REMOVED_PACKAGES[@]}"; do
    printf "  %-30s " "$pkg"
    if pi uninstall "npm:@mrclrchtr/$pkg" $LOCAL_FLAG &>/dev/null; then
      echo "✓"
    else
      echo "—"
    fi
  done
fi

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "Done — ${#PACKAGES[@]} release packages uninstalled ($SCOPE)."
  echo ""
  echo "Run /reload in pi to finalize."
else
  echo "Done with ${#FAILED[@]} failure(s): ${FAILED[*]}"
  exit 1
fi
