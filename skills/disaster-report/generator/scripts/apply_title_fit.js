#!/usr/bin/env node
/*
 * apply_title_fit.js — 見出しが右上の ADRC ロゴに潜り込むのを止める。
 *
 * **何が起きたか（2026-09-06）**
 *
 * ネパールの時系列が5ページになり、見出しが
 *   「対応の時系列（2026年8月25日〜9月5日（ネパール標準時 UTC+5:45））（1/5）」
 * まで伸びた。qa_layout_check.py が p.2〜p.6 で「画像と重なり 68%」を検出。
 * 実測では見出しの末尾が x=913pt まで届き、ロゴ画像（x=862〜931pt）と 51pt 重なっていた。
 *
 * **原因は `shrinkText` が効いていないこと。**
 * heading() は `{ w: 11.3, wrap: false, shrinkText: true }` で描いている。
 * `shrinkText` は PowerPoint の自動縮小に対応する指定で、**LibreOffice の
 * PDF 変換はこれを無視する。** `wrap: false` なので折り返しもせず、
 * 文字はそのまま枠外へ伸びてロゴの下に入る。PPTX を PowerPoint で開くと
 * 縮んで見えるため、**PPTX だけ見ていると気づけない。**
 *
 * **直し方**
 * 自前で幅を測り、収まるまで fontSize を下げる。LibreOffice でも効く。
 * 収まっている見出しは何も変わらない（熊本を含め、既存の出力は不変）。
 *
 * 幅の見積もりは、全角=1em / 半角=0.5em の単純和。見出しは1行なのでこれで足りる。
 * 使える幅は「左端 0.4in から、ロゴの左端 W-1.5=11.83in の手前 0.15in まで」。
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const MARK = "TITLE_FIT_APPLIED";
// apply_all.js は `node <patch> --file <パス>` の形で呼ぶ。裸のパスも受ける。
const argv = process.argv.slice(2);
const fi = argv.indexOf("--file");
const file = fi >= 0 ? argv[fi + 1] : argv.find(a => !a.startsWith("--"));
if (!file) { console.error("usage: apply_title_fit.js --file <gen_deck.js>"); process.exit(2); }

let src = fs.readFileSync(file, "utf8");
if (src.includes(MARK)) { console.log("apply_title_fit: 既に当たっている（何もしない）"); process.exit(0); }

const target = `  slide.addText(
    runs,
    { x: 0.4, y: 0.30, w: 11.3, h: 0.66, align: "left", margin: 0, valign: "middle", wrap: false, shrinkText: true }
  );`;

const count = src.split(target).length - 1;
if (count !== 1) {
  console.error("apply_title_fit: 対象が " + count + " 件（1件であるべき）。当てない。");
  process.exit(3);
}

const replacement = `  // ${MARK}
  // shrinkText は PowerPoint の自動縮小で、**LibreOffice の PDF 変換は無視する。**
  // wrap:false なので折り返しもせず、長い見出しは枠外へ伸びて右上のロゴに潜り込む。
  // 2026-09-06、ネパールの時系列が5ページになり「（1/5）」まで含めた見出しが
  // ロゴと 51pt 重なった。PPTX を PowerPoint で開くと縮んで見えるため気づけない。
  // ここで自前に幅を測り、収まるまで fontSize を下げる。収まっていれば何も変えない。
  {
    const TITLE_X = 0.4;
    const LOGO_X = W - 1.5;          // logoMark(slide, W - 1.5, ...) と同じ
    const MAXW = LOGO_X - TITLE_X - 0.15;   // ロゴの手前に 0.15in あける
    // 幅の見積もり。**実測で較正してある。**
    // 素朴な「全角1em / 半角0.5em」は実測より約19%小さく出た。
    // 2026-09-06 のネパールの見出しは、その式で 10.35in と出たが実測 12.28in。
    // 太字ゴシックと LibreOffice の代替フォントは、その仮定より横に広い。
    // 較正した値を使う（1.20 / 0.60）。**少し縮みすぎるのは無害だが、
    // 縮み足りないとロゴに潜り込む。** 迷う側を決めておく。
    const widthIn = rs => rs.reduce((sum, r) => {
      const fs2 = (r.options && r.options.fontSize) || 21;
      let em = 0;
      for (const ch of String(r.text)) em += (ch.charCodeAt(0) < 0x2000 ? 0.60 : 1.20);
      return sum + em * fs2 / 72;
    }, 0);
    let guard = 0;
    while (widthIn(runs) > MAXW && guard++ < 40) {
      let changed = false;
      for (const r of runs) {
        const o = r.options || (r.options = {});
        const cur = o.fontSize || 21;
        if (cur > 11) { o.fontSize = cur - 0.5; changed = true; }
      }
      if (!changed) break;              // 下限。これ以上は縮めない
    }
  }
  slide.addText(
    runs,
    { x: 0.4, y: 0.30, w: 11.3, h: 0.66, align: "left", margin: 0, valign: "middle", wrap: false, shrinkText: true }
  );`;

src = src.replace(target, replacement);
try { new vm.Script(src, { filename: file }); }
catch (e) { console.error("apply_title_fit: 当てると構文が壊れる — " + e.message); process.exit(4); }

fs.writeFileSync(file + ".bak", fs.readFileSync(file));
fs.writeFileSync(file, src);
console.log("apply_title_fit: 当てた（1件）");
