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

## 残る汎用化作業 — スライド本体のイベント依存

EVENT対応でデータの入口は汎用化されたが、**スライド本体にはまだ熊本固有の記述が残っている**。
他の災害でそのまま流すと、熊本の内容が混入する。

同期コピー（古い版）で確認した箇所。OneDrive版では行番号が異なる可能性がある。

| 箇所 | 内容 | 必要な対応 |
|------|------|-----------|
| 地理ロケータ | `CITY_MAP = { cLat: 32.655, cLon: 130.707, zoom: 10 }`、`② Japan → Kumamoto / 日本→熊本` | `d.locator = { center, zoom, labels[] }` へ外出し |
| Slide 2 | 見出し `The 2016 Kumamoto Earthquake & Recovery` | 見出しを `d.prior_event.title_en/ja` から取る（本文は既にデータ駆動） |
| Slide 6c | 震源断層の説明に「日奈久断層」「布田川区間」がコード内リテラル | `d.fault.notes[]` へ移す |
| Slide 8 出典行 | `Figures from FDMA / NPA / Kumamoto Pref.` | `d.attribution_en/ja` へ外出し |
| Slide 8b 画像 | `kumamoto_castle` を直接参照 | `d.images` のキー一覧から回す |
| **Slide 8d** | イオンモール熊本 爆発情報 — **全体が熊本専用** | `meta.optional_slides` でオン／オフ |
| Slide 9 出典行 | `linkBy("MLIT"/"FDMA"/"Cabinet Office"/"Kumamoto")` | `d.links` のラベルから引く |
| **Slide 12b2** | サグリ熊本地震マップ — **全体が熊本専用** | `meta.optional_slides` でオン／オフ |
| 死者数の注記 | 消防庁第15報/第18報の数値がコード内リテラル | `d.damage_notes[]` へ移す |

### 提案する契約

```json
"meta": {
  "optional_slides": ["prior_event", "focus_incident", "civic_tech", "bosaixview", "spectee"]
}
```

配列に含まれるスライドだけを描画する。未指定なら描画しない（新規災害では既定でオフ）。
熊本のイベントJSONには全部入れて、現在の出力を1ページも変えないこと。

> **この改修は OneDrive の権威あるファイルに対してのみ行う。**
> 同期コピーに対して行うと、言語レイヤとレイアウト修正を失う。
