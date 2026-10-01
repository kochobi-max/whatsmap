#!/usr/bin/env node
/*
 * apply_receiver_slides_2.js — 元の36ページ版にあって統一版に無かったページを足す
 *
 * コロンビアを統一版で動かすにあたり、元の専用ジェネレータ（984行）の36ページと
 * 統一版の出力を突き合わせた結果、受け皿が無くて出せないページが残っていた。
 * そのうち **どの国の災害でも使える形のもの** をここで足す。
 *
 *   areas          被災地域（県＋市町村・震央距離・震度）— 市町村表の差し替え
 *   aftershocks.rows  主な余震（時刻・規模・備考）
 *   historical     過去の主な被害地震        ← optional_slides ゲート
 *   observations   所見・注視点
 *   extra_slides   自由記述スライド（導入文＋表＋画像）
 *   巻末ページ      発信範囲・注意書き        ← optional_slides ゲート
 *
 * ゲートを付けた2種は、熊本もデータを持っているため。
 * 熊本の optional_slides に入っていない＝出ないので、熊本の27ページは変わらない。
 *
 * extra_slides について:
 *   コロンビアの `cali`（カリ市の被害報告）や `pre_event`（事前リスク評価・
 *   GEM-TREQ都市プロファイル）は、災害ごとに形の違う一品物のページだった。
 *   国ごとに受け皿を書き足すときりが無いので、
 *   「見出し＋導入文＋表＋画像＋出典」という**1つの汎用の形**に寄せる。
 *   イベントJSON側でこの形に直せば、ジェネレータを触らずにページを足せる。
 *
 * 使い方:
 *   node scripts/apply_receiver_slides_2.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- receiver slides 2 (disaster-report) --- */";
const END  = "/* --- end receiver slides 2 --- */";

// ---------------------------------------------------------------- 被災地域（表の差し替え）

const AREAS_FROM = [
  '{',
  '  const fitC = fitRows((d.cities || []).length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8 });',
].join("\n");

const AREAS_TO = [
  'if (AREAMODE) {',
  '  /* --- receiver slides 2: areas（市町村ではなく県＋市で整理されている国） --- */',
  '  // コロンビアのように「県／市町村・震央距離・震度」で整理されている国では、',
  '  // 同じスライドの表だけ差し替える。地図はロケータ側で国ごとに切り替わる。',
  '  const fitA = fitRows(d.areas.length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8 });',
  '  const aRows = [[',
  '    tableHeaderCell(LX("県・地域 / Department", "Department", "県・地域")),',
  '    tableHeaderCell(LX("市町村 / City", "City", "市町村")),',
  '    tableHeaderCell(LX("震央距離 / Dist.", "Dist.", "震央距離")),',
  '    tableHeaderCell(LX("震度 / Int.", "Int.", "震度")),',
  '    tableHeaderCell(LX("備考 / Note", "Note", "備考")),',
  '  ]];',
  '  d.areas.slice(0, fitA.shownBody).forEach((a, i) => {',
  '    const fill = { color: i % 2 ? WHITE : LIGHT };',
  '    aRows.push([',
  '      { text: TT(a.dept_en || "", a.dept_ja || ""), options: { fontSize: fitA.fontSize, color: INK, fill, align: "left", valign: "middle", margin: 3 } },',
  '      { text: TT(a.city_en || "", a.city_ja || ""), options: { fontSize: fitA.fontSize, color: INK, fill, align: "left", valign: "middle", margin: 3 } },',
  '      { text: a.dist || "—", options: { fontSize: fitA.fontSize, color: INK, fill, align: "center", valign: "middle", margin: 3 } },',
  '      { text: a.mmi || "—", options: { fontSize: fitA.fontSize, bold: true, color: NAVY, fill, align: "center", valign: "middle", margin: 3 } },',
  '      { text: TT(a.note_en || "", a.note_ja || ""), options: { fontSize: Math.max(8, fitA.fontSize - 0.5), color: INK, fill, align: "left", valign: "middle", margin: 3 } },',
  '    ]);',
  '  });',
  '  if (fitA.cap) aRows.push([{ text: LX("+" + fitA.cap + " more / 他" + fitA.cap + "地域（データ参照）", "+" + fitA.cap + " more", "他" + fitA.cap + "地域（データ参照）"), options: { fontSize: 11, italic: true, color: MUTED, colspan: 5, fill: { color: WHITE }, align: "left", valign: "middle", margin: 4 } }]);',
  '  s.addTable(aRows, { x: 7.1, y: 1.35, w: 5.8, colW: [1.3, 1.4, 0.8, 0.6, 1.7], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: fitA.rowH });',
  '  /* --- end receiver slides 2: areas --- */',
  '} else {',
  '  const fitC = fitRows((d.cities || []).length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8 });',
].join("\n");


