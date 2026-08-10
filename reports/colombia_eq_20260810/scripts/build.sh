#!/usr/bin/env bash
# Build the ADRC 2026 Choco (Colombia) earthquake report: EN + JA, PPTX + PDF.
#   bash scripts/build.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$HERE"

BASE="ADRC_EQ_COL_Choco_20260810"
UPDATE_DATE="$(TZ=Asia/Tokyo date '+%d/%m/%Y')"
STAMP="$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST')"

mkdir -p output
[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1

# figures (matplotlib + Natural Earth outlines bundled with geopandas)
for FL in en ja es; do
  LANG_OUT="$FL" python3 scripts/make_images.py >/dev/null || { echo "figure build FAILED ($FL)"; exit 1; }
done

# stamp meta into the data file so the deck and the PDF agree
STAMP="$STAMP" UPDATE_DATE="$UPDATE_DATE" node -e '
const fs=require("fs"), f="data/report_data.json";
const d=JSON.parse(fs.readFileSync(f));
d.meta.stamp=process.env.STAMP; d.meta.update_date=process.env.UPDATE_DATE;
fs.writeFileSync(f, JSON.stringify(d,null,2)+"\n");
'

for L in en ja es; do
  U=$(echo "$L" | tr a-z A-Z)
  LANG_OUT="$L" UPDATE_DATE="$UPDATE_DATE" OUT="output/${BASE}_${U}.pptx" node scripts/gen_deck.js \
    || { echo "deck build FAILED ($L)"; exit 1; }
done

if command -v soffice >/dev/null 2>&1; then
  soffice --headless --convert-to pdf --outdir output output/${BASE}_EN.pptx output/${BASE}_JA.pptx output/${BASE}_ES.pptx >/dev/null 2>&1 \
    && echo "PDF written"
else
  echo "soffice not found: PPTX only"
fi
ls -la output/
