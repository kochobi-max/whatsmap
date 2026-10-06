# 情報源と取得経路（LDI日次レポート・Step 3 の参照先）

SKILL.md の Step 1〜6 に散っていた「どこから・どう読むか」を1か所に集めたもの。
**数値の判定基準はここに書かない。** 登録基準・スキップ判定は SKILL.md 本文が正本。

> ⚠️ このリポジトリの写しを直しても、毎朝の定期タスクには届かない（SKILL.md 冒頭）。
> **アカウント同期スキルへ上げるところまでが1件。**

---

## 1. 経路を選ぶ前に知っておくこと

| 取り方 | 何を見ているか | 注意 |
|---|---|---|
| `WebFetch` | **egress の許可リストを見ていない**（別経路） | 許可リストに足しても届かない。reliefweb.int・adrc.asia は 403 / robots で不可 |
| シェル（`curl`） | 環境の egress 許可リスト | **環境ごとに結果が違う。**下の表はどの環境で測ったかを必ず添える |
| 組み込みブラウザ（`javascript_tool`） | 人のブラウザと同じ | 最後の手段ではなく、adrc.asia の正規経路 |

**403 は2種類ある。混同しない。**

| 症状 | 意味 | 直し方 |
|---|---|---|
| `curl: (56) CONNECT tunnel failed, response 403` | こちら側のポリシー拒否 | 許可リストへの追加を頼む |
| `HTTP/1.1 403` が本文として返る | サイト側の bot 対策 | 許可リストでは直らない |

---

## 2. 到達可否（2026-10-06 実測）

**環境で結果がまるで違う。毎朝の定期タスクのシェルは、外に一切出られない。**

### 2-A. 定期タスク（Cowork・`env_011111111111111111111117`）のシェル

確認用セッションを同じ環境に立てて測った（$0.27）。

| 対象 | 結果 |
|---|---|
| reliefweb.int（一覧・個別・添付PDF） / www.adrc.asia / www.gdacs.org / www.ndma.gov.pk / secure.globalsign.com | **すべて `CONNECT tunnel failed, response 403`**（ポリシー拒否） |
| `pdftotext` / `python3` / `pdfplumber` | **ある** |

**→ 定期タスクでは curl の経路（§4）は使えない。** ReliefWeb も ADRC も GDACS も、
組み込みブラウザ / Chrome（このタスクは Windows デスクトップに紐づき、Chrome を使える）で読む。
SKILL.md Step 1.6 の「シェルは許可リストで拒否」（2026-09-30）は**この環境については正しかった。**
`pdftotext` はあるので、ブラウザで取った PDF のバイト列をファイルに書ければ §4 の手順3だけは使える。

### 2-B. 対話用クラウド（Default・`env_01VsCybtqdv6UAeHEmJLqTWU`）から `curl`

調査・手直しを対話セッションでやるときの経路。

| ホスト | 結果 | 意味 |
|---|---|---|
| `reliefweb.int`（一覧・個別レポート・添付PDF） | **200** | **読める。**SKILL.md の「シェルは許可リストで拒否」（2026-09-30）とは食い違う。下の §4 |
| `api.reliefweb.int` | 400 | ホストには届く。appname 無しで弾かれているだけ（承認制。SKILL.md Step 1.6 末尾） |
| `www.adrc.asia` | **TLS 失敗**（`unable to get local issuer certificate`） | プロキシの CA を添えても同じ。サイトが中間証明書を送っていない。**検証は外さない。ブラウザで読む** |
| `www.ndma.gov.pk` | `Connection reset by peer` | CONNECT 403 ではない。原因未特定。NDMA の数値は ReliefWeb 経由で取る |
| `www.gdacs.org`（API） | 200 | 読める |
| `glidenumber.net` | 200 | 読める |
| `earthquake.usgs.gov`（GeoJSON フィード） | 200 | 読める |
| `adinet.ahacentre.org` | 200 | トップは読める。**記事の取り方は未検証** |
| `www.fdma.go.jp/disaster/info/` | 200 | 読める。被害報 PDF は WebFetch でも可（2026-09-30） |
| `www.kompas.com` | 200 | 読める（2026-09-18 に許可リスト追加済み。`disaster-report/references/sources/IDN.md`） |

---

## 3. 優先順と経路

SKILL.md Step 3 の優先順に沿う。

| 順 | 情報源 | 経路 | 使いどころ・罠 |
|---|---|---|---|
| 1 | **ReliefWeb** | §4（curl）→ だめならブラウザ（SKILL.md Step 1.6） | 政府 SitRep・IFRC DREF/Appeal・OCHA が集まる。**API は使わない**（v1 廃止 410、v2 は承認済み appname 必須） |
| 2 | **ADINet**（ASEAN） | 未検証 | 優先順にはあるが、取得手順はどこにも書かれていない。**初回に使った人が手順をここへ書く** |
| 3 | **USGS**（地震） | `earthquake.usgs.gov` の GeoJSON | 震源・M・PAGER。被害数値の一次ではない |
| 4 | **FDMA**（日本） | `fdma.go.jp/disaster/info/` の一覧で**最新の報番号**を確認 → PDF | 1日に複数報出る。報番号で照合。内閣府 `bousai.go.jp` は遅れることがあるので新しい方を採る |
| 5 | 各国防災機関 | 国による | NDMA（PAK）は直接つながらない（§2）。ReliefWeb に SitRep が転載される |
| 6 | 報道 | 発表機関名と as-of 日付が書いてあるものだけ | ティアは発表機関で決める。タイ DDPM は Nation Thailand が発表時刻つきで転載する |

