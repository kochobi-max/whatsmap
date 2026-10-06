# アカウントのスキルへ上げるもの（2026-10-06）

**このリポジトリを直しても、毎朝の定期タスクには届かない。**
定期タスクは Cowork 環境で動き、リポジトリを clone しない（`sources` が空）。
読まれるのは**アカウントに同期されたスキル**である。

同期スキルはスクリプトを持てる（`disaster-report` は実際に12本持っている）。

## 上げるもの

### 1. `ldi-cms-report`

```
ldi-cms-report/
  SKILL.md                        ← 差し替え（Step 3 / 7 / 11 を追記）
  scripts/ldi_state.py            ← 新規
  scripts/fetch_adrc.js           ← 新規（ブラウザの中で動かす。DOM依存部分は未検証）
  references/sources.md           ← 新規（Step 3 の参照先）
```

**UPLOAD.md（このファイル）は上げない。** リポジトリ側の作業メモである。

### 上げ方（2026-10-06 確立）

1. セッション側で `.skill` を作る（AI）。スキルのフォルダを zip にしたもの。
   `skill-creator` の `scripts/package_skill.py` を使い、先に `quick_validate.py` を通す
2. `SendUserFile` でファイルカードとして渡す（AI）
3. **カードの「Save skill」を押す（人）。** これだけで同期スキルが差し替わる
4. 次のセッションで `~/.claude/skills/synced/*/ldi-cms-report/` を `diff` して届いたか確かめる（AI）

`report-qa` は 2026-10-06 時点で同期済み（`qa_report.py` がリポジトリと一致）。

### スクリプトの呼び方（2026-10-06 修正）

同期スキルはリポジトリの外に置かれる。`skills/ldi-cms-report/scripts/...` とは書かない。
**スキルを読み込んだときに表示される Base directory（`$SKILL_DIR`）からの相対パス**で呼ぶ。
`report-qa` は同じ親フォルダの隣なので `$SKILL_DIR/../report-qa/` で届く（実測）。

## どこで動くか

| もの | 走る場所 | 要るもの |
|---|---|---|
| `qa_report.py` | **Cowork セッション** | python-docx |
| `ldi_state.py` | **Cowork セッション** | なし（標準ライブラリのみ） |
| `fetch_adrc.js` | **ブラウザの中**（`javascript_tool`） | 組み込みブラウザ / Chrome MCP |

`docx` スキルが同じやり方で `python scripts/...` を日常的に動かしているので、
python と python-docx はある前提でよい。無ければスクリプトが
`STATUS: FAIL no-python-docx` と `pip install python-docx` を出して止まる。

**台帳（`ldi_seen.json`）はスキルのフォルダに置かない。残らない。**
同期スキルのフォルダは毎回アカウントから配られるもので、書き込んだものは次の朝に無い。
docx を毎日置いている `C:\Users\arakida\OneDrive - adrc.asia\LatestDisasterInfo\`
（`request_cowork_directory` でマウント）に置く。`--dir` で渡す。
見つからないときはスクリプトが**「この場所は残らない」と警告する。**

### 2. `report-qa`

```
report-qa/
  scripts/qa_report.py            ← 差し替え（件数整合の誤りを修正、検査を追加）
```

**実物（2026-10-06）は現行のQAでも合格する。** 急ぎではない。ただし脆い。

現行は期待件数を `全\s*(\d+)\s*件` で取っており、実物では
「更新必要 **全2件**」の中の 2 に当たって**偶然通っていた。**
サブヘッダを仕様どおり「全13件検証」に書き換えた日に、黙って FAIL に変わる。

修正の内容

- 件数整合を「文書内に出てくる更新必要件数の表記**すべて**が実エントリ数と一致」に変更。
  「以上 N件」「更新必要 全N件」の両方の文面を読む。
  **1つだけ合っていれば通る作りをやめた**（フッタだけ書き換えた文書が通っていた）
- 言語の取り違え（英語欄に日本語／日本語欄に日本語なし）を FAIL に追加
- 内容欄のメタ情報（GLIDE・GDACS・Sentinel Asia）を FAIL に追加

実測

```
実物            件数整合 OK（更新必要2=実2 / 全13件検証）  FAIL 0 / WARN 4
フッタだけ改竄   件数整合 FAIL（表記 [1, 5] が実1件と合わない）
英語欄に日本語   FAIL / 内容欄にGLIDE FAIL / URLでない FAIL / TBD残存 FAIL
```

あわせて、**毎日出続けていた WARN 2種を止めた。**

| 止めたWARN | 原因 |
|---|---|
| 内容欄の文字数（196字・282字） | 目安が 50-80字 と表示されていたが**根拠が無く**、コード側の閾値（120字）とも食い違っていた。実測に合わせ **JA 60-400字 / EN 25-180語** にした |
| 作成日が今日でない | 文書は JST、`date.today()` を呼んだコンテナは UTC。**ずれていたのは日付ではなく時間帯。** JST基準に直し、UTCの今日も許容する |

修正後、実物は **合格（FAIL 0 / WARN 0）**。短すぎ（16字）・長すぎ（462字）は WARN になる（実測）。

`report-qa` の `--type generic` は変更していない。

## 上げたあとに直せるもの

Routineのプロンプトは**古い SKILL.md の写し**が貼られている（Step 8・9・10 を含まない）。
スキルが本物を持っているので動いてはいるが、食い違ったままにしておく理由は無い。
入口だけに縮めるとよい。

**2026-10-06：AI からは差し替えられなかった。** このタスクは Windows デスクトップに紐づいており、
プロンプトの変更は**そのPCに紐づいた会話での承認か、PCの Claude デスクトップでの手編集**が要る
（`update_trigger` は `needs_device_approval` を返して何も変えない）。**削除して作り直さないこと**
（実行履歴と、紐づいたPCを失う）。

```
ADRC最新災害情報（LDI）の日次CMS入力支援レポートを作ってください。
手順は ldi-cms-report スキルの SKILL.md に従います。Step 1 から Step 11 まで通してください。
Step 8（機械QA）で FAIL が1件でもあればメールを送らず、荒木田宛に失敗通知を出してください。
```
