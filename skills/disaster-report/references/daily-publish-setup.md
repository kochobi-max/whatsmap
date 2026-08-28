# 毎日の出力を自動にする — Windows側の1回だけの設定

クラウドが毎朝データを更新し、**ビルドまで済ませる。**
**このPCがやるのは、出来上がった4ファイルを取ってきて
LargeScaleDisasters へ置くことだけ。** 設定は1回だけで、以後こちらの操作は要らない。

なぜPCを挟むのか：クラウドから
`C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters` へ書き込む経路が無いため。
OneDrive のコネクタも、手元へファイルを渡す仕組みも用意されていない。

**このPCに要るのは git・node・curl の3つだけ。**
LibreOffice も pptxgenjs も要らない（2026-08-28 に PDF 変換をクラウドへ移した）。

---

## いちばん簡単な方法（これだけでよい）

**`ADRC_setup_and_publish.bat` を `C:\Users\arakida\` に置いて、ダブルクリックする。**

クローン・ダウンロード・LargeScaleDisasters へのコピーまで全部やる。
何度実行してもよい。窓は最後に開いたまま止まるので、**最後の `STATUS:` の行だけ見る**。

| 最後の行 | 意味 |
|---|---|
| `STATUS: ALL DONE` | 4ファイルが出た。あとはタスクスケジューラに登録するだけ |
| `STATUS: FAIL no-git` / `no-node` | Git for Windows / Node.js LTS を入れて、もう一度 |
| `STATUS: FAIL clone` | サインイン窓を閉じてしまった可能性。もう一度実行する |
| `STATUS: FAIL copy-locked` | PowerPoint か PDFビューアでファイルを開いたまま。閉じて再実行 |
| その他の `FAIL` | その行をそのまま伝えてもらえれば分かる |

表示は `%TEMP%\adrc_setup.txt` にも残る。

**注意**: `daily_publish.bat` は**クローンした中**にしかない
（`C:\Users\arakida\whatsmap\skills\disaster-report\generator\scripts\`）。
クローン前は存在しないので、探しても見つからない。だから上の1ファイルから始める。

以下は、中で何が起きているかを知りたいときの内訳。

---

## 1. リポジトリを1回クローンする

置き場所は **OneDrive の外**にする（OneDrive配下に置くと `node_modules` や `_build` が
まるごと同期対象になる）。

```
cd C:\Users\arakida
git clone https://github.com/kochobi-max/whatsmap.git
```

`C:\Users\arakida\whatsmap` ができる。

## 2. （なくなりました）

以前はここで `npm install pptxgenjs` をしてもらっていた。
ビルドがクラウドへ移ったので不要。入れてしまっていても害は無い。

## 3. バッチのREPO行だけ確認する

`C:\Users\arakida\whatsmap\skills\disaster-report\generator\scripts\daily_publish.bat`
の先頭。クローン先を変えた場合だけ書き換える。

```
set "REPO=C:\Users\arakida\whatsmap"
```

## 4. うまくいかないときは、まず check_setup.bat

`...\generator\scripts\check_setup.bat` を**ダブルクリック**する。
何も変更しない。必要なものが揃っているかを7項目みて、`OK` / `NG` を1行ずつ出すだけ。
**窓は開いたまま止まる**ので、そのまま読める。

```
OK  1 git
OK  2 node         v22.x
NG  3 repo         no git clone at C:\Users\arakida\whatsmap
       Fix: cd C:\Users\arakida  &&  git clone https://github.com/kochobi-max/whatsmap.git
