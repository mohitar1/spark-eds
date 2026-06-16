#!/usr/bin/env bash
set -e

# Usage: ./compare-extracted-good.sh [--input stores-file | --store content-path] [--no-open] [--pause-on-fail] [--upload]
#   --input <file>      File containing list of content store paths (one per line)
#   --store <path>      Single content store path (e.g., /content/share/us/en/all-content-stores)
#   --no-open           Optional flag to prevent opening browser in handle_failure
#   --pause-on-fail     Optional flag to pause and wait for Enter to continue on failure (instead of exiting)
#   --upload            Optional flag to actually execute upload commands (ONLY when failures are detected)
#
# Note: Either --input or --store must be provided

# Trap Ctrl+C (SIGINT) and SIGTERM to ensure clean exit
# Note: When read is active, it will catch Ctrl+C itself and return non-zero
trap 'echo -e "\n\n⚠️  Script interrupted by user (Ctrl+C). Exiting..."; exit 130' INT TERM

# Source the compare-json-files function
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/compare-json-csv-files.sh"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="DATA"

# Global flags
NO_OPEN=false
PAUSE_ON_FAIL=false
UPLOAD=false
FAILED_STORES=()

# Read DA_DEST from da.upload.config
DA_DEST=""
if [[ -f "$SRC_DIR/da.upload.config" ]]; then
    DA_DEST=$(grep -E "^DA_DEST=" "$SRC_DIR/da.upload.config" | cut -d'=' -f2 | sed 's/#.*//' | tr -d ' ')
fi

# Helper function to handle failures - either exit or pause and continue
function handle_failure_exit() {
    local exit_code="${1:-1}"
    local context="${2:-}"
    
    if [[ "$PAUSE_ON_FAIL" == true ]]; then
        echo -e "\n⏸️  Failure detected${context:+: $context}"
        echo -e "⏸️  Press Enter to continue to next store (or Ctrl+C to abort)..."
        # Temporarily restore default SIGINT behavior for read
        trap - INT
        read -r
        local read_result=$?
        # Restore the trap
        trap 'echo -e "\n\n⚠️  Script interrupted by user (Ctrl+C). Exiting..."; exit 130' INT TERM
        if [[ $read_result -ne 0 ]]; then
            # read was interrupted (Ctrl+C pressed)
            echo -e "\n⚠️  Aborted by user"
            exit 130
        fi
        return 0  # Return to caller to continue
    else
        exit "$exit_code"
    fi
}

function handle_failure() {
    local target_dir="$1"
    local allow_copy=true
    
    # Open the hierarchy-structure.from-csv.html file
    local html_file="$SRC_DIR/$DATA_DIR/${target_dir}/derived-results/hierarchy-structure.from-csv.html"
    if [[ -f "$html_file" ]]; then
        # Convert directory name to AEM path and open in browser
        # e.g., "all-content-stores-global-fanta-yummy-snacking-pac-man" 
        #    -> "/content/share/us/en/all-content-stores/global-fanta-yummy-snacking-pac-man"
        local aem_path=""
        if [[ "$target_dir" =~ ^(all|bottler)-content-stores(.*)$ ]]; then
            local store_type="${BASH_REMATCH[1]}-content-stores"
            local sub_path="${BASH_REMATCH[2]}"
            if [[ -n "$sub_path" ]]; then
                # Has sub-store, keep hyphens (it's a single page name, not nested path)
                # Remove leading hyphen from sub_path
                sub_path="${sub_path#-}"
                aem_path="/content/share/us/en/${store_type}/${sub_path}"
            else
                # Main store only
                aem_path="/content/share/us/en/${store_type}"
            fi
            
        fi
        local aem_url="https://author-p64403-e544653.adobeaemcloud.com${aem_path}.html?wcmmode=disabled"
        
        if [[ "$NO_OPEN" == false ]]; then
            echo -e "\n📂 Opening HTML viewer: $DATA_DIR/${target_dir}/derived-results/hierarchy-structure.from-csv.html"
            open "$html_file"
            
            echo -e "🔗 Opening AEM Author: $aem_url"
            # Open Chrome in new window and position on right side of screen
            osascript <<EOF
tell application "Google Chrome"
    activate
    make new window
    set URL of active tab of front window to "$aem_url"
    tell front window
        set bounds to {0, 0, 1500, 1000}
    end tell
end tell
EOF
        else
            echo -e "\n📂 HTML viewer available at: "
            echo -e "$DATA_DIR/${target_dir}/derived-results/hierarchy-structure.from-csv.html"
            echo -e "${aem_url}"
        fi
        
    else
        echo -e "\n⚠️  HTML file not found: $DATA_DIR/${target_dir}/derived-results/hierarchy-structure.from-csv.html"
    fi
}

