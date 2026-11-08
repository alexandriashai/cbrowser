#!/usr/bin/env bash
# Run the suite in two processes, isolating the browser-heavy file.
#
# WHY (measured 2026-07-27, not inferred):
#
#   all files EXCEPT cli-evaluate-keyboard ...... 502 pass / 0 fail
#   cli-evaluate-keyboard.test.ts alone ......... 34 pass / 0 fail
#   everything in ONE `bun test` ................ 1 fail, every run
#
# Only the union fails, and WHICH test times out is random — four different ones
# across five runs — always at exactly 60000ms. That file launches a real Chrome
# per test, 34 of them, and something accumulates across a long-lived `bun test`
# process until a launch hangs.
#
# THE CAUSE, found 2026-10-24: Bun before 1.4.0 closes a dead
# node:child_process child's pipes 3 and up a second time when the
# ChildProcess is garbage collected. Playwright starts chromium with CDP on
# pipes 3 and 4, so a GC after a browser closed shut whatever held those fd
# numbers by then: the next browser's CDP pipe (the hung launch) or a
# Bun.spawn child's pidfd (a CLI child whose exit never resolved). Every
# closed browser left two such numbers behind, which is why only a long
# process hung. Measured on Bun 1.3.8 and 1.3.14, gone in 1.4.0 and 1.4.4;
# tests/bun-extra-stdio-late-close*.test.ts fail on a Bun that has it. (Seven
# hypotheses were falsified before that: probe budget, event-loop starvation,
# Chrome SingletonLock, parallel contention, the wedged capture in
# recording-autocapture, a single culprit predecessor, an arbitrary split.)
#
# WHY THE SPLIT STAYS (measured 2026-11-04, Bun 1.4.4, no guard): the hang is
# gone -- recording-engine + recording-change-tiers together, which "hangs,
# every run" below, passed 57 / 0 three times, and the whole suite in ONE
# `bun test` ran 1036 s with no test at a timeout ceiling. But that one
# process failed 12 tests, each in milliseconds. 11 of them are
# tests/benchmark-device-wiring.test.ts's mock.module of the journey engine
# and the agent-ready audit leaking into the files after it (in one process
# with it, journey-fixes-browser fails 6 and navigation-error-message,
# accept-language-browser and cli-flag-contract fail 5; without it, 0).
# mock.module is process-wide in Bun, which is why that file and
# journey-replies-browser are listed for a process of their own. The 12th, a
# journey-golden pin, is not traced. So the isolation is still load-bearing;
# its reason is the module mocks now, not the hang.
#
# DISCOVERY, NOT A HAND-WRITTEN LIST. Test files live in three places (tests/,
# tests/golden/, src/visual/). Enumerating them by hand would silently drop the
# ones outside tests/ the next time a file moves — so the list is discovered, and
# the guard below fails loudly rather than quietly skipping.
set -euo pipefail

# 2026-08-04: the threshold moved, so the isolation list grew.
#
# Adding three small, pure test files to pass 1 (attention calibration, blend
# weight, agent-ready blocked-page) turned CI red -- not because those files are
# slow, but because pass 1 was already sitting just under whatever the
# exhausting resource is. The recording files went first: fifteen "timed out
# after 60000ms" failures at exactly 60-second intervals, which is ONE hung
# browser launch reported fifteen times, not fifteen broken tests.
#
# Evidence this is the same accumulation the script was written for, and NOT the
# new code:
#
#   recording-engine alone ....................... 45 pass / 0 fail
#   recording-change-tiers alone ................. 12 pass / 0 fail
#   the two together ............................. hangs, every run
#   the two together at the commit BEFORE the new
#     files existed (worktree at b83c996) ........ hangs, every run
#
# The last line is the one that matters: the union already hung before any of
# this release's changes. The new files did not introduce the bug, they consumed
# the remaining headroom.
#
# (2026-11-04: the cause is the Bun late close in the header, fixed in 1.4.0.
# On 1.4.4 the pair above passes together.)
# 2026-09-17: the list moved to scripts/browser-tests.txt, read by BOTH this
# script and scripts/test-gate.sh. They each kept their own copy until today and
# had drifted: the gate quarantined 7 files while this script isolated 10, so
# five browser-launching files ran inside the gate's single shared process --
# the contention this whole split exists to avoid. The comment below that said
# "Any new test file calling chromium.launch() belongs in this list" was true
# and unenforced; tests/ci-runner-config.test.ts now enforces it.
#
# The historical notes about WHY each file is isolated are preserved in the
# comments of browser-tests.txt and in this file's header above.
BROWSER_LIST="$(dirname "$0")/browser-tests.txt"
if [ ! -f "$BROWSER_LIST" ]; then
  echo "test-split: $BROWSER_LIST is missing — refusing to run, because every" >&2
  echo "            real-browser test would silently join pass 1." >&2
  exit 1
