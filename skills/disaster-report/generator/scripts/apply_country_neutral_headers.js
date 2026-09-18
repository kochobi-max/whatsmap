#!/usr/bin/env node
/*
 * apply_country_neutral_headers.js — 日本固定の見出しをデータ駆動にする
 *
 * ジェネレータは熊本の地震レポートを出自に持つので、見出しの一部に
 * 「地震発生からの」「消防庁・警察庁・熊本県等の集計」のような文言が
 * 直接書かれている。コロンビアも地震・日本語の集計機関名が近かったので
 * 表面化しなかったが、ネパールの氷河湖決壊洪水（FF-2026-000162-NPL）で
 * 出力に残った。**中身が事実と違う。**
 *
 * ここでは4か所を `d.meta` から読むようにする。
 *
 *   meta.chronology_note_en / _ja   … 時系列ページの副題
 *   meta.activation_by_en   / _ja   … 発動ページの見出しの「（要請：〜）」
 *   meta.chronology_sources         … 時系列ページ下段の出典行（[{label,url}]）
 *   meta.cover_sources              … 表紙下段の出典行（同上）
 *
 * 被害状況ページの副題は触らない。apply_attribution_patch.js が
 * すでに `d.attribution_en` / `d.attribution_ja` で駆動している。二重に触らない。
 *
 * **既定値は現在の文言そのまま。** 指定が無ければ出力は1文字も変わらない。
 * 熊本・コロンビアは何も足さなくてよい。
 *
 * 使い方:
 *   node scripts/apply_country_neutral_headers.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- country-neutral headers (disaster-report) --- */";

// LP() は apply_bilingual_fields.js が入れる「_en/_ja を LANG_OUT で選ぶ」ヘルパ。
// ここではその有無だけを見て、meta に指定があれば差し替える。
const HELPER = `${MARK}
/* 見出しの一部を meta から読む。指定が無ければ従来の文言のまま（出力は変わらない）。 */
/* --- end country-neutral headers --- */`;

// 対象は3か所だけ。1件ずつ数えて、1件でなければ中断する。
const EDITS = [
  // 時系列ページの副題。apply_cover_and_figures.js が tz_note を挟んだあとの形に合わせる。
  { name: "時系列ページの副題（英）",
    re: /"Government \/ agency actions from onset — all official sources\."/,
    to: '(LP(d.meta, "chronology_note") ? (d.meta.chronology_note_en || "Government / agency actions from onset — all official sources.") : "Government / agency actions from onset — all official sources.")' },
  { name: "時系列ページの副題（日）",
    re: /" 地震発生からの政府・機関の主要な動き（すべて公的情報）。"/,
    to: '(LP(d.meta, "chronology_note") ? " " + (d.meta.chronology_note_ja || "地震発生からの政府・機関の主要な動き（すべて公的情報）。") : " 地震発生からの政府・機関の主要な動き（すべて公的情報）。")' },
  { name: "発動ページの見出し",
    re: /heading\(s, "International Activation Pages \(requested by ADRC\)", "国際メカニズムの発動ページ（要請：ADRC）"\);/,
    to: 'heading(s, "International Activation Pages (" + (LP(d.meta, "activation_by") || "requested by ADRC") + ")", "国際メカニズムの発動ページ（" + (LP(d.meta, "activation_by") || "要請：ADRC") + "）");' },
  // 時系列ページ下段の出典行。首相官邸と防衛省のURLが直接書かれている。
  { name: "時系列ページの出典行",
    re: /srcLine\(s, \[\{ label: "Kantei \(PM Office\)", url: "[^"]*" \}, \{ label: "MOD \/ JSDF", url: "[^"]*" \}, linkBy\("JMA - Earthquake"\)\]\);/,
    to: 'srcLine(s, Array.isArray(d.meta && d.meta.chronology_sources) ? d.meta.chronology_sources : [{ label: "Kantei (PM Office)", url: "https://www.kantei.go.jp/jp/105/actions/202607/28hijoukaigi.html" }, { label: "MOD / JSDF", url: "https://www.mod.go.jp/j/press/kisha/2026/0728c_r.html" }, linkBy("JMA - Earthquake")]);' },
  // 表紙下段の出典行。3面図の3枚目が震度図でない災害では中身が合わない。
  { name: "表紙の出典行",
    re: /srcLine\(s, \[linkBy\("intensity map"\), \{ label: "Google Maps © Google", url: "https:\/\/www\.google\.com\/maps\/" \}\], \{ y: 7\.06, w: 10\.6 \}\);/,
    to: 'srcLine(s, Array.isArray(d.meta && d.meta.cover_sources) ? d.meta.cover_sources : [linkBy("intensity map"), { label: "Google Maps © Google", url: "https://www.google.com/maps/" }], { y: 7.06, w: 10.6 });' },
];

function main() {
  const argv = process.argv;
  let file = null, dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--dry-run") dryRun = true;
  }
  if (!file) { console.error("✗ --file が必要です"); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`✗ 見つかりません: ${file}`); process.exit(1); }

  let src = fs.readFileSync(file, "utf8");
  if (src.includes(MARK)) { console.log("✓ すでに適用済みです。何もしません。"); return; }

  const problems = [];
  for (const e of EDITS) {
    const n = (src.match(new RegExp(e.re.source, "g")) || []).length;
    if (n !== 1) problems.push(`${e.name}: ${n} 件（1件であるべき）`);
  }
  if (problems.length) {
    console.error("✗ 対象を特定できないため中断しました。gen_deck.js の文言が変わっています。");
    problems.forEach(p => console.error(`   - ${p}`));
    process.exit(2);
  }

  for (const e of EDITS) src = src.replace(e.re, e.to);

  const anchorRe = /^\s*const\s+d\s*=\s*JSON\.parse\(\s*fs\.readFileSync\(\s*DATA\s*,\s*"utf8"\s*\)\s*\)\s*;?\s*$/m;
  if (!anchorRe.test(src)) { console.error("✗ ヘルパの挿入位置（const d の行）が見つかりません。"); process.exit(2); }
  src = src.replace(anchorRe, m => m + "\n" + HELPER);

  try { new vm.Script(src, { filename: file }); }
  catch (err) { console.error("✗ 書き換え後の構文が壊れました。中断します。\n  " + err.message); process.exit(3); }

  if (dryRun) { console.log("✓ dry-run: 対象を1件ずつ特定でき、構文も通りました。"); return; }
  fs.copyFileSync(file, file + ".neutral.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log("✓ 適用しました（元ファイルは " + file + ".neutral.bak）");
  console.log("    ✓ 時系列・被害状況の副題と、発動ページの見出しを meta から読む");
  console.log("  meta に何も足さなければ出力は変わりません。");
}
main();
