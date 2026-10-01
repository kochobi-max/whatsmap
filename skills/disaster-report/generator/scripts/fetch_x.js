#!/usr/bin/env node
/*
 * fetch_x.js — X（旧Twitter）の公開アカウントの投稿本文と日時を取る。
 *
 *   node fetch_x.js UNGRD
 *   node fetch_x.js UNGRD --grep "balance|fallecid"
 *
 * **なぜこれで取れるのか**
 *
 * x.com はログインを求めるが、**返ってくるHTMLに GraphQL の状態が埋まっており、
 * 投稿本文（full_text / NoteTweet.text）がそのまま入っている**。
 * 長文投稿は NoteTweet 側にあり、タイムライン表示では途中で切れて見える文も
 * ここには全文がある。UNGRD の被害集計はこの長文側に載る。
 *
 * **日時は投稿IDから復元する。** X の ID は snowflake で、上位ビットが
 * ミリ秒時刻。HTML に created_at が無くても
 *   ms = (id >> 22) + 1288834974657
 * で確定できる。コロンビアは UTC-5（COT）。
 *
 * 2026-08-28 に確立。UNGRD は死者・負傷者の集計を自サイトに記事として載せず、
 * ここでしか公式に出さない（references/sources/COL.md）。
 */
"use strict";
const { execFileSync } = require("child_process");

const handle = process.argv[2];
if (!handle) { console.error("usage: fetch_x.js <handle> [--grep <regex>] [--tz <hours>]"); process.exit(2); }
const args = process.argv.slice(3);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const grep = opt("grep", null);
const tz = parseFloat(opt("tz", "-5"));       // 既定は COT
const tzName = opt("tzname", "COT");

let html;
try {
  html = execFileSync("curl", ["-sS", "--max-time", "60",
    "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "https://x.com/" + handle], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error("X: FAIL 取得できない — " + String(e.message).slice(0, 150));
  console.error("check_sources.js と、許可リストに x.com があるかを確認する。");
  process.exit(7);
}

const dec = x => x.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\//g, "/")
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// 投稿ID（base64 の "Tweet:<id>" / "NoteTweet:<id>"）から時刻を復元
const ids = new Set();
for (const m of html.matchAll(/([A-Za-z0-9+/=]{20,})/g)) {
  let d; try { d = Buffer.from(m[1], "base64").toString("ascii"); } catch { continue; }
  const mm = /^(?:Note)?Tweet:(\d{15,25})$/.exec(d);
  if (mm) ids.add(BigInt(mm[1]));
}
const stamp = id => new Date(Number((id >> 22n) + 1288834974657n));
const fmt = d => {
  const l = new Date(d.getTime() + tz * 3600 * 1000);
  const p = n => String(n).padStart(2, "0");
  return l.getUTCFullYear() + "-" + p(l.getUTCMonth() + 1) + "-" + p(l.getUTCDate())
       + " " + p(l.getUTCHours()) + ":" + p(l.getUTCMinutes()) + " " + tzName;
};

const newest = [...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0];
console.log("@" + handle + "  取得した投稿ID " + ids.size + "件");
if (newest) console.log("最新の投稿時刻: " + fmt(stamp(newest)) + "  (id " + newest + ")");
console.log("");

const re = grep ? new RegExp(grep, "i") : null;

const nearIdBefore = index => {
  const before = html.slice(Math.max(0, index - 4000), index);
  let near = null;
  for (const b of before.matchAll(/([A-Za-z0-9+/=]{20,})/g)) {
    let d; try { d = Buffer.from(b[1], "base64").toString("ascii"); } catch { continue; }
    const mm = /^(?:Note)?Tweet:(\d{15,25})$/.exec(d);
    if (mm) near = BigInt(mm[1]);
  }
  return near;
};

// 同じ投稿が2通り入っている。タイムライン表示用は t.co で切り詰められ、
// NoteTweet 側に全文がある。**同じ投稿IDなら長い方（省略されていない方）を採る。**
// 2026-09-01: 書き出しが同じ定型文の**別の日の投稿**を、テキストの先頭40字だけで
// 同一視して片方を捨てていた（短いほうが必ず古い投稿とは限らない）。
// 投稿ID（近傍から復元）でまとめてから長さで選ぶよう直した。
const byId = new Map();
for (const m of html.matchAll(/text:"((?:[^"\\]|\\.)*)"/g)) {
  const t = dec(m[1]);
  if (t.length < 70) continue;
  const near = nearIdBefore(m.index);
  const k = near !== null ? String(near) : "idx:" + m.index;
  const prev = byId.get(k);
  if (!prev || t.length > prev.t.length) byId.set(k, { t, index: m.index, near });
}

let shown = 0;
for (const { t, index, near } of [...byId.values()].sort((a, b) => a.index - b.index)) {
  if (re && !re.test(t)) continue;
  console.log("=".repeat(70));
  if (near) console.log("投稿時刻: " + fmt(stamp(near)) + "   https://x.com/" + handle + "/status/" + near);
  console.log(t);
  console.log("");
  shown++;
}
if (!shown) console.log("（該当する投稿が見つからない" + (grep ? " grep=" + grep : "") + "）");
