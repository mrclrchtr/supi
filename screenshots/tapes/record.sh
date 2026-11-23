#!/usr/bin/env bash
# Record README screenshots with vhs.
#
# Usage:
#   screenshots/tapes/record.sh              # all tapes
#   screenshots/tapes/record.sh supi-web     # selected tapes (names without .tape)
#
# Requires: vhs, ImageMagick (magick), Google Chrome (insights report only),
# FiraCode Nerd Font Mono, and a Pi login for the model below.
#
# The script temporarily sets `quietStartup` in .pi/settings.json, routes child
# sessions to the screenshot model in .pi/supi/config.json and .pi/supi/agents/,
# and replaces ~/.pi/agent/supi/prompt-stash.json with demo entries. Everything
# is restored on exit.
# Screenshots show real local data (paths, session statistics). Review every
# image for sensitive content before committing.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TAPES="$ROOT/screenshots/tapes"
SHOTS="$ROOT/screenshots"
TMP=/tmp/supi-screenshots
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
STASH_FILE="$HOME/.pi/agent/supi/prompt-stash.json"
INSIGHTS_DIR="$HOME/.pi/agent/supi/insights"

export SCREENSHOT_MODEL="${SCREENSHOT_MODEL:-claude-code/claude-haiku-5-5:off}"
export SCREENSHOT_THEME="${SCREENSHOT_THEME:-catppuccin-latte/catppuccin-macchiato}"

cd "$ROOT"
mkdir -p "$TMP"

if [[ -e .pi/supi/agents ]]; then
  echo ".pi/supi/agents already exists; refusing to overwrite it" >&2
  exit 1
fi

settings_backup="$TMP/settings.json"
config_backup="$TMP/supi-config.json"
cp .pi/settings.json "$settings_backup"
cp .pi/supi/config.json "$config_backup"
restore_stash() {
  if [[ -f "$TMP/stash-backup.json" ]]; then
    cp "$TMP/stash-backup.json" "$STASH_FILE"
    rm "$TMP/stash-backup.json"
  elif [[ -f "$TMP/stash-absent" ]]; then
    rm -f "$STASH_FILE" "$TMP/stash-absent"
  fi
}
restore() {
  cp "$settings_backup" .pi/settings.json
  cp "$config_backup" .pi/supi/config.json
  rm -rf .pi/supi/agents
  restore_stash
}
trap restore EXIT
jq '. + {quietStartup: true}' "$settings_backup" > .pi/settings.json

# Route every child session (reviewers, planner, agent runs, suggestions,
# improver) to the screenshot model so recordings stay cheap and repeatable.
CHILD_MODEL="${SCREENSHOT_MODEL%%:*}"
# Prompt suggestions stay off except in their own tape, so other recordings
# do not show unrelated ghost text.
write_config() {
  local suggestion_model=$1
  jq --arg m "$CHILD_MODEL" --arg s "$suggestion_model" '
    .review += {agentModel: $m, plannerModel: $m, reviewerThinkingLevel: "off",
                plannerThinkingLevel: "off", recoveryModel: "disabled",
                postReviewPolicy: "report", auditEnabled: false}
    | .promptSuggestions = {model: $s}
    | .promptImprover = {model: $m}
  ' "$config_backup" > .pi/supi/config.json
}
for profile in explore general; do
  mkdir -p ".pi/supi/agents/$profile"
  printf '{ "model": "%s", "thinking": "off" }\n' "$CHILD_MODEL" > ".pi/supi/agents/$profile/profile.json"
done

seed_stash() {
  mkdir -p "$(dirname "$STASH_FILE")"
  if [[ -f "$STASH_FILE" ]]; then cp "$STASH_FILE" "$TMP/stash-backup.json"; else touch "$TMP/stash-absent"; fi
  node -e '
    const now = Date.now();
    const stashes = {};
    [
      ["Code review", "Review the changes since main for correctness, missing tests, and unclear naming."],
      ["Release checklist", "Prepare the next release: run pnpm verify:ai and draft the root changelog."],
      ["Refactor plan", "Propose a step-by-step plan to split the settings module into read and apply phases."],
    ].forEach(([name, text], i) => {
      const id = `stash-${now - i * 60000}-demo${i}`;
      stashes[id] = { id, name, text, createdAt: now - i * 60000 };
    });
    require("fs").writeFileSync(process.argv[1], JSON.stringify({ stashes }, null, 2));
  ' "$STASH_FILE"
}

