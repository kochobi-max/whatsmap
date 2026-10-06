---
name: "ldi-cms-report"
description: "ADRC最新災害情報（LDI）の日次CMS入力支援レポートを自動生成するスキル。「災害情報をADRCに登録したい」「LDIのCMSに入力したい」「最新災害情報のレポートを作って」「ADRCの被害情報を整理して」「今日の災害情報をまとめて」などのトリガーで必ず使う。スケジュールタスク（daily-global-disaster-report）として毎朝自動実行される。一次情報源から収集した最新被害データを、CMSの「レポート編集」フォームに直接コピー可能な形式のWord文書（.docx）として出力し、機械QAを通過したら塩見・吉田・児玉の3氏へメールを自動送信する。収集と生成は毎日行い、メールは更新があれば毎日、更新0件なら月曜・金曜のみ送る。あわせて大規模災害レポートへの昇格判定を行い、該当があれば起票メールを出す。突発災害に加え、モンスーン洪水・熱波・寒波・干ばつなど緩慢・累積型の自然災害を週次でReliefWebから定点スイープし（Step 1.6）、季節累計の死者が加盟国で10人（州・県単位を含む）に達した時点で単発災害と同じくGLIDE・LDIの登録対象とする。"
---

> ## このファイルの位置づけ（2026-10-06）
>
> **実際に毎朝読まれているのは、アカウントに同期されたスキルのほうである。**
> 定期タスク（Daily global disaster report）は Cowork 環境で動き、
> **このリポジトリを clone しない。** `sources` が空である。
>
> | どれ | 誰が読むか |
> |---|---|
> | アカウント同期スキル `ldi-cms-report/` | **毎朝の定期タスク。これが本物** |
> | Routineのプロンプト本文 | 古い SKILL.md の写しが貼られている。**手順の出所にしない** |
> | このリポジトリの `skills/ldi-cms-report/` | 版管理と作業用。**ここを直しても本番には届かない** |
>
> 2026-10-05、ここだけを直して「スキルを修正した」と報告した。**届いていなかった。**
> このファイルを直したら、**アカウントのスキルへアップロードするところまでが1件である。**
> `scripts/` も一緒に上げる（同期スキルはスクリプトを持てる。`disaster-report` は実際に持っている）。

# ADRC LDI 日次CMS入力支援レポート生成スキル

**目的**: CMS担当者が新しい情報をコピー&ペーストするだけで登録・更新できる状態にすること。
**大原則**: LDIにすでに掲載済みの情報をレポートに含めてはならない。確認作業を増やすことはこのスキルの目的に反する。

**チャットの言語**: このスキルの実行中、Claudeがチャット（会話）に書くコメントはすべて日本語で表記する。対象は進捗報告・要約・確認・判断や仮定の説明・最終メッセージ・PushNotification 本文など、Claude自身が会話欄に出力するテキスト全般。レポート本文（docx）と送信メールは従来どおり各Stepの言語規定（日本語＋英語の併記等）に従い、この規定はチャットのコメントだけに適用する。（ユーザー決定・2026-10-01）

---

## 📁 共有フォルダ（保存先・メールで案内するリンク）

- **ローカル同期パス**（保存先。Cowork で書き込む場所）: `C:\Users\arakida\OneDrive - adrc.asia\LatestDisasterInfo\`
- **共有リンク**（メール本文で担当者に案内するURL。プレーンな "LatestDisasterInfo" 表記やローカルパスは使わない）:
  `https://adrcasia-my.sharepoint.com/:f:/g/personal/ma-arakida_adrc_asia/IgApZdWs6mYsTqbrqX2qXGSrAe1jLpKVlBg8Gr2ipeuJzow?e=KE0OJp`
- セッションでローカル同期パスが未接続の場合は `request_cowork_directory` でこのパスをマウントしてから保存する。（ユーザー決定・2026-08-28）

---

## ⚡ 省略不可のゲート（6つ）

| ゲート | 出力すべき内容 | 欠けると |
|--------|-------------|---------|
| Step 1完了時 | LDI最新Reportエントリ日付を含むトラッキング表（**一覧上位10件＋アーカイブ検索で直近120日にPeriodがある全Key**） | Step 3.5が実施不能／**Periodの古い長期イベントが一覧から落ちて更新されない（2026-09-30に判明：パキスタン洪水2858が7/21のまま）** |
| **Step 1.6（緩慢・累積型スイープ）** | 加盟国×季節ハザードのReliefWeb定点スイープを行い、季節通算の被害数値と判定を記録した表（週次＋GDACS空欄イベント確認時） | **緩慢・累積型災害の取りこぼし（2026-09-28に実際に発生：パキスタン・モンスーン洪水の累計死者100名超を見落とし、GLIDE発行が9/28まで遅延。登録基準の死者10人はさらに早い時点で超えていた）** |
| **Step 4実施前（EOメール）** | センチネルアジアのGmailラベルを**最後まで**読み、直近45日の全EOR通知（requested/activated/updated/ended）を列挙し、ADRC LDIと突合した表 | **EO発動災害の取りこぼし（2026-09-15に実際に発生：中部ベトナム洪水SA-00660を公開ページ未掲載のため見落とした）** |
| Step 3.5実施前 | 全Keyについて `view_disaster_en.php?Key=XXXX` を個別に開き、Report/Articles最新ソースを直接確認 | LDI掲載済みを見落とす |
| Step 3.5完了時 | スキップ判定結果表（全件・全列埋め） | Step 4以降に進めない |
| **Step 8（送信前）** | **`report-qa` の判定。FAIL が1件でもあればメールを送らない** | **誤った内容が担当者に届き、CMSへ登録される** |

## 自律度

**L3**（生成・QA・送信まで自動。例外時のみ人を呼ぶ）

| 人が止まる点 | 理由 |
|-------------|------|
| QA WARN の可否判断 | 文字数逸脱・「確認中」残存は意図的な場合がある |
| 登録基準の境界（死者9人など） | 惜しい案件を落とすか拾うかは編集判断 |
| 昇格候補の承認（Step 5.5） | レポート開始は組織の資源配分の判断 |
| CMSへの実登録 | 対外公開DBであり、誤登録は取り消しが効かない |

**送信の頻度**: 収集・判定・生成・QAは毎日。メールは「更新があれば毎日／更新0件なら月・金のみ」。

---

## 除外ルール（レポートに含めない条件）

以下に該当する災害はレポートから**除外**する。

| 除外条件 | 理由 |
|---------|------|
| Step 3.5 判定が **SKIP** | LDIにすでに掲載済みの内容のため担当者作業不要 |
| Step 5 判定が **BELOW**（全基準未達） | 登録・更新が不要 |
| Sentinel Asia EO 発動のみで**死傷者・被災者数がゼロまたは未確認** | 被害規模不明で登録時期尚早 |

---

## 余震の扱い

**余震は本震エントリの「内容」欄に追記し、独立エントリとしない。**

- GDACS / Step 1.5 で余震が発見された場合：震源・M・GDACS eventid を本震エントリの内容に 1 文で付加する
- ADRC LDI リストに余震が**別 Key として独立掲載**されている場合のみ、独立エントリとして扱う

---

## ワークフロー

### Step 1: ADRCリスト取得

ADRC LDIは WebFetch だと robots.txt で拒否されるため、**組み込みブラウザ（または Chrome MCP）で開く**。
`https://www.adrc.asia/latest/` に navigate し、以下の **1-A と 1-B の両方**で対象Keyを集める。

