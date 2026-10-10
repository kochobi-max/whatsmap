#!/usr/bin/env node
/*
 * apply_srcline_fit.js — スライド下部の「出典」行が、ページ番号の帯に食い込むのを止める。
 *
 * **何が起きたか（2026-09-14）**
 *
 * インドネシアのビルドが `STATUS: FAIL footer-overlap` で落ち続けた。
 * 1ページの詰めを 1 → 0.9 → 0.82 → 0.75 まで下げても、**同じ y=7.128in に
 * 罫線が出たまま動かなかった。** 表なら詰めで動くので、表ではない。
 *
 * 実体は出典行のURLの下線だった。`srcLine` は y=6.86・高さ 0.24in に描いている。
 * 下端はちょうど 7.10in で、検査のしきい値と同じである。出典が増えて
 * **1行に収まらなくなると2行目が帯に落ちる。** 位置が固定なので詰めでは動かない。
 *
 * **直し方**
 * 1行に収まるまで文字を小さくする。それでも収まらなければURLの中ほどを省く。
 * 収まっている出典行は何も変わらない（既存の出力は不変）。
 *
 * 幅の見積もりは apply_title_fit.js と同じ較正値（全角1.20em / 半角0.60em）。
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const MARK = "SRCLINE_FIT_APPLIED";
const argv = process.argv.slice(2);
const fi = argv.indexOf("--file");
const file = fi >= 0 ? argv[fi + 1] : argv.find(a => !a.startsWith("--"));
if (!file) { console.error("usage: apply_srcline_fit.js --file <gen_deck.js>"); process.exit(2); }

let src = fs.readFileSync(file, "utf8");
if (src.includes(MARK)) { console.log("apply_srcline_fit: 既に当たっている（何もしない）"); process.exit(0); }

const target = `  slide.addText(runs, { x: 0.4, y: (opts && opts.y) || 6.86, w: (opts && opts.w) || 12.5, h: 0.24, align: "left", fontFace: FONT, margin: 0, valign: "middle" });`;
const count = src.split(target).length - 1;
if (count !== 1) {
  console.error("apply_srcline_fit: 対象が " + count + " 件（1件であるべき）。当てない。");
  process.exit(3);
}

const replacement = `  // ${MARK}
  // 下端はちょうど 7.10in で、フッター帯の検査のしきい値と同じ。
  // **出典が増えて1行に収まらなくなると、2行目が帯に落ちる。**
  // 位置が固定なので、1ページの詰めを下げても動かない（2026-09-14、インドネシアで
  // 詰めを 0.75 まで下げても y=7.128in のまま落ち続けた）。
  // ここで1行に収まるまで小さくする。収まっていれば何も変えない。
  {
    const MAXW = ((opts && opts.w) || 12.5) - 0.1;   // 右端に少し余裕を残す
    // 較正値は apply_title_fit.js と同じ（実測で合わせてある）
    const runW = rs => rs.reduce((sum, r) => {
      const fsz = (r.options && r.options.fontSize) || 10.5;
      let em = 0;
      for (const ch of String(r.text)) em += (ch.charCodeAt(0) < 0x2000 ? 0.60 : 1.20);
      return sum + em * fsz / 72;
    }, 0);
    let guard = 0;
    while (runW(runs) > MAXW && guard++ < 30) {
      let changed = false;
      for (const r of runs) {
        const o = r.options || (r.options = {});
        const cur = o.fontSize || 10.5;
        if (cur > 7) { o.fontSize = cur - 0.5; changed = true; }
      }
      if (!changed) break;
    }
    // それでも収まらないときは、いちばん長いURLの中ほどを省く。
    // **リンク先は変えない。** 表示だけを短くする
    while (runW(runs) > MAXW && guard++ < 60) {
      let longest = null;
      for (const r of runs) {
        const t = String(r.text);
        if (r.options && r.options.hyperlink && t.length > 24
            && (!longest || t.length > String(longest.text).length)) longest = r;
      }
      if (!longest) break;
      const t = String(longest.text);
      const head = t.slice(0, Math.floor(t.length / 2) - 2);
      const tail = t.slice(Math.floor(t.length / 2) + 2);
      longest.text = head + "…" + tail;
    }
  }
  slide.addText(runs, { x: 0.4, y: (opts && opts.y) || 6.86, w: (opts && opts.w) || 12.5, h: 0.24, align: "left", fontFace: FONT, margin: 0, valign: "middle" });`;

src = src.replace(target, replacement);
try { new vm.Script(src, { filename: file }); }
catch (e) { console.error("apply_srcline_fit: 当てると構文が壊れる — " + e.message); process.exit(4); }

fs.writeFileSync(file + ".bak", fs.readFileSync(file));
fs.writeFileSync(file, src);
console.log("apply_srcline_fit: 当てた（1件）");
