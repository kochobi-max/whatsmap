#!/usr/bin/env node
/*
 * apply_fitrows_measured.js — 右側の表が伸びて下へはみ出すのを止める
 *
 * 「被災市町村と人口」「被災地域」の表は `fitRows` で行数と行の高さを決めている。
 * ところが pptxgenjs の `rowH` は **最低の高さ**であって、上限ではない。
 * 備考の欄が折り返せば、その行はいくらでも伸びる。
 *
 * 2026-08-28、コロンビア版で右側の表の最下辺が y=7.87in（スライドは 7.5in）まで
 * 伸びていた。**スライドの外である。** 例外は出ない。
 *
 * 直し方: 決めた文字サイズで各行の実際の高さを見積もり、
 * 合計が使える高さに収まるところまで行数を減らす。
 * 減らした分は従来どおり「他N件（データ参照）」の行にまとまる。
 *
 * `opt.measure` を渡さない呼び出しは従来どおり。併記版（熊本）は測らない
 * （BI の出力を変えないため）。
 *
 * 使い方:
 *   node scripts/apply_fitrows_measured.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- fitRows measured (disaster-report) --- */";

const FROM = [
  'function fitRows(nBody, availH, opt = {}) {',
  '  const maxRowH = opt.maxRowH || 0.55, minRowH = opt.minRowH || 0.34;',
  '  const baseFont = opt.baseFont || 11, minFont = opt.minFont || 8;',
  '  let shownBody = nBody, cap = 0;',
  '  const maxFit = Math.max(2, Math.floor(availH / minRowH));',
  '  if (nBody + 1 > maxFit) { shownBody = Math.max(1, maxFit - 2); cap = nBody - shownBody; }',
  '  const totalRows = shownBody + 1 + (cap ? 1 : 0);',
  '  const rowH = Math.max(minRowH, Math.min(maxRowH, availH / totalRows));',
  '  const fontSize = Math.max(minFont, Math.min(baseFont, Math.round((baseFont * rowH / maxRowH) * 10) / 10));',
  '  return { shownBody, cap, rowH, fontSize };',
  '}',
].join("\n");

const TO = [
  MARK,
  'function fitRows(nBody, availH, opt = {}) {',
  '  const maxRowH = opt.maxRowH || 0.55, minRowH = opt.minRowH || 0.34;',
  '  const baseFont = opt.baseFont || 11, minFont = opt.minFont || 8;',
  '  let shownBody = nBody, cap = 0;',
  '  const maxFit = Math.max(2, Math.floor(availH / minRowH));',
  '  if (nBody + 1 > maxFit) { shownBody = Math.max(1, maxFit - 2); cap = nBody - shownBody; }',
  '  let totalRows = shownBody + 1 + (cap ? 1 : 0);',
  '  let rowH = Math.max(minRowH, Math.min(maxRowH, availH / totalRows));',
  '  let fontSize = Math.max(minFont, Math.min(baseFont, Math.round((baseFont * rowH / maxRowH) * 10) / 10));',
  '  // rowH は「最低の高さ」であって上限ではない。折り返す欄があれば行は伸びる。',
  '  // opt.measure(i, fontSize) で実際の高さを見積もり、収まるまで行を減らす。',
  '  if (opt.measure && !BI) {',
  '    const head = rowH;                        // 見出し行は折り返さない前提',
  '    const h = (i) => Math.max(rowH, opt.measure(i, fontSize));',
  '    while (shownBody > 1) {',
  '      let sum = head + (cap ? rowH : 0);',
  '      for (let i = 0; i < shownBody; i++) sum += h(i);',
  '      if (sum <= availH) break;',
  '      shownBody -= 1;',
  '      cap = nBody - shownBody;',
  '    }',
  '    totalRows = shownBody + 1 + (cap ? 1 : 0);',
  '  }',
  '  return { shownBody, cap, rowH, fontSize };',
  '}',
  '/* --- end fitRows measured --- */',
].join("\n");

// 呼び出し側に measure を渡す。右側に置く2つの表だけが対象。
// **8本目のパッチ（apply_receiver_slides_2.js）が当たったあとの形に合わせる。**
const CALLS = [
  {
    what: "被災地域の表",
    from: '  const fitA = fitRows(d.areas.length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8 });',
    to: [
      '  const fitA = fitRows(d.areas.length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8,',
      '    // 列幅は下の addTable と同じ [1.3, 1.4, 0.8, 0.6, 1.7]。備考がいちばん折り返す。',
      '    measure: (i, fs) => { const a = d.areas[i] || {}; return estRowH([',
      '      [TT(a.dept_en || "", a.dept_ja || ""), 1.3, fs, 3],',
      '      [TT(a.city_en || "", a.city_ja || ""), 1.4, fs, 3],',
      '      [TT(a.note_en || "", a.note_ja || ""), 1.7, Math.max(8, fs - 0.5), 3],',
      '    ], 0.36); } });',
    ].join("\n"),
  },
  {
    what: "被災市町村と人口の表",
    from: '  const fitC = fitRows((d.cities || []).length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8 });',
    to: [
      '  const fitC = fitRows((d.cities || []).length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8,',
      '    // 列幅は下の addTable と同じ [0.4, 2.4, 1.3, 1.7]。備考がいちばん折り返す。',
      '    measure: (i, fs) => { const c = (d.cities || [])[i] || {}; return estRowH([',
      '      [`${c.name_en} / ${c.name_ja}`, 2.4, fs, 4],',
      '      [`${c.note_en} / ${c.note_ja}`, 1.7, Math.max(8, fs - 0.5), 4],',
      '    ], 0.36); } });',
    ].join("\n"),
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

  const n = src.split(FROM).length - 1;
  if (n !== 1) { console.error(`✗ fitRows の定義が ${n} 件でした（1件であるべき）。中断します。`); process.exit(2); }
  src = src.split(FROM).join(TO);

  for (const c of CALLS) {
    const k = src.split(c.from).length - 1;
    if (k !== 1) {
      console.error(`✗ 「${c.what}」の呼び出しが ${k} 件でした（1件であるべき）。中断します。`);
      console.error("  apply_receiver_slides_2.js を先に当ててください。");
      process.exit(2);
    }
    src = src.split(c.from).join(c.to);
  }

  try { new vm.Script(src, { filename: file }); }
  catch (e) { console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`); process.exit(3); }

  console.log(`  対象: ${file}`);
  console.log("    ✓ 行が折り返して伸びるぶんを見積もり、収まるまで行数を減らす");
  for (const c of CALLS) console.log("    ✓ " + c.what + " に実測を渡した");
  console.log("");
  console.log("  併記版（熊本）は測らないので出力は変わりません。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".fitrows.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.fitrows.bak）`);
}

main();
