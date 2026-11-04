#!/usr/bin/env bash
#
# test-gate — the suite the release gate blocks on.
#
# Runs every test file EXCEPT the real-browser ones listed in
# scripts/browser-tests.txt. Those still run, in the Tests workflow
# (scripts/test-split.sh runs every file; on CI it skips its QUARANTINED_ON_CI
# file, which there runs only in the non-blocking diagnostic step) -- they are
# excluded from the GATE, not from the suite. Deleting coverage to make a gate green would be the
# dishonest version of this.
#
# WHY THEY WERE QUARANTINED (2026-07-27)
#
# Browser tests in the gate hit their declared ceilings EXACTLY (180000.84ms,
# 60004.93ms) when the full set ran -- a hang, not slowness -- and the failure
# rotated between tests on every run. Alone they were solid. Eight mechanisms
# were proposed and seven refuted by measurement at the time (shared data dir,
# orphaned Chrome, a console.log patch, AbortSignal timeouts, bun concurrency,
# glob discovery, an fd leak into research/); test-file position was real in a
# 33-file set and did not generalise. A Chrome-killing reaper started at module
# import was real and fixed (cd18fbd) but was not the hang.
#
# The cause, found 2026-10-24: Bun before 1.4.0 closes a dead
# node:child_process child's pipes 3 and up a second time at GC, which can shut
# the next browser's CDP pipe or a Bun.spawn child's pidfd. See
# scripts/test-split.sh and tests/bun-extra-stdio-late-close*.test.ts. It is
# gone in Bun 1.4.0, and CI installs latest.
#
# WHY THEY STAY OUT OF THE GATE (2026-11-04)
#
# Time, not the hang. On GitHub's runners the browser files alone took 946 to
# 1218 s in the Tests workflow (6 runs, 2026-11-03/04), and this gate took 301
# to 640 s without them (10 Release runs, 2026-11-03/04). Together that is 21
# to 31 minutes against the release step's 20-minute bound, so moving them in
# would fail releases on the clock.
# And two listed files replace modules through mock.module, which leaks into
# every later file in the same process (scripts/test-split.sh header); this
# gate is one process.

set -euo pipefail
cd "$(dirname "$0")/.."

# Every test file that drives a REAL browser. These run in the Tests workflow
# (scripts/test-split.sh, less its CI-only quarantine), not in the gate.
#
# Widened 2026-07-27 from two files to the whole browser family, on CI evidence:
# two consecutive Release runs on the SAME commit failed with DIFFERENT subsets
# (6 fail/473s, then 2 fail/264s), and every failure in both was a browser
# capture test hitting its ceiling. Meanwhile the Tests workflow ran the full
# suite on that same commit and passed. Picking individual files was chasing
# whichever ones lost the coin flip that run.
#
# This is the conventional split rather than a concession: real-browser tests
# belong in their own job, not in the gate a release blocks on. A 2-core CI
# runner cannot give a 60s wall-clock capture the headroom this box does.
# 2026-09-17: this list is no longer written here. It was a hand-maintained
# string that had drifted from test-split.sh's ISOLATED_FILES -- the gate
# quarantined 7 files while the split isolated 10, so five browser-launching
# files (alt-attribute-classification, freeze-animations, selector-escape,
# sticky-overlay-threshold, svg-classname) ran inside THIS script's single
# shared process, which is exactly the contention the header above says the
# quarantine exists to prevent. Reproduced locally 2026-09-17: two failures at
# exactly 60000.96ms and 5001.00ms, a hung launch reported at its ceiling.
#
# Both scripts now read scripts/browser-tests.txt, and
# tests/ci-runner-config.test.ts fails if a browser-launching file is missing
# from it.
BROWSER_LIST="$(dirname "$0")/browser-tests.txt"
if [ ! -f "$BROWSER_LIST" ]; then
  echo "test-gate: $BROWSER_LIST is missing — refusing to run, because without it" >&2
  echo "           every real-browser test would silently join the shared pass." >&2
  exit 1
fi
QUARANTINED=$(grep -vE '^[[:space:]]*(#|$)' "$BROWSER_LIST" | paste -sd'|' -)
if [ -z "$QUARANTINED" ]; then
  echo "test-gate: $BROWSER_LIST parsed to an empty list — refusing to run." >&2
  exit 1
fi

FILES=$(find tests src -name '*.test.ts' | grep -vE "$QUARANTINED" | sort | tr '\n' ' ')

if [ -z "$FILES" ]; then
  echo "test-gate: found no test files — refusing to report success on an empty run." >&2
  exit 1
fi

echo "test-gate: running $(echo "$FILES" | wc -w) files (quarantined: $(echo "$QUARANTINED" | tr '|' ' '))"
# 30 s per test unless a test sets its own. GitHub's runners differ about 2x
# in speed for the same image (2026-11-03: the gate took 296 s, 301 s, 582 s
# and 588 s), and on the slow ones CPU-bound tests passed bun's 5 s default:
# 21.3.0's release gate failed on two that take 0.7 s and 0.9 s here.
exec bun test --timeout 30000 $FILES
