#!/usr/bin/env node
/*
 * apply_image_isolation.js — 他イベントの画像を掴まないようにする
 *
 * apply_event_images.js（9本目）は探索順を images/<GLIDE>/ → images/ にした。
 * イベント専用フォルダを先に見るので衝突は避けられる、と考えていた。**足りなかった。**
 *
 * 専用フォルダに **無い** キーは共通フォルダに落ちる。共通フォルダには熊本の画像が
 * 全部入っているので、コロンビアをビルドすると
 *
 *   epicentre_distribution  images/epicentre_distribution.png   ← 熊本の震央分布図
 *   google_cities           images/google_cities.png            ← 熊本の市町村地図
 *   mechanism               images/mechanism_manual.png         ← 熊本の発震機構
 *   sentinel_asia           images/sentinel_asia.png            ← 熊本の発動ページ
 *   disaster_charter        images/disaster_charter.png         ← 同上
 *
 * を拾う。**例外は出ない。画像は入る。中身が別の災害のもの**という状態になる。
 * 実際にコロンビアの目視用ファイルを作る直前に見つけた。
 *
 * 直し方: images/<GLIDE>/ が存在するイベントでは、共通フォルダへ落ちてよいのは
 * 全イベント共通の画像（ADRCロゴ・表紙背景）だけにする。それ以外は落とさず、
 * 枠のままにする。**違う画像が出るくらいなら、枠の方がよい。**
 * 欠けていることは 10本目の一覧（✗ 枠のみ）で分かる。
 *
 * images/<GLIDE>/ を持たないイベント（熊本）は従来どおり共通フォルダだけを見るので、
 * 出力は1バイトも変わらない。
 *
 * 使い方:
 *   node scripts/apply_image_isolation.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- image isolation (disaster-report) --- */";

const FROM = [
  'function imgDirs() {',
  '  const base = path.join(HERE, "..", "images");',
  '  const g = d.meta && d.meta.glide;',
  '  return g ? [path.join(base, g), base] : [base];',
  '}',
].join("\n");

const TO = [
  MARK,
  '// 全イベント共通で使ってよい画像。これ以外は、イベント専用フォルダがある場合に',
  '// 共通フォルダへ落とさない。落とすと他イベントの画像を掴む。',
  'const SHARED_IMG_KEYS = ["adrc_logo", "title_bg"];',
  'function imgDirs(key) {',
  '  const base = path.join(HERE, "..", "images");',
  '  const g = d.meta && d.meta.glide;',
  '  if (!g) return [base];',
  '  const evt = path.join(base, g);',
  '  let hasEvtDir = false;',
  '  try { hasEvtDir = fs.statSync(evt).isDirectory(); } catch (e) { hasEvtDir = false; }',
  '  if (!hasEvtDir) return [base];   // 専用フォルダを持たないイベントは従来どおり',
  '  // key を渡さない呼び出し（ロゴ・一覧表示）は共通フォルダも見る',
  '  return (key === undefined || SHARED_IMG_KEYS.indexOf(key) >= 0) ? [evt, base] : [evt];',
  '}',
  '/* --- end image isolation --- */',
].join("\n");

// resolveImg の中の呼び出しだけ key を渡す。logoPath と一覧表示は引数なしのままでよい。
const CALL_FROM = [
  '  const rel = v && !path.isAbsolute(v) ? String(v).replace(/^(?:\\.[\\\\/])?images[\\\\/]/, "") : null;',
  '  for (const dir of imgDirs()) {',
].join("\n");

const CALL_TO = [
  '  const rel = v && !path.isAbsolute(v) ? String(v).replace(/^(?:\\.[\\\\/])?images[\\\\/]/, "") : null;',
  '  for (const dir of imgDirs(key)) {',
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

  for (const [what, from] of [["imgDirs() の定義", FROM], ["resolveImg 内の呼び出し", CALL_FROM]]) {
    const n = src.split(from).length - 1;
    if (n !== 1) {
      console.error(`✗ ${what}が ${n} 件でした（1件であるべき）。中断します。`);
      console.error("  apply_event_images.js を先に当ててください。");
      process.exit(2);
    }
  }

  src = src.split(FROM).join(TO);
  src = src.split(CALL_FROM).join(CALL_TO);

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log("    ✓ 専用フォルダを持つイベントは、共通フォルダへ落ちない");
  console.log("      （落ちてよいのは " + '["adrc_logo", "title_bg"]' + " だけ）");
  console.log("");
  console.log("  専用フォルダを持たないイベント（熊本）の出力は変わりません。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".isolation.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.isolation.bak）`);
}

main();