> 📝 `scripts/fetch_adrc.js` は 2026-10-06 に書いた。**インライン JS の代わりに使える。**
> 全Keyの Report/Articles を**全文**返し、取り出せないKeyを `extract: "FAIL"` として
> 名指しする（黙って縮めない）。**ブラウザの中で動かす**（`javascript_tool`）。
> `www.adrc.asia` は中間証明書を添えないため、curl / node fetch では
> `TLS alert, unknown CA` で落ちる（CONNECT は 200。ポリシー拒否ではない。検証は外さない）。
>
> **ただし DOM依存部分は実機で未検証である。** jsdom の疑似ページでしか確かめていない。
> 初回は `failures` が出る前提で動かし、出たKeyの構造を見て
> `SECTION_HEADINGS` / `parseReports` を直すこと。
> うまく動かないうちは、以下のインライン JS をそのまま使ってよい。

#### 1-A. 一覧ページ上位10件（直近発生分）

`/latest/` 上のリンクから Key と NationCode を抜く:
```js
Array.from(document.querySelectorAll('a')).filter(a=>a.href.includes('view_disaster'))
  .map(a=>({key:(a.href.match(/Key=(\d+)/)||[])[1], nation:(a.href.match(/NationCode=(\d+)/)||[])[1], text:a.textContent.trim()}))
```

#### 1-B. アーカイブ検索で長期継続イベントを拾う（必須・省略不可）

**一覧 `/latest/` は Period（発生日）降順の上位10件しか出さない。** 6〜7月に始まったモンスーン洪水のように
Periodが古い長期イベントは、登録済みでも一覧から落ち、日次チェックの対象外になる。
（2026-09-30に判明：パキスタン洪水 Key 2858（Period 2026/07/06）が一覧外に落ち、LDIの最新エントリは
IFRC 7/21「死者47人」のまま、NDMA累計は9/3時点で死者180人に達していた。）

`/latest_disaster.php` は GET 検索フォームである。**直近120日にPeriodがある全エントリ**を取得し、1-A と合わせる:
```js
const d0 = new Date(Date.now()-120*864e5).toISOString().slice(0,10).replace(/-/g,'%2F');
const t = await (await fetch(`/latest_disaster.php?duration_start=${d0}&duration_end=2099%2F12%2F31&per_page=100`,{credentials:'include'})).text();
const doc = new DOMParser().parseFromString(t,'text/html');
Array.from(doc.querySelectorAll('a')).filter(a=>/view_disaster/.test(a.getAttribute('href')||''))
  .map(a=>({key:(a.getAttribute('href').match(/Key=(\d+)/)||[])[1], nation:(a.getAttribute('href').match(/NationCode=(\d+)/)||[])[1], text:a.textContent.trim()}))
```
国別に絞る場合は `country%5B%5D=<NationCode>`（例: Pakistan=586, Bangladesh=50）、ハザード別は
`event%5B%5D=<id>`（例: Flood 等。フォームの option 値を参照）を付ける。Step 1.5／1.6 の「LDI未登録確認」にもこの検索を使う。

#### 1-C. 各Keyの詳細ページ取得

各詳細ページは `/view_disaster_en.php?NationCode=XXX&Lang=en&Key=XXXX`（サイトルート直下）。
`fetch(u,{credentials:'include'})` で並列取得し、本文中 `GLIDE` 以降の約1,400字（GLIDE・Period・Outline・
Report/Articles の最新エントリ）を返す。出力にクエリ文字列付きURLが含まれるとブロックされることがあるため、
返す前にURLを除去する。GLIDE位置で切り出せないページ（ナビ部分が返る）は `Period` 位置で切り出し直す。

> ⚠️ **ここでの要約は一次スクリーニングに過ぎない。** Step 3.5 では全Keyの個別ページの
> Report/Articles を改めて読むこと（後述の必須手順）。要約だけで最終判定してはならない。

完了時に出力するトラッキング表:

| # | 災害名 | Key | LDI最新Reportエントリ日付 | 最新エントリ冒頭（50字） | GLIDE |
|---|--------|-----|------------------------|----------------------|-------|
| 1 | フィリピン地震 | 2821 | 2026/06/27 | NDRRMC: 94 deaths, 1,300 injured... | EQ-2026-000083-PHL |

> `LDI最新Reportエントリ日付`が「取得不可」2件以上 → スクリプトが正しく動いていない。Step 1を再実施すること。

取得した各災害に `"discoverySource": "ADRC LDI"` を付与する。

---

### Step 1.5: ADRCリスト外の追加災害発見（GDACSおよびGLIDE）

2ルートで追加発見。**発見後、必ずADRC LDIに未登録であることを確認してから「新規」扱いにする。**

**ルート A（GDACS Orange/Red）**:
```
https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH
  ?eventtype={EQ|TC|FL|VO|TS|DR}&fromDate=60日前&toDate=今日&alertlevel=Orange
```
Red → 必ず調査 / Orange → 登録基準を確認。

> ⚠️ **GDACS API の eventtype フィルタは効かないことがある**（洪水・森林火災・広域ドラウトの集計値が
> EQ 検索にも混入する）。`severitydata.severity` を死者数と誤読しないこと。名称・国・日付で実イベントを
> 選別し、疑わしいものは個別に web 確認する。

**ADRC LDI未登録確認（必須）**: GLIDEまたはGDACS eventidでADRC LDIリストを確認し、
すでにKeyが存在する場合は `"discoverySource": "ADRC LDI"` に変更してStep 3.5で通常判定する。
LDI一覧の表示件数が10件に限られる場合でも、GLIDE番号検索で登録済みを見落とさないこと。
LDIにKeyが存在しないことが確認できた場合のみ `"discoverySource": "GDACS Alert"` として新規扱いにする。

**ルート B（GLIDE）** — 過去30日の新規番号を検索:
```
https://glidenumber.net/glide/public/search/search.jsp
```
同様にADRC LDI未登録を確認してから `"discoverySource": "GLIDE"` を付与。

> ⚠️ **GDACSの長期・空欄イベントを機械的に脇に置かない。** 加盟国の洪水（FL）・干ばつ（DR）で、
> 数週間以上続く長期イベントや、死者数フィールドが空のイベントは「無視」ではなく
> **「Step 1.6でReliefWeb要確認」に回す**。GDACSのOrange/Redは突発・単発災害に強い一方、
> モンスーン洪水など緩慢・累積型は死者数が空のまま長期表示され、見落としやすい
> （2026-09-28のパキスタン取りこぼしの主因）。

---

### 🐢 Step 1.6: 緩慢・累積型災害の定点スイープ（BLOCKING CHECKPOINT）

**GDACS Orange/Red・Sentinel Asia EOR・報道の3経路はいずれも突発・単発・高可視性の災害に偏る。**
モンスーン洪水・熱波・寒波・干ばつのような**緩慢／季節累積型**は、各国防災機関が
「季節通算」でまとめて発表し、目立つ英語報道も出ないため、上記3経路をすり抜ける。
これを能動的に拾うための定点スイープを行う。

> **なぜ必要か**: 2026-09-28、パキスタンのモンスーン洪水（6月下旬〜、8月下旬時点で累計死者160名超）を
> 日次監視が拾えず、塩見氏が気づいて9/28にGLIDE発行に至った。NDMAの累計データは
> **ReliefWebに載っていた**（"NDMA Pakistan – Monsoon 2026 Daily Situation Report No.57 – 21 Aug 2026"）
> にもかかわらず、ワークフローが既知イベントの確認にしかReliefWebを使わず、
> **加盟国ごとの季節累計を能動的にスイープしていなかった**のが原因。

