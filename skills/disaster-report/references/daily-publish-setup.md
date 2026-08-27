# 毎日の出力を自動にする — Windows側の1回だけの設定

クラウドが毎朝データを更新し、**このPCがビルドして LargeScaleDisasters へ出す。**
設定は1回だけ。以後こちらの操作は要らない。

なぜPC側でビルドするのか：クラウドから
`C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters` へ書き込む経路が無いため。
OneDrive のコネクタも、手元へファイルを渡す仕組みも用意されていない。

---

## 1. リポジトリを1回クローンする

置き場所は **OneDrive の外**にする（OneDrive配下に置くと `node_modules` や `_build` が
まるごと同期対象になる）。

```
cd C:\Users\arakida
git clone https://github.com/kochobi-max/whatsmap.git
```

`C:\Users\arakida\whatsmap` ができる。

## 2. pptxgenjs を入れる

`C:\Users\arakida\` に置く（OneDrive配下に作らないため）。

```
cd C:\Users\arakida
npm install pptxgenjs
```

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
| `STATUS: FAIL no-repo` | REPO の行が実際のクローン先と違う |
| `STATUS: FAIL no-pptxgenjs` | 手順2をやっていない |
| `STATUS: FAIL soffice-missing` | LibreOffice のパスが既定と違う。`set SOFFICE=...` を足す |
| `STATUS: FAIL copy-locked` | PowerPoint か PDFビューアでファイルを開いたまま。閉じて再実行 |
| `STATUS: FAIL pdf-locked` | 同上。古いPDFを消せなかった |

**`STATUS:` の行だけ見ればよい。** それ以外は読まなくてよい。

**ダブルクリックで実行してよい。** 窓は最後に開いたまま止まる。
表示内容は `%TEMP%\adrc_daily_publish.txt` にも残るので、後から見返せる。
（タスクスケジューラから走るときは止まらずに終了する）

## 6. タスクスケジューラに登録する

管理者の `cmd` で1行。毎日 08:10 JST に走る（クラウドの 08:00 更新の10分後）。

```
schtasks /create /tn "ADRC disaster report daily" /tr "\"C:\Users\arakida\whatsmap\skills\disaster-report\generator\scripts\daily_publish.bat\"" /sc daily /st 08:10
```

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
イベントJSONの `meta.filebase` からファイル名が決まるので、バッチ側にファイル名は書かない。

## うまくいかないときに見るところ

- ビルドはできているのに OneDrive に出ない → `STATUS: FAIL copy-locked`。ファイルを開いたまま
- 前日と同じ内容が出る → クラウド側の更新が入っていない。ブランチのコミットを見る
- `STATUS:` の行が1つも出ずに終わる → バッチが cp932/CRLF で壊れている可能性。
  このファイルは ASCII のみで書いてあるので、編集時に日本語を足さないこと

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