function compare_images() {
    echo -e "\n\n============================================== Comparing images with bk... ==============================================\n\n"
    
    # Use $SRC_DIR/$DATA_DIR to ensure paths are correct regardless of where script is run from
    if diff <(/bin/ls "$SRC_DIR/$DATA_DIR/all-content-stores/extracted-results/images" | sort) \
            <(/bin/ls "$SRC_DIR/$DATA_DIR/bk/all-content-stores/extracted-results/images" | sort); then
      echo "Image name lists matched ✅"
    else
      echo "Image name lists differ ❌"
      FAILED_STORES+=("images comparison")
      handle_failure_exit 1 "Image name lists comparison failed"
      return 1
    fi
    echo

    diff_found=0

    for f in "$SRC_DIR/$DATA_DIR/all-content-stores/extracted-results/images"/*; do
      base=$(basename "$f")
      target="$SRC_DIR/$DATA_DIR/bk/all-content-stores/extracted-results/images/$base"

      if [[ -f "$target" ]]; then
        md5_1=$(md5 -q "$f")      # macOS: use md5 -q
        md5_2=$(md5 -q "$target")
        if [[ "$md5_1" != "$md5_2" ]]; then
          echo "$base: Different ❌"
          diff_found=1
        fi
      else
        echo "$base: Missing in bk/ ❌"
        diff_found=1
      fi
    done

    if [[ $diff_found -eq 0 ]]; then
      echo "All images matched ✅"
    else
      FAILED_STORES+=("images content")
      handle_failure_exit 1 "Image content comparison failed"
      return 1
    fi
    
    return 0
}

function show_helping_commands() {
    local target_dir="$1"
    local eds_docs_path="$2"
    local has_failure="$3"
    
    echo -e "\n\n============================================== Helping commands ... ==============================================\n\n"
    
    # Upload to EDS
    if [[ "$UPLOAD" == true && "$has_failure" == true ]]; then
        echo -e "    Executing: node $SRC_DIR/upload-images.js -c 10 --path $SRC_DIR/$DATA_DIR/${target_dir}/extracted-results/images && node $SRC_DIR/upload-to-EDS.js $SRC_DIR/$DATA_DIR/${eds_docs_path} --preview --reup"
        node "$SRC_DIR/upload-images.js" -c 10 --path "$SRC_DIR/$DATA_DIR/${target_dir}/extracted-results/images" >/dev/null && node "$SRC_DIR/upload-to-EDS.js" "$SRC_DIR/$DATA_DIR/${eds_docs_path}" --preview --reup >/dev/null
    else
        echo -e "To upload to EDS with DA_DEST=\"${DA_DEST}\": "
        echo -e "    node upload-images.js -c 10 --path $DATA_DIR/${target_dir}/extracted-results/images && node upload-to-EDS.js $DATA_DIR/${eds_docs_path} --preview --reup"
        if [[ "$UPLOAD" == true && "$has_failure" == false ]]; then
            echo -e "    (Skipping upload - no failures detected)"
        fi
    fi
    
    # Copy to bk
    echo -e "\nTo copy to bk: "
    # Copy extracted results (e.g., all-content-stores-magic-tables/)
    echo -e "    cp -rf \"$DATA_DIR/${target_dir}\" \"$DATA_DIR/bk\""
    # Copy generated EDS docs (e.g., generated-eds-docs/all-content-stores-magic-tables/)
    local parent_dir=$(dirname "$eds_docs_path")
    echo -e "    cp -rf \"$DATA_DIR/$eds_docs_path\" \"$DATA_DIR/bk/$parent_dir\""
}

function compare_single() {
    target="$1"
    current_num="${2:-}"
    total_num="${3:-}"
    
    # Change to DATA_DIR within SRC_DIR to ensure all relative paths work correctly
    pushd "$SRC_DIR/$DATA_DIR" > /dev/null
    
    # Extract just the directory name if full path was provided
    target_dir=$(basename "$target")
    
    # Build progress counter if provided
    progress_str=""
    if [[ -n "$current_num" && -n "$total_num" ]]; then
        progress_str=" [$current_num/$total_num]"
    fi
    
    echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> WORKING ON: $target${progress_str} <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    
    local has_failure=false
    local failure_reason=""

    echo -e "\n\n============================================== Comparing linkURLs between hierarchy-structure.json and tabs*.json ... ==============================================\n\n"
    if ! node "${SCRIPT_DIR}/compare-linkurls.js" "$target_dir"; then
        has_failure=true
        failure_reason="linkURLs comparison failed"
    fi
    
    
    echo -e "\n\n============================================== Checking if backup directory exists... ==============================================\n\n"
    # Check if backup directory exists
    if [[ ! -d "bk/${target_dir}" ]]; then
        echo "❌ ERROR: Backup directory not found: bk/${target_dir}"
        has_failure=true
        failure_reason="backup directory not found"
    fi
    
    if [[ "$has_failure" == "false" ]]; then
        echo -e "\n\n============================================== Comparing extracted-results/*json with bk... ==============================================\n\n"
        # Build counter argument if we have progress info
        local counter_arg=""
        if [[ -n "$current_num" && -n "$total_num" ]]; then
            counter_arg="--counter $current_num/$total_num"
        fi
        
        if ! ${SCRIPT_DIR}/compare-json-csv-files.sh --json $counter_arg "$target_dir"; then
            has_failure=true
            failure_reason="JSON comparison failed"
        fi
    fi
    
    # Return to original directory
    popd > /dev/null

    
    echo -e "\n\n============================================== Comparing derived-results/*csv with bk... ==============================================\n\n"
    
    if ! ${SCRIPT_DIR}/compare-json-csv-files.sh --csv "$target_dir"; then
        has_failure=true
        failure_reason="CSV comparison failed"
    fi
    
    # Show helping commands
    local eds_docs_path="generated-eds-docs/${target_dir}"
    show_helping_commands "$target_dir" "$eds_docs_path" "$has_failure"
    
    echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> DONE WITH: $target${progress_str} <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    
    # Handle failure after showing helping commands
    if [[ "$has_failure" == "true" ]]; then
        handle_failure "$target_dir"
        FAILED_STORES+=("$target_dir")
        handle_failure_exit 1 "$target_dir - $failure_reason"
        return 1
    fi
    
    return 0
}

function compare_all() {
    # Change to SRC_DIR so all paths are relative
    cd "$SRC_DIR"
    
    # Discover all folders matching *-content-stores* pattern
    echo "Discovering folders matching *-content-stores* pattern..."
    for folder in *-content-stores*; do
        if [[ -d "$folder" ]]; then
            compare_single "$folder" || true  # Allow loop to continue even on failure
        fi
    done
    
}

# Parse arguments - either stores file OR single store path is REQUIRED
stores_file=""
single_store=""

# Parse all arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --input)
            if [[ -n "$2" ]]; then
                stores_file="$2"
                shift 2
            else
                echo "❌ ERROR: --input requires a file argument"
                exit 1
            fi
            ;;
        --store)
            if [[ -n "$2" ]]; then
                single_store="$2"
                shift 2
            else
                echo "❌ ERROR: --store requires a content path argument"
                exit 1
            fi
            ;;
        --no-open)
            NO_OPEN=true
            shift
            ;;
        --pause-on-fail)
            PAUSE_ON_FAIL=true
            shift
            ;;
        --upload)
            UPLOAD=true
            shift
            ;;
        *)
            # Support positional argument for backward compatibility
            if [[ -z "$stores_file" && -z "$single_store" && -f "$1" ]]; then
                stores_file="$1"
                shift
            else
                echo "❌ ERROR: Unknown argument: $1"
                echo "Usage: $0 [--input stores-file | --store content-path] [--no-open] [--pause-on-fail] [--upload]"
                exit 1
            fi
            ;;
    esac
done

# Validate that either --input or --store is provided (but not both)
if [[ -z "$stores_file" && -z "$single_store" ]]; then
    echo "❌ ERROR: Either --input or --store must be provided"
    echo "Usage: $0 [--input stores-file | --store content-path] [--no-open] [--pause-on-fail] [--upload]"
    exit 1
fi

if [[ -n "$stores_file" && -n "$single_store" ]]; then
    echo "❌ ERROR: Cannot use both --input and --store at the same time"
    echo "Usage: $0 [--input stores-file | --store content-path] [--no-open] [--pause-on-fail] [--upload]"
    exit 1
fi

if [[ -n "$stores_file" && ! -f "$stores_file" ]]; then
    echo "❌ ERROR: Stores file not found: $stores_file"
    exit 1
fi

# Function to convert content path to HTML file path
function content_path_to_html_path() {
    local path="$1"
    
    # Split path into parts
    IFS='/' read -ra parts <<< "$path"
    local content_name="${parts[-1]}"
    local parent_name="${parts[-2]}"
    
    # Check if current name looks like a main content store
    if [[ "$content_name" == *-content-stores ]]; then
        # Main content store - files are directly in the directory
        echo "generated-eds-docs/${content_name}"
    else
        # Sub-store - check if parent is a content store
        if [[ "$parent_name" == *-content-stores ]]; then
            # Use parent-child naming convention - files are in a subdirectory
            local combined_name="${parent_name}-${content_name}"
            echo "generated-eds-docs/${combined_name}"
        else
            # Fallback to just the content name
            echo "generated-eds-docs/${content_name}"
        fi
    fi
}

# Read stores and convert to HTML paths
declare -a files_to_compare=()
declare -a content_paths=()

if [[ -n "$single_store" ]]; then
    # Process single store
    echo "📄 Processing single store: $single_store"
    content_paths+=("$single_store")
    
    # Check if it's a content path or already an HTML path
    if [[ "$single_store" == /content/* ]]; then
        # Convert content path to HTML path
        files_to_compare+=("$(content_path_to_html_path "$single_store")")
    else
        # Already an HTML path or directory name
        files_to_compare+=("$single_store")
    fi
else
    # Read from file
    echo "📄 Reading stores from file: $stores_file"
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines, whitespace-only lines, and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Store original content path for later
        content_paths+=("$line")
        
        # Check if it's a content path or already an HTML path
        if [[ "$line" == /content/* ]]; then
            # Convert content path to HTML path
            files_to_compare+=("$(content_path_to_html_path "$line")")
        else
            # Already an HTML path or directory name
            files_to_compare+=("$line")
        fi
    done < "$stores_file"
    echo "   Found ${#files_to_compare[@]} store(s) in file"
fi

#compare_images

echo "=========================================="
echo "Generating CSV from merged hierarchy json ..."
echo "=========================================="
echo ""

# Generate CSVs - allow continuation on failure if --pause-on-fail is set
if ! node generate-csv-from-hierarchy-json.js; then
    echo "⚠️  CSV generation failed"
    if [[ "$PAUSE_ON_FAIL" == true ]]; then
        FAILED_STORES+=("CSV generation")
        echo "⏸️  Press Enter to continue anyway (or Ctrl+C to abort)..."
        # Temporarily restore default SIGINT behavior for read
        trap - INT
        read -r
        read_result=$?
        # Restore the trap
        trap 'echo -e "\n\n⚠️  Script interrupted by user (Ctrl+C). Exiting..."; exit 130' INT TERM
        if [[ $read_result -ne 0 ]]; then
            echo -e "\n⚠️  Aborted by user"
            exit 130
        fi
    else
        exit 1
    fi
fi

# Generate HTML viewer - allow continuation on failure if --pause-on-fail is set  
if ! node _for-debug/generate-html-viewer.js --no-open; then
    echo "⚠️  HTML viewer generation failed"
    if [[ "$PAUSE_ON_FAIL" == true ]]; then
        FAILED_STORES+=("HTML viewer generation")
        echo "⏸️  Press Enter to continue anyway (or Ctrl+C to abort)..."
        # Temporarily restore default SIGINT behavior for read
        trap - INT
        read -r
        read_result=$?
        # Restore the trap
        trap 'echo -e "\n\n⚠️  Script interrupted by user (Ctrl+C). Exiting..."; exit 130' INT TERM
        if [[ $read_result -ne 0 ]]; then
            echo -e "\n⚠️  Aborted by user"
            exit 130
        fi
    else
        exit 1
    fi
fi

echo ""
echo ""

# Loop through files_to_compare and extract directory names to compare
total_stores=${#files_to_compare[@]}
current_store=0

for file in "${files_to_compare[@]}"; do
    # Extract directory name: basename without .html extension
    dir_name=$(basename "$file" .html)
    current_store=$((current_store + 1))
    compare_single "$dir_name" "$current_store" "$total_stores" || true  # Allow loop to continue even on failure
done

echo -e "\n\n============================================== Comparing generated-eds-docs specific files with bk/generated-eds-docs ... ==============================================\n\n"

# Change to DATA_DIR within SRC_DIR to ensure all relative paths work correctly
pushd "$SRC_DIR/$DATA_DIR" > /dev/null

# Compare each directory (files_to_compare already defined above)
total_eds_docs=${#files_to_compare[@]}
current_eds_doc=0

for path_entry in "${files_to_compare[@]}"; do
    # Extract directory name for comparison
    dir_name=$(basename "$path_entry")
    current_eds_doc=$((current_eds_doc + 1))
    
    # Check if backup directory exists
    backup_missing=false
    if [[ ! -d "bk/$path_entry" ]]; then
        echo "❌ Backup directory not found: $DATA_DIR/bk/$path_entry"
        backup_missing=true
    fi
    
    # Use compare-json-csv-files.sh to handle the comparison (only if backup exists)
    # It will normalize JSON with jq -S to ignore property ordering
    comparison_failed=false
    if [[ "$backup_missing" == "false" ]]; then
        if ! ${SCRIPT_DIR}/compare-json-csv-files.sh --json --counter "$current_eds_doc/$total_eds_docs" "$path_entry"; then
            comparison_failed=true
        fi
    fi
    
    # Show helping commands (regardless of success/failure)
    # Determine if there was a failure in this store
    has_eds_failure=false
    if [[ "$backup_missing" == "true" || "$comparison_failed" == "true" ]]; then
        has_eds_failure=true
    fi
    
    show_helping_commands "$dir_name" "$path_entry" "$has_eds_failure"
    
    
    echo ""
    
    # Handle failures after showing commands
    if [[ "$backup_missing" == "true" ]]; then
        popd > /dev/null
        handle_failure "$dir_name"
        FAILED_STORES+=("$dir_name (backup directory not found)")
        handle_failure_exit 1 "$dir_name - backup directory not found"
        pushd "$SRC_DIR/$DATA_DIR" > /dev/null
        continue
    elif [[ "$comparison_failed" == "true" ]]; then
        popd > /dev/null
        handle_failure "$dir_name"
        FAILED_STORES+=("$dir_name (JSON comparison failed)")
        handle_failure_exit 1 "$dir_name - JSON comparison failed"
        pushd "$SRC_DIR/$DATA_DIR" > /dev/null
        continue
    fi
done

# Return to original directory
popd > /dev/null

# For main store (all-content-stores), also compare all-content-stores-sheet.json
# Check if we're processing the main store
main_store_found=false
for path in "${content_paths[@]}"; do
    if [[ "$path" == "/content/share/us/en/all-content-stores" ]]; then
        main_store_found=true
        break
    fi
done

echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> ALL DONE <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"

# Report summary if there were any failures
if [[ ${#FAILED_STORES[@]} -gt 0 ]]; then
    echo -e "\n\n⚠️  ⚠️  ⚠️  FAILURE SUMMARY ⚠️  ⚠️  ⚠️"
    echo -e "The following stores/comparisons had failures:\n"
    for failed in "${FAILED_STORES[@]}"; do
        echo -e "  ❌ $failed"
    done
    echo -e "\n⚠️  Total failures: ${#FAILED_STORES[@]}"
    
    if [[ "$PAUSE_ON_FAIL" == true ]]; then
        echo -e "\n✅ Script completed with failures (continued due to --pause-on-fail flag)"
        exit 1
    else
        echo -e "\n❌ Script completed with failures"
        exit 1
    fi
else
    echo -e "\n✅ All comparisons passed successfully!"
    exit 0
fi