#### 実施頻度

- **毎週1回（月曜の定期実行時）に必ず実施**。毎日全加盟国を深掘りするのは費用対効果が悪く
  アラート疲れを招くため、週次スイープを基本とする。
- **加えて曜日を問わず**、Step 1.5 のGDACSで「加盟国の洪水・干ばつ」で死者数が空欄／長期継続の
  イベントを見つけたら、その国はその日のうちに本スイープの手順で確認する。

#### 手順

> ⚠️ **ReliefWeb API は使用不可（2026-09-30確認）。** v1 は廃止（HTTP 410）、v2 は 2025-11-01 以降
> **事前承認済み appname が必須**で、旧 `appname=adrc-ldi` は `AccessDeniedHttpException` で拒否される。
> また cloud 側の WebFetch は `reliefweb.int` / `api.reliefweb.int` とも 403。
> → **ReliefWeb公式サイトを組み込みブラウザで読む**のが現行手順（承認appname取得後の切替は末尾の注記参照）。

1. **ReliefWebサイトを国＋ハザードでスイープ（検知）**。組み込みブラウザで次を開く:
   ```
   https://reliefweb.int/updates?view=reports&search=<Country>%20<hazard>
   ```
   - 検索語は **国名＋1語の2語だけ**にする（例: `Pakistan monsoon` / `India flood` / `Bangladesh flood` /
     `Nepal flood` / `Sri Lanka flood` / `Myanmar flood` / `India heatwave` / `Mongolia dzud`）。
     3語以上は全語ANDになり、`Pakistan monsoon NDMA` のように0件になる（実測）。
   - 一覧の抽出（`javascript_tool`）:
     ```js
     Array.from(document.querySelectorAll('main article')).slice(0,8).map(a=>{
       const h=a.querySelector('h3 a')||a.querySelector('a[href*="/report/"]');
       const dd=Array.from(a.querySelectorAll('dt,dd')).map(x=>x.textContent.trim());
       const g=k=>{const i=dd.indexOf(k);return i>=0?dd[i+1]:''};
       return {title:h&&h.textContent.trim(), path:h&&new URL(h.href).pathname,
               source:g('Source'), orig:g('Originally published'), format:g('Format')};})
     ```
   - **検知の判定材料はこの一覧で足りる**：直近30日に「Daily/Seasonal Situation Report」「Monsoon 20XX」
     「DREF」等の連番・継続レポートが出ていれば、その国・ハザードは**季節累計を確認すべき対象**である。
     2026-09-28のパキスタン取りこぼしは、この「連番SitRepが続いている」事実を見ていれば防げた。