// 見出しと凡例も areas モードでは変える（番号付きの市町村ではないため）。
const HEAD_FROM = 'heading(s, "Affected Municipalities & Population", "被災市町村と人口");';
const HEAD_TO = [
  '// areas モード: 市町村ではなく県・地域で整理されているイベント（例: コロンビア）。',
  'const AREAMODE = !(d.cities || []).length && !!(d.areas || []).length;',
  'heading(s, AREAMODE ? "Affected Departments & Areas" : "Affected Municipalities & Population",',
  '           AREAMODE ? "被災地域" : "被災市町村と人口");',
].join("\n");

const NOTE_FROM = [
  'LX("● 番号は右の表に対応 / numbers keyed to the table on the right   ★ 震源 epicentre",',
  '    "● numbers keyed to the table on the right   ★ epicentre", "● 番号は右の表に対応   ★ 震源")',
].join("\n");
const NOTE_TO = [
  '(AREAMODE ? LX("★ 震源 epicentre", "★ epicentre", "★ 震源") : LX("● 番号は右の表に対応 / numbers keyed to the table on the right   ★ 震源 epicentre",',
  '    "● numbers keyed to the table on the right   ★ epicentre", "● 番号は右の表に対応   ★ 震源"))',
].join("\n");


// 過去の災害スライドに残っていた熊本固有の見出し2つ。
// prior_event ゲートを他国のイベントで開けると「2016 damage」「復興の途上（約10年）」が出る。
// 既定は従来の文字列のままなので、熊本の出力は変わらない。
const PE_REPS = [
  [
    "過去の災害スライドの見出し",
    'heading(s, "The 2016 Kumamoto Earthquake & Recovery", "2016年熊本地震と復興の途上");',
    'heading(s, (d.prior_event && d.prior_event.heading_en) || "The 2016 Kumamoto Earthquake & Recovery",\n        (d.prior_event && d.prior_event.heading_ja) || "2016年熊本地震と復興の途上");',
  ],
  [
    "過去の災害スライドの被害表の見出し",
    'const stRows = [[tableHeaderCell("2016 damage / 被害"), tableHeaderCell("Figure / 数値")]];',
    'const stRows = [[tableHeaderCell((pe.stats_header_en || "2016 damage") + " / " + (pe.stats_header_ja || "被害")), tableHeaderCell("Figure / 数値")]];',
  ],
  [
    "過去の災害スライドの復興欄の見出し",
    'const runs = [{ text: "Recovery — still under way (10 years on) / 復興の途上（約10年）\\n", options: { bold: true, fontSize: 13, color: NAVY } }];',
    'const runs = [{ text: (pe.recovery_title_en || "Recovery — still under way (10 years on)") + " / " + (pe.recovery_title_ja || "復興の途上（約10年）") + "\\n", options: { bold: true, fontSize: 13, color: NAVY } }];',
  ],
];

// ---------------------------------------------------------------- 主な余震

