#!/bin/sh
# Read-only commit facts for the current working tree; never stage, fix, or run hooks.
set -eu
export LC_ALL=C GIT_OPTIONAL_LOCKS=0

if [ "$#" -ne 0 ]; then
  printf 'Usage: sh %s (run inside the target working tree)\n' "$0" >&2
  exit 2
fi
# Print added/deleted/path line counts for one diff, capped at 20 files.
line_counts() {
  counts=$(git -c core.fsmonitor=false --no-pager diff "$@" --numstat --no-color --no-ext-diff --no-textconv)
  if [ -z "$counts" ]; then
    printf 'none\n'
    return
  fi
  printf '%s\n' "$counts" | awk 'NR <= 20 { print } END { if (NR > 20) printf "... %d more files\n", NR - 20 }'
}

root=$(git rev-parse --show-toplevel)
cd "$root"

printf '== State (paths relative to worktree root) ==\n'
git -c core.fsmonitor=false status --porcelain=v1 --branch --untracked-files=all

printf '\n== Active operation markers ==\n'
operation=false
for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply sequencer; do
  path=$(git rev-parse --git-path "$marker")
  if [ -e "$path" ]; then
    printf '%s\n' "$marker"
    operation=true
  fi
done
if [ "$operation" = false ]; then printf 'none\n'; fi

# Unstaged counts expose unrelated work in files that also hold task changes.
printf '\n== Line counts: added deleted path (first 20 files) ==\n'
printf 'Staged (not a patch audit):\n'
line_counts --cached

printf 'Unstaged (tracked files):\n'
line_counts

printf '\n== Recent subjects ==\n'
if git rev-parse --verify -q HEAD >/dev/null; then
  git --no-pager log -5 --format=%s --no-show-signature
else
  code=$?
  if [ "$code" -ne 1 ]; then exit "$code"; fi
  printf 'none (no commits yet)\n'
fi

printf '\n== Commit hooks (registration only; not execution) ==\n'
listing=true
for event in pre-commit prepare-commit-msg commit-msg post-commit; do
  if [ "$listing" = true ]; then
    if hooks=$(git hook list --show-scope "$event" 2>&1); then
      printf '%s: %s\n' "$event" "$(printf '%s\n' "$hooks" | tr '\t' ' ' | awk 'NR > 1 { printf "; " } { printf "%s", $0 }')"
      continue
    else
      code=$?
    fi
    case "$code:$hooks" in
      1:*"no hooks found for event '$event'"*)
        printf '%s: absent\n' "$event"
        continue
        ;;
      129:*|1:"git: 'hook' is not a git command."*)
        listing=false
        printf 'git hook list unsupported; inspecting hook files.\n'
        # Older Git cannot verify config-registered hooks. Do not claim they are absent.
        if configured=$(git config --get-regexp '^hook\..*\.event$' 2>&1); then
          printf 'Hook inspection failed: configured events cannot be verified by this Git.\n%s\n' "$configured" >&2
          exit 1
        else
          code=$?
          if [ "$code" -ne 1 ]; then
            printf 'Hook inspection failed:\n%s\n' "$configured" >&2
            exit "$code"
          fi
        fi
        ;;
      *)
        printf 'Hook inspection failed (%s):\n%s\n' "$event" "$hooks" >&2
        exit "$code"
        ;;
    esac
  fi

  # rev-parse respects core.hooksPath, including relative paths and linked worktrees.
  path=$(git rev-parse --git-path "hooks/$event")
  if [ -f "$path" ] && [ -x "$path" ]; then
    printf '%s: executable file (%s)\n' "$event" "$path"
  elif [ -e "$path" ]; then
    printf '%s: inactive file (not executable or not a regular file: %s)\n' "$event" "$path"
  else
    printf '%s: absent\n' "$event"
  fi
done
