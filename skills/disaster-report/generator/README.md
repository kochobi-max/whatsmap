# generator — EVENT対応と残る汎用化作業

## ⚠️ 権威あるバージョンについて

`gen_deck.js` の**最新版は OneDrive の `_kumamoto_generator/gen_deck.js`** にある。

セッション内の `~/.claude/skills/synced/kumamoto-eq-report/generator/scripts/gen_deck.js` は**古い**。
確認済みの差分:

| 項目 | 同期コピー（古い） | SKILL.md が規定する仕様（＝OneDrive版） |
|------|------------------|--------------------------------|
| 本文フォント | `FONT = "Calibri"` | `FONT = "Meiryo"` |
| 言語レイヤ | `LANG_OUT` / `SPLIT_OVERRIDE` **なし**（0件） | あり（ja / en / bi の出し分け） |
| レイアウト修正 | 未適用 | 適用済み |

**同期コピーを土台に書き直してはならない。** 言語レイヤとレイアウト修正が消える。
改修は必ず OneDrive 版に対して行うこと。

---

## EVENT対応パッチ

`gen_deck.js` の本体（スライド定義・言語レイヤ・レイアウト）には触れず、
冒頭のデータ読み込み3文だけを差し替える。

```bash
node scripts/apply_event_patch.js --file "<OneDrive>/_kumamoto_generator/gen_deck.js" --dry-run
node scripts/apply_event_patch.js --file "<OneDrive>/_kumamoto_generator/gen_deck.js"
```

- 3文がそれぞれちょうど1回見つからなければ**何もせず中断**する（曖昧一致で書き換えない）
- 適用後に構文チェックを行い、壊れていれば書き込まない
- `.bak` を残す。2回目以降は「すでにパッチ済み」で何もしない（冪等）

### 変更内容

| 変更前 | 変更後 |
|--------|--------|
| `DATA` は `data/report_data.json` 固定 | `EVENT`（GLIDE番号 or パス）から `events/<GLIDE>.json` を解決。`DATA` 明示時はそちらを優先（後方互換） |
| `OUT` の既定値が `Kumamoto_EQ_Report.pptx` | `meta.filebase` ＋ `LANG_OUT` から組み立て |

### 適用後の呼び出し

```bash
for L in ja en; do
  U=$(echo $L | tr a-z A-Z)
  LANG_OUT=$L UPDATE_DATE="$(TZ=Asia/Tokyo date '+%d/%m/%Y')" \
    EVENT=EQ-2026-000135-JPN \
    OUT="$OUTDIR/ADRC_EQ_JPN_Kumamoto_20260728_$U.pptx" node scripts/gen_deck.js
done
```

---

## ビルド前の検証（依存なし・単体で動く）

```bash
node scripts/resolve_event.js --event EQ-2026-000135-JPN
node scripts/resolve_event.js                # status:"active" の全イベント
node scripts/resolve_event.js --event ... --json
```

| 終了コード | 意味 | 次の動作 |
|-----------|------|---------|
| `0` OK | 検証通過・数値急変なし | ビルド → OneDrive保存 → **メール送信** |
| `2` HOLD | 数値急変ゲートに該当 | ビルド・保存はする。**メールは送らず**荒木田へ確認 |
| `3` INVALID | スキーマ違反・プレースホルダ残存 | **ビルドしない** |
| `4` NOT_FOUND | イベントJSONが無い | 何もしない |

### 数値急変ゲートの判定

`meta.headline`（今報）と `_prev`（前報）を比較する。

| 項目 | しきい値 | 累積値か |
|------|---------|---------|
| 死者数 | +50% | ○ 減少もHOLD |
| 負傷者数 | +100% | ○ 減少もHOLD |
| 住家全壊 | +100% | ○ 減少もHOLD |
| 行方不明者数 | +100% | × 救出・確認で減るのは正常 |
| 避難者数 | +100% | × 復旧で減るのは正常 |