**LDI自身（Step 1・3.5）** は `www.adrc.asia`。TLS の都合で**ブラウザ一択**。
`scripts/fetch_adrc.js` は実サイトの DOM で未検証（jsdom の疑似データのみ）。

**発見経路（Step 1.5・4）**

| 経路 | 取り方 | 罠 |
|---|---|---|
| GDACS Orange/Red | API `geteventlist/SEARCH` | `eventtype` フィルタが効かないことがある。`severitydata.severity` を死者数と読まない。死者数が空の長期 FL/DR は Step 1.6 へ回す |
| GLIDE | `glidenumber.net/glide/public/search/search.jsp` | 新規扱いの前に LDI 未登録を必ず確認 |
| Sentinel Asia | **メールが一次**（直近45日を全ページ） | 公開 EO ページは反映が遅れる。2026-09-15 に SA-00660 を落とした |

---

## 4. ReliefWeb を curl で読む（2026-10-06 実測・**対話用クラウドのみ**）

**定期タスクの環境では使えない（§2-A）。** 対話セッションで ReliefWeb を調べるときに使う。
SKILL.md Step 1.6 の「ブラウザ内で PDF をJSで復号する60行」は、この経路が使える環境では要らない。

```bash
UA='Mozilla/5.0'
# 1) 一覧（国＋1語。3語以上は全語ANDで0件になる）
curl -sS -A "$UA" "https://reliefweb.int/updates?view=reports&search=Pakistan%20monsoon" -o list.html
grep -oE '/report/[a-z-]+/[A-Za-z0-9%-]+' list.html | sort -u

# 2) 個別レポート → 添付PDFのパス
curl -sS -A "$UA" "https://reliefweb.int/report/pakistan/<slug>" -o rep.html
grep -oE '/attachments/[a-z0-9-]+/[^"]+\.pdf' rep.html | sort -u

# 3) PDF → テキスト
curl -sS -A "$UA" "https://reliefweb.int/attachments/<id>/<file>.pdf" -o sitrep.pdf
pdftotext -layout sitrep.pdf sitrep.txt          # クラウド（poppler あり）
# PC には pdftotext が無い（CLAUDE.md §1）。pdfplumber を使う:
# python -c "import pdfplumber;print('\n'.join(p.extract_text() or '' for p in pdfplumber.open('sitrep.pdf').pages))"
```

**確かめた実例**: NDMA Pakistan Monsoon 2026 SitRep No.87（20 Sep 2026、16ページ）。
`Cumulative Casualties and Injuries - (From 26 June 2026 to 20 September 2026)` の下に
**州別の行と `Grand Total` がそのまま読めた**（CIDフォントの手復号は不要だった）。

```
                Deceased                       Injured
Province   Male Female Children Total   Male Female Children Total
Punjab      26    12      28     66     170    99     123    392
...
Grand Total 65    38      88    191     223   143     182    548
```

- **死者計は Deceased の Total 列**（上の例で191）。負傷計は右端（548）
- 州・県の行がそのまま取れるので、Step 1.6 の「州単位で10人」の判定に直接使える
- 表の前にグラフの数値（棒の高さ）が混ざる。**表の見出し行から下だけを読む**
- テキストが空のページは画像。数値が画像側にしか無ければ SKILL.md の canvas 手順へ

**この経路が使えない環境**（CONNECT 403 が出る等）では、SKILL.md Step 1.6 のブラウザ手順がそのまま正しい。

---

## 5. 記録するもの

- **sourceDate と sourceURL を必ず控える。**URL1 は「今回読んだ記事」。前回レポートの URL を引き継がない
- 台帳（`scripts/ldi_state.py`）にある URL は読み直さない。ただし LDI 個別ページの確認（Step 3.5）は毎回全Key
- 日本の避難者は**避難所滞在者のみ**判定に使う。避難指示対象者は参考値
- 不明な数値は `確認中` / `TBC`
- 一次資料で取れず報道値を使ったら、メールに「一次資料未確認・報道値」と書く

---

## 6. 未解決

| 項目 | 状態 |
|---|---|
| ~~§4 の curl 経路が Cowork 環境で通るか~~ | **通らない**（2026-10-06 実測、§2-A）。Cowork 側の許可リストを広げられるかは未調査 |
| ADRC の中間証明書 | 対話用クラウドの許可リストに `secure.globalsign.com` を追加済み（2026-10-06）。**次に立てるセッションから効く**。取れたらリポジトリに置き、`--cacert` で ADRC を curl で読める |
| ADINet の記事の取り方 | 未検証 |
| `fetch_adrc.js` の実DOM検証 | 未了 |
| `www.ndma.gov.pk` の connection reset | 原因未特定 |
| ReliefWeb API appname の申請 | 未申請（SKILL.md Step 1.6 末尾） |
