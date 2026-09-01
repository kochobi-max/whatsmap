# 参考映像として所内メールに載せてよい媒体

**クラウドのセッションは動画を再生できない。** 読めるのは題名・チャンネル名・公開日・
説明文だけである。したがって**中身では選べない。出所で選ぶ。**

災害の映像は、別の災害の映像が題名だけ差し替えられて出回ることが日常的に起きる。
所内メールに貼れば ADRC の名前で回る。だから、編集責任がはっきりしている先だけを
ここに載せ、`find_videos.js` はここに無いものを **要確認** として人に回す。

書き方は「- \`チャンネル名の一部\`」。小文字で部分一致する。

## 載せてよいドメイン（報道の動画ページ）

`find_videos.js --verify <URL>` は、ここに載っているドメインのURLだけを `OK` にする。
ページを実際に取得し、**JSON-LD に `"@type":"VideoObject"` があること**まで確かめる。
題名・公開日時も、そのページ自身が名乗っている値を使う。人手で書き写さない。

書き方は「- `ドメイン`」。末尾一致で見る（`aljazeera.com` は `www.aljazeera.com` にも当たる）。

- `aljazeera.com`
- `bbc.com`
- `bbc.co.uk`
- `apnews.com`
- `reuters.com`
- `kathmandupost.com`
- `english.onlinekhabar.com`
- `myrepublica.nagariknetwork.com`
- `unicef.org`
- `wfp.org`
- `ifrc.org`
- `un.org`

## 政府・公的機関（ネパール）

- `Nepal Police`
- `Nepali Army`
- `NDRRMA`
- `Ministry of Home Affairs`

## 国際機関

- `United Nations`
- `UNICEF`
- `World Food Programme`
- `IFRC`
- `UNOSAT`

## 通信社・国際報道

- `Reuters`
- `Associated Press`
- `AP Archive`
- `AFP`
- `BBC News`
- `Al Jazeera`
- `DW News`
- `NHK`

## ネパール国内報道

- `Kantipur`
- `Kathmandu Post`
- `Nepal Television`
- `Himalaya TV`
- `Image Channel`
- `News24 Nepal`
- `AP1HD`

## インド報道（ネパールの災害を扱う）

- `NDTV`
- `India Today`
- `ANI News`
- `Hindustan Times`
- `The Times of India`

---

## ここに足すときの判断

足してよいのは、**自分の名前で誤りの責任を負う先**である。

- 政府機関・国際機関の公式チャンネル
- 記者と編集部を持つ報道機関
- 現地の放送局

足さないもの:

- 無署名の集約チャンネル、まとめチャンネル
- 「衝撃」「BIBLICAL」「Terrifying」など、題名で煽る先。
  出所を書かずに他所の映像を使うことが多い
- 個人の投稿。**本物であっても、真偽を確かめる手段がこちらに無い**

迷ったら足さない。要確認のまま人に見せれば済む。

## 2026-09-01 の状況

`www.youtube.com` / `youtube.com` は許可リストに足してもらったあとも **403（ポリシー拒否）**
のまま。同じセッションで `bbc.com` `apnews.com` `aljazeera.com` `kathmandupost.com` は
開いたので、伝播の問題ではない。**ポリシー拒否は再試行しない。**
`find_videos.js` の YouTube 経路は当面使えない。

`www.reuters.com` は 401 を返す。到達はしているが本文が取れない。

**報道各社の動画ページのほうが、この用途には適している。** 編集責任がはっきりしており、
ページ自身が JSON-LD で `VideoObject` と公開日時を名乗るので、
こちらが題名や日付を書き写す必要がない。

`www.youtube.com` はネットワークポリシーで 403（拒否）。許可リストに入るまで
`find_videos.js` は `STATUS: BLOCKED` を返す。**「動画が無い」ではない。**

X（`x.com`）は届くが、ログイン壁のため**アカウントの最新10件程度しか返らない。
検索も遡りもできない。** 数日前の映像には届かないので、発災直後以外は当てにしない。

`www.facebook.com` も 403。仮に許可されても、ログイン壁で本文が取れない見込みが高い。
