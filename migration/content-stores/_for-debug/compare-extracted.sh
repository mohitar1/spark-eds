#!/usr/bin/env bash
set -e

# Usage: ./compare-extracted.sh [--input stores-file]
#   --input <file>  Optional file containing list of store directory names (one per line)
#                   If not provided, auto-discovers all *-content-stores* directories

# Source the compare-json-files function
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/compare-json-csv-files.sh"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="DATA"

function compare_images() {
    echo -e "\n\n============================================== Comparing images with backup... ==============================================\n\n"
    
    # Use $SRC_DIR/$DATA_DIR to ensure paths are correct regardless of where script is run from
    if diff <(/bin/ls "$SRC_DIR/$DATA_DIR/all-content-stores/extracted-results/images" | sort) \
            <(/bin/ls "$SRC_DIR/$DATA_DIR/bk/all-content-stores/extracted-results/images" | sort); then
      echo "Image name lists matched ✅"
    else
      echo "Image name lists differ ❌"
      exit 1
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
      exit 1
    fi
}

function compare_single() {
    target="$1"
    current="$2"
    total="$3"
    
    # Extract just the directory name if full path was provided
    target_dir=$(basename "$target")
    
    if [[ -n "$current" && -n "$total" ]]; then
        echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> WORKING ON: $target (#$current/$total) <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    else
        echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> WORKING ON: $target <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    fi
    
    # Check if directory exists
    if [[ ! -d "$SRC_DIR/$DATA_DIR/$target_dir" ]]; then
        echo "❌ ERROR: Directory not found: $SRC_DIR/$DATA_DIR/$target_dir"
        return 1
    fi
    
    # Change to DATA_DIR within SRC_DIR to ensure all relative paths work correctly
    pushd "$SRC_DIR/$DATA_DIR" > /dev/null || {
        echo "❌ ERROR: Failed to change to $SRC_DIR/$DATA_DIR"
        return 1
    }
    
    # Check if backup directory exists
    if [[ ! -d "bk/${target_dir}" ]]; then
        echo "⏭️  Skipping $target_dir (no backup directory)"
        popd > /dev/null
        return 0
    fi
    
    echo -e "\n\n============================================== Comparing linkURLs between hierarchy-structure.json and tabs*.json ... ==============================================\n\n"
    
    # Run comparison with error handling
    if ! node "${SCRIPT_DIR}/compare-linkurls.js" "$target_dir" 2>&1; then
        echo "⚠️  Warning: Comparison failed for $target_dir"
        popd > /dev/null
        return 1
    fi
    
#    echo -e "\n\n============================================== Comparing derived-results/*csv with backup... ==============================================\n\n"
#    ${SCRIPT_DIR}/compare-json-csv-files.sh --csv "$target_dir"
#    
#    echo -e "\n\n============================================== Comparing extracted-results/*json with backup... ==============================================\n\n"
#    ${SCRIPT_DIR}/compare-json-csv-files.sh --json "$target_dir"
    
    # Return to original directory
    popd > /dev/null
    
    if [[ -n "$current" && -n "$total" ]]; then
        echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> DONE WITH: $target (#$current/$total) <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    else
        echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> DONE WITH: $target <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    fi
}

function compare_all() {
    local stores_file_arg="$1"
    
    # Resolve stores file path before changing directory
    local stores_file=""
    if [[ -n "$stores_file_arg" ]]; then
        # Convert to absolute path if it's relative
        if [[ "$stores_file_arg" = /* ]]; then
            stores_file="$stores_file_arg"
        else
            stores_file="$(cd "$(dirname "$stores_file_arg")" 2>/dev/null && pwd)/$(basename "$stores_file_arg")"
        fi
    fi
    
    # Change to DATA_DIR within SRC_DIR so all paths are relative
    echo "DEBUG: Changing to $SRC_DIR/$DATA_DIR"
    cd "$SRC_DIR/$DATA_DIR" || {
        echo "❌ ERROR: Failed to change to $SRC_DIR/$DATA_DIR"
        exit 1
    }
    echo "DEBUG: Successfully changed directory"
    
    # Determine which folders to process
    local folders=()
    
    if [[ -n "$stores_file" && -f "$stores_file" ]]; then
        echo "📄 Reading stores from file: $stores_file"
        while IFS= read -r line || [[ -n "$line" ]]; do
            # Skip empty lines and comments
            [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
            # Extract basename if it's a path
            local dir_name=$(basename "$line" .html)
            folders+=("$dir_name")
        done < "$stores_file"
        echo "   Found ${#folders[@]} store(s) in file"
    else
        # Discover all folders matching *-content-stores* pattern
        echo "Discovering folders matching *-content-stores* pattern..."
        echo "DEBUG: Starting to count folders..."
        for folder in *-content-stores*; do
            if [[ -d "$folder" ]]; then
                folders+=("$folder")
            fi
        done
    fi
    
    local total=${#folders[@]}
    echo "Found $total folder(s) to process"
    echo "DEBUG: About to start processing..."
    echo ""
    
    # Process each folder with progress tracking
    local current=0
    local success_count=0
    local skip_count=0
    local fail_count=0
    local failed_folders=()
    
    echo "DEBUG: Starting loop through ${#folders[@]} folders"
    for folder in "${folders[@]}"; do
        current=$((current + 1))
        echo "DEBUG: Loop iteration $current, folder=$folder"
        
        # Temporarily disable exit on error to check result
        set +e
        echo "DEBUG: About to call compare_single for $folder"
        compare_single "$folder" "$current" "$total"
        local result=$?
        echo "DEBUG: compare_single returned $result"
        set -e
        
        if [[ $result -eq 0 ]]; then
            success_count=$((success_count + 1))
        elif [[ $result -eq 1 ]]; then
            fail_count=$((fail_count + 1))
            failed_folders+=("$folder")
            # Exit immediately on failure
            echo -e "\n\n❌ STOPPING due to failure in: $folder"
            echo "📊 Processed: $current/$total folders before stopping"
            echo "✅ Successful: $success_count"
            exit 1
        fi
    done
    
    # Print summary
    echo -e "\n\n============================================== SUMMARY =============================================="
    echo "📊 Processed: $current/$total folders"
    echo "✅ Successful: $success_count"
    echo "⏭️  Skipped (no backup): $((current - success_count - fail_count))"
    echo "❌ Failed: $fail_count"
    
    if [[ ${#failed_folders[@]} -gt 0 ]]; then
        echo -e "\n⚠️  Failed folders:"
        for failed in "${failed_folders[@]}"; do
            echo "  - $failed"
        done
    fi
    echo "=============================================================================================="
}

#compare_images

echo "DEBUG: SCRIPT_DIR=$SCRIPT_DIR"
echo "DEBUG: SRC_DIR=$SRC_DIR"
echo "DEBUG: DATA_DIR=$DATA_DIR"
echo ""

# Parse arguments
stores_file=""
if [[ "$1" == "--input" && -n "$2" ]]; then
    stores_file="$2"
elif [[ -n "$1" && -f "$1" ]]; then
    # Support positional argument for backward compatibility
    stores_file="$1"
fi

# Pass the stores file argument if provided
compare_all "$stores_file"

echo -e "\n\n============================================== Comparing generated-eds-docs/* with backup... ==============================================\n\n"
${SCRIPT_DIR}/compare-json-csv-files.sh generated-eds-docs

echo -e "\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> ALL DONE <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"