2. **累計数値の読み取り（HTML本文を優先）**。
   - 各レポートの本文は同一オリジンで取れる:
     ```js
     const t=await (await fetch('<path>')).text();
     const d=new DOMParser().parseFromString(t,'text/html');
     (d.querySelector('main article')||d.body).textContent.replace(/\s+/g,' ').slice(0,1500)
     ```
   - **IFRC（DREF/Emergency Appeal）・OCHA・WHO・ECHO Flash 等は本文HTMLに累計値を書くことが多い**
     （IFRC DREF/Appeal の本文には、各国防災機関の累計死者・被災者数が発表日つきで引用されることが多い。）
   - **政府SitRepのPDF添付は、原則ブラウザ内でテキスト化して読む。**
     > ⚠️ 2026-09-30の訂正：NDMA Pakistan SitRep No.95 を「画像PDFで読めない」と判断したのは誤りだった。
     > 実際は Word 出力のテキストPDFで、Annex A（死傷者・家屋被害の表）は **CIDフォント（Type0）の16進グリフ**で
     > 書かれており、各フォントの ToUnicode 表で復号すれば読める。画像なのは Annex B〜E（ダム・河川・雨量）のみ。
     > 誤判定の原因は、(1) stream末尾のCR/LFを残したままinflateして全ストリームが失敗、(2) `(…)Tj` だけを拾い
     > `<…>` 形式を無視した自作パーサ、の2点。
     - 取得経路の制約（2026-09-30実測）：cloud WebFetch は reliefweb.int が403、cloud・PC双方のシェルは
       組織のネットワーク許可リストで ndma.gov.pk / reliefweb.int への接続が拒否、組み込みブラウザはPDFを開けず
       （ダウンロード扱い）、サイトのCSPで pdf.js も読めない。**使えるのは、reliefweb.int のページ上で同一オリジン
       fetch した PDF バイト列をJSで解析する方法だけ**である。
     - 手順：該当レポートページを組み込みブラウザで開き、添付PDFのURL（`a[href$=".pdf"]`）を取得して、
       次のスクリプトの `PDF_URL` を差し替えて `javascript_tool` で実行する（戻り値＝ページごとのテキスト配列）。
       NDMA SitRep では「Cumulative Casualties and Injuries - (From 26 June … to …)」直後の
       `Grand Total <男> <女> <子> <死者計> <男> <女> <子> <負傷計>` が累計値。
       ```js
     // ReliefWeb添付PDFをブラウザ内でテキスト化する（同一オリジン reliefweb.int のページ上で javascript_tool 実行）
     // 使い方: PDF_URL を差し替えて実行。戻り値はページごとのテキスト配列。
     const PDF_URL = 'https://reliefweb.int/attachments/XXXX/YYYY.pdf';
     const u8 = new Uint8Array(await (await fetch(PDF_URL)).arrayBuffer());
     const bin = new TextDecoder('latin1').decode(u8);
     const inflate = async (bytes) => { const ds = new DecompressionStream('deflate'); const w = ds.writable.getWriter();
       w.write(bytes).catch(()=>{}); w.close().catch(()=>{}); const rd = ds.readable.getReader(); const ch = []; let n = 0;
       try { while (true) { const { done, value } = await rd.read(); if (done) break; ch.push(value); n += value.length; } } catch (e) {}
       const o = new Uint8Array(n); let p = 0; for (const c of ch) { o.set(c, p); p += c.length; } return new TextDecoder('latin1').decode(o); };
     // 1) 全オブジェクト（ObjStm内も）を展開。stream末尾のCR/LFは除去してから inflate（これを怠ると全失敗する）
     const objs = {}; const re = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g; let m;
     while ((m = re.exec(bin))) { const body = m[2]; const si = body.indexOf('stream'); const dict = si >= 0 ? body.slice(0, si) : body; let stream = null;
       if (si >= 0) { let s = m.index + m[0].indexOf('stream') + 6; if (bin[s] == '\r') s++; if (bin[s] == '\n') s++;
         let e = bin.indexOf('endstream', s); while (e > s && (bin[e-1] == '\n' || bin[e-1] == '\r')) e--;
         stream = /FlateDecode/.test(dict) && !/\/Subtype\s*\/Image/.test(dict) ? await inflate(u8.slice(s, e)) : null; }
       objs[+m[1]] = { dict, stream }; }
     for (const o of Object.values(objs)) if (/\/Type\s*\/ObjStm/.test(o.dict) && o.stream) {
       const n = +o.dict.match(/\/N\s+(\d+)/)[1], first = +o.dict.match(/\/First\s+(\d+)/)[1];
       const h = o.stream.slice(0, first).trim().split(/\s+/).map(Number);
       for (let i = 0; i < n; i++) { const id = h[2*i], off = h[2*i+1], nx = i+1 < n ? h[2*i+3] : o.stream.length - first;
         if (!objs[id]) objs[id] = { dict: o.stream.slice(first + off, first + nx), stream: null }; } }
     // 2) ToUnicode CMap（CIDフォントの16進グリフ→文字）
     const cm = {}; const cmap = (id) => { if (cm[id]) return cm[id]; const t = objs[id]?.stream || ''; const mp = {}; let x;
       for (const b of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) { const r = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g; while ((x = r.exec(b[1]))) mp[parseInt(x[1],16)] = x[2]; }
       for (const b of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) { const r = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g;
         while ((x = r.exec(b[1]))) { const a = parseInt(x[1],16), z = parseInt(x[2],16);
           if (x[4]) { const base = parseInt(x[4],16); for (let c = a; c <= z; c++) mp[c] = (base + c - a).toString(16).padStart(4,'0'); }
           else (x[5].match(/<([0-9A-Fa-f]+)>/g) || []).forEach((hh, i) => mp[a+i] = hh.slice(1,-1)); } }
       return cm[id] = mp; };
     const uni = (h) => { let s = ''; for (let i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i+4), 16)); return s; };
     const sub = (s, key) => { const i = s.indexOf('/' + key); if (i < 0) return ''; const r = s.slice(i + key.length + 1).trim();
       if (/^\d+\s+0\s+R/.test(r)) return objs[+r.match(/^(\d+)/)[1]]?.dict || ''; let j = s.indexOf('<<', i), d = 0, k = j;
       for (; k < s.length; k++) { if (s.startsWith('<<', k)) { d++; k++; } else if (s.startsWith('>>', k)) { d--; k++; if (!d) break; } } return s.slice(j, k+1); };
     // 3) ページごとにフォントを解決して TJ/Tj を復号
     const pages = Object.entries(objs).filter(([, o]) => /\/Type\s*\/Page[^s]/.test(o.dict)).sort((a, b) => +a[0] - +b[0]);
     pages.map(([, p]) => {
       const fonts = {}; for (const f of sub(sub(p.dict, 'Resources'), 'Font').matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g)) {
         const fd = objs[+f[2]]?.dict || ''; const tu = fd.match(/\/ToUnicode\s+(\d+)\s+0\s+R/); fonts[f[1]] = { map: tu ? cmap(+tu[1]) : null, two: /Type0/.test(fd) }; }
       const c1 = p.dict.match(/\/Contents\s+(\d+)\s+0\s+R/), ca = p.dict.match(/\/Contents\s*\[([^\]]*)\]/);
       const ids = c1 ? [+c1[1]] : ca ? [...ca[1].matchAll(/(\d+)\s+0\s+R/g)].map(v => +v[1]) : [];
       const content = ids.map(i => objs[i]?.stream || '').join('\n'); let cur = null, txt = '';
       const dh = (h) => { const f = fonts[cur] || {}; if (!f.map) return ''; const st = f.two ? 4 : 2; let s = '';
         for (let i = 0; i < h.length; i += st) { const v = f.map[parseInt(h.slice(i, i+st), 16)]; if (v) s += uni(v); } return s; };
       const tok = /\/(\w+)\s+[\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9A-Fa-f]*)>\s*Tj|\(((?:[^()\\]|\\.)*)\)\s*Tj|\b(ET|T\*|Td|TD)\b/g; let t;
       while ((t = tok.exec(content))) { if (t[1]) cur = t[1];
         else if (t[2] !== undefined) { for (const q of t[2].matchAll(/<([0-9A-Fa-f]*)>|\(((?:[^()\\]|\\.)*)\)|(-?\d+\.?\d*)/g)) {
             if (q[1] !== undefined) txt += dh(q[1]); else if (q[2] !== undefined) txt += q[2]; else if (+q[3] < -200) txt += ' '; } }
         else if (t[3] !== undefined) txt += dh(t[3]); else if (t[4] !== undefined) txt += t[4]; else txt += ' '; }
       return txt.replace(/\s+/g, ' ').trim(); });
       ```
     - 本文が空のページは画像（地図・表の画像）である。数値が画像側にしかない場合は、画像を canvas に描画して
       組み込みブラウザの screenshot で読む（DCTDecode は JPEG として `createImageBitmap`、FlateDecode・DeviceRGB は
       inflate後 `ImageData` に展開）。**「画像だから読めない」とは判断しない。**
     - 上記がいずれも失敗した場合に限り、HTML本文レポートまたは報道（検索語例: `<Country> monsoon death toll since <開始日> NDMA`）で
       **発表機関名＋as-of日付が明記された累計値**を採り、メールに「一次資料未確認・報道値」と明記する。
   - どの経路でも累計値が取れなければ、スイープ表に「数値未取得（理由）」と記録し、
     日次メールの「緩慢・累積型」欄に**要人確認**として1行載せる（黙って落とさない）。

3. **LDI登録状況の確認**は Step 1-B のアーカイブ検索（`country%5B%5D=` / `event%5B%5D=`）で行う。
   **登録済みでも最新エントリが古い場合**（例: 2858 パキスタン洪水が7/21のまま）は、新規ではなく
   **既存Keyの更新候補として Step 3.5 の通常判定に回す**。

4. ReliefWebで拾えない場合は各国防災機関サイトの季節報を直接確認する。

#### 監視対象リスト（加盟国 × 季節ハザード）

| ハザード | 時期の目安 | 主な監視対象国（一次ソース例） |
|---------|-----------|------------------------------|
| モンスーン洪水 | 6–10月 | パキスタン(NDMA)・インド(NDMA/SDMA)・バングラデシュ(DDM)・ネパール(NDRRMA)・スリランカ(DMC)・ミャンマー | 
| 熱波 | 4–6月 | インド・パキスタン・バングラデシュ |
| 寒波・ゾド | 12–2月 | モンゴル・アフガニスタン・ネパール |
| 干ばつ | 数か月継続 | 随時（報告のある国） |

> フィリピン・ベトナム・インドネシア・中国は台風・地震で常時Step 1.5に上がるため、本スイープは
> 上表の「単発イベントとして出にくい」ハザードを主対象とする。

> 🚫 **対象外：感染症・伝染病**（デング熱、COVID-19、はしか、インフルエンザ、コレラ等）。ADRC LDIは
> 感染症を対象としないため、スイープ・登録判定のいずれにも含めない（ユーザー決定・2026-09-30）。
> ReliefWeb検索やGDACS、LDI検索フォームのイベント種別に「Epidemic」が現れても集計しない。

#### 登録判定（季節累計）

**季節累計にも単発イベントと同じ登録基準を適用する。** 加盟国では季節累計の死者が10人に達した時点で
GLIDE・LDIの登録対象とする（塩見氏の指摘を受けたユーザー決定・2026-09-30）。
死者100人はお悔み状を検討する目安であり、登録の線ではない。

| 季節累計の状況 | 判定 |
|--------------|------|
| 加盟国：累計死者 **10人以上**（国全体、または**特定の州・県で10人以上**） | **含める**（Step 5でREGISTER。未登録なら新規災害としてStep 3.5「Keyなし」の要領、登録済みなら既存Keyの更新候補） |
| 日本：累計死者 **5人以上** | **含める**（単発の日本基準に準じる） |
| 非加盟国：累計死者 **100人以上** | **含める**（単発の「その他」基準に準じる） |
| 上記未満 | 記録のみ（スイープ表に残す） |

