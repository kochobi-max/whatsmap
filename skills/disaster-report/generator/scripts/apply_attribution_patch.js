#!/usr/bin/env node
/*
 * apply_attribution_patch.js — 出典行・図キャプション・発震機構の日本固有リテラルを外出しする
 *
 * 統一版のスライド本文には、熊本前提の記述が直接書かれている箇所がある。
 * ビルドは通るので機械検査では捕まらないが、他国のイベントで実際にビルドすると
 * レポートの中身に日本の機関名・熊本の諸元が混入する（コロンビアで9/30ページに混入を確認）。
 *
 * ここでは **既定値を現在の熊本の記述のまま**にして、データがあればそちらを使う形にする。
 * したがって熊本の出力は1バイトも変わらない。
 *
 * 追加されるデータ形（イベントJSON、いずれも任意）:
 *
 *   "image_captions": {                       図キャプションと出典URLの差し替え
 *     "intensity_map":          { "en": "...", "ja": "...", "url": "..." },
 *     "epicentre_distribution": { "en": "...", "ja": "...", "url": "..." }
 *   },
 *   "mechanism_points": [                     発震機構の箇条書き（諸元・発震機構・震源断層）
 *     { "tier": "official", "en": "...", "ja": "..." }
 *   ],
 *   "attribution_en": "Figures from UNGRD; source tier shown per row.",
 *   "attribution_ja": "UNGRDの集計に基づき各回更新（各行に出典ティアを表示）。"
 *
 * `d.links` に "Population" / "Hypocentre" を含むラベルの項目があれば、
 * 人口出典と震央分布の出典行もそちらが使われる。
 *
 * 使い方:
 *   node scripts/apply_attribution_patch.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- attribution from data (disaster-report) --- */";

// 図キャプションをデータで差し替えるヘルパ。imageSlot の引数へ展開して使う。
const HELPER = `${MARK}
// 図のキャプションと出典URLを d.image_captions[key] で差し替える。
// 指定が無ければ引数で渡された既定値（＝従来の熊本の記述）をそのまま使う。
function capOf(key, defEn, defJa, defUrl) {
  const c = (d.image_captions || {})[key] || {};
  return [c.en || defEn, c.ja || defJa, c.url || defUrl];
}
// 出典行の項目。d.links に該当ラベルがあればそれを、無ければ既定値を返す。
function srcOr(sub, label, url) { return linkBy(sub) || { label, url }; }
// 表紙の「最大震度 X（気象庁）」。値が無ければ区切りごと省く（"undefined" を出さない）。
// 発表機関は d.event.intensity_agency_en/ja で差し替えられる（既定は気象庁）。
function intensitySeg() {
  const v = d.event && d.event.max_intensity;
  if (v === undefined || v === null || v === "") return "";
  return (ENO || BI)
    ? "   ·   Max. seismic intensity " + v + " (" + (d.event.intensity_agency_en || "JMA") + ")"
    : "   ·   最大震度" + v + "（" + (d.event.intensity_agency_ja || "気象庁") + "）";
}
/* --- end attribution from data --- */`;

