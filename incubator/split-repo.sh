#!/usr/bin/env bash
# Extract an incubator project into its own standalone git repo and push it.
#
#   ./incubator/split-repo.sh <project> <git-remote-url>
#   ./incubator/split-repo.sh lightcast git@github.com:alextheprophecy/lightcast.git
set -euo pipefail

PROJECT="${1:?usage: split-repo.sh <project> <git-remote-url>}"
REMOTE="${2:?usage: split-repo.sh <project> <git-remote-url>}"
SRC="$(cd "$(dirname "$0")/$PROJECT" && pwd)"
DEST="$(mktemp -d)/$PROJECT"

cp -R "$SRC" "$DEST"
cd "$DEST"
git init -q
git add -A
git commit -qm "feat: $PROJECT v0.0.1 — initial scaffold (extracted from depthcast incubator)"
git branch -M main
git remote add origin "$REMOTE"
git push -u origin main
echo "Pushed $PROJECT → $REMOTE  (working copy: $DEST)"