# Render two cropped views of the newest insights HTML report.
render_insights() {
  local report
  report=$(ls -t "$INSIGHTS_DIR"/report-*.html | head -1)
  # Header and stats only; project summaries can contain private details.
  sed 's#</head>#<style>.at-a-glance,.container > :not(h1):not(.subtitle):not(.failure-banner):not(.stats-row){display:none!important}</style></head>#' \
    "$report" > "$TMP/insights-2.html"
  # First two chart rows only.
  node -e '
    const fs = require("fs");
    const html = fs.readFileSync(process.argv[1], "utf8");
    const rows = [];
    let start = 0;
    while ((start = html.indexOf("<div class=\"charts-row\"", start)) !== -1) {
      const re = /<div\b|<\/div>/g;
      re.lastIndex = start;
      let depth = 0, end = start, m;
      while ((m = re.exec(html))) {
        depth += m[0] === "</div>" ? -1 : 1;
        if (depth === 0) { end = re.lastIndex; break; }
      }
      rows.push(html.slice(start, end));
      start = end;
    }
    const head = html.slice(0, html.indexOf("<body"));
    fs.writeFileSync(process.argv[2], `${head}<body><div class="container">${rows.slice(0, 2).join("\n")}</div></body></html>`);
  ' "$report" "$TMP/insights-1.html"
  for n in 1 2; do
    "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1000,900 \
      --screenshot="$TMP/insights-$n.png" "file://$TMP/insights-$n.html" 2>/dev/null
    magick "$TMP/insights-$n.png" -trim -bordercolor '#f8fafc' -border 40 -resize 50% "$SHOTS/supi-insights-$n.png"
  done
}

run_tape() {
  local name=$1
  echo "==> $name"
  [[ $name == supi-extras-stash ]] && seed_stash
  if [[ $name == supi-prompt-suggestions ]]; then write_config "$CHILD_MODEL"; else write_config disabled; fi
  touch "$TMP/marker"
  vhs "$TAPES/$name.tape" > "$TMP/$name.log" 2>&1 || { tail -5 "$TMP/$name.log"; return 1; }
  case $name in
    supi-extras-stash) restore_stash ;;
    supi-context)
      # Keep the report header: summary, usage by category, system prompt composition.
      # The report heading starts with an accent-colored diamond at x=30; find
      # its first row and crop from just above it.
      local y top=""
      for ((y = 20; y < 1200; y += 2)); do
        if [[ $(magick "$TMP/supi-context-full.png" -format "%[pixel:p{30,$y}]" info:) == "srgb(136,173,246)" ]]; then
          top=$y
          break
        fi
      done
      [[ -n $top ]] || { echo "supi-context: report heading not found" >&2; return 1; }
      magick "$TMP/supi-context-full.png" -crop "1400x460+0+$((top - 10))" +repage \
        -bordercolor '#24273a' -border 0x20 "$SHOTS/supi-context.png" ;;
    supi-insights) render_insights ;;
    supi-extras-codemode)
      # Keep only the codemode row and the reply below it.
      magick "$TMP/supi-extras-codemode-full.png" -crop 1400x310+0+100 +repage \
        -bordercolor '#24273a' -border 0x10 "$SHOTS/supi-extras-codemode.png" ;;
  esac
  # Palette-reduce new images; the pre-commit hook rejects files over 500 KB.
  # (BSD find ends -exec at an argument after {} that starts with "+", so loop.)
  local img
  for img in "$SHOTS"/*.png; do
    if [[ $img -nt "$TMP/marker" ]]; then
      magick "$img" +dither -colors 256 -define png:compression-level=9 "PNG8:$img"
    fi
  done
  # GIFs: 6 fps, 75% scale, 32-color palette, only changed rectangles per frame.
  for img in "$SHOTS"/*.gif; do
    if [[ $img -nt "$TMP/marker" ]]; then
      ffmpeg -loglevel error -y -i "$img" -vf \
        "fps=6,scale=iw*3/4:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
        "$TMP/optimized.gif"
      mv "$TMP/optimized.gif" "$img"
    fi
  done
}


if [[ $# -gt 0 ]]; then
  names=("$@")
else
  names=()
  for f in "$TAPES"/*.tape; do
    n=$(basename "$f" .tape)
    [[ $n == _* ]] || names+=("$n")
  done
fi

for n in "${names[@]}"; do run_tape "$n"; done