加えて **ティア降格**（official → media）と **`as_of` の据置**（最新報が未公表の可能性）を検出する。
初版（`_prev` が空）は必ず HOLD ── 全ページの目視が要るため。

---

## 旧データの移行

```bash
node scripts/migrate_event.js \
  --in "<OneDrive>/_kumamoto_generator/report_data.json" \
  --iso3 JPN \
  --filebase ADRC_EQ_JPN_Kumamoto_20260728 \
  --primary-source "消防庁 (FDMA)" \
  --dry-run
```

既存の内容は書き換えず、運用フィールドを足すだけ。英日同居の構造はそのまま保持する。
熊本の実データで検証済み（トップレベル22キーをそのまま引き継ぐことを確認）。

移行後、`meta.headline` を手で埋めてから `resolve_event.js` で検証する。

---

## イベント固有スライドの出し分け

```bash
node scripts/apply_slide_gates.js --file scripts/gen_deck.js --dry-run
node scripts/apply_slide_gates.js --file scripts/gen_deck.js
```

`apply_event_patch.js` の後に当てる。スライド本体の行は1行も書き換えず、外側に条件を1つ足すだけ。

### ゲートが要るのは4種だけだった

権威版を調べたところ、**大半のスライドはすでにデータの有無で自動的に消える**。
それらにゲートを足すのは重複した機構になるので、触らない。

| すでに自動で消えるスライド | 条件 |
|--------------------------|------|
| 震源断層 | `if (d.fault && (d.fault.rows \|\| []).length)` |
| 庁舎の建替え | `if (d.cityhalls)` |
| 災害関連死・車中泊 | `if (d.related_deaths)` |
| 災害ボランティア | `if (d.volunteers)` |
| 自衛隊災害派遣 | `if (d.jsdf)` |
| TEC-FORCE | `if (d.tecforce)` |
| 法適用 | `if (d.legal)` |
| 情報プラットフォーム | `(d.platform_pages \|\| []).forEach(...)` |

ゲートを足したのは「**データが無くても描画されてしまう**」次の5ブロック（キーは4種）。

| キー | スライド | 形 | 理由 |
|------|---------|----|------|
| `prior_event` | Slide 2 過去災害と復興 | flat | 見出し `The 2016 Kumamoto Earthquake & Recovery` がハードコード |
| `focus_incident` | Slide 8d / 8e 個別事案 | block | `d.aeon_focus` が無くても空スライドが2枚出る |
| `civic_tech` | Slide 12b2 サグリ | block | 本文が全文ハードコード |
| `spectee` | Slide 12c Spectee | flat | 本文と消防庁報番号が全文ハードコード |

### 契約

```json
"meta": { "optional_slides": ["prior_event", "focus_incident", "civic_tech", "spectee"] }
```

- **未指定 → 全スライドを描画する（後方互換）。** 既存イベントの出力は変わらない
- 配列あり → 含まれるキーのスライドだけ描画。新規災害は `[]` から始める

### 検証済み（権威版 2,165行に対して実施）

| 条件 | 結果 |
|------|------|
| パッチ2つを順に適用 → ビルド | ✓ 27ページ生成 |
| `optional_slides` 全キー指定 | 27ページ |
| `optional_slides` **未指定** | **27ページ（後方互換を確認）** |
| `optional_slides: []` | **22ページ（5ブロックが落ちる）** |
| `OUT` 省略 | `ADRC_EQ_JPN_Kumamoto_20260728_EN.pptx` を自動命名・`output/` を自動作成 |
| 言語レイヤ | 英語版 かな/カナ **0字** ／ 日本語版 1,068字 |
| フォント | `FONT = "Meiryo"` 保持 |
| 二重適用 | 両パッチとも冪等 |

---

## 地理ロケータのデータ駆動化

```bash
node scripts/apply_locator_patch.js --file scripts/gen_deck.js --dry-run
node scripts/apply_locator_patch.js --file scripts/gen_deck.js
```

