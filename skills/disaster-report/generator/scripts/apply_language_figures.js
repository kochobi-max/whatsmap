#!/usr/bin/env node
/*
 * apply_language_figures.js — 図を言語ごとに持てるようにする
 *
 *   images/<GLIDE>/locator_world.png      共通（従来どおり）
 *   images/<GLIDE>/locator_world_ja.png   日本語版のときだけこちら
 *   images/<GLIDE>/locator_world_en.png   英語版のときだけこちら
 *
 * ## なぜ要るか
 *
 * 2026-08-28、ネパールの位置図を1組だけ作り、日本語の注記を入れたまま
 * 英語版のデッキにも使った。**英語版の表紙に日本語が出た。** 荒木田さんから
 * 「問題点は英語版に日本語の説明を入れたClaudeの処理です」と指摘を受けた。
 *
 * そのとき私が採った直しは「図の文字は英語だけにする」だった。**後退である。**
 * 日本語版の読み手は、図の中だけ英語を読まされる。
 *
 * あとで分かったことだが、**別のセッションが既にこれを解いていた。**
 * `main` の `reports/colombia_eq_20260810/scripts/gen_deck.js` は
 *
 *     const loc = path.join(ROOT, "images", key + "_" + LANG + ".png");
 *
 * で `_ja` / `_es` の図を言語ごとに拾っている。`make_images.py` は
 * `LANG_OUT` を変えて回すと `_ja` 付きを書き出す。同じ約束をこちらへ持ってくる。
 *
 * ## 探索順（1つのディレクトリの中で）
 *
 *   1. <key>_manual_<lang>.<ext>   手で保存した、その言語専用のもの
 *   2. <key>_manual.<ext>          手で保存した共通のもの
 *   3. イベントJSONが指すファイルの <lang> 版（foo.png → foo_ja.png）
 *   4. イベントJSONが指すファイル
 *   5. <key>_<lang>.png
 *   6. <key>.png
 *
 * **言語別が無ければ従来どおり共通のものが出る。** 既存イベントの出力は変わらない。
 * 熊本（LANG_OUT=bi、`_bi` 付きの画像は存在しない）も1バイトも変わらない。
 *
 * 使い方:
 *   node scripts/apply_language_figures.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- language-specific figures (disaster-report) --- */";

const FROM = [
  '  for (const dir of imgDirs(key)) {',
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
].join("\n");

const TO = [
  MARK,
  '  // 図の中の文字は言語ごとに違ってよい。<key>_ja.png があれば日本語版でそれを使う。',
  '  // 無ければ共通のものに落ちるので、既存イベントの出力は変わらない。',
  '  const langSuffix = "_" + LANG;',
  '  const relLang = rel ? rel.replace(/(\\.[a-z0-9]+)$/i, langSuffix + "$1") : null;',
  '  for (const dir of imgDirs(key)) {',
  '    // (1) 手で保存した、その言語専用のもの',
  '    for (const ext of ["png", "jpg", "jpeg"]) {',
  '      const m = path.join(dir, key + "_manual" + langSuffix + "." + ext);',
  '      if (fs.existsSync(m)) return m;',
  '    }',
  '    // (2) 手で保存した共通のもの（自動取得はこれを上書きしない）',
  '    for (const ext of ["png", "jpg", "jpeg"]) {',
  '      const m = path.join(dir, key + "_manual." + ext);',
  '      if (fs.existsSync(m)) return m;',
  '    }',
  '    // (3) イベントJSONが指すファイルの言語別版',
  '    if (relLang) {',
  '      const abs = path.join(dir, relLang);',
  '      if (fs.existsSync(abs)) return abs;',
  '    }',
  '    // (4) イベントJSONが指すファイル',
  '    if (rel) {',
  '      const abs = path.join(dir, rel);',
  '      if (fs.existsSync(abs)) return abs;',
  '    }',
  '    // (5) 規約の置き場所の言語別版 <key>_ja.png',
  '    const convLang = path.join(dir, key + langSuffix + ".png");',
  '    if (fs.existsSync(convLang)) return convLang;',
  '    // (6) 規約の置き場所 <key>.png',
  '    const conv = path.join(dir, key + ".png");',
  '    if (fs.existsSync(conv)) return conv;',
  '  }',
  '/* --- end language-specific figures --- */',
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
    console.error(`✗ resolveImg の探索ループが ${n} 件でした（1件であるべき）。中断します。`);
    console.error("  apply_event_images.js と apply_image_isolation.js を先に当ててください。");
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
  console.log("    ✓ <key>_ja.png / <key>_en.png があれば言語ごとに使い分ける");
  console.log("    ✓ 無ければ共通の <key>.png に落ちる（既存イベントの出力は不変）");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".langfig.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.langfig.bak）`);
}

main();
