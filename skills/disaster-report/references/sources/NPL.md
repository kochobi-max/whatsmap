# 情報源プロファイル: ネパール (NPL)

対象イベント: `FF-2026-000162-NPL`（2026年8月26日 ボテコシ川 氷河湖決壊洪水／ラスワ郡）

**このイベントは地震ではない。** ジェネレータは熊本の地震レポートを出自に持つため、
震源・震度・余震・津波のスライドが既定で出る。洪水では `meta.optional_slides` から
外すこと（`apply_hazard_gates.js`）。

---

## 0. 最初に確かめたこと（2026-08-28 実測）

| 情報源 | 到達 | 備考 |
|---|---|---|
| BIPAD Portal `bipadportal.gov.np` | **200** | APIが公開されている。ただし**遅れる**（下記） |
| NDRRMA `ndrrma.gov.np` | 200 | **JSアプリでHTMLに中身が無い。APIパスは全て404。** 直接は使えない |
| ReliefWeb `reliefweb.int`（サイト） | **200** | 実質いちばん頼れる。UNOSAT・IFRC・OCHA がここに集まる |
| GDACS `gdacs.org` | 200 | API可 |
| DHM（水文気象局） https://dhm.gov.np | **200**（8/28 許可後） | `www.` 付きは不可。**裸のホスト名で当たる** |
| 内務省 https://moha.gov.np | **200**（同上） | 同上 |
| ICIMOD https://icimod.org | **200**（同上） | **ブラウザのUAが要る**（下記）。`www.icimod.org` へ301 |
| NEOC `neoc.gov.np` | **000** | 未許可のまま |
| DRR Portal `drrportal.gov.np` | **000** | 未許可のまま |
| Nature `www.nature.com` | **000** | `nature.com` は301で通るが、飛び先の `www.` が未許可 |

### ホスト名は完全一致。`www.` の有無で結果が変わる

2026-08-28、許可リストに追加してもらった直後、`www.dhm.gov.np` は 000 のままで
`dhm.gov.np` は 200 だった。**追加を依頼するときは、実際に叩くホスト名をそのまま渡す。**
リダイレクト先も別ホストなら別に要る（`nature.com` → `www.nature.com`）。

### 403 を「遮断」と読み違えない

ICIMOD は独自の User-Agent に **nginx が 403** を返す。プロキシは通っていて
（`CONNECT` は成立している）、ブラウザの UA なら 200 になる。
`fetch_url.js` と `check_sources.js` はブラウザの UA で名乗り、`-L` で追う。
**403 の主が誰かを見ること。** 遮断なら 000 になる。

**ReliefWeb API は使えない。** v1 は 410（decommissioned）、v2 は承認済み `appname` が要る。

```
{"status":403,"message":"You are not using an approved appname."}
```

サイト側（`https://reliefweb.int/updates?...`）は普通に読めるので、当面はそちらを使う。

---

## 1. BIPAD Portal — 国の災害統計。**ただし遅れる**

内務省の災害情報ポータル。**APIが認証なしで開いている。**

```
https://bipadportal.gov.np/api/v1/incident/?limit=50&ordering=-incident_on
https://bipadportal.gov.np/api/v1/incident/?district=<id>&hazard=<id>
https://bipadportal.gov.np/api/v1/district/?limit=100     # Rasuwa = 23
https://bipadportal.gov.np/api/v1/hazard/?limit=50        # Glacial lake outburst = 26, Flood = 11
```

`incident_on__gt` / `incident_on__lt` で期間を絞れる（`2026-08-25T00:00:00+05:45` 形式）。
1件は `numPeopleDeath` / `numPeopleMissing` / `numPeopleInjured` / `source` / `verified` / `point` を持つ。

### **BIPADに無いことを「起きていない」と読まない**

2026-08-28 時点、**死者157人のこの災害がBIPADに1件も入っていない。**
ラスワ郡の記録は8月22日で止まっている。`hazard=26`（氷河湖決壊）は全期間で0件。

手法が悪いのではない。検証として2025年7月8日のラスワガディ氷河湖決壊を引くと、

```
id=80929  Flood at Rasugadhi, Gosaikunda Rural Municipality-2
2025-07-08  source=nepal_police  verified=True  85.459E 28.281N
```

と**ちゃんと入っている**。つまりポータルはこの種の災害を記録する。**遅れているだけ。**
山岳部の大規模災害ほど、警察・郡災害対策本部からの報告が上がるまで日数がかかる。

コロンビアでは「一次情報に届かないこと」を「変化なし」と誤読した。
ここは裏返しで、**「国のポータルが沈黙していること」を「起きていない」と誤読しない。**

---

## 2. ReliefWeb — 当面の主軸

災害ページに GLIDE 番号と公式の災害名が載る。

- 災害ページ: https://reliefweb.int/disaster/ff-2026-000162-npl
- 更新一覧: `https://reliefweb.int/updates?advanced-search=%28C170%29`（C170 = Nepal）

