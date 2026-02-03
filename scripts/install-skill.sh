#!/bin/bash
#
# CBrowser PAI Skill Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash
#
# Or with npm:
#   npx cbrowser install-skill
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Config
SKILL_NAME="CBrowser"
SKILL_DIR="${HOME}/.claude/skills/${SKILL_NAME}"
REPO_URL="https://raw.githubusercontent.com/alexandriashai/cbrowser/main"
VERSION="7.4.6"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           CBrowser PAI Skill Installer v${VERSION}              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if ~/.claude/skills exists
if [ ! -d "${HOME}/.claude/skills" ]; then
    echo -e "${YELLOW}Creating ~/.claude/skills directory...${NC}"
    mkdir -p "${HOME}/.claude/skills"
fi

# Check if skill already exists
if [ -d "${SKILL_DIR}" ]; then
    echo -e "${YELLOW}CBrowser skill already exists at ${SKILL_DIR}${NC}"
    read -p "Do you want to update it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Installation cancelled.${NC}"
        exit 0
    fi
    echo -e "${BLUE}Updating existing installation...${NC}"
    rm -rf "${SKILL_DIR}"
fi

# Create skill directory structure
echo -e "${BLUE}Creating skill directory structure...${NC}"
mkdir -p "${SKILL_DIR}/Workflows"
mkdir -p "${SKILL_DIR}/Tools"
mkdir -p "${SKILL_DIR}/.memory/sessions"
mkdir -p "${SKILL_DIR}/.memory/selectors"
mkdir -p "${SKILL_DIR}/.memory/personas"
mkdir -p "${SKILL_DIR}/.memory/scenarios"
mkdir -p "${SKILL_DIR}/.memory/audit"

# Download skill files
echo -e "${BLUE}Downloading skill files...${NC}"

download_file() {
    local url="$1"
    local dest="$2"
    if command -v curl &> /dev/null; then
        curl -fsSL "$url" -o "$dest" 2>/dev/null || echo "  Warning: Could not download $url"
    elif command -v wget &> /dev/null; then
        wget -q "$url" -O "$dest" 2>/dev/null || echo "  Warning: Could not download $url"
    else
        echo -e "${RED}Error: Neither curl nor wget found. Please install one.${NC}"
        exit 1
    fi
}

# Main skill file
echo "  - SKILL.md"
download_file "${REPO_URL}/skill/SKILL.md" "${SKILL_DIR}/SKILL.md"

# Context files
echo "  - Philosophy.md"
download_file "${REPO_URL}/skill/Philosophy.md" "${SKILL_DIR}/Philosophy.md"

echo "  - AIVision.md"
download_file "${REPO_URL}/skill/AIVision.md" "${SKILL_DIR}/AIVision.md"

echo "  - SessionManagement.md"
download_file "${REPO_URL}/skill/SessionManagement.md" "${SKILL_DIR}/SessionManagement.md"

echo "  - Credentials.md"
download_file "${REPO_URL}/skill/Credentials.md" "${SKILL_DIR}/Credentials.md"

echo "  - Personas.md"
download_file "${REPO_URL}/skill/Personas.md" "${SKILL_DIR}/Personas.md"

# Workflow files
echo "  - Workflows/Navigate.md"
download_file "${REPO_URL}/skill/Workflows/Navigate.md" "${SKILL_DIR}/Workflows/Navigate.md"

echo "  - Workflows/Interact.md"
download_file "${REPO_URL}/skill/Workflows/Interact.md" "${SKILL_DIR}/Workflows/Interact.md"

echo "  - Workflows/Extract.md"
download_file "${REPO_URL}/skill/Workflows/Extract.md" "${SKILL_DIR}/Workflows/Extract.md"

echo "  - Workflows/Authenticate.md"
download_file "${REPO_URL}/skill/Workflows/Authenticate.md" "${SKILL_DIR}/Workflows/Authenticate.md"

echo "  - Workflows/Test.md"
download_file "${REPO_URL}/skill/Workflows/Test.md" "${SKILL_DIR}/Workflows/Test.md"

echo "  - Workflows/Journey.md"
download_file "${REPO_URL}/skill/Workflows/Journey.md" "${SKILL_DIR}/Workflows/Journey.md"

# Tools
echo "  - Tools/CBrowser.ts"
download_file "${REPO_URL}/skill/Tools/CBrowser.ts" "${SKILL_DIR}/Tools/CBrowser.ts"

# Update skill index if it exists
SKILL_INDEX="${HOME}/.claude/skills/skill-index.json"
if [ -f "${SKILL_INDEX}" ]; then
    echo -e "${BLUE}Updating skill index...${NC}"
    # Check if CBrowser is already in index
    if ! grep -q '"CBrowser"' "${SKILL_INDEX}" 2>/dev/null; then
        # Add CBrowser to index (simple append before closing bracket)
        # This is a basic approach - a proper JSON parser would be better
        echo "  Note: You may need to manually add CBrowser to your skill-index.json"
    fi
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              CBrowser Skill Installed Successfully!           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Skill installed to: ${BLUE}${SKILL_DIR}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Ensure cbrowser npm package is installed:"
echo "     npm install -g cbrowser"
echo ""
echo "  2. Install Playwright browsers (all browsers for cross-browser testing):"
echo "     npx playwright install"
echo ""
echo "  3. Add to your skill-index.json if not already present:"
echo '     "CBrowser": "'${SKILL_DIR}/SKILL.md'"'
echo ""
echo "  4. Start using CBrowser in Claude Code!"
echo ""
echo -e "${BLUE}Documentation:${NC} https://github.com/alexandriashai/cbrowser/wiki"
echo -e "${BLUE}Demo Server:${NC}   https://cbrowser-mcp-demo.wyldfyre.ai/mcp"
echo ""
