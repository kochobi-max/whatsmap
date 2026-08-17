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

---

## コロンビアの統合について（2026-08-17 調査結果）

PR #1 をマージし、`reports/colombia_eq_20260810/` が main に入った。
しかし**リポジトリを統合してもコードは統合されていない**。実測した差分は次のとおり。

| | コロンビア | 統一版（熊本） |
|---|---|---|
| トップレベルキー | **57** | 23 |
| 言語 | EN / JA / **ES**（`_es` が330箇所） | JA / EN |
| gen_deck.js | 984行 | 2,165行 |
| ページ数 | 36 | 27 |

### 共通しているのは15キーだけ

`aftershocks` `damage` `event` `historical` `images` `links` `meta` `prior_event`
`response_measures` `satellite` `source_policy_en/ja` `support_domestic` `support_international` `timeline`

### 統一版に受け皿が無いキーが42個

`areas` `cali` `deaths_by_area` `drm_system` `emsr916` `exposure` `intensity_map`
`mechanism_fig` `observations` `pager` `photos` `pre_event` `response_photos` `tectonics`
ほか、`*_note_en/ja/es` 系の注記群。

**いま統一版へ移すと、レポートの内容の大半を失う。** したがって
`events/EQ-2026-000146-COL.json` は `status: "pending"` とし、
定期タスクの対象から外してある。運用は当面 `reports/colombia_eq_20260810/` 側で続ける。

### status の三態

| status | 意味 | 定期タスク |
|--------|------|-----------|
| `active` | 統一版で日次運用中 | 対象 |
| `pending` | 未移行（データ未整備、または別実装で運用中） | **対象外** |
| `archived` | 更新終了 | 対象外 |

`pending` のイベントを明示指定すると、未記入を欠陥として報告せず
`PENDING` と `pending_reason` を返す（終了コード0）。

### 移行の順序（コロンビアを active にするまで）

1. **スペイン語を落とす。** 日英2言語で足りることは確認済み
   （2026-08-12、伊達氏との往復で「英語版と日本語版があればいい」と決定）。`_es` 330箇所が消える
2. **42キーのうち汎用性のあるものを統一版の受け皿スライドにする。**
   既存の `if (d.tecforce)` と同じデータ駆動パターンで足す。汎用性が高い順に:
   `deaths_by_area`（市町村別死者）→ `exposure`（曝露人口）→ `pager`（USGS PAGER）
   → `tectonics`（テクトニクス）→ `emsr916`（Copernicus EMS）→ `drm_system`（相手国の防災体制）
3. **イベント固有のもの（`cali` `pre_event` `response_photos` `observations`）は
   `optional_slides` のゲート対象**にする
4. `migrate_event.js` でJSONを移し、`meta.headline` を記入
5. 出力を旧実装と並べて目視比較し、落ちたページが無いことを確認してから `status: "active"`

**2が本体の作業**で、ここを飛ばして移行してはならない。

---

## 移行ステップ1・2の実施結果（2026-08-17）

### ステップ1: スペイン語の削除 — 完了

```bash
node scripts/migrate_event.js --in <colombia>/report_data.json \
  --iso3 COL --filebase ADRC_EQ_COL_Choco_20260810 \
  --primary-source UNGRD --strip-lang es --out events/EQ-2026-000146-COL.json
```

`--strip-lang` は `*_es` キーと、en/ja と並ぶ `es` キーを再帰的に落とす。
**en/ja の対が無い箇所は残す**（唯一の本文を消さないため）。残した場合は警告に出す。

コロンビアの実績: **433箇所**を削除、181,618字 → 113,859字（**37.3%減**）、残存 `_es` は0。

### ステップ2: 受け皿スライド6種 — 完了

```bash
node scripts/apply_receiver_slides.js --file scripts/gen_deck.js
```

| キー | 内容 | 挿入位置 |
|------|------|---------|
| `tectonics` | テクトニクス（本文＋ティア付き箇条書き） | Slide 6b の前 |
| `pager` | USGS PAGER 影響評価 | Slide 8b の前 |
| `deaths_by_area` | 地域別の死者数（表＋注記） | 同上 |
| `exposure` | 揺れの階級別 曝露人口（表＋注記） | 同上 |
| `emsr916` | Copernicus EMS（諸元表＋発動理由＋注記） | Slide 13 の前 |
| `drm_system` | 相手国の防災体制（導入文＋箇条書き） | 同上 |

すべてデータ駆動。**熊本は27ページのまま変化なし**。コロンビアでは6種すべて描画を確認
（tectonics=9, pager=13, deaths_by_area=14, exposure=15, emsr916=23, drm_system=24 ページ目）。

### 途中で見つけた欠陥2件 — 修正済み

```bash
node scripts/apply_data_guards.js --file scripts/gen_deck.js
```

1. **他国のデータでビルドが落ちる。** `d.cities` `d.timeline` `d.damage` `d.satellite` `d.links`
   を「必ずある」前提で直接参照していた。コロンビア（`cities` を持たず `areas` を持つ）で
   `TypeError: Cannot read properties of undefined` により停止。9箇所を `(d.x || [])` でガード
2. **津波スライドも同様。** `d.tsunami` を24箇所で直接参照。震度も日本の 7 / 6強 / 6弱 前提
   なので、セクションごと `if (d.tsunami || d.intensity...)` で条件化

### ⚠️ ステップ3の前にやること — 日本固有リテラルの外出し

