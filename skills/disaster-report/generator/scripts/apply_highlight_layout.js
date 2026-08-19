#!/usr/bin/env node
/*
 * apply_highlight_layout.js — 主な被害①の画像を1ページ1枚にする
 *
 * 従来は1ページ目の右側に2枚を積んでいた。
 *
 *   nhk_yatsushiro   y=1.15  h=3.60
 *   kumamoto_castle  y=4.85  h=1.75   ← 画像に使えるのは 1.75-0.66 = 1.09 インチ
 *
 * imageSlot() は下端 0.66 インチをキャプション用に確保する。日英併記だと
 * キャプションは2行＋URLの3行になるので、0.64 インチの枠に収まらない。
 * 結果、潰れた画像の上に文字が重なる。2ページ目以降は右半分が空のまま。
 *
 * ここでは
 *   ・ページが2枚以上あるなら 1ページに1枚ずつ、高さ 5.45 インチで置く
 *   ・画像が無いページは本文を全幅（12.5インチ）で使う
 *   ・ページが1枚しか無いときだけ従来どおり2枚積む（画像を落とさないため）
 *
 * 画像が見つからない場合のプレースホルダは従来どおり出す。
 * 「公開前に画像を挿入」の枠が消えると、欠けていることに気づけなくなるため。
 *
 * 使い方:
 *   node scripts/apply_highlight_layout.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- highlight image layout (disaster-report) --- */";

const FROM = [
  '      biBulletsTier(s, 0.4, 1.2, 7.2, 5.4, grp);',
  '      if (pi === 0) {',
  '        imageSlot(s, 7.8, 1.15, 5.1, 3.6, "nhk_yatsushiro", "Aerial footage - Yatsushiro paper-mill chimney (NHK)", "上空映像 - 八代 製紙工場の煙突（NHK）", "https://www3.nhk.or.jp/news/");',
  '        imageSlot(s, 7.8, 4.85, 5.1, 1.75, "kumamoto_castle", "Kumamoto Castle - stone-wall collapse (NHK, ©NHK/X)", "熊本城 石垣崩落（NHK・©NHK/X）", "https://www3.nhk.or.jp/news/");',
  '      }',
].join("\n");

const TO = [
  '      ' + MARK,
  '      // 1ページに1枚ずつ置く。従来は1ページ目に2枚積んでおり、下の熊本城は',
  '      // 高さ1.75インチ（うちキャプション0.66）しか無く、画像が潰れたうえに',
  '      // 日英2行＋URLのキャプションが枠から溢れていた。',
  '      const HL_IMGS = [',
  '        { key: "nhk_yatsushiro", en: "Aerial footage - Yatsushiro paper-mill chimney (NHK)", ja: "上空映像 - 八代 製紙工場の煙突（NHK）", url: "https://www3.nhk.or.jp/news/" },',
  '        { key: "kumamoto_castle", en: "Kumamoto Castle - stone-wall collapse (NHK, ©NHK/X)", ja: "熊本城 石垣崩落（NHK・©NHK/X）", url: "https://www3.nhk.or.jp/news/" },',
  '      ];',
  '      // ページ数が足りないときだけ従来の積み方に戻す（画像を落とさないため）。',
  '      const hlOneEach = hsPages.length >= HL_IMGS.length;',
  '      const hlShown = hlOneEach ? (HL_IMGS[pi] ? [HL_IMGS[pi]] : []) : (pi === 0 ? HL_IMGS : []);',
  '      // 画像が無いページは本文を全幅で使う（従来は右半分が空いたままだった）。',
  '      biBulletsTier(s, 0.4, 1.2, hlShown.length ? 7.2 : 12.5, 5.4, grp);',
  '      if (hlShown.length === 1) {',
  '        const im = hlShown[0];',
  '        imageSlot(s, 7.8, 1.15, 5.1, 5.45, im.key, im.en, im.ja, im.url);',
  '      } else if (hlShown.length === 2) {',
  '        imageSlot(s, 7.8, 1.15, 5.1, 3.6, HL_IMGS[0].key, HL_IMGS[0].en, HL_IMGS[0].ja, HL_IMGS[0].url);',
  '        imageSlot(s, 7.8, 4.85, 5.1, 1.75, HL_IMGS[1].key, HL_IMGS[1].en, HL_IMGS[1].ja, HL_IMGS[1].url);',
  '      }',
  '      /* --- end highlight image layout --- */',
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
    console.error(`✗ 置換対象が ${n} 件でした（1件であるべき）。中断します。`);
    console.error("  主な被害①のスライドの記述が変わっている可能性があります。");
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
  console.log("    ✓ 主な被害①の画像を1ページ1枚にした（八代 → 1ページ目、熊本城 → 2ページ目）");
  console.log("    ✓ 画像が無いページは本文を全幅で使う");
  console.log("");
  console.log("  ページ数は変わりません。右側の画像の置き方と、本文の幅だけが変わります。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".hl.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.hl.bak）`);
}

main();
