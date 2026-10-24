#!/usr/bin/env bash
# The Study 3 redesign round (D0-D4) from one command, with the commit it came from.
#
#   bash research/paper-calcs/r3/run.sh [--quick]
#
# Needs round 2's outputs (../r2/ctc-scores.csv, typical-user.json,
# study3-pages-viewport.csv); rerun research/paper-calcs/r2/run.sh first when the
# chain or the reference set changes. --quick runs every cell with few reps to
# check the pipeline (outputs get a -quick suffix).
#
# @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
# @license MIT
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
R3=research/paper-calcs/r3
QUICK=""
[[ "${1:-}" == "--quick" ]] && QUICK="--quick"

if [[ -n "$(git status --porcelain -- src)" ]]; then
  echo "warning: src/ has uncommitted changes; every output will say src_dirty: true" >&2
fi
echo "== bun $R3/raw-perturb.ts (self-test)"; bun "$R3/raw-perturb.ts"
echo "== bun $R3/pairs.ts"; bun "$R3/pairs.ts"
echo "== python3 -I $R3/redesign.py $QUICK"; python3 -I "$R3/redesign.py" $QUICK