const AFTERSHOCK_ROWS = `
/* ============ Slide 6r: Notable aftershocks (data-driven) ============ */
// d.aftershocks が配列ではなくオブジェクト（{rows:[...]}）で来るイベント向け。
// 統一版の余震ページは d.aftershock_stats（震度階級別の回数）を前提にしているが、
// 回数統計を出さない国では「主な余震の一覧」しか無い。
if (d.aftershocks && !Array.isArray(d.aftershocks) && (d.aftershocks.rows || []).length) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Notable Aftershocks", "主な余震");
  const aq = d.aftershocks;
  const intro = TT(aq.note_en || "", aq.note_ja || "");
  let ay = 1.12;
  if (intro) {
    s.addText(intro, { x: 0.4, y: ay, w: 12.5, h: 1.30, fontSize: 11.5, color: INK, fontFace: FONT, align: "left", valign: "top", margin: 4, shrinkText: true });
    ay += 1.40;
  }
  const arRows = [[
    tableHeaderCell(LX("時刻 / Time", "Time", "時刻")),
    tableHeaderCell(LX("規模 / Mag.", "Mag.", "規模")),
    tableHeaderCell(LX("備考 / Note", "Note", "備考")),
    tableHeaderCell(LX("出典区分 / Tier", "Tier", "出典区分")),
  ]];
  aq.rows.forEach((r, i) => {
    const fill = { color: i % 2 ? WHITE : LIGHT };
    arRows.push([
      { text: r.when || r.time || "—", options: { fontSize: 11.5, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
      { text: r.mag || "—", options: { fontSize: 11.5, bold: true, color: NAVY, fill, align: "center", valign: "middle", margin: 3 } },
      { text: TT(r.note_en || "", r.note_ja || ""), options: { fontSize: 10.5, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
      { text: tierLabel ? tierLabel(r.tier) : (r.tier || ""), options: { fontSize: 10, color: MUTED, fill, align: "center", valign: "middle", margin: 3 } },
    ]);
  });
  s.addTable(arRows, autoPaged({ x: 0.4, y: ay, w: 12.5, colW: [2.4, 1.0, 7.6, 1.5], border: { pt: 0.5, color: LINE } }));
  const spread = TT(aq.spread_en || "", aq.spread_ja || "");
  if (spread) s.addText(spread, { x: 0.4, y: 6.18, w: 12.5, h: 0.58, fontSize: 10, color: MUTED, fontFace: FONT, align: "left", valign: "top", margin: 3, shrinkText: true });
  footer(s);
}
`;

// ---------------------------------------------------------------- 過去の主な被害地震

const HISTORICAL = `
/* ============ Slide 12h: Historical damaging earthquakes (gated) ============ */
// 熊本もこのキーを持つが、従来の27ページには無いページなので optional_slides で出し分ける。
if (slideOn("historical") && (d.historical || []).length) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Historical Damaging Earthquakes", "過去の主な被害地震");
  const hRows = [[
    tableHeaderCell(LX("年 / Year", "Year", "年")),
    tableHeaderCell(LX("地震 / Event", "Event", "地震")),
    tableHeaderCell(LX("規模 / Mag.", "Mag.", "規模")),
    tableHeaderCell(LX("被害 / Impact", "Impact", "被害")),
  ]];
  (d.historical || []).forEach((h, i) => {
    const fill = { color: i % 2 ? WHITE : LIGHT };
    hRows.push([
      { text: String(h.year || "—"), options: { fontSize: 11.5, bold: true, color: NAVY, fill, align: "center", valign: "middle", margin: 3 } },
      { text: TT(h.event_en || "", h.event_ja || ""), options: { fontSize: 11.5, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
      { text: h.mag || "—", options: { fontSize: 11.5, color: INK, fill, align: "center", valign: "middle", margin: 3 } },
      { text: TT(h.note_en || "", h.note_ja || ""), options: { fontSize: 10.5, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
    ]);
  });
  s.addTable(hRows, autoPaged({ x: 0.4, y: 1.15, w: 12.5, colW: [0.9, 3.6, 0.9, 7.1], border: { pt: 0.5, color: LINE } }));
  footer(s);
}
`;

// ---------------------------------------------------------------- 所見・注視点

const OBSERVATIONS = `
/* ============ Slide 12o: Observations & points to watch (data-driven) ============ */
if ((d.observations || []).length) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Observations & Points to Watch", "所見・注視点");
  biBulletsTier(s, 0.4, 1.15, 12.5, 5.45, d.observations, { base: 13, min: 10 });
  footer(s);
}
`;

// ---------------------------------------------------------------- 自由記述スライド

