#!/usr/bin/env node
/*
 * apply_dmg_row_split.js — 被害状況の1行が1ページに収まらないとき、ページ跨ぎで分割する。
 *
 * **何が起きたか（2026-09-14）**
 *
 * ネパールとインドネシアのビルドが `STATUS: FAIL footer-overlap` で落ちた。
 * 1ページの詰めを 1 → 0.9 → 0.82 → 0.75 まで下げても消えない。
 * 実測では罫線が y=10.105in にあった。スライドの高さは 7.5in である。
 *
 * 原因はページ送りの条件にある。
 *
 *     if (cur.length && h + rh > DMG_BUDGET) { ページを送る }
 *     cur.push(r);
 *
 * **1行の高さ rh がページの予算 DMG_BUDGET を超えていても、その行は置かれる。**
 * 送った直後は cur.length が 0 なので条件が成立せず、そのまま積むしかない。
 * 詰めを下げても「1行の高さ」は変わらないので、再試行しても永遠に落ちる。
 *
 * この災害は被害状況の行が日々伸びる。2026-09-14 時点で最長の行は
 * 日本語 1,395字・英語 2,920字（「避難・要支援者」）。1ページに収まる量ではない。
 *
 * **直し方**
 * ページ送りの前に、予算を超える行を複数行へ割る。文の切れ目で切り、
 * 2行目以降の項目名には「（続き）」を付ける。数値も出典も落とさない。
 *
 * 収まっている行は触らない（既存の出力は不変）。
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const MARK = "DMG_ROW_SPLIT_APPLIED";
const argv = process.argv.slice(2);
const fi = argv.indexOf("--file");
const file = fi >= 0 ? argv[fi + 1] : argv.find(a => !a.startsWith("--"));
if (!file) { console.error("usage: apply_dmg_row_split.js --file <gen_deck.js>"); process.exit(2); }

let src = fs.readFileSync(file, "utf8");
if (src.includes(MARK)) { console.log("apply_dmg_row_split: 既に当たっている（何もしない）"); process.exit(0); }

const target = `  const dmgPages = [];
  { let cur = [], h = 0;
    (d.damage || []).forEach((r) => {`;
const count = src.split(target).length - 1;
if (count !== 1) {
  console.error("apply_dmg_row_split: 対象が " + count + " 件（1件であるべき）。当てない。");
  process.exit(3);
}

const replacement = `  // ${MARK}
  // **1行が1ページに収まらないことがある。** ページ送りの条件は
  //   if (cur.length && h + rh > DMG_BUDGET) { 送る }
  // なので、送った直後は cur.length が 0 になり、どれだけ高い行でもそのまま置かれる。
  // 詰め（TBSCALE）を下げても行の高さは変わらないため、再試行しても落ち続ける。
  // 2026-09-14、ネパールで罫線が y=10.105in（スライドは 7.5in）まで流れ出た。
  //
  // ここで、予算を超える行を文の切れ目で割る。2行目以降は項目名に「（続き）」を付ける。
  // 数値も出典も落とさない。収まっている行は触らない。
  const dmgSplitRows = (rows) => {
    const out = [];
    for (const r of rows) {
      if (dmgRowH(r) <= DMG_BUDGET) { out.push(r); continue; }
      // 文の切れ目で分ける。日本語は「。」、英語は「. 」。切れ目が無ければ長さで割る
      const text = String(r.value == null ? "" : r.value);
      let parts = text.split(/(?<=。)|(?<=\\.\\s)/).filter(x => x.length);
      if (parts.length < 2) parts = text.match(/[\\s\\S]{1,400}/g) || [text];
      const chunks = [];
      let buf = "";
      for (const seg of parts) {
        const cand = buf + seg;
        if (buf && dmgRowH(Object.assign({}, r, { value: cand })) > DMG_BUDGET) {
          chunks.push(buf); buf = seg;
        } else {
          buf = cand;
        }
      }
      if (buf) chunks.push(buf);
      chunks.forEach((c, ci) => {
        out.push(Object.assign({}, r, {
          value: c,
          item_en: ci === 0 ? r.item_en : (r.item_en || "") + " (cont.)",
          item_ja: ci === 0 ? r.item_ja : (r.item_ja || "") + "（続き）",
          // 出典は先頭の行にだけ出す。同じ出典を何度も繰り返さない
          source: ci === 0 ? r.source : "",
        }));
      });
    }
    return out;
  };

  const dmgPages = [];
  { let cur = [], h = 0;
    dmgSplitRows(d.damage || []).forEach((r) => {`;

src = src.replace(target, replacement);
try { new vm.Script(src, { filename: file }); }
catch (e) { console.error("apply_dmg_row_split: 当てると構文が壊れる — " + e.message); process.exit(4); }

fs.writeFileSync(file + ".bak", fs.readFileSync(file));
fs.writeFileSync(file, src);
console.log("apply_dmg_row_split: 当てた（1件）");