コロンビアをビルドすると**9/30ページに熊本の記述が混入する**。ビルドは通るので
機械検査では捕まらない。**この状態で公表してはならない。**

| ページ | 混入内容 | 対応 |
|--------|---------|------|
| 6 | 出典「総務省統計局」 | `d.links` から引く |
| 7・8 | 「気象庁 震度分布図」「震央分布図」＋ `jma.go.jp` | `d.links` から引く |
| **10** | **「M7.1（気象庁）／M6.8（USGS）、深さ約16km」「布田川」「日奈久」** | `d.event.magnitude` / `mag_usgs` / `depth_display` から組む。断層名は `d.fault` へ |
| 11・12 | 「消防庁・警察庁・熊本県等の集計に基づき」 | `d.attribution_en/ja` へ外出し |
| 20・21 | 「国土地理院 だいち2号」「日奈久」「八代」 | `d.satellite` の行から組む |

**10ページ目が最も危険**（M7.4・深さ110kmのコロンビアに熊本の諸元が出る）。

> 2026-08-17 の初回調査で「残るリテラルは3箇所・日本国内なら影響なし」と記録したが、
> **これは過小だった**。実際に他国データでビルドして初めて9ページ分が判明した。
> 移行の検証は「ビルドが通ること」ではなく「他国データで中身が正しいこと」で行う。

### パッチの適用順（5本）

```
1. apply_event_patch.js     EVENT 解決・OUT 自動命名
2. apply_slide_gates.js     イベント固有スライドの出し分け
3. apply_locator_patch.js   地理ロケータのデータ駆動化
4. apply_receiver_slides.js 汎用キー6種の受け皿
5. apply_data_guards.js     欠損データでの停止を防ぐ
```

権威版 2,165行に5本すべてを順に適用し、熊本27ページ・コロンビア30ページの生成を確認済み。

---

## ステップ2.5: 日本固有リテラルの外出し（2026-08-17）

```bash
node scripts/apply_attribution_patch.js --file scripts/gen_deck.js
```

**既定値は現在の熊本の記述のまま。** データがあるときだけ差し替わるので、
熊本の出力は**27ページ・本文差分ゼロ**（機械比較で確認）。

### 外出しした7箇所

| 箇所 | データキー |
|------|-----------|
| 表紙の最大震度 | `d.event.max_intensity` が無ければ**区切りごと省く**（従来は `undefined` と表示） |
| 表紙の震度発表機関 | `d.event.intensity_agency_en/ja`（既定: 気象庁） |
| Slide 4 人口の出典 | `d.links` の "Population" を含むラベル |
| Slide 5 震度分布図のキャプション | `d.image_captions.intensity_map` |
| Slide 5 基本情報の出典 | `d.event.source_en/ja` |
| Slide 6 震央分布図のキャプション | `d.image_captions.epicentre_distribution` |
| Slide 6 震央分布の出典行 | `d.links` の "Hypocentre" / "Aftershock counts" |
| Slide 6b 発震機構の箇条書き | `d.mechanism_points`（諸元・発震機構・震源断層） |
| Slide 8 被害状況の出典注記 | `d.attribution_en/ja` |

あわせて、`apply_slide_gates.js` に **`satellite_jp`** を追加した。衛星の 1/3・2/3 は
国土地理院 InSAR・千葉大CEReS・QPS-SAR の解析結果を本文ごとハードコードしており、
他国では中身が丸ごと誤りになるため。参加機関の一覧（3/3）は `d.satellite` 駆動なので対象外。

### 混入は 9 → 3ページに減った

| 残り | 原因 | 対処 |
|------|------|------|
| Slide 4「総務省統計局」 | `d.links` に "Population" ラベルが無く既定値が出た | **データ側**。イベントJSONに人口出典を追加すれば消える |
| Slide 6「気象庁」 | 同上（"Hypocentre" ラベルが無い） | **データ側** |
| **Slide 6b の観測機関一覧** | 防災科研 K-NET/KiK-net・F-net・Hi-net・気象庁CMT が本文にハードコード | **コード側。未対応** |

最後の1件だけが残っている。`d.mechanism_sources` を新設して同じ流儀で外出しするか、
`optional_slides` のゲート対象にするか、どちらでも良い。

### 落とし穴: ゲートキーを増やすと既存イベントからページが落ちる

`optional_slides` は**許可リスト**なので、`satellite_jp` を追加した時点で、
それを列挙していない既存イベント（熊本のテスト用JSON）から**2ページが黙って落ちた**。
27 → 25ページになって初めて気づいた。

対策として `resolve_event.js` に `KNOWN_GATES` を持たせ、
**`optional_slides` に未記載のゲートキーがあれば WARN を出す**ようにした。
新しいゲートを足すときは `KNOWN_GATES` と `migrate_event.js` の
`ALL_OPTIONAL_SLIDES` の両方を更新すること。

### パッチの適用順（6本）

```
1. apply_event_patch.js       EVENT 解決・OUT 自動命名
2. apply_slide_gates.js       イベント固有スライドの出し分け
3. apply_locator_patch.js     地理ロケータのデータ駆動化
4. apply_receiver_slides.js   汎用キー6種の受け皿
5. apply_data_guards.js       欠損データでの停止を防ぐ
6. apply_attribution_patch.js 出典・キャプション・発震機構の外出し
```

素の権威版（2,165行）に6本すべてを順に適用して検証済み。
熊本27ページ（本文差分ゼロ）／コロンビア28ページ。
