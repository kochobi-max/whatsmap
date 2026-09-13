#!/usr/bin/env node
/*
 * apply_damage_row_split.js — 被害状況の1行が長すぎてページより高くなるのを止める
 *
 * 2026-09-13、ネパール第17報（NDRRMA状況報告第23号）の更新で、被害状況の
 * 「死者」「行方不明」「負傷者」「捜索救助」「避難・要支援者」などの数値欄が、
 * 過去の報番号ごとの推移をすべて書き足した累積の説明文（英語版で2,000〜2,900字）
 * になった。1行の推定高さがページ1枚分の容量そのものを超え、
 * `TABLE_BUDGET_SCALE` を 1 → 0.9 → 0.82 → 0.75 まで下げても重なりが消えなかった
 * （`build_event.js` が `STATUS: FAIL footer-overlap` で止まった）。
 * インドネシア（`EQ-2026-000150-IDN.json`）の「死者」欄も同じ理由で長く、
 * 同時期に同じ症状（footer-overlap）が出ている。**イベント固有ではなく、
 * 被害の値が長文化したときに常に起きる、ジェネレータ側の欠陥。**
 *
 * ## 原因
 *
 * `dmgPages` の詰め込みは「行のかたまり」をページ単位で移すだけで、
 * **1行そのものが1ページの容量（`DMG_BUDGET`）より高いケースを想定していない。**
 * `cur.length` が0のときは無条件で行を足すので、その行1つだけのページが
 * 出来ても、行の実際の高さがページを大きく超えたまま描画される。
 *
 * ## 直し方
 *
 * ページに乗せる前に、`DMG_BUDGET` を超える行だけを見つけ、文の切れ目
 * （日本語は「。」、英欧文は文末の `.` `!` `?` の直後の空白/行末）で
 * 複数の行に割る。区切りが無い異常に長い1文（数値の羅列など）は、
 * 二分探索で収まる文字数まで機械的に切る。割った行には項目名に
 * `(1/2)` のような通し番号を付け、出典・ティアはそのまま複製する
 * （すでにこのデッキが時系列・被害①②・被害状況スライド自体で使っている
 * 「(n/総数)」という命名を、行単位に広げただけ）。
 *
 * 出来上がった行はそのまま既存の高さベースの詰め込み（`dmgPages` の
 * ループ・`balanceTail`）に渡す。**詰め込みのロジック自体は変えない。**
 * 1行あたりの上限を `DMG_BUDGET * 0.90` に取ってあるので、目一杯詰めた
 * 直後の行が single-row page になっても、なお余白が残る。
 *
 * 併記版（BI、熊本の従来出力）には触れない。`r.value` が「英語 / 日本語」を
 * 連結した1本の文字列で、文の切れ目の判定がずれるおそれがあるため、
 * これまでの他パッチと同じく **BI 側は入力のまま**（`BI ? d.damage : …`）とする。
 * 熊本の出力は1バイトも変わらない。
 *
 * 使い方:
 *   node scripts/apply_damage_row_split.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- damage row split (disaster-report) --- */";

const ANCHOR_FN = "/* ============ Slide 8: Damage Situation (paginated: 6 rows/page) ============ */";

