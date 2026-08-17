#!/usr/bin/env node
/*
 * apply_locator_patch.js — 地理ロケータ（世界→国→震央の3面図）をデータ駆動にする
 *
 * Slide 1 の3面ロケータは、中心座標・ズーム・赤枠の緯度経度・ラベルが
 * すべて熊本前提のリテラルになっている。海外災害では日本地図が出てしまうため、
 * これを `d.locator` から読むようにする。
 *
 * **既定値は現在の熊本の値そのまま。** `d.locator` が無ければ出力は1ピクセルも変わらない。
 *
 * データ形（イベントJSON）:
 *   "locator": {
 *     "city_map": { "cLat": 32.655, "cLon": 130.707, "zoom": 10 },
 *     "steps": [
 *       { "key": "google_world", "label_en": "World → Japan", "label_ja": "世界→日本",
 *         "cap": "© Google", "map": { "cLat": 36, "cLon": 138, "zoom": 4 },
 *         "box": { "n": 45.8, "s": 30.0, "w": 128.5, "e": 146.5 } },
 *       { "key": "google_japan", "label_en": "Japan → Kumamoto", "label_ja": "日本→熊本",
 *         "cap": "© Google", "map": { "cLat": 32.7, "cLon": 130.8, "zoom": 7 },
 *         "box": { "n": 33.35, "s": 31.95, "w": 130.05, "e": 131.55 } },
 *       { "key": "intensity_map", "label_en": "JMA intensity", "label_ja": "気象庁 震度分布",
 *         "cap": "© JMA" }
 *     ]
 *   }
 *
 * 3段目に box は不要（それ以上ズームしないため）。
 * `city_map` は Slide 4 の市町村マーカー配置に使う。画像 `google_cities` の
 * 中心・ズームと必ず一致させること。
 *
 * 使い方:
 *   node scripts/apply_locator_patch.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- locator from data (disaster-report) --- */";

// 置換対象。それぞれちょうど1回見つからなければ中断する。
const EDITS = [
  {
    name: "CITY_MAP",
    re: /^const CITY_MAP = \{[^\n]*\n/m,
    to: `${MARK}
// d.locator が無ければ従来の熊本の値を使う（出力は変わらない）。
const LOC = (d.locator && typeof d.locator === "object") ? d.locator : {};
const LOC_STEPS = (Array.isArray(LOC.steps) && LOC.steps.length === 3) ? LOC.steps : [
  { key: "google_world", label_en: "World → Japan", label_ja: "世界→日本", cap: "© Google",
    map: { cLat: 36, cLon: 138, zoom: 4 }, box: { n: 45.8, s: 30.0, w: 128.5, e: 146.5 } },
  { key: "google_japan", label_en: "Japan → Kumamoto", label_ja: "日本→熊本", cap: "© Google",
    map: { cLat: 32.7, cLon: 130.8, zoom: 7 }, box: { n: 33.35, s: 31.95, w: 130.05, e: 131.55 } },
  { key: "intensity_map", label_en: "JMA intensity", label_ja: "気象庁 震度分布", cap: "© JMA" },
];
// 市町村マーカー用。画像 google_cities の中心・ズームと一致させること。
const CITY_MAP = LOC.city_map || { cLat: 32.655, cLon: 130.707, zoom: 10 };
/* --- end locator from data --- */
`,
  },
  {
    name: "seq",
    re: /^const seq = \[\n(?:[^\n]*\n){3}\];\n/m,
    to: `const LOC_CIRCLED = ["①", "②", "③"];
// ラベルは従来と同じ "① World → Japan / 世界→日本" の形で組む
// （単言語版の分離は既存の言語レイヤがこの書式を前提にしているため崩さない）。
const seq = LOC_STEPS.map((st, i) => ({
  t: \`\${LOC_CIRCLED[i]} \${st.label_en} / \${st.label_ja}\`,
  key: st.key,
  cap: st.cap || "© Google",
}));
`,
  },
  {
    name: "WORLD_MAP / JAPAN_MAP",
    re: /^const WORLD_MAP = \{[^\n]*\n^const JAPAN_MAP = \{[^\n]*\n/m,
    to: `const WORLD_MAP = LOC_STEPS[0].map || { cLat: 36, cLon: 138, zoom: 4 };
const JAPAN_MAP = LOC_STEPS[1].map || { cLat: 32.7, cLon: 130.8, zoom: 7 };
`,
  },
  {
    name: "rw (1段目の赤枠)",
    re: /^const rw = geoRect\(WORLD_MAP,[^\n]*\n/m,
    to: `const LOC_BOX0 = LOC_STEPS[0].box || { n: 45.8, s: 30.0, w: 128.5, e: 146.5 };
const rw = geoRect(WORLD_MAP, LOC_BOX0.n, LOC_BOX0.s, LOC_BOX0.w, LOC_BOX0.e, xs[0]);
`,
  },
  {
    name: "rj (2段目の赤枠)",
    re: /^const rj = geoRect\(JAPAN_MAP,[^\n]*\n/m,
    to: `const LOC_BOX1 = LOC_STEPS[1].box || { n: 33.35, s: 31.95, w: 130.05, e: 131.55 };
const rj = geoRect(JAPAN_MAP, LOC_BOX1.n, LOC_BOX1.s, LOC_BOX1.w, LOC_BOX1.e, xs[1]);
`,
  },
];

function countMatches(src, re) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (src.match(g) || []).length;
}

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
    const n = countMatches(src, e.re);
    if (n !== 1) problems.push(`${e.name}: ${n}件（1件であるべき）`);
  }
  if (problems.length) {
    console.error("✗ 置換対象を特定できないため中断しました。gen_deck.js の該当箇所が変わっています。");
    problems.forEach(p => console.error(`   - ${p}`));
    console.error("\n  このスクリプトは曖昧一致で書き換えません。README の「地理ロケータ」を参照して手で当ててください。");
    process.exit(2);
  }

  for (const e of EDITS) src = src.replace(e.re, () => e.to);

  try {
    new vm.Script(src, { filename: file });
  } catch (err) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${err.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  EDITS.forEach(e => console.log(`    ✓ ${e.name}`));
  console.log(`\n  d.locator が無ければ従来の熊本の値を使う（出力は変わらない）。`);

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".locator.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.locator.bak）`);
}

main();
