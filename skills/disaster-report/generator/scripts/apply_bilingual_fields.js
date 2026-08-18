#!/usr/bin/env node
/*
 * apply_bilingual_fields.js — 言語別キー（value_en / value_ja）を統一版に読ませる
 *
 * 統一版（熊本由来）のデータは、1つのキーに英日を詰めた文字列を持つ。
 *
 *     { "item_ja": "死者", "value": "12 (Yatsushiro 8) / 12人（八代8）", "source": "FDMA 18th report" }
 *
 * 描画時に pickText() が「最初の日本語文字より手前の最後の区切り」で割る。
 * 一方、海外イベントの取材データは最初から言語別キーで持っている。
 *
 *     { "item_ja": "死者", "value_en": "287 (UNGRD ...)", "value_ja": "287人（UNGRD…）", ... }
 *
 * 統一版は `r.value` `r.source` `l.label` しか見ないので、コロンビアで実際に
 *   ・被害状況（2ページ）の「数値」「出典」列 19行が全部空
 *   ・有用リンク（7ページ）の「情報源」列 84行が全部空
 * になった。空欄なので例外は出ず、ビルドは通る。中身だけが抜ける。
 *
 * ここでの直し方:
 *  (1) 読み込み直後に d を1回walkし、`X_en` と `X_ja` が両方あって `X` が無いものだけ、
 *      LANG_OUT に合わせて `X` を合成する。既存キーは絶対に上書きしない。
 *      → r.value / r.source / l.label が全イベントで埋まる。熊本は X が既にあるので無変化。
 *  (2) 震源・震度スライドの「深さ」「発震機構」「有感範囲」に残っていた熊本のベタ書きを、
 *      言語ペアがあるイベントではデータから読むようにする（LP ヘルパ）。
 *      熊本の出力は「発震機構」「有感範囲」の2セルが熊本自身のデータ値に変わる。
 *      深さは熊本が depth_display_en/ja を持たないので従来どおり。
 *  (3) 「発生時刻」「規模」を、origin_time / mag_usgs を持たないイベントでも埋まるようにする。
 *
 * 使い方:
 *   node scripts/apply_bilingual_fields.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- bilingual field normalisation (disaster-report) --- */";

const ANCHOR_LOAD = 'const d = JSON.parse(fs.readFileSync(DATA, "utf8"));';
const ANCHOR_LX  = 'function LX(bi, en, ja) { return BI ? bi : (ENO ? en : ja); }';

const NORMALIZER = [
  '',
  MARK,
  '// 海外イベントの JSON は value_en / value_ja のように言語別キーを持つ。',
  '// 統一版の描画側は value のような単一キーしか見ないので、',
  '// 「_en と _ja が揃っていて、基底キーが無い」ものだけを LANG_OUT に合わせて合成する。',
  '// 既存キーには一切触らないので、単一キーで書かれたイベント（熊本）の出力は変わらない。',
  '(function normalizeBilingual(root) {',
  '  const L = String(process.env.LANG_OUT || "bi").toLowerCase();',
  '  const seen = new Set();',
  '  (function walk(o) {',
  '    if (!o || typeof o !== "object" || seen.has(o)) return;',
  '    seen.add(o);',
  '    if (Array.isArray(o)) { o.forEach(walk); return; }',
  '    for (const k of Object.keys(o)) {',
  '      const m = /^(.+)_en$/.exec(k);',
  '      if (!m) continue;',
  '      const base = m[1], ja = base + "_ja";',
  '      if (base in o || !(ja in o)) continue;',
  '      const en = o[k], jp = o[ja];',
  '      if (typeof en !== "string" || typeof jp !== "string") continue;',
  '      o[base] = (L === "en") ? en : (L === "ja") ? jp : (en + " / " + jp);',
  '    }',
  '    for (const k of Object.keys(o)) walk(o[k]);',
  '  })(root);',
  '})(d);',
  '/* --- end bilingual field normalisation --- */',
].join("\n");

