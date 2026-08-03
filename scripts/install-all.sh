#!/usr/bin/env bash
set -euo pipefail

LOCAL_FLAG=""
if [[ "${1:-}" == "-l" ]]; then
  LOCAL_FLAG="-l"
elif [[ -n "${1:-}" ]]; then
  echo "Usage: install-all.sh [-l]"
  echo ""
  echo "  (no args)  Install the full SuPi stack globally (release + beta)"
  echo "  -l         Install the full SuPi stack project-locally (.pi/settings.json)"
  exit 1
fi

PACKAGES=(
  supi-debug
  supi-code-intelligence
  supi-ask-user
  supi-claude-md
  supi-context
  supi-settings
  supi-extras
  supi-bash-timeout
  supi-web
  supi-cache
  supi-insights
  supi-review
  supi-prompt-suggestions
)

if ! command -v pi &>/dev/null; then
  echo "error: pi is not installed or not on PATH"
  exit 1
fi

SCOPE="global"
if [[ -n "$LOCAL_FLAG" ]]; then
  SCOPE="project-local"
fi

echo "Installing the full SuPi stack ($SCOPE)…"
echo ""

FAILED=()
for pkg in "${PACKAGES[@]}"; do
  APPR=""
  [[ -n "$LOCAL_FLAG" ]] && APPR="--approve"
  printf "  %-30s " "$pkg"
  if OUT=$(pi install "npm:@mrclrchtr/$pkg" $LOCAL_FLAG $APPR 2>&1); then
    echo "✓"
  else
    echo "✗"
    FAILED+=("$pkg")
    printf '%s\n' "$OUT" | sed 's/^/      /'
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
