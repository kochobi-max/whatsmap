#!/usr/bin/env node
/*
 * apply_all.js — 6本のパッチを正しい順序でまとめて当てる
 *
 * 使い方:
 *   node scripts/apply_all.js --file "<gen_deck.js のパス>" --dry-run   ← まずこれ
 *   node scripts/apply_all.js --file "<gen_deck.js のパス>"             ← 本適用
 *
 * 例（OneDrive の権威版）:
 *   node scripts/apply_all.js --dry-run \
 *     --file "C:\\Users\\arakida\\OneDrive - adrc.asia\\LargeScaleDisasters\\_kumamoto_generator\\gen_deck.js"
 *
 * 途中で1本でも失敗したら、そこで止める。
 * 各パッチは適用前に置換対象を数え、適用後に構文チェックし、`.bak` を残す。
 * すでに当たっているパッチは「適用済み」と表示して飛ばす（冪等）。
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ORDER = [
  ["apply_event_patch.js", "EVENT でイベントを切り替えられるようにする"],
  ["apply_slide_gates.js", "イベント固有スライドを optional_slides で出し分ける"],
  ["apply_locator_patch.js", "表紙の3面ロケータを国ごとに変えられるようにする"],
  ["apply_receiver_slides.js", "汎用キー6種の受け皿スライドを足す"],
  ["apply_data_guards.js", "データが欠けてもビルドが落ちないようにする"],
  ["apply_attribution_patch.js", "出典・キャプション・発震機構の日本固有記述を外出しする"],
];

function main() {
  const argv = process.argv;
  let file = null, dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--dry-run") dryRun = true;
  }
  if (!file) {
    console.error("✗ --file が必要です（gen_deck.js のパス）");
    console.error("  例: node scripts/apply_all.js --dry-run --file \"...\\_kumamoto_generator\\gen_deck.js\"");
    process.exit(1);
  }
  if (!fs.existsSync(file)) { console.error(`✗ 見つかりません: ${file}`); process.exit(1); }

  const before = fs.readFileSync(file, "utf8");
  console.log(`対象: ${file}`);
  console.log(`行数: ${before.split("\n").length}`);
  console.log(dryRun ? "モード: --dry-run（書き込みません）\n" : "モード: 本適用\n");

  const HERE = __dirname;
  const done = [];
  for (const [script, what] of ORDER) {
    const p = path.join(HERE, script);
    if (!fs.existsSync(p)) { console.error(`✗ スクリプトが見つかりません: ${p}`); process.exit(1); }
    process.stdout.write(`── ${script}\n   ${what}\n`);
    try {
      const args = [p, "--file", file];
      if (dryRun) args.push("--dry-run");
      const out = execFileSync(process.execPath, args, { encoding: "utf8" });
      const line = out.split("\n").find(l => l.includes("✓") || l.includes("すでに")) || "";
      console.log(`   ${line.trim() || "完了"}\n`);
      done.push(script);
    } catch (e) {
      console.error(`\n✗ ${script} で中断しました。ここまでの ${done.length} 本は適用済みです。\n`);
      console.error((e.stdout || "") + (e.stderr || ""));
      console.error("gen_deck.js の該当箇所が変わっている可能性があります。");
      console.error("generator/README.md の該当節を見て、手で当ててください。");
      process.exit(2);
    }
  }

  if (dryRun) {
    console.log("── すべて適用可能です。--dry-run を外して実行してください。");
    return;
  }

  const after = fs.readFileSync(file, "utf8");
  console.log("── 完了");
  console.log(`   行数: ${before.split("\n").length} → ${after.split("\n").length}`);
  console.log(`   バックアップ: ${file}.bak / .gates.bak / .locator.bak / .receivers.bak / .guards.bak / .attrib.bak`);
  console.log("\n次にやること:");
  console.log("  1. 熊本でビルドし、27ページ・内容が従来どおりであることを確認する");
  console.log("     LANG_OUT=ja EVENT=EQ-2026-000135-JPN node scripts/gen_deck.js");
  console.log("  2. gen_deck.js を _kumamoto_generator/ へ書き戻す");
}

main();
