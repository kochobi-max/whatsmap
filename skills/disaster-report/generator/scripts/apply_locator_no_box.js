#!/usr/bin/env node
/*
 * apply_locator_no_box.js — 表紙の赤枠・引き出し線を出さない選択肢を作る
 *
 * 表紙の3面図は、1段目と2段目に「次の段が指す範囲」を赤枠で描き、
 * 次の段へ引き出し線を引く。枠の位置は `locator.steps[].map`（中心と縮尺）と
 * `box`（緯度経度）から計算している。**画像がその投影で描かれている前提**である。
 *
 * 手元で撮ったスクリーンショットを表紙に使うと、この前提が崩れる。
 * どの中心・どの縮尺で写っているかを正確には知りようがないので、
 * 計算した赤枠は**必ずどこかずれる**。ずれた枠は、無い枠より悪い。
 *
 * 2026-08-28、ネパールの表紙を荒木田さんのGoogleマップのスクリーンショットに
 * 差し替えたときにこれが起きた。スクリーンショットには Google 自身のピンと
 * ハザードのアイコンが写っているので、こちらで枠を足す必要もない。
 *
 * `locator.steps[i].box` に `false` を書くと、その段の赤枠と引き出し線を出さない。
 * 従来どおり座標を書いた場合の挙動は変わらない。
 *
 * 使い方:
 *   node scripts/apply_locator_no_box.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- locator box opt-out (disaster-report) --- */";

const EDITS = [
  {
    what: "1段目の赤枠と引き出し線",
    from: [
      'const rw = geoRect(WORLD_MAP, LOC_BOX0.n, LOC_BOX0.s, LOC_BOX0.w, LOC_BOX0.e, xs[0]);',
      'redBox(s, rw.x, rw.y, rw.w, rw.h);',
      'redLine(s, rw.x + rw.w, rw.y, xs[1], mapY);',
      'redLine(s, rw.x + rw.w, rw.y + rw.h, xs[1], mapY + mapH);',
    ].join("\n"),
    to: [
      MARK,
      '// box: false のときは描かない。手元のスクリーンショットのように、',
      '// 投影が分からない画像に計算した枠を重ねるとずれるため。',
      'if (LOC_STEPS[0].box !== false) {',
      '  const rw = geoRect(WORLD_MAP, LOC_BOX0.n, LOC_BOX0.s, LOC_BOX0.w, LOC_BOX0.e, xs[0]);',
      '  redBox(s, rw.x, rw.y, rw.w, rw.h);',
      '  redLine(s, rw.x + rw.w, rw.y, xs[1], mapY);',
      '  redLine(s, rw.x + rw.w, rw.y + rw.h, xs[1], mapY + mapH);',
      '}',
    ].join("\n"),
  },
  {
    what: "2段目の赤枠と引き出し線",
    from: [
      'const rj = geoRect(JAPAN_MAP, LOC_BOX1.n, LOC_BOX1.s, LOC_BOX1.w, LOC_BOX1.e, xs[1]);',
      'redBox(s, rj.x, rj.y, rj.w, rj.h);',
      'redLine(s, rj.x + rj.w, rj.y, xs[2], mapY);',
      'redLine(s, rj.x + rj.w, rj.y + rj.h, xs[2], mapY + mapH);',
    ].join("\n"),
    to: [
      'if (LOC_STEPS[1].box !== false) {',
      '  const rj = geoRect(JAPAN_MAP, LOC_BOX1.n, LOC_BOX1.s, LOC_BOX1.w, LOC_BOX1.e, xs[1]);',
      '  redBox(s, rj.x, rj.y, rj.w, rj.h);',
      '  redLine(s, rj.x + rj.w, rj.y, xs[2], mapY);',
      '  redLine(s, rj.x + rj.w, rj.y + rj.h, xs[2], mapY + mapH);',
      '}',
      '/* --- end locator box opt-out --- */',
    ].join("\n"),
  },
  {
    what: "box: false でも既定値に落ちないようにする",
    from: 'const LOC_BOX0 = LOC_STEPS[0].box || { n: 45.8, s: 30.0, w: 128.5, e: 146.5 };',
    to: 'const LOC_BOX0 = LOC_STEPS[0].box || { n: 45.8, s: 30.0, w: 128.5, e: 146.5 };  // box:false のときは使われない',
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
      console.error("  apply_locator_patch.js を先に当ててください。");
      process.exit(2);
    }
    src = src.split(e.from).join(e.to);
  }

  try { new vm.Script(src, { filename: file }); }
  catch (err) { console.error(`✗ パッチ後の構文が不正なため中断しました: ${err.message}`); process.exit(3); }

  console.log(`  対象: ${file}`);
  console.log('    ✓ locator.steps[i].box が false の段は赤枠・引き出し線を描かない');
  console.log("    ✓ 座標を書いた段の挙動は変わらない（熊本・コロンビアは不変）");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".nobox.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.nobox.bak）`);
}

main();
