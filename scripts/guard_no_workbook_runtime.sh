#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Runtime code/config paths where workbook dependency must not appear.
# Runtime-owned state files under bot_data are intentionally excluded.
RUNTIME_SCAN_PATHS=(
  "bot.js"
  "core"
  "modules"
  "config"
  "utils"
)

# Files explicitly quarantined for legacy Excel behavior.
QUARANTINED_FILES=(
  "modules/attendance.js"
  "modules/subscriptioninfo.js"
  "modules/rfidManager.js"
  "utils/exporter.js"
)

LEGACY_GATED_FILES=(
  "modules/attendance.js"
  "modules/subscriptioninfo.js"
  "modules/rfidManager.js"
)

FORBIDDEN_PATTERN='ExcelJS|exceljs|workbook\.xlsx\.(readFile|writeFile)|load_workbook|openpyxl|kvantik_data\.xlsx|/set_excel_path|attendance_path'

echo "[guard] Checking runtime for workbook dependencies..."

SCAN_OUTPUT="$(grep -RInE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=bot_logs --exclude-dir=backups "$FORBIDDEN_PATTERN" "${RUNTIME_SCAN_PATHS[@]}" || true)"

if [[ -n "$SCAN_OUTPUT" ]]; then
  VIOLATIONS=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    file="${line%%:*}"

    skip=false
    for qf in "${QUARANTINED_FILES[@]}"; do
      if [[ "$file" == "$qf" ]]; then
        skip=true
        break
      fi
    done

    if [[ "$skip" == false ]]; then
      VIOLATIONS+=("$line")
    fi
  done <<< "$SCAN_OUTPUT"

  if (( ${#VIOLATIONS[@]} > 0 )); then
    echo "[guard] FAIL: workbook dependency found in active runtime paths"
    printf '%s\n' "${VIOLATIONS[@]}"
    exit 1
  fi
fi

# Ensure legacy runtime files remain explicitly gated by ALLOW_LEGACY_EXCEL_RUNTIME.
for qf in "${LEGACY_GATED_FILES[@]}"; do
  if [[ -f "$qf" ]]; then
    if ! grep -q "ALLOW_LEGACY_EXCEL_RUNTIME\|allowLegacyExcelRuntime" "$qf"; then
      echo "[guard] FAIL: quarantined file missing legacy gate marker: $qf"
      exit 1
    fi
  fi
done

# Enforce sqlite-first default in config.
if ! grep -q "ATTENDANCE_SOURCE || 'sqlite'" config/config.js; then
  echo "[guard] FAIL: attendance source default is not sqlite in config/config.js"
  exit 1
fi

echo "[guard] PASS: runtime workbook guard checks are clean"
