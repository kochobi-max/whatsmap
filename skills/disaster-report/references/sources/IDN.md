# 情報源プロファイル: インドネシア (IDN)

対象イベント: `EQ-2026-000150-IDN`（2026年8月15日 東ヌサトゥンガラ州 フローレス島沖地震 M7.7）

**この順に当たる。** ADRC加盟国であり、Sentinel Asia EO（BRIN要請・SA-00656）と
国際災害チャーターの両方が展開している案件。

---

## 1. BNPB — 主たる公式情報源

Badan Nasional Penanggulangan Bencana（国家防災庁）

- https://bnpb.go.id/
- Pusdalops（危機管理センター）の Laporan Situasi / Infografis に集計が出る

**報番号（`Laporan No. N`）と発表時刻を必ず控える。**

### 用語対応

| ID | JA | EN |
|----|-----|-----|
| meninggal dunia | 死者 | deaths |
| luka-luka / luka berat / luka ringan | 負傷者 / 重傷 / 軽傷 | injured / severe / minor |
| hilang | 行方不明 | missing |
| mengungsi / pengungsi | 避難者 | displaced / evacuees |
| terdampak | 被災者 | affected |
| rumah rusak berat / sedang / ringan | 住家 全壊 / 半壊 / 一部損壊 | heavily / moderately / lightly damaged |
| jiwa | 人 | persons |
| KK (kepala keluarga) | 世帯 | households |

> ⚠️ `rusak berat / sedang / ringan` の3区分を、日本式の「全壊/半壊/一部破損」に機械的に
> 対応させない。レポートには**原語の3区分のまま**載せ、注記で対応関係を示す。

## 2. BMKG — 地震・津波の技術情報

Badan Meteorologi, Klimatologi, dan Geofisika（気象気候地球物理庁）

- https://www.bmkg.go.id/

震源・マグニチュード・MMI震度・**津波警報の発表と解除**・余震回数。
日本の気象庁に相当。津波警報の発表／解除の時刻は時系列に必ず入れる。

## 3. BPBD（州・県レベル）

Badan Penanggulangan Bencana Daerah。東ヌサトゥンガラ州（NTT）BPBD。
**離島が多く中央集計への反映に時間差がある。**数値の急増は「新規被害」ではなく
「集計の到達」の可能性を疑う（§SKILL.md 数値急変ゲート）。

## 4. BRIN — Sentinel Asia EO の要請機関

Badan Riset dan Inovasi Nasional（国家研究革新庁）

本件では BRIN が Sentinel Asia 緊急観測を要請（EOR `SA-00656`）し、
**国際災害チャーターも展開**。ADRCは杉浦氏が対応し、GLIDE `EQ-2026-000150-IDN` を登録・連携済み。

- Sentinel Asia の個別災害ページ → `_global.md`
- EOR ダッシュボード: `https://optemis.sentinel-asia.org/`（要ログイン。所内の共有情報を使う）

## 5. 国際・報道

- ReliefWeb（UNOCHA / IFRC / PMI＝インドネシア赤十字）→ `_global.md`
- AHA Centre（ASEAN）Flash Update / Situation Update — **加盟国案件なので必ず確認**
- 報道: Kompas, Antara, Detik（ティア: media）

---

## 所内の一次情報

研究部の Bisri 氏（`mb-bisri@adrc.asia`）が現地情報を `kenkyubu@adrc.asia` に流している。
**所内メールの内容は公式値ではない**ためティアは参考扱いとし、必ず BNPB / BMKG で裏を取る。
ただし現地語ソースの所在を教えてくれるので、探索の起点として有用。

## 出典名の日英対訳表

| EN | JA |
|----|-----|
| BNPB | 国家防災庁 |
| BMKG | 気象気候地球物理庁 |
| BPBD | 地方防災局 |
| BRIN | 国家研究革新庁 |
| AHA Centre | ASEAN災害管理人道支援調整センター |
| PMI | インドネシア赤十字社 |

---

## 荒木田さんの日英併記版デッキ（2026-08-28 に受領）から取り込んだこと

`ADRC_EQ_IDN_Flores_20260815_BI.pptx`（20ページ・第2版）。別セッションで作られ、
`main` にも作業ブランチにも**プッシュされていなかった**。渡されて初めて存在を知った。
`find_prior_work.js` にも出ない類のもの（→ `environment.md`）。

取り込んだ内容と、**こちらが持っていた誤りの訂正**を並べる。

### 訂正したもの

| 項目 | 誤 | 正 |
|---|---|---|
| 津波の波高 | 「0.30〜1.61m を観測」 | **BMKG検潮所7地点で 0.14〜0.94m**。最大はマウロレ（エンデ県）0.94m。**1.61m は二次的な集約情報**で、BMKGのいずれの観測値も上回るため一次値として採用しない |
| 住家被害 | 73,818棟（1つの数値） | **2つの別の指標**。81,436棟「影響」（8/26）と 77,912棟「被害」（8/24データ確定、県別内訳を伴う）。**互換的に使わない** |
| 死者 | 100人（内訳なし） | 105人（8/26）。**直接48人・事後57人**。後者は Basarnas の捜索救助と医療機関の報告による |

### 数値が食い違っていて、まだ解けていないもの

**公共施設**の棟数が 8/24 と 8/26 で大きく違う（教育 1,378棟 → 658棟）。
どちらも BNPB で、減ることはないので**別の指標**のはず。BNPBは関係を公表していない。
**併記して日付を付し、次回への確認事項に載せた。**

### こちらが持っていて、BI版に無いもの

BI版は国際メカニズムについて「Sentinel Asia / 国際災害チャーターの発動は
公開ソースで確認できない」としている。**発動している。**

- センチネルアジア緊急観測要請 `article20260815ID.html`（要請者 BRIN、8月15日発動）
- 国際災害チャーター **Activation #1050**（8月15日 13:54 UTC+09:00、要請は「BRIN に代わって ADRC」）

スクリーンショットで確認済み。BI版の「確認できない」は、その資料が明記しているとおり
「アクセス可能な公開ソースに見当たらない」という意味であって、**発動していないことの証拠ではない。**
逆向きの誤読をしないこと。

### 出典の階層について、BI版に書かれていた定義

> 階層は情報の**出所**を示し、報じた媒体を示すものではない。政府発表を新聞が報じた場合は公式、
> 媒体独自の取材・観察は報道とする。公式値を下位ティアで上書きしない。
> 機関間または指標間で数値が異なる場合は、発表機関と日付を併記し、**合算・平均化しない。**

統一版の運用もこれに合わせる。

