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
# THIS BOUNDS A SYMPTOM. It does not name a cause. The exhausting resource is
# still unidentified; seven hypotheses were falsified getting here (probe budget,
# event-loop starvation, Chrome SingletonLock, parallel contention — the suite is
# sequential — the wedged capture in recording-autocapture, a single culprit
# predecessor, and an arbitrary process split). If the real cause is found, delete
# this and fix that.
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
# Still bounding a symptom, still not naming a cause. Every file listed here
# launches real browsers per test. If the real cause is ever found, delete this.
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

# QUARANTINED ON CI ONLY (2026-08-12, Alexa's call).
#
# These still run here, on a developer machine. They are not run in CI.
#
# Why, specifically: `a continuously animating page is flagged saturated` fails
# DETERMINISTICALLY on CI and passes 4 of 4 locally in 18s. Two CI attempts
# under the retry failed the same assertion at 180001.06ms and 180000.40ms with
# file durations of 194.66s and 194.67s -- identical, so no retry policy can
# help it. The release gate already excludes this file; the Tests workflow was
# the only thing still running it, and it had been red since 2026-08-06.
#
# The bar for adding to this list is high, and this file clears it only because
# a permanently red CI is worse than a missing check: it trains everyone,
# including the next agent, to skim past the signal. That is a real cost being
# paid to avoid a larger one, not a cleanup.
#
# UNRESOLVED. Twelve hypotheses refuted -- the eight in test-gate.sh, plus
# fast-check run count, CPU starvation (passes pinned to one core),
# missing anti-throttling launch args, and a wedged session.stop() (bounded at
# 45s; the bound never fired, which proves the hang is UPSTREAM of the stop, in
# launch / navigate / session.start / the hold).
#
# Next step when someone picks this up: instrument the capture helper stage by
# stage and read which stage never returns on CI. Do not re-run the refuted
# twelve.
QUARANTINED_ON_CI=(
  "tests/recording-change-tiers.test.ts"
)

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
bun test "${REST[@]}"

# Each isolated file gets its OWN process. Running them as one `bun test` with
# several arguments would recreate the union that hangs.
#
# RETRY ONCE, and loudly (2026-08-12, Alexa's call).
#
# Why these and not pass 1: every file in this list drives a real browser on
# wall-clock timing, and the failure they exhibit is a capture that never
# completes, reported at exactly the test's declared ceiling (180000.96ms,
# 60000.95ms -- the ceiling, to the millisecond, because nothing else bounds
# it). The root cause is NOT known. Eleven hypotheses have been refuted:
# shared data dir, orphaned Chrome, a console.log patch, AbortSignal timeouts,
# bun concurrency, file position, glob discovery, an fd leak, fast-check run
# count, CPU starvation (passes pinned to one core), and missing
# anti-throttling launch args.
#
# What IS known, and what makes a retry the honest response rather than a
# cover-up: the failure is intermittent in ISOLATION, not only in the union.
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
SKIPPED=()
for iso in "${ISOLATED_FILES[@]}"; do
  # CI-only quarantine. Announced every time, because a skip nobody sees is how
  # a suite goes green while a file stops being tested -- this script's own
  # discovery guard exists for exactly that reason.
  if [ -n "${CI:-}" ]; then
    skip=0
    for q in "${QUARANTINED_ON_CI[@]}"; do
      if [ "$iso" = "$q" ]; then skip=1; break; fi
    done
    if [ "$skip" = "1" ]; then
      echo "test-split: SKIPPED ON CI — $iso (quarantined; runs locally, see QUARANTINED_ON_CI)"
      SKIPPED+=("$iso")
      continue
    fi
  fi

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
# quarantined file printed under "failed twice" and read as a second failure.
# The lines below also stop saying "green", since they print in failed runs too.
exec >&2
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo ""
  echo "test-split: ${#SKIPPED[@]} file(s) NOT RUN on CI (quarantined):"
  for f in "${SKIPPED[@]}"; do echo "              $f"; done
  echo "            Every result in this run excludes them. They still run locally."
fi

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
  exit 1
fi