...
```

`NG` の行だけ見ればよい。直し方はその場に書いてある。
全部 `OK` になってから次へ進む。

## 5. まず手で1回動かす

```
"C:\Users\arakida\whatsmap\skills\disaster-report\generator\scripts\daily_publish.bat"
```

最後の行を見る。

| 最終行 | 意味 |
|---|---|
| `STATUS: PUBLISHED ...` | 4ファイルが LargeScaleDisasters に出た。成功 |
| `STATUS: SKIP stale-dist` | クラウド側の当日ぶんがまだ無い。**何もコピーしていない**。異常ではない |
| `STATUS: FAIL no-repo` | REPO の行が実際のクローン先と違う |
| `STATUS: FAIL no-manifest` | クラウドの配布物に届かない。社内ネットか、朝のビルドが落ちている |
| `STATUS: FAIL download` / `FAIL size` | 途中で切れた。**コピーはしていない**ので中身は無事。再実行 |
| `STATUS: FAIL copy-locked` | PowerPoint か PDFビューアでファイルを開いたまま。閉じて再実行 |

**`STATUS:` の行だけ見ればよい。** それ以外は読まなくてよい。

**ダブルクリックで実行してよい。** 窓は最後に開いたまま止まる。
表示内容は `%TEMP%\adrc_daily_publish.txt` にも残るので、後から見返せる。
（タスクスケジューラから走るときは止まらずに終了する）

## 6. タスクスケジューラに登録する

管理者の `cmd` で1行。毎日 08:10 JST に走る（クラウドの 08:00 更新の10分後）。

```
schtasks /create /tn "ADRC disaster report daily" /tr "\"C:\Users\arakida\whatsmap\skills\disaster-report\generator\scripts\daily_publish.bat\" --quiet" /sc daily /st 08:10
```

**`--quiet` を落とさないこと。** これが無いとバッチは最後にキー入力を待ち、
定期タスクがそこで止まったままになる。手で実行するときは付けなくてよい。

確認と手動実行:

```
schtasks /query /tn "ADRC disaster report daily"
schtasks /run   /tn "ADRC disaster report daily"
```

やめるとき:

```
schtasks /delete /tn "ADRC disaster report daily" /f
```

---

## 出るもの

`C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters\` に同名で上書き。

```
ADRC_EQ_COL_Choco_20260810_JA.pptx / .pdf
ADRC_EQ_COL_Choco_20260810_EN.pptx / .pdf
```

## 対象の災害を増やすとき

`daily_publish.bat` の `GLIDE` を増やす災害のぶんだけ複製するか、行を足す。
ファイル名はクラウドが出す `manifest.txt` に書いてあるので、バッチ側には書かない。

## 中で何が起きているか

クラウドは毎朝ビルドしたあと、4ファイルと `manifest.txt` を
配布専用のブランチ `dist` へ置く。バッチはそこから curl で取ってくる。

```
https://raw.githubusercontent.com/kochobi-max/whatsmap/dist/EQ-2026-000146-COL/manifest.txt
```

`manifest.txt` にはファイル名・バイト数・**いつ作られたか**が入っている。
バッチは、

1. 作られた日が**当日でなければコピーしない**（`STATUS: SKIP stale-dist`）
2. ダウンロードしたバイト数が台帳と**1バイトでも違えばコピーしない**

の2つを確認してから LargeScaleDisasters に置く。
どちらも「途中で切れたファイルで、いま出ている良いものを上書きしてしまう」ことを防ぐため。

## うまくいかないときに見るところ

- ダウンロードはできているのに OneDrive に出ない → `STATUS: FAIL copy-locked`。ファイルを開いたまま
- 前日と同じ内容が出る → クラウド側の更新が入っていない。ブランチのコミットを見る
- `STATUS:` の行が1つも出ずに終わる → バッチが cp932/CRLF で壊れている可能性。
  このファイルは ASCII のみで書いてあるので、編集時に日本語を足さないこと
- `STATUS: PUBLISHED` なのにメールが出ない → 公開記録が GitHub まで届いていない。
  ログの `marker confirmed on GitHub` の行を見る。無ければ `WARN: marker-not-pushed`
  が出ているはずで、その上に git の理由がそのまま出ている

## 2026-08-28 にここで起きたこと

`STATUS: PUBLISHED` が出て4ファイルも OneDrive に入ったのに、
**公開記録が GitHub に届いていなかった。** バッチは成功と報告していた。

git の出力を `>nul` に捨てたうえで、終了コードだけを見ていたのが原因。
このPCに `user.name` / `user.email` が設定されておらず `git commit` が失敗し、
続く `git push` は「Everything up-to-date」で **0 を返す**。
バッチはそれを成功と読んだ。

直したこと。

- 名前とアドレスを `git -c` でコマンドラインから渡す。設定に依存させない
- git の出力を捨てない。全部ログに残す
- **終了コードを信用しない。** push のあとに `git fetch` して、
  手元の記録と GitHub 側の記録の**内容ハッシュを突き合わせる**。
  「向こうにファイルがある」だけでは足りない。
  前日の記録が残っていれば、今日のコミットが黙って失敗していても通ってしまう

ついでに同じ性質の穴を3つ塞いだ。

- **バッチが自分自身を書き換えられていた。** 先頭の `git pull` は
  `daily_publish.bat` を更新しうる。cmd はバッチをディスクから読みながら
  実行するので、実行中に中身が入れ替わると別の内容の途中から動き出す。
  いまは最初に `%TEMP%` へ自分をコピーし、そちらを実行する
- **定期タスクが `pause` で止まるところだった。** 「ダブルクリックされたか」を
  `%cmdcmdline%` で判定していたが、タスクスケジューラも同じ形で起動するため
  区別できない。`--quiet` を渡す方式に変えた
- **日付が取れなかったときに黙って見送るところだった。** PowerShell が
  日付を返さないと `TODAY` が空になり、当日判定が必ず外れて
  毎日 `SKIP stale-dist` で終わる。いまは `STATUS: FAIL no-date` で止まる

## スペイン語版について

2026-08-28、スペイン語版は今後作らないことになった。
いまのジェネレータは JA / EN しか出さないので、コード側に消すものは無い。

出力先に残っていた `ADRC_EQ_COL_Choco_20260810_ES.pptx` / `_ES.pdf` は、
`daily_publish.bat` の `STEP: sweep` が次回の実行で消す。
消すのはこの2つの名前だけで、OneDrive のごみ箱に入るので元に戻せる。

---

## メールが嘘をつかないようにする仕組み

更新メールには「OneDrive の LargeScaleDisasters に保存しました」と書く。
**実際に保存されていないのにそう書くことがあってはならない。**

そのため `daily_publish.bat` は、コピーが成功したときだけ
`skills/disaster-report/_published/<GLIDE>.json` に記録を書き、push する。

クラウド側は**この記録が当日のものであるときだけメールを送る。**
記録が無い・古い場合は送らず、その旨だけ通知する。

つまり:

| PC側の結果 | メール |
|---|---|
| `STATUS: PUBLISHED` かつ marker が push された | 送る |
| `WARN: marker-not-pushed`（公開はできたが push 失敗） | **送らない**。通知だけ来る |
| PCが動かなかった | **送らない**。通知だけ来る |

push が通らない場合（git の認証が入っていないなど）は、初日にこれで分かる。
その場合は認証を通すか、別の伝え方に切り替える。
