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
  scripts/build_ldi_docx.py       ← 新規
  scripts/ldi_state.py            ← 新規
  scripts/fetch_adrc.js           ← 新規（ブラウザの中で動かす。DOM依存部分は未検証）
```

## どこで動くか

| もの | 走る場所 | 要るもの |
|---|---|---|
| `build_ldi_docx.py` | **Cowork セッション**（`python` で実行） | python-docx |
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

**こちらのほうが急ぎである。** Step 8 は FAIL ならメールを送らない BLOCKING ゲートだが、
`check_ldi` の件数整合に2つの誤りがあり、**仕様どおりのdocxを必ず FAIL にしていた。**

1. 「全N件検証」を期待エントリ数として比べていた（確認総数 ≠ 更新必要件数）
2. エントリ数を段落だけで数えていた。節見出しは1セルの表の中にあるので0件になる

修正後、仕様どおりのdocxは PASS し、次の4つは FAIL する（実測）。

```
英語欄に日本語 / 内容欄にGLIDE / URLでない / プレースホルダ残存
```

## 上げたあとに直せるもの

Routineのプロンプトは**古い SKILL.md の写し**が貼られている（Step 8・9・10 を含まない）。
スキルが本物を持っているので動いてはいるが、食い違ったままにしておく理由は無い。
入口だけに縮めるとよい。

```
ADRC最新災害情報（LDI）の日次CMS入力支援レポートを作ってください。
手順は ldi-cms-report スキルの SKILL.md に従います。Step 1 から Step 11 まで通してください。
Step 8（機械QA）で FAIL が1件でもあればメールを送らず、荒木田宛に失敗通知を出してください。
```
