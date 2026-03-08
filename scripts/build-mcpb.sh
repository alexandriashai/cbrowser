#!/bin/bash
# Build CBrowser as Claude Desktop Extension (.mcpb)
#
# Usage: ./scripts/build-mcpb.sh
# Output: dist/cbrowser-{version}.mcpb

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building CBrowser Claude Desktop Extension (.mcpb)${NC}"
echo "=================================================="

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
MANIFEST_VERSION=$(node -p "require('./manifest.json').version")
BUNDLE_NAME="cbrowser-${VERSION}.mcpb"
BUILD_DIR=".mcpb-build"

# Version sync check
if [ "$VERSION" != "$MANIFEST_VERSION" ]; then
  echo -e "${RED}ERROR: Version mismatch!${NC}"
  echo "  package.json:  $VERSION"
  echo "  manifest.json: $MANIFEST_VERSION"
  echo "Update manifest.json version to match."
  exit 1
fi

echo -e "${YELLOW}Version:${NC} ${VERSION}"
echo -e "${YELLOW}Output:${NC} dist/${BUNDLE_NAME}"

# Step 1: Clean previous build
echo -e "\n${GREEN}[1/6] Cleaning previous build...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Step 2: Build TypeScript
echo -e "\n${GREEN}[2/6] Building TypeScript...${NC}"
npm run build

# Step 3: Copy required files
echo -e "\n${GREEN}[3/6] Copying files to bundle...${NC}"
cp -r dist "$BUILD_DIR/"
cp package.json "$BUILD_DIR/"
cp manifest.json "$BUILD_DIR/"
cp LICENSE "$BUILD_DIR/" 2>/dev/null || echo "LICENSE not found, skipping"
cp README.md "$BUILD_DIR/"

# Step 4: Install production dependencies
echo -e "\n${GREEN}[4/6] Installing production dependencies...${NC}"
cd "$BUILD_DIR"
npm install --omit=dev --ignore-scripts

# Remove unnecessary files from node_modules
echo -e "\n${GREEN}[5/6] Cleaning node_modules...${NC}"
find node_modules -type d -name ".bin" -exec rm -rf {} + 2>/dev/null || true
find node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
find node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find node_modules -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true
find node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
find node_modules -type f -name "*.md" -delete 2>/dev/null || true
find node_modules -type f -name "*.map" -delete 2>/dev/null || true
find node_modules -type f -name "*.ts" ! -name "*.d.ts" -delete 2>/dev/null || true

cd ..

# Step 5: Create .mcpb bundle (ZIP archive)
echo -e "\n${GREEN}[6/6] Creating .mcpb bundle...${NC}"
mkdir -p dist
cd "$BUILD_DIR"
zip -r "../dist/${BUNDLE_NAME}" \
  dist/ \
  node_modules/ \
  package.json \
  manifest.json \
  LICENSE \
  README.md \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "*__pycache__*"
cd ..

# Cleanup
rm -rf "$BUILD_DIR"

# Report
BUNDLE_SIZE=$(du -h "dist/${BUNDLE_NAME}" | cut -f1)
echo -e "\n${GREEN}=================================================="
echo -e "Build complete!"
echo -e "==================================================${NC}"
echo -e "Bundle: ${YELLOW}dist/${BUNDLE_NAME}${NC}"
echo -e "Size:   ${YELLOW}${BUNDLE_SIZE}${NC}"
echo ""
echo "Installation:"
echo "  1. Open Claude Desktop"
echo "  2. Go to Settings > Extensions"
echo "  3. Click 'Install from file'"
echo "  4. Select dist/${BUNDLE_NAME}"
echo ""
echo "Or install via CLI:"
echo "  claude extension install dist/${BUNDLE_NAME}"
