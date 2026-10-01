#!/usr/bin/env node
/*
 * apply_sat_page_numbering.js — 出ていないページの番号を見出しに書かない
 *
 * 「緊急観測の参加機関とプロダクト（3/3）」の見出しは、その前に
 * 「衛星による緊急観測（1/3）」「（2/3）」が出ている前提で書かれている。
 * その2枚は国土地理院の InSAR など**日本固有の内容がハードコード**されており、
 * 海外のイベントでは `optional_slides`（`satellite_jp`）で落としている。
 *
 * 結果、インドネシア版には **1/3 も 2/3 も無いのに「（3/3）」だけ**が出た。
 * 2026-08-28、目視で見つけた。例外は出ない。数字が合わないだけなので、
 * ビルドが通ったかどうかでは分からない。
 *
 * 直し方: 前の2枚が出ているときだけ「(3/3)」を付ける。出ていなければ番号なし。
 * 複数ページに割れる場合は「(1/2)」のようにその場の枚数で数える。
 *
 * 熊本・コロンビアは `satellite_jp` が有効なので、見出しは「(3/3)」のまま変わらない。
 *
 * 使い方:
 *   node scripts/apply_sat_page_numbering.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- satellite page numbering (disaster-report) --- */";

const FROM = [
  '    const sfx = satPages.length > 1 ? ` (3/3-${pi + 1})` : " (3/3)";',
  '    const sfxJa = satPages.length > 1 ? `（3/3-${pi + 1}）` : "（3/3）";',
].join("\n");

const TO = [
  MARK,
  '    // 前の2枚（衛星による緊急観測 1/3・2/3）が落ちているイベントでは、',
  '    // 「(3/3)」だけが残って数字が合わなくなる。出ている枚数で数え直す。',
  '    const satPrev = (typeof slideOn === "function") ? (slideOn("satellite_jp") ? 2 : 0) : 2;',
  '    const satTotal = satPrev + satPages.length;',
  '    const satNo = satPrev + pi + 1;',
  '    const sfx = satTotal > 1 ? ` (${satNo}/${satTotal})` : "";',
  '    const sfxJa = satTotal > 1 ? `（${satNo}/${satTotal}）` : "";',
  '/* --- end satellite page numbering --- */',
].join("\n");

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

  const n = src.split(FROM).length - 1;
  if (n !== 1) {
    console.error(`✗ 見出しの番号を組み立てている箇所が ${n} 件でした（1件であるべき）。中断します。`);
    process.exit(2);
  }
  src = src.split(FROM).join(TO);

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log("    ✓ 1/3・2/3 が落ちているイベントでは (3/3) を出さない");
  console.log("    ✓ satellite_jp が有効なイベント（熊本・コロンビア）は (3/3) のまま");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".satnum.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.satnum.bak）`);
}

main();
