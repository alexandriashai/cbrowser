#!/usr/bin/env bash
#
# Installs the CBrowser Claude skill in ~/.claude/skills/CBrowser.
#
#   curl -fsSL https://raw.githubusercontent.com/wyldfyre-ai/cbrowser/main/scripts/install-skill.sh | bash
#
# Other ways to get the same skill:
#   cbrowser install-skill           copies the skill your installed cbrowser version ships
#   /plugin marketplace add wyldfyre-ai/cbrowser, then /plugin install cbrowser@cbrowser
#                                    (Claude Code plugin: the skill plus the MCP server)
#
# Every file is downloaded before anything is written, so a failed download leaves an
# existing install as it was. Only the skill's own files are written: anything else in
# the directory is left alone. Nothing here asks a question, because under `curl | bash`
# standard input is the script itself.
#
# SKILL_FILES must list exactly the files in plugins/cbrowser/skills/cbrowser/;
# tests/skill-install.test.ts fails when they differ.
#
# Environment:
#   CBROWSER_SKILL_BASE   where to download from (default: the skill on GitHub main)
#   CBROWSER_SKILL_DIR    where to install (default: ~/.claude/skills/CBrowser)

set -euo pipefail

BASE="${CBROWSER_SKILL_BASE:-https://raw.githubusercontent.com/wyldfyre-ai/cbrowser/main/plugins/cbrowser/skills/cbrowser}"
DEST="${CBROWSER_SKILL_DIR:-${HOME}/.claude/skills/CBrowser}"

SKILL_FILES=(
  SKILL.md
  AIVision.md
  CognitivePersonas.md
  CognitiveState.md
  Credentials.md
  Personas.md
  Philosophy.md
  SessionManagement.md
  Workflows/Audit.md
  Workflows/Authenticate.md
  Workflows/Capture.md
  Workflows/CognitiveJourney.md
  Workflows/Extract.md
  Workflows/Interact.md
  Workflows/Journey.md
  Workflows/Navigate.md
  Workflows/Test.md
)

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

echo "Downloading the CBrowser skill (${#SKILL_FILES[@]} files)..."
failed=0
for f in "${SKILL_FILES[@]}"; do
  mkdir -p "${STAGE}/$(dirname "${f}")"
  if ! curl -fsSL --max-time 30 "${BASE}/${f}" -o "${STAGE}/${f}"; then
    echo "  could not download ${f}" >&2
    failed=$((failed + 1))
  fi
done
if [ "${failed}" -gt 0 ]; then
  echo "${failed} file(s) failed to download; nothing was changed." >&2
  exit 1
fi

if [ -d "${DEST}" ]; then action="Updated"; else action="Installed"; fi
for f in "${SKILL_FILES[@]}"; do
  mkdir -p "${DEST}/$(dirname "${f}")"
  cp "${STAGE}/${f}" "${DEST}/${f}"
done

echo ""
echo "${action} the CBrowser skill in ${DEST}"
echo "Claude Code finds it on its own; start a new session to load it."
if [ -f "${DEST}/Tools/CBrowser.ts" ]; then
  echo ""
  echo "An older install left ${DEST}/Tools/CBrowser.ts, which this skill no longer uses."
  echo "You can delete it."
fi
echo ""
echo "The skill drives the cbrowser CLI and MCP server. If you do not have them yet:"
echo "  npm install -g cbrowser        (Node 20.19+ or 22.12+; downloads Chromium)"
echo "  cbrowser doctor                checks the setup"
echo "  cbrowser install-browsers firefox webkit   only for cross-browser testing"
echo ""
echo "Docs: https://cbrowser.ai/docs"
