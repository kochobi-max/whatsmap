#!/usr/bin/env node
/*
 * apply_event_images.js — 画像をイベントごとのフォルダに分ける
 *
 * 統一版は画像を generator/images/ の1階層から名前だけで引く。
 * イベントを跨いで使うと、**キー名が同じ画像がぶつかる**。
 *
 *   熊本    locator.steps[].key = google_world / google_japan / intensity_map
 *   コロンビア                    google_world / google_japan / intensity_map  ← 同じ
 *
 * しかも `<key>_manual.png` は最優先で拾われる。熊本の
 * `images/intensity_map_manual.png` が置いてある状態でコロンビアをビルドすると、
 * **表紙に熊本の震度分布図が出る**。例外は出ないので気づけない。
 *
 * ここでは探索順を
 *
 *   1. images/<GLIDE>/        ← イベント専用
 *   2. images/                ← 従来どおり（ロゴなど全イベント共通のもの）
 *
 * に変えるだけにする。images/<GLIDE>/ が無いイベント（熊本）は
 * 2 だけになるので、出力は1バイトも変わらない。
 *
 * d.images の相対パス（"images/foo.png" のような値）も、先頭の images/ を外して
 * 両方のディレクトリに当てる。イベントJSONを書き換えずに移せるようにするため。
 *
 * 使い方:
 *   node scripts/apply_event_images.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- event-scoped images (disaster-report) --- */";

const FROM = [
  'function resolveImg(key) {',
  '  // Manual override (HIGHEST priority): images/<key>_manual.<ext> — a hand-saved clean',
  '  // image (e.g. a JMA intensity-map screenshot). Auto-capture never overwrites it.',
  '  for (const ext of ["png", "jpg", "jpeg"]) {',
  '    const m = path.join(HERE, "..", "images", key + "_manual." + ext);',
  '    if (fs.existsSync(m)) return m;',
  '  }',
  '  const v = d.images && d.images[key];',
  '  if (v) {',
  '    const abs = path.isAbsolute(v) ? v : path.join(HERE, "..", v);',
  '    if (fs.existsSync(abs)) return abs;',
  '  }',
  '  // Conventional location: images/<key>.png — used whether the file was captured by',
  '  // fetch_images.mjs OR dropped in manually (e.g. adrc_logo.png, an official map export).',
  '  // This is why an image, once present on disk, is always picked up on later runs.',
  '  const conv = path.join(HERE, "..", "images", key + ".png");',
  '  if (fs.existsSync(conv)) return conv;',
  '  return null;',
  '}',
].join("\n");

const TO = [
  MARK,
  '// 探索順: images/<GLIDE>/ を3通り全部見てから images/ に落ちる。',
  '// ディレクトリを跨いで手前の優先度が勝たないようにする。そうしないと',
  '// 熊本の images/intensity_map_manual.png が、コロンビアの',
  '// d.images["intensity_map"] より先に拾われてしまう。',
  'function imgDirs() {',
  '  const base = path.join(HERE, "..", "images");',
  '  const g = d.meta && d.meta.glide;',
  '  return g ? [path.join(base, g), base] : [base];',
  '}',
  'function resolveImg(key) {',
  '  const v = d.images && d.images[key];',
  '  if (v && path.isAbsolute(v) && fs.existsSync(v)) return v;',
  '  // "images/foo.png" は images/ 起点の値なので、先頭を外して各ディレクトリに当てる。',
  '  const rel = v && !path.isAbsolute(v) ? String(v).replace(/^(?:\\.[\\\\/])?images[\\\\/]/, "") : null;',
  '  for (const dir of imgDirs()) {',
  '    // (1) 手で保存した版が最優先（自動取得はこれを上書きしない）',
  '    for (const ext of ["png", "jpg", "jpeg"]) {',
  '      const m = path.join(dir, key + "_manual." + ext);',
  '      if (fs.existsSync(m)) return m;',
  '    }',
  '    // (2) イベントJSONが指すファイル',
  '    if (rel) {',
  '      const abs = path.join(dir, rel);',
  '      if (fs.existsSync(abs)) return abs;',
  '    }',
  '    // (3) 規約の置き場所 <key>.png',
  '    const conv = path.join(dir, key + ".png");',
  '    if (fs.existsSync(conv)) return conv;',
  '  }',
  '  if (rel) {',
  '    const asis = path.join(HERE, "..", v);',
  '    if (fs.existsSync(asis)) return asis;',
  '  }',
  '  return null;',
  '}',
  MARK.replace("--- event-scoped images", "--- end event-scoped images"),
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
    console.error(`✗ resolveImg() が ${n} 件でした（1件であるべき）。中断します。`);
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
  console.log(`    ✓ 画像の探索順を images/<GLIDE>/ → images/ にした`);
  console.log("");
  console.log("  熊本への影響: なし。images/EQ-2026-000135-JPN/ を作らない限り、");
  console.log("  従来どおり images/ だけを見る。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".images.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.images.bak）`);
}

main();
