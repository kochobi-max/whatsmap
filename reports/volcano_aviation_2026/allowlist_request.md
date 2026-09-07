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

## ドメイン許可では解決しない制約

- **WebSearch の回数上限**：本セッションは 200/200 を使い切った。ドメイン許可とは別に
  `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` の引上げが必要。
- **有料論文**：`www.sciencedirect.com` や `www.nature.com` を許可しても本文はペイウォールの内側。
  機関購読（兵庫県立大学・ADRC）経由でのPDF入手か、`arxiv.org` / `researchgate.net` /
  各大学リポジトリの著者版で代替する必要がある。