const EXTRA = `
/* ============ Slide 12e: Free-form slides from data (data-driven) ============ */
// 災害ごとに形の違う一品物のページ（例: 特定都市の被害報告、事前リスク評価、
// 都市プロファイル）を、ジェネレータを触らずに足すための汎用の受け皿。
//   { title_en, title_ja, intro_en, intro_ja,
//     columns: [{ key, label_en, label_ja, align, w }],
//     rows: [{ <key>: 値, ... }],  ← 値は文字列。言語別なら <key>_en / <key>_ja
//     image: "images キー", caption_en, caption_ja, note_en, note_ja,
//     source: { label, url } }
(d.extra_slides || []).forEach(x => {
  if (!x || (!x.title_en && !x.title_ja)) return;
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, x.title_en || x.title_ja, x.title_ja || x.title_en);
  const hasImg = !!(x.image && resolveImg(x.image));
  // image_full: 図が主役のページ。**縦をめいっぱい使う。**
  // 16:9 のスライドに A3 の縦長地図を置くと、幅ではなく高さで頭打ちになる。
  // 幅いっぱいの枠に入れても大きくならず、かえって小さくなる（実測）。
  // 高さを 4.6in から 5.15in へ伸ばすほうが効く。説明は左に回す。
  const imgFull = hasImg && x.image_full === true;
  const tx = 0.4, tw = hasImg ? (imgFull ? 7.6 : 7.2) : 12.5;
  let ty = 1.15;
  if (hasImg && !imgFull) imageSlot(s, 7.9, 1.2, 5.0, 4.6, x.image, x.caption_en || "", x.caption_ja || "", (x.source && x.source.url) || "");
  const intro = TT(x.intro_en || "", x.intro_ja || "");
  if (intro) {
    s.addText(intro, { x: tx, y: ty, w: tw, h: 1.60, fontSize: 11.5, color: INK, fontFace: FONT, align: "left", valign: "top", margin: 4, shrinkText: true });
    ty += 1.70;
  }
  const cols = x.columns || [];
  const rows = x.rows || [];
  if (cols.length && rows.length) {
    const xRows = [cols.map(c => tableHeaderCell(TT(c.label_en || c.key || "", c.label_ja || c.label_en || c.key || "")))];
    rows.forEach((r, i) => {
      const fill = { color: i % 2 ? WHITE : LIGHT };
      xRows.push(cols.map(c => {
        const v = (r[c.key] !== undefined) ? r[c.key] : TT(r[c.key + "_en"] || "", r[c.key + "_ja"] || "");
        return { text: (v === undefined || v === null || v === "") ? "—" : String(v), options: { fontSize: 11, color: INK, fill, align: c.align || "left", valign: "middle", margin: 3 } };
      }));
    });
    const colW = cols.map(c => c.w || (tw / cols.length));
    s.addTable(xRows, autoPaged({ x: tx, y: ty, w: tw, colW, border: { pt: 0.5, color: LINE } }));
  } else if (!intro) {
    s.addText(TT(x.note_en || "", x.note_ja || ""), { x: tx, y: ty, w: tw, h: 5.0, fontSize: 11.5, color: INK, fontFace: FONT, align: "left", valign: "top", margin: 4, shrinkText: true });
  }
  if (imgFull) {
    imageSlot(s, 8.3, 1.15, 4.6, 5.15, x.image,
      x.caption_en || "", x.caption_ja || "", (x.source && x.source.url) || "");
  }
  const note = ((cols.length && rows.length) || imgFull) ? TT(x.note_en || "", x.note_ja || "") : "";
  if (note) s.addText(note, { x: tx, y: 6.42, w: tw, h: 0.44, fontSize: 9.5, color: MUTED, fontFace: FONT, align: "left", valign: "top", margin: 3, shrinkText: true });
  if (x.source && x.source.url) srcLine(s, [x.source]);
  footer(s);
});
`;

// ---------------------------------------------------------------- 巻末ページ

