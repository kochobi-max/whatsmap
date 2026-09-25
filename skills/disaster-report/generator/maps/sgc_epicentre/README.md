# SGC 震央分布図の作り方

コロンビアの地震で `epicentre_distribution` の画像をつくる一式。
出力は `../../images/<GLIDE>/epicentre_distribution.png`。

## なぜ自前で描くのか

SGC の震央分布図は公開されているが、**そのまま画像として取れない**。

| 経路 | 結果 |
|---|---|
| `www.sgc.gov.co/detallesismo/<id>/mapa` | React の SPA。地図は Google Maps。HTML には点が入っていない |
| `api.sgc.gov.co/api/events/search/` | 403 `ForbiddenException`（API Gateway 側の拒否。こちらの回線の問題ではない） |
| ニュース記事の画像フォルダ | 記者会見の写真とバナーだけ。分布図は無い |
| カタログの `mapa_sismicidad_experta.php` | Google Maps 依存。スクリーンショットが要る |

一方 **旧カタログ（`bdrsnc.sgc.gov.co`）は素の PHP フォーム**で、POST すれば
震源の表が HTML でそのまま返る。ここから点を取って自分で描くのが一番確実で、
かつ毎回同じ図が再現できる。

## 手順

```sh
# 1. SGC カタログに問い合わせる（日付は dd/mm/yyyy）
./fetch_sgc_catalog.sh 10/08/2026 20/08/2026 4.2 5.7 -77.0 -75.5 sgc_result.html

# 2. 表を CSV にする
python3 parse_sgc.py sgc_result.html data/sgc_events.csv

# 3. 下図をつくる（初回のみ。data/ に入っていれば飛ばしてよい）
#    Natural Earth を geojson/ 以下に落としてから clip_ne.py を回す
python3 clip_ne.py

# 4. 図を描く
LANG_OUT=bi python3 make_epicentre_map.py
```

`LANG_OUT` は `ja` / `en` / `bi`（既定 `bi`）。**デッキのビルドと同じ値を渡す。**
違う値で作ると、デッキが日本語なのに図だけ英語、ということが起きる。

## つまずいた点（次に同じことをしないため）

- **`ubi=cuadrante` を送らないと lat/lon の条件が無視され、SGC 側が SQL エラーを返す。**
  画面には「Total de registros:」だけが出て件数が空になる。
  エラーページではないので、件数を見ないと失敗に気づけない。
  `fetch_sgc_catalog.sh` は `mysql_fetch_row` を見つけたらその場で止める。
- 日付は **dd/mm/yyyy**。mm/dd で送ると別の期間を静かに返す。
- 地図タイル（`server.arcgisonline.com`、`tile.openstreetmap.org`）は
  既定のネットワークポリシーでは通らない。だから下図は Natural Earth の
  ベクタを `raw.githubusercontent.com` から取って自分で描いている。
  タイルを使う設計にすると、環境によって図が白くなる。
- Natural Earth の全世界版は 61MB ある。毎回読むには重いので
  `clip_ne.py` で描画範囲に切って `data/basemap.json`（約170KB）に固めてある。

## 出典表記

図の下に入っている文言をそのまま使う。

> Source: Servicio Geológico Colombiano (SGC), Catálogo de Sismicidad.
> Base map: Natural Earth.
> 出典：コロンビア地質調査所（SGC）地震カタログ。地形：Natural Earth

イベントの `attribution.epicentre_distribution` もこれに合わせること。

## 2026 チョコ地震で使った条件

| 項目 | 値 |
|---|---|
| 期間 | 2026-08-10 〜 2026-08-19（UTC） |
| 範囲 | 北緯 4.2〜5.7、西経 77.0〜75.5 |
| 件数 | 285（本震 + 余震 284） |
| 本震 | 2026-08-10 12:34:27 UTC、Mw7.4、4.991N / 76.292W、深さ103.41km |
| SGC のイベントID | `SGC2026pqqmro` |

本震の値は `events/EQ-2026-000146-COL.json` の `event.sgc.*` と一致することを確認済み。
