#!/usr/bin/env node
/*
 * apply_receiver_slides.js — 汎用性のあるイベントキーの受け皿スライドを足す
 *
 * コロンビアの独自実装（reports/colombia_eq_20260810/）が持っていて統一版に
 * 受け皿が無かったキーのうち、**どの国の災害でも使える6種**を統一版に足す。
 *
 *   tectonics       テクトニクス（本文＋ティア付き箇条書き）
 *   pager           USGS PAGER 影響評価（本文＋リンク）
 *   deaths_by_area  地域別の死者数（表）
 *   exposure        揺れの階級別 曝露人口（表）
 *   emsr916         Copernicus EMS ラピッドマッピング（諸元表＋発動理由＋注記）
 *   drm_system      相手国の防災体制（導入文＋箇条書き）
 *
 * すべて **データが無ければ描画しない**（既存の `if (d.tecforce)` と同じ流儀）。
 * したがって熊本の出力は1ページも変わらない。
 *
 * イベント固有だった `cali` `pre_event` `response_photos` `observations` は
 * ここには入れない。apply_slide_gates.js の optional_slides で扱う。
 *
 * 使い方:
 *   node scripts/apply_receiver_slides.js --file /path/to/gen_deck.js [--dry-run]
 */
"use strict";

const fs = require("fs");
const vm = require("vm");

const MARK = "/* --- receiver slides (disaster-report) --- */";

// ---------------------------------------------------------------- スライド定義

const TECTONICS = `
/* ============ Slide 6t: Seismotectonic Setting (data-driven) ============ */
if (d.tectonics && (d.tectonics.text_en || d.tectonics.text_ja)) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Seismotectonic Setting", "地震テクトニクス");
  s.addText([
    { text: (d.tectonics.text_en || "") + "\\n", options: { fontSize: 12, color: INK } },
    { text: d.tectonics.text_ja || "", options: { fontSize: 11, color: "444444" } },
  ], { x: 0.4, y: 1.12, w: 12.5, h: 2.30, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  const tpts = d.tectonics.points || [];
  if (tpts.length) biBulletsTier(s, 0.4, 3.55, 12.5, 3.05, tpts, { base: 13, min: 10.5 });
  srcLine(s, [linkBy("USGS"), linkBy("Tectonic"), linkBy("Seismotectonic")].filter(Boolean));
  footer(s);
}
`;

const PAGER = `
/* ============ Slide 8p: USGS PAGER assessment (data-driven) ============ */
if (d.pager && (d.pager.text_en || d.pager.text_ja)) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, d.pager.title_en || "USGS PAGER assessment", d.pager.title_ja || "USGS PAGERによる影響評価");
  s.addText([
    { text: (d.pager.text_en || "") + "\\n\\n", options: { fontSize: 12, color: INK } },
    { text: d.pager.text_ja || "", options: { fontSize: 11, color: "444444" } },
  ], { x: 0.4, y: 1.15, w: 12.5, h: 5.45, align: "left", valign: "top", fontFace: FONT, margin: 4, shrinkText: true });
  srcLine(s, [d.pager.url ? { label: LX("USGS PAGER", "USGS PAGER", "USGS PAGER"), url: d.pager.url } : null].filter(Boolean));
  footer(s);
}
`;

