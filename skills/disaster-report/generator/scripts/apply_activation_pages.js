#!/usr/bin/env node
/*
 * apply_activation_pages.js — 発動ページを事実に合わせて出し分ける
 *
 * 「国際メカニズムの発動ページ（要請：ADRC）」は熊本用にベタ書きされていた。
 *
 *   Sentinel Asia   https://sentinel-asia.org/EO/2026/article20260728JP.html
 *   国際災害チャーター  .../earthquake-in-japan-activation-1046-
 *
 * **Sentinel Asia はアジア太平洋地域が対象で、コロンビアは対象外である。**
 * それでもこのページが出て、日本の記事URLのまま「要請：ADRC」と書かれ、
 * 左半分が Sentinel Asia の画像用に空いていた。
 *
 * データ側は正しく持っていた。
 *   satellite: Sentinel Asia — 「対象外。同メカニズムはアジア太平洋地域が対象であり、
 *              コロンビアは国際災害チャーターとコペルニクスEMSが対応」
 * 誤っていたのはスライドの側だけである。
 *
 * ここでは `d.activation_pages` を見る。
 *
 *   あり（1件以上） … その枚数ぶんだけ並べる。1件なら中央に大きく置く
 *   空配列          … このページ自体を出さない（ADRCが要請していない災害）
 *   無し            … 従来どおり熊本のベタ書き2枚（出力は変わらない）
 *
 * データ形:
 *   "activation_pages": [
 *     { "key": "disaster_charter",
 *       "title_en": "International Charter - Activation #1234 (requested by X)",
 *       "title_ja": "国際災害チャーター Activation #1234（要請：X）",
 *       "url": "https://disasterscharter.org/activations/..." }
 *   ]
 *
 * 使い方:
 *   node scripts/apply_activation_pages.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- activation pages (disaster-report) --- */";

const FROM = [
  '  // Both mechanisms were activated on 28 Jul at ADRC\'s request — show the activation pages.',
  '  s = p.addSlide(); s.background = { color: WHITE };',
  '  heading(s, "International Activation Pages (requested by ADRC)", "国際メカニズムの発動ページ（要請：ADRC）");',
  '  imageSlot(s, 0.4, 1.20, 6.15, 5.30, "sentinel_asia", "Sentinel Asia Emergency Observation (requested by ADRC)", "Sentinel Asia 緊急観測（要請：ADRC）", "https://sentinel-asia.org/EO/2026/article20260728JP.html");',
  '  imageSlot(s, 6.75, 1.20, 6.15, 5.30, "disaster_charter", "International Charter - Activation #1046 (requested by ADRC)", "国際災害チャーター Activation #1046（要請：ADRC）", "https://disasterscharter.org/activations/earthquake-in-japan-activation-1046-");',
  '  srcLine(s, [linkBy("Sentinel Asia"), linkBy("International Disaster Charter"), linkBy("ADRC")]);',
  '  footer(s);',
].join("\n");

const TO = [
  '  ' + MARK,
  '  // 発動ページは災害によって中身が違う。Sentinel Asia はアジア太平洋が対象で、',
  '  // コロンビアのような域外の災害では発動しない。ベタ書きのままだと、',
  '  // 日本の記事URLで「要請：ADRC」と書かれたページが出てしまう。',
  '  //   d.activation_pages あり   … その枚数だけ並べる',
  '  //   空配列                    … このページを出さない',
  '  //   無し                      … 従来どおり（熊本の出力は変わらない）',
  '  const ACT_LEGACY = [',
  '    { key: "sentinel_asia", title_en: "Sentinel Asia Emergency Observation (requested by ADRC)",',
  '      title_ja: "Sentinel Asia 緊急観測（要請：ADRC）", url: "https://sentinel-asia.org/EO/2026/article20260728JP.html" },',
  '    { key: "disaster_charter", title_en: "International Charter - Activation #1046 (requested by ADRC)",',
  '      title_ja: "国際災害チャーター Activation #1046（要請：ADRC）", url: "https://disasterscharter.org/activations/earthquake-in-japan-activation-1046-" },',
  '  ];',
  '  const acts = Array.isArray(d.activation_pages) ? d.activation_pages : ACT_LEGACY;',
  '  if (acts.length) {',
  '    s = p.addSlide(); s.background = { color: WHITE };',
  '    heading(s, "International Activation Pages (requested by ADRC)", "国際メカニズムの発動ページ（要請：ADRC）");',
  '    if (acts.length === 1) {',
  '      const a = acts[0];',
  '      imageSlot(s, 3.55, 1.20, 6.15, 5.30, a.key, a.title_en || "", a.title_ja || "", a.url || "");',
  '    } else {',
  '      const xs = [0.4, 6.75];',
  '      acts.slice(0, 2).forEach((a, i) => {',
  '        imageSlot(s, xs[i], 1.20, 6.15, 5.30, a.key, a.title_en || "", a.title_ja || "", a.url || "");',
  '      });',
  '    }',
  '    srcLine(s, [linkBy("Sentinel Asia"), linkBy("International Disaster Charter"), linkBy("ADRC")].filter(Boolean));',
  '    footer(s);',
  '  }',
  '  /* --- end activation pages --- */',
].join("\n");

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

  const n = src.split(FROM).length - 1;
  if (n !== 1) {
    console.error(`✗ 置換対象が ${n} 件でした（1件であるべき）。中断します。`);
    process.exit(2);
  }

  src = src.split(FROM).join(TO);

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log("    ✓ 発動ページを d.activation_pages で出し分ける");
  console.log("      空配列ならページごと出さない。キーが無ければ従来どおり");
  console.log("");
  console.log("  d.activation_pages を持たないイベント（熊本）の出力は変わりません。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".act.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.act.bak）`);
}

main();
