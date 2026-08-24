#!/usr/bin/env bash
# build_event.sh — イベント1件を JA/EN の PPTX + PDF まで作る。
#
#   ./build_event.sh <GLIDE> [出力ディレクトリ]
#
# 素の権威版（generator/gen_deck.base.js）を一時ディレクトリへコピーし、
# 14本のパッチを当ててからビルドする。**権威版そのものは変更しない。**
#
# 出力は <FILEBASE>_JA.pptx / _JA.pdf / _EN.pptx / _EN.pdf の4本。
# FILEBASE はイベントJSONの meta.filebase から取る。
set -euo pipefail

GLIDE="${1:?GLIDE番号を渡すこと（例 EQ-2026-000146-COL）}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$(cd "$HERE/../.." && pwd)"
OUTDIR="${2:-$SKILL/../../_build/$GLIDE}"

EVENT_JSON="$SKILL/events/$GLIDE.json"
[ -f "$EVENT_JSON" ] || { echo "イベントJSONが無い: $EVENT_JSON" >&2; exit 4; }

FILEBASE=$(node -e 'process.stdout.write(require(process.argv[1]).meta.filebase)' "$EVENT_JSON")
[ -n "$FILEBASE" ] || { echo "meta.filebase が空" >&2; exit 3; }

# 作業ディレクトリは毎回新しく作る。使い回すと前回分の所有者違いで書けなくなる
WORK=$(mktemp -d -t build_event-XXXXXX)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/generator/scripts"
cp "$SKILL/generator/gen_deck.base.js" "$WORK/generator/scripts/gen_deck.js"
cp "$HERE"/apply_*.js "$WORK/generator/scripts/"
cp -r "$SKILL/generator/images" "$WORK/generator/images"
cp -r "$SKILL/events"           "$WORK/events"
[ -d "$SKILL/references" ] && cp -r "$SKILL/references" "$WORK/references"

# pptxgenjs は generator 配下から見えるところに置く
if [ -d "$SKILL/generator/node_modules" ]; then
  ln -s "$SKILL/generator/node_modules" "$WORK/generator/node_modules"
elif [ -n "${PPTXGENJS_NODE_MODULES:-}" ]; then
  ln -s "$PPTXGENJS_NODE_MODULES" "$WORK/generator/node_modules"
fi

echo "── パッチ適用"
( cd "$WORK/generator" && node scripts/apply_all.js --file "$WORK/generator/scripts/gen_deck.js" >/dev/null )
echo "   14本 適用済み（$(wc -l < "$WORK/generator/scripts/gen_deck.js")行）"

mkdir -p "$OUTDIR"
UPDATE_DATE_VALUE="${UPDATE_DATE:-$(TZ=Asia/Tokyo date '+%d/%m/%Y')}"

echo "── ビルド"
for L in ja en; do
  U=$(echo "$L" | tr a-z A-Z)
  ( cd "$WORK/generator" && \
    LANG_OUT="$L" UPDATE_DATE="$UPDATE_DATE_VALUE" EVENT="$GLIDE" \
    OUT="$OUTDIR/${FILEBASE}_$U.pptx" node scripts/gen_deck.js )
done

echo "── PDF 変換"
# 開いたままの古い PDF を測り続けないよう、先に消してから作る
rm -f "$OUTDIR/${FILEBASE}_JA.pdf" "$OUTDIR/${FILEBASE}_EN.pdf"
( cd "$OUTDIR" && soffice --headless --convert-to pdf --outdir "$OUTDIR" \
    "${FILEBASE}_JA.pptx" "${FILEBASE}_EN.pptx" >/dev/null 2>&1 )

for f in "${FILEBASE}_JA.pdf" "${FILEBASE}_EN.pdf"; do
  [ -s "$OUTDIR/$f" ] || { echo "PDF が作られていない: $f" >&2; exit 5; }
done

echo
echo "── 出力  $OUTDIR"
for f in "${FILEBASE}"_{JA,EN}.{pptx,pdf}; do
  printf '   %-46s %s\n' "$f" "$(du -h "$OUTDIR/$f" | cut -f1)"
done
node -e '
const fs=require("fs");
for (const f of process.argv.slice(1)) {
  const b=fs.readFileSync(f);
  const n=(b.toString("latin1").match(/\/Type\s*\/Page[^s]/g)||[]).length;
  console.log("   " + require("path").basename(f) + ": " + n + " ページ");
}' "$OUTDIR/${FILEBASE}_JA.pdf" "$OUTDIR/${FILEBASE}_EN.pdf"