const DEATHS_BY_AREA = `
/* ============ Slide 8n: Deaths by area (data-driven) ============ */
if ((d.deaths_by_area || []).length) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Deaths by Area", "地域別の死者数");
  const dbRows = [[
    tableHeaderCell(LX("地域 / Area", "Area", "地域")),
    tableHeaderCell(LX("死者 / Deaths", "Deaths", "死者")),
    tableHeaderCell(LX("備考 / Note", "Note", "備考")),
  ]];
  (d.deaths_by_area || []).forEach((r, i) => {
    const fill = { color: i % 2 ? WHITE : LIGHT };
    dbRows.push([
      { text: TT(r.area_en || "", r.area_ja || ""), options: { fontSize: 12, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
      { text: (r.n === undefined || r.n === null) ? "—" : String(r.n), options: { fontSize: 12, bold: true, color: RED, fill, align: "right", valign: "middle", margin: 3 } },
      { text: TT(r.note_en || "", r.note_ja || ""), options: { fontSize: 10.5, color: MUTED, fill, align: "left", valign: "middle", margin: 3 } },
    ]);
  });
  s.addTable(dbRows, autoPaged({ x: 0.4, y: 1.15, w: 12.5, colW: [3.3, 1.2, 8.0], border: { pt: 0.5, color: LINE } }));
  const dbNote = TT(d.deaths_by_area_note_en || "", d.deaths_by_area_note_ja || "");
  if (dbNote) s.addText(dbNote, { x: 0.4, y: 6.20, w: 12.5, h: 0.55, fontSize: 10, color: MUTED, fontFace: FONT, align: "left", valign: "top", margin: 3, shrinkText: true });
  footer(s);
}
`;

const EXPOSURE = `
/* ============ Slide 8x: Population exposure by shaking intensity (data-driven) ============ */
if ((d.exposure || []).length) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Population Exposure by Shaking Intensity", "揺れの階級別 曝露人口");
  const exRows = [[
    tableHeaderCell("MMI"),
    tableHeaderCell(LX("階級 / Level", "Level", "階級")),
    tableHeaderCell(LX("曝露人口 / Exposed", "Exposed", "曝露人口")),
    tableHeaderCell(LX("備考 / Note", "Note", "備考")),
  ]];
  const fmtN = n => (n === undefined || n === null) ? "—" : Number(n).toLocaleString("en-US");
  (d.exposure || []).forEach((r, i) => {
    const fill = { color: i % 2 ? WHITE : LIGHT };
    exRows.push([
      { text: r.mmi || "—", options: { fontSize: 12, bold: true, color: NAVY, fill, align: "center", valign: "middle", margin: 3 } },
      { text: TT(r.label_en || "", r.label_ja || ""), options: { fontSize: 12, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
      { text: fmtN(r.n), options: { fontSize: 12, color: INK, fill, align: "right", valign: "middle", margin: 3 } },
      { text: TT(r.note_en || "", r.note_ja || ""), options: { fontSize: 10.5, color: MUTED, fill, align: "left", valign: "middle", margin: 3 } },
    ]);
  });
  s.addTable(exRows, autoPaged({ x: 0.4, y: 1.15, w: 12.5, colW: [1.0, 2.0, 1.8, 7.7], border: { pt: 0.5, color: LINE } }));
  const exNote = TT(d.exposure_note_en || "", d.exposure_note_ja || "");
  if (exNote) s.addText(exNote, { x: 0.4, y: 6.20, w: 12.5, h: 0.55, fontSize: 10, color: MUTED, fontFace: FONT, align: "left", valign: "top", margin: 3, shrinkText: true });
  footer(s);
}
`;

const EMSR = `
/* ============ Slide 12e: Copernicus EMS Rapid Mapping (data-driven) ============ */
if (d.emsr916 || d.copernicus_ems) {
  const em = d.emsr916 || d.copernicus_ems;
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, em.title_en || "Copernicus EMS Rapid Mapping", em.title_ja || "コペルニクスEMS ラピッドマッピング");
  const emRows = (em.rows || []).map((r, i) => {
    const fill = { color: i % 2 ? WHITE : LIGHT };
    return [
      { text: TT(r.k_en || "", r.k_ja || ""), options: { fontSize: 11.5, bold: true, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
      { text: String(r.v === undefined || r.v === null ? "—" : r.v), options: { fontSize: 11.5, color: INK, fill, align: "left", valign: "middle", margin: 3 } },
    ];
  });
  if (emRows.length) s.addTable(emRows, { x: 0.4, y: 1.15, w: 6.15, colW: [2.0, 4.15], border: { pt: 0.5, color: LINE } });
  const emRuns = [];
  if (em.reason_en || em.reason_ja) {
    emRuns.push({ text: LX("発動理由 / Activation reason\\n", "Activation reason\\n", "発動理由\\n"), options: { bold: true, fontSize: 12, color: NAVY } });
    emRuns.push({ text: (em.reason_en || "") + "\\n", options: { fontSize: 10.5, color: INK } });
    emRuns.push({ text: (em.reason_ja || "") + "\\n\\n", options: { fontSize: 10, color: "444444" } });
  }
  if (em.note_en || em.note_ja) {
    emRuns.push({ text: (em.note_en || "") + "\\n", options: { fontSize: 10.5, italic: true, color: MUTED } });
    emRuns.push({ text: em.note_ja || "", options: { fontSize: 10, italic: true, color: MUTED } });
  }
  if (emRuns.length) {
    s.addShape(p.ShapeType.roundRect, { x: 6.75, y: 1.15, w: 6.15, h: 5.35, fill: { color: LIGHT }, line: { color: NAVY2, width: 1 }, rectRadius: 0.06 });
    s.addText(emRuns, { x: 6.95, y: 1.30, w: 5.75, h: 5.05, align: "left", valign: "top", fontFace: FONT, margin: 4, shrinkText: true });
  }
  srcLine(s, [em.url ? { label: "Copernicus EMS", url: em.url } : null].filter(Boolean));
  footer(s);
}
`;

