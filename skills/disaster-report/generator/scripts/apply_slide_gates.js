#!/usr/bin/env node
/*
 * apply_slide_gates.js — イベント固有スライドを meta.optional_slides で出し分ける
 *
 * gen_deck.js のスライド本体には触れず、各スライドの外側に条件を1つ足すだけ。
 * 中身の行は書き換えない。
 *
 * ■ ゲートが要るスライドだけを対象にしている
 *   gen_deck.js の多くのスライドは、すでに `if (d.tecforce) {` のように
 *   データの有無で自動的に消える。それらはゲート不要なので触らない:
 *     source_fault (d.fault) / city_halls (d.cityhalls) / related_deaths (d.related_deaths)
 *     volunteers (d.volunteers) / jsdf (d.jsdf) / tecforce (d.tecforce)
 *     legal (d.legal) / platforms (d.platform_pages)
 *   対象は「データが無くても描画されてしまう」ものに限る。
 *
 * ■ 2つの形
 *   block … 見出しコメントの次が `{` のブロック文。`{` を `if (slideOn("k")) {` に変える
 *   flat  … `s = p.addSlide()` から `footer(s);` までが平の文の並び。前後を if で包む
 *
 * 後方互換: `meta.optional_slides` が無ければ**全スライドを描画する**。
 *           熊本のイベントJSONに全キーを入れておけば出力は1ページも変わらない。
 *
 * 使い方:
 *   node scripts/apply_slide_gates.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- optional slide gating (disaster-report) --- */";

const HELPER = `${MARK}
// meta.optional_slides が無ければ全スライドを描画する（後方互換）。
// 配列があれば、そこに含まれるキーのスライドだけを描画する。
const OPTIONAL_SLIDES = (d.meta && Array.isArray(d.meta.optional_slides))
  ? new Set(d.meta.optional_slides) : null;
function slideOn(key) { return OPTIONAL_SLIDES === null ? true : OPTIONAL_SLIDES.has(key); }
/* --- end optional slide gating --- */`;

// 「Slide 6c」のように番号が重複するので、コメント本文の特徴語で識別する。
const GATES = [
  { key: "prior_event",    probe: /Slide 2:.*Earthquake & Recovery/,      note: "過去災害と復興（見出しが熊本固有）" },
  { key: "focus_incident", probe: /Slide 8d:\s*Focus - AEON Mall/,        note: "焦点：個別事案 1/2（データ無しでも空スライドが出る）" },
  { key: "focus_incident", probe: /Slide 8e:\s*Focus - AEON Mall/,        note: "焦点：個別事案 2/2（同上）" },
  { key: "civic_tech",     probe: /Slide 12b2:\s*Civic-Tech Platform/,    note: "民間プラットフォーム（サグリ・全文ハードコード）" },
  { key: "spectee",        probe: /Slide 12c:\s*Complementary Assessment/, note: "Spectee（日本固有ベンダ・全文ハードコード）" },
];

const SECTION_RE = /^\/\* =+ Slide /;

function main() {
  const argv = process.argv;
  let file = null, dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--dry-run") dryRun = true;
  }
  if (!file) { console.error("✗ --file が必要です"); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`✗ 見つかりません: ${file}`); process.exit(1); }

  const src = fs.readFileSync(file, "utf8");
  if (src.includes(MARK)) { console.log("✓ すでにゲート適用済みです。何もしません。"); return; }

  const lines = src.split("\n");

  // ヘルパの挿入位置: `const d = JSON.parse(fs.readFileSync(DATA, "utf8"));` の直後
  const anchorRe = /^\s*const\s+d\s*=\s*JSON\.parse\(\s*fs\.readFileSync\(\s*DATA\s*,\s*"utf8"\s*\)\s*\)\s*;?\s*$/;
  const anchors = lines.map((l, i) => anchorRe.test(l) ? i : -1).filter(i => i >= 0);
  if (anchors.length !== 1) {
    console.error(`✗ ヘルパの挿入位置を特定できません（const d の行が ${anchors.length} 件）。中断します。`);
    process.exit(2);
  }

  const edits = [], problems = [];

  for (const g of GATES) {
    const hits = lines.map((l, i) => g.probe.test(l) ? i : -1).filter(i => i >= 0);
    if (hits.length !== 1) {
      problems.push(`${g.key}（${g.note}）: 見出しコメントが ${hits.length} 件（1件であるべき）`);
      continue;
    }
    const ci = hits[0];
    let bi = ci + 1;
    while (bi < lines.length && lines[bi].trim() === "") bi++;

    if (lines[bi].trim() === "{") {
      edits.push({ kind: "block", key: g.key, note: g.note, open: bi, indent: lines[bi].match(/^\s*/)[0] });
      continue;
    }

    // flat: 次のセクション見出しの手前で、最後の `footer(s);` までを包む
    let ni = ci + 1;
    while (ni < lines.length && !SECTION_RE.test(lines[ni])) ni++;
    let fi = -1;
    for (let i = ni - 1; i > bi; i--) {
      if (/^\s*footer\(s\);\s*$/.test(lines[i])) { fi = i; break; }
    }
    if (fi < 0) {
      problems.push(`${g.key}（${g.note}）: セクション終端の footer(s); が見つからない（L${bi + 1}〜L${ni}）`);
      continue;
    }
    // 包む範囲に列0の宣言があると、後続から参照できなくなるので拒否する
    const decl = [];
    for (let i = bi; i <= fi; i++) {
      if (/^(const|let|var|function|class)\s/.test(lines[i])) decl.push(`L${i + 1}: ${lines[i].trim().slice(0, 60)}`);
    }
    if (decl.length) {
      problems.push(`${g.key}（${g.note}）: 包む範囲に列0の宣言があり、スコープが変わるため中断\n       ${decl.join("\n       ")}`);
      continue;
    }
    edits.push({ kind: "flat", key: g.key, note: g.note, open: bi, close: fi });
  }

  if (problems.length) {
    console.error("✗ 以下を特定できないため中断しました。gen_deck.js の構造が変わっています。");
    problems.forEach(p => console.error(`   - ${p}`));
    console.error("\n  このスクリプトは曖昧一致で書き換えません。GATES 表を実ファイルに合わせて更新してください。");
    process.exit(2);
  }

  // 後ろから書き換える（行番号がずれないように）
  const out = lines.slice();
  edits.slice().sort((a, b) => b.open - a.open).forEach(e => {
    if (e.kind === "block") {
      out[e.open] = `${e.indent}if (slideOn("${e.key}")) {`;
    } else {
      out.splice(e.close + 1, 0, `}`);
      out.splice(e.open, 0, `if (slideOn("${e.key}")) {`);
    }
  });
  out.splice(anchors[0] + 1, 0, HELPER);

  const patched = out.join("\n");
  try {
    new vm.Script(patched, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  const keys = [...new Set(edits.map(e => e.key))];
  console.log(`  対象: ${file}`);
  console.log(`  ${edits.length}スライドを条件化しました（ゲートキー ${keys.length}種）:`);
  edits.slice().sort((a, b) => a.open - b.open).forEach(e =>
    console.log(`    L${String(e.open + 1).padStart(5)}  ${e.kind.padEnd(5)} ${e.key.padEnd(15)} ${e.note}`));
  console.log(`\n  optional_slides に指定できるキー:\n    ${JSON.stringify(keys)}`);
  console.log(`  （上記以外のスライドは、対応するデータキーの有無で自動的に消えるためゲート不要）`);

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".gates.bak");
  fs.writeFileSync(file, patched, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.gates.bak）`);
}

main();
