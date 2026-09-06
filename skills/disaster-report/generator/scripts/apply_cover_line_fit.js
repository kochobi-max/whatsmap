#!/usr/bin/env node
/*
 * apply_cover_line_fit.js — 表紙の「規模・震度・震源」の行が右上のロゴに潜り込むのを止める。
 *
 * **何が起きたか（2026-09-06）**
 *
 * コロンビアの英語版の表紙で、qa_layout_check.py が「画像と重なり 85%」を検出した。
 * 実測すると、この行は x=908.7pt まで伸び、ADRC ロゴ（x=862.6〜933.1pt、
 * y=14.4〜84.9pt）と重なっていた。行自体は y=61.3〜74.3pt でロゴの帯の中にある。
 *
 * 原因は heading() と同じ系統である。枠は `w: 12.33` と広く取ってあり、
 * **中央揃えなので長い文はロゴの下まで伸びる。** 熊本のように短ければ届かない。
 *
 * **直し方**
 * 中央揃えのまま、ロゴに届かない範囲に収まるまで fontSize を下げる。
 * 中央は 0.5 + 12.33/2 = 6.665in。ロゴの左端は W - 1.5 = 11.83in。
 * 手前 0.15in をあけると、片側の余裕は 11.83 - 0.15 - 6.665 = 5.015in。
 * つまり文字列の幅は 10.03in までなら、左右どちらもロゴに触れない。
 *
 * 幅の見積もりは apply_title_fit.js と同じ較正値（全角1.20em / 半角0.60em）。
 * 収まっている表紙は何も変わらない。
 *
 * このパッチは apply_cover_and_figures.js が作る行を対象にするので、
 * apply_all.js ではその**後ろ**に置くこと。
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const MARK = "COVER_LINE_FIT_APPLIED";
const argv = process.argv.slice(2);
const fi = argv.indexOf("--file");
const file = fi >= 0 ? argv[fi + 1] : argv.find(a => !a.startsWith("--"));
if (!file) { console.error("usage: apply_cover_line_fit.js --file <gen_deck.js>"); process.exit(2); }

let src = fs.readFileSync(file, "utf8");
if (src.includes(MARK)) { console.log("apply_cover_line_fit: 既に当たっている（何もしない）"); process.exit(0); }

const target = `), { x: 0.5, y: 0.876, w: 12.33, h: 0.3, align: "center", color: INK, fontSize: 13, fontFace: FONT });`;
const count = src.split(target).length - 1;
if (count !== 1) {
  console.error("apply_cover_line_fit: 対象が " + count + " 件（1件であるべき）。当てない。");
  console.error("  apply_cover_and_figures.js の後に実行しているかを確かめる。");
  process.exit(3);
}

const replacement = `), { x: 0.5, y: 0.876, w: 12.33, h: 0.3, align: "center", color: INK,
  // ${MARK}
  // 中央揃えなので、長い文は右上のADRCロゴの下まで伸びる。
  // 2026-09-06、コロンビア英語版で 85% 重なっていた（実測 x=908.7pt / ロゴ x=862.6pt〜）。
  // ロゴに届かない幅（片側 5.015in ＝ 全体 10.03in）に収まるまで fontSize を下げる。
  fontSize: coverLineSize(LX(\`\${d.event.magnitude}\${intensitySeg()}   ·   \${d.event.epicentre_en}\`,
    \`\${d.event.magnitude}\${intensitySeg()}   ·   \${d.event.epicentre_en}\`,
    \`\${d.event.magnitude}\${intensitySeg()}   ·   \${LP(d.event, 'epicentre_short') || d.event.epicentre_ja}\`)),
  fontFace: FONT });`;

// 幅の見積もりは apply_title_fit.js と同じ較正値
const helper = `
// ${MARK} — 表紙の1行が右上のロゴに触れない大きさを返す。
// 中央 6.665in、ロゴ左端 W-1.5、手前 0.15in をあけて、片側 5.015in ＝ 全体 10.03in。
// 幅の見積もりは apply_title_fit.js と同じ較正値（全角1.20em / 半角0.60em）。実測で合わせてある。
function coverLineSize(text) {
  const MAXW = 2 * ((W - 1.5) - 0.15 - (0.5 + 12.33 / 2));
  let em = 0;
  for (const ch of String(text)) em += (ch.charCodeAt(0) < 0x2000 ? 0.60 : 1.20);
  let size = 13;
  while (em * size / 72 > MAXW && size > 8) size -= 0.5;
  return size;
}
`;

const anchor = "function LX(bi, en, ja)";
if (src.split(anchor).length - 1 !== 1) {
  console.error("apply_cover_line_fit: LX の定義が見つからない（1件であるべき）。当てない。");
  process.exit(3);
}
src = src.replace(target, replacement).replace(anchor, helper + anchor);

try { new vm.Script(src, { filename: file }); }
catch (e) { console.error("apply_cover_line_fit: 当てると構文が壊れる — " + e.message); process.exit(4); }

fs.writeFileSync(file + ".bak", fs.readFileSync(file));
fs.writeFileSync(file, src);
console.log("apply_cover_line_fit: 当てた（1件）");
