#!/bin/bash

# Rights Requests Migration Script
# Orchestrates the full migration pipeline

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage
usage() {
    echo "Usage: $0 [mode] [target] [options]"
    echo ""
    echo "Modes:"
    echo "  --dry-run          Preview changes without writing to KV"
    echo "  --write            Write new data (fails if keys exist)"
    echo "  --append           Merge with existing data"
    echo "  --cleanup          Remove migrated data from KV"
    echo ""
    echo "Targets:"
    echo "  --local            Write to local KV (wrangler dev persistence)"
    echo "  --remote           Write to remote Cloudflare KV"
    echo ""
    echo "Options:"
    echo "  --test-email <email>  Remap ALL users to this email for testing"
    echo "  --skip-check          Skip pre-flight existence check (faster for fresh migrations)"
    echo "  --force               Alias for --skip-check"
    echo ""
    echo "Examples:"
    echo "  $0 --dry-run"
    echo "  $0 --write --local"
    echo "  $0 --write --local --skip-check"
    echo "  $0 --write --local --test-email sharmon@adobe.com"
    echo "  $0 --write --local --test-email sharmon@adobe.com --skip-check"
    echo "  $0 --cleanup --local"
    exit 1
}

# Parse arguments
MODE=""
TARGET=""
TEST_EMAIL=""
SKIP_CHECK=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run|--write|--append|--cleanup)
            MODE="$1"
            shift
            ;;
        --local|--remote)
            TARGET="$1"
            shift
            ;;
        --test-email)
            TEST_EMAIL="$2"
            shift 2
            ;;
        --force|--skip-check)
            SKIP_CHECK="--skip-check"
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

# Validate arguments
if [ -z "$MODE" ]; then
    echo -e "${RED}Error: Mode is required${NC}"
    usage
fi

if [ "$MODE" != "--dry-run" ] && [ -z "$TARGET" ]; then
    echo -e "${RED}Error: Target is required for $MODE mode${NC}"
    usage
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Rights Requests Migration${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Mode: ${YELLOW}$MODE${NC}"
echo -e "Target: ${YELLOW}${TARGET:-N/A}${NC}"
if [ -n "$TEST_EMAIL" ]; then
    echo -e "Test Email: ${YELLOW}$TEST_EMAIL${NC} (all users remapped)"
fi
if [ -n "$SKIP_CHECK" ]; then
    echo -e "Skip Check: ${YELLOW}YES${NC} (will overwrite if keys exist)"
fi
echo ""

# For cleanup mode, skip directly to upload (which handles cleanup)
if [ "$MODE" = "--cleanup" ]; then
    echo -e "${GREEN}Cleaning up KV data...${NC}"
    echo "------------------------"
    node upload-to-kv.js $MODE $TARGET
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Cleanup complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
fi

# Step 1: Parse JCR XML
echo -e "${GREEN}Step 1: Parsing JCR XML files...${NC}"
echo "-----------------------------------"
node parse-jcr-xml.js
echo ""

# Step 2: Enrich with Asset IDs (optional - requires source.config)
ENRICHED_FILE="DATA/enriched-all.json"
if [ -f "source.config" ]; then
    echo -e "${GREEN}Step 2: Enriching with Asset IDs from AEM...${NC}"
    echo "---------------------------------------------"
    echo -e "${YELLOW}Note: Asset IDs are cached in DATA/asset-cache/ for future runs${NC}"
    node enrich-asset-ids.js
    echo ""
else
    echo -e "${YELLOW}Step 2: Skipping enrichment (no source.config found)${NC}"
    echo -e "${YELLOW}        Preview images will not work without asset IDs${NC}"
    echo -e "${YELLOW}        To enable: copy source.config.example to source.config${NC}"
    echo ""
    ENRICHED_FILE=""
fi

# Step 3: Transform to KV format
echo -e "${GREEN}Step 3: Transforming to KV format...${NC}"
echo "-------------------------------------"
TRANSFORM_ARGS=""
if [ -n "$ENRICHED_FILE" ] && [ -f "$ENRICHED_FILE" ]; then
    TRANSFORM_ARGS="--enriched $ENRICHED_FILE"
fi
if [ -n "$TEST_EMAIL" ]; then
    node transform-to-kv.js $TRANSFORM_ARGS --test-email "$TEST_EMAIL"
else
    node transform-to-kv.js $TRANSFORM_ARGS
fi
echo ""

# Step 4: Upload to KV
echo -e "${GREEN}Step 4: Uploading to KV...${NC}"
echo "--------------------------"
if [ "$MODE" = "--dry-run" ]; then
    node upload-to-kv.js $MODE
else
    node upload-to-kv.js $MODE $TARGET $SKIP_CHECK
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Migration complete!${NC}"
echo -e "${GREEN}========================================${NC}"
if [ -z "$ENRICHED_FILE" ]; then
    echo ""
    echo -e "${YELLOW}Warning: Asset IDs were not enriched.${NC}"
    echo -e "${YELLOW}Preview images will not work in the portal.${NC}"
    echo -e "${YELLOW}To fix: create source.config and re-run migration.${NC}"
fi