Slide 1 の3面ロケータ（世界→国→震度分布）は、中心座標・ズーム・赤枠の緯度経度・ラベルが
すべて熊本前提のリテラルだった。海外災害では**日本地図が出てしまう**ため、`d.locator` から読むようにする。

置換するのは5箇所（`CITY_MAP` / `seq` / `WORLD_MAP`・`JAPAN_MAP` / `rw` / `rj`）。
それぞれちょうど1回見つからなければ中断する。

### データ形

```json
"locator": {
  "city_map": { "cLat": 5.69, "cLon": -76.66, "zoom": 9 },
  "steps": [
    { "key": "google_world", "label_en": "World → Colombia", "label_ja": "世界→コロンビア",
      "cap": "© Google", "map": { "cLat": 4.0, "cLon": -74.0, "zoom": 4 },
      "box": { "n": 13.5, "s": -4.2, "w": -79.0, "e": -66.8 } },
    { "key": "google_japan", "label_en": "Colombia → Chocó", "label_ja": "コロンビア→チョコ県",
      "cap": "© Google", "map": { "cLat": 5.7, "cLon": -76.6, "zoom": 7 },
      "box": { "n": 8.7, "s": 3.9, "w": -77.9, "e": -76.0 } },
    { "key": "intensity_map", "label_en": "USGS ShakeMap", "label_ja": "USGS 震度分布", "cap": "© USGS" }
  ]
}
```

- 3段目に `box` は不要（それ以上ズームしない）
- ラベルは従来と同じ `① World → Japan / 世界→日本` の書式で組まれる。
  **単言語版の分離は既存の言語レイヤがこの書式を前提にしている**ので崩さないこと
- `key` は画像スロット名。`google_japan` というキー名は海外災害でも据え置き
  （画像ファイルを差し替えて使う。改名すると既存の画像解決が壊れる）
- **`city_map` は画像 `google_cities` の中心・ズームと必ず一致させること。**
  ずれると Slide 4 の市町村マーカーが実際の位置と合わなくなる

### 検証済み

| 条件 | 結果 |
|------|------|
| `d.locator` **なし** | スライド本文・図形座標とも**差分0**（熊本の出力は1ピクセルも変わらない） |
| `d.locator` あり（コロンビア） | ラベルが `世界→日本` `→熊本` から `世界→コロンビア` `→チョコ県` に変化 |
| 赤枠・リード線 | slide1 の図形座標 32点中 **6点が移動**（`geoRect` がデータを読んでいる） |

---

## まだ残っているイベント固有記述

ゲートでもロケータでも落とせない、スライド内に埋まったリテラル。
**いずれも日本国内の災害であればそのまま使える**（機関名が共通）ため、優先度は低い。

| 箇所 | 内容 | 対応案 |
|------|------|-------|
| Slide 8 出典行 | `Figures from FDMA / NPA / Kumamoto Pref.` | `d.attribution_en/ja` へ外出し |
| Slide 8b 画像 | `kumamoto_castle` を直接参照 | `d.images` のキー一覧から回す |
| Slide 9 出典行 | `linkBy("MLIT"/"FDMA"/"Cabinet Office"/"Kumamoto")` | `d.links` のラベルから引く |

## 画像について

`google_world` / `google_japan` / `google_cities` / `intensity_map` は**熊本の画像**。
海外災害では差し替えが要る。`generator/images/<GLIDE>/` に置き、
イベントJSONの `images` から参照する。`locator.steps[].map` の中心・ズームと
実際に取得した地図画像の中心・ズームを**必ず一致させること**（ずれると赤枠が合わない）。

## パッチの適用順

```
1. apply_event_patch.js    ← EVENT 解決・OUT 自動命名
2. apply_slide_gates.js    ← イベント固有スライドの出し分け
3. apply_locator_patch.js  ← 地理ロケータのデータ駆動化
```

いずれも冪等。すべて適用後に `.bak` / `.gates.bak` / `.locator.bak` が残る。
