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

---

## センチネルアジアの提供記録は、メールで届く

**どの機関がどの衛星で何を出したかは、OPTEMIS ではなくメールで読む。**

`info@sentinel-asia.org` から荒木田さん（`ma-arakida@adrc.asia`）宛に、
緊急観測要請の番号ごとに通知が来る。**これは OPTEMIS への掲載通知であって、
本文に中身が書いてある。** ダッシュボードにログインしなくても記録は取れる。

    [SA-00658-requested]  要請の受理
    [SA-00658-activated]  発動
    [SA-00658-DPN]        データ提供機関に選ばれた（要請元・災害種別・期限・SFTPパス）
    [SA-00658-DAN]        データ解析機関に選ばれた
    [SA-00658-message]    **提供・解析の記録。ここが本体**
    [SA-00658-updated]    要請内容の更新

`-message` の本文は「氏名・日時・メッセージ」の3列の表で、たとえばこう書かれている。

> TASA uploaded archive and observation data on 22 April 2026 and 28 August 2026.
> It also uploaded a value-added product derived from a Sentinel-2 prior image and
> a FORMOSAT-5 post image on 12 August 2026 and 28 August 2026.

> KGS has uploaded KazEOSAT-1 observation 2 images.
> 1) Observation date: August 23, 2026, 02:02 (UTC) …

**公開記事ページ（`sentinel-asia.org/EO/...`）には、この粒度は出ない。**
2026-08-30 時点で、公開ページからは分からなかったものが次のように取れた。

| イベント | 機関 | 内容 |
|---|---|---|
| SA-00658 ネパール | TASA | アーカイブ・観測（4/22, 8/28）、Sentinel-2＋FORMOSAT-5 の付加価値プロダクト |
| 同 | IWM | Planet 画像による付加価値プロダクト |
| SA-00656 インドネシア | JAXA（RESTEC経由） | ALOS-2/4 アーカイブ・観測（2020/5/30, 2021/3/6） |
| 同 | GIC-AIT | Sentinel-1（8/20・21・23観測）による付加価値プロダクト |
| 同 | KGS | KazEOSAT-1 観測画像2点（8/23 02:01・02:02 UTC） |

### 発生源の座標も、ここに出る

2026-08-27、ネパールの要請元（DHM の Joshan Maharjan 氏）が `-message` で
**氷雪崩の座標 28.295727N, 85.507802E** を示し、当初の観測対象範囲は
発生源が分からない段階で設定したものだと説明している。ADRC は同日 AOI を見直した。
**UNOSAT の図から目分量で読むより正確である。**

### 読み方

Superhuman の `list_threads` で `from: ["sentinel-asia.org"]` を引き、
`[SA-XXXXX-message]` の本文表を読む。イベントJSONの `satellite[]` に
機関・内容・日付を足す。

**OPTEMIS（`optemis.sentinel-asia.org`）は要ログインで、クラウドからは
TLS で止まる。参考扱いにしてあり、日次は止めない**（`check_sources.js`）。