const LP_HELPER = [
  '// LP(o, "depth_display"): 言語ペアを明示的に持つイベントだけ値を返す。',
  '// 単一キーしか持たないイベント（熊本）では "" を返すので、従来の記述に落ちる。',
  'function LP(o, base) {',
  '  if (!o) return "";',
  '  const en = o[base + "_en"], ja = o[base + "_ja"];',
  '  if (typeof en !== "string" || typeof ja !== "string") return "";',
  '  return BI ? (en + " / " + ja) : (ENO ? en : ja);',
  '}',
].join("\n");

const INTENSITY_FROM = [
  'function intensitySeg() {',
  '  const v = d.event && d.event.max_intensity;',
  '  if (v === undefined || v === null || v === "") return "";',
  '  return (ENO || BI)',
  '    ? "   ·   Max. seismic intensity " + v + " (" + (d.event.intensity_agency_en || "JMA") + ")"',
  '    : "   ·   最大震度" + v + "（" + (d.event.intensity_agency_ja || "気象庁") + "）";',
  '}',
].join("\n");

const INTENSITY_TO = [
  'function intensitySeg() {',
  '  // 表紙は1行なので、長い説明を持つイベントは max_intensity_short_en/ja を優先する。',
  '  const v = LP(d.event, "max_intensity_short") || (d.event && d.event.max_intensity);',
  '  if (v === undefined || v === null || v === "") return "";',
  '  // 発表機関の既定「気象庁 / JMA」は、この項目を持たない熊本データのための後方互換。',
  '  // 他国のイベントで機関名が無いときは、括弧ごと省く（気象庁と書かない）。',
  '  const jp = !!(d.meta && d.meta.iso3 === "JPN");',
  '  const en = ENO || BI;',
  '  const ag = en ? (d.event.intensity_agency_en || (jp ? "JMA" : ""))',
  '                : (d.event.intensity_agency_ja || (jp ? "気象庁" : ""));',
  '  const head = en ? "   ·   Max. seismic intensity " : "   ·   最大震度";',
  '  const par = ag ? (en ? " (" + ag + ")" : "（" + ag + "）") : "";',
  '  return head + v + par;',
  '}',
].join("\n");

