#!/usr/bin/env node
/*
 * apply_data_guards.js — 必須扱いになっているキーが無いときに落ちるのを防ぐ
 *
 * 統一版は `d.cities` `d.timeline` `d.damage` `d.satellite` `d.links` を
 * 「必ずある」前提で直接触っている。熊本はすべて持っているので表面化しないが、
 * 他国のイベント（例: コロンビアは `cities` を持たず `areas` を持つ）では
 *
 *     TypeError: Cannot read properties of undefined (reading 'forEach')
 *
 * でビルドごと落ちる。実際にコロンビアのデータで再現した。
 *
 * ここでは `d.KEY.` を `(d.KEY || []).` に置き換えるだけにする。
 * スライドの中身には触れない。データがあるイベントの出力は1バイトも変わらない。
 *
 * 使い方:
 *   node scripts/apply_data_guards.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- data guards (disaster-report) --- */";

// 配列として直接触られているキー
const KEYS = ["cities", "timeline", "damage", "satellite", "links"];
const METHODS = "forEach|map|filter|slice|length|join|reduce|sort";

// セクションごと条件化するもの。オブジェクト型のキーを本文の各所で直接参照していて、
// 個別のガードでは追いきれない場合に使う。
const SECTION_GUARDS = [
  {
    name: "Slide 7 津波・震度分布",
    probe: /^\/\* =+ Slide 7:\s*Tsunami & Intensity/m,
    cond: "d.tsunami || (d.intensity && Object.keys(d.intensity).length)",
    why: "d.tsunami を24箇所で直接参照。震度も日本の 7 / 6強 / 6弱 前提なので、両方無ければ描画しない",
  },
];

const SECTION_RE = /^\/\* =+ Slide /;

/** flat セクション（見出しコメントの次が `s = p.addSlide()`）を if で包む */
function wrapSection(lines, probe, cond) {
  const hits = lines.map((l, i) => probe.test(l) ? i : -1).filter(i => i >= 0);
  if (hits.length !== 1) return { ok: false, why: `見出しが ${hits.length} 件（1件であるべき）` };
  const ci = hits[0];
  let bi = ci + 1;
  while (bi < lines.length && lines[bi].trim() === "") bi++;
  let ni = ci + 1;
  while (ni < lines.length && !SECTION_RE.test(lines[ni])) ni++;
  let fi = -1;
  for (let i = ni - 1; i > bi; i--) if (/^\s*footer\(s\);\s*$/.test(lines[i])) { fi = i; break; }
  if (fi < 0) return { ok: false, why: "セクション終端の footer(s); が見つからない" };
  const decl = [];
  for (let i = bi; i <= fi; i++) if (/^(const|let|var|function|class)\s/.test(lines[i])) decl.push(`L${i + 1}`);
  if (decl.length) return { ok: false, why: `包む範囲に列0の宣言がある（${decl.join(", ")}）` };
  return { ok: true, open: bi, close: fi };
}

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

  const report = [];
  for (const key of KEYS) {
    const re = new RegExp(`(?<!\\|\\|\\s\\[\\]\\)\\.)\\bd\\.${key}\\.(?=(?:${METHODS})\\b)`, "g");
    let n = 0;
    src = src.replace(re, m => { n++; return `(d.${key} || []).`; });
    report.push([key, n]);
  }

  // 二重適用の防止（(d.x || []) の中がさらに置換されていないか）
  if (/\(\(d\.\w+ \|\| \[\]\) \|\| \[\]\)/.test(src)) {
    console.error("✗ 二重にガードが入りました。中断します。");
    process.exit(3);
  }

  // セクションごとの条件化
  const secReport = [];
  for (const g of SECTION_GUARDS) {
    const lines = src.split("\n");
    const r = wrapSection(lines, g.probe, g.cond);
    if (!r.ok) {
      console.error(`✗ ${g.name}: ${r.why}。中断します。`);
      process.exit(2);
    }
    lines.splice(r.close + 1, 0, "}");
    lines.splice(r.open, 0, `if (${g.cond}) {`);
    src = lines.join("\n");
    secReport.push(g);
  }

  src = src.replace(/^(const pptxgen = require\("pptxgenjs"\);)/m, `${MARK}\n// d.cities / d.timeline / d.damage / d.satellite / d.links は (d.x || []) でガード済み。\n// Slide 7（津波・震度）はセクションごと条件化。これらを持たないイベントでもビルドが落ちない。\n$1`);

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  const total = report.reduce((a, [, n]) => a + n, 0);
  if (!total) { console.error("✗ 置換対象が1件も見つかりませんでした。中断します。"); process.exit(2); }

  console.log(`  対象: ${file}`);
  report.forEach(([k, n]) => console.log(`    ${n ? "✓" : "—"} d.${k}  ${n}箇所`));
  secReport.forEach(g => console.log(`    ✓ ${g.name}（${g.why}）`));
  console.log(`\n  合計 ${total}箇所 ＋ セクション${secReport.length}件。データがあるイベントの出力は変わらない。`);

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".guards.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.guards.bak）`);
}

main();
