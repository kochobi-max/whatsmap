#!/usr/bin/env node
/*
 * apply_table_fit.js — 表がページ番号・出典行に重ならないようにする
 *
 * 2026-08-28、インドネシア版の3ページ目で、被害の表の最下辺（y=7.27in）が
 * 左下のページ番号（y=7.22-7.36in）を横切っていた。4ページ目はさらに深く、
 * 表が右下の ADRC の帯（y=7.12-7.42in）まで届いていた。
 * **例外は出ない。ページ数も合う。目視でしか分からない。**
 *
 * ## 原因
 *
 * 1行の高さの見積もりに使う行送りが、実際より狭い。
 *
 *     見積もり   fontSize * 0.0172 in   （12pt → 0.206in ＝ 1.24em）
 *     実測       fontSize * 0.0200 in   （12pt → 0.240in ＝ 1.44em）
 *
 * 出来上がった PDF の罫線の位置から測った（`_build/.../*_JA.pdf` 3〜4ページ）。
 * 実測の行は 0.594 / 0.807 / 0.837 / 1.078 / 1.320 in で、
 * どれも「行数 × 0.2405 ＋ 0.115」にきれいに乗る。
 * 見積もりは1行あたり 0.034in 足りず、5行の欄で 0.17in ずれる。
 * 6行の表では 0.8in ほど下へはみ出す。
 *
 * 日本語の行送りは欧文より広い。**1言語版だけがこの経路を通る。**
 * 併記版（熊本）は BI 側の固定値を使うので、この修正では1バイトも変わらない。
 *
 * ## 直し方
 *
 *   * 1言語版の行送りを実測値にする
 *   * 表の下端を出典行（y=6.86）より上で止める。余裕を 0.16in 取って 6.70 とする
 *
 * 行が減るぶんページは増えることがある。**重なるよりページが増えるほうがよい。**
 *
 * ## それでも足りないとき
 *
 * 見積もりは文字数からの計算なので、実際の組版とは必ずずれる。行数の切り上げが
 * 1行ずれるだけで 0.24in 動く。**ずれを小さくはできても、ゼロにはできない。**
 * そこで `TABLE_BUDGET_SCALE`（既定 1）で1ページに詰める量を外から縮められるようにした。
 * `build_event.js` が出来上がった PDF を測り、重なりが残っていれば値を下げて組み直す。
 *
 * 使い方:
 *   node scripts/apply_table_fit.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- table fit (disaster-report) --- */";

const EDITS = [
  {
    what: "1言語版の行送りを実測値にする",
    from: 'function estCellH(text, colW, fs, margin) { return estCellLines(text, colW, fs, margin) * (fs * 0.0172); }',
    to: MARK + "\n" +
      "// 行送り。1言語版（日本語・英語それぞれ単独）は実測 fontSize*0.0200in。\n" +
      "// 併記版は従来の 0.0172 のまま（熊本の出力を変えないため）。\n" +
      "function estCellH(text, colW, fs, margin) { return estCellLines(text, colW, fs, margin) * (fs * (BI ? 0.0172 : 0.0200)); }\n" +
      "// 1ページに詰める量を外から縮められるようにする。\n" +
      "// 見積もりは文字数からの計算なので、実際の組版とは必ずずれる。build_event.js は\n" +
      "// PDF を測って重なりが残っていたらこの値を下げて組み直す。1言語版だけに効かせる。\n" +
      "const TBSCALE = BI ? 1 : Math.max(0.5, Math.min(1, Number(process.env.TABLE_BUDGET_SCALE || 1) || 1));",
  },
  {
    what: "時系列の表の下端を上げる",
    from: "  const TL_BUDGET = BI ? 5.05 : 5.15;",
    to: "  // 表の下端が 6.70in を越えないところまで。出典行は 6.86in、ページ番号は 7.14in。\n" +
        "  const TL_BUDGET = BI ? 5.05 : (6.70 - 1.30 - 0.38) * TBSCALE;",
  },
  {
    what: "被害の表の下端を上げる",
    from: "  const DMG_BUDGET = BI ? 4.95 : (6.80 - 1.40 - 0.34);",
    to: "  const DMG_BUDGET = BI ? 4.95 : (6.70 - 1.40 - 0.38) * TBSCALE;",
  },
  {
    what: "参加機関の表の下端を上げる",
    from: "    const budget = 6.50 - 1.40 - 0.34, out = [];",
    to: "    const budget = (6.50 - 1.40 - 0.38) * TBSCALE, out = [];",
  },
  {
    what: "有用リンクの表を高さで区切る（行数の決め打ちをやめる）",
    // apply_data_guards.js（5本目）が d.links を (d.links || []) にしたあとの形。
    from: "  const lpages = [(d.links || []).slice(0, LPER0)].concat(chunk((d.links || []).slice(LPER0), LPER)).filter(a => a.length);",
    to: [
      "  // 1ページ14行の決め打ちでは、ラベルやURLが折り返した行の分だけ下へあふれる。",
      "  // 1言語版は高さで区切る。1ページ目は情報源方針の注記がある分だけ狭い。",
      "  const lpages = BI",
      "    ? [(d.links || []).slice(0, LPER0)].concat(chunk((d.links || []).slice(LPER0), LPER)).filter(a => a.length)",
      "    : (() => {",
      "        const lrowH = (r) => estRowH([[r.label, 4.6, 10, 3], [r.url, 7.0, 8.5, 3]], 0.38);",
      "        const out = []; let cur = [], h = 0, first = true;",
      "        const budget = () => ((first ? 6.70 - 1.72 : 6.70 - 1.30) - 0.38) * TBSCALE;",
      "        (d.links || []).forEach((r) => {",
      "          const rh = lrowH(r);",
      "          if (cur.length && h + rh > budget()) { out.push(cur); cur = []; h = 0; first = false; }",
      "          cur.push(r); h += rh;",
      "        });",
      "        if (cur.length) out.push(cur);",
      "        return out.length ? out : [[]];",
      "      })();",
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

  for (const e of EDITS) {
    const n = src.split(e.from).length - 1;
    if (n !== 1) {
      console.error(`✗ 「${e.what}」の対象が ${n} 件でした（1件であるべき）。中断します。`);
      process.exit(2);
    }
    src = src.split(e.from).join(e.to);
  }

  try {
    new vm.Script(src, { filename: file });
  } catch (err) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${err.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  for (const e of EDITS) console.log("    ✓ " + e.what);
  console.log("");
  console.log("  併記版（熊本）は BI 側の値を使うので出力は変わりません。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".tablefit.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.tablefit.bak）`);
}

main();
