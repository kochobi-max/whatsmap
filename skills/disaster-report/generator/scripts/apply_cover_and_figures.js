#!/usr/bin/env node
/*
 * apply_cover_and_figures.js — 目視で出た3点を直す（15本目のパッチ）
 *
 *   1. 表紙3行目のあふれ
 *      1行前提の高さ0.3インチの枠に、折り返した2行目が入りきらず、
 *      区切り線とADRCロゴに重なっていた。枠をロゴの手前で止め、
 *      高さを確保し、shrinkText で収める。
 *
 *   2. USGS PAGER のページに図が無い
 *      受け皿は本文と出典だけを描いていて、画像を置く場所が無かった。
 *      イベントJSONに usgs_pager があるときだけ、本文の下に図を置く。
 *      無いイベント（熊本）では従来どおり本文だけになる。
 *
 *   3. 時系列の時刻がどの時間帯か分からない
 *      d.meta.tz_note_en / tz_note_ja があれば副題に添える。
 *      持たないイベントの出力は変わらない。
 *
 * 2026-08-28、荒木田さんの目視で出た指摘。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MARK = "/* --- cover and figures (disaster-report) --- */";

function main() {
  const argv = process.argv;
  let file = null, dry = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--dry-run") dry = true;
  }
  if (!file) { console.error("✗ --file が必要です"); process.exit(1); }
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(MARK)) { console.log("   すでにパッチ済み。何もしません"); return; }

  const edits = [];

  // ---- 1. 表紙3行目 ----
  // 枠にも文字サイズにも触れない。**表紙用の短い震央表記を持てるようにするだけ。**
  // epicentre_short_en/ja を持たないイベント（熊本）の出力は1ピクセルも変わらない。
  // max_intensity_short と同じ考え方。
  const coverRe = /\$\{d\.event\.magnitude\}\$\{intensitySeg\(\)\}   ·   \$\{d\.event\.epicentre_ja\}/;
  edits.push({
    name: "表紙3行目の震央表記",
    re: coverRe,
    to: "${d.event.magnitude}${intensitySeg()}   ·   ${LP(d.event, 'epicentre_short') || d.event.epicentre_ja}",
  });

  // ---- 2. PAGER の図 ----
  const pagerRe = /(\], \{ x: 0\.4, y: 1\.15, w: 12\.5, h: 5\.45, align: "left", valign: "top", fontFace: FONT, margin: 4, shrinkText: true \}\);\n)(  srcLine\(s, \[d\.pager\.url)/;
  edits.push({
    name: "PAGERページの図",
    re: pagerRe,
    to: '], { x: 0.4, y: 1.15, w: 12.5, h: (resolveImg("usgs_pager") ? 1.75 : 5.45), align: "left", valign: "top", fontFace: FONT, margin: 4, shrinkText: true });\n'
      + '  // 図があるときだけ本文の下に置く。無いイベントでは本文が従来の高さのまま\n'
      + '  if (resolveImg("usgs_pager")) {\n'
      + '    imageSlot(s, 1.9, 3.0, 9.5, 3.6, "usgs_pager",\n'
      + '      (d.pager && d.pager.figure_en) || "USGS PAGER — estimated fatalities and economic losses",\n'
      + '      (d.pager && d.pager.figure_ja) || "USGS PAGER — 推定死者数・経済損失", d.pager && d.pager.url);\n'
      + '  }\n'
      + '  srcLine(s, [d.pager.url',
  });

  // ---- 3. 時系列の時間帯注記 ----
  const tlRe = /(s\.addText\("Government \/ agency actions from onset — all official sources\. 地震発生からの政府・機関の主要な動き（すべて公的情報）。",)/;
  edits.push({
    name: "時系列の時間帯注記",
    re: tlRe,
    to: 's.addText("Government / agency actions from onset — all official sources."\n'
      + '      + ((d.meta && d.meta.tz_note_en) ? " " + d.meta.tz_note_en : "")\n'
      + '      + " 地震発生からの政府・機関の主要な動き（すべて公的情報）。"\n'
      + '      + ((d.meta && d.meta.tz_note_ja) ? d.meta.tz_note_ja : ""),',
  });

  // 置換対象は1件でなければ何もしない
  let bad = false;
  for (const e of edits) {
    const n = (src.match(new RegExp(e.re.source, "g")) || []).length;
    console.log(`   - ${e.name}: ${n}件`);
    if (n !== 1) bad = true;
  }
  if (bad) {
    console.error("✗ 想定した箇所を特定できないため中断しました。曖昧一致では書き換えません。");
    process.exit(2);
  }

  for (const e of edits) src = src.replace(e.re, e.to);
  src = src.replace(/^/, MARK + "\n");

  try { new vm.Script(src, { filename: file }); }
  catch (err) { console.error("✗ 適用後に構文エラー。書き込みません: " + err.message); process.exit(3); }

  if (dry) { console.log("   --dry-run のため書き込みません"); return; }
  fs.copyFileSync(file, file + ".cover.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log("   ✓ 表紙3行目・PAGERの図・時系列の時間帯注記");
  console.log("✓ 適用しました（元ファイルは " + path.basename(file) + ".cover.bak）");
}
main();