fi
mapfile -t ISOLATED_FILES < <(grep -vE '^[[:space:]]*(#|$)' "$BROWSER_LIST")
if [ "${#ISOLATED_FILES[@]}" -eq 0 ]; then
  echo "test-split: $BROWSER_LIST parsed to an empty list — refusing to run." >&2
  exit 1
fi

# CI runs every file this machine runs. From 2026-08-12 to 2026-11-04 it did
# not: tests/recording-change-tiers.test.ts was skipped when CI was set
# (Alexa's call), because `a continuously animating page is flagged saturated`
# failed on CI at its 180 s ceiling every time (180001.06ms and 180000.40ms,
# files 194.66 s and 194.67 s, so no retry could help) while passing locally
# in 18 s, and twelve hypotheses had been refuted. A wedged session.stop() was
# among them: its 45 s bound never fired, so the hang was upstream of the stop.
# Those failures were on Bun 1.3.14, which has the late close in the header.
# On Bun 1.4.x the Tests workflow ran the file on its own, non-blocking, and it
# passed 12 / 0 in all 29 runs sampled (2026-09-18 to 2026-11-04), so the
# quarantine was lifted (Alexa's call) and the file now runs in its own
# process with the retry like every other listed file.
# tests/ci-runner-config.test.ts runs this script under CI=true and fails if
# any discovered file is not handed to bun test, so a CI-only skip comes back
# only by changing that test.

