# スキル定義

`docs/adrc-automation-design.md` の設計に基づくスキル定義の版管理用ディレクトリ。

実行時に読まれるのは claude.ai 側に同期されたスキル（セッション内では `~/.claude/skills/synced/`）で、
このディレクトリはその**ソース・オブ・トゥルース**。変更はここで行い、claude.ai へ反映する。

## 収録

| パス | 状態 | 内容 |
|------|------|------|
| `ldi-cms-report/SKILL.md` | **変更** | 既存スキルに Step 5.5（昇格判定）・Step 8（QAゲート）・Step 9（メール組み立て）・Step 10（送信）を追加 |
| `disaster-report/` | **新規** | `kumamoto-eq-report` を統一フォームとして汎用化。イベントは `events/<GLIDE>.json` で管理 |
| `glide-analysis/` | **新規** | GLIDE × EM-DAT の突合・C1〜C7 分類・対応分析。突合スクリプトは標準ライブラリのみで動作（自己テスト付き） |
| `trip-dossier/` | **新規** | Plaud・Calendar・領収書OCR から出張書類の中身を収集。`trip-report-creator` の前段 |

## 反映手順

1. claude.ai のスキル管理画面で該当スキルを開く
2. このリポジトリの `SKILL.md` の内容で置き換える
3. `disaster-report` は新規スキルとして作成し、`events/` と `references/` を同梱する
4. `generator/` は既存の `kumamoto-eq-report` のものを流用する
   （`_kumamoto_generator/` に置かれたパッチ済み `gen_deck.js` が最新。`EVENT` 環境変数で
   イベントJSONを受け取れるよう改修が必要）

## 生成器の改修状況

詳細は `disaster-report/generator/README.md`。

- [x] `EVENT` 環境変数対応 — `apply_event_patch.js`（冪等・構文チェック付き・曖昧一致を拒否）
- [x] イベント固有スライドの出し分け — `apply_slide_gates.js`（`meta.optional_slides`）
- [x] ビルド前検証と数値急変ゲート — `resolve_event.js`（終了コード 0 / 2 / 3 / 4）
- [x] 旧データの移行 — `migrate_event.js`
- [x] **権威版（2,165行）でビルドまで通して検証**（27ページ生成 / 後方互換 / 言語レイヤ無傷）
- [ ] パッチを OneDrive の `_kumamoto_generator/gen_deck.js` へ適用し、書き戻す
- [ ] 熊本の権威版 `report_data.json` を移行し、`meta.headline` を記入
- [x] 地理ロケータのデータ駆動化 — `apply_locator_patch.js`（`d.locator` なしで出力差分0を確認）
- [x] コロンビア・インドネシアのイベントJSON作成（骨格・ロケータ設定済み。被害数値は初回実行で収集）
- [ ] 海外2件の地図画像の差し替え（`generator/images/<GLIDE>/`）
- [ ] `kumamoto-eq-report` スキルの廃止（`disaster-report` が熊本を扱えるようになってから）

> ⚠️ **セッション内の同期コピー（`~/.claude/skills/synced/kumamoto-eq-report/generator/`）は古い。**
> 794行・`FONT = "Calibri"`（規定は `Meiryo`）で、`LANG_OUT` / `SPLIT_OVERRIDE` が存在しない（0件）。
> 権威版は 2,165行。**同期コピーを土台に書き直さないこと。**
> このリポジトリの5スクリプトは、どちらのバージョンにも当てられるよう
> gen_deck.js 本体に触れない設計にしてある（スライド本体の行は1行も書き換えない）。

## 決定事項の記録

| 日付 | 決定 | 反映先 |
|------|------|--------|
| 2026-08-17 | LDIレポートのメール自動送信を可とする（QA PASS時のみ・0件でも送る） | `ldi-cms-report` Step 8–10 |
| 2026-08-17 | 大規模災害レポートは統一フォームとし、OneDrive書き込みとメール送信までを自動化する | `disaster-report` §3, §5 |
| 2026-08-17 | 送信元 `ma-arakida@adrc.asia` はエイリアス設定済みで技術的課題なし（送信済みメールで確認） | 両スキル |
| 2026-08-17 | 出張ドシエの確信度「低」の欄は値を入れず空欄で出す | `trip-dossier` |
| 2026-08-17 | GLIDE の C6（閾値差）は正常な差として不整合の分母から外す | `glide-analysis` |
