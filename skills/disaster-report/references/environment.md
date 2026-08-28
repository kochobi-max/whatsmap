# 実行環境の前提 — 手順を出す前に必ず読む

2026-08-19、熊本レポートの復旧作業で半日を溶かした。原因はすべて
**分かっていたのに確認しなかったこと**である。同じことを繰り返さないために残す。

---

## 環境（確定事実）

| 項目 | 実際 |
|---|---|
| OS | Windows。コンソールは `cmd`、既定コードページは **cp932** |
| ジェネレータ | `C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters\_kumamoto_generator\` |
| 構成 | `scripts\gen_deck.js` / `data\report_data.json` / `images\` / 出力は**1つ上**の `LargeScaleDisasters\` 直下 |
| node_modules | `C:\Users\arakida\` に置く（OneDrive配下に作ると数千ファイルが同期対象になる） |
| bash | Git Bash あり。`build.sh` は bash で動く |
| Python | あり。`pdfplumber` あり。**`pdftotext`（poppler）は無い** |
| LibreOffice | **無い。** 2026-08-28 に実機で確認済み。PDF変換はクラウド側でやる |

## 渡すものの作り方

- **改行コードは向きが2つある。両方おさえること。**（→ 詳細は末尾の節）

  | 対象 | 正しい改行 | 間違えるとどうなるか |
  |---|---|---|
  | `.bat` | **CRLF**（＋ASCIIかcp932） | LF / UTF-8 だと**何も表示せずに終わる** |
  | `.js` `.py` などソース | **LF** | Windows の git が CRLF で取り出し、`\n` を置いた照合が0件になる |

  2026-08-19 に上を、2026-08-27 に下を踏んだ。**上だけ書いてあったので下を防げなかった。**
- **パスに空白が入る。** 必ず二重引用符で囲む
- **`bash build.sh` の直後に別のコマンドを貼らない。** bash の標準入力に吸われて実行されない。
  複数を1回で回すなら `&&` / `&` で**1行**にする
- **Python が UTF-8 で書いたファイルを `findstr` で探さない。** `findstr` は cp932 で
  照合するので日本語に一致しない。バッチから拾う行は ASCII で出す
  （`qa_layout_check.py` の `SUMMARY: N findings / M pages`）
- **この環境には、名前だけでは区別できないフォルダが複数ある。**
  出力先を変えても構造は残るので、**やり取りでは常にフルパスを書く**。

  | 通称 | 実際に指しうる場所 |
  |---|---|
  | デスクトップ | `C:\Users\arakida\Desktop` / `OneDrive - adrc.asia\デスクトップ` |
  | 出力先 | `_kumamoto_generator\output\` / 実際の出力先である `LargeScaleDisasters\` |
  | images | `_kumamoto_generator\images\` / `images\<GLIDE>\` |

  実際、`C:\Users\arakida\Desktop` に書いたレポートを「デスクトップに出ます」と
  伝えて探してもらい、往復を1回無駄にした。**ファイルは正しく書けていた。
  名前の指し方だけの問題だった。** 成果物はPDFと同じ場所に置いて曖昧さを減らすが、
  それは対症療法であって、通称で呼ばないことが本体である。

- 相対パスの指示を出さない。`gen_deck.js` は自分の位置から `..\data` `..\images` を見るので、
  置き場所が1階層違うだけで全部外れる

## 手順を出す前にやること

1. **`dir /b` を1回取る。** 想定でコマンドを出して、外れるたびに次を出すのは最悪の進め方
2. **失敗が見える形にしてから進める。** `build.sh` は `soffice` の失敗を `>/dev/null 2>&1` に
   捨てて「built:」と表示する。PDF化が失敗しても気づけない
3. **1コマンドで完結する形を先に渡す。** 貼り付け→スクショ→報告の往復は自動化ではない

---

## 「ビルドが通った」は検証にならない

この一連で出た不具合は、**いずれも例外を出さなかった**。

| 症状 | 見え方 |
|---|---|
| 言語別キー（`value_en`）を読めず被害状況19行・リンク84行が空 | ページ数は出る。空欄なのでエラーにならない |
| 画像27枚が無く、ロゴが全150ページから消えた | 「解決/未解決」を出すまで気づけなかった |
| 高さ1.09インチに潰れた画像の上にキャプションが重なる | ページ数も出るし例外も出ない |
| PDFをビューアで開いたまま → soffice が上書きできず**古いPDFが残る** | 「built:」と出る。QAは古い中身を測り続ける |

対策として入れたもの。

- `apply_image_report.js` … 画像がどのファイルに解決したかをビルド時に一覧表示
- `qa_layout_check.py` … 溢れ・画像との重なり・文字どうしの重なりを PDF から検出
- `build_and_check.bat` … PDFを**先に消してから**ビルドし、消せなければその場で止める

## 検査を入れるときは、誤検出を先に潰す

`qa_layout_check.py` を最初に流したとき **884件** 出た。約740件はフッターの飾り
（`ADRC` / 日付 / `N / 149`）、12件は地図上の番号マーカーで、どちらも意図的なもの。
本物が埋もれて使いものにならなかった。

除外を入れて **117件 / 11ページ** になった。除外しても、コロンビアEN版 p.6 の実在の溢れは
拾ったままであることを確認してから使った。**誤検出を消しても本物が消えないこと**を確かめる。

---

## クラウド側のネットワークポリシー（外部サイトの取得が弾かれたとき）

Claude がクラウド上で外部サイトを取れないとき（`EGRESS_BLOCKED`）、原因は
**cloud environment のネットワークアクセス設定**である。既定の `Trusted` は
パッケージレジストリ・GitHub など既定の許可リストだけを通し、それ以外は全部止まる。

**設定場所を間違えやすい。** 「設定 → Claude Code」のページには**無い**。
公式ドキュメントに「There's no settings page or direct URL for the selector」と明記されている。

正しい経路:

1. `claude.ai/code` を開く
2. **メッセージ入力欄のすぐ上の行**にある**雲アイコン**（現在の環境名 = 通常 `Default`）をクリック
3. 環境名の行にマウスを乗せる → 右に出る**歯車アイコン**をクリック
4. **Network access** を `Custom` にする
5. **Allowed domains** に1行1ドメイン（`*.` 前置でサブドメイン全部）
6. **`Also include default list of common package managers` にチェックを入れる**
   ← 外すと npm / GitHub まで止まる

| Level | 外向き通信 |
|---|---|
| None | なし |
| Trusted | 既定の許可リストのみ（初期値） |
| Full | 全ドメイン |
| Custom | 自分の許可リスト（既定リストの併用は任意） |

反映について、ドキュメントには「セッション開始時」とあるが、**2026-08-28 に
稼働中のセッションへ即座に効いた**。設定直後に `check_sources.js` を回せば分かる。
効いていなければ新しいセッションで取り直す。

出典: https://code.claude.com/docs/en/cloud-environments

### 弾かれたときにやってはいけないこと

`/root/.ccr/README.md` にある通り、**TLS検証を切らない・`HTTPS_PROXY` を消さない・
組織ポリシーの拒否（403/407）を再試行しない**。回避せずに報告する。
迂回するより、上の設定を1回入れるか、人が手元で画像を保存する方が速い。

## 定期タスク（cron）は main を clone して始まる

**定期タスクは毎回まっさらなセッションで、環境の既定ソース（`refs/heads/main`）を
clone して始まる。** 前回の作業ブランチは引き継がれない。

スキル一式が main に入っていない間は、**プロンプトの1行目でブランチを取りに行かないと
参照先のファイルが1つも存在しない。** `skills/` ごと無い状態から
「`skills/disaster-report/SKILL.md` を読め」と言われるので、
途中まで動いて手詰まりになる。エラーらしいエラーも出ないため気づきにくい。

2026年8月20〜24日のコロンビア日次タスクはこれで全滅していた。
10回近く発火して、ブランチに1件もコミットが増えていないのが証拠。

### 定期タスクのプロンプトに必ず入れる

```bash
git fetch origin <branch> && git checkout <branch>
test -f skills/disaster-report/SKILL.md || { echo "スキルが見つからない。中断する。"; exit 1; }
```

**存在確認まで書く。** checkout だけ書いても、失敗したときに気づかず先へ進む。

### 根本的にはどちらか

- スキルを main に入れる（マージすれば checkout の1行は要らなくなる）
- 入れないなら、**定期タスクを作った時点で必ずこの3行を先頭に置く**

新しい災害の cron を作るときも同じ。SKILL.md §0「新規イベントの追加」の
cron 2本を作る手順は、この前置きとセットで初めて動く。

### MCP から作った定期タスクにはコネクタが付かない

`create_trigger`（MCP）で作ったタスクは、**Superhuman などのコネクタを持たない
セッションを起こす。** 戻り値にこの警告が出るが、それが唯一の手がかりで、
タスク自体は正常に作られたように見える。

> this trigger stores no MCP connectors, so the sessions it fires will run
> without connector (mcp__<server>__*) tools

つまり **MCP から作った送信タスクはメールを送れない。**

| タスクの中身 | 作る場所 |
|---|---|
| コード・データ更新・ビルドだけ | MCP から作ってよい |
| **メール送信・カレンダー等コネクタを使う** | **claude.ai の Routines 画面** |

貼り付け用の本文は `references/daily-mail-routine.md` にある。

2026年8月24日、コロンビアの送信タスクをこれで一度作り直した。

## Windows の git は改行を CRLF にして取り出す

Git for Windows の既定は `core.autocrlf=true`。**リポジトリに LF で入っていても、
チェックアウトすると CRLF になる。**

パッチの照合は行末に `\n` を置いている。たとえば

```js
{ name: "const d", re: /^[ \t]*const\s+d\s*=\s*JSON\.parse\([^\n]*\)\s*;?[ \t]*\n/m }
```

`[ \t]*` は `\r` を吸えないので、CRLF だと**0件になって当たらない**。
クラウド（LF）では通り、Windowsだけ落ちる。しかも「ファイルが改修されている」
という趣旨のメッセージが出るので、原因を取り違えやすい。

2026年8月27日、コロンビアの初回セットアップでここに当たった。
`const DATA` と `const OUT` は `[^\n]*\n` で `\r` を吸えたため通り、
`const d` だけが落ちた。**3文のうち1文だけ落ちる**のが特徴。

### 対処（両方入れてある）

- `build_event.js` は一時コピーを **LF に正規化してから**パッチを当てる
- `apply_all.js` も、対象が CRLF なら正規化してから当てる（その旨を表示する）
- リポジトリ直下の `.gitattributes` で `* text=auto eol=lf`、`*.bat text eol=crlf`

**`.bat` は CRLF のまま**でなければならない。LF にすると cmd が何も表示せずに終わる。

## PDF変換は荒木田さんのPCではやらない（2026-08-28）

**このPCに LibreOffice は入っていない。** ここは4回、判断を間違えた場所。

1. `environment.md` に「LibreOffice あり」と書いてあった。**誰も実機で確かめていなかった**
2. パスを決め打ちしていて落ちた → 探索を賢くした（下の節）
3. 探索を賢くしても落ちた。探した場所の一覧が**空**で、初めて「無い」と分かった
4. そこで「インストールしてください」と渡そうとした。**これが4回目の間違い**

決めたこと。**PDF変換はクラウドでやる。PCには何も入れてもらわない。**

- クラウド: `build_event.js` → `publish_dist.js` で、4ファイルと `manifest.txt` を
  配布専用の孤立ブランチ `dist` へ force push する（毎回1コミット。履歴が肥らない）
- PC: `daily_publish.bat` が `raw.githubusercontent.com` から curl で取り、
  LargeScaleDisasters へコピーするだけ。**要るのは git・node・curl の3つ**（いずれも導入済み）

`manifest.txt` は **ASCII のみ**。cmd は cp932 で読むので日本語を入れると `for /f` が狂う。
`publish_dist.js` が非ASCIIを見つけたら配布を止める。

PC側は台帳の `BUILT_DATE_JST` が当日でなければコピーしない（`STATUS: SKIP stale-dist`）。
クラウドの朝のビルドが落ちた日に前日のファイルを置き直して、
「本日更新しました」と書いたメールを出さないため。

以下の探索の節は残す。**熊本の作業を手元でやるときには依然として要る**ため。

## LibreOffice の在り処は決め打ちにしない

`soffice.exe` の導入先は環境によって違う。2026-08-27、
`C:\Program Files\LibreOffice\program\soffice.exe` だけを見ていて
**PPTX はできているのに PDF 変換だけが落ちた**（`STATUS: FAIL soffice-missing`）。

`generator/scripts/soffice.js` が、この順で探す。

1. 環境変数 `SOFFICE`（指定が外れていればその旨を出してから次へ）
2. `PATH`（`where` / `which`。`soffice.exe` `soffice` `soffice.com` `libreoffice`）
3. よくある導入先 — `Program Files` / `Program Files (x86)` / `%LOCALAPPDATA%\Programs`。
   **`LibreOffice 7.6` のような版番号付きフォルダも拾う**
4. レジストリ `HKLM\...\App Paths\soffice.exe`

`check_setup.bat` も**同じ `soffice.js` を呼ぶ**。検査とビルドで判定が食い違わないようにする。
片方だけ直すと「検査は OK なのにビルドが落ちる」が起きる。

見つからなかったときは、探した場所を全部並べてから終わる。

## 情報源に届かないことを「変化なし」と取り違えない

2026年8月20日、SGCの図を取るためにネットワークポリシーを `Custom` にし、
`sgc.gov.co` を許可リストに入れた。**このとき既定の許可リストごと置き換わり、
他の一次情報源が全て遮断された。**

| 情報源 | 8/28時点 |
|---|---|
| `www.sgc.gov.co` | 到達する |
| `portal.gestiondelriesgo.gov.co`（UNGRD） | **遮断** |
| `earthquake.usgs.gov` / `www.gdacs.org` / `reliefweb.int` | **遮断** |
| `sentinel-asia.org` / `disasterscharter.org` / `glidenumber.net` | **遮断** |
| `www.ideam.gov.co` | **遮断** |

死者・住家被害の出どころである UNGRD に一度も届かないまま、日次タスクは
**「変化なし」を8日間報告し続けた**。レポートは 8/16 の値（死者287）で止まり、
実際には 8/23 時点で 329 に動いていた。タスクの実行結果は `SUCCEEDED` で、
実行時間が58秒と不自然に短いことだけが手がかりだった。

### 対処

- `generator/scripts/check_sources.js` を**データ更新の前に必ず通す**。
  1件でも届かなければ終了コード7で止まり、「変化なし」と言わせない
- 判定は `curl` で行う。**Node の `fetch` はこの環境のプロキシを見ず、
  遮断されていないドメインまで一律403を返す**ので、全件「到達」と誤判定する
- 許可リストは情報源プロファイル（`references/sources/*.md`）のURLと揃える。
  災害を追加したら、その国のドメインも許可リストに足す

### WebSearch は別経路

`WebSearch` は egress プロキシを通らないので、遮断中でも結果が返る。
**これがあるために「調べられているように見えて一次情報に当たれていない」が成立する。**
数値は必ず一次情報で確かめること。

## WebFetch は egress の許可リストを見ていない

**2026-08-28、許可リストに追加しても `WebFetch` は届かないことが分かった。**

| 経路 | `www.sgc.gov.co`（8/20から許可済み） |
|---|---|
| `curl`（Bash） | **HTTP 200** |
| `WebFetch` | **EGRESS_BLOCKED** |

許可リストに何件足しても `WebFetch` では届かない。**一次情報の取得は
`curl`（Bash）で行う。** そのための入口が `generator/scripts/fetch_url.js`。

```bash
node generator/scripts/fetch_url.js "<URL>"            # 本文だけ出す
node generator/scripts/fetch_url.js "<URL>" --raw      # HTMLそのまま
node generator/scripts/fetch_url.js "<URL>" --render   # JS描画のページ
```

これを知らずに `WebFetch` で調べると、**許可リストが正しくても「取得できず」に
なる**。`check_sources.js` は `curl` で測るので OK と出る。**検査は通るのに
実際には読めない**という食い違いが起きるので、取得経路を揃えること。

### JavaScript で描画されるページ

`portal.gestiondelriesgo.gov.co`（UNGRD, SharePoint）と `www.sgc.gov.co` は
本文が静的HTMLに無い。`--render`（ヘッドレスChromium）でも UNGRD の記事本文は
取れなかった（2026-08-28 時点）。**この2つは別の取得手段を確立する必要がある。**
