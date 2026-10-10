#!/usr/bin/env node
/*
 * check_pc_health.js — 荒木田さんのPCが何日動いていないかを見る
 *
 *   node check_pc_health.js            判定して、知らせるなら本文を出す
 *   node check_pc_health.js --record   知らせたことを記録する（送信後に呼ぶ）
 *   node check_pc_health.js --days N   しきい値を変える（既定 2日）
 *
 * 終了コード
 *   0  知らせない（動いている／既に知らせた）
 *   3  知らせる（本文を標準出力に出してある）
 *
 * ## なぜこれが要るか
 *
 * 2026-09-19〜09-23 の5日間、PCが動かなかった（休日）。
 * クラウド側は毎日ビルドして配布していたのに、**メールは1通も出ていない。**
 * 送信タスクは毎朝「PC側の公開が今日でない」と見送っていたが、
 * **その報告は荒木田さんには届いていない。** 定期タスクの実行ログの中にあるだけである。
 *
 * 止まっていることに気づけるのは、荒木田さん本人だけである。
 * だから**本人に知らせる。** 荒木田さんの判断（2026-09-24）。
 *
 * ## PCが「動いた」とみなすもの
 *
 *   _published/<GLIDE>.json          その日 OneDrive へ出した
 *   _published/<GLIDE>.skipped.json  その日動いたが、配布物が前日ビルドで飛ばした
 *
 * **飛ばした日も「動いた」である。** PCは起きていて、判断して、見送っている。
 * ここを分けないと、配布が遅れた日を「PCが止まった」と誤って知らせることになる。
 *
 * ## 毎日はしつこい
 *
 * 2日で1回知らせ、そのあとは空きが3日増えるごとに知らせる（2日目・5日目・8日目…）。
 * 休暇と分かっていて止めている人に、毎朝同じ通知を出さない。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SKILL = path.resolve(__dirname, "..", "..");
const EVENTS = path.join(SKILL, "events");
const PUB = path.join(SKILL, "_published");
const STATE = path.join(SKILL, "_state");
const LEDGER = path.join(STATE, "pc_health.json");

const argv = process.argv.slice(2);
const RECORD = argv.includes("--record");
const di = argv.indexOf("--days");
const THRESHOLD = di >= 0 && argv[di + 1] ? parseInt(argv[di + 1], 10) : 2;
const REMIND_EVERY = 3;

const now = new Date();
const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
const pad = n => String(n).padStart(2, "0");
const ymd = dt => dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
const today = ymd(jst);

function activeGlides() {
  if (!fs.existsSync(EVENTS)) return [];
  return fs.readdirSync(EVENTS)
    .filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .map(f => f.slice(0, -5))
    .filter(g => {
      try { return JSON.parse(fs.readFileSync(path.join(EVENTS, g + ".json"), "utf8")).meta.status === "active"; }
      catch (_) { return false; }
    });
}

function readDate(file, key) {
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    return String(r[key] || "").slice(0, 10) || null;
  } catch (_) { return null; }
}

// PCが最後に動いた日。**公開と見送りの両方を見る。**
let last = null;
const seen = [];
for (const g of activeGlides()) {
  for (const [f, k] of [[path.join(PUB, g + ".json"), "published_date_jst"],
                        [path.join(PUB, g + ".skipped.json"), "skipped_at_jst"]]) {
    const d = readDate(f, k);
    if (d) { seen.push(g + " " + path.basename(f) + " " + d); if (!last || d > last) last = d; }
  }
}

console.log("── PCの稼働  （今日 " + today + " JST）");
for (const s of seen) console.log("   " + s);

if (!last) {
  console.log("   公開記録がひとつも無い。判断できないので知らせない。");
  console.log("STATUS: PC-UNKNOWN");
  process.exit(0);
}

const gap = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(last + "T00:00:00Z")) / 86400000);
console.log("   最後に動いた日: " + last + "（" + gap + "日前）");

let ledger = {};
try { ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch (_) {}
const lastNotifiedGap = Number(ledger.notified_gap_days || 0);
const lastNotifiedFor = String(ledger.notified_for_last_run || "");

if (gap < THRESHOLD) {
  console.log("   しきい値 " + THRESHOLD + "日 に達していない。");
  console.log("STATUS: PC-OK " + gap + "d");
  process.exit(0);
}

// 同じ「止まり」の中では、空きが REMIND_EVERY 日増えるまで黙る。
const sameOutage = lastNotifiedFor === last;
if (sameOutage && gap - lastNotifiedGap < REMIND_EVERY) {
  console.log("   " + lastNotifiedGap + "日の時点で知らせ済み。次は " + (lastNotifiedGap + REMIND_EVERY) + "日から。");
  console.log("STATUS: PC-ALREADY-NOTIFIED " + gap + "d");
  process.exit(0);
}

if (RECORD) {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify({
    notified_at_jst: today,
    notified_gap_days: gap,
    notified_for_last_run: last
  }, null, 2) + "\n");
  console.log("   記録した（空き " + gap + "日、最終稼働 " + last + "）");
  console.log("STATUS: PC-RECORDED " + gap + "d");
  process.exit(0);
}

const html = [
  "<p>荒木田様</p>",
  "<p>大規模災害レポートの配布用PCが、<b>" + gap + "日間</b>動いていません。"
    + "最後に OneDrive「LargeScaleDisasters」へ出したのは <b>" + last + "</b> です。</p>",
  "<p>この間、クラウド側は毎日ビルドして配布ブランチへ出しています。"
    + "PCが取りに来ていないため OneDrive が更新されず、"
    + "<b>研究部への更新メールも送られていません。</b></p>",
  "<p>お心当たりがなければ、PCで <b>C:\\Users\\arakida\\ADRC_setup_and_publish.bat</b> を実行してください。"
    + "電源・ネットワーク・タスクスケジューラのいずれかで止まっている可能性があります。</p>",
  "<p>休暇などで意図して止めている場合は、このままで問題ありません。"
    + "次にPCが動いた時点で、溜まっているぶんがまとめて出ます。</p>",
  "<p>データ検索、集計、レポート作成、ファイルアップロード、メール送信、これらはClaude AIを使用しています。誤りがあればお知らせください。</p>"
].join("\n\n");

console.log("");
console.log("   宛先: ma-arakida@adrc.asia のみ（研究部には送らない）   差出人: ma-arakida@adrc.asia");
console.log("   件名: 配布用PCが" + gap + "日間動いていません（最終 " + last + "）");
console.log("");
console.log("----- ここから本文HTML（そのまま body に渡す） -----");
console.log(html);
console.log("----- ここまで -----");
console.log("");
console.log("   送信できたら必ず: node check_pc_health.js --record");
console.log("STATUS: PC-NOTIFY " + gap + "d");
process.exit(3);
