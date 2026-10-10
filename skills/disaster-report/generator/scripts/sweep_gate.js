#!/usr/bin/env node
/*
 * sweep_gate.js — 今日確認していない災害を送らない（送信側）
 *
 *   node sweep_gate.js <GLIDE>
 *
 * 終了コード
 *   0  送ってよい。メールに入れる「確認日」の1行を出す
 *   7  送らない。今日の確認記録（meta.swept）が無い
 *   2  実行できなかった
 *
 * ## なぜこれが要るか
 *
 * 2026-10-06、ビルドタスクが資料を1件も開かずに「成功」した日に、
 * 送信タスクは 10/4 の版をそのまま送った（経緯は mark_swept.js）。
 * 受け取った側は「4日付と変化がない」ことに気づいたが、
 * **確認したうえで変化が無いのか、確認していないのかを区別できなかった。**
 *
 * ## 2つのことをする（荒木田さんの指示・2026-10-06）
 *
 * 1. **今日の確認記録が無ければ送らない。** 荒木田さんに知らせる（§5-1-4）
 * 2. **送るときは確認日をメールに書く。** 数値が動かない週も
 *    「いつ・何を見て・変化なし」と読める形にする。文面はここで組み立てる。
 *    人にも他のセッションにも書かせない（書かせると、確かめていない日にも書ける）
 *
 * 判定は JST の日付で行う。送信は 08:50 JST、ビルドは 07:30 JST で同じ日になる。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SKILL = path.resolve(__dirname, "..", "..");
const EVENTS = path.join(SKILL, "events");

function jstToday() {
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return jst.getFullYear() + "-" + p(jst.getMonth() + 1) + "-" + p(jst.getDate());
}

const glide = process.argv[2];
if (!glide || glide.startsWith("-")) { console.error("使い方: node sweep_gate.js <GLIDE>"); process.exit(2); }
const file = path.join(EVENTS, glide + ".json");
if (!fs.existsSync(file)) { console.error("イベントが無い: " + file); process.exit(2); }

const m = JSON.parse(fs.readFileSync(file, "utf8")).meta;
const today = jstToday();
const s = m.swept;

if (!s || s.date_jst !== today) {
  console.log("STATUS: NOT-SWEPT " + glide);
  console.log("今日（" + today + " JST）の確認記録が無い。最後の記録: " + (s ? s.at_jst + " JST" : "なし"));
  console.log("**この災害の更新メールは送らない。** 荒木田さんへ知らせる（SKILL.md §5-1-4）。");
  console.log("");
  console.log("NOTIFY_SUBJECT: 【送信見送り】" + (m.title_ja || glide) + " — 今朝のビルドが確認を終えていない");
  const last = s ? "最後に確認を終えた記録は " + s.at_jst + " JST です。" : "確認を終えた記録は、まだ一度もありません。";
  console.log("NOTIFY_BODY: " + (m.title_ja || glide) + "（" + glide + "）の更新メールは送りませんでした。"
    + "今朝のビルドに、一次情報を確認し終えた記録（mark_swept.js）が残っていないためです。"
    + "送れば、前回の版（" + (m.edition_ja || "") + "・" + (m.stamp || "") + "）を今日確かめないまま送ることになります。"
    + last
    + "ビルドを手で回して確認を終えれば、送信タスクを再実行して送れます。");
  process.exit(7);
}

const md = (x) => { const k = /(\d{4})-(\d{2})-(\d{2})/.exec(x); return k ? +k[2] + "月" + +k[3] + "日" : x; };
const org = s.latest_official.replace(/\d{4}-\d{2}-\d{2}/, "").trim();
const line = "確認日：" + md(s.date_jst) + "（" + s.at_jst.slice(11) + " JST）に一次情報源を確認しました。"
  + (org ? org + " の" : "") + md(s.latest_official) + "の発表が最新で、"
  + (s.changed ? "前報から数値が動いています（下記）。" : "前報から主要な数値に変化はありません。");
// headline.as_of が7日を超えて古ければ、日付を本文に出す（SKILL.md §5-2・荒木田さんの指示 2026-10-07）。
// as_of は自由文なので、先頭60字の中の最初の日付（2026-09-30 / 26 Sep 2026）だけを読む。読めなければ黙らず注記する
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function asOfDate(txt) {
  const h = String(txt || "").slice(0, 60);
  let k = /(\d{4})-(\d{2})-(\d{2})/.exec(h);
  if (k) return { y: +k[1], m: +k[2], d: +k[3] };
  k = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(h);
  if (k && MON[k[2].toLowerCase()]) return { y: +k[3], m: MON[k[2].toLowerCase()], d: +k[1] };
  return null;
}
const STALE_DAYS = 7;
const hd = JSON.parse(fs.readFileSync(file, "utf8")).meta.headline || {};
const ad = asOfDate(hd.as_of);
let stale = "";
if (ad) {
  const t = /(\d{4})-(\d{2})-(\d{2})/.exec(today);
  const days = Math.round((Date.UTC(+t[1], +t[2] - 1, +t[3]) - Date.UTC(ad.y, ad.m - 1, ad.d)) / 86400000);
  if (days > STALE_DAYS) {
    stale = "数値は" + ad.m + "月" + ad.d + "日時点（" + days + "日前）で、以降の更新は見つかっていません。";
    console.log("STALE-AS-OF: " + days + "日前（" + ad.y + "-" + String(ad.m).padStart(2, "0") + "-" + String(ad.d).padStart(2, "0") + "）");
  }
} else {
  console.log("注意: headline.as_of から日付を読み取れなかった。何日前の数値か、手で確かめること。");
}
console.log("STATUS: SWEPT-TODAY " + glide + "  " + s.at_jst + " JST");
console.log("MAIL_LINE: " + line + stale);
process.exit(0);
