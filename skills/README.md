# スキル定義

`docs/adrc-automation-design.md` の設計に基づくスキル定義の版管理用ディレクトリ。

実行時に読まれるのは claude.ai 側に同期されたスキル（セッション内では `~/.claude/skills/synced/`）で、
このディレクトリはその**ソース・オブ・トゥルース**。変更はここで行い、claude.ai へ反映する。

## 収録

| パス | 状態 | 内容 |
|------|------|------|
| `ldi-cms-report/SKILL.md` | **変更** | 既存スキルに Step 5.5（昇格判定）・Step 8（QAゲート）・Step 9（メール組み立て）・Step 10（送信）を追加 |
| `disaster-report/` | **新規** | `kumamoto-eq-report` を統一フォームとして汎用化。イベントは `events/<GLIDE>.json` で管理 |

## 反映手順

1. claude.ai のスキル管理画面で該当スキルを開く
2. このリポジトリの `SKILL.md` の内容で置き換える
3. `disaster-report` は新規スキルとして作成し、`events/` と `references/` を同梱する
4. `generator/` は既存の `kumamoto-eq-report` のものを流用する
   （`_kumamoto_generator/` に置かれたパッチ済み `gen_deck.js` が最新。`EVENT` 環境変数で
   イベントJSONを受け取れるよう改修が必要）

## 未了の作業

- [ ] `gen_deck.js` の `EVENT` 環境変数対応（現在は `generator/data/report_data.json` 固定）
- [ ] 熊本の `report_data.json` → `events/EQ-2026-000135-JPN.json` への移行（`meta` フィールドの追加）
- [ ] コロンビア・インドネシアのイベントJSON作成
- [ ] `kumamoto-eq-report` スキルの廃止（`disaster-report` が熊本を扱えるようになってから）

## 決定事項の記録

| 日付 | 決定 | 反映先 |
|------|------|--------|
| 2026-08-17 | LDIレポートのメール自動送信を可とする（QA PASS時のみ・0件でも送る） | `ldi-cms-report` Step 8–10 |
| 2026-08-17 | 大規模災害レポートは統一フォームとし、OneDrive書き込みとメール送信までを自動化する | `disaster-report` §3, §5 |
| 2026-08-17 | 送信元 `ma-arakida@adrc.asia` はエイリアス設定済みで技術的課題なし（送信済みメールで確認） | 両スキル |
