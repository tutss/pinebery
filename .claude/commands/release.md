---
description: Cut a new Pinebery release — bump version, generate CHANGELOG, build, zip, tag, GitHub release, and print the Chrome Web Store upload URL
argument-hint: [--major|--minor|--patch] [--push] [--no-gh-release] [--dry-run] [--open]
---

# Release

Run the release script for this project. The script handles version bumping, CHANGELOG generation, build, zipping, tagging, and (optionally) pushing + creating a GitHub release.

## Defaults

- Bump level is inferred from conventional commit prefixes since the last `v*` tag (`feat:` → minor, `fix:`/`perf:` → patch, `feat!:` or `BREAKING CHANGE:` → major).
- A GitHub Release is created with the zip attached (`--no-gh-release` to skip).
- The push step is opt-in via `--push`. Without it, the script commits and tags locally only.
- `--open` opens the Chrome Web Store package upload page in the default browser.

## Steps

1. Check `git status` — refuse to release if the tree is dirty.
2. Run `node scripts/release.mjs $ARGUMENTS`.
3. If the script exits with "No releasable conventional commits", ask the user which bump level they want (`--patch`, `--minor`, `--major`) and re-run with that flag.
4. After success, surface the printed CWS upload URL so the user can drag the zip in.

## Notes

- The pre-push hook (`.claude/hooks/pre-push-release.sh`) auto-runs this script with `--push --gh-release` whenever you run `git push` from `main` with unreleased conventional commits. The `/release` slash command is for manual runs (e.g., bumping without pushing, or overriding the bump level).
- The Chrome Web Store still requires a manual upload after the zip is created. The dashboard URL is printed at the end.