const DRM = `
/* ============ Slide 12d: National disaster risk management system (data-driven) ============ */
if (d.drm_system && ((d.drm_system.items || []).length || d.drm_system.intro_en || d.drm_system.intro_ja)) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "National Disaster Risk Management System", "相手国の防災体制");
  s.addText([
    { text: (d.drm_system.intro_en || "") + "\\n", options: { fontSize: 12, color: INK } },
    { text: d.drm_system.intro_ja || "", options: { fontSize: 11, color: "444444" } },
  ], { x: 0.4, y: 1.12, w: 12.5, h: 1.95, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  const drRuns = [];
  (d.drm_system.items || []).forEach(it => {
    if (BI || ENO) drRuns.push({ text: it.en || "", options: { fontSize: 11.5, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 2 } });
    if (BI || !ENO) drRuns.push({ text: it.ja || "", options: { fontSize: 11, color: BI ? "444444" : INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 4 } });
  });
  if (drRuns.length) s.addText(drRuns, { x: 0.4, y: 3.20, w: 12.5, h: 3.40, align: "left", valign: "top", fontFace: FONT, margin: 4, shrinkText: true });
  footer(s);
}
`;

// 挿入位置。見出しコメントの**直前**に差し込む。
const INSERTS = [
  { name: "tectonics",             probe: /^\/\* =+ Slide 6b:\s*Source Mechanism/m,        code: TECTONICS },
  { name: "pager + 地域別死者 + 曝露人口", probe: /^\/\* =+ Slide 8b:\s*Notable Damage/m,   code: PAGER + DEATHS_BY_AREA + EXPOSURE },
  { name: "EMS + 防災体制",         probe: /^\/\* =+ Slide 13:\s*Useful Links/m,            code: EMSR + DRM },
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
  if (problems.length) {
    console.error("✗ 挿入位置を特定できないため中断しました。");
    problems.forEach(p => console.error(`   - ${p}`));
    process.exit(2);
  }

  // 後ろの挿入位置から順に処理する必要はない（replace は各見出しを一意に特定するため）
  for (const ins of INSERTS) {
    src = src.replace(ins.probe, m => `${MARK}\n${ins.code.trim()}\n/* --- end receiver slides --- */\n\n${m}`);
  }

  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    console.error(`✗ パッチ後の構文が不正なため中断しました: ${e.message}`);
    process.exit(3);
  }

  console.log(`  対象: ${file}`);
  INSERTS.forEach(i => console.log(`    ✓ ${i.name}`));
  console.log(`\n  6種すべてデータ駆動。該当キーが無いイベント（熊本など）では1ページも増えない。`);

  if (dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.copyFileSync(file, file + ".receivers.bak");
  fs.writeFileSync(file, src, "utf8");
  console.log(`\n✓ 適用しました（元ファイルは ${file}.receivers.bak）`);
}

main();