# Match what `bun test` itself discovers, MINUS build output.
#
# The note that used to sit here said dist/security/audit-wrapper.test.js was
# orphaned and worth fixing separately. Measured 2026-08-11, it is worse than
# orphaned -- it is a STALE DUPLICATE:
#
#   - its 14 test names are identical to tests/audit-wrapper.test.ts
#   - it is the compiled output of src/security/audit-wrapper.test.ts, a path
#     that no longer exists; the test moved to tests/ and the build output was
#     never cleaned up
#   - tsconfig now excludes src/**/*.test.ts, so no current build regenerates
#     it. It cannot be refreshed, only re-run stale.
#   - dist/ is gitignored, so it runs here and does NOT exist on CI. That is
#     the entire 1298-vs-1284 gap between this box and the runner.
#
# So the suite was running 14 assertions twice, one copy compiled from a source
# file that is gone, and reporting the doubled number as coverage. Excluding
# build output loses nothing: tests/audit-wrapper.test.ts is still discovered
# and still runs all 14.
#
# test-gate.sh never had this problem -- it searches `tests src` rather than
# `.`. The gate was right and this script was wrong, the same way the two
# disagreed about the quarantine list.
mapfile -t ALL < <(find . \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.js' -o -name '*.spec.ts' \) -not -path './node_modules/*' -not -path './dist/*' | sed 's|^\./||' | sort)

if [ "${#ALL[@]}" -eq 0 ]; then
  echo "test-split: discovered NO test files — refusing to report success" >&2
  exit 1
fi

# Every isolated file must be discovered. The guard is per-file and still fails
# loudly: silently skipping one is how a suite goes green while a file stops
# being tested, and that risk grows with the size of this list.
REST=()
for f in "${ALL[@]}"; do
  keep=1
  for iso in "${ISOLATED_FILES[@]}"; do
    if [ "$f" = "$iso" ]; then keep=0; break; fi
  done
  if [ "$keep" -eq 1 ]; then REST+=("$f"); fi
done

for iso in "${ISOLATED_FILES[@]}"; do
  found=0
  for f in "${ALL[@]}"; do
    if [ "$f" = "$iso" ]; then found=1; break; fi
  done
  if [ "$found" -ne 1 ]; then
    echo "test-split: '$iso' was not discovered — it moved or was renamed." >&2
    echo "            Refusing to run, because silently skipping it is how a suite" >&2
    echo "            goes green while a file stops being tested." >&2
    exit 1
  fi
done

echo "test-split: ${#ALL[@]} test files discovered — ${#REST[@]} in pass 1, ${#ISOLATED_FILES[@]} isolated"

# Pass 1 gets NO retry. These are ordinary deterministic tests; a retry here
# would hide a real regression.
#
# A pass-1 failure no longer ends the script (2026-11-07). Under `set -e` it
# did, so the four Tests runs that went red on one pass-1 timeout (2026-11-03
# to 2026-11-04) ran none of the isolated files, and their results were not
# in the log at all. The isolated files run anyway now, and the run still
# fails at the end.
PASS1_STATUS=0
bun test "${REST[@]}" || PASS1_STATUS=$?

# Each isolated file gets its OWN process. Running them as one `bun test` with
# several arguments recreated the union that hung on Bun before 1.4.0, and
# would still share module mocks between files (see the header).
#
# RETRY ONCE, and loudly (2026-08-12, Alexa's call).
#
# Why these and not pass 1: every file in this list drives a real browser on
# wall-clock timing, and the failure they exhibit is a capture that never
# completes, reported at exactly the test's declared ceiling (180000.96ms,
# 60000.95ms -- the ceiling, to the millisecond, because nothing else bounds
# it). Most likely that was the Bun late close in the header, fixed in 1.4.0;
# eleven other hypotheses had been refuted first.
#
# The retry stays for wall-clock browser timing on CI's runners. In 22 CI
# runs on Bun 1.4.x that reached these files (sampled 2026-09-18 to
# 2026-11-04) it rescued one flake (2026-10-09,
# screenshot-no-viewport-resize, a resize-count assertion); its other five
# firings were a real bug that failed twice, as it should.
#
# Why a retry was the honest response rather than a cover-up: on Bun 1.3.x the
# failure was intermittent in ISOLATION, not only in the union.
# CI failed recording-change-tiers in its own process at 194s having passed the
# same file in its own process at 18.7s earlier the same day. So isolation
# alone does not make these deterministic, and a single flake was failing the
# whole job.
#
# A retry that hid the flake rate would be the same silent-degradation defect
# this suite keeps finding in its own product code. So:
#   - the retry is announced when it happens, not after the fact
#   - a file that only passes on retry is listed again in a summary at the end
#   - a file that fails TWICE fails the run
#   - the exit code still reflects reality
RETRIED=()
FAILED=()
for iso in "${ISOLATED_FILES[@]}"; do
  echo "test-split: isolated run — $iso"
  if bun test "$iso"; then
    continue
  fi

  echo "test-split: FLAKE? '$iso' failed. Retrying ONCE." >&2
  echo "            A pass on retry is recorded below, not swallowed." >&2
  if bun test "$iso"; then
    echo "test-split: '$iso' passed on retry — recorded as flaky, not as green." >&2
    RETRIED+=("$iso")
  else
    echo "test-split: '$iso' failed TWICE — this is a real failure, not a flake." >&2
    FAILED+=("$iso")
  fi
done

# The summary exists so "green" and "green after a retry" are never the same
# report. A flake rate you cannot see is a flake rate nobody fixes.
#
# All of it goes to stderr. CI merges stdout and stderr from separate pipes, so
# a summary split across the two arrives interleaved: on 2026-10-28 the
# CI-only quarantine's skip notice (lifted since) printed under "failed twice"
# and read as a second failure. The lines below also stop saying "green",
# since they print in failed runs too.
exec >&2

if [ "${#RETRIED[@]}" -gt 0 ]; then
  echo ""
  echo "test-split: ${#RETRIED[@]} file(s) PASSED ONLY ON RETRY:"
  for f in "${RETRIED[@]}"; do echo "              $f"; done
  echo "            These are still flaky and still unexplained."
fi

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo ""
  echo "test-split: ${#FAILED[@]} file(s) failed twice:"
  for f in "${FAILED[@]}"; do echo "              $f"; done
fi

if [ "$PASS1_STATUS" -ne 0 ]; then
  echo ""
  echo "test-split: pass 1 FAILED (bun test exit $PASS1_STATUS); its failures are above it in the log."
fi

if [ "$PASS1_STATUS" -ne 0 ] || [ "${#FAILED[@]}" -gt 0 ]; then
  exit 1
fi
