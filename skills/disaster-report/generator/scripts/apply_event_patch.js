#!/usr/bin/env node
/*
 * apply_event_patch.js — gen_deck.js に EVENT 対応を入れる最小パッチ
 *
 * gen_deck.js の本体（スライド定義・言語レイヤ・レイアウト）には一切触れない。
 * 冒頭のデータ読み込み3文だけを差し替える。
 *
 *   変更前:
 *     const DATA = process.env.DATA || path.join(HERE, "..", "data", "report_data.json");
 *     const OUT  = process.env.OUT  || path.join(HERE, "..", "output", "Kumamoto_EQ_Report.pptx");
 *     const d    = JSON.parse(fs.readFileSync(DATA, "utf8"));
 *
 *   変更後: EVENT（GLIDE番号 or パス）から events/<GLIDE>.json を解決し、
 *          OUT の既定値を meta.filebase + LANG_OUT から組み立てる。
 *
 * 3文がそれぞれちょうど1回見つからなければ**何もせず中断**する。
 * 権威あるバージョン（OneDrive の _kumamoto_generator/gen_deck.js）に対しても
 * 安全に当てられるようにするため、曖昧一致は許さない。
 *
 * 使い方:
 *   node scripts/apply_event_patch.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");

const PATCHED_MARK = "/* --- EVENT resolution (disaster-report) --- */";

const REPLACEMENT = `${PATCHED_MARK}
// EVENT: GLIDE番号（例 EQ-2026-000135-JPN）または events/<GLIDE>.json のパス。
// DATA が明示されていればそちらを優先する（後方互換）。
function resolveDataPath() {
  if (process.env.DATA) return process.env.DATA;
  const ev = process.env.EVENT;
  if (!ev) return path.join(HERE, "..", "data", "report_data.json");
  const dir = path.join(HERE, "..", "..", "events");
  const cands = [ev, path.join(dir, ev), path.join(dir, ev.endsWith(".json") ? ev : ev + ".json")];
  const hit = cands.find(c => { try { return fs.statSync(c).isFile(); } catch { return false; } });
  if (!hit) throw new Error("EVENT を解決できません: " + ev);
  return hit;
}
const DATA = resolveDataPath();
const d = JSON.parse(fs.readFileSync(DATA, "utf8"));
// OUT の既定値は meta.filebase と LANG_OUT から組み立てる（災害名のハードコードをやめる）。
const OUT = process.env.OUT || path.join(HERE, "..", "output",
  ((d.meta && d.meta.filebase) || "ADRC_Disaster_Report") + "_" +
  String(process.env.LANG_OUT || "bi").toUpperCase() + ".pptx");
// 出力先ディレクトリが無いと書き込み時に ENOENT で落ちるので先に作る。
try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch { /* ignore */ }
/* --- end EVENT resolution --- */`;

// 落とすべき3文。空白の揺れは許すが、構造は厳密に一致させる。
const TARGETS = [
  { name: "const DATA", re: /^[ \t]*const\s+DATA\s*=\s*process\.env\.DATA\s*\|\|[^\n]*\n/m },
  { name: "const OUT", re: /^[ \t]*const\s+OUT\s*=\s*process\.env\.OUT\s*\|\|[^\n]*\n/m },
  { name: "const d", re: /^[ \t]*const\s+d\s*=\s*JSON\.parse\(\s*fs\.readFileSync\(\s*DATA\s*,\s*"utf8"\s*\)\s*\)\s*;?[ \t]*\n/m },
];

function countMatches(src, re) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (src.match(g) || []).length;
}

function main() {
  const argv = process.argv;
  let file = null, dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--dry-run") dryRun = true;
  }
  if (!file) { console.error("✗ --file が必要です（gen_deck.js のパス）"); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`✗ 見つかりません: ${file}`); process.exit(1); }

  let src = fs.readFileSync(file, "utf8");

  if (src.includes(PATCHED_MARK)) {
    console.log("✓ すでにパッチ済みです。何もしません。");
    return;
  }

  // 3文がそれぞれちょうど1回あることを確認する
  const problems = [];
  for (const t of TARGETS) {
    const n = countMatches(src, t.re);
    if (n !== 1) problems.push(`${t.name}: ${n}件（1件であるべき）`);
  }
  if (problems.length) {
    console.error("✗ 想定した3文を特定できないため中断しました。手で当ててください。");
    problems.forEach(p => console.error(`   - ${p}`));
    console.error("\n  このスクリプトは曖昧一致で書き換えません。gen_deck.js の冒頭が");
    console.error("  改修されている場合は、README の「EVENT対応パッチ」を参照して手動で適用してください。");
    process.exit(2);
  }

  // 順序が重要: 先に OUT と d の行を消してから、DATA の位置にブロックを差し込む。
  // 逆順にすると、挿入したブロック自身に含まれる OUT / d 文が削除対象に一致してしまい、
  // 複数行の OUT 文が途中で切られて構文が壊れる。
  src = src.replace(TARGETS[1].re, "");
  src = src.replace(TARGETS[2].re, "");
  src = src.replace(TARGETS[0].re, () => REPLACEMENT + "\n");

  // 構文チェック（差し込み後に壊れていないか）
  try {
    new (require("vm").Script)(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log(`  3文を置換し、構文チェックを通過しました。`);

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.bak）`);
  console.log(`  確認: EVENT=EQ-2026-000135-JPN LANG_OUT=ja node ${file}`);
}

main();
