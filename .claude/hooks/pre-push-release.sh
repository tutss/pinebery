#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // ""')
command=$(echo "$input" | jq -r '.tool_input.command // ""')
cwd=$(echo "$input" | jq -r '.cwd // ""')

if [[ "$tool" != "Bash" ]]; then
  exit 0
fi

if [[ ! "$command" =~ (^|[[:space:]\;\&\|])git[[:space:]]+push ]]; then
  exit 0
fi

if [[ -z "$cwd" || ! -f "$cwd/scripts/release.mjs" ]]; then
  exit 0
fi

cd "$cwd"

branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [[ "$branch" != "main" ]]; then
  exit 0
fi

last_tag=$(git describe --tags --abbrev=0 --match "v*" 2>/dev/null || echo "")
if [[ -n "$last_tag" ]]; then
  range_arg="$last_tag..HEAD"
else
  range_arg="HEAD"
fi

unreleased=$(git rev-list --count "$range_arg" 2>/dev/null || echo "0")
if [[ "$unreleased" -eq 0 ]]; then
  exit 0
fi

releasable=$(git log "$range_arg" --pretty=format:"%s" | grep -E "^(feat|fix|perf)(\(.+\))?!?:" || true)
breaking_body=$(git log "$range_arg" --pretty=format:"%b" | grep -E "^BREAKING[ -]CHANGE:" || true)

if [[ -z "$releasable" && -z "$breaking_body" ]]; then
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  jq -n --arg reason "Working tree dirty — release hook cannot bump version cleanly. Commit or stash, then push again." \
    '{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason } }'
  exit 0
fi

echo "[pre-push-release] unreleased commits on main detected — running release script..." >&2
if node scripts/release.mjs --push --gh-release >&2; then
  jq -n --arg reason "Release completed and pushed by hook (commit + tag + GH release). Skipping the original \`git push\` — everything is already on origin/main." \
    '{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason } }'
else
  jq -n --arg reason "Release script failed before push. See output above. Original \`git push\` blocked to avoid pushing un-released changes." \
    '{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason } }'
fi
