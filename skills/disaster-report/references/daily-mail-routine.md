# 更新メールの定期タスク — claude.ai の Routines 画面で作る

## なぜ画面で作るのか

**MCP（`create_trigger`）から作った定期タスクにはコネクタが付かない。**
Superhuman が無いセッションが起きるので、メールを送れない。
タスク自体は正常に作られたように見えるので気づきにくい。

コネクタを使う定期タスク（メール送信・カレンダー）は**必ず画面から作る**。

## 画面での設定

| 項目 | 値 |
|---|---|
| 名前 | コロンビア・チョコ地震 更新メール送信（08:30 JST） |
| スケジュール | 毎日 08:30（JST） |
| コネクタ | **Superhuman を選ぶ**（ここが要点） |
| セッション | 毎回新しく作る |

## 貼り付ける本文

ここから下を、そのままプロンプト欄に貼る。

---

コロンビア・チョコ地震（GLIDE EQ-2026-000146-COL）の更新メールを研究部へ送ってください。

## 0. 最初にこれをやる（省略不可）

このセッションは main を clone して始まる。統一フォームのスキル一式は main には無い。

```bash
git fetch origin claude/workflow-automation-review-shyt35
git checkout claude/workflow-automation-review-shyt35
git pull origin claude/workflow-automation-review-shyt35
test -f skills/disaster-report/SKILL.md || echo "MISSING_SKILL"
```

`MISSING_SKILL` が出たら中断して、その旨だけ報告する。推測でファイルを作り直さない。

## 1. 公開されたことを確かめる（送信の前提・省略不可）

```bash
cat skills/disaster-report/_published/EQ-2026-000146-COL.json
```

このファイルは、荒木田さんのPCが `C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters` へ実際に4ファイルを出したときだけ書かれる。

- ファイルが**無い** → **メールを送らない。**「PC側の公開が確認できないため送信を見送った」とだけ報告して終わる
- `published_date_jst` が**今日（JST）でない** → 同じく**送らない**。その日付を添えて報告して終わる
- 今日の日付である → 送信へ進む

**この確認を飛ばして送らないこと。** メール本文に「OneDriveに保存しました」と書くので、実際に保存されていないまま送ると嘘になる。

## 2. 数値急変ゲート

```bash
node skills/disaster-report/generator/scripts/resolve_event.js --event EQ-2026-000146-COL
```

- `HOLD` で理由が**数値急変**（死者が前報比+50%以上、住家被害2倍以上、いずれかの数値の減少、ティア降格）→ **通常メールを送らず**、SKILL.md §2 の確認メールに切り替える。宛先は `ma-arakida@adrc.asia` のみ。前報値・今報値・出典URL・出典日を並べる
- `HOLD` の理由が**初版（前報なし）だけ** → 送信してよい（荒木田さんの2026年8月24日の指示による）
- `OK` → 送信する

## 3. 送信

`skills/disaster-report/SKILL.md` の §5-2 に**そのまま従う**。件名・本文の順序・免責・文体の禁止事項はすべてそこに書いてある。要点だけ再掲する。

- 送信元は **`ma-arakida@adrc.asia`**（`ma.arakida@gmail.com` にエイリアス設定済み）
- 宛先: `kenkyubu@adrc.asia`, `td-date@adrc.asia`
- Superhuman の `create_or_update_draft`（`from` に `ma-arakida@adrc.asia`、`body` に完成HTML）→ `send_draft`
- **送信後、From が実際に adrc.asia になっているか確認する**
- **`ma-arakida@adrc.asia` として送信できなければ、下書きのまま止める。** 別アカウントからは送らない。その場合は「下書きを用意した。ワンタップで送れる」と通知する
- **署名ブロックは入れない。** 本文は「荒木田」の1行で終える
- 「正念場」「予断を許さない」「懸念される」など、書き手の評価や情緒を足す語を使わない

本文に載せる数値・ファイル名・ページ数は `_published/EQ-2026-000146-COL.json` と `events/EQ-2026-000146-COL.json` から取る。手で書かない。

## 4. 送ったあと

送信できたら `events/EQ-2026-000146-COL.json` の `_prev` を**今送った版の headline** に更新し、コミットして `claude/workflow-automation-review-shyt35` へプッシュする。これで翌日から数値急変ゲートが効くようになる。

## 報告

送った / 送らなかった のどちらかと、その理由を1行で。送らなかった場合は何が足りなかったかを書く。黙って終わらないこと。

---

## 作ったあとの確認

その場で1回、手動で実行する。

`_published` がまだ無い状態なら、**「公開が確認できないため送信を見送った」で終わるのが正解**。
ここでメールが飛んだらゲートが効いていない。作り直すこと。
