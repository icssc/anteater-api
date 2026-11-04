#!/usr/bin/env bash
# Rebuilds all WebSoc-derived tables from scratch and dumps them to $OUT_DIR as JSON chunks.
#
# Resumable: completed steps are recorded in $PROGRESS_FILE, so re-running after a crash
# (e.g. redeploying on Railway) skips the migration/truncation and any term already scraped.
# Delete $PROGRESS_FILE to start over from scratch.
set -uo pipefail

: "${DB_URL:?DB_URL must be set}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TSX="$ROOT/node_modules/.bin/tsx"

export OUT_DIR="${OUT_DIR:-$HERE/out}"
PROGRESS_FILE="${PROGRESS_FILE:-$(dirname "$OUT_DIR")/rebuild-progress.txt}"
mkdir -p "$OUT_DIR"
touch "$PROGRESS_FILE"

done_step() { grep -qxF "$1" "$PROGRESS_FILE"; }
mark_done() { echo "$1" >>"$PROGRESS_FILE"; }

if ! done_step "migrate"; then
  echo "Running schema migrations..."
  (cd "$ROOT/packages/db" && "$TSX" src/migrate.ts) || exit 1
  mark_done "migrate"
fi

if ! done_step "truncate"; then
  echo "Clearing existing tables..."
  "$TSX" "$HERE/src/pre.ts" || exit 1
  mark_done "truncate"
fi

echo "Re-scraping all quarters..."
quarters=(Winter Spring Summer1 Summer10wk Summer2 Fall)
failed=()

for year in $(seq "${START_YEAR:-1996}" "${END_YEAR:-$(date +%Y)}"); do
  for quarter in "${quarters[@]}"; do
    term="$year $quarter"
    if done_step "$term"; then
      echo "=== $term (already done, skipping) ==="
      continue
    fi
    echo "=== $term ==="
    if "$TSX" "$HERE/src/scrape-term.ts" "$year" "$quarter"; then
      mark_done "$term"
    else
      failed+=("$term")
    fi
  done
done

echo "Storing all data from affected tables in $OUT_DIR..."

find "$OUT_DIR" -maxdepth 1 -name '*.json' -delete
"$TSX" "$HERE/src/post.ts" || exit 1
echo "Wrote $(find "$OUT_DIR" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ') file(s) ($(du -sh "$OUT_DIR" | cut -f1))"

if ((${#failed[@]})); then
  echo "Failed (${#failed[@]}): ${failed[*]}"
  echo "Re-run to retry only the failed terms."
  exit 1
fi
echo "All done!"