const EDITS = [
  {
    name: "Slide 4 人口の出典行（総務省統計局）",
    find: `srcLine(s, [{ label: "Population: e-Stat / 総務省統計局", url: "https://www.e-stat.go.jp/" }, { label: "Google Maps", url: \`https://www.google.com/maps/@32.655,130.707,10z\` }]);`,
    to: `srcLine(s, [srcOr("Population", "Population: e-Stat / 総務省統計局", "https://www.e-stat.go.jp/"), { label: "Google Maps", url: \`https://www.google.com/maps/@\${CITY_MAP.cLat},\${CITY_MAP.cLon},\${CITY_MAP.zoom}z\` }]);`,
  },
  {
    name: "Slide 5 震度分布図のキャプション",
    find: `imageSlot(s, 0.4, 1.2, 7.4, 5.5, "intensity_map", "JMA seismic intensity map", "気象庁 震度分布図", "https://www.jma.go.jp/bosai/map.html#9/32.748/130.328/&elem=int&contents=earthquake_map");`,
    to: `imageSlot(s, 0.4, 1.2, 7.4, 5.5, "intensity_map", ...capOf("intensity_map", "JMA seismic intensity map", "気象庁 震度分布図", "https://www.jma.go.jp/bosai/map.html#9/32.748/130.328/&elem=int&contents=earthquake_map"));`,
  },
  {
    name: "Slide 6 震央分布図のキャプション",
    find: `imageSlot(s, 0.4, 1.2, 6.4, 5.35, "epicentre_distribution", "JMA hypocentre distribution (24h)", "気象庁 震央分布図（24時間）", "https://www.jma.go.jp/bosai/map.html#9/32.539/130.66/&contents=hypo");`,
    to: `imageSlot(s, 0.4, 1.2, 6.4, 5.35, "epicentre_distribution", ...capOf("epicentre_distribution", "JMA hypocentre distribution (24h)", "気象庁 震央分布図（24時間）", "https://www.jma.go.jp/bosai/map.html#9/32.539/130.66/&contents=hypo"));`,
  },
  {
    name: "Slide 6 震央分布の出典行",
    find: `srcLine(s, [{ label: "JMA hypocentre map / 気象庁 震央分布図", url: "https://www.jma.go.jp/bosai/map.html#9/32.539/130.66/&contents=hypo" }, { label: "JMA aftershock counts / 地震回数", url: "https://www.data.jma.go.jp/eqev/data/2026_07_28_kumamoto/kumamoto_jishinkaisu.pdf" }, linkBy("USGS")]);`,
    to: `srcLine(s, [srcOr("Hypocentre", "JMA hypocentre map / 気象庁 震央分布図", "https://www.jma.go.jp/bosai/map.html#9/32.539/130.66/&contents=hypo"), srcOr("Aftershock counts", "JMA aftershock counts / 地震回数", "https://www.data.jma.go.jp/eqev/data/2026_07_28_kumamoto/kumamoto_jishinkaisu.pdf"), linkBy("USGS")]);`,
  },
  {
    name: "Slide 6b 発震機構の箇条書き",
    // 3項目の配列リテラルを d.mechanism_points で差し替え可能にする
    re: /biBulletsTier\(s, 0\.4, 1\.2, 6\.7, 1\.95, \[\n(?<body>(?:[^\n]*\n){3})\]\);/,
    build: m => `biBulletsTier(s, 0.4, 1.2, 6.7, 1.95, (d.mechanism_points && d.mechanism_points.length) ? d.mechanism_points : [\n${m.groups.body}]);`,
  },
  {
    name: "表紙の最大震度（値が無いと undefined が出る）",
    find: `s.addText(LX(\`\${d.event.magnitude}   ·   Max. seismic intensity \${d.event.max_intensity} (JMA)   ·   \${d.event.epicentre_en}\`,
  \`\${d.event.magnitude}   ·   Max. seismic intensity \${d.event.max_intensity} (JMA)   ·   \${d.event.epicentre_en}\`,
  \`\${d.event.magnitude}   ·   最大震度\${d.event.max_intensity}（気象庁）   ·   \${d.event.epicentre_ja}\`)`,
    to: `s.addText(LX(\`\${d.event.magnitude}\${intensitySeg()}   ·   \${d.event.epicentre_en}\`,
  \`\${d.event.magnitude}\${intensitySeg()}   ·   \${d.event.epicentre_en}\`,
  \`\${d.event.magnitude}\${intensitySeg()}   ·   \${d.event.epicentre_ja}\`)`,
  },
  {
    name: "Slide 5 基本情報の出典（気象庁 第3報）",
    find: `    ["Source / 出典", LX("JMA (3rd report)", "JMA (3rd report)", "気象庁（第3報）")],`,
    to: `    ["Source / 出典", LX((d.event.source_en || "JMA (3rd report)") + " / " + (d.event.source_ja || "気象庁（第3報）"), d.event.source_en || "JMA (3rd report)", d.event.source_ja || "気象庁（第3報）")],`,
  },
  {
    name: "Slide 8 被害状況の出典注記",
    find: `s.addText("Figures from FDMA / NPA / Kumamoto Pref.; source tier shown per row. 消防庁・警察庁・熊本県等の集計に基づき各回更新（各行に出典ティアを表示）。",`,
    to: `s.addText(TT(d.attribution_en || "Figures from FDMA / NPA / Kumamoto Pref.; source tier shown per row.", d.attribution_ja || "消防庁・警察庁・熊本県等の集計に基づき各回更新（各行に出典ティアを表示）。", " "),`,
  },
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

  // 事前確認: すべての置換対象がちょうど1回あること
  const problems = [];
  for (const e of EDITS) {
    const n = e.re
      ? (src.match(new RegExp(e.re.source, e.re.flags + "g")) || []).length
      : src.split(e.find).length - 1;
    if (n !== 1) problems.push(`${e.name}: ${n}件（1件であるべき）`);
  }
  if (problems.length) {
    console.error("✗ 置換対象を特定できないため中断しました。gen_deck.js の該当箇所が変わっています。");
    problems.forEach(p => console.error(`   - ${p}`));
    process.exit(2);
  }

  for (const e of EDITS) {
    src = e.re ? src.replace(e.re, m0 => e.build(e.re.exec(m0))) : src.split(e.find).join(e.to);
  }

  // ヘルパは linkBy より後、最初のスライドより前に置く必要がある。
  // linkBy の定義直後に差し込む。
  const anchor = /^function linkBy\(sub\) \{[^\n]*\n/m;
  if (!anchor.test(src)) { console.error("✗ linkBy の定義が見つかりません。中断します。"); process.exit(2); }
  src = src.replace(anchor, m => m + HELPER + "\n");

  try {
    new vm.Script(src, { filename: file });
  } catch (err) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${err.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  EDITS.forEach(e => console.log(`    ✓ ${e.name}`));
  console.log(`\n  既定値は現在の熊本の記述のまま。データがあるときだけ差し替わる。`);

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".attrib.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.attrib.bak）`);
}

main();
