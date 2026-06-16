#!/usr/bin/env bash
set -e

# Get the directory where this script is located and the parent (content-migration) directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="DATA"

# Compare files in directories with their backups in bk/
# Usage:
#   ./compare-json-csv-files.sh                       # Compare ALL files in all *-content-stores* directories
#   ./compare-json-csv-files.sh --json                # Compare only JSON files
#   ./compare-json-csv-files.sh --csv                 # Compare only CSV files
#   ./compare-json-csv-files.sh --json --csv dir1     # Compare both JSON and CSV in specific directories
#   ./compare-json-csv-files.sh dir1 dir2 dir3        # Compare ALL files in specific directories
#
# Enhanced Diff Output:
#   Uses git diff --word-diff=color for character-level highlighting
#   - Shows exact character differences within lines
#   - Red (with strikethrough): deleted characters
#   - Green: added characters
#   Example:
#     Before: button,Help,,/content/share/us/en/help/guide.html,,
#     After:  button,Help,,/help/guide,,
#     Diff:   button,Help,,/[RED]content/share/us/en/[END]help/guide[RED].html[END],,

compare_json_csv_files() {
  local dirs=()
  local compare_json=false
  local compare_csv=false
  local compare_all=true
  local override_current=""
  local override_total=""
  
  # Parse arguments for flags and directories
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json)
        compare_json=true
        compare_all=false
        shift
        ;;
      --csv)
        compare_csv=true
        compare_all=false
        shift
        ;;
      --counter)
        # Format: --counter current/total
        if [[ -n "$2" && "$2" =~ ^([0-9]+)/([0-9]+)$ ]]; then
          override_current="${BASH_REMATCH[1]}"
          override_total="${BASH_REMATCH[2]}"
          shift 2
        else
          echo "Error: --counter requires format: current/total (e.g., --counter 5/10)"
          exit 1
        fi
        ;;
      *)
        dirs+=("$1")
        shift
        ;;
    esac
  done
  
  # Change to DATA_DIR within SRC_DIR to ensure all relative paths work correctly
  pushd "$SRC_DIR/$DATA_DIR" > /dev/null
  
  # If no directories provided, find all *-content-stores* directories
  if [[ ${#dirs[@]} -eq 0 ]]; then
    for dir in *-content-stores*; do
      [[ -d "$dir" ]] && dirs+=("$dir")
    done
  fi
  
  # Process each directory
  local total_dirs=${#dirs[@]}
  local current_dir=0
  
  # Use override counter if provided, otherwise use actual directory count
  if [[ -n "$override_current" && -n "$override_total" ]]; then
    total_dirs="$override_total"
    current_dir="$override_current"
  fi
  
  for top_dir in "${dirs[@]}"; do
    # Preserve relative path structure (don't use basename to support nested paths)
    # For display purposes, show just the directory name
    local dir_name=$(basename "$top_dir")
    local dir_path="$top_dir"
    
    # Only increment if not using override counter
    if [[ -z "$override_current" ]]; then
      current_dir=$((current_dir + 1))
    fi
    
    echo -e "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>"
    echo "Processing: $dir_path [$current_dir/$total_dirs]"
    
    if [[ ! -d "$dir_path" ]]; then
      echo "Directory not found: $dir_path"
      exit 1
    fi
    
    # Preserve directory structure for backup path
    local backup_top_dir="bk/$dir_path"
    if [[ ! -d "$backup_top_dir" ]]; then
      echo "Backup directory not found: $backup_top_dir"
      exit 1
    fi
    
    # Find all files recursively
    while IFS= read -r -d '' file; do
      # Get relative path from dir_path
      local rel_path="${file#$dir_path/}"
      local backup_file="$backup_top_dir/$rel_path"
      
      # # Skip files in extracted-results/caches/ directory
      # if [[ "$rel_path" == extracted-results/caches/* ]]; then
      #   continue
      # fi
      
      # # Skip jcr-content.json files
      # local filename=$(basename "$file")
      # if [[ "$filename" == "jcr-content.json" ]]; then
      #   continue
      # fi
      
      # Get file extension
      local ext="${file##*.}"
      
      # Check if we should compare this file based on flags
      local should_compare=false
      if [[ "$compare_all" == "true" ]]; then
        should_compare=true
      elif [[ "$compare_json" == "true" && "$ext" == "json" ]]; then
        should_compare=true
      elif [[ "$compare_csv" == "true" && "$ext" == "csv" ]]; then
        should_compare=true
      fi
      
      if [[ "$should_compare" == "false" ]]; then
        continue
      fi
      
      if [[ -f "$backup_file" ]]; then
        echo ">>>> Comparing $file"
        
        # Compare based on file type
        if [[ "$ext" == "json" ]]; then
          # Normalize JSON: sort keys recursively
          if diff <(jq -S . "$file") <(jq -S . "$backup_file") >/dev/null 2>&1; then
            echo "Matched ✅"
          else
            echo "Different ❌ between \"$DATA_DIR/$file\" \"$DATA_DIR/$backup_file\""
            # Use git diff with word-diff for character-level highlighting
            # Write to temp files since git diff doesn't support process substitution
            local tmp_json_current=$(mktemp)
            local tmp_json_backup=$(mktemp)
            jq -S . "$file" > "$tmp_json_current"
            jq -S . "$backup_file" > "$tmp_json_backup"
            # Compare backup -> current to show OLD -> NEW (transformations appear as deletions in red)
            git diff --no-index --word-diff=color --word-diff-regex=. "$tmp_json_backup" "$tmp_json_current" | head -100 || true
            rm -f "$tmp_json_current" "$tmp_json_backup"
            exit 1
          fi
        elif [[ "$ext" == "csv" ]]; then
          # CSV comparison with record counting
          local has_error=false
          
          # echo "  [1/2] Checking record count..."
          # local rows_current=$(awk 'BEGIN{n=0;q=0} {for(i=1;i<=length($0);i++){c=substr($0,i,1);if(c=="\""&&(i==1||substr($0,i-1,1)!="\\"))q=!q} if(q==0)n++} END{print n}' "$file")
          # local rows_backup=$(awk 'BEGIN{n=0;q=0} {for(i=1;i<=length($0);i++){c=substr($0,i,1);if(c=="\""&&(i==1||substr($0,i-1,1)!="\\"))q=!q} if(q==0)n++} END{print n}' "$backup_file")
          
          # if [[ "$rows_current" != "$rows_backup" ]]; then
          #   echo "    Record count: MISMATCH ❌"
          #   echo "      Current: $rows_current records"
          #   echo "      Backup:  $rows_backup records"
          #   echo "      Diff:    $((rows_current - rows_backup)) records"
          #   echo "  Overall: FAILED ❌ (failed fast on record count)"
          #   echo
          #   exit 1
          # else
          #   echo "    Record count: MATCH ✅ ($rows_current records)"
          # fi
          
          echo "  [2/2] Checking content..."
          local tmp_current=$(mktemp)
          local tmp_backup=$(mktemp)
          
          awk 'NR>1{print prev} {prev=$0} END{print prev}' "$file" > "$tmp_current"
          awk 'NR>1{print prev} {prev=$0} END{print prev}' "$backup_file" > "$tmp_backup"
          
          if diff "$tmp_current" "$tmp_backup" >/dev/null 2>&1; then
            echo "    Content: MATCH ✅"
            rm -f "$tmp_current" "$tmp_backup"
          else
            echo "    Content: DIFFERENT ❌"
            echo "      Comparing: \"$DATA_DIR/$file\" \"$DATA_DIR/$backup_file\""
            # Use git diff with word-diff for character-level highlighting
            # Compare backup -> current to show OLD -> NEW (transformations appear as deletions in red)
            git diff --no-index --word-diff=color --word-diff-regex=. "$tmp_backup" "$tmp_current" | head -50 || true
            rm -f "$tmp_current" "$tmp_backup"
            has_error=true
          fi
          
          if [[ "$has_error" == "true" ]]; then
            echo "  Overall: FAILED ❌"
            exit 1
          else
            echo "  Overall: PASSED ✅"
          fi
        else
          # Binary or other file comparison
          if diff "$file" "$backup_file" >/dev/null 2>&1; then
            echo "Matched ✅"
          else
            echo "Different ❌ between \"$DATA_DIR/$file\" and \"$DATA_DIR/$backup_file\""
            # For binary files, just show they differ
            if file "$file" | grep -q "text"; then
              # Use git diff with word-diff for character-level highlighting
              # Compare backup -> current to show OLD -> NEW (transformations appear as deletions in red)
              git diff --no-index --word-diff=color --word-diff-regex=. "$backup_file" "$file" | head -100 || true
            else
              echo "(Binary files differ)"
            fi
            exit 1
          fi
        fi
        echo
      else
        echo "Missing in $DATA_DIR/bk/: $DATA_DIR/$backup_file"
        echo
      fi
    done < <(find "$dir_path" -type f -print0)
  done
  
  # Return to original directory
  popd > /dev/null
}

# If script is executed directly (not sourced), run the function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  compare_json_csv_files "$@"
fi
