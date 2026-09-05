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

### 「届かない」を1色で塗らない（2026-09-01）

**遮断とサイト側の不調は、打つ手が違う。**

| curl の言い分 | 意味 | 打つ手 |
|---|---|---|
| `CONNECT tunnel failed, response 403` | ポリシー拒否。トンネルが開かない | 許可リストへの追加を頼む |
| `Connection reset by peer` | トンネルは開いた。上流が切った | **頼んでも直らない** |
| `Operation timed out`（接続は即座） | 同上。サイトが応答していない | 同上 |
| `Could not resolve host` | 綴りかDNS | 綴りを確かめる |

2026-09-01、`dhm.gov.np` がこれで紛れた。8月28日には 200 が返っていたのに
`check_sources.js` が「接続できない（遮断）」と一律に出したため、
**許可済みのドメインをもう一度足させるところだった。**
curl の stderr を読めば区別できる。`check_sources.js` は分けて表示するようにした。

**許可リストの追加を頼む前に、トンネルが開いているかを見る。**
開いているなら、それは相手のサイトの話であってこちらの権限の話ではない。

あわせて、**403 を見たその場で「使えない」と結論しない。**
同じ日、`www.youtube.com` は許可リスト追加の直後は 403 だったが、
しばらく置くと 200 になった。反映に時間差がある。

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

貼り付け用の本文は `references/daily-mail-routine-prompt.txt`、
画面の操作手順は `references/daily-mail-routine.md` にある。

2026年8月24日、コロンビアの送信タスクをこれで一度作り直した。

**`connectors` を指定して MCP から作る道は、この組織では塞がっている。**
2026年8月28日に試すと、

> create_trigger: the connectors parameter is not available for this organization.

で拒否された。回避策は無いので、画面で作る以外にない。
自分の側で片づけてあげられない数少ない作業のひとつなので、
手順は画面のラベルどおりに書いておくこと。

画面の要点は「Superhuman を**選ぶ**」ではない。
**つないであるコネクタは既定で全部入っている**ので、
`Superhuman Mail` を**消してしまわない**ことを確かめるのが正しい。

### 定期タスクを差し替えるときは、実行時間帯を外す（2026-08-31）

古いタスクと新しいタスクを入れ替える日、**古いほうの実行が走っている最中に
削除してしまった**。07:34 JST に起動した実行を、08:05〜08:15 ごろに消している。

結果:

- 配布ブランチ `dist` が前日ビルドのまま残った
- PCが 08:10 に3件とも `STATUS: SKIP stale-dist` で見送った
- 08:30 の送信タスクが3件とも送らなかった（ゲートとしては正しい動作）
- OneDrive は前日のまま。人が手で `ADRC_setup_and_publish.bat` を叩いて復旧した

**`list_triggers` の `last_run` が `SUCCEEDED` でも、やり切ったとは限らない。**
定期実行のセッションは `list_sessions` に出ないので、あとから中身を確認できない。
確認できるのは結果だけ（`dist` の `BUILT_DATE_JST`、`_published/` の記録）。

差し替えるときは、**その日の実行が終わったことを結果で確かめてから消す。**
朝のタスクなら、`dist` の `manifest.txt` が当日日付になっているかを見る。

```bash
git fetch origin dist
git show FETCH_HEAD:<GLIDE>/manifest.txt | grep BUILT
```

### 人にPCで動かしてもらうときは、必ず `ADRC_setup_and_publish.bat` の名前で言う

