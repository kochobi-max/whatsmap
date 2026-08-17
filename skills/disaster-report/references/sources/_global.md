# 情報源プロファイル: 国際共通

国別プロファイル（`<ISO3>.md`）を当たった**後**に、これらで補完・裏取りする。
国の公式値と食い違う場合は**国の公式値を優先**する（ティア: official > media > tbc）。

---

## ReliefWeb — 最優先の国際ソース

- 検索: https://reliefweb.int/updates?search=\<災害名\>
- API: `https://api.reliefweb.int/v1/reports?query[value]=<keyword>`

UNOCHA / IFRC / 各国赤十字 / 国連機関の Situation Report が集まる。**GLIDE番号を保持している**。

> URLは必ず動作確認してから記載する。404・アクセス不能のURLは使わない。

## GDACS

```
https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH
  ?eventtype={EQ|TC|FL|VO|TS|DR}&fromDate=<60日前>&toDate=<今日>&alertlevel=Orange
```

Red → 必ず調査 / Orange → 登録基準を確認。`eventid` を控える。

## USGS（地震）

- イベントページ: `https://earthquake.usgs.gov/earthquakes/eventpage/<id>/executive`
- ShakeMap / PAGER の推定被害区分、余震一覧、発震機構

日本国内の地震では**気象庁の震度・マグニチュードを正**とし、USGS値は `mag_usgs` に併記する。

## Sentinel Asia

https://sentinel-asia.org/EO/EmergencyObservation.html

EO（緊急観測）の発動状況。ADRCが要請主体になった案件は特に重要。
EOR番号（`SA-00XXX`）と要請機関を控える。

## 国際災害チャーター (International Charter Space and Major Disasters)

https://disasterscharter.org/

発動の有無・Activation ID・要請機関。**Sentinel Asia EO とチャーター発動の両方**が揃うと
`ldi-cms-report` の昇格基準（ADRC加盟国）に該当する。

## ADINet（ASEAN）

ASEAN域内の災害。AHA Centre の Flash Update / Situation Update も併せて確認する。

## GLIDE

https://glidenumber.net/glide/public/search/search.jsp

GLIDE番号の実在確認。**実在確認済みのものだけ記載する。**

---

## 共通の注意

- **今回参照した記事・報告書のURLをそのまま使う。** 前回レポートのURLを引き継いではならない
- 全URLをブラウザで動作確認してから記載する。404はそのフィールドを「—」にする
- `sourceDate`（情報源の日付）と `sourceURL` を必ずセットで記録する
- 不明な数値は `確認中` / `TBC` と記録する。推定値で埋めない