ここに UNOSAT の衛星解析図、IFRC の緊急アピール、OCHA・DG ECHO の地図が集まる。
**数値の出典は必ず元機関名（NDRRMA / IFRC / WFP など）と日付で記録する。**
ReliefWeb は配信者であって発表者ではない。

## 3. NDRRMA — 国家防災庁（**直接は読めない**）

https://ndrrma.gov.np — トップはJSアプリでHTMLに中身が無く、`/api/...` は全て404。
**NDRRMAの数値は ReliefWeb 経由（WFP・OCHA の引用）で取る**のが現状の唯一の道。
許可リストに `drrportal.gov.np` を足せれば、そちらに日報が出る。

## 4. GDACS

```
https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?country=Nepal&fromDate=..&toDate=..
```

**この災害には注意が要る。** GDACS が拾っているのは GloFAS 由来の洪水シグナルで、
重心はカトマンズ寄り（85.36E, 27.30N）、GLIDE 空欄、名称も `Flood in Nepal` のまま。
**ラスワの鉄砲水そのものを捉えたものではない。** GDACS の警報レベルを
この災害の指標として引かないこと。

## 5. 種別の扱い — GLOF である。呼び方は機関により違う

**この災害は GLOF（氷河湖決壊洪水）として扱う。**
要請元の DHM、NDRRMA、ADRC、センチネルアジア、JAXA、WFP、Nature がいずれもそう呼んでいる。

| 機関 | 呼び方 |
|---|---|
| DHM（要請元）/ NDRRMA / ADRC / センチネルアジア / JAXA | **GLOF**（`Rasuwa GLOF Event`、`ネパールGLOF`） |
| WFP（8月27日 sitrep） | **suspected Glacial Lake Outburst Flood (GLOF)** |
| Nature | **GLOF** |
| ReliefWeb（災害名・GLIDE） | Flash Floods（`FF-2026-000162-NPL`） |
| UNOSAT / 国際災害チャーター（図の題） | mudflow / rockflow |
| DG ECHO（ERCC） | ice-rock avalanche and flash flood |

**GLIDE が `FF-`（Flash Flood）なのは登録上の分類であって、機構の否定ではない。**
UNOSAT の `mudflow/rockflow` も、図に写っている堆積物の呼び方である。
機関ごとに粒度が違うだけで、**互いに矛盾していない。**

未確定なのは「GLOFかどうか」ではなく、**どの湖がどう決壊したか**である。
DHM と氷河研究者の暫定仮説は、氷と岩の雪崩がレンデ川を堰き止めて
一時的な土砂ダム湖を作り、それが決壊したというもの。
既存のモレーン湖の決壊ではなく、**当日新しくできた湖の決壊**という点が
2025年7月の事例（氷河上湖の排水）と異なる。ここは公式には確定していない。

### 私（AI）がここで間違えた

2026-08-28、WFPの sitrep に `suspected Glacial Lake Outburst Flood (GLOF)` と
書いてあるのを**読んだうえで見落とし**、「GLOFと呼んでいる公式機関は無い」と
断定して報告した。荒木田さんの指示のほうが正しかった。

- **「〜は無い」「〜ではない」と断定しない。** 到達できた情報源の中に見当たらない、
  としか言えない。存在しないことの証明は、こちらの手持ちの範囲では出せない
- **機関ごとに呼び方が違うときは、どれかを選んで他を否定しない。** 並べて示す
- 人から与えられた前提を否定する前に、**その前提を裏づける記述が
  手元の資料に無いかを先に探す。** 今回は探せば手元にあった

## 6. 用語

| NE / EN | JA |
|---|---|
| Bhote Koshi / भोटेकोशी | ボテコシ川 |
| Rasuwa District | ラスワ郡 |
| Rasuwagadhi | ラスワガディ（中国国境の検問所） |
| Timure | ティムレ |
| Syabrubesi | シャブルベシ |
| Trishuli River | トリシュリ川（ボテコシ川の下流） |
| Rural Municipality (गाउँपालिका) | 村（郡の下の自治体） |
| Gosaikunda / Uttargaya RM | ゴサインクンダ村／ウッタルガヤ村 |
| Nuwakot District | ヌワコット郡（下流側） |

行政区画は **県（Province）＞郡（District）＞市・村（Municipality / Rural Municipality）＞
ワード（-1, -2 …）**。BIPAD の `title` は `<hazard> at <地名>, <自治体>-<ワード番号>` の形。

---

## 7. 未解決

- **ICIMOD・DHM・NEOC・DRR Portal・MOHA が許可リストに無い。** どの湖がどう決壊したか、
  降水量、上流の状況が取れない。追加を依頼すること
- `nature.com` にも届かない（000）。GLOF を扱った記事があるので追加を依頼する
- ReliefWeb API の `appname` 申請（apidoc.reliefweb.int/parameters#appname ※到達確認の対象外にするため URL 形式で書かない）。
  取れればサイトのHTML解析をやめられる
- 中国側（チベット自治区・吉隆県）の情報源が無い。出水は国境の向こう側で始まっている
