#!/usr/bin/env node
/*
 * apply_image_report.js — 画像がどのファイルに解決したかをビルド時に一覧表示する
 *
 * imageSlot() は画像が見つからないとき、点線の枠とプレースホルダ文言を描いて
 * 静かに次へ進む。例外は出ないしページ数も変わらない。
 * 実際、熊本で images/ に27枚が無い状態のまま149ページがビルドされ、
 * 開くまで気づけなかった。**ロゴが全ページから消えていた。**
 *
 * ここでは resolveImg() を包んで、キーごとの解決結果を記録し、
 * 書き出しの直前に一覧を出す。出力される pptx は1バイトも変わらない。
 *
 *   ── 画像  解決 21 / 未解決 9
 *      ✓ adrc_logo              images/adrc_logo.png
 *      ✓ intensity_map          images/intensity_map.png
 *      ✗ title_bg               （枠のみ）
 *      ...
 *      ⚠ 9件が枠のみです。images/ を確認してください。
 *
 * 使い方:
 *   node scripts/apply_image_report.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MARK = "/* --- image resolution report (disaster-report) --- */";

// apply_event_images.js が置く終了マーカーの直後に差し込む。
// ここは resolveImg() の定義が終わった直後で、かつスライドを組み始める前。
// 末尾（書き出し直前）に置くと、包む前に全ページが描き終わっていて記録が空になる。
const ANCHOR = "/* --- end event-scoped images (disaster-report) --- */";

const WRAP = [
  "",
  MARK,
  "// resolveImg() を包んで、キーごとの解決結果を記録する。返り値は変えない。",
  "const __imgLog = new Map();",
  "{",
  "  const __orig = resolveImg;",
  "  resolveImg = function (key) {",
  "    const r = __orig(key);",
  "    if (!__imgLog.has(key)) __imgLog.set(key, r);",
  "    return r;",
  "  };",
  "}",
  "function __imgReport() {",
  "  if (!__imgLog.size) return;",
  "  const base = path.join(HERE, \"..\");",
  "  const rows = Array.from(__imgLog.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1);",
  "  const ok = rows.filter(r => r[1]), ng = rows.filter(r => !r[1]);",
  "  console.log(\"\\n── 画像  解決 \" + ok.length + \" / 未解決 \" + ng.length);",
  "  for (const [k, v] of rows) {",
  "    let shown = \"（枠のみ）\";",
  "    if (v) { shown = path.relative(base, v); if (shown.startsWith(\"..\")) shown = v; }",
  "    console.log(\"   \" + (v ? \"✓\" : \"✗\") + \" \" + k.padEnd(24) + shown);",
  "  }",
  "  if (ng.length) {",
  "    console.log(\"\\n   ⚠ \" + ng.length + \"件が枠のみです。images/ を確認してください。\");",
  "    console.log(\"     探した場所: \" + imgDirs().map(d => path.relative(base, d) || \".\").join(\"  →  \"));",
  "  }",
  "}",
  "/* --- end image resolution report --- */",
  "",
].join("\n");


// ロゴだけ resolveImg() を通らず HERE/../images を直接見ている。
// つまりイベント別フォルダも効かないし、一覧にも出ない。
// 今回まさに全ページから消えたのがこれなので、同じ経路に寄せる。
const LOGO_FROM = [
  'function logoPath() {',
  '  for (const ext of ["png", "jpg", "jpeg", "gif"]) {',
  '    const pth = path.join(HERE, "..", "images", "adrc_logo." + ext);',
  '    if (fs.existsSync(pth)) return pth;',
  '  }',
  '  return null;',
  '}',
].join("\n");

const LOGO_TO = [
  'function logoPath() {',
  '  // 探索順は resolveImg() と同じ（images/<GLIDE>/ → images/）。',
  '  // 拡張子は png/jpg/jpeg/gif を見るので resolveImg() より広い。',
  '  let found = null;',
  '  for (const dir of imgDirs()) {',
  '    for (const ext of ["png", "jpg", "jpeg", "gif"]) {',
  '      const pth = path.join(dir, "adrc_logo." + ext);',
  '      if (fs.existsSync(pth)) { found = pth; break; }',
  '    }',
  '    if (found) break;',
  '  }',
  '  try { if (!__imgLog.has("adrc_logo")) __imgLog.set("adrc_logo", found); }',
  '  catch (e) { /* 記録できなくても描画は続ける */ }',
  '  return found;',
  '}',
].join("\n");

const WRITE_RE = /^(p\.writeFile\()/m;

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

  const nAnchor = src.split(ANCHOR).length - 1;
  if (nAnchor !== 1) {
    console.error(`✗ apply_event_images.js の終了マーカーが ${nAnchor} 件でした（1件であるべき）。`);
    console.error("  apply_event_images.js を先に当ててください。");
    process.exit(2);
  }
  const nLogo = src.split(LOGO_FROM).length - 1;
  if (nLogo !== 1) {
    console.error(`✗ logoPath() が ${nLogo} 件でした（1件であるべき）。中断します。`);
    process.exit(2);
  }
  const nWrite = (src.match(new RegExp(WRITE_RE.source, "gm")) || []).length;
  if (nWrite !== 1) {
    console.error(`✗ 書き出し行が ${nWrite} 件でした（1件であるべき）。中断します。`);
    process.exit(2);
  }

  src = src.split(LOGO_FROM).join(LOGO_TO);
  src = src.replace(ANCHOR, ANCHOR + "\n" + WRAP.trimEnd());
  src = src.replace(WRITE_RE, m => "__imgReport();\n\n" + m);

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log("    ✓ 書き出し直前に画像の解決結果を一覧表示する");
  console.log("    ✓ ロゴも同じ探索経路に寄せた（イベント別フォルダが効くようになる）");
  console.log("");
  console.log("  出力される pptx は変わりません。コンソールに1ブロック増えるだけです。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".imgreport.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.imgreport.bak）`);
}

main();
