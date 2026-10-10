#!/usr/bin/env bash
# SGC「Catálogo de Sismicidad」に問い合わせて、検索結果の HTML を保存する。
#
# SGC の地震ページ（www.sgc.gov.co/detallesismo/...）は React の SPA で、
# 背後の API（api.sgc.gov.co）は外部から 403 を返す。
# 一方この旧カタログは素の PHP フォームで、POST すれば表がそのまま返る。
# 震央分布図をつくるにはこちらを使う。
#
#   ./fetch_sgc_catalog.sh 10/08/2026 20/08/2026 4.2 5.7 -77.0 -75.5 out.html
#
# 日付は dd/mm/yyyy。ubi=cuadrante を必ず付ける。
# これが無いと lat/lon の条件が効かず、サーバ側が SQL エラーになる。
set -euo pipefail

INICIAL="${1:-10/08/2026}"
FINAL="${2:-20/08/2026}"
LAT_MIN="${3:-4.2}"
LAT_MAX="${4:-5.7}"
LON_MIN="${5:--77.0}"
LON_MAX="${6:--75.5}"
OUT="${7:-sgc_result.html}"

BASE="https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp"

curl -sS -L --max-time 180 \
  -X POST "$BASE/consulta_sismo.php" \
  -H "Referer: $BASE/consultaexperta.php" \
  --data-urlencode "ubi=cuadrante" \
  --data-urlencode "inicial=$INICIAL" \
  --data-urlencode "final=$FINAL" \
  --data-urlencode "latitudStart=$LAT_MIN" \
  --data-urlencode "latitudEnd=$LAT_MAX" \
  --data-urlencode "longitudStart=$LON_MIN" \
  --data-urlencode "longitudEnd=$LON_MAX" \
  --data-urlencode "magnitudStart=1.0" \
  --data-urlencode "magnitudEnd=9.0" \
  --data-urlencode "Submit=Consultar" \
  -o "$OUT"

# 取得できたつもりで空表を掴まないよう、その場で確かめる
if grep -q "mysql_fetch_row" "$OUT"; then
  echo "SGC がクエリを処理できていない（mysql_fetch_row の警告あり）。" >&2
  echo "ubi と日付の形式（dd/mm/yyyy）を確認すること。" >&2
  exit 1
fi
echo "saved $OUT ($(wc -c < "$OUT") bytes)"
grep -oE 'Total de registros: *</[^>]*> *[0-9]+' "$OUT" | head -1 || true