const HELPER = [
  MARK,
  "// 文単位に割る。日本語は「。」の直後、英欧文は . ! ? の直後で空白か行末が",
  "// 続くところだけを区切りにする（小数点や桁区切りのピリオドを誤って割らない）。",
  "function sentenceChunks(text) {",
  "  const t = String(text || \"\");",
  "  const out = []; let start = 0;",
  "  for (let i = 0; i < t.length; i++) {",
  "    const ch = t[i];",
  "    if (ch === \"\\u3002\") { out.push(t.slice(start, i + 1)); start = i + 1; }",
  "    else if ((ch === \".\" || ch === \"!\" || ch === \"?\") && (i + 1 === t.length || /\\s/.test(t[i + 1]))) {",
  "      out.push(t.slice(start, i + 1)); start = i + 1;",
  "    }",
  "  }",
  "  if (start < t.length) out.push(t.slice(start));",
  "  return out.map(s => s.trim()).filter(Boolean);",
  "}",
  "// 被害状況の1行が rowHFn(budget) を超えるとき、`value` を複数行へ割る。",
  "// 2026-09-13、ネパール第17報で「死者」等の数値欄が報番号ごとの推移を",
  "// すべて書き足した累積の説明文になり、1行だけでページ1枚の容量を超えた。",
  "// TABLE_BUDGET_SCALE を下げても1行がページより高いままなので重なりが消えない。",
  "// インドネシアの「死者」欄も同じ理由で長く、同時期に同じ症状が出ている。",
  "// イベント固有ではなく、値が長文化したときに常に起きるジェネレータ側の欠陥。",
  "function splitLongDamageRows(rows, rowHFn, budget) {",
  "  const CAP = budget * 0.90;",
  "  const out = [];",
  "  (rows || []).forEach((r) => {",
  "    if (rowHFn(r) <= CAP) { out.push(r); return; }",
  "    const sentences = sentenceChunks(r.value);",
  "    const chunks = [];",
  "    let cur = \"\";",
  "    sentences.forEach((sen) => {",
  "      const cand = cur ? cur + \" \" + sen : sen;",
  "      if (cur && rowHFn(Object.assign({}, r, { value: cand })) > CAP) { chunks.push(cur); cur = sen; }",
  "      else cur = cand;",
  "    });",
  "    if (cur) chunks.push(cur);",
  "    // 区切りが無い異常に長い1文（数値の羅列など）は、二分探索で収まる",
  "    // 文字数まで機械的に切る。無限ループにはしない。",
  "    const safe = [];",
  "    chunks.forEach((c) => {",
  "      let rem = c;",
  "      while (rem.length > 80 && rowHFn(Object.assign({}, r, { value: rem })) > CAP) {",
  "        let lo = 80, hi = rem.length, fit = 80;",
  "        while (lo <= hi) {",
  "          const mid = (lo + hi) >> 1;",
  "          if (rowHFn(Object.assign({}, r, { value: rem.slice(0, mid) })) <= CAP) { fit = mid; lo = mid + 1; }",
  "          else hi = mid - 1;",
  "        }",
  "        safe.push(rem.slice(0, fit));",
  "        rem = rem.slice(fit);",
  "      }",
  "      if (rem) safe.push(rem);",
  "    });",
  "    const n = safe.length;",
  "    safe.forEach((val, i) => {",
  "      const sfxEn = n > 1 ? ` (${i + 1}/${n})` : \"\", sfxJa = n > 1 ? `\\uFF08${i + 1}/${n}\\uFF09` : \"\";",
  "      out.push(Object.assign({}, r, {",
  "        value: val,",
  "        item_en: (r.item_en || \"\") + sfxEn,",
  "        item_ja: (r.item_ja || \"\") + sfxJa,",
  "      }));",
  "    });",
  "  });",
  "  return out;",
  "}",
  "",
  ANCHOR_FN,
].join("\n");

// apply_data_guards.js が先に d.damage.forEach を (d.damage || []).forEach へ
// 書き換えているので、そのあとの形に合わせて探す。
const FROM_LOOP =
  "  const dmgPages = [];\n" +
  "  { let cur = [], h = 0;\n" +
  "    (d.damage || []).forEach((r) => {\n";
const TO_LOOP =
  "  // 1行だけで DMG_BUDGET を超える行を、収まる大きさの複数行へ割ってから詰める。\n" +
  "  // 併記版（BI）は value が「英語 / 日本語」連結の1本文字列で文の切れ目の判定が\n" +
  "  // ずれるおそれがあるため、従来どおり入力のまま渡す（熊本の出力は不変）。\n" +
  "  const dmgSource = BI ? (d.damage || []) : splitLongDamageRows(d.damage || [], dmgRowH, DMG_BUDGET);\n" +
  "  const dmgPages = [];\n" +
  "  { let cur = [], h = 0;\n" +
  "    dmgSource.forEach((r) => {\n";

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

  const nAnchor = src.split(ANCHOR_FN).length - 1;
  if (nAnchor !== 1) {
    console.error(`✗ Slide 8 の見出しコメントが ${nAnchor} 件でした（1件であるべき）。中断します。`);
    process.exit(2);
  }
  const nLoop = src.split(FROM_LOOP).length - 1;
  if (nLoop !== 1) {
    console.error(`✗ 被害状況の詰め込みループが ${nLoop} 件でした（1件であるべき）。中断します。`);
    process.exit(2);
  }

  src = src.replace(ANCHOR_FN, HELPER);
  src = src.split(FROM_LOOP).join(TO_LOOP);

  try {
    new vm.Script(src, { filename: file });
  } catch (err) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${err.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log("    ✓ sentenceChunks() / splitLongDamageRows() を追加");
  console.log("    ✓ 被害状況の詰め込みが dmgSource（分割後）を読むようにした");
  console.log("");
  console.log("  併記版（熊本）は BI 側の入力をそのまま使うので出力は変わりません。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".dmgsplit.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.dmgsplit.bak）`);
}

main();
