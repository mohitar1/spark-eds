#!/usr/bin/env bash
set -e

# --- Compare hierarchy-structure files ---
for f in all-content-stores/derived-results/hierarchy-structure.merged.*; do
  base=$(basename "$f")
  target="bk/all-content-stores/derived-results/$base"

  if [[ -f "$target" ]]; then
    echo ">>>> Comparing $base"
    if diff "$f" "$target" >/dev/null 2>&1; then
      echo "Matched ✅"
    else
      echo "Different ❌"
      diff --color=always "$f" "$target"
    fi
    echo
  else
    echo "Missing in bk/: $base"
    echo
  fi
done