// [説明, 置換前, 置換後]
const REPS = [
  [
    "表紙の最大震度（長い値は短縮形を優先、機関名が無ければ括弧ごと省く）",
    INTENSITY_FROM,
    INTENSITY_TO,
  ],
  [
    "出典行の既定リンク（気象庁・総務省統計局）を日本のイベントに限る",
    'function srcOr(sub, label, url) { return linkBy(sub) || { label, url }; }',
    'function srcOr(sub, label, url) {\n'
    + '  // 既定は「JMA hypocentre map / 気象庁 震央分布図」のような日本固有のリンク。\n'
    + '  // d.links に該当が無い他国のイベントでは、気象庁を出すより出典を1つ減らす方が正しい。\n'
    + '  const hit = linkBy(sub);\n'
    + '  if (hit) return hit;\n'
    + '  const jp = !(d.meta && d.meta.iso3) || d.meta.iso3 === "JPN";\n'
    + '  return jp ? { label, url } : null;   // srcLine() は falsy を捨てる\n'
    + '}',
  ],
  [
    "linkBy() の照合を label_en にも通す",
    'function linkBy(sub) { return (d.links || []).find(l => l.label && l.label.includes(sub)); }',
    'function linkBy(sub) { return (d.links || []).find(l => (l.label_en || l.label) && String(l.label_en || l.label).includes(sub)); }',
  ],
  [
    "震源・震度：発生時刻（origin_time_local/utc/jst にも対応）",
    '    ["Origin time / 発生時刻", d.event.origin_time],',
    '    ["Origin time / 発生時刻", d.event.origin_time || [d.event.origin_time_local, d.event.origin_time_utc, d.event.origin_time_jst].filter(Boolean).join("   ·   ")],',
  ],
  [
    "震源・震度：規模（mag_usgs が無ければ括弧ごと省く）",
    '    ["Magnitude / 規模", d.event.magnitude + "   (USGS " + (d.event.mag_usgs || "").split(" ")[0] + ")"],',
    '    ["Magnitude / 規模", LP(d.event, "magnitude_display") || (d.event.magnitude + (d.event.mag_usgs ? "   (USGS " + String(d.event.mag_usgs).split(" ")[0] + ")" : ""))],',
  ],
  [
    "震源・震度：深さ（熊本のベタ書きをデータ優先に）",
    '    ["Depth / 深さ", LX(`${d.event.depth_km} km (prelim.; ~10 km)`, `${d.event.depth_km} km (prelim.; ~10 km)`, `${d.event.depth_km} km（暫定・速報約10km）`)],',
    '    ["Depth / 深さ", LP(d.event, "depth_display") || LX(`${d.event.depth_km} km (prelim.; ~10 km)`, `${d.event.depth_km} km (prelim.; ~10 km)`, `${d.event.depth_km} km（暫定・速報約10km）`)],',
  ],
  [
    "震源・震度：発震機構（熊本のベタ書きをデータ優先に）",
    '    ["Mechanism / 発震機構", LX("Strike-slip, ENE-WSW / 横ずれ", "Strike-slip, ENE-WSW", "横ずれ断層型（東北東－西南西）")],',
    '    ["Mechanism / 発震機構", LP(d.event, "mechanism") || LX("Strike-slip, ENE-WSW / 横ずれ", "Strike-slip, ENE-WSW", "横ずれ断層型（東北東－西南西）")],',
  ],
  [
    "震源・震度：有感範囲（熊本のベタ書きをデータ優先に）",
    '    ["Felt / 有感範囲", LX("Hokuriku-Kyushu, 6+ to 1 / 北陸〜九州", "Hokuriku-Kyushu, 6+ to 1", "北陸〜九州で震度6強〜1")],',
    '    ["Felt / 有感範囲", LP(d.event, "felt") || LX("Hokuriku-Kyushu, 6+ to 1 / 北陸〜九州", "Hokuriku-Kyushu, 6+ to 1", "北陸〜九州で震度6強〜1")],',
  ],
];

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

  if (src.includes(MARK)) {
    console.log("  すでに適用済みです。何もしません。");
    return;
  }

  // --- 置換対象がちょうど1件ずつあることを先に確認する ---
  const counts = [];
  for (const [why, from] of REPS) {
    const n = src.split(from).length - 1;
    counts.push([why, n]);
    if (n !== 1) {
      console.error(`✗ 「${why}」の置換対象が ${n} 件でした（1件であるべき）。中断します。`);
      console.error(`  探した文字列:\n    ${from}`);
      process.exit(2);
    }
  }
  if (src.split(ANCHOR_LOAD).length - 1 !== 1) {
    console.error("✗ データ読み込み行が1件ではありません。中断します。"); process.exit(2);
  }
  if (src.split(ANCHOR_LX).length - 1 !== 1) {
    console.error("✗ LX() の定義行が1件ではありません。中断します。"); process.exit(2);
  }

  // --- 適用 ---
  src = src.replace(ANCHOR_LOAD, ANCHOR_LOAD + "\n" + NORMALIZER);
  src = src.replace(ANCHOR_LX, ANCHOR_LX + "\n" + LP_HELPER);
  for (const [, from, to] of REPS) src = src.split(from).join(to);

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log(`    ✓ 読み込み直後に言語別キーの正規化を挿入`);
  console.log(`    ✓ LP() ヘルパを追加`);
  counts.forEach(([why, n]) => console.log(`    ✓ ${why}  ${n}箇所`));
  console.log("");
  console.log("  熊本への影響: 「発震機構」「有感範囲」の2セルが、熊本自身の");
  console.log("  event.mechanism_ja / event.felt_ja の値に変わる（従来はベタ書き）。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".bilingual.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.bilingual.bak）`);
}

main();