2026-08-31、復旧をお願いするときに「`daily_publish.bat` を手動実行してください」と
書いてしまい、**探させることになった。** このファイルはクローンの中にあり
（`C:\Users\arakida\whatsmap\skills\disaster-report\generator\scripts\`）、
定期タスクが呼ぶための入口である。荒木田さんが手で叩くのは、クローンの外に置いた
**`ADRC_setup_and_publish.bat`** のほう。こちらは pull してから同じ
`publish_local.js` に渡すので、リポジトリが古いまま動くことがない。

| 誰が動かすか | 叩くファイル |
|---|---|
| タスクスケジューラ（08:10） | `daily_publish.bat`（クローン内） |
| **人が手で** | **`ADRC_setup_and_publish.bat`（`C:\Users\arakida\`）** |

CLAUDE.md の「通称でフォルダを呼ばない。フルパスを書く」と同じ話である。
**依頼文にはフルパスを書く。** ファイル名だけ書くと、同じ名前が2か所にある環境では
必ず迷わせる。

### PCが動かない日は、全件が同じ形で止まる（2026-09-05）

荒木田さんのPCがオフラインで、コロンビア・インドネシア・ネパールの3件すべてが
止まった。クラウド側は正常で、配布ブランチも当日ビルドになっていた。
**止まったのは OneDrive へのコピーだけ**である。

送信タスクの報告は `NO-SEND old-record 2026-09-04` としか言わず、
**なぜ古いのかを言えていなかった。** 見分け方は記録の組み合わせにある。

| 今日の公開記録 | 今日の見送り記録 | 意味 | 打つ手 |
|---|---|---|---|
| ある | — | 正常 | 送る |
| 無い | **ある** | PCは動いた。配布物が当日ビルドでなく飛ばした | クラウドで `build_all.js` を回し直す |
| 無い | **無い** | **PCがそもそも動いていない** | PCを起動して `ADRC_setup_and_publish.bat` |

`verify_published.js` はこれを `(pc-skipped)` / `(pc-not-run)` として出し分ける。
**3件が同時に同じ理由で止まっていたら、まずPCを疑う。** イベント側ではない。

### 連鎖して止まったとき、どこで気づけるか

クラウドのビルドが落ちると、PC → メールの順に静かに止まる。
**止まったこと自体を知らせる仕組みは無い。** 手がかりは3つ。

| 見るもの | 止まっている印 |
|---|---|
| `dist` の `manifest.txt` の `BUILT_DATE_JST` | 当日でない |
| `_published/<GLIDE>.skipped.json` の `skipped_at_jst` | 当日（PCは動いたが見送った） |
| 08:30 の送信タスクの報告 | 全件「見送り」 |

`.skipped.json` は「PCが動かなかった」と「PCが動いて見送った」を分けるために
2026-08-30 に足したもの。今回それが効いて、原因の切り分けが1回で済んだ。

## ビルド用コンテナの LibreOffice が毎回そろっているとは限らない（2026-09-03）

定期タスクのコンテナに **`libreoffice-core` だけが入っていて `libreoffice-impress`
が欠けていた日**があった。`/usr/bin/soffice` は在るので `soffice.js` の探索は通る。
しかし **pptx の取り込みフィルタが無いため、PDF が1枚も出ない。**

`build_event.js` は `STATUS: FAIL no-pdf` で止まるので、黙って空を出しはしない。
**ただし止まるだけでは、その朝のレポートが出ない。** 定期タスクが自分で
`apt-get install` して復旧させたが、**コンテナは毎回作り直されるので残らない。**

そこで `ensure_soffice.js` を PDF 変換の手前に入れた。

```bash
node generator/scripts/ensure_soffice.js          # 確かめ、欠けていれば入れ直す
node generator/scripts/ensure_soffice.js --check  # 確かめるだけ
```

- 判定は**バイナリの有無ではなく、Impress のモジュールが在るか**で行う
  （`/usr/lib/libreoffice/program/libwpftimpresslo.so` ほか）
- 欠けていて root なら `apt-get install -y libreoffice-impress` を自動で行う
- 入れたあと、**試験用の pptx を1枚実際に変換して確かめる。**
  「入った」で終わらせない
- 入れられなかったときは `STATUS: FAIL impress-install` を返し、
  apt のミラーに届いていない可能性を添える。**黙って先へ進まない**

Linux のときだけ働く。荒木田さんのPCには LibreOffice を入れない方針で、
PC側は PDF を作らず配布ブランチから受け取るため、この確認は要らない。

**イメージ側で恒常的に直すのが本筋である。** ここでの自動復旧は、
それまでの間、毎朝のレポートを止めないためのもの。

## 「成功した」と書いてあるのに、何も起きていないことがある

2026-08-28、PC側のバッチが `STATUS: PUBLISHED` を出し、4ファイルも
OneDrive に入ったのに、**公開記録は GitHub に1バイトも届いていなかった。**

順を追うとこうなる。

1. このPCに `user.name` / `user.email` が設定されていない
2. `git commit` が失敗する。ただし出力は `>nul 2>&1` に捨てられていた
3. 続く `git push` は送るものが無いので「Everything up-to-date」を出し、**0 を返す**
4. バッチは終了コード 0 を見て成功と判断し、警告を出さずに終わった

**終了コードは「やろうとしたことが起きた」ことを意味しない。**
外へ出す処理では、外側に問い合わせて確かめる。

さらに、**「向こうにファイルがある」でも足りない。**
前日の記録が残っていれば、今日のコミットが黙って失敗していても通ってしまう。
いまは push のあとに `git fetch` し、手元の記録と GitHub 側の記録の
**内容ハッシュを突き合わせている**（`git hash-object` と `git rev-parse <ref>:<path>`）。

同じ日に、同じ性質の穴が2つ見つかった。どちらもまだ発現していなかった。

- **バッチが実行中に自分自身を書き換えられる。**
  `daily_publish.bat` の先頭にある `git pull` は `daily_publish.bat` を更新しうる。
  cmd はバッチをディスクから読みながら実行するので、途中で中身が入れ替わると
  別の内容の途中から動き出す。**先に `%TEMP%` へ自分をコピーして、そちらを実行する。**
- **定期タスクが `pause` で永久に止まる。**
  「ダブルクリックされたか」を `%cmdcmdline%` に自分のファイル名が入っているかで
  判定していた。**タスクスケジューラも `cmd /c "...bat"` の形で起動するので区別できない。**
  引数 `--quiet` を渡す方式に変えた。`schtasks` の登録行にこれが要る。

  **その直し方で、続けて2回止めた。**
  `ADRC_setup_and_publish.bat` は全体を `> "%LOG%" 2>&1` で包んでから
  `daily_publish.bat` を呼ぶ。既定を「待つ」にしたため中でも `pause` が動き、
  **その入力待ちのプロンプトがログファイルへ流れて画面に出ず、窓が無言のまま
  止まった。** 仕事は毎回最後まで終わっていて、窓だけが止まっていた。

  1回目は呼び出し側に `--quiet` を足して直したつもりだった。**直らなかった。**
  理由は次の節。2回目でようやく設計のほうを変えた。

  **結論。人が見ているかを当てにいかない。**
  タスクスケジューラも、ダブルクリックも、別のバッチからの `call` も、
  バッチからは同じに見える。**既定を「待たない」にして、
  待ってほしい側が `--pause` と言う。** `--quiet` は受け取って捨てる
  （その形で登録済みのタスクを壊さないため）。
  リダイレクトの内側で入力を待たせない。

## 「〜は無い」と断定しない（2026-08-28）

ネパールのGLOFで、**WFPの状況報告に `suspected Glacial Lake Outburst Flood (GLOF)` と
書いてあるのを読んだうえで見落とし**、「GLOFと呼んでいる公式機関は無い」と断定して報告した。
しかも「そちらの前提が間違っていた」という書き方をした。実際は依頼者の情報が正しかった。

- **存在しないことは証明できない。** 言えるのは「到達できた情報源の中に見当たらない」まで
- **機関ごとに呼び方が違うときは、どれかを選んで他を否定しない。** 並べて示す。
  GLIDE が `FF-`（Flash Flood）でも、それは登録上の分類であって機構の否定ではない
- **人から与えられた前提を否定する前に、それを裏づける記述が手元の資料に無いかを先に探す**
- 相手の指示を「誤り」として整理し直さない。**こちらの読み落としのほうが、ずっと確率が高い**

## 動かせない言語で書いたものを渡さない（2026-08-28）

同じ日に3回、同じ作業をさせてしまった。3回とも原因は cmd 固有の落とし穴だった。

1. 呼び出し元のリダイレクトの内側で `pause` が動き、プロンプトがログへ流れて窓が無言で固まる
2. 「人が見ているか」を cmd から判定できない。タスクスケジューラも、ダブルクリックも、
   別バッチからの `call` も同じに見える
3. `git commit` が黙って失敗しても、続く `push` が 0 を返すので成功に見える

**根っこは、私がこの環境で cmd を実行できないこと。** 書いたものを一度も動かさずに渡していた。
「構文は正しい」「読んで確かめた」は、動かしたことにならない。

**PC側のロジックは Node に置く。** `.bat` は node を呼ぶ2行だけにする。

| ファイル | 行数 |
|---|---|
| `publish_local.js` | ここに全部 |
| `daily_publish.bat` | 16行（`node "%~dp0publish_local.js" %*` だけ） |
| `check_setup.bat` | 12行（`--check` を渡すだけ） |
| `ADRC_setup_and_publish.bat` | 64行。クローンと起動だけ |

Node なら手元で通しで試せる。実際、書いた直後の試験で3件見つかった。

- 出力先が無いとき・イベントJSONが無いときに素の例外が出ていた
- **試験で書いた記録がそのまま GitHub へ行った。**
  出力先がテスト用フォルダの記録を、クラウド側は本物として読む。
  `--dest` を指定したときは既定でプッシュしないようにした（`--allow-push` で押し通せる）

そして 2 の答えは Node にある。**`process.stdout.isTTY`。**
ダブルクリックなら端末、タスクスケジューラとリダイレクト下では端末でない。
cmd には無い情報。迷ったら閉じる。二度と入力待ちで固まらせない。

## リポジトリの外に置いたファイルは、直しても相手に届かない

`ADRC_setup_and_publish.bat` は `C:\Users\arakida\` に置いてもらう起動用の
1ファイルで、**クローンの外にある。** つまり `git pull` では更新されない。

2026-08-28、この中の1行を直してプッシュしたが、**相手のPCにあるのは
私が前に送った古いコピーのまま**で、同じ止まり方をもう一度させた。

- **クローンの外に置くファイルには、変わりうるものを書かない。**
  やることはクローンと起動だけに留める
- 直しは**必ずクローンの中のファイル側**に入れる。そちらは毎回 `git pull` で届く
- 外のファイルを直したときは、**送り直さないと反映されない。**
  「プッシュした＝相手に届いた」ではない

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

## クラウド側のセッションにも soffice の実体部分・pptxgenjs が無いことがある（2026-08-31/09-01）

「PDF変換はクラウドでやる」と決めた側で、その日のセッションに `soffice --version` は通るのに
`--convert-to pdf` が **どんなファイルに対しても** `Error: source file could not be loaded` を
返す事故が起きた（`echo hello > test.txt` の変換ですら失敗した。pptxの中身の問題ではない）。

原因は `dpkg -l | grep libreoffice` で分かった。入っていたのは
`libreoffice-core` / `libreoffice-common` など基盤部分だけで、
**`libreoffice-impress` `libreoffice-writer` `libreoffice-draw` が無かった**。
soffice本体は起動するが、文書を読み書きするフィルタが無いので何も開けない。

同じセッションで `node generator/scripts/gen_deck.js` も
`pptxgenjs が見つからない` で落ちた。`generator/node_modules` はリポジトリに
コミットされておらず、セッションは毎回 `main`（またはこのブランチ）を
clone して始まるため、**前回どこかのセッションが `npm install` していても引き継がれない。**

対処（このセッションで実施。次回また消えている前提で書く）：

```bash
apt-get update && apt-get install -y libreoffice-impress libreoffice-writer
cd skills/disaster-report/generator && npm install pptxgenjs
```

いずれも `_build/` や `node_modules/` と同様にコミットしない前提の使い捨て環境なので、
`build_all.js` が `no-pptxgenjs` や PDFが0件のまま `STATUS: OK` 相当の表示を出したら、
まずこの2つを疑う。`check_setup.bat`（PC側）と違い、クラウド側にはこれを検査する
スクリプトが無い。次に直すなら `build_all.js` の先頭に軽い自己診断
（`soffice --convert-to pdf` を空ファイルに試す／`require.resolve('pptxgenjs')`）を
足して、`SOURCES-FAIL` と同じ扱いで早期に止める方が今回のような手戻りを防げる。

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

---

## 他のセッションが作ったものを、見に行っていなかった

セッションは `main` を clone して始まる。他のセッションの成果は別のブランチに乗っていて、
**手元には存在しない。** そのため「無い」と判断して一から作り直してしまう。

2026-08-28 に2件続けて起きた。

| 何を | 実際は |
|---|---|
| インドネシアのレポートを一から作った | 別セッションが `ADRC_EQ_IDN_Flores_20260815_BI.pptx` を既に作っていた。荒木田さんから渡されて初めて知った |
| 「英語版に日本語が出る」を「図は英語だけにする」で塞いだ | `main` の `reports/colombia_eq_20260810/` が `_ja` / `_es` の言語別画像で既に解いていた |

荒木田さんの言葉:

> Claudeの他のセッションで作ったものです。他のセッションの経験を使えないと困ります。

**作り始める前に必ず走らせる:**

```bash
node skills/disaster-report/generator/scripts/find_prior_work.js <GLIDE>
```

リモートの全ブランチ・全コミット件名・配布ブランチ `dist`・`events/`・
`references/sources/` を横断する。何か出たら**中身を読んでから**始める。

**「該当なし」は「無い」ではない。** プッシュされていない成果物と、
荒木田さんのPCにあるものはここに出ない。表紙・図・訳語で迷ったら、
一から作る前に「既存のものがあるか」を尋ねる。

### 直したあとの回避策を、そのままにしない

「英語版に日本語が出る」の一次対応は妥当だったが、**後退だった**ことに
自分では気づいていなかった。既存の解が見つかったら、回避策は捨てて解のほうへ寄せる。
