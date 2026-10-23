#!/usr/bin/env bash
# Every round-2 paper number from one command, with the commit it came from.
#
#   UEYES_DIR=/path/to/UEyes_dataset bash research/paper-calcs/r2/run.sh [--quick]
#
# Run as the tree's owner. Without UEYES_DIR the ceiling step is skipped (the
# corpus is not in the repo). --quick runs the power simulation with 60 reps per
# cell to check the pipeline; its outputs carry a -quick suffix.
#
# Each output records git_head, src_tree (the hash of src/ at that commit, which
# is what decides the CTC numbers) and src_dirty. RUN.json records the run.
#
# @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
# @license MIT
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
R2=research/paper-calcs/r2
QUICK=""
[[ "${1:-}" == "--quick" ]] && QUICK="--quick"

if [[ -n "$(git status --porcelain -- src)" ]]; then
  echo "warning: src/ has uncommitted changes; every output will say src_dirty: true" >&2
fi

declare -a STEPS=()
step() {
  local t0=$SECONDS
  echo "== $*"
  "$@"
  STEPS+=("{\"command\": \"$*\", \"seconds\": $((SECONDS - t0))}")
}

step bun "$R2/typical-user.ts"
step python3 -I "$R2/face_validity.py"
step python3 -I "$R2/power.py" --scope viewport $QUICK
step python3 -I "$R2/power.py" --scope full_page $QUICK
if [[ -n "${UEYES_DIR:-}" ]]; then
  step bun research/study1/run-ceiling.ts --data "$UEYES_DIR" --out "$R2/ceiling"
  step python3 -I research/paper-calcs/study1_intervals.py "$R2/ceiling/per_image.csv" "$R2/ceiling-intervals"
else
  echo "UEYES_DIR not set: ceiling skipped" >&2
fi

{
  echo "{"
  echo "  \"git_head\": \"$(git rev-parse HEAD)\","
  echo "  \"src_tree\": \"$(git rev-parse HEAD:src)\","
  echo "  \"src_dirty\": $([[ -n "$(git status --porcelain -- src)" ]] && echo true || echo false),"
  echo "  \"finished\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"quick\": $([[ -n "$QUICK" ]] && echo true || echo false),"
  # The corpus path is a machine path: record the variable, not its value.
  if [[ -n "${UEYES_DIR:-}" ]]; then STEPS=("${STEPS[@]//"$UEYES_DIR"/\$UEYES_DIR}"); fi
  echo "  \"steps\": [$(IFS=,; echo "${STEPS[*]}")]"
  echo "}"
} > "$R2/RUN${QUICK:+-quick}.json"
echo "wrote $R2/RUN${QUICK:+-quick}.json"
