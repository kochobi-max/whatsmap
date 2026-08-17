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
