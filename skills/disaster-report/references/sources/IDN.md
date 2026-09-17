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

  **クラウドからは読めない。参考扱いにしてある。** 2026-08-30 に許可リストへ
  追加してもらい、CONNECT トンネルは通るようになった（`CONNECT ... response 200`）が、
  その先の TLS で止まる。

  ```
  TLSv1.2 (OUT), TLS alert, unknown CA
  curl: (60) SSL certificate problem: unable to get local issuer certificate
  ```

  トンネル越しに提示される証明書の発行元が、こちらの CA 束で辿れない。
  **TLS の検証は外さない。** そもそも要ログインで機械からは読めないので、
  `check_sources.js` では「要ログイン」の印により参考扱いとし、
  届かなくても日次を止めないようにした（行に「要ログイン」と書いてあることが印になる）。

  ここから取りたい情報（緊急観測プロダクトの一覧）は
  `sentinel-asia.org`（到達可）と ReliefWeb 経由の UNOSAT 製品で代替する。

## 5. 国際・報道

- ReliefWeb（UNOCHA / IFRC / PMI＝インドネシア赤十字）→ `_global.md`
- AHA Centre（ASEAN）Flash Update / Situation Update — **加盟国案件なので必ず確認**

## 5-1. 現地語（インドネシア語）の国内報道 — 省略不可

**ここにしか出ない発表がある。** 2026-09-15、BNPB はオンライン記者会見で死者を
120 → 142人（直接死48＋避難所での間接死94）へ修正し、負傷を1,658 → 1,603人へ
修正した。保健省との合同検証によるもの。

このとき統一版は同じ会見から**避難者数（46,461人）と余震回数（15,722回）だけ**を
取り込み、**死者数を取り落とした。**ReliefWeb にも AHA Centre にも英語報道にも、
この時点では出ていない。インドネシア語の国内報道にだけ出ていた。

**「英語の国際情報源に出ていない」は「発表が無い」ではない。**

### 当たる媒体

| 媒体 | ドメイン | 位置づけ |
|---|---|---|
| Kompas | `www.kompas.com` / `nasional.kompas.com` | 全国紙。記者会見の逐語に近い |
| Tirto | `tirto.id` | 検証記事に強い。数値の内訳を書く |
| Republika | `news.republika.co.id` | 全国紙 |
| ANTARA（インドネシア語版） | `www.antaranews.com` | 国営通信。英語版より早く、詳しい |
| Detik | `news.detik.com` | 速報が早い |
| NU Online | `www.nu.or.id` | 支援・避難所の現場 |
| Okezone | `news.okezone.com` | 速報 |

**地方紙（NTT州）** — 県別の内訳や BPBD の値は中央集計より先にここへ出る。

`florespos.net` / `www.rakyatntt.id` / `floresa.co` / `kupang.tribunnews.com`

### 検索語

| ID | 意味 |
|---|---|
| `korban meninggal` | 死者 |
| `korban jiwa` | 犠牲者 |
| `korban luka` | 負傷者 |
| `pengungsi` | 避難者 |
| `rumah rusak` | 住家被害 |
| `gempa NTT` / `gempa Flores` | NTT地震／フローレス地震 |
| `konferensi pers BNPB` | BNPB記者会見 |
| `masa tanggap darurat` | 緊急対応期間 |
| `kematian tidak langsung` | 間接死 |

### 取り込み方

- **記者会見をひとつ拾ったら、その会見で出た数値を全項目ぶん拾う。**
  避難者だけ・余震だけ、という取り方をしない。取り落としはここで起きた
- ティアは**発表機関**に従う。BNPB発表を Kompas が報じた → `official`。
  経路（どの媒体で読んだか）は `src` に書く。ティアを下げると数値急変ゲートが毎日掛かる
- 数値が修正で**下がった**ときは「減少した」と書かない。**「修正された」**と書く
  （負傷1,658→1,603は遡及検証による修正であって、負傷者が減ったのではない）

### 2026-09-17 時点で読めない（ネットワークポリシーの許可リスト未登録）

上記のうち次は `curl: (56) CONNECT tunnel failed, response 403` で拒否される。
**サイト側の障害ではなく、こちら側のポリシー拒否である。**

```
tirto.id  news.republika.co.id  www.antaranews.com  www.nu.or.id
news.okezone.com  florespos.net  www.rakyatntt.id  floresa.co
kupang.tribunnews.com
```

許可リストへの追加を依頼してある。**追加されるまでは「変化なし」と報告しない。**
「現地語報道に到達できていない」と書く。

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

