# 調査に必要なドメイン許可リスト（egress allowlist 申請用）

2026-09-07 の調査セッションで、ネットワークポリシーによりアクセスできなかったドメインの一覧。
`sources.md` の ★ 印（原典未確認）の大半は、下記A・Bを許可すれば解消できる。

設定場所: Claude Code on the web の環境作成時のネットワークポリシー
（https://code.claude.com/docs/en/claude-code-on-the-web）

---

## 優先度A：一次資料・査読論文（論文の根拠として必須）

```
volcano.si.edu
pubs.usgs.gov
volcanoes.usgs.gov
avo.alaska.edu
www.icao.int
www.bousai.go.jp
www.jstage.jst.go.jp
researchmap.jp
www-cv01.ufinity.jp
www.nature.com
link.springer.com
www.sciencedirect.com
appliedvolc.biomedcentral.com
earth-planets-space.springeropen.com
www.worldbank.org
thedocs.worldbank.org
reliefweb.int
www.eurocontrol.int
www.iata.org
eur-lex.europa.eu
www.caa.co.uk
ad.easa.europa.eu
skybrary.aero
www.dpri.kyoto-u.ac.jp
www.mlit.go.jp
```

用途：
- `volcano.si.edu` … Smithsonian GVP。全事例のVEI・噴火経過・週報の確定値
- `pubs.usgs.gov` / `volcanoes.usgs.gov` / `avo.alaska.edu` … Guffanti et al. (2010) DS-545 の遭遇件数、Casadevall (1994/1996)、Fire and Mud、スパー1992
- `www.icao.int` … Doc 9974、Doc 9766、APAC ATM Contingency Plan
- `www.bousai.go.jp` / `www.mlit.go.jp` … 内閣府 広域降灰WG報告（2020）、首都圏降灰ガイドライン（2025）、鹿児島空港の除灰閾値資料
- `www.jstage.jst.go.jp` / `researchmap.jp` / `www-cv01.ufinity.jp` … 阪本ほか（2021）の書誌確定と著者名漢字の確認
- `www.nature.com` / `link.springer.com` / `www.sciencedirect.com` … Mani et al. (2021) の pinch point 7地点、Wilson et al. (2012)、Picquout et al. (2013)、Dunn & Wilkinson (2016)
- `www.worldbank.org` / `thedocs.worldbank.org` / `reliefweb.int` … GRADE Tonga、PDNA、DREF
- `www.eurocontrol.int` / `www.iata.org` / `eur-lex.europa.eu` / `www.caa.co.uk` / `ad.easa.europa.eu` … エイヤ2010の欠航便数・損失、濃度基準の変遷、EACCC、McDonagh判決

## 優先度B：インドネシア政府・空港・規則（2026年噴火の一次情報）

```
magma.esdm.go.id
geologi.esdm.go.id
www.esdm.go.id
bnpb.go.id
hubud.kemenhub.go.id
jdih.kemenhub.go.id
peraturan.bpk.go.id
www.airnavindonesia.co.id
soekarnohatta.injourneyairports.id
injourneyairports.id
www.bmkg.go.id
id.usembassy.gov
```

用途：噴火経過報告（MAGMA）、Badan Geologi の山体安定性評価、KP 153/2019（火山灰CDM）、PM 89/2015（旅客対応）、NOTAM/ASHTAM、CGK旅客数、閉鎖・再開時刻。
※ `www.bmkg.go.id` は許可済み（唯一取得できた公的サイト）。
※ `bnpb.go.id` はプロキシではなくサイト側が 403 を返しており、許可しても取得できない可能性が高い。

## 優先度C：報道（数値の照合用）

```
en.antaranews.com
jakartaglobe.id
en.tempo.co
nasional.kompas.com
regional.kompas.com
katadata.co.id
databoks.katadata.co.id
www.cnbcindonesia.com
news.detik.com
www.liputan6.com
ekbis.sindonews.com
www.idxchannel.com
www.reuters.com
www.cnn.com
www.cnbc.com
www.pbs.org
www.euronews.com
www.abc.net.au
www.malaymail.com
www.afpbb.com
www.nikkei.com
www.jiji.com
www.aerotime.aero
www.volcanodiscovery.com
watchers.news
cimss.ssec.wisc.edu
en.wikipedia.org
ja.wikipedia.org
id.wikipedia.org
```

## 許可を推奨しないもの

`blog.wego.com` / `logfret.com` / `www.techtimes.com` / `www.indoneo.com` / `www.thetraveler.org` /
`travelmarketnews.com` / `www.travelandtourworld.com` … 一次情報を持たない旅行系アグリゲータ。
論文の引用元にならないため、許可しても価値がない。

---

## 2026-09-08 追記：A・B適用後の到達性テスト結果

A・Bを許可した状態で実測した結果（`curl` でCONNECTトンネルの成否とHTTPコードを確認）。

**到達可能になったもの（許可が有効に働いた）**

| ドメイン | 結果 |
|---|---|
| pubs.usgs.gov | 200 |
| www.bousai.go.jp | 200 |
| www.jstage.jst.go.jp | 200 |
| researchmap.jp | 200 |
| reliefweb.int | 200 |
| www.eurocontrol.int | 200 |
| www.nature.com / link.springer.com | 303（リダイレクト＝到達可） |
| geologi.esdm.go.id | 200 |

**プロキシは通すが、サイト側のボット対策で拒否されるもの（許可では解決しない）**

| ドメイン | 結果 |
|---|---|
| volcano.si.edu | CONNECT 200 → Cloudflare が 403「Sorry, you have been blocked」 |
| www.icao.int | CONNECT 200 → 同様に 403 |
| www.reuters.com | CONNECT 200 → 401（ペイウォール） |

ブラウザ相当のUser-Agentを付けても 403 のままだった。データセンターIPからのアクセスを
遮断する設定のため、許可リストでは突破できない。これらは人手でのブラウザ取得か、
別ミラー（USGS版、SKYbrary版など）に切り替える必要がある。

**まだプロキシに遮断されているもの（Cを入れていないため）**

`en.antaranews.com` … `CONNECT tunnel failed, response 403`（プロキシの拒否シグネチャ）

**判別方法**：`curl -v` の出力で
`CONNECT tunnel failed, response 403` はプロキシの拒否、
`CONNECT tunnel established, response 200` の後のHTTPコードはサイト側の応答。

## Cを入れない場合に検証できないもの

Cの報道系を入れない判断は妥当だが、2026年クラカタウ噴火の**便数・旅客数**は
運輸省が記者発表した数字を報道経由でしか取れないため、以下は原典照合ができない。

- 1,558便／17万人（9/6 運輸省）と 2,961便／34.1万人（9/7 業界集計）の不整合
- INACA の1日190億ルピア推計の算出根拠
- 代替空港10空港の指定と無償輸送の実施規模

火山活動そのもの（噴煙高度、警戒レベル、噴火継続時間、立入禁止半径）は
BMKG と geologi.esdm.go.id が到達可能なので原典で確認できる。

**最小限の追加候補**：報道系を全部入れるのが不適当なら、国営通信の
`en.antaranews.com` の1件だけでも運輸省発表の一次に近い形で追える。

---

## ドメイン許可では解決しない制約

- **WebSearch の回数上限**：本セッションは 200/200 を使い切った。ドメイン許可とは別に
  `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` の引上げが必要。
- **有料論文**：`www.sciencedirect.com` や `www.nature.com` を許可しても本文はペイウォールの内側。
  機関購読（兵庫県立大学・ADRC）経由でのPDF入手か、`arxiv.org` / `researchgate.net` /
  各大学リポジトリの著者版で代替する必要がある。