- **州・県単位で判定する。** 各国防災機関が州別の内訳を出している場合は、国全体の合計が10人未満でも、
  いずれかの州・県で10人に達した時点で登録対象とする。スイープ表には国全体の累計と、最大の州・県の累計を併記する。
- 加盟国で季節累計の死者が**100人以上**になった場合は、登録とは別に、日次メールに
  「お悔み状検討の目安（100人）超」と1行記す。お悔み状を出すかどうかは人が判断する。
- 新規扱いにする前に、**必ず Step 1-B のアーカイブ検索でADRC LDI未登録であることを確認**する。
- 狙いは**季節中のタイムリーな検知**。10人に達した時点で登録するのが原則で、100人まで待たない。
  各国防災機関が「被害落ち着き／終息」と記載した後の遡及登録が目的ではない。
  終息済みで登録時期を逸した場合は、その旨をメールに記して人の判断に委ねる。
- 閾値が単発と同じ水準になったため、通常のモンスーン季には多くの国が該当しうる。
  同じ国・同じ季節は1件のGLIDE・LDIエントリとして扱い、以後は累計値の更新として処理する（重複登録しない）。

#### スイープ結果表（必須出力）

```
## Step 1.6 緩慢・累積型スイープ結果（対象週: YYYY-MM-DD）

| 国 | ハザード | 最新ソース・日付 | 季節累計（国全体） | 最大の州・県 | ADRC LDI | 判定 |
|----|---------|----------------|------------------|------------|----------|------|
| <国> | モンスーン洪水 | <機関> SitRep #NN MM/DD | 死者XX | <州・県> 死者YY | 未登録／Key NNNN（最新MM/DD） | 含める（10人以上）／お悔み状目安（100人）超なら併記 |
| <国> | 熱波 | <機関> MM/DD | 死者X | <州・県> 死者Y | 未登録 | 記録のみ（国全体・州県とも10人未満） |

スイープ実施: 有/無（無の場合は理由）  ／  含める: X件  ／  お悔み状目安（100人）超: Y件  ／  数値未取得（要人確認）: Z件
```

#### 承認済み appname を取得した後の切替（将来手順）

