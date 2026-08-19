#!/usr/bin/env node
/*
 * apply_param_table_fit.js — 震源・震度の諸元表が下端を越えるのを止める
 *
 * 諸元表は 12.5pt / 行高 0.54 の決め打ちで、9行＋見出しを y=1.35 から並べていた。
 * 値が1行に収まる前提の設計で、折り返しが増えると下へ流れる。
 *
 * apply_bilingual_fields.js（7本目）で「発震機構」「有感範囲」をデータ優先にした結果、
 *
 *   横ずれ断層型（東北東－西南西）
 *     → 横ずれ断層型、圧力軸は東北東-西南西（気象庁・速報）
 *
 * と長くなり、熊本149ページ版で実際に表がページ下端を越えた（QAで8件）。
 * パッチ前は0件だったので、これは7本目が持ち込んだ退行である。
 *
 * ここでは値の折り返し行数を見積もり、**収まる文字サイズまで縮めてから**描く。
 * 収まっているイベントでは 12.5pt のままなので出力は変わらない。
 *
 * 使い方:
 *   node scripts/apply_param_table_fit.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- parameter table fit (disaster-report) --- */";

const FROM = [
  '  s.addTable([[tableHeaderCell("Item / 項目"), tableHeaderCell("Value / 値")]].concat(',
  '    prm.map((r, i) => [',
  '      { text: r[0], options: { fontSize: 12.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },',
  '      { text: r[1], options: { fontSize: 12.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },',
  '    ])',
  '  ), { x: 8.05, y: 1.35, w: 4.85, colW: [2.25, 2.6], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.54, valign: "middle" });',
].join("\n");

const TO = [
  '  ' + MARK,
  '  // 値の折り返しを数えて、表が下端（出典行の手前 y=6.72）を越えない文字サイズにする。',
  '  // 12.5pt で収まるイベントでは 12.5pt のままなので、出力は変わらない。',
  '  const PRM_AVAIL = 6.72 - 1.35;        // 表に使える高さ',
  '  const PRM_VW = 2.6, PRM_LW = 2.25;    // 値の列幅・項目の列幅',
  '  const prmCols = (fsz, w) => ({',
  '    cjk: Math.max(4, Math.floor((w - 0.12) * 72 / fsz)),          // 全角は約1em',
  '    asc: Math.max(6, Math.floor((w - 0.12) * 72 / (fsz * 0.55))), // 半角は約0.55em',
  '  });',
  '  let prmFs = 12.5;',
  '  for (; prmFs > 8; prmFs -= 0.5) {',
  '    const v = prmCols(prmFs, PRM_VW), l = prmCols(prmFs, PRM_LW);',
  '    let lines = 1;                                                 // 見出し行',
  '    for (const r of prm) {',
  '      // 行の高さは項目列と値列の高い方で決まる。日英併記では項目列も折り返す。',
  '      lines += Math.max(1, estLinesBi(r[0], l.asc, l.cjk), estLinesBi(r[1], v.asc, v.cjk));',
  '    }',
  '    // 行の高さ = 文字サイズ×1.4（行間）＋ セル上下の余白',
  '    if (lines * (prmFs / 72) * 1.4 + (prm.length + 1) * 0.12 <= PRM_AVAIL) break;',
  '  }',
  '  const prmRowH = Math.max(0.30, Math.min(0.54, PRM_AVAIL / (prm.length + 1)));',
  '  s.addTable([[tableHeaderCell("Item / 項目"), tableHeaderCell("Value / 値")]].concat(',
  '    prm.map((r, i) => [',
  '      { text: r[0], options: { fontSize: prmFs, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },',
  '      { text: r[1], options: { fontSize: prmFs, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },',
  '    ])',
  '  ), { x: 8.05, y: 1.35, w: 4.85, colW: [2.25, 2.6], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: prmRowH, valign: "middle" });',
  '  /* --- end parameter table fit --- */',
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
    console.error("  震源・震度の諸元表の記述が変わっている可能性があります。");
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
  console.log("    ✓ 諸元表の文字サイズを、収まる大きさまで自動で縮める");
  console.log("");
  console.log("  12.5pt で収まるイベントでは 12.5pt のまま。出力は変わりません。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".prm.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.prm.bak）`);
}

main();
