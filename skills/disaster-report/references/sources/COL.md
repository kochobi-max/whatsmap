# 情報源プロファイル: コロンビア (COL)

対象イベント: `EQ-2026-000146-COL`（2026年8月10日 チョコ県地震 M7.4）

**この順に当たる。** スペイン語ソースが一次情報になるため、数値の転記時に桁区切り
（コロンビアは `.` が桁区切り、`,` が小数点）に注意する。

---

## 1. UNGRD — 主たる公式情報源

Unidad Nacional para la Gestión del Riesgo de Desastres（国家災害リスク管理ユニット）

- https://portal.gestiondelriesgo.gov.co/

「Boletín informativo」「Reporte de situación」に人的被害・住家被害・被災者数（`personas afectadas`）・
避難所（`alojamientos temporales`）が出る。**報番号と発表時刻を必ず控える。**

### 用語対応

| ES | JA | EN |
|----|-----|-----|
| fallecidos / muertos | 死者 | deaths |
| heridos / lesionados | 負傷者 | injured |
| desaparecidos | 行方不明 | missing |
| personas afectadas | 被災者 | affected |
| familias afectadas | 被災世帯 | affected families |
| viviendas destruidas / averiadas | 住家全壊 / 一部損壊 | destroyed / damaged houses |
| alojamiento temporal | 避難所 | temporary shelter |

## 2. SGC — 地震の技術情報

Servicio Geológico Colombiano（コロンビア地質局）

- https://www.sgc.gov.co/

震源・マグニチュード・震度分布・余震一覧。**日本の気象庁に相当する位置づけ**として扱う。

## 3. IDEAM — 気象・水文

Instituto de Hidrología, Meteorología y Estudios Ambientales

- http://www.ideam.gov.co/

二次災害（降雨・土砂災害・河川）の見通し。地震単独のレポートでは優先度は低い。

## 4. 県・自治体

チョコ県（Gobernación del Chocó）およびキブド市等の発表。
アクセス困難地域が多く、**中央（UNGRD）の集計に地方の被害が反映されるまで時間差がある**。
数値が急増した場合は「新規被害」ではなく「集計の到達」である可能性を疑う。

## 5. 国際・報道

- ReliefWeb（UNOCHA / IFRC / Cruz Roja Colombiana）→ `_global.md`
- 報道: El Tiempo, El Espectador, Caracol Radio（ティア: media）

---

## 言語の扱い

**スペイン語版は作らない。** 日本語版・英語版の2本立てのみ
（2026年8月12日、伊達氏との確認により決定）。
スペイン語の一次情報は読み取りに使い、出力は JA / EN に限る。

## 出典名の日英対訳表

| EN | JA |
|----|-----|
| UNGRD | 国家災害リスク管理ユニット |
| SGC | コロンビア地質局 |
| IDEAM | 水文気象環境研究所 |
| Gobernación del Chocó | チョコ県庁 |


---

## UNGRD の取り方（2026-08-28 に確立）

**ポータルは SharePoint で、記事本文が静的HTMLに無い。** `curl` でも
ヘッドレスChromium でも本文は取れない。**SharePoint の REST API だけが通る。**

```bash
node generator/scripts/fetch_ungrd.js --grep "sismo|terremoto" --limit 3
node generator/scripts/fetch_ungrd.js --year 2026 --limit 20      # 一覧だけ
```

`WebFetch` は使わない。egress の許可リストを見ておらず、許可済みドメインでも
`EGRESS_BLOCKED` を返す（`references/environment.md`）。

### 取れるもの・取れないもの

| | |
|---|---|
| **取れる** | UNGRD の記事本文（救助実績、対応方針、国際支援、評価手法など） |
| **取れない** | **死者・負傷者・住家被害の数値集計** |

**数値集計は UNGRD のサイトには記事として載らない。** 公式X（@UNGRD）で
「balance con corte al ...」の形で発表され、報道がそれを引く。
**x.com・nitter・datos.gov.co・ungrd.gov.co はいずれも遮断されている**（2026-08-28）。

したがって数値は現状**報道経由でしか取れない**。SKILL.md §1 の出典階層に従い、
UNGRD発表を報道が引いた値は **`tier: "media"`** とし、`sourceURL` に報道の
URLを、本文に「UNGRD発表、◯月◯日◯時時点」と corte を明記する。
**公式値として `tier: "official"` を付けない。**

数値を公式ティアで扱いたい場合は、x.com などを許可リストに追加する必要がある。