ReliefWeb API v2 の appname は申請制（フォーム申請→ReliefWebがメールで承認。命名は「組織名＋用途＋ランダム文字」）。
承認後は、**手順1の一覧取得だけ**を API に置き換えてよい（国・日付・ソースで構造化フィルタでき、サイトのHTML改装に強い）:
```js
// 組み込みブラウザの javascript_tool から呼ぶ（api.reliefweb.int は CORS 許可。cloud WebFetch は 403）
const APP='<承認済みappname>';
const body={query:{value:'<Country> <hazard>'}, sort:['date:desc'], limit:8,
  fields:{include:['title','date.original','source.shortname','url_alias']}};
await (await fetch(`https://api.reliefweb.int/v2/reports?appname=${APP}`,
  {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
```
- appname はスキル本文にハードコードせず、このセクションに1か所だけ記載して差し替える。
- API化しても添付PDFの中身は返らない（APIは本文要約と添付URLのみ）。PDFの読み取りは手順2の方法をそのまま使う。
- API が 4xx を返した日はサイト手順（手順1）へ自動で戻り、その旨をメール末尾に1行記す。

---

### Step 3: 一次情報源調査

**まず、前回までに使った記事を確認する。**

```bash
python "$SKILL_DIR/scripts/ldi_state.py" --dir "<マウントしたLatestDisasterInfo>" --show
```

> 📝 **`$SKILL_DIR` はこのスキルを読み込んだときに表示される「Base directory for this skill」である。**
> 定期タスクはリポジトリを clone しないので、`skills/ldi-cms-report/...` という書き方では見つからない
> （2026-10-06 修正）。`report-qa` は同じ親フォルダにある隣のスキルなので `$SKILL_DIR/../report-qa/` で届く。

**台帳は docx と同じフォルダに置く。**
スキルのフォルダに書いても次の朝には残らない（毎回アカウントから配られるものなので）。
残るのは `C:\Users\arakida\OneDrive - adrc.asia\LatestDisasterInfo\` だけである。
`--dir` を省くとこのパスを自動で探し、見つからなければ
**「この場所は残らない」と警告を出す。**

定期タスクは毎回まっさらなセッションで始まるので、前日の記憶が残らない。
この台帳が無いと毎朝同じ記事を読み直す。

- 台帳にある記事（同じURL）は**読み直さない。**より新しい記事を探すほうに時間を使う
- `STATUS: EMPTY` なら**その日はすべて読む**（「前回と同じ」と判断できない）
- **これは Step 3.5 の代わりではない。** LDI個別ページの確認は毎回・全Key・省略不可

各災害の最新被害数値を収集し、**sourceDate（情報源の日付）とsourceURL（情報源のURL）を必ず記録する**。

優先順: ReliefWeb（**サイトを組み込みブラウザで**。APIは不可、Step 1.6参照） → ADINet（ASEAN） → USGS（地震）
→ FDMA（日本・最新報 PDF）→ 各国防災機関 → 報道（発表機関名とas-of日付が明記されたもの）
経路・到達可否・罠は **`references/sources.md`**（2026-10-06 作成）。**定期タスク（Cowork）のシェルは外部へ一切出られない**（2026-10-06 実測、同 §2-A）。ReliefWeb・ADRC・GDACS はブラウザで読む。

> 💡 **取得経路の実測メモ（2026-09-30）**
> - FDMA の被害報PDF（`fdma.go.jp/disaster/info/items/...pdf`）は WebFetch で読める。最新報番号は
>   `https://www.fdma.go.jp/disaster/info/` の一覧で確認する（1日に複数報出るため報番号で照合）。
> - 内閣府 `bousai.go.jp/updates/.../pdf/` は消防庁より更新が遅れることがある。新しい方を採る。
> - ReliefWeb（サイト・添付PDFとも）と ADRC は WebFetch 不可（403 / robots）。ブラウザで読む。
> - 組織のネットワーク許可リストに `reliefweb.int` と `ndma.gov.pk` が追加されれば、PCシェルで `curl` → `pdftotext`
>   （PCに導入済み）で読める。その場合はブラウザ内解析より優先する。
> - タイ DDPM の数値は Nation Thailand 等の報道が DDPM 発表時刻つきで転載する（URL1に使える）。

**sourceURLの扱い（重要）**: 今回参照した記事・報告書のURLをそのままdocxのURL1として使用する。
前日・前回レポートに掲載されていたURLを引き継いではならない。
URL1は「今回の情報源」を示すものであり、「以前のレポートのURL」ではない。

**日本の避難者**: 実避難者（避難所滞在者）のみ判定に使用。避難指示等対象者は参考値のみ。
不明な数値は `確認中`/`TBC` と記録する（Step 3.5 で「含める」扱いになる）。

---

### 🚨 Step 3.5: スキップ判定（BLOCKING CHECKPOINT）

**この判定表を出力するまで Step 4 に進んではならない。毎回・省略不可。**

スキップ判定の目的は「担当者がすでにCMSに入力済みの情報を再度確認する手間をなくすこと」。
日付が近くても内容が同じであればスキップ、日付が新しくても内容が同じであればスキップ。

> ⚠️ **LDI一覧ページ（`/latest/`）に表示される日付は「災害発生日（Period）」であり、「LDI最終更新日」ではない。**
> スキップ判定にはこの日付を使用してはならない。必ず個別ページ（`view_disaster_en.php?Key=XXXX`）の
> Report/Articles セクションを直接確認し、最新エントリの日付・内容を読むこと。

#### 判定手順（ADRC LDI登録済み災害・Key番号あり）

各エントリについて以下を順番に実施する:

1. **【必須】各Keyについて `view_disaster_en.php?Key=XXXX` を個別に開き**（`navigate` → `get_page_text`。
   javascript_tool でクエリ文字列がブロックされない場合は fetch でも可）、
   **Report/Articles セクションの最新ソース名・日付・本文を必ず読む。**
   一覧ページ(`/latest/`)の日付や Step 1 の要約だけで判定してはならない。
   このLDI個別ページ確認は全Key・省略不可。
2. 最新エントリの**ソース名・日付**と**本文冒頭**を読む
3. 今回収集した一次情報源の日付・内容と照合する

| 条件 | 判定 |
|------|------|
| LDI最新エントリ日付 >= sourceDate かつ 同内容 | **SKIP** |
| LDI最新エントリ本文に今回の主要数値（死者数・負傷者数・被災者数）がすでに記載 | **SKIP** |
| sourceDateがLDI最新エントリ日付より**真に新しく**、かつ本文にない新情報がある | **含める** |
| sourceDate または LDI日付が不明 | **含める**（安全側） |

> **同日の場合**: sourceDate = LDI最新エントリ日付であっても、本文を確認すること。
> 同じソース・同じ数値がすでに入力されていれば SKIP。

#### 判定手順（Step 1.5発見の新規災害・Keyなし）

- Step 1.5でLDI未登録を確認済み → **含める**（除外ルール適用後）
- 被害未確認（死傷者ゼロ・TBC）→ 除外ルールにより除外

#### Sentinel Asia EO発動中の扱い

- ADRC LDI登録済み → **通常判定を適用**（EO発動であっても判定を免除しない）
- ADRC LDI未登録 → 含める（被害確認済みの場合のみ）

#### 判定結果表（必須出力）

```
## Step 3.5 スキップ判定結果

| # | 災害名 | LDI最新エントリ（ソース・日付・冒頭） | 一次情報源（日付・内容） | 判定 | 根拠 |
|---|--------|--------------------------------|----------------------|------|------|
| 1 | ベネズエラ地震 | UNOCHA 07/15「4,829 deaths, 16,740 injured」 | 07/15 OCHA（同数値） | SKIP | 同数値掲載済み |
| 2 | フィリピン土砂崩れ | OCD 07/12「18 dead, 9 missing」 | 07/16 NDRRMC（26人死亡） | 含める | LDI未反映の新報告 |

スキップ件数: X件 / 処理対象: Y件
```

---

### 🚨 Step 4: Sentinel Asia EO確認（BLOCKING CHECKPOINT）

**EO発動の一次通知はメールで届く。公開EOページ（`EmergencyObservation.html`）は反映が遅れ、
requested/activated 直後の案件が載らないことがある。公開ページとGDACSだけで「EO該当なし」と
判定してはならない（2026-09-15にこの手抜きで中部ベトナム洪水SA-00660を取りこぼした）。**

#### 4-1. センチネルアジアのメールを最後まで読む（省略不可）

Gmail/Superhuman で、センチネルアジア関連メールを **直近45日ぶんすべて** 取得する。
- 検索例: `label:<Sentinel Asiaラベル> newer_than:45d`、または
  `from:info@sentinel-asia.org OR from:sarequest@adrc.asia newer_than:45d`
- **必ず全ページを取り切る。** 結果に続き（nextPageToken 等）がある間はページングを続ける。
  途中で打ち切って判定してはならない（**部分的な読み込みでの判定は禁止**）。
- 対象の件名パターン: `[SA-XXXXX-requested]` / `[SA-XXXXX-activated]` /
  `[SA-XXXXX-updated]` / `[SA-XXXXX-ended]`、および GLIDE通知メール。

#### 4-2. 全EORを列挙して突合（必須出力）

読み取った全EORを表にする。各EORの最新ステータス（activated / ended 等）を1行にまとめる。

```
## Step 4 Sentinel Asia EOR 突合結果

| SA番号 | 災害名（EOR件名） | GLIDE | 最新ステータス・日付 | ADRC LDI Key | 判定 |
|--------|------------------|-------|--------------------|-------------|------|
| SA-00660 | 20260913-Vietnam-Flood-Landslide-Storm | FL-2026-000173-VNM | activated 09/14 | 未登録 | REGISTER候補 |
```

#### 4-3. 判定ルール

- **activated / requested（有効）かつ ADRC LDI 未登録** → 被害（死傷者・避難者・浸水戸数等）を
  Step 3 の要領で一次情報源から確認し、**確認できれば REGISTER**（被害ゼロ・未確認は除外ルールで除外）。
- **activated かつ ADRC LDI 登録済み** → Step 3.5 の通常スキップ判定を適用（EOでも判定免除しない）。
- **ended** → 新規登録事由にはしないが、既存LDIエントリのステータス参考として記録する。
- 公開EOページ（`EmergencyObservation.html`）は補助確認としてのみ使う。メールとの差分があれば
  **メール側を優先**する。

---

### Step 5: 登録基準判定

対象: Step 3.5「含める」判定の全災害。詳細は `references/criteria.md` 参照。

| 判定 | 条件 |
|------|------|
| **REGISTER** | 基準超過 → レポートに含める |
| **BELOW** | 全基準未達 → **除外ルールにより除外** |

**単発イベントも、Step 1.6で拾った緩慢・累積型も、下記「登録基準（要約）」の同じ基準で判定する。**
累積型は季節累計の数値で判定し、加盟国は死者10人以上（州・県単位を含む）で REGISTER。

Step 5 完了後、除外ルールを適用し、最終出力件数を確定する。

---

### 🔺 Step 5.5: 大規模災害レポートへの昇格判定

**Step 3.5 の「含める」判定に関わらず、処理対象の全災害についてこの判定を行う。**
LDIエントリとして小さくても、大規模災害レポート（`disaster-report`）の対象になりうる。

#### 昇格基準（いずれかに該当したら候補）

| 区分 | 条件 |
|------|------|
| **日本国内** | 死者20人以上 ／ 最大震度6強以上かつ住家全壊確認 ／ 非常災害対策本部の設置 |
| **ADRC加盟国** | 死者100人以上 ／ M7.0以上かつ死者確認 ／ Sentinel Asia EO発動 **かつ** 国際災害チャーター発動 |
| **非加盟国** | 死者300人以上 ／ チャーター発動かつ国家非常事態宣言 |
| **共通追加** | ADRCが要請主体となったEO ／ 日本の国際緊急援助隊派遣 |

> **数値は暫定。様子を見ながら調整する（ユーザー決定・2026-08-17）。**
> 熊本（M7.1・国内）、コロンビア・チョコ（M7.4）、インドネシアNTT（M7.7・EO＋チャーター）
> がいずれも該当することは確認済み。
> 当面は起票メールを出すだけにとどめ、**どの基準がどう当たったかを毎回記録する**。
> 過剰に発火する／取りこぼすようであれば、その記録を根拠に数値を見直す。

#### 既存イベントの除外

`skills/disaster-report/events/` に当該GLIDEのJSONがすでに存在する場合は**候補から外す**
（すでにレポート対象になっている）。

> **重複起票の防止**: events/ に JSON が無くても、直近に同一GLIDEの起票メールを送信済みなら
> 再起票しない（承認待ちの間は日次メールに「起票済・承認待ち」と1行記録するにとどめる）。

#### 該当時の動作

**レポートを勝手に開始してはならない。起票メールを1通出し、人の承認を待つ。**

- 宛先: `ma-arakida@adrc.asia`
- 件名: `【昇格候補】<災害名>を大規模災害レポート対象にしますか（<GLIDE>）`
- 本文に必ず含める:
  1. 災害名・GLIDE・発生日・国
  2. 現在の被害数値と出典URL・出典日
  3. **どの基準に何で該当したか**（例: 「ADRC加盟国 / M7.7かつ死者確認」）
  4. 承認したときに何が起きるか
     — `events/<GLIDE>.json` を作成、1日2回（07:00 / 17:00 JST）生成、
       07:00 に研究部（`kenkyubu@adrc.asia`, `td-date@adrc.asia`）へ自動メール
  5. 免責文（末尾）

該当なしの場合は起票メールを出さない（Step 10 の日次メールに「昇格候補なし」と1行入れる）。

---

### Step 6: URL確認

**全エントリの URL1・URL2 を Chrome MCP で動作確認してから記載する。**

- ReliefWeb の場合: 当該 report ページに navigate してタイトルが表示されることを確認する
- 404・アクセス不能の URL は使用しない（そのフィールドは「—」にする）
- 前日のレポートファイルの URL は、**同一ソース記事を継続して参照する場合のみ**流用可。
  今回新たに別の記事・報告書を参照した場合は、その新しいURLを必ず使用すること（古いURLの流用不可）。

---

### Step 7: docx生成

`skills/docx/SKILL.md` 参照。

- **ファイル名**: `LDI_CMS_Reports_YYYY-MM-DD.docx`
- **保存先**: `C:\Users\arakida\OneDrive - adrc.asia\LatestDisasterInfo\`
  （OneDrive同期フォルダ。共有のためローカルの `C:\Users\arakida\LatestDisasterInfo` ではなく必ずここに保存する。
   セッションで未接続の場合は `request_cowork_directory` でこのパスをマウントしてから保存する。ユーザー決定・2026-08-28）
- **メールで案内する共有リンク**: 上部「共有フォルダ」セクションのSharePoint共有リンクを使う。
  ローカルパスやプレーンな "LatestDisasterInfo" 表記を共有先として案内しない。
- **書式確認**: 前日のファイルが保存先にある場合は必ず書式を参照してから生成すること

#### docx の組み立てをスクリプトに固定しない（2026-10-06 の検討結果）

いったん `build_ldi_docx.py` を書いたが、**実物の docx を見て取り下げた。**

実物（`LDI_CMS_Reports_2026-10-06.docx`）は、仕様の雛形より**その日の情報を多く載せている。**

- フッタに**照合した経路を列挙**している
  （「LDI個別ページ全13Key照合済み / Sentinel Asiaメール（直近約45日）/ GDACS Orange/Red（直近15日）確認済」）
- 使用方法ボックスに**その日の内訳**を入れている（「更新必要2件：既存Key更新2件」）
- スキップ表の判定欄が「更新」「スキップ」の日本語

**体裁を固定すると、この日ごとの注記が落ちる。** 読む人に渡る情報が減る。
トークンは減るが、それは**残す価値のあるものを捨てて減らしている。**

費用を下げるなら、狙うのはここではない。実測した内訳は下記。

| 項目 | 実測 | 備考 |
|---|---|---|
| 内容（日本語）の長さ | **196字・282字** | 下記のとおり目安を実態に合わせた |
| 内容（英語）の長さ | **77語・106語** | 同 |
| 確認したKey数 | 日によって 10〜**39** | Step 1.5 の掃き出し幅で変わる |

#### 内容欄の長さの目安（2026-10-06 に実測で設定）

**それまで「50-80字」としていたが、根拠が無かった。**
SKILL.md のどこにも長さの定めは無く、QAスクリプトの表示文だけにその数字があり、
しかも**コード側の閾値（120字）と食い違っていた。**
実物は196字・282字で、**毎日 WARN が出続けていた。鳴り続ける警報は読まれない。**

荒木田さんの判断で、実態に合わせた。

| | 目安 | 根拠 |
|---|---|---|
| 内容（日本語） | **60〜400字** | 実物 196字・282字 |
| 内容（英語） | **25〜180語** | 実物 77語・106語 |

捕まえたいのは2つだけである。

- **短すぎ** — 被害と対応が書けていない（16字の本文は WARN になる）
- **長すぎ** — 複数の報を1エントリに混ぜている（462字で WARN。1エントリ=1ソースの形が崩れる）

**根拠は実物2件だけである。** 日数が溜まったら見直す。

#### 出力フォーマット（固定）

**下は雛形であり、実物はこれより詳しい。** 2026-10-06 の実物で確認した差分:

| | 雛形 | 実物 |
|---|---|---|
| サブヘッダ | 全N件検証 → 更新必要 X件 | **LDI全13Key検証 → 更新必要 全2件** |
| 節見出し | 青背景の表 | **段落**（11pt太字・背景なし） |
| ラベル列の色 | — | `D6E4F0` |
| スキップ表の見出し | — | `1F5C8B`（白文字） |
| 使用方法ボックス | 定型文 | 定型文＋**その日の内訳** |
| フッタ | --- 更新必要 X件 / スキップ Y件 --- | **--- 以上 2件（更新必要 2件：既存Key更新2件 / スキップ 11件）---** ＋照合経路を2段落 |

**実物のほうが運用されている。** 雛形に合わせて実物を削らないこと。

```
1. タイトル行（中央揃え）
   ADRC LDI CMS レポート入力データ

2. サブヘッダ（中央揃え）
   作成日: YYYY-MM-DD  ／  全N件検証 → 更新必要 X件・スキップ Y件  ／  自動生成

3. スキップ判定サマリ表（任意・推奨）
   全Key: LDI ID / 災害 / LDI現況（最新ソース）/ 今日の最新ソース / 判定

4. 使用方法ボックス（1行テーブル・黄背景）
   「今日CMS入力が必要なエントリのみ記載。内容をADRC LDI CMS「レポート編集」フォームに
    入力してください。LDI IDは対象災害のKey番号を参照。URLはブラウザで動作確認後に入力。」

5. 各エントリ（更新必要な全件）
   セクションヘッダ（青背景）: No.X  Report (LDI ID: XXXX)
   7行テーブル（左列: ラベル薄青背景 / 右列: 白背景）:
     レポートの種類 / Report Type  │ Report/Articles
     タイトル（日本語）             │ [情報源名 + 日付]  例: フィルスター 7/16
     タイトル（英語）/ Title        │ [Source + date]    例: Philstar 7/16
     内容（日本語）                 │ [被害と対応の状況のみ。発表機関名から書き出す]
     内容（英語）/ Outlines         │ [Damage & response only; lead with the issuing body]
     URL1                          │ [確認済み実URL]
     URL2                          │ [追加URL または「—」]

6. フッタ（中央揃え）
   --- 更新必要 X件 / スキップ Y件 ---
   自動生成: YYYY-MM-DD  /  各ADRC記事ページのLDI現況を照合済み
```

---

### 🚦 Step 8: 機械QA（BLOCKING GATE）

```bash
python "$SKILL_DIR/../report-qa/scripts/qa_report.py" "<生成したdocxのパス>" --type ldi
```

| QA結果 | 動作 |
|--------|------|
| **PASS** | Step 9 へ進む |
| **WARN のみ** | Step 9 へ進む。**WARN項目をメール本文の末尾に列挙する**（人が判断する） |
| **FAIL が1件でも** | **メールを送らない。** 荒木田（`ma-arakida@adrc.asia`）宛に「LDIレポート生成失敗」を送り、FAIL項目と原因箇所を示して終了する |

**FAIL時にdocxを自動修正してはならない。** 修正案の提示にとどめ、人の承認を待つ。

---

### Step 9: メール本文の組み立て

CMS担当者が**メールを開いた時点で作業内容が分かる**ことを目的とする。
docxを開かないと何をすべきか分からない本文にしない。

- **送信元**: `ma-arakida@adrc.asia`
- **宛先**: `ys-shiomi@adrc.asia`（塩見）、`my-yoshida@adrc.asia`（吉田）、`mk-kodama@adrc.asia`（児玉）
  ／ Cc: `ma-arakida@adrc.asia`
- **添付**: `LDI_CMS_Reports_YYYY-MM-DD.docx`
  （Superhuman MCP に添付機能が無い場合は、更新必要エントリの全内容をHTML本文に埋め込み、
   docxの保存先は上部「共有フォルダ」セクションのSharePoint共有リンクで案内する。
   ローカルフォルダやプレーンな "LatestDisasterInfo" 表記を共有先として使わない）

#### 🗓 送信の頻度（重要）

**収集・判定・生成・QAは毎日行う。メールを出すかどうかだけが曜日で変わる。**

| 状況 | 月 | 火 | 水 | 木 | 金 | 土 | 日 |
|------|---|---|---|---|---|---|---|
| **更新あり**（1件以上） | ● | ● | ● | ● | ● | ● | ● |
| **更新0件**（新しい災害なし） | ● | — | — | — | ● | — | — |

- 更新があれば曜日に関わらず送る
- 更新が無い日は**月曜と金曜だけ**送る。火〜木・土日は送らない
- 更新0件でも月・金に送るのは、**沈黙が「該当なし」なのか「処理が止まっている」のかを担当者が判別できるようにするため**。
  週2回の生存確認として機能させる（ユーザー決定・2026-08-17）
- 送らなかった日も **docx は生成して保存する**。あとから遡って確認できるようにする

#### 件名

| 状況 | 件名 |
|------|------|
| 更新あり | `ADRC LDI CMS入力データ（YYYY-MM-DD）更新X件・スキップY件` |
| **更新0件（月・金）** | `ADRC LDI CMS入力データ（YYYY-MM-DD）更新対象なし（全N件確認済み）` |

#### 本文の構成（この順）

1. 宛名（`塩見様、吉田様、児玉様` — 3名連名）
2. 1行サマリ: 「本日のLDI更新対象はX件です。全N件を確認し、Y件はLDI掲載済みのためスキップしました。」
3. **エントリ一覧表**（更新必要な全件）

   | # | LDI ID | 災害名 | タイトル（日本語） | URL1 |
   |---|--------|--------|------------------|------|

4. 「詳細は添付docx（または上記共有フォルダの当日ファイル）の該当セクションをそのままCMS『レポート編集』フォームへ貼り付けてください。」
5. 昇格候補の有無（Step 5.5 の結果を1行。該当時は起票メールを別途送った旨も書く）
6. **緩慢・累積型（Step 1.6 の結果を1行）**。季節累計で登録対象になった案件はエントリ一覧表に入れたうえで、
   加盟国で季節累計の死者が100人を超えた案件があれば
   「<国>・<ハザード>：季節累計 死者XX人（お悔み状検討の目安100人超）」の形で記す。
   数値未取得（要人確認）の案件もここに1行載せる。該当なしは省略可。
7. QA結果（`QA: 合格` または `QA: 条件付き合格（WARN n件）` ＋ WARN項目の列挙）
8. **必ず入れる免責**:
   「データ検索、集計、レポート作成、メール送信、これらはClaude AIを使用しています。誤りがあればお知らせください。」
9. 最後は **「荒木田」の1行**で終える。**署名ブロックは入れない。**

#### 更新0件の日の本文（月・金のみ）

火〜木・土日は送らない。**月曜と金曜は、更新が無くても必ず送る。**

```
塩見様、吉田様、児玉様

本日（YYYY-MM-DD）のLDI更新対象はありません。
全N件を確認し、いずれもLDI掲載済みまたは登録基準未達でした。

（スキップ判定サマリ表）

昇格候補: なし
QA: 対象ファイルなし

データ検索、集計、レポート作成、メール送信、これらはClaude AIを使用しています。
誤りがあればお知らせください。

荒木田
```

---

### Step 10: 送信

Superhuman の `create_or_update_draft`（`body` に完成HTMLを渡す）→ `send_draft`。
**HTML本文はCDATAで囲まない。** 送信はユーザー承認済み（2026-08-17）。

- 送信元が `ma-arakida@adrc.asia` になっていることを送信後に確認する
  （このアカウントは `ma.arakida@gmail.com` に `ma-arakida@adrc.asia` のエイリアスが設定済み）
- `ma-arakida@adrc.asia` として送信できない場合は**下書きにとどめ**、別アカウントからは送らない

#### 文体（厳守）

**事実以上の評価・演出を含む表現を使わない。** 観測された数値・公表内容と、その出典だけを書く。
「深刻」「懸念される」「急務」等、書き手の評価や情緒を足す語を使わない。

---

### Step 11: 台帳を残す（省略不可・2026-10-06 追加）

```bash
python "$SKILL_DIR/scripts/ldi_state.py" --dir "<マウントしたLatestDisasterInfo>" --record <判定JSON>
```

**メールを送らなかった日（更新0件・QA FAILで止めた日）も記録する。**
読んだ記事は読んだのであり、翌朝に読み直す理由は無い。

**docx を置いたのと同じフォルダに `ldi_seen.json` が残る。**
「この場所は残らない」と出たら台帳は効いていない。報告に書くこと。

---

## 登録基準（要約）

**単発イベント**

| 地域 | 死者 | 負傷 | 実避難者 |
|------|------|------|---------|
| 日本 | 5+ | 100+ | 1,000+ |
| アジア加盟国 | 10+ | 100+ | 1,000+ |
| その他 | 100+ | 1,000+ | 10,000+ |

**緩慢・累積型（季節累計。Step 1.6 用）** — 単発と同じ死者の基準を季節累計に適用する

| 区分 | 登録（含める） | メールに1行記録 |
|------|--------------|----------------|
| 日本 | 季節累計 死者 5+ | — |
| アジア加盟国 | 季節累計 死者 10+（国全体、または特定の州・県で10+） | 季節累計 死者 100+（お悔み状検討の目安） |
| その他 | 季節累計 死者 100+ | — |

> 2026-09-28にいったん「加盟国 100+で登録／50–99でウォッチ」としたが、塩見氏の指摘
> （LDI・GLIDEの登録基準は死者10人、100人はお悔み状の目安）を受けて改めた（ユーザー決定・2026-09-30）。

Sentinel Asia EO 発動かつ被害確認済み → 基準に関わらず REGISTER。
GLIDE・GDACS ID は実在確認済みのもののみ記載。

