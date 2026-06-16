#!/bin/bash

# Saved Searches Migration Script
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
    echo "  --input <path>        Path to extracted AEM content package"
    echo "  --mapping <file>      Path to user mapping CSV"
    echo "  --test-email <email>  Remap ALL users to this email for testing"
    echo "  --skip-check          Skip pre-flight existence check (faster for fresh migrations)"
    echo "  --force               Alias for --skip-check"
    echo "  --user <name>         Process only a specific user"
    echo "  --verbose             Enable verbose output"
    echo ""
    echo "Examples:"
    echo "  $0 --dry-run --input ./DATA/extracted --mapping user-mapping.csv"
    echo "  $0 --write --local --input ./DATA/extracted --mapping user-mapping.csv"
    echo "  $0 --write --local --input ./DATA/extracted --mapping user-mapping.csv --skip-check"
    echo "  $0 --write --local --input ./DATA/extracted --mapping user-mapping.csv --test-email sharmon@adobe.com"
    echo "  $0 --cleanup --local"
    exit 1
}

# Parse arguments
MODE=""
TARGET=""
INPUT=""
MAPPING=""
TEST_EMAIL=""
SKIP_CHECK=""
USER_FILTER=""
VERBOSE=""

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
        --input)
            INPUT="$2"
            shift 2
            ;;
        --mapping)
            MAPPING="$2"
            shift 2
            ;;
        --test-email)
            TEST_EMAIL="$2"
            shift 2
            ;;
        --force|--skip-check)
            SKIP_CHECK="--skip-check"
            shift
            ;;
        --user)
            USER_FILTER="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE="--verbose"
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

if [ "$MODE" != "--cleanup" ]; then
    if [ -z "$INPUT" ]; then
        echo -e "${RED}Error: --input is required${NC}"
        usage
    fi
    if [ -z "$MAPPING" ]; then
        echo -e "${RED}Error: --mapping is required${NC}"
        usage
    fi
fi

if [ "$MODE" != "--dry-run" ] && [ -z "$TARGET" ]; then
    echo -e "${RED}Error: Target is required for $MODE mode${NC}"
    usage
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Saved Searches Migration${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Mode: ${YELLOW}$MODE${NC}"
echo -e "Target: ${YELLOW}${TARGET:-N/A}${NC}"
if [ -n "$INPUT" ]; then
    echo -e "Input: ${YELLOW}$INPUT${NC}"
fi
if [ -n "$MAPPING" ]; then
    echo -e "Mapping: ${YELLOW}$MAPPING${NC}"
fi
if [ -n "$TEST_EMAIL" ]; then
    echo -e "Test Email: ${YELLOW}$TEST_EMAIL${NC} (all users remapped)"
fi
if [ -n "$SKIP_CHECK" ]; then
    echo -e "Skip Check: ${YELLOW}YES${NC} (will overwrite if keys exist)"
fi
if [ -n "$USER_FILTER" ]; then
    echo -e "User Filter: ${YELLOW}$USER_FILTER${NC}"
fi
echo ""

# Handle cleanup mode separately (doesn't need input/mapping)
if [ "$MODE" = "--cleanup" ]; then
    echo -e "${GREEN}Cleaning up SAVED_SEARCHES namespace...${NC}"
    echo "----------------------------------------"
    node upload-to-kv.js --cleanup $TARGET
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Cleanup complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
fi

# Step 1: Parse AEM XML
echo -e "${GREEN}Step 1: Parsing AEM XML files...${NC}"
echo "-----------------------------------"
PARSE_ARGS="--input $INPUT"
if [ -n "$USER_FILTER" ]; then
    PARSE_ARGS="$PARSE_ARGS --user $USER_FILTER"
fi
if [ -n "$VERBOSE" ]; then
    PARSE_ARGS="$PARSE_ARGS --verbose"
fi
node parse-aem-xml.js $PARSE_ARGS
echo ""

# Step 2: Enrich with thumbnail asset IDs (optional - requires source.config)
if [ -f "source.config" ]; then
    echo -e "${GREEN}Step 2: Enriching with thumbnail asset IDs...${NC}"
    echo "----------------------------------------------"
    echo -e "${YELLOW}Note: Asset IDs are cached in DATA/asset-cache/ for future runs${NC}"
    node enrich-asset-ids.js
    echo ""
else
    echo -e "${YELLOW}Step 2: Skipping enrichment (no source.config found)${NC}"
    echo -e "${YELLOW}        Thumbnail images will not be preserved${NC}"
    echo -e "${YELLOW}        To enable: copy source.config.example to source.config${NC}"
    echo ""
fi

# Step 3: Transform to KV format
echo -e "${GREEN}Step 3: Transforming to KV format...${NC}"
echo "-------------------------------------"
TRANSFORM_ARGS="--mapping $MAPPING"
if [ -n "$TEST_EMAIL" ]; then
    TRANSFORM_ARGS="$TRANSFORM_ARGS --test-email $TEST_EMAIL"
fi
if [ -n "$VERBOSE" ]; then
    TRANSFORM_ARGS="$TRANSFORM_ARGS --verbose"
fi
node transform-to-kv.js $TRANSFORM_ARGS
echo ""

# Step 4: Upload to KV
echo -e "${GREEN}Step 4: Uploading to KV...${NC}"
echo "--------------------------"
if [ "$MODE" = "--dry-run" ]; then
    node upload-to-kv.js --dry-run
else
    UPLOAD_ARGS="$MODE $TARGET"
    if [ -n "$SKIP_CHECK" ]; then
        UPLOAD_ARGS="$UPLOAD_ARGS $SKIP_CHECK"
    fi
    node upload-to-kv.js $UPLOAD_ARGS
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Migration complete!${NC}"
echo -e "${GREEN}========================================${NC}"