const CLOSING = `
/* ============ Slide 14: Closing (gated) ============ */
// 熊本も meta.disseminate_* を持つが、従来の27ページには無いページなので出し分ける。
if (slideOn("closing") && (d.meta.disseminate_en || d.meta.disseminate_ja)) {
  s = p.addSlide(); s.background = { color: NAVY };
  logoMark(s, 5.67, 2.10, 2.0, 0.9, { align: "center", onDark: true, chip: true });
  s.addText(LX("Asian Disaster Reduction Center (ADRC) / アジア防災センター", "Asian Disaster Reduction Center (ADRC)", "アジア防災センター（ADRC）"),
    { x: 0.8, y: 3.25, w: 11.7, h: 0.5, align: "center", valign: "middle", color: WHITE, bold: true, fontSize: 20, fontFace: SERIF, margin: 0 });
  s.addText(TT(d.meta.disseminate_en || "", d.meta.disseminate_ja || "", "\\n"),
    { x: 1.6, y: 3.95, w: 10.1, h: 1.6, align: "center", valign: "top", color: "D8E0EC", fontSize: 12, fontFace: FONT, margin: 0, shrinkText: true });
  s.addText(String(d.meta.stamp || ""), { x: 0.8, y: 6.55, w: 11.7, h: 0.3, align: "center", valign: "middle", color: "9FB0C8", fontSize: 10, fontFace: FONT, margin: 0 });
}
`;

// 挿入位置。見出しコメントの**直前**に差し込む。
const INSERTS = [
  { name: "主な余震",                  probe: /^\/\* =+ Slide 7:\s*Tsunami & Intensity/m, code: AFTERSHOCK_ROWS },
  { name: "過去の主な被害地震 ＋ 所見 ＋ 自由記述", probe: /^\/\* =+ Slide 13:\s*Useful Links/m, code: HISTORICAL + OBSERVATIONS + EXTRA },
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
  if (!file) { console.error("✗ --file が必要です"); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`✗ 見つかりません: ${file}`); process.exit(1); }

  let src = fs.readFileSync(file, "utf8");
  if (src.includes(MARK)) { console.log("✓ すでに適用済みです。何もしません。"); return; }

  const problems = [];
  for (const ins of INSERTS) {
    const n = countMatches(src, ins.probe);
    if (n !== 1) problems.push(`${ins.name}: 挿入位置の見出しが ${n} 件（1件であるべき）`);
  }
  for (const [what, from] of [["市町村表の開始位置", AREAS_FROM], ["見出し", HEAD_FROM], ["地図の凡例", NOTE_FROM]]) {
    const n = src.split(from).length - 1;
    if (n !== 1) problems.push(`被災地域: ${what}が ${n} 件（1件であるべき）`);
  }
  for (const [what, from] of PE_REPS) {
    const n = src.split(from).length - 1;
    if (n !== 1) problems.push(`${what}が ${n} 件（1件であるべき）`);
  }
  if (!/^\}\s*$/m.test(src)) problems.push("想定外: 閉じ括弧が1つも無い");
  if (problems.length) {
    console.error("✗ 挿入位置を特定できないため中断しました。");
    problems.forEach(p => console.error(`   - ${p}`));
    process.exit(2);
  }

  // 巻末ページは最後（addSlide の後ろ、書き出しの前）。
  const WRITE_RE = /^(p\.writeFile\(|await p\.writeFile\(|p\.write)/m;
  if (countMatches(src, WRITE_RE) < 1) {
    console.error("✗ 書き出し行が見つからないため、巻末ページを置く位置を決められません。中断します。");
    process.exit(2);
  }

  for (const [, from, to] of PE_REPS) src = src.split(from).join(to);
  src = src.split(HEAD_FROM).join(HEAD_TO);
  src = src.split(NOTE_FROM).join(NOTE_TO);
  src = src.split(AREAS_FROM).join(AREAS_TO);
  for (const ins of INSERTS) {
    src = src.replace(ins.probe, m => `${MARK}\n${ins.code.trim()}\n${END}\n\n${m}`);
  }
  src = src.replace(WRITE_RE, m => `${MARK}\n${CLOSING.trim()}\n${END}\n\n${m}`);

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  console.log(`    ✓ 被災地域（cities が無く areas があるときだけ表を差し替え）`);
  INSERTS.forEach(i => console.log(`    ✓ ${i.name}`));
  console.log(`    ✓ 巻末ページ（optional_slides の "closing"）`);
  PE_REPS.forEach(([w]) => console.log(`    ✓ ${w}`));
  console.log("");
  console.log("  熊本への影響: なし。historical と closing は optional_slides ゲート、");
  console.log("  他はデータが無ければ描画しないので、27ページのまま変わらない。");

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".receivers2.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.receivers2.bak）`);
}

main();
