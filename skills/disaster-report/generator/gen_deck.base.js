/*
 * ADRC Disaster Report deck generator (data-driven, bilingual JP/EN).
 * Structure follows ADRC published disaster reports (2024 Noto Peninsula EQ,
 * 2025 Mandalay/Myanmar EQ, 2026 Mindanao/Sarangani EQ):
 *   Basic Info -> Seismotectonic/Historical -> Overview & Response ->
 *   Affected areas -> Intensity -> Seismicity -> Tsunami -> Damage ->
 *   Domestic support -> International support -> Satellite EO (I/II) ->
 *   Links & Sources.
 *
 * Source hierarchy is shown per item via a tier badge:
 *   official (公式) > media (報道) > tbc (確認中).
 *
 * Image slots use the real screenshot if data.images.<key> exists, else a
 * labelled placeholder with the source URL. Overflow is handled (auto-page
 * for full-width tables, shrink-to-fit for image-side tables & text).
 *
 * Usage:  OUT=/path/out.pptx node scripts/gen_deck.js
 */
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const DATA = process.env.DATA || path.join(HERE, "..", "data", "report_data.json");
const OUT = process.env.OUT || path.join(HERE, "..", "output", "Kumamoto_EQ_Report.pptx");
const d = JSON.parse(fs.readFileSync(DATA, "utf8"));

const p = new pptxgen();
p.layout = "LAYOUT_WIDE";
const W = 13.33, H = 7.5;

const NAVY = "1F3864", NAVY2 = "2E5496", RED = "C00000", ORANGE = "E07B00";
const INK = "222222", MUTED = "6A6A6A", LINE = "D9D9D9", LIGHT = "EAF2F8", WHITE = "FFFFFF";
const FONT = "Meiryo", SERIF = "Cambria", JFONT = "Meiryo"; // JFONT = Japanese gothic (sans), not mincho
const STAMP = d.meta.stamp || "", EDITION = d.meta.edition || "";

/* ======================= language layer (LANG_OUT) =======================
 * LANG_OUT=bi (default, back-compat) : bilingual EN+JA, byte-identical to the
 *                                      pre-existing deck.
 * LANG_OUT=ja                        : Japanese-only deck.
 * LANG_OUT=en                        : English-only deck.
 *
 * Data in report_data.json comes in three shapes:
 *   (A) already split   -> *_en / *_ja, or {en,ja}      : used directly
 *   (B) positional      -> [EN, JA] / [.., EN, JA, ..]  : picked by index (LX)
 *   (C) "EN / JA" in one string                         : split at run time by
 *       splitLine(): cut at the LAST delimiter that lies before the FIRST
 *       Japanese character. Delimiters: " / ", " - "(em/en dash), U+3000,
 *       ". ", "  ", "; ", " . ".  Verified on the whole data file:
 *       0 Japanese left on the EN side, 0 numeric tokens lost.
 *   (D) neutral English (mostly `source`)               : machine-translated
 *       for the JA deck by jaSrc() using an agency glossary.
 * ------------------------------------------------------------------------ */
const LANG = (process.env.LANG_OUT || "bi").toLowerCase();
const JAO = LANG === "ja", ENO = LANG === "en", BI = !JAO && !ENO;

const JA_RE = /[぀-ヿ㐀-鿿！-￯々〆]/;
const EN_RE = /[A-Za-z]{2}/;
const hasJA = s => JA_RE.test(String(s));
const hasEN = s => EN_RE.test(String(s));
const SEPS = [" / ", " — ", " – ", "　", ". ", "  ", "; ", " · "];

// Strings the generic rule cannot split (no delimiter before the first kanji).
const SPLIT_OVERRIDE = {
  "Yatsushiro, Kamiamakusa, Amakusa, Misato, Ashikita（M6.1 最大余震）": {
    en: "Yatsushiro, Kamiamakusa, Amakusa, Misato, Ashikita (M6.1, largest aftershock)",
    ja: "八代市・上天草市・天草市・美里町・芦北町（M6.1 最大余震）",
  },
  "FDMA / MOD / 報道": { en: "FDMA / MOD / media", ja: "消防庁／防衛省／報道" },
};

function firstJaIndex(s) { for (let i = 0; i < s.length; i++) if (JA_RE.test(s[i])) return i; return -1; }
function splitLine(raw) {
  const s = String(raw);
  const lead = (s.match(/^\s*/) || [""])[0];
  const tail = (s.match(/\s*$/) || [""])[0];
  const core = tail.length ? s.slice(lead.length, s.length - tail.length) : s.slice(lead.length);
  const ov = SPLIT_OVERRIDE[core];
  if (ov) return { en: lead + ov.en + tail, ja: lead + ov.ja + tail, mixed: true };
  const fi = firstJaIndex(core);
  if (fi < 0) return { en: s, ja: s, mixed: false };            // pure English / numeric
  let best = -1, bl = 0;
  for (const sep of SEPS) {
    let idx = -1, from = 0;
    for (;;) { const k = core.indexOf(sep, from); if (k < 0 || k + sep.length > fi) break; idx = k; from = k + 1; }
    if (idx > best) { best = idx; bl = sep.length; }
  }
  if (best < 0) return { en: s, ja: s, mixed: false };          // pure Japanese
  return {
    en: lead + core.slice(0, best).replace(/\s+$/, "") + tail,
    ja: lead + core.slice(best + bl).replace(/^\s+/, "") + tail,
    mixed: true,
  };
}
// "Title  /  " -> "Title"   (drop a dangling delimiter once the JA half is gone)
function stripTrailSep(s) {
  const nl = (String(s).match(/\n*$/) || [""])[0];
  let t = String(s).slice(0, String(s).length - nl.length);
  t = t.replace(/[ \t]*(?:\/|—|–|\||·|／)[ \t]*$/, "").replace(/[ \t]+$/, "");
  return t + nl;
}
const BULLET_RE = /^\s*[•▪●○*–—-]\s+/;
function leadBullet(s) { const m = String(s).match(BULLET_RE); return m ? m[0] : ""; }

/* Resolve a possibly-bilingual string to the active language.
   Works line by line: a pure-EN line immediately followed by a line containing
   Japanese is treated as a translation pair; anything else is split in place. */
function pickText(s) {
  if (BI || s == null || typeof s !== "string") return s;
  const lines = s.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i], b = lines[i + 1];
    if (b !== undefined && hasEN(a) && !hasJA(a) && hasJA(b)) {
      if (ENO) out.push(stripTrailSep(a));
      else { const pre = leadBullet(a); out.push(leadBullet(b) ? b : pre + b.replace(/^\s+/, "")); }
      i++; continue;
    }
    const r = splitLine(a);
    out.push(ENO ? r.en : r.ja);
  }
  return out.join("\n");
}
// explicit selector for (B) positional data and for hand-written literals
function LX(bi, en, ja) { return BI ? bi : (ENO ? en : ja); }
function TT(en, ja, sep) { return BI ? (en + (sep === undefined ? " / " : sep) + ja) : (ENO ? en : ja); }

/* --- (D) neutral-English -> Japanese, for the `source` column etc. --- */
const MONTH_N = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const SRC_GLOSS = [
  // compound organisation names must come BEFORE the bare acronyms below,
  // otherwise /\bMLIT\b/ fires first and leaves "Kyushu Bureau" untranslated.
  [/MLIT\s+Kyushu\s+Bureau/g, "九州地方整備局"],
  [/MLIT\s+Kyushu/g, "九州地方整備局"],
  [/JMA\s+Kumamoto\s+Local\s+Met\.?\s*Office/g, "熊本地方気象台"],
  [/Kumamoto\s+Local\s+Met\.?\s*Office/g, "熊本地方気象台"],
  [/Cabinet\s+Office/g, "内閣府"],
  [/Kumamoto\s+Nichinichi\s+Shimbun/g, "熊本日日新聞"],
  [/NEXCO\s+West/g, "NEXCO西日本"],
  [/Kumamoto\s+Pref\.?/g, "熊本県"],
  [/Kumamoto\s+City/g, "熊本市"],
  [/\bFDMA\b/g, "消防庁"],
  [/\bMLIT\b/g, "国土交通省"],
  [/\bJMA\b/g, "気象庁"],
  [/\bKantei\b/g, "首相官邸"],
  [/HERP Earthquake Research Committee/g, "地震調査委員会"],
  [/Earthquake Research Committee/g, "地震調査委員会"],
  [/\bHERP\b/g, "地震調査委員会"],
  [/\bIRIDeS\b/g, "東北大学災害科学国際研究所"],
  [/\bNPA\b/g, "警察庁"],
  [/\bMOD\b/g, "防衛省"],
  [/\bMHLW\b/g, "厚生労働省"],
  [/\bMAFF\b/g, "農林水産省"],
  [/\bMOE\b/g, "環境省"],
  [/\bGSI\b/g, "国土地理院"],
  [/\bJSDF\b/g, "自衛隊"],
  [/MLIT\s+Kyushu\s+Bureau/g, "九州地方整備局"],
  [/MLIT\s+Kyushu/g, "九州地方整備局"],
  [/JMA\s+Kumamoto\s+Met\.?\s*Office/g, "熊本地方気象台"],
  [/JMA\s+Kumamoto/g, "熊本地方気象台"],
  [/Chief\s+Cabinet\s+Secretary/g, "内閣官房長官"],
  [/\bMunicipalities\b/g, "市町村"],
  [/\bPref\.?/g, "県"],
  [/\bCabinet\b/g, "内閣府"],
  [/\bMETI\b/g, "経済産業省"],
  [/\bCharter\b/g, "国際災害チャーター"],
  [/JR\s+Kyushu/g, "JR九州"],
  [/LINE\s+Yahoo/g, "LINEヤフー"],
  [/JAXA\s+ALOS-2/g, "JAXA だいち2号"],
  [/GSI\s+GEONET/g, "国土地理院 GEONET"],
  [/Docomo\s+Mobaku/g, "ドコモ モバイル空間統計"],
  [/\bbriefing\b/g, "説明会"],
  [/\bvia\b/g, "経由"],
  [/\bcheck\b/g, "確認"],
  [/\bActivated\b/g, "発動"],
  [/\bAcquired\b/g, "取得済"],
  [/\bPre-event\b/g, "発災前"],
  [/\bOpen\b/g, "公開"],
  [/(\d+)\s+products?/g, "プロダクト$1点"],
  [/(\d+)\s+scenes?/g, "$1シーン"],
  [/\blatest\b/g, "最新"],
  [/Disaster\s+HQ/g, "災害対策本部"],
  [/Disaster\s+Management/g, "防災"],
  [/PM\s+Office/g, "首相官邸"],
  [/Defense\s+Minister/g, "防衛大臣"],
  [/press\s+conf(?:erence|\.)?/g, "記者会見"],
  [/mass\s+media/g, "報道各社"],
  [/moment\s+tensor/g, "モーメントテンソル"],
  [/strong\s+motion/g, "強震観測"],
  [/disaster\s+relief/g, "災害派遣"],
  [/statement\s+on\s+the\s+explosion/g, "爆発に関する説明"],
  [/\bmedia\b/g, "報道"],
];
// dates only ("3 Aug" -> "8/3", "4 Aug -" -> "8/4〜"), for compact table columns
function jaDate(v) {
  if (!JAO || v == null) return v;
  let t = String(v);
  if (hasJA(t)) return t;
  t = t.replace(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m, dd, mo) => MONTH_N[mo] + "/" + dd);
  t = t.replace(/\bmorning\b/g, "朝").replace(/\bafternoon\b/g, "午後").replace(/\bevening\b/g, "夕");
  return t.replace(/\s+-\s*$/, "〜");
}
function jaSrc(s) {
  if (!JAO || s == null) return s;
  let t = String(s);
  if (hasJA(t)) return t;                                  // already Japanese
  t = t.replace(/(\d+)(?:st|nd|rd|th)\s+HQ\s+meeting/g, "第$1回本部会議");
  t = t.replace(/(\d+)(?:st|nd|rd|th)\s+HQ/g, "第$1回災害対策本部会議");
  t = t.replace(/(\d+)(?:st|nd|rd|th)\s+report/g, "第$1報");
  t = t.replace(/(\d+)(?:st|nd|rd|th)\b/g, "第$1報");
  SRC_GLOSS.forEach(g => { t = t.replace(g[0], g[1]); });
  t = t.replace(/latest\s+as\s+of\s+([^);]+)/g, "$1時点で最新");
  t = t.replace(/\bas\s+of\s+/g, "");
  t = t.replace(/,\s+/g, "、").replace(/;\s+/g, "、");
  t = t.replace(/\s*\/\s*/g, "／");
  t = t.replace(/\s*\(\s*/g, "（").replace(/\s*\)/g, "）");
  // dates last, so the "/" they introduce is not turned into a full-width slash
  t = t.replace(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m, dd, mo) => MONTH_N[mo] + "/" + dd);
  return t;
}

let PAGE = 0;

// Footer date must ALWAYS render, even if a downstream step wiped meta.update_date.
function today_ddmmyyyy() {
  const t = new Date(Date.now() + 9 * 3600 * 1000); // JST
  const z = n => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}/${z(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
}
const UPDATE_DATE = d.meta.update_date || process.env.UPDATE_DATE || today_ddmmyyyy();

// Web-Mercator (EPSG:3857, same as Google Static Maps) lat/lon -> fraction of the map
// image (0..1 across width/height). Used to overlay numbered markers on the page-4 map.
// logicalW/H are the Static Maps `size=` (640x480); centre/zoom must match the fetched map.
function latlonToFrac(lat, lon, cLat, cLon, zoom, logicalW = 640, logicalH = 480) {
  const wpx = 256 * Math.pow(2, zoom);
  const wx = l => (l + 180) / 360 * wpx;
  const wy = la => { const r = la * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * wpx; };
  return { fx: 0.5 + (wx(lon) - wx(cLon)) / logicalW, fy: 0.5 + (wy(lat) - wy(cLat)) / logicalH };
}
const CITY_MAP = { cLat: 32.655, cLon: 130.707, zoom: 10 }; // must match google_cities target in fetch_images.mjs

// Read an image's intrinsic pixel size (PNG IHDR or JPEG SOF marker), no dependency,
// so images can be placed with their true aspect ratio and never get stretched/squashed.
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    if (m === 0xD8 || m === 0xD9 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
function imgSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.length > 24 && b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8) return jpegSize(b);
  } catch { /* ignore */ }
  return null;
}
const pngSize = imgSize; // back-compat alias

// ---- source tiers ----
const TIER = {
  official: { en: "Official", ja: "公式", color: "1E7A34" },
  media: { en: "Media", ja: "報道", color: "B8860B" },
  tbc: { en: "TBC", ja: "確認中", color: "888888" },
};
function tierColor(t) { return (TIER[t] || TIER.tbc).color; }
function tierText(t) { const x = TIER[t] || TIER.tbc; return LX(`[${x.ja}/${x.en}] `, `[${x.en}] `, `[${x.ja}] `); }
function tierLabel(t) { const x = TIER[t] || TIER.tbc; return LX(x.ja + " / " + x.en, x.en, x.ja); }
function tierRun(t, size) { const x = TIER[t] || TIER.tbc; return { text: tierText(t), options: { fontSize: size, bold: true, color: x.color } }; }

// ---- image / overflow helpers ----
function resolveImg(key) {
  // Manual override (HIGHEST priority): images/<key>_manual.<ext> — a hand-saved clean
  // image (e.g. a JMA intensity-map screenshot). Auto-capture never overwrites it.
  for (const ext of ["png", "jpg", "jpeg"]) {
    const m = path.join(HERE, "..", "images", key + "_manual." + ext);
    if (fs.existsSync(m)) return m;
  }
  const v = d.images && d.images[key];
  if (v) {
    const abs = path.isAbsolute(v) ? v : path.join(HERE, "..", v);
    if (fs.existsSync(abs)) return abs;
  }
  // Conventional location: images/<key>.png — used whether the file was captured by
  // fetch_images.mjs OR dropped in manually (e.g. adrc_logo.png, an official map export).
  // This is why an image, once present on disk, is always picked up on later runs.
  const conv = path.join(HERE, "..", "images", key + ".png");
  if (fs.existsSync(conv)) return conv;
  return null;
}
function vlen(s) { let n = 0; for (const ch of String(s)) n += /[^\x00-\xff]/.test(ch) ? 2 : 1; return n; }
function estLines(s, upl) { return String(s).split("\n").reduce((a, l) => a + Math.max(1, Math.ceil(vlen(l) / upl)), 0); }
function fitSize(strs, { base, min, upl, maxLines }) {
  const lines = (Array.isArray(strs) ? strs : [strs]).reduce((a, s) => a + estLines(s, upl), 0);
  if (lines <= maxLines) return base;
  return Math.max(min, Math.round((base * maxLines / lines) * 10) / 10);
}
function autoPaged(extra = {}) { return Object.assign({ autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 0.7 }, extra); }
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
function fitRows(nBody, availH, opt = {}) {
  const maxRowH = opt.maxRowH || 0.55, minRowH = opt.minRowH || 0.34;
  const baseFont = opt.baseFont || 11, minFont = opt.minFont || 8;
  let shownBody = nBody, cap = 0;
  const maxFit = Math.max(2, Math.floor(availH / minRowH));
  if (nBody + 1 > maxFit) { shownBody = Math.max(1, maxFit - 2); cap = nBody - shownBody; }
  const totalRows = shownBody + 1 + (cap ? 1 : 0);
  const rowH = Math.max(minRowH, Math.min(maxRowH, availH / totalRows));
  const fontSize = Math.max(minFont, Math.min(baseFont, Math.round((baseFont * rowH / maxRowH) * 10) / 10));
  return { shownBody, cap, rowH, fontSize };
}

// ---- chrome ----
// ADRC logo: real image images/adrc_logo.{png,jpg,jpeg,gif} if present, else a text wordmark.
function logoPath() {
  for (const ext of ["png", "jpg", "jpeg", "gif"]) {
    const pth = path.join(HERE, "..", "images", "adrc_logo." + ext);
    if (fs.existsSync(pth)) return pth;
  }
  return null;
}
function logoMark(slide, x, y, w, h, opts) {
  opts = opts || {};
  const img = logoPath();
  if (img) {
    // Fit within the x,y,w,h box preserving the logo's real aspect ratio (centered).
    let dw = w, dh = h, dx = x, dy = y;
    const sz = pngSize(img);
    if (sz && sz.w > 0 && sz.h > 0) {
      const k = Math.min(w / sz.w, h / sz.h);
      dw = sz.w * k; dh = sz.h * k;
      dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
    }
    if (opts.chip) slide.addShape(p.ShapeType.roundRect, { x: dx - 0.08, y: dy - 0.06, w: dw + 0.16, h: dh + 0.12, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 }, rectRadius: 0.05 });
    slide.addImage({ path: img, x: dx, y: dy, w: dw, h: dh });
    return;
  }
  slide.addText("ADRC", { x, y, w, h, align: opts.align || "right", valign: "middle", color: opts.onDark ? "FFFFFF" : NAVY, bold: true, fontSize: 15, fontFace: SERIF, charSpacing: 2, margin: 0 });
}
const ADRC_ORANGE = "E8A317"; // golden amber (shifted toward yellow per request)
function footer(slide, opts) {
  PAGE += 1;
  // bottom-right: "ADRC  DD/MM/YYYY" — white on an orange bar (ADRC report style)
  const cw = 1.7, ch = 0.3, cx = W - 0.4 - cw, cy = H - 0.38;
  slide.addShape(p.ShapeType.rect, { x: cx, y: cy, w: cw, h: ch, fill: { color: ADRC_ORANGE }, line: { color: ADRC_ORANGE, width: 0 } });
  slide.addText(`ADRC  ${UPDATE_DATE}`, { x: cx, y: cy, w: cw, h: ch, align: "center", valign: "middle", color: "000000", bold: true, fontSize: 11.5, fontFace: FONT, margin: 0 });
}
function linkBy(sub) { return (d.links || []).find(l => l.label && l.label.includes(sub)); }
function shortName(label) {
  const t = BI ? String(label) : pickText(String(label));
  if (JAO) {
    const head = t.split(" - ")[0].split(" — ")[0].trim().replace(/\s*\((?:media|official|tbc)\)\s*$/i, "");
    return jaSrc(head);
  }
  return t.split(" / ")[0].split(" - ")[0].split(" — ")[0].trim();
}
function srcLine(slide, items, opts) {
  items = (items || []).filter(Boolean);
  if (!items.length) return;
  const runs = [{ text: LX("出典 / Sources: ", "Sources: ", "出典: "), options: { fontSize: 10.5, color: MUTED, bold: true } }];
  if (items.length === 1) {
    runs.push({ text: shortName(items[0].label) + " — ", options: { fontSize: 10.5, color: MUTED } });
    runs.push({ text: items[0].url, options: { fontSize: 10, color: "0563C1", hyperlink: { url: items[0].url } } });
  } else {
    items.forEach((it, i) => {
      if (i) runs.push({ text: "   ·   ", options: { fontSize: 10.5, color: MUTED } });
      runs.push({ text: shortName(it.label), options: { fontSize: 10.5, color: "0563C1", hyperlink: { url: it.url } } });
    });
  }
  slide.addText(runs, { x: 0.4, y: (opts && opts.y) || 6.86, w: (opts && opts.w) || 12.5, h: 0.24, align: "left", fontFace: FONT, margin: 0, valign: "middle" });
}
function heading(slide, en, ja) {
  const runs = BI
    ? [
      { text: en, options: { bold: true, color: NAVY, fontSize: 21, fontFace: SERIF } },
      { text: "   /   " + ja, options: { bold: true, color: NAVY2, fontSize: 14, fontFace: FONT } },
    ]
    : ENO
      ? [{ text: en, options: { bold: true, color: NAVY, fontSize: 21, fontFace: SERIF } }]
      : [{ text: ja, options: { bold: true, color: NAVY, fontSize: 21, fontFace: FONT } }];
  slide.addText(
    runs,
    { x: 0.4, y: 0.30, w: 11.3, h: 0.66, align: "left", margin: 0, valign: "middle", wrap: false, shrinkText: true }
  );
  logoMark(slide, W - 1.5, 0.08, 1.24, 0.96, false); // match the title-slide logo size
}
function tableHeaderCell(t) { return { text: t, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 13, align: "left", valign: "middle", margin: 4 } }; }
function imageSlot(slide, x, y, w, h, key, capEn, capJa, url) {
  const img = resolveImg(key);
  if (img) {
    // Fit within the slot preserving the image's true aspect ratio (centered) — no distortion.
    const iw = w, ih = h - 0.66;
    let dw = iw, dh = ih, dx = x, dy = y;
    const sz = imgSize(img);
    if (sz && sz.w > 0 && sz.h > 0) { const k = Math.min(iw / sz.w, ih / sz.h); dw = sz.w * k; dh = sz.h * k; dx = x + (iw - dw) / 2; dy = y + (ih - dh) / 2; }
    slide.addImage({ path: img, x: dx, y: dy, w: dw, h: dh });
    const cap = BI
      ? [
        { text: capEn, options: { fontSize: 9, color: MUTED, align: "center", breakLine: true } },
        { text: capJa, options: { fontSize: 8.5, color: MUTED, align: "center", breakLine: !!url } },
      ]
      : [{ text: ENO ? capEn : capJa, options: { fontSize: 9, color: MUTED, align: "center", breakLine: !!url } }];
    if (url) cap.push({ text: url, options: { fontSize: 7.5, color: "0563C1", align: "center", hyperlink: { url } } });
    slide.addText(cap, { x, y: y + h - 0.64, w, h: 0.64, align: "center", valign: "top", wrap: true, shrinkText: true, fontFace: FONT, margin: 0 });
    return;
  }
  slide.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: LIGHT }, line: { color: NAVY2, width: 1, dashType: "dash" }, rectRadius: 0.06 });
  const runs = BI
    ? [
      { text: "🛰  " + capEn + "\n", options: { bold: true, fontSize: 12.5, color: NAVY } },
      { text: capJa + "\n", options: { fontSize: 12, color: NAVY2 } },
      { text: "\nInsert image before web release. 公開前に画像を挿入。\n", options: { fontSize: 11.5, color: MUTED, italic: true } },
    ]
    : [
      { text: "🛰  " + (ENO ? capEn : capJa) + "\n", options: { bold: true, fontSize: 12.5, color: NAVY } },
      { text: LX("", "\nInsert image before web release.\n", "\n公開前に画像を挿入。\n"), options: { fontSize: 11.5, color: MUTED, italic: true } },
    ];
  if (url) runs.push({ text: url, options: { fontSize: 11, color: "0563C1", hyperlink: { url } } });
  slide.addText(runs, { x: x + 0.15, y: y + 0.15, w: w - 0.3, h: h - 0.3, align: "center", valign: "middle", fontFace: FONT });
}
// bilingual bullets with a leading source-tier badge, auto-shrunk to fit
function biBulletsTier(slide, x, y, w, h, items, opts) {
  opts = opts || {};
  // uplK / lh let a caller use a *measured* line metric instead of the very
  // conservative default (which left the lower 40% of every bullet page blank
  // in the one-language decks).  They are ignored in bilingual mode so the
  // bilingual deck stays byte-identical.
  const base0 = opts.base || 14;
  const upl = BI ? Math.round(w * 8.0) : tierMetrics(w, base0).upl;
  const maxLines = (!BI && opts.maxLines) ? opts.maxLines : Math.floor(h / 0.30);
  const all = BI ? items.flatMap(it => [it.en, it.ja]) : items.map(it => (ENO ? it.en : it.ja));
  const fsz = fitSize(all, { base: opts.base || 14, min: opts.min || 11, upl, maxLines });
  const bs = Math.max(9.5, fsz - 1);
  const runs = [];
  const line = (txt, tier, color, size, date) => {
    runs.push(Object.assign(tierRun(tier, bs), { options: { fontSize: bs, bold: true, color: tierColor(tier), bullet: { code: "2022" } } }));
    if (date) runs.push({ text: "[" + date + "] ", options: { fontSize: bs, bold: true, color: ADRC_ORANGE } });
    runs.push({ text: txt, options: { fontSize: size, color, breakLine: true, paraSpaceAfter: 2 } });
  };
  if (BI) {
    items.forEach(it => line(it.en, it.tier, INK, fsz, it.date));
    items.forEach(it => line(it.ja, it.tier, "444444", Math.max(10, fsz - 1), it.date));
  } else {
    items.forEach(it => line(ENO ? it.en : it.ja, it.tier, INK, fsz, it.date));
  }
  slide.addText(runs, { x, y, w, h, align: "left", valign: "top", fontFace: FONT, margin: 4 });
}

/* --- language interceptor -------------------------------------------------
 * Every addText / addTable / addChart on a slide is routed through the
 * resolver, so the inline bilingual run pairs and all "EN / JA" table cells
 * collapse to one language without touching each call site.
 * In bi mode this is a strict pass-through (byte-identical output).        */
function mergeRunOpts(a, b) {
  const o = Object.assign({}, a || {});
  ["breakLine", "bullet", "paraSpaceAfter", "paraSpaceBefore", "hyperlink", "indentLevel", "align"].forEach(k => {
    if (b && b[k] !== undefined) o[k] = b[k];
  });
  return o;
}
function jaFont(run) {
  if (!JAO) return run;
  const o = run.options || {};
  if (o.fontFace === SERIF) return Object.assign({}, run, { options: Object.assign({}, o, { fontFace: FONT }) });
  return run;
}
function pickRuns(runs) {
  if (BI || !Array.isArray(runs)) return runs;
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    const a = runs[i], b = runs[i + 1];
    const ta = a && a.text != null ? String(a.text) : "";
    const tb = b && b.text != null ? String(b.text) : "";
    if (b && ta.trim() && tb.trim() && hasEN(ta) && !hasJA(ta) && hasJA(tb)) {
      if (ENO) out.push(Object.assign({}, a, { text: stripTrailSep(ta) }));
      else {
        const pre = leadBullet(ta);
        const txt = leadBullet(tb) ? tb : pre + tb.replace(/^[ \t]+/, "");
        out.push({ text: txt, options: mergeRunOpts(a.options, b.options) });
      }
      i++; continue;
    }
    out.push(Object.assign({}, a, { text: pickText(ta) }));
  }
  return out.map(jaFont);
}
function langText(t) {
  if (BI) return t;
  if (typeof t === "string") return pickText(t);
  if (Array.isArray(t)) return pickRuns(t);
  if (t && typeof t === "object" && typeof t.text === "string") return Object.assign({}, t, { text: pickText(t.text) });
  return t;
}
function langCell(c) {
  if (typeof c === "string") return pickText(c);
  if (c && typeof c === "object") {
    if (Array.isArray(c.text)) return Object.assign({}, c, { text: pickRuns(c.text) });
    if (typeof c.text === "string") return Object.assign({}, c, { text: pickText(c.text) });
  }
  return c;
}
function langRows(rows) { return BI ? rows : rows.map(r => (Array.isArray(r) ? r.map(langCell) : r)); }
function langOpts(o) {
  if (BI || !o) return o;
  const n = Object.assign({}, o);
  if (typeof n.title === "string") n.title = pickText(n.title);
  if (JAO) n.fontFace = FONT;
  return n;
}
{
  const _addSlide = p.addSlide.bind(p);
  p.addSlide = function (...args) {
    const sl = _addSlide(...args);
    if (BI) return sl;
    const _t = sl.addText.bind(sl), _tb = sl.addTable.bind(sl), _c = sl.addChart.bind(sl);
    sl.addText = (t, o) => _t(langText(t), JAO && o ? Object.assign({}, o, { fontFace: FONT }) : o);
    sl.addTable = (r, o) => _tb(langRows(r), JAO && o ? Object.assign({}, o, { fontFace: FONT }) : o);
    sl.addChart = (ty, dt, o) => _c(ty, (dt || []).map(x => Object.assign({}, x, {
      name: pickText(x.name), labels: (x.labels || []).map(l => (typeof l === "string" ? pickText(l) : l)),
    })), langOpts(o));
    return sl;
  };
}
// estimator that counts only the language actually rendered
function estBi2(en, ja, a, c) {
  return BI ? (estLinesBi(en, a, c) + estLinesBi(ja, a, c)) : estLinesBi(ENO ? en : ja, a, c);
}

/* ============ Slide 1: Title / Basic Information (ADRC Noto layout) ============ */
let s = p.addSlide(); s.background = { color: WHITE };
// Optional faded title-band photo (drop one at images/title_bg.png for the Noto photo look).
const titleBg = resolveImg("title_bg");
if (titleBg) {
  s.addImage({ path: titleBg, x: 0, y: 0, w: W, h: 1.95, sizing: { type: "cover", w: W, h: 1.95 } });
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.95, fill: { color: "FFFFFF", transparency: 30 }, line: { width: 0 } });
}
// Logo TOP-RIGHT (as instructed / Noto), aspect-preserved so it never distorts.
logoMark(s, W - 1.48, 0.2, 1.24, 0.98, {});
// Centered title + GLIDE (parentheses, directly under) + key params — Noto style.
s.addText([
  { text: `${d.meta.title_en}  /  `, options: { fontFace: SERIF } },
  { text: d.meta.title_ja, options: { fontFace: JFONT } },
], { x: 0.5, y: 0.114, w: 12.33, h: 0.66, align: "center", color: "111111", fontSize: 22, bold: true, valign: "middle" });
s.addText(`(GLIDE No. ${d.meta.glide})`, { x: 0.5, y: 0.615, w: 12.33, h: 0.3, align: "center", color: MUTED, fontSize: 14, bold: true, fontFace: FONT });
s.addText(LX(`${d.event.magnitude}   ·   Max. seismic intensity ${d.event.max_intensity} (JMA)   ·   ${d.event.epicentre_en}`,
  `${d.event.magnitude}   ·   Max. seismic intensity ${d.event.max_intensity} (JMA)   ·   ${d.event.epicentre_en}`,
  `${d.event.magnitude}   ·   最大震度${d.event.max_intensity}（気象庁）   ·   ${d.event.epicentre_ja}`), { x: 0.5, y: 0.876, w: 12.33, h: 0.3, align: "center", color: INK, fontSize: 13, fontFace: FONT });
s.addShape(p.ShapeType.line, { x: 0.4, y: 1.255, w: W - 0.8, h: 0, line: { color: LINE, width: 1 } });

// ---- big locator sequence: World → Japan → Kumamoto/JMA intensity ----
function redBox(sl, x, y, w, h) { sl.addShape(p.ShapeType.rect, { x, y, w, h, fill: { color: "FFFFFF", transparency: 100 }, line: { color: RED, width: 1.75 } }); }
function redLine(sl, x1, y1, x2, y2) {
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1) || 0.001, h = Math.abs(y2 - y1) || 0.001;
  sl.addShape(p.ShapeType.line, { x, y, w, h, flipV: ((x2 - x1) * (y2 - y1) < 0), line: { color: RED, width: 1.5 } });
}
function mapCell(sl, x, y, w, h, key, cap) {
  const img = resolveImg(key);
  if (img) {
    s.addShape(p.ShapeType.rect, { x, y, w, h, fill: { color: "F2F2F2" }, line: { color: LINE, width: 0.75 } });
    sl.addImage({ path: img, x, y, w, h, sizing: { type: "cover", w, h } });
  } else {
    sl.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: LIGHT }, line: { color: NAVY2, width: 1, dashType: "dash" }, rectRadius: 0.05 });
    sl.addText(LX("公開前に地図画像を挿入\nInsert map before release", "Insert map before release", "公開前に地図画像を挿入"), { x, y, w, h, align: "center", valign: "middle", color: MUTED, italic: true, fontSize: 12, fontFace: FONT });
  }
  if (cap) {
    sl.addShape(p.ShapeType.rect, { x: x + w - 1.32, y: y + h - 0.26, w: 1.32, h: 0.26, fill: { color: "000000", transparency: 35 }, line: { width: 0 } });
    sl.addText(cap, { x: x + w - 1.32, y: y + h - 0.26, w: 1.28, h: 0.26, align: "right", valign: "middle", color: "FFFFFF", fontSize: 8.5, fontFace: FONT, margin: 2 });
  }
}
// The dark "Overview" band is laid out FIRST (height only) because in a
// single-language deck it is roughly half as tall, and the space it gives back
// is what the three locator maps grow into.  The band is pinned to the bottom
// (its lower edge lands just above the source line at y=7.06).
const descBody = BI ? (d.event.summary_en + d.event.summary_ja)
                    : (ENO ? d.event.summary_en : d.event.summary_ja);
const descH = BI ? 2.92
                 : Math.max(1.30, Math.min(2.92, estLines(descBody, 150) * 0.20 + 0.34));
const descY = BI ? 4.10 : (6.92 - descH);

// 4:3 boxes match the Static Maps 640x480 image (no cover-crop) so the red zoom
// boxes below, computed from lat/lon, line up with what the map actually shows.
// The aspect ratio is therefore NEVER changed - width and height are scaled by
// the same factor, otherwise geoRect() (and the red zoom boxes / leader lines
// it feeds) would no longer match the pixels of the map image.
const MAP_SPAN = 12.5;        // 0.4 .. 12.9 in, the usual content width
const MAP_MINGAP = 0.60;      // room for the red leader lines between maps
let mapY = 1.80, mapH = 2.2125, mapW = 2.95, gap = 1.825;
if (!BI) {
  const availH = (descY - 0.14) - mapY;                       // vertical room left by the band
  const byWidth = (MAP_SPAN - 2 * MAP_MINGAP) / 3;            // widest 3-up that still fits
  mapW = Math.max(2.60, Math.min(byWidth, availH / 0.75));    // 4:3 kept exactly
  mapH = mapW * 0.75;
  gap = (MAP_SPAN - 3 * mapW) / 2;
  mapY = 1.80 + Math.max(0, Math.min(0.42, (availH - mapH) / 2)); // centre the leftover
}
const xs = [0.4, 0.4 + mapW + gap, 0.4 + 2 * (mapW + gap)];
const seq = [
  { t: "① World → Japan / 世界→日本", key: "google_world", cap: "© Google" },
  { t: "② Japan → Kumamoto / 日本→熊本", key: "google_japan", cap: "© Google" },
  { t: "③ JMA intensity / 気象庁 震度分布", key: "intensity_map", cap: "© JMA" },
];
seq.forEach((m, i) => {
  s.addText(m.t, { x: xs[i], y: mapY - 0.30, w: mapW + 1.5, h: 0.28, align: "left", color: NAVY, bold: true, fontSize: 12.5, fontFace: FONT, margin: 0, wrap: false });
  mapCell(s, xs[i], mapY, mapW, mapH, m.key, m.cap);
});
// Geographically-correct red zoom boxes — computed from each map's centre/zoom so the
// box on the world map actually encloses Japan, and the Japan box encloses Kumamoto.
const WORLD_MAP = { cLat: 36, cLon: 138, zoom: 4 };  // matches google_world in fetch_images.mjs
const JAPAN_MAP = { cLat: 32.7, cLon: 130.8, zoom: 7 }; // matches google_japan
function geoRect(map, latN, latS, lonW, lonE, mx) {
  const clamp = v => Math.max(0.015, Math.min(0.985, v));
  const a = latlonToFrac(latN, lonW, map.cLat, map.cLon, map.zoom);
  const b = latlonToFrac(latS, lonE, map.cLat, map.cLon, map.zoom);
  const x1 = mx + clamp(a.fx) * mapW, y1 = mapY + clamp(a.fy) * mapH;
  const x2 = mx + clamp(b.fx) * mapW, y2 = mapY + clamp(b.fy) * mapH;
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
const rw = geoRect(WORLD_MAP, 45.8, 30.0, 128.5, 146.5, xs[0]); // Japan archipelago
redBox(s, rw.x, rw.y, rw.w, rw.h);
redLine(s, rw.x + rw.w, rw.y, xs[1], mapY);
redLine(s, rw.x + rw.w, rw.y + rw.h, xs[1], mapY + mapH);
const rj = geoRect(JAPAN_MAP, 33.35, 31.95, 130.05, 131.55, xs[1]); // Kumamoto / epicentre area
redBox(s, rj.x, rj.y, rj.w, rj.h);
redLine(s, rj.x + rj.w, rj.y, xs[2], mapY);
redLine(s, rj.x + rj.w, rj.y + rj.h, xs[2], mapY + mapH);

// ---- dark description band (white text), Noto style ----
// Band height follows the rendered content (computed above, with descY): in
// single-language mode the text is roughly half as long, so a fixed 2.92in band
// would leave a large black void - and the band is pushed to the bottom of the
// slide so the space it frees goes to the maps rather than to a white gap.
s.addShape(p.ShapeType.rect, { x: 0, y: descY, w: W, h: descH, fill: { color: "262626" }, line: { width: 0 } });
s.addText([
  { text: "Overview / 概要   ", options: { bold: true, fontSize: 12.5, color: "FFC000" } },
  { text: d.event.summary_en + "   ", options: { fontSize: 11, color: "FFFFFF" } },
  { text: d.event.summary_ja, options: { fontSize: 10.5, color: "D6D6D6" } },
], { x: 0.5, y: descY + 0.08, w: 12.33, h: descH - 0.16, align: "left", valign: "top", fontFace: FONT, margin: 3 });
srcLine(s, [linkBy("intensity map"), { label: "Google Maps © Google", url: "https://www.google.com/maps/" }], { y: 7.06, w: 10.6 });
footer(s, { noDraft: true });

/* ============ Slide 2: The 2016 Kumamoto Earthquake & Recovery ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "The 2016 Kumamoto Earthquake & Recovery", "2016年熊本地震と復興の途上");
{
  const pe = d.prior_event || {};
  s.addText([
    { text: (pe.title_en || "") + "  /  " + (pe.title_ja || "") + "\n", options: { bold: true, fontSize: 13, color: NAVY } },
    { text: (pe.overview_en || "") + "\n", options: { fontSize: 11.5, color: INK } },
    { text: pe.overview_ja || "", options: { fontSize: 11, color: "444444" } },
  ], { x: 0.4, y: 1.15, w: 6.3, h: 2.05, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  const stRows = [[tableHeaderCell("2016 damage / 被害"), tableHeaderCell("Figure / 数値")]];
  (pe.stats || []).forEach((r, i) => stRows.push([
    { text: `${r.item_en} / ${r.item_ja}`, options: { fontSize: 12, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 3 } },
    { text: r.value, options: { fontSize: 11.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 3 } },
  ]));
  s.addTable(stRows, { x: 0.4, y: 3.25, w: 6.3, colW: [2.6, 3.7], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.44 });

  const runs = [{ text: "Recovery — still under way (10 years on) / 復興の途上（約10年）\n", options: { bold: true, fontSize: 13, color: NAVY } }];
  if (BI) {
    (pe.recovery_en || []).forEach(t => runs.push({ text: t, options: { fontSize: 12, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 2 } }));
    (pe.recovery_ja || []).forEach(t => runs.push({ text: t, options: { fontSize: 11.5, color: "444444", bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 2 } }));
  } else {
    ((ENO ? pe.recovery_en : pe.recovery_ja) || []).forEach(t => runs.push({ text: t, options: { fontSize: 12.5, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 4 } }));
  }
  s.addText(runs, { x: 6.9, y: 1.15, w: 6.0, h: 4.35, align: "left", valign: "top", fontFace: FONT, margin: 4 });

  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 5.92, w: 12.5, h: 0.62, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.04 });
  s.addText([
    { text: (pe.context_en || "") + "\n", options: { bold: true, fontSize: 10.5, color: "9A3B12" } },
    { text: pe.context_ja || "", options: { fontSize: 12.5, color: "7A2E0E" } },
  ], { x: 0.65, y: 5.95, w: 12.0, h: 0.56, align: "left", valign: "middle", fontFace: FONT, margin: 2 });
}
srcLine(s, [linkBy("2016 Kumamoto"), linkBy("2016 EQ recovery"), linkBy("Kumamoto City - 2016")]);
footer(s);


/* --- shared line-count estimator: CJK glyphs are ~2x the width of ASCII --- */
function estLinesBi(text, asciiPerLine, cjkPerLine) {
  const t = BI ? String(text || "") : pickText(String(text || ""));
  let a = 0, c = 0;
  for (const ch of t) { if (ch.charCodeAt(0) < 0x2E80) a++; else c++; }
  // Bilingual text is two paragraphs, so the two ceilings are correct there.
  // A single-language string is ONE paragraph that mixes scripts, and rounding
  // each script up separately over-estimated every mixed row by ~1 line, which
  // is what left half a page empty in the one-language decks.
  return BI ? Math.ceil(a / asciiPerLine) + Math.ceil(c / cjkPerLine)
    : Math.max(1, Math.ceil(a / asciiPerLine + c / cjkPerLine));
}

/* Line metrics of a biBulletsTier text box, measured on the LibreOffice export:
   at 14 pt the line pitch is 15.62 pt (= 1.116 x font size), paraSpaceAfter adds
   2 pt per bullet, and a full line holds (boxWidth - margins) / (0.5 em) "vlen"
   units.  The 0.98 factor is the safety margin.                              */
// Average advance width of one "vlen unit" (= half an em).  Measured on the
// exported PDFs: the CJK deck runs at almost exactly 0.5 em, the Latin deck at
// ~0.47 em because spaces and lower-case letters are narrower.
const EM_UNIT = ENO ? 0.47 : 0.50;
function tierMetrics(w, base) {
  return {
    upl: Math.max(20, Math.floor((w - 0.11) * 72 / (base * EM_UNIT) * 0.98)),
    linePt: base * (ENO ? 1.16 : 1.116),
    paraPt: ENO ? 2.6 : 2.0,
  };
}

/* --- pack bullets with EXACTLY the metric biBulletsTier's fitSize uses, so a
   page is filled as far as it can go and yet never triggers the auto-shrink.
   One-language decks only; the bilingual deck keeps packBullets().          --- */
function packBulletsTier(items, w, h, opts) {
  opts = opts || {};
  const base = opts.base || 14;
  const m = tierMetrics(w, base);
  const avail = h * 72 - 14;      // 4pt cell margins top+bottom + safety
  const pages = []; let cur = [], used = 0, nl = 0;
  const flush = () => { cur.lines = nl; pages.push(cur); cur = []; used = 0; nl = 0; };
  (items || []).forEach((it) => {
    // count the tier badge / date prefix too - fitSize does not, so this is the
    // conservative side and the rendered size can only stay at `base`.
    const t = tierText(it.tier) + (it.date ? "[" + it.date + "] " : "") + String(ENO ? it.en : it.ja);
    const l = estLines(t, m.upl);
    const hh = l * m.linePt + m.paraPt;
    if (cur.length && used + hh > avail) flush();
    cur.push(it); used += hh; nl += l;
  });
  if (cur.length) flush();
  if (!pages.length) { const e = []; e.lines = 1; pages.push(e); }
  return pages;
}

/* Estimated rendered height of one table cell, calibrated against the
   LibreOffice PDF export: a point of font size is ~0.0172 in of line height,
   and the cell margins add ~0.13 in per row (added by estRowH).            */
function estCellLines(text, colW, fs, margin, emA, emC) {
  const inner = Math.max(0.4, colW - 2 * ((margin == null ? 4 : margin) / 72) - 0.04);
  const A = inner / (fs * (emA || EM_UNIT) / 72), C = inner / (fs * (emC || 1.0) / 72);
  const t = BI ? String(text == null ? "" : text) : pickText(String(text == null ? "" : text));
  let n = 0;
  t.replace(/\n+$/, "").split("\n").forEach((ln) => {
    let a = 0, c = 0;
    for (const ch of ln) { if (ch.charCodeAt(0) < 0x2E80) a++; else c++; }
    n += Math.max(1, Math.ceil(a / A + c / C));
  });
  return n;
}
function estCellH(text, colW, fs, margin) { return estCellLines(text, colW, fs, margin) * (fs * 0.0172); }
/* Height of a "note" panel (orange Lesson box, blue participation box, ...).
   LibreOffice lays the whole panel out as ONE paragraph, so the line pitch is
   driven by the LARGEST font in it - a 9pt body under an 11pt heading still
   gets an 11pt line.  Modelling that is what stops the last line of the
   lesson text from sticking out below the rounded rectangle.               */
function noteBoxH(w, parts) {
  // measured advance widths inside these small-type panels (regression on the
  // exported PDF): CJK 1.06 em, Latin 0.55 em (JA deck) / 0.475 em (EN deck).
  const eA = ENO ? 0.475 : 0.55, eC = 1.06;
  const maxFs = parts.reduce((a, q) => Math.max(a, q[1]), 1);
  const lines = parts.reduce((a, q) => a + estCellLines(q[0], w, q[1], 4, eA, eC), 0);
  return (lines * maxFs * 1.16 + 14) / 72;
}
/* Rendered height (inches) of a biBulletsTier block, single-language decks. */
function tierLinesTotal(items, w, base) {
  const m = tierMetrics(w, base);
  return Math.max(1, (items || []).reduce((a, it) => a + estLines(
    tierText(it.tier) + (it.date ? "[" + it.date + "] " : "") + String(ENO ? it.en : it.ja), m.upl), 0));
}
function tierBlockH(items, w, base) {
  const m = tierMetrics(w, base);
  return (tierLinesTotal(items, w, base) * m.linePt + (items || []).length * m.paraPt + 8) / 72;
}
/* After a greedy height-based split, a nearly-empty final page looks like a
   mistake (11 rows + 1 orphan).  Pull rows back into it until it is at least
   ~45% full, as long as the budget allows.                                  */
function balanceTail(pages, rowH, budget) {
  const sum = (g) => g.reduce((a, r) => a + rowH(r), 0);
  while (pages.length >= 2) {
    const last = pages[pages.length - 1], prev = pages[pages.length - 2];
    if (prev.length <= 1) break;
    const hL = sum(last);
    if (hL >= 0.45 * budget) break;
    const mv = prev[prev.length - 1];
    if (hL + rowH(mv) > budget) break;
    prev.pop(); last.unshift(mv);
  }
  return pages;
}
function estRowH(cells, minH) {
  const hs = cells.map((c) => estCellH(c[0], c[1], c[2], c[3]));
  return Math.max(minH == null ? 0.32 : minH, Math.max.apply(null, hs) + 0.13);
}

/* --- pack bullet items so biBulletsTier never has to shrink below ~min --- */
function packBullets(items, linesPerPage, asciiPerLine, cjkPerLine) {
  const pages = []; let cur = [], n = 0;
  (items || []).forEach((it) => {
    const l = BI ? (estLinesBi(it.en, asciiPerLine, cjkPerLine) + estLinesBi(it.ja, asciiPerLine, cjkPerLine))
      : estLinesBi(ENO ? it.en : it.ja, asciiPerLine, cjkPerLine);
    if (cur.length && n + l > linesPerPage) { pages.push(cur); cur = []; n = 0; }
    cur.push(it); n += l;
  });
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}
/* ============ Slide 3b: Chronology of Response (manually paginated, ~11 rows/page) ============ */
if ((d.timeline || []).length) {
  // Adaptive pagination: pack rows by estimated rendered height so the table never
  // reaches the "Sources" line (y=6.86). Long rows simply get fewer per page.
  // inches available between the table top (1.30) and the source line (6.86).
  // Bilingual rows are packed conservatively; one-language rows are short enough
  // to use more of the gap, which is how the block loses pages without shrinking type.
  const TL_BUDGET = BI ? 5.05 : 5.15;
  const TL_ROWH = BI ? 0.52 : 0.30;   // one language = one text line in most rows
  const tlRowH = (r) => {
    const lines = estBi2(r.en, r.ja, BI ? 128 : 138, BI ? 62 : 67);
    return Math.max(TL_ROWH, lines * (BI ? 0.19 : 0.175) + (BI ? 0.16 : 0.125));
  };
  const pages = [];
  { let cur = [], h = 0;
    d.timeline.forEach((r) => {
      const rh = tlRowH(r);
      if (cur.length && h + rh > TL_BUDGET) { pages.push(cur); cur = []; h = 0; }
      cur.push(r); h += rh;
    });
    if (cur.length) pages.push(cur);
    // Avoid an orphan last page: pull rows back from the previous page while the
    // last page stays within budget. Only ever moves rows OFF an earlier page,
    // so no page can overflow as a result.
    while (pages.length > 1 && pages[pages.length - 1].length < 3 && pages[pages.length - 2].length > 2) {
      const prev = pages[pages.length - 2], last = pages[pages.length - 1];
      const cand = prev[prev.length - 1];
      const lastH = last.reduce((a, r) => a + tlRowH(r), 0);
      if (lastH + tlRowH(cand) > TL_BUDGET) break;
      prev.pop(); last.unshift(cand);
    }
  }
  pages.forEach((rows, pi) => {
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, `Chronology of Response (${d.meta.timeline_range_en || "from onset"})` + (pages.length > 1 ? ` (${pi + 1}/${pages.length})` : ""),
      `対応の時系列（${d.meta.timeline_range_ja || "発災以降"}）` + (pages.length > 1 ? `（${pi + 1}/${pages.length}）` : ""));
    s.addText("Government / agency actions from onset — all official sources. 地震発生からの政府・機関の主要な動き（すべて公的情報）。",
      { x: 0.4, y: 1.0, w: 12.5, h: 0.3, fontSize: 11, color: MUTED, italic: true, fontFace: FONT, valign: "top" });
    const TL_COLW = BI ? [1.5, 9.0, 2.0] : [1.15, 9.7, 1.65];
    const tlRows = [[tableHeaderCell("Time / 時刻"), tableHeaderCell("Action / 事項"), tableHeaderCell("Source / 出典")]];
    rows.forEach((r, i) => tlRows.push([
      { text: jaDate(r.time), options: { fontSize: 11, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
      { text: r.en + "\n" + r.ja, options: { fontSize: 10, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: jaSrc(r.src), options: { fontSize: 9.5, bold: true, color: tierColor(r.tier), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]));
    s.addTable(tlRows, { x: 0.4, y: 1.30, w: 12.5, colW: TL_COLW, border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: TL_ROWH, valign: "middle" });
    srcLine(s, [{ label: "Kantei (PM Office)", url: "https://www.kantei.go.jp/jp/105/actions/202607/28hijoukaigi.html" }, { label: "MOD / JSDF", url: "https://www.mod.go.jp/j/press/kisha/2026/0728c_r.html" }, linkBy("JMA - Earthquake")]);
    footer(s);
  });
}

/* ============ Slide 4: Affected Municipalities & Population ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Affected Municipalities & Population", "被災市町村と人口");
// --- map with numbered markers at each municipality's city hall (fixed 4:3 box, no letterbox
//     so the overlay maths line up with the fetched Static Maps image) ---
{
  const mx = 0.4, my = 1.3, mw = 6.4, mh = 4.8; // 4:3, matches Static Maps 640x480
  const img = resolveImg("google_cities");
  if (img) {
    s.addShape(p.ShapeType.rect, { x: mx, y: my, w: mw, h: mh, fill: { color: "EEEEEE" }, line: { color: LINE, width: 0.75 } });
    s.addImage({ path: img, x: mx, y: my, w: mw, h: mh });
  } else {
    s.addShape(p.ShapeType.roundRect, { x: mx, y: my, w: mw, h: mh, fill: { color: LIGHT }, line: { color: NAVY2, width: 1, dashType: "dash" }, rectRadius: 0.05 });
    s.addText(LX("公開前に地図画像を挿入 / Insert map before release\n（GOOGLE_MAPS_API_KEY 設定で番号付き地図を自動生成）",
      "Insert map before release", "公開前に地図画像を挿入"), { x: mx, y: my, w: mw, h: mh, align: "center", valign: "middle", color: MUTED, italic: true, fontSize: 12, fontFace: FONT });
  }
  // epicentre star + numbered municipality circles
  const epi = latlonToFrac(d.event.lat, d.event.lon, CITY_MAP.cLat, CITY_MAP.cLon, CITY_MAP.zoom);
  if (epi.fx > 0.02 && epi.fx < 0.98 && epi.fy > 0.02 && epi.fy < 0.98)
    s.addText("★", { x: mx + epi.fx * mw - 0.16, y: my + epi.fy * mh - 0.16, w: 0.32, h: 0.32, align: "center", valign: "middle", color: RED, fontSize: 15, bold: true, fontFace: FONT, margin: 0 });
  d.cities.forEach((c, i) => {
    if (!(c.lat && c.lon)) return;
    const f = latlonToFrac(c.lat, c.lon, CITY_MAP.cLat, CITY_MAP.cLon, CITY_MAP.zoom);
    if (!(f.fx > 0.02 && f.fx < 0.98 && f.fy > 0.02 && f.fy < 0.98)) return;
    const cx = mx + f.fx * mw, cy = my + f.fy * mh, r = 0.14;
    s.addShape(p.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: NAVY }, line: { color: "FFFFFF", width: 1.25 } });
    s.addText(String(i + 1), { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, align: "center", valign: "middle", color: "FFFFFF", bold: true, fontSize: 12, fontFace: FONT, margin: 0 });
  });
  s.addText(LX("● 番号は右の表に対応 / numbers keyed to the table on the right   ★ 震源 epicentre",
    "● numbers keyed to the table on the right   ★ epicentre", "● 番号は右の表に対応   ★ 震源"), { x: mx, y: my + mh + 0.02, w: mw, h: 0.22, align: "left", color: MUTED, fontSize: 10, fontFace: FONT, margin: 0 });
}
{
  const fitC = fitRows(d.cities.length, 4.7, { maxRowH: 0.55, minRowH: 0.36, baseFont: 11, minFont: 8 });
  const cityRows = [[tableHeaderCell("#"), tableHeaderCell("City / 市町村"), tableHeaderCell("Pop. / 人口"), tableHeaderCell("Note / 備考")]];
  d.cities.slice(0, fitC.shownBody).forEach((c, i) => cityRows.push([
    { text: String(i + 1), options: { fontSize: fitC.fontSize, bold: true, color: WHITE, fill: { color: NAVY }, align: "center", valign: "middle", margin: 2 } },
    { text: `${c.name_en} / ${c.name_ja}`, options: { fontSize: fitC.fontSize, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    { text: LX(c.pop, String(c.pop).replace("約", "approx. "), c.pop), options: { fontSize: fitC.fontSize, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 4 } },
    { text: `${c.note_en} / ${c.note_ja}`, options: { fontSize: Math.max(8, fitC.fontSize - 0.5), color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
  ]));
  if (fitC.cap) cityRows.push([{ text: `+${fitC.cap} more / 他${fitC.cap}市町村（データ参照）`, options: { fontSize: 11, italic: true, color: MUTED, colspan: 4, fill: { color: WHITE }, align: "left", valign: "middle", margin: 4 } }]);
  s.addTable(cityRows, { x: 7.1, y: 1.35, w: 5.8, colW: [0.4, 2.4, 1.3, 1.7], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: fitC.rowH });
}
srcLine(s, [{ label: "Population: e-Stat / 総務省統計局", url: "https://www.e-stat.go.jp/" }, { label: "Google Maps", url: `https://www.google.com/maps/@32.655,130.707,10z` }]);
footer(s);

/* ============ Slide 5: Epicentre & Seismic Intensity ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Epicentre & Seismic Intensity", "震源・震度");
imageSlot(s, 0.4, 1.2, 7.4, 5.5, "intensity_map", "JMA seismic intensity map", "気象庁 震度分布図", "https://www.jma.go.jp/bosai/map.html#9/32.748/130.328/&elem=int&contents=earthquake_map");
{
  const prm = [
    ["Origin time / 発生時刻", d.event.origin_time],
    ["Epicentre / 震源地", LX(`${d.event.epicentre_ja} (${d.event.lat}N, ${d.event.lon}E)`,
      `${d.event.epicentre_en} (${d.event.lat}N, ${d.event.lon}E)`, `${d.event.epicentre_ja}（北緯${d.event.lat}度・東経${d.event.lon}度）`)],
    ["Magnitude / 規模", d.event.magnitude + "   (USGS " + (d.event.mag_usgs || "").split(" ")[0] + ")"],
    ["Depth / 深さ", LX(`${d.event.depth_km} km (prelim.; ~10 km)`, `${d.event.depth_km} km (prelim.; ~10 km)`, `${d.event.depth_km} km（暫定・速報約10km）`)],
    ["Max. intensity / 最大震度", d.event.max_intensity],
    ["Mechanism / 発震機構", LX("Strike-slip, ENE-WSW / 横ずれ", "Strike-slip, ENE-WSW", "横ずれ断層型（東北東－西南西）")],
    ["Felt / 有感範囲", LX("Hokuriku-Kyushu, 6+ to 1 / 北陸〜九州", "Hokuriku-Kyushu, 6+ to 1", "北陸〜九州で震度6強〜1")],
    ["GLIDE", d.meta.glide],
    ["Source / 出典", LX("JMA (3rd report)", "JMA (3rd report)", "気象庁（第3報）")],
  ];
  s.addTable([[tableHeaderCell("Item / 項目"), tableHeaderCell("Value / 値")]].concat(
    prm.map((r, i) => [
      { text: r[0], options: { fontSize: 12.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: r[1], options: { fontSize: 12.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    ])
  ), { x: 8.05, y: 1.35, w: 4.85, colW: [2.25, 2.6], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.54, valign: "middle" });
}
srcLine(s, [linkBy("intensity map"), linkBy("USGS")]);
footer(s);

/* ============ Slide 6: Seismicity - Epicentre Distribution & Aftershocks ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Seismicity - Epicentre Distribution & Aftershocks", "地震活動 - 震央分布・余震");
imageSlot(s, 0.4, 1.2, 6.4, 5.35, "epicentre_distribution", "JMA hypocentre distribution (24h)", "気象庁 震央分布図（24時間）", "https://www.jma.go.jp/bosai/map.html#9/32.539/130.66/&contents=hypo");
{
  const st = d.aftershock_stats;
  if (st && st.hourly && st.hourly.length) {
    s.addChart(p.ChartType.bar, [{ name: TT("Count", "回数"), labels: st.hourly.map(x => x.h), values: st.hourly.map(x => x.n) }], {
      x: 7.0, y: 1.2, w: 5.9, h: 2.75, barDir: "col", showTitle: true,
      title: LX(`JMA: intensity 1+ per hour (total ${st.total})  余震回数`, `JMA: intensity 1+ per hour (total ${st.total})`, `気象庁 震度1以上 時間別回数（合計${st.total}回）`), titleFontSize: 10.5, titleColor: NAVY,
      chartColors: [NAVY2], showLegend: false, showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 8,
      catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
      valGridLine: { color: LINE, size: 0.5 }, catGridLine: { style: "none" },
    });
    s.addText([
      { text: LX(st.note_ja, st.note_en, st.note_ja), options: { fontSize: 10.5, color: "444444" } },
    ], { x: 7.0, y: 4.0, w: 5.9, h: 0.72, align: "left", valign: "top", fontFace: FONT, margin: 2 });
    // USGS notable aftershocks (complements JMA)
    const ua = d.aftershocks_usgs || [];
    if (ua.length) {
      const uRows = [[tableHeaderCell("USGS notable aftershocks / 主な余震"), tableHeaderCell("Time / 時刻")]];
      ua.forEach((r, i) => uRows.push([
        { text: `${r.mag}  ${r.place}`, options: { fontSize: 10.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 3 } },
        { text: jaDate(r.time), options: { fontSize: 10.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
      ]));
      s.addTable(uRows, { x: 7.0, y: 4.78, w: 5.9, colW: [4.5, 1.4], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.26 });
    }
  } else if (resolveImg("seismicity_timeseries")) {
    imageSlot(s, 7.0, 1.2, 5.9, 5.35, "seismicity_timeseries", "Aftershock time-series", "余震の時系列");
  } else {
    s.addShape(p.ShapeType.roundRect, { x: 7.0, y: 1.2, w: 5.9, h: 5.35, fill: { color: LIGHT }, line: { color: NAVY2, width: 1, dashType: "dash" }, rectRadius: 0.06 });
    s.addText([
      { text: "Aftershock counts populate once JMA data accumulates.\n", options: { bold: true, fontSize: 13, color: NAVY } },
      { text: "気象庁の余震回数データが蓄積次第、掲載します。", options: { fontSize: 12.5, color: NAVY2 } },
    ], { x: 7.2, y: 1.2, w: 5.5, h: 5.35, align: "center", valign: "middle", fontFace: FONT });
  }
}
srcLine(s, [{ label: "JMA hypocentre map / 気象庁 震央分布図", url: "https://www.jma.go.jp/bosai/map.html#9/32.539/130.66/&contents=hypo" }, { label: "JMA aftershock counts / 地震回数", url: "https://www.data.jma.go.jp/eqev/data/2026_07_28_kumamoto/kumamoto_jishinkaisu.pdf" }, linkBy("USGS")]);
footer(s);

/* ============ Slide 6c: Aftershock Statistics (JMA counts) ============ */
if (d.aftershock_stats && d.aftershock_stats.by_intensity_7h) {
  const a = d.aftershock_stats;
  const ORDER = [["7","7"],["6+","6-upper / 6強"],["6-","6-lower / 6弱"],["5+","5-upper / 5強"],["5-","5-lower / 5弱"],["4","4"],["3","3"],["2","2"],["1","1"]];
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Aftershock Statistics - JMA earthquake counts", "余震の発生状況 — 気象庁 地震回数資料");
  s.addText("Counts of earthquakes with JMA intensity 1 or greater. Provisional - subject to revision. 震度1以上を観測した地震の回数。速報値であり後日変更の可能性がある。",
    { x: 0.4, y: 1.02, w: 12.5, h: 0.3, fontSize: 11, color: MUTED, italic: true, fontFace: FONT, valign: "top" });

  // 震度別回数テーブル（2期間）
  const rows = [[tableHeaderCell("Max. intensity / 最大震度"), tableHeaderCell(LX("First 7 h\n28 Jul 16-23", "First 7 h\n28 Jul 16-23", "最初の7時間\n7/28 16〜23時")), tableHeaderCell(LX("Cumulative\n", "Cumulative\n", "累計\n") + (a.cum_period || ""))]];
  ORDER.forEach((o, i) => {
    const v7 = a.by_intensity_7h[o[0]] || 0, vc = a.by_intensity_cum[o[0]] || 0;
    rows.push([
      { text: o[1], options: { fontSize: 11.5, bold: true, color: (o[0] === "7" ? RED : NAVY), fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: String(v7), options: { fontSize: 11.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
      { text: String(vc), options: { fontSize: 11.5, bold: true, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]);
  });
  rows.push([
    { text: "Total / 合計", options: { fontSize: 12, bold: true, color: WHITE, fill: { color: NAVY }, align: "left", valign: "middle", margin: 4 } },
    { text: String(a.total_7h || 0), options: { fontSize: 12, bold: true, color: WHITE, fill: { color: NAVY }, align: "center", valign: "middle", margin: 3 } },
    { text: String(a.total_cum || 0), options: { fontSize: 12, bold: true, color: WHITE, fill: { color: NAVY }, align: "center", valign: "middle", margin: 3 } },
  ]);
  s.addTable(rows, { x: 0.4, y: 1.45, w: 5.9, colW: [2.7, 1.6, 1.6], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.355, valign: "middle" });

  // 時間別グラフ
  if (a.hourly && a.hourly.length) {
    s.addChart(p.ChartType.bar, [{ name: TT("Count", "回数"), labels: a.hourly.map(x => x.h), values: a.hourly.map(x => x.n) }], {
      x: 6.6, y: 1.45, w: 6.3, h: 2.5, barDir: "col", chartColors: ["1F3864"], showLegend: false, showValue: true,
      title: LX("Hourly counts, 28 Jul 16:00-23:00 (total " + (a.total_7h || 0) + ")  時間別回数", "Hourly counts, 28 Jul 16:00-23:00 (total " + (a.total_7h || 0) + ")", "7月28日16〜23時の時間別回数（合計" + (a.total_7h || 0) + "回）"), titleFontSize: 10.5, titleColor: NAVY,
      catAxisLabelFontSize: 9.5, valAxisLabelFontSize: 9.5, dataLabelFontSize: 9,
    });
  }

  // 主な有感地震
  const nRows = [[tableHeaderCell("Time / 発生時刻"), tableHeaderCell("Int. / 震度"), tableHeaderCell("Area / 観測地域")]];
  (a.notable || []).forEach((n, i) => nRows.push([
    { text: jaDate(n.t), options: { fontSize: 11, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    { text: n.i, options: { fontSize: 11, bold: true, color: (n.i === "7" ? RED : ORANGE), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    { text: n.p, options: { fontSize: 10.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
  ]));
  s.addTable(nRows, { x: 6.6, y: 4.20, w: 6.3, colW: [1.9, 0.9, 3.5], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.36, valign: "middle" });

  s.addText([
    { text: "Largest aftershock M6.1 (28 Jul 17:08); active zone about 50 km NE-SW.\n", options: { fontSize: 11, color: INK } },
    { text: "最大余震は7月28日17時08分のM6.1。地震活動域は北東－南西に約50km。", options: { fontSize: 10.5, color: "444444" } },
  ], { x: 0.4, y: 5.95, w: 5.9, h: 0.72, align: "left", valign: "top", fontFace: FONT, margin: 4 });

  srcLine(s, [
    { label: "JMA earthquake counts / 気象庁 地震回数資料", url: "https://www.data.jma.go.jp/eqev/data/2026_07_28_kumamoto/kumamoto_jishinkaisu.pdf" },
    { label: "HERP evaluation - 12 Aug / 地震調査委員会 評価（8月12日）", url: "https://www.static.jishin.go.jp/resource/monthly/2026/20260728_kumamoto_2.pdf" },
  ]);
  footer(s);
}

/* ============ Slide 6b: Source Mechanism & Waveform Analysis ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Source Mechanism & Waveform Analysis", "発震機構・波形解析");
biBulletsTier(s, 0.4, 1.2, 6.7, 1.95, [
  { tier: "official", en: "Magnitude M7.1 (JMA) / M6.8 (USGS); depth about 16 km (preliminary ~10 km).", ja: "規模 M7.1（気象庁）／M6.8（USGS）、深さ約16km（暫定・速報約10km）。" },
  { tier: "official", en: "Focal mechanism: strike-slip faulting, compression axis ENE–WSW (JMA preliminary).", ja: "発震機構：横ずれ断層型、圧力軸ENE–WSW（気象庁 暫定）。" },
  { tier: "official", en: "Source fault assessed as (near-)confirmed on the Hinagu fault — a different segment from the 2016 Kumamoto earthquake (Futagawa segment). See following page.", ja: "震源断層は日奈久断層でほぼ確定との評価 — 2016年熊本地震（布田川区間）とは別区間。次頁参照。" },
]);
// Figure slot (enlarged): focal-mechanism / moment-tensor diagram (beachball) or strong-motion figure.
// Auto-picked from images/mechanism.png (or a hand-saved images/mechanism_manual.png).
imageSlot(s, 0.4, 3.30, 6.7, 2.75, "mechanism", "Focal mechanism / moment tensor (beachball)", "発震機構・モーメントテンソル図", "https://www.fnet.bosai.go.jp/");
s.addShape(p.ShapeType.roundRect, { x: 7.1, y: 1.25, w: 5.8, h: 4.55, fill: { color: LIGHT }, line: { color: NAVY2, width: 1 }, rectRadius: 0.06 });
s.addText([
  { text: "Waveform-based analysis resources / 波形解析の情報源\n\n", options: { bold: true, fontSize: 13, color: NAVY } },
  { text: "• NIED K-NET / KiK-net — strong-motion records (PGA, acceleration waveforms)\n  防災科研 K-NET/KiK-net — 強震記録（最大加速度・波形）\n\n", options: { fontSize: 12, color: INK } },
  { text: "• NIED F-net — broadband moment-tensor solution\n  防災科研 F-net — 広帯域モーメントテンソル解\n\n", options: { fontSize: 12, color: INK } },
  { text: "• NIED Hi-net — high-sensitivity network (micro-seismicity)\n  防災科研 Hi-net — 高感度地震観測網\n\n", options: { fontSize: 12, color: INK } },
  { text: "• JMA — moment tensor / focal mechanism (CMT)\n  気象庁 — モーメントテンソル・発震機構（CMT）\n\n", options: { fontSize: 12, color: INK } },
  { text: "• USGS — moment tensor & finite-fault model (event page)\n  USGS — モーメントテンソル・有限断層モデル", options: { fontSize: 12, color: INK } },
], { x: 7.3, y: 1.45, w: 5.5, h: 4.2, align: "left", valign: "top", fontFace: FONT, margin: 4 });
srcLine(s, [
  { label: "NIED K-NET/KiK-net (strong motion)", url: "https://www.kyoshin.bosai.go.jp/" },
  { label: "NIED F-net (moment tensor)", url: "https://www.fnet.bosai.go.jp/" },
  { label: "JMA mechanism / CMT", url: "https://www.data.jma.go.jp/eqev/data/mech/" },
]);
footer(s);

/* ============ Slide 6c: Source Fault - Futagawa-Hinagu Fault Zone ============ */
if (d.fault && (d.fault.rows || []).length) {
  const fz_en = "Source Fault: " + (d.fault.zone_en || "Futagawa-Hinagu Fault Zone");
  const fz_ja = "震源断層：" + (d.fault.zone_ja || "布田川・日奈久断層帯");
  const fSrc = [
    { label: "HERP - Futagawa/Hinagu fault zone / 地震調査研究推進本部", url: "https://www.jishin.go.jp/regional_seismicity/rs_katsudanso/f093_futagawa_hinagu/" },
    { label: "J-SHIS (NIED)", url: "https://www.j-shis.bosai.go.jp/" },
  ];

  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, fz_en + " (1/2)", fz_ja + "（1/2）");
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 1.02, w: 12.5, h: 1.30, fill: { color: "262626" }, line: { color: "262626", width: 1 }, rectRadius: 0.04 });
  s.addText([
    { text: (d.fault.note_en || "") + "\n", options: { fontSize: 11, bold: true, color: "FFFFFF" } },
    { text: d.fault.note_ja || "", options: { fontSize: 10.5, color: "E6E6E6" } },
  ], { x: 0.6, y: 1.07, w: 12.1, h: 1.20, align: "left", valign: "middle", fontFace: FONT, margin: 2 });
  imageSlot(s, 0.4, 2.48, 6.2, 4.05, "fault_map", "Active-fault trace map (HERP)", "活断層図（地震調査研究推進本部）", "https://www.jishin.go.jp/regional_seismicity/rs_katsudanso/f093_futagawa_hinagu/");
  imageSlot(s, 6.9, 2.48, 6.0, 4.05, "jshis", "J-SHIS long-term evaluation (Hinagu seg.)", "J-SHIS 長期評価（日奈久区間）", "https://www.j-shis.bosai.go.jp/");
  srcLine(s, fSrc);
  footer(s);

  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, fz_en + " (2/2)", fz_ja + "（2/2）");
  s.addText("Segment-by-segment long-term evaluation; the 2026 rupture is marked. 区間別の長期評価。2026年に活動した区間を明示。",
    { x: 0.4, y: 1.02, w: 12.5, h: 0.3, fontSize: 11, color: MUTED, italic: true, fontFace: FONT, valign: "top" });
  const fRows = [[tableHeaderCell("Segment / 区間"), tableHeaderCell("Length / 長さ"), tableHeaderCell("Mag. / 想定M"), tableHeaderCell("Note / 備考")]];
  d.fault.rows.forEach((r, i) => fRows.push([
    { text: `${r.seg_en} / ${r.seg_ja}`, options: { fontSize: 11, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    { text: r.len, options: { fontSize: 11, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    { text: r.mag, options: { fontSize: 11, bold: true, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    { text: `${r.note_en} / ${r.note_ja}`, options: { fontSize: 10.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
  ]));
  s.addTable(fRows, { x: 0.4, y: 1.42, w: 12.5, colW: [3.4, 1.9, 1.7, 5.5], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.54, valign: "middle" });
  if (d.fault.irides) {
    const ir = d.fault.irides;
    const irH = BI ? 1.15 : Math.max(0.55, noteBoxH(12.1, [
      [(ir.title_en || "") + " / " + (ir.title_ja || ""), 10],
      [ENO ? (ir.en || "") : (ir.ja || ""), ENO ? 9 : 8.5],
    ]));
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 5.50, w: 12.5, h: irH, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
    s.addText([
      { text: (ir.title_en || "") + " / " + (ir.title_ja || "") + "\n", options: { bold: true, fontSize: 10, color: "9A3B12" } },
      { text: (ir.en || "") + "\n", options: { fontSize: 9, color: "7A2E0E" } },
      { text: ir.ja || "", options: { fontSize: 8.5, color: "7A2E0E" } },
    ], { x: 0.6, y: 5.55, w: 12.1, h: irH - 0.10, align: "left", valign: "top", fontFace: FONT, margin: 3 });
  }
  srcLine(s, d.fault.irides ? fSrc.concat([{ label: "IRIDeS briefing (31 Jul)", url: "https://irides.tohoku.ac.jp/event/event_jn/detail---id-6343.html" }]) : fSrc);
  footer(s);
}

/* ============ Slide 7: Tsunami & Intensity Distribution ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Tsunami & Intensity Distribution", "津波と震度分布");
{
  const tsL2 = LX("x", "x", "x");
  const tsH = BI ? 1.8 : Math.max(0.85, noteBoxH(11.9, [
    [TT("Tsunami Advisory", "津波注意報", " / "), 15],
    [LX(`Areas / 対象海域: ${d.tsunami.areas_en} (${d.tsunami.areas_ja})   |   Expected / 予想: ${d.tsunami.height}   |   Issued / 発表: ${d.tsunami.issued}`,
      `Areas: ${d.tsunami.areas_en}   |   Expected: ${d.tsunami.height}   |   Issued: ${d.tsunami.issued}`,
      `対象海域: ${d.tsunami.areas_ja}   |   予想: ${d.tsunami.height}   |   発表: ${jaDate(d.tsunami.issued)}`), 13],
    [TT(d.tsunami.status_en, d.tsunami.status_ja, "  "), 13],
  ]) + 0.12);
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 1.15, w: 12.5, h: tsH, fill: { color: LIGHT }, line: { color: NAVY2, width: 1 }, rectRadius: 0.06 });
}
s.addText([
  { text: TT("Tsunami Advisory", "津波注意報", " / ") + "\n", options: { bold: true, fontSize: 15, color: NAVY } },
  { text: LX(`Areas / 対象海域: ${d.tsunami.areas_en} (${d.tsunami.areas_ja})   |   Expected / 予想: ${d.tsunami.height}   |   Issued / 発表: ${d.tsunami.issued}`,
    `Areas: ${d.tsunami.areas_en}   |   Expected: ${d.tsunami.height}   |   Issued: ${d.tsunami.issued}`,
    `対象海域: ${d.tsunami.areas_ja}   |   予想: ${d.tsunami.height}   |   発表: ${jaDate(d.tsunami.issued)}`) + "\n", options: { fontSize: 13, color: INK } },
  { text: TT(d.tsunami.status_en, d.tsunami.status_ja, "  "), options: { fontSize: 13, color: RED, bold: true } },
], { x: 0.7, y: 1.3, w: 11.9, h: 1.5, align: "left", valign: "top", fontFace: FONT });
{
  const icol = { "7": RED, "6+": "E60000", "6-": ORANGE };
  const ilabel = { "7": "7", "6+": "6-upper / 6強", "6-": "6-lower / 6弱" };
  const itRows = [[tableHeaderCell("Intensity / 震度"), tableHeaderCell("Municipalities / 市町村")]];
  const itH = [0.42];
  ["7", "6+", "6-"].forEach(k => {
    if (!d.intensity[k] || !d.intensity[k].length) return;
    chunk(d.intensity[k], 6).forEach((g, gi) => {
      const txt = g.map(x => (BI ? x : pickText(x))).join("  ・  ");
      itRows.push([
        { text: gi === 0 ? ilabel[k] : "", options: { fontSize: 13, bold: true, color: WHITE, fill: { color: icol[k] }, align: "center", valign: "middle", margin: 4 } },
        { text: txt, options: { fontSize: fitSize([txt], { base: 11, min: 8.5, upl: 96, maxLines: 2 }), color: INK, fill: { color: WHITE }, align: "left", valign: "middle", margin: 5 } },
      ]);
      itH.push(0.55);
    });
  });
  s.addTable(itRows, Object.assign({ x: 0.4, y: 3.25, w: 12.5, colW: [2.3, 10.2], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: itH }, autoPaged({ autoPageSlideStartY: 0.6 })));
}
srcLine(s, [linkBy("intensity map"), linkBy("JMA - Earthquake")]);
footer(s);

/* ============ Slide 8: Damage Situation (paginated: 6 rows/page) ============ */
{
  // Adaptive pagination: pack rows by estimated rendered height so the table never
  // reaches the "Sources" line (y=6.86). Long rows simply get fewer per page.
  // Budget = table top (1.40) -> source line (6.86), minus the header row.
  // The one-language numbers below are calibrated against the LibreOffice
  // rendering (measured at 95 dpi): a 12 pt line occupies ~0.206 in and the
  // 4 pt cell margins add ~0.13 in per row.  The previous estimate looked only
  // at the value column with an over-generous 88/42 chars-per-line and ignored
  // the header row, which is why the last row of page 1 ran off the slide.
  const DMG_BUDGET = BI ? 4.95 : (6.80 - 1.40 - 0.34);
  const DMG_ROWH = BI ? 0.40 : 0.32;
  const dmgRowH = (r) => {
    if (BI) {
      // value column is 6.9in wide at 12pt; also allow for a tall source cell
      const lines = Math.max(estLinesBi(r.value, 88, 42), estLinesBi(jaSrc(r.source), 24, 12));
      return Math.max(DMG_ROWH, lines * 0.215 + 0.14);
    }
    return estRowH([
      [r.value, 6.9, 12, 4],                          // "Figure" column
      [jaSrc(r.source), 1.8, 11.5, 4],                // "Source" column
      [`${r.item_en} / ${r.item_ja}`, 2.4, 12.5, 4],  // "Item" column
    ], DMG_ROWH);
  };
  const dmgPages = [];
  { let cur = [], h = 0;
    d.damage.forEach((r) => {
      const rh = dmgRowH(r);
      if (cur.length && h + rh > DMG_BUDGET) { dmgPages.push(cur); cur = []; h = 0; }
      cur.push(r); h += rh;
    });
    if (cur.length) dmgPages.push(cur);
    if (!BI) balanceTail(dmgPages, dmgRowH, DMG_BUDGET);
  }
  dmgPages.forEach((grp, pi) => {
    const suffix = dmgPages.length > 1 ? ` (${pi + 1}/${dmgPages.length})` : "";
    const suffixJa = dmgPages.length > 1 ? `（${pi + 1}/${dmgPages.length}）` : "";
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, "Damage Situation" + suffix, "被害状況" + suffixJa);
    s.addText("Figures from FDMA / NPA / Kumamoto Pref.; source tier shown per row. 消防庁・警察庁・熊本県等の集計に基づき各回更新（各行に出典ティアを表示）。",
      { x: 0.4, y: 1.02, w: 12.5, h: 0.32, fontSize: 12, color: MUTED, italic: true, fontFace: FONT, valign: "top" });
    const dmgRows = [[tableHeaderCell("Item / 項目"), tableHeaderCell("Figure / 数値"), tableHeaderCell("Source / 出典"), tableHeaderCell(LX("Tier", "Tier", "出典区分"))]];
    grp.forEach((r, i) => dmgRows.push([
      { text: `${r.item_en} / ${r.item_ja}`, options: { fontSize: 12.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: r.value, options: { fontSize: 12, italic: r.value === "TBC", color: r.value === "TBC" ? MUTED : INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: jaSrc(r.source), options: { fontSize: 11.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: tierLabel(r.tier), options: { fontSize: 11.5, bold: true, color: tierColor(r.tier), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]));
    s.addTable(dmgRows, { x: 0.4, y: 1.40, w: 12.5, colW: [2.4, 6.9, 1.8, 1.4], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: DMG_ROWH, valign: "middle" });
    srcLine(s, [linkBy("FDMA"), linkBy("NPA"), linkBy("MLIT")]);
    footer(s);
  });
}

/* ============ Slide 8b: Notable Damage - Structures & Facilities ============ */
{
  const hs = (d.damage_highlights || []).filter(h => (h.cat || "structure") === "structure");
  if (hs.length) {
    // Packed by height: the narrow left column overflows fast, so add pages instead of shrinking.
    const hsPages = packBullets(hs, 24, 64, 31);
    hsPages.forEach((grp, pi) => {
      const sfx = hsPages.length > 1 ? ` (${pi + 1}/${hsPages.length})` : "";
      const sfxJa = hsPages.length > 1 ? `（${pi + 1}/${hsPages.length}）` : "";
      s = p.addSlide(); s.background = { color: WHITE };
      heading(s, "Notable Damage - Structures & Facilities" + sfx, "主な被害① 建物・構造物・施設（映像・報道）" + sfxJa);
      biBulletsTier(s, 0.4, 1.2, 7.2, 5.4, grp);
      if (pi === 0) {
        imageSlot(s, 7.8, 1.15, 5.1, 3.6, "nhk_yatsushiro", "Aerial footage - Yatsushiro paper-mill chimney (NHK)", "上空映像 - 八代 製紙工場の煙突（NHK）", "https://www3.nhk.or.jp/news/");
        imageSlot(s, 7.8, 4.85, 5.1, 1.75, "kumamoto_castle", "Kumamoto Castle - stone-wall collapse (NHK, ©NHK/X)", "熊本城 石垣崩落（NHK・©NHK/X）", "https://www3.nhk.or.jp/news/");
      }
      srcLine(s, [linkBy("NHK"), linkBy("KSB"), linkBy("Nikkei"), linkBy("Nishinippon")]);
      footer(s);
    });
  }
}

/* ============ Slide 8c: Ground Effects, Slope Failure & Fire ============ */
{
  const hg = (d.damage_highlights || []).filter(h => (h.cat || "structure") === "ground");
  if (hg.length) {
    const hgPages = packBullets(hg, 24, 68, 33);
    hgPages.forEach((grp, pi) => {
      const sfx = hgPages.length > 1 ? ` (${pi + 1}/${hgPages.length})` : "";
      const sfxJa = hgPages.length > 1 ? `（${pi + 1}/${hgPages.length}）` : "";
      s = p.addSlide(); s.background = { color: WHITE };
      heading(s, "Ground Effects, Slope Failure & Fire" + sfx, "主な被害② 地盤変状・斜面崩壊・火災（映像・報道）" + sfxJa);
      biBulletsTier(s, 0.4, 1.2, 7.6, 5.4, grp);
      if (pi === 0) imageSlot(s, 8.2, 1.2, 4.7, 5.4, "mayuyama", "Mayuyama slope failure / landslide (Shimabara)", "眉山の斜面崩壊・地すべり（島原）", "https://www.gsi.go.jp/BOUSAI/index.html");
      srcLine(s, [linkBy("NBC"), linkBy("KTN"), linkBy("NHK"), linkBy("GSI")]);
      footer(s);
    });
  }
}

/* Shared: adaptive pagination of the AEON "duty of care" bullets.
   Slide 8d needs the page count for its "(1/N)" label, and slide 8e needs the
   actual pages, so both must use exactly the same packing rule. */
function aeonReH(r) { return estBi2(r.en, r.ja, 92, 44) * 0.225 + 0.18; }
const AEON_OPT = { base: 12.5, min: 11 };
/* Height of the orange "Lesson for DRR" box - content-sized in one language. */
function aeonLessonH(af) {
  if (BI) return 2.20;
  return Math.max(0.80, noteBoxH(12.06, [
    ["Lesson for DRR / 防災上の教訓", 11],
    [ENO ? (af.lesson_en || "") : (af.lesson_ja || ""), ENO ? 9.5 : 9],
  ]));
}
function aeonReentryPages(af) {
  if (!BI) {
    // one language = half the text: the bullets and the lesson box share a page
    const h = Math.max(1.60, 5.40 - aeonLessonH(af) - 0.20);
    return packBulletsTier(af.reentry || [], 12.5, h, AEON_OPT);
  }
  const reH = aeonReH;
  const pages = [];
  let cur = [], h = 0;
  (af.reentry || []).forEach((r) => {
    const rh = reH(r);
    if (cur.length && h + rh > 5.20) { pages.push(cur); cur = []; h = 0; }
    cur.push(r); h += rh;
  });
  if (cur.length) pages.push(cur);
  return pages;
}

/* ============ Slide 8d: Focus - AEON Mall Kumamoto (1/2) sequence & casualties ============ */
{
  const af = d.aeon_focus || {};
  const afTotal = aeonReentryPages(af).length + 1;
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, `Focus: AEON Mall Kumamoto (1/${afTotal}) - Sequence`, `焦点：イオンモール熊本（1/${afTotal}）経過と人的被害`);
  s.addText([
    { text: (af.outcome_en || "") + "\n", options: { fontSize: 11.5, color: INK } },
    { text: af.outcome_ja || "", options: { fontSize: 10.5, color: "444444" } },
  ], { x: 0.4, y: 1.02, w: 12.5, h: 0.78, align: "left", valign: "top", fontFace: FONT, margin: 3 });
  {
    const rows = [[tableHeaderCell("Time / 時刻"), tableHeaderCell("Event / 経過"), tableHeaderCell(LX("Tier", "Tier", "出典区分"))]];
    (af.sequence || []).forEach((r, i) => rows.push([
      { text: r[0], options: { fontSize: 11.5, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
      { text: LX(`${r[1]}\n${r[2]}`, r[1], r[2]), options: { fontSize: 10.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: tierLabel(r[3]), options: { fontSize: 10, bold: true, color: tierColor(r[3]), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]));
    s.addTable(rows, { x: 0.4, y: 1.92, w: 6.4, colW: [1.0, 4.1, 1.3], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.40, valign: "middle" });
  }
  imageSlot(s, 7.0, 1.92, 5.9, 3.6, "aeon", "AEON Mall Kumamoto - aerial (NHK)", "イオンモール熊本 上空映像（NHK）", "https://www3.nhk.or.jp/news/");
  const mallH = BI ? 1.18 : Math.max(0.55, noteBoxH(5.54, [
    ["Did this mall exist in 2016? / この施設は2016年にも存在した？", 10],
    [ENO ? "Yes - opened 2005; damaged in 2016 (walls/interior), closed 15 Apr 2016 and fully recovered only in Jul 2018. No explosion occurred there in 2016."
         : "はい。2005年開業で2016年も被災（外壁・内装）。4/15休業、完全復旧は2018年7月。2016年に爆発はなく別事象。", ENO ? 9 : 8.5],
  ]));
  const mallY = BI ? 5.62 : (6.80 - mallH);
  s.addShape(p.ShapeType.roundRect, { x: 7.0, y: mallY, w: 5.9, h: mallH, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
  s.addText([
    { text: "Did this mall exist in 2016? / この施設は2016年にも存在した？\n", options: { bold: true, fontSize: 10, color: "9A3B12" } },
    { text: "Yes - opened 2005; damaged in 2016 (walls/interior), closed 15 Apr 2016 and fully recovered only in Jul 2018. No explosion occurred there in 2016.\n", options: { fontSize: 9, color: "7A2E0E" } },
    { text: "はい。2005年開業で2016年も被災（外壁・内装）。4/15休業、完全復旧は2018年7月。2016年に爆発はなく別事象。", options: { fontSize: 8.5, color: "7A2E0E" } },
  ], { x: 7.18, y: mallY + 0.10, w: 5.54, h: mallH - 0.20, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  srcLine(s, [{ label: "AEON Co. - statement on the explosion (30 Jul)", url: "https://www.aeon.info/" }, { label: "NHK / RKK / KAB / mass media", url: "https://news.web.nhk/newsweb/" }]);
  footer(s);
}

/* ============ Slide 8e: Focus - AEON Mall Kumamoto - duty of care (paginated) ============ */
{
  const af = d.aeon_focus || {};
  // Adaptive packing: these bullets vary a lot in length, and LibreOffice does not
  // auto-shrink, so a fixed 2-per-page overflowed the "Sources" line.
  const rePages = aeonReentryPages(af);
  const reH = aeonReH;
  // if the final group is too tall to share a page with the lesson box, give the box its own page
  const lastH = (BI && rePages.length) ? rePages[rePages.length - 1].reduce((a, r) => a + reH(r), 0) : 0;
  if (lastH > 2.85) rePages.push([]);
  const total = rePages.length + 1;
  rePages.forEach((grp, pi) => {
    const last = pi === rePages.length - 1;
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, `Focus: AEON Mall Kumamoto (${pi + 2}/${total}) - Duty of Care`,
      `焦点：イオンモール熊本（${pi + 2}/${total}）再入館と安全配慮義務`);
    s.addText("Facts disclosed by the parties as of 4 Aug. Legal responsibility has not been determined; the points below are set out from a safety-management standpoint. 8月4日時点で当事者が公表した事実。法的責任は確定しておらず、以下は安全管理の観点からの整理。",
      { x: 0.4, y: 1.02, w: 12.5, h: 0.32, fontSize: 12, color: MUTED, italic: true, fontFace: FONT, valign: "top" });
    const lsH = aeonLessonH(af);
    const bulletH = BI ? (last ? 2.95 : 5.35) : (last ? Math.max(1.60, 5.40 - lsH - 0.20) : 5.35);
    biBulletsTier(s, 0.4, 1.40, 12.5, bulletH, grp, Object.assign({ maxLines: grp.lines }, AEON_OPT));
    if (last) {
      const lsY = BI ? 4.50 : Math.min(6.78 - lsH, 1.40 + tierBlockH(grp, 12.5, AEON_OPT.base) * 1.06 + 0.18);
      s.addShape(p.ShapeType.roundRect, { x: 0.4, y: lsY, w: 12.5, h: lsH, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
      s.addText([
        { text: "Lesson for DRR / 防災上の教訓\n", options: { bold: true, fontSize: 11, color: "9A3B12" } },
        { text: (af.lesson_en || "") + "\n", options: { fontSize: 9.5, color: "7A2E0E" } },
        { text: af.lesson_ja || "", options: { fontSize: 9, color: "7A2E0E" } },
      ], { x: 0.62, y: lsY + 0.10, w: 12.06, h: lsH - 0.20, align: "left", valign: "top", fontFace: FONT, margin: 4 });
    }
    srcLine(s, [{ label: "AEON Co. press conference", url: "https://www.aeon.info/" }, { label: "NHK", url: "https://news.web.nhk/newsweb/na/na-k10015194801000" }, { label: "Nishinippon / Asahi / Mainichi / RKK / Sankei", url: "https://www.nishinippon.co.jp/item/1522845/" }]);
    footer(s);
  });
}

/* ============ Slide 8f: Rebuilt city halls - 2016 to 2026 ============ */
if (d.cityhalls) {
  const ch = d.cityhalls;
  // One language = half the text, so all five rows plus the lesson box fit on a
  // single page; the bilingual deck keeps its 3-rows-per-page split.
  const chPages = chunk(ch.rows || [], BI ? 3 : (ch.rows || []).length || 1);
  const chIntroH = BI ? 1.02
    : Math.max(0.50, Math.min(1.02, estCellH(ch.intro_en + "\n" + ch.intro_ja, 12.33, 10, 3) + 0.10));
  chPages.forEach((grp, pi) => {
    const sfx = chPages.length > 1 ? ` (${pi + 1}/${chPages.length})` : "";
    const sfxJa = chPages.length > 1 ? `（${pi + 1}/${chPages.length}）` : "";
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, "Rebuilt Municipal Halls 2016-2026" + sfx, "被災庁舎の再建と今回の性能" + sfxJa);
    if (pi === 0) {
      s.addShape(p.ShapeType.rect, { x: 0, y: 1.00, w: W, h: chIntroH, fill: { color: "262626" }, line: { width: 0 } });
      s.addText([
        { text: (ch.intro_en || "") + "\n", options: { bold: true, fontSize: 10, color: "FFFFFF" } },
        { text: ch.intro_ja || "", options: { fontSize: 9.5, color: "D6D6D6" } },
      ], { x: 0.5, y: 1.06, w: 12.33, h: chIntroH - 0.12, align: "left", valign: "top", fontFace: FONT, margin: 3 });
    }
    const y0 = pi === 0 ? (BI ? 2.14 : 1.00 + chIntroH + 0.12) : 1.20;
    const rows = [[tableHeaderCell("Municipality / 市町"), tableHeaderCell("2016 damage / 2016年の被災"), tableHeaderCell("Rebuild / 再建"), tableHeaderCell("2026 status / 今回の状況"), tableHeaderCell(LX("Tier", "Tier", "出典区分"))]];
    grp.forEach((r, i) => rows.push([
      { text: `${BI ? r[0] : pickText(r[0])}\n${r[1] && r[1] !== "-" ? LX("Int. " + r[1], "Int. " + splitLine(r[1]).en, "震度" + splitLine(r[1]).ja) : ""}`, options: { fontSize: 10.5, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: r[2], options: { fontSize: 9.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: r[3], options: { fontSize: 9.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: r[4], options: { fontSize: 9.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: tierLabel(r[5]), options: { fontSize: 9.5, bold: true, color: tierColor(r[5]), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]));
    const chColW = [1.5, 2.5, 2.4, 4.8, 1.3];
    s.addTable(rows, { x: 0.4, y: y0, w: 12.5, colW: chColW, border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.40, valign: "middle" });
    if (pi === chPages.length - 1) {
      // Lesson box sits directly under the table (bilingual keeps its fixed slot).
      let lsY = 5.30, lsH = 1.42;
      if (!BI) {
        const tblH = 0.34 + grp.reduce((a, r) => a + estRowH([
          [`${BI ? r[0] : pickText(r[0])}\n${r[1] && r[1] !== "-" ? "x" : ""}`, chColW[0], 10.5, 4],
          [r[2], chColW[1], 9.5, 4], [r[3], chColW[2], 9.5, 4], [r[4], chColW[3], 9.5, 4],
        ], 0.40), 0);
        lsH = Math.max(0.62, noteBoxH(12.06, [
          ["Lesson for DRR / 防災上の教訓", 11],
          [ENO ? (ch.lesson_en || "") : (ch.lesson_ja || ""), ENO ? 9.5 : 9],
        ]));
        // +6% guard: LibreOffice rounds each row up a little, so the estimate
        // must never land the box on top of the last row of the table.
        lsY = Math.min(6.78 - lsH, y0 + tblH * 1.06 + 0.20);
      }
      s.addShape(p.ShapeType.roundRect, { x: 0.4, y: lsY, w: 12.5, h: lsH, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
      s.addText([
        { text: "Lesson for DRR / 防災上の教訓\n", options: { bold: true, fontSize: 11, color: "9A3B12" } },
        { text: (ch.lesson_en || "") + "\n", options: { fontSize: 9.5, color: "7A2E0E" } },
        { text: ch.lesson_ja || "", options: { fontSize: 9, color: "7A2E0E" } },
      ], { x: 0.62, y: lsY + 0.10, w: 12.06, h: lsH - 0.20, align: "left", valign: "top", fontFace: FONT, margin: 4 });
    }
    srcLine(s, [{ label: "NHK / Asahi / Nikkei xTECH / Sankei", url: "https://news.web.nhk/newsweb/na/na-k10015191361000" }, { label: "Kumamoto Pref. Disaster HQ (4 Aug)", url: "https://www.pref.kumamoto.jp/soshiki/222/274487.html" }]);
    footer(s);
  });
}

/* ============ Slide 8g: Disaster-related deaths & car-sleeping countermeasures ============ */
if (d.related_deaths) {
  const rd = d.related_deaths;
  // One language halves the text, so all six rows fit on one page; the chart
  // page that follows is always counted in the (n/N) label.
  const rdPages = chunk(rd.rows || [], BI ? 3 : (rd.rows || []).length || 1);
  const rdTotal = rdPages.length + 1;
  const rdIntroH = BI ? 1.12
    : Math.max(0.50, Math.min(1.12, estCellH((rd.intro_en || "") + "\n" + (rd.intro_ja || ""), 12.33, 10, 3) + 0.10));
  rdPages.forEach((grp, pi) => {
    const sfx = rdTotal > 1 ? ` (${pi + 1}/${rdTotal})` : "";
    const sfxJa = rdTotal > 1 ? `（${pi + 1}/${rdTotal}）` : "";
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, "Related Deaths & Car-sleeping" + sfx, "災害関連死・車中泊への対策" + sfxJa);
    if (pi === 0) {
      s.addShape(p.ShapeType.rect, { x: 0, y: 1.00, w: W, h: rdIntroH, fill: { color: "262626" }, line: { width: 0 } });
      s.addText([
        { text: (rd.intro_en || "") + "\n", options: { bold: true, fontSize: 10, color: "FFFFFF" } },
        { text: rd.intro_ja || "", options: { fontSize: 9.5, color: "D6D6D6" } },
      ], { x: 0.5, y: 1.06, w: 12.33, h: rdIntroH - 0.12, align: "left", valign: "top", fontFace: FONT, margin: 3 });
    }
    const y0 = pi === 0 ? (BI ? 2.24 : 1.00 + rdIntroH + 0.12) : 1.20;
    const rows = [[tableHeaderCell("Area / 分野"), tableHeaderCell("Measures taken in 2026 / 今回の実施内容"), tableHeaderCell(LX("Tier", "Tier", "出典区分"))]];
    grp.forEach((r, i) => rows.push([
      { text: r[0], options: { fontSize: 11, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: LX(`${r[1]}\n${r[2]}`, r[1], r[2]), options: { fontSize: 9.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: tierLabel(r[3]), options: { fontSize: 9.5, bold: true, color: tierColor(r[3]), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]));
    s.addTable(rows, { x: 0.4, y: y0, w: 12.5, colW: [2.2, 9.0, 1.3], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.40, valign: "middle" });
    srcLine(s, [{ label: "Kumamoto Pref. Disaster HQ (9 Aug 14:00)", url: "https://www.pref.kumamoto.jp/soshiki/222/274487.html" }, { label: "Kantei", url: "https://www.kantei.go.jp/jp/kikikanri/earthquake20260728.html" }]);
    footer(s);
  });
  // effectiveness page with heat-stroke bar chart
  {
    const hs = rd.heat_series || { labels: [], values: [] };
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, `Related Deaths & Car-sleeping (${rdTotal}/${rdTotal}) - Working?`,
      `災害関連死・車中泊対策（${rdTotal}/${rdTotal}）効果は出ているか`);
    s.addText([
      { text: (hs.note_en || "") + "\n", options: { fontSize: 11, color: INK } },
      { text: hs.note_ja || "", options: { fontSize: 10, color: "444444" } },
    ], { x: 0.4, y: 1.02, w: 12.5, h: 0.62, align: "left", valign: "top", fontFace: FONT, margin: 3 });
    s.addChart(p.ChartType.bar, [{ name: TT("Heat-stroke transports", "熱中症搬送"), labels: hs.labels, values: hs.values }], {
      x: 0.4, y: 1.74, w: 12.5, h: 3.30, barDir: "col", chartColors: [ADRC_ORANGE],
      showValue: true, dataLabelFontSize: 11, dataLabelColor: INK,
      catAxisLabelFontSize: 10.5, valAxisLabelFontSize: 10.5, valAxisMaxVal: 60,
      showLegend: false, fontFace: FONT, border: { pt: 0.5, color: LINE },
    });
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 5.18, w: 12.5, h: 1.56, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
    s.addText([
      { text: "Assessment / 評価\n", options: { bold: true, fontSize: 11, color: "9A3B12" } },
      { text: (rd.assessment_en || "") + "\n", options: { fontSize: 9.5, color: "7A2E0E" } },
      { text: rd.assessment_ja || "", options: { fontSize: 9, color: "7A2E0E" } },
    ], { x: 0.62, y: 5.28, w: 12.06, h: 1.36, align: "left", valign: "top", fontFace: FONT, margin: 4 });
    srcLine(s, [{ label: "Kumamoto Pref. Disaster HQ (9 Aug 14:00)", url: "https://www.pref.kumamoto.jp/soshiki/222/274487.html" }, { label: "JMA Kumamoto Local Met. Office", url: "https://www.jma.go.jp/jma/menu/20260728_kumamoto_jishin.html" }]);
    footer(s);
  }
}

/* ============ Slide 9: Response & Support - Domestic ============ */
{
  const dY = BI ? 1.2 : 1.12, dH = BI ? 5.4 : 5.66;
  const dOpt = { base: 14, min: 12 };
  const dpages = BI ? packBullets(d.support_domestic, 21, 118, 57)  // packed by height, not item count
                    : packBulletsTier(d.support_domestic, 12.5, dH, dOpt);
  dpages.forEach((items, pi) => {
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, "Response & Support - Domestic" + (dpages.length > 1 ? ` (${pi + 1}/${dpages.length})` : ""),
      "対応・支援（国内）" + (dpages.length > 1 ? `（${pi + 1}/${dpages.length}）` : ""));
    biBulletsTier(s, 0.4, dY, 12.5, dH, items, Object.assign({ maxLines: items.lines }, dOpt));
    srcLine(s, [linkBy("MLIT"), linkBy("FDMA"), linkBy("Cabinet Office"), linkBy("Kumamoto")]);
    footer(s);
  });
}


/* ============ Slide 9v: Disaster Volunteers (5 pages) ============ */
if (d.volunteers) {
  const v = d.volunteers;
  const vSrc = [
    { label: "Kumamoto Pref. CSW - disaster volunteer info / 熊本県社協", url: "https://www.fukushi-kumamoto.or.jp/kvc/" },
    { label: "Kumamoto Pref. / 熊本県", url: "https://www.pref.kumamoto.jp/soshiki/27/275523.html" },
    { label: "JNCSW / 全社協 (4 Aug)", url: "https://www.saigaivc.com/20260804/" },
    { label: "KVOAD", url: "https://www.kvoad.com/" },
  ];
  const VTL = chunk(v.timeline || [], BI ? 5 : 10);
  const VTOT = VTL.length + 3;
  const vHead = (n, en, ja) => heading(s, `Disaster Volunteers (${n}/${VTOT}) - ${en}`, `災害ボランティア（${n}/${VTOT}）${ja}`);
  const vhc = (t, al) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 10, align: al || "left", valign: "middle", margin: 3 } });

  // --- 1/5 & 2/5: overview + chronology ---
  const tlPages = VTL;
  tlPages.forEach((grp, pi) => {
    s = p.addSlide(); s.background = { color: WHITE };
    vHead(pi + 1, pi === 0 ? "Overview & Chronology" : "Chronology (cont.)", pi === 0 ? "概要と時系列" : "時系列（続き）");
    let y0 = 1.16;
    if (pi === 0) {
      const vbH = BI ? 1.62 : Math.max(0.62, Math.min(1.62, estBi2(v.intro_en, v.intro_ja, 168, 80) * 0.165 + 0.20));
      s.addShape(p.ShapeType.rect, { x: 0, y: 1.00, w: W, h: vbH, fill: { color: "262626" }, line: { width: 0 } });
      s.addText([
        { text: "Overview / 概要  ", options: { bold: true, fontSize: 10, color: ADRC_ORANGE } },
        { text: (v.intro_en || "") + "\n", options: { fontSize: 9.5, color: "FFFFFF" } },
        { text: v.intro_ja || "", options: { fontSize: 9, color: "D6D6D6" } },
      ], { x: 0.5, y: 1.05, w: 12.33, h: vbH - 0.10, align: "left", valign: "top", fontFace: FONT, margin: 3 });
      y0 = 1.00 + vbH + 0.14;
    }
    const rows = [[vhc("Date / 日付", "center"), vhc("Event / 事項"), vhc(LX("Tier", "Tier", "出典区分"), "center")]];
    grp.forEach((r, i) => rows.push([
      { text: jaDate(r[0]), options: { fontSize: 10, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
      { text: LX(`${r[1]}\n${r[2]}`, r[1], r[2]), options: { fontSize: 9, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: tierLabel(r[3]), options: { fontSize: 9, bold: true, color: tierColor(r[3]), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]));
    s.addTable(rows, { x: 0.4, y: y0, w: 12.5, colW: [1.35, 9.95, 1.20], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.36, valign: "middle" });
    srcLine(s, vSrc); footer(s);
  });

  // --- 3/5: centres by municipality ---
  s = p.addSlide(); s.background = { color: WHITE };
  vHead(VTOT - 2, "Centres by Municipality", "市町別センター");
  s.addText([
    { text: (d.volunteers.caption_en || "All figures from the latest Kumamoto Prefecture Disaster HQ meeting. A centre may be established yet not recruiting.") + "  ", options: { fontSize: 9, italic: true, color: "444444" } },
    { text: (d.volunteers.caption_ja || "すべて熊本県災害対策本部会議資料（最新）。設置済みでも募集を開始していない場合がある。橙は未定・実績なし。"), options: { fontSize: 8.5, italic: true, color: "444444" } },
  ], { x: 0.4, y: 1.00, w: 12.5, h: 0.32, align: "left", valign: "top", fontFace: FONT, margin: 2 });
  {
    const rows = [[vhc("Municipality / 市町村"), vhc(TT("Est.", "設置", " "), "center"), vhc(TT("Recruit", "募集", " "), "center"), vhc(TT("Activity", "活動", " "), "center"), vhc(TT("Cumulative", "延べ人数", " "), "center"), vhc("Location, scope & notes / 開設場所・募集範囲・備考")]];
    (v.centres || []).forEach((r, i) => {
      const pend = /not yet|planned/.test(String(r[2]) + String(r[3]));
      const bg = i % 2 ? WHITE : LIGHT;
      rows.push([
        { text: r[0], options: { fontSize: 9, bold: true, color: NAVY, fill: { color: bg }, align: "left", valign: "middle", margin: 3 } },
        { text: jaDate(r[1]), options: { fontSize: 8.5, color: INK, fill: { color: bg }, align: "center", valign: "middle", margin: 2 } },
        { text: jaDate(r[2]), options: { fontSize: 8.5, bold: pend, color: pend ? "B03A0B" : INK, fill: { color: bg }, align: "center", valign: "middle", margin: 2 } },
        { text: jaDate(r[3]), options: { fontSize: 8.5, bold: pend, color: pend ? "B03A0B" : INK, fill: { color: bg }, align: "center", valign: "middle", margin: 2 } },
        { text: r[4], options: { fontSize: 9.5, bold: true, color: r[4] === "-" ? "B03A0B" : NAVY, fill: { color: bg }, align: "center", valign: "middle", margin: 2 } },
        { text: r[5], options: { fontSize: 8.5, color: INK, fill: { color: bg }, align: "left", valign: "middle", margin: 3 } },
      ]);
    });
    s.addTable(rows, { x: 0.4, y: 1.40, w: 12.5, colW: [2.05, 0.80, 0.95, 0.95, 1.20, 6.55], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.40, valign: "middle" });
  }
  srcLine(s, vSrc); footer(s);

  // --- 4/5: activities & participation ---
  s = p.addSlide(); s.background = { color: WHITE };
  vHead(VTOT - 1, "Activities & Participation", "活動内容と参加");
  {
    const rows = [[vhc("Type of work / 活動の種類"), vhc("Content / 内容")]];
    (v.activities || []).forEach((r, i) => rows.push([
      { text: r[0], options: { fontSize: 10, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: LX(`${r[1]}\n${r[2]}`, r[1], r[2]), options: { fontSize: 9.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    ]));
    s.addTable(rows, { x: 0.4, y: 1.10, w: 12.5, colW: [2.9, 9.6], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.60, valign: "middle" });
  }
  {
    const pp = v.participation || {};
    const pH = BI ? 2.00 : Math.max(1.00, noteBoxH(12.06, [
      ["Cumulative participation / 延べ活動人数", 12],
      [ENO ? (pp.total_en || "") : (pp.total_ja || ""), ENO ? 14 : 12.5],
      ["", 9],
      [ENO ? (pp.note_en || "") : (pp.note_ja || ""), ENO ? 9.5 : 9],
    ]));
    s.addShape(p.ShapeType.rect, { x: 0.4, y: 4.52, w: 12.5, h: pH, fill: { color: "F2F5FA" }, line: { color: NAVY, width: 0.75 } });
  }
  s.addText([
    { text: "Cumulative participation / 延べ活動人数\n", options: { bold: true, fontSize: 12, color: NAVY } },
    { text: (v.participation || {}).total_en + "\n", options: { bold: true, fontSize: 14, color: ADRC_ORANGE } },
    { text: (v.participation || {}).total_ja + "\n\n", options: { bold: true, fontSize: 12.5, color: ADRC_ORANGE } },
    { text: (v.participation || {}).note_en + "\n", options: { fontSize: 9.5, color: INK } },
    { text: (v.participation || {}).note_ja, options: { fontSize: 9, color: "444444" } },
  ], { x: 0.62, y: 4.62, w: 12.06, h: 1.82, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  srcLine(s, vSrc); footer(s);

  // --- 5/5: schemes & assessment ---
  s = p.addSlide(); s.background = { color: WHITE };
  vHead(VTOT, "Schemes & Assessment", "制度と評価");
  {
    const rows = [[vhc("Scheme / 制度"), vhc("Detail / 内容")]];
    (v.schemes || []).forEach((r, i) => rows.push([
      { text: r[0], options: { fontSize: 10, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: r[1], options: { fontSize: 9.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    ]));
    s.addTable(rows, { x: 0.4, y: 1.10, w: 12.5, colW: [3.1, 9.4], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.42, valign: "middle" });
  }
  {
    const aH = BI ? 2.40 : Math.max(0.90, noteBoxH(12.06, [
      ["Assessment / 評価", 11],
      [ENO ? (v.assessment_en || "") : (v.assessment_ja || ""), ENO ? 9.5 : 9],
    ]));
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 4.22, w: 12.5, h: aH, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
    s.addText([
      { text: "Assessment / 評価\n", options: { bold: true, fontSize: 11, color: "9A3B12" } },
      { text: (v.assessment_en || "") + "\n", options: { fontSize: 9.5, color: "7A2E0E" } },
      { text: v.assessment_ja || "", options: { fontSize: 9, color: "7A2E0E" } },
    ], { x: 0.62, y: 4.32, w: 12.06, h: aH - 0.20, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  }
  srcLine(s, vSrc); footer(s);
}

/* ============ Slide 9b: JSDF Disaster Relief Operations (2 pages) ============ */
if (d.jsdf) {
  const j = d.jsdf;
  const jSrc = [
    { label: "Defense Minister press conf. (29 Jul) / 防衛大臣臨時会見", url: "https://www.mod.go.jp/j/press/kisha/2026/0729a_r.html" },
    { label: "MOD/JSDF - disaster relief / 防衛省 災害派遣", url: "https://www.mod.go.jp/j/approach/defense/saigai/index.html" },
    { label: "Kantei", url: "https://www.kantei.go.jp/jp/kikikanri/earthquake20260728.html" },
  ];
  const acts = (j.activities || []).map(a => Object.assign({ tier: "official" }, a));
  const jOtherH = (BI || !j.other_en) ? 0.95 : Math.max(0.55, noteBoxH(12.06, [
    ["Other uniformed services / 警察・消防・海上保安庁", 11],
    [ENO ? j.other_en : j.other_ja, ENO ? 10.5 : 10],
  ]));
  const jIntroH = BI ? 1.10 : Math.max(0.55, noteBoxH(12.06, [[ENO ? j.intro_en : j.intro_ja, 11]]));
  const jTableY = BI ? 2.30 : 1.00 + jIntroH + 0.12;
  const jTableH = BI ? 2.00 : 0.36 + (j.scale || []).reduce((a, r) => a + estRowH([
    [TT(r.note_en, r.note_ja), 9.4, 10.5, 4], [jaDate(r.d), 1.5, 11.5, 4], [r.n, 1.6, 12, 3],
  ], 0.50), 0) * 1.03;
  const jBulY = jTableY + jTableH + 0.14;
  // One language halves the text, so posture + scale + ALL activities + the
  // "other services" panel usually fit on a single slide.
  const jOne = !BI && (jBulY + tierBlockH(acts, 12.5, 13) * 1.03 + 0.14 + jOtherH < 6.78);
  const first = jOne ? acts : acts.slice(0, 3), rest = jOne ? [] : acts.slice(3);

  // --- 1/2: posture and scale ---
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "JSDF Disaster Relief Operations" + (jOne ? "" : " (1/2)"), "自衛隊の災害派遣活動" + (jOne ? "" : "（1/2）"));
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 1.02, w: 12.5, h: jIntroH, fill: { color: "262626" }, line: { color: "262626", width: 1 }, rectRadius: 0.04 });
  s.addText([
    { text: j.intro_en + "\n", options: { fontSize: 11, bold: true, color: "FFFFFF" } },
    { text: j.intro_ja, options: { fontSize: 10.5, color: "E6E6E6" } },
  ], { x: 0.62, y: 1.07, w: 12.06, h: jIntroH - 0.10, align: "left", valign: "middle", fontFace: FONT, margin: 4 });

  const sRows = [[tableHeaderCell("Date / 日付"), tableHeaderCell("Personnel / 人員"), tableHeaderCell("Note / 内容")]];
  (j.scale || []).forEach((r, i) => sRows.push([
    { text: jaDate(r.d), options: { fontSize: 11.5, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 4 } },
    { text: r.n, options: { fontSize: 12, bold: true, color: RED, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    { text: TT(r.note_en, r.note_ja), options: { fontSize: 10.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
  ]));
  s.addTable(sRows, { x: 0.4, y: jTableY, w: 12.5, colW: [1.5, 1.6, 9.4], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.50, valign: "middle" });
  biBulletsTier(s, 0.4, BI ? 4.35 : jBulY, 12.5, BI ? 2.45 : (6.78 - jOtherH - 0.14 - jBulY), first,
    Object.assign({ base: 13, min: 10.5 }, BI ? {} : { maxLines: tierLinesTotal(first, 12.5, 13) }));
  if (jOne && j.other_en) {
    const oy = 6.78 - jOtherH;
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: oy, w: 12.5, h: jOtherH, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
    s.addText([
      { text: "Other uniformed services / 警察・消防・海上保安庁\n", options: { bold: true, fontSize: 11, color: "9A3B12" } },
      { text: j.other_en + "\n", options: { fontSize: 10.5, color: "7A2E0E" } },
      { text: j.other_ja, options: { fontSize: 10, color: "7A2E0E" } },
    ], { x: 0.62, y: oy + 0.07, w: 12.06, h: jOtherH - 0.14, align: "left", valign: "middle", fontFace: FONT, margin: 5 });
  }
  srcLine(s, jSrc);
  footer(s);

  // --- 2/2: living support ---
  if (!jOne) {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "JSDF Disaster Relief Operations (2/2)", "自衛隊の災害派遣活動（2/2）");
  s.addText("Living support in extreme heat, and the other uniformed services. 酷暑下の生活支援と、警察・消防・海上保安庁の態勢。",
    { x: 0.4, y: 1.02, w: 12.5, h: 0.3, fontSize: 11, color: MUTED, italic: true, fontFace: FONT, valign: "top" });
  biBulletsTier(s, 0.4, 1.42, 12.5, 3.55, rest, { base: 13, min: 11 });
  if (j.other_en) {
    const oy2 = BI ? 5.20 : (6.78 - jOtherH);
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: oy2, w: 12.5, h: jOtherH, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.05 });
    s.addText([
      { text: "Other uniformed services / 警察・消防・海上保安庁\n", options: { bold: true, fontSize: 11, color: "9A3B12" } },
      { text: j.other_en + "\n", options: { fontSize: 10.5, color: "7A2E0E" } },
      { text: j.other_ja, options: { fontSize: 10, color: "7A2E0E" } },
    ], { x: 0.62, y: oy2 + 0.07, w: 12.06, h: jOtherH - 0.14, align: "left", valign: "middle", fontFace: FONT, margin: 5 });
  }
  srcLine(s, jSrc);
  footer(s);
  }
}

/* ============ Slide 9c: MLIT TEC-FORCE (2 pages) ============ */
if (d.tecforce) {
  const t = d.tecforce;
  const tSrc = [
    { label: "MLIT Kyushu Bureau - 22nd report (16 Aug) / 九州地方整備局 第22報", url: "https://www.qsr.mlit.go.jp/content/000002809.pdf" },
    { label: "TEC-FORCE", url: "https://www.qsr.mlit.go.jp/bousai_joho/tec_force/index.html" },
  ];

  // --- 1/2: deployment ---
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "MLIT TEC-FORCE (1/2) - Deployment", "TEC-FORCE の派遣状況（1/2）");
  // Band height follows the intro length so a longer intro can never spill over the heading/table.
  const tIntroH = Math.max(1.10, Math.min(1.95,
    estBi2(t.intro_en, t.intro_ja, 150, 72) * 0.165 + 0.14));
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 1.00, w: 12.5, h: tIntroH, fill: { color: "262626" }, line: { color: "262626", width: 1 }, rectRadius: 0.04 });
  s.addText([
    { text: t.intro_en + "\n", options: { fontSize: 10, bold: true, color: "FFFFFF" } },
    { text: t.intro_ja, options: { fontSize: 9.5, color: "E6E6E6" } },
  ], { x: 0.62, y: 1.04, w: 12.06, h: tIntroH - 0.08, align: "left", valign: "middle", fontFace: FONT, margin: 4 });
  const tTableY = 1.00 + tIntroH + 0.10;

  const tRows = [[tableHeaderCell("Team / 班"), tableHeaderCell(t.as_of || "Current"), tableHeaderCell("Cumulative\n延べ"), tableHeaderCell("Note / 備考")]];
  (t.teams || []).forEach((r, i) => {
    const fill = r.bold ? "E8EDF5" : (i % 2 ? WHITE : LIGHT);
    tRows.push([
      { text: r.t, options: { fontSize: 10.5, bold: !!r.bold, color: NAVY, fill: { color: fill }, align: "left", valign: "middle", margin: 4 } },
      { text: r.n, options: { fontSize: 11, bold: true, color: r.bold ? RED : INK, fill: { color: fill }, align: "center", valign: "middle", margin: 3 } },
      { text: r.c, options: { fontSize: 11, bold: !!r.bold, color: INK, fill: { color: fill }, align: "center", valign: "middle", margin: 3 } },
      { text: r.note || "", options: { fontSize: 9.5, color: INK, fill: { color: fill }, align: "left", valign: "middle", margin: 4 } },
    ]);
  });
  s.addTable(tRows, { x: 0.4, y: tTableY, w: 12.5, colW: [3.5, 1.1, 1.2, 6.7], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT,
    rowH: Math.max(0.28, Math.min(0.325, (6.10 - tTableY) / Math.max(1, tRows.length))), valign: "middle" });

  if (t.note_en) {
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 6.22, w: 12.5, h: 0.56, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.04 });
    s.addText([
      { text: t.note_en + " ", options: { fontSize: 8.5, bold: true, color: "9A3B12" } },
      { text: t.note_ja, options: { fontSize: 8, color: "7A2E0E" } },
    ], { x: 0.62, y: 6.25, w: 12.06, h: 0.50, align: "left", valign: "middle", fontFace: FONT, margin: 4 });
  }
  srcLine(s, tSrc);
  footer(s);

  // --- 2/2: activities and findings ---
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "MLIT TEC-FORCE (2/2) - Activities & Findings", "TEC-FORCE の活動と調査結果（2/2）");
  biBulletsTier(s, 0.4, 1.02, 12.5, 2.98, t.activities || [], { base: 12.5, min: 9.5 });
  const fRows = [[tableHeaderCell("Sector / 分野"), tableHeaderCell(TT(t.findings_asof_en || "Findings", t.findings_asof_ja || "調査結果"))]];
  (t.findings || []).forEach((r, i) => fRows.push([
    { text: r[0], options: { fontSize: 10.5, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    { text: LX(r[1] + " / " + r[2], r[1], r[2]), options: { fontSize: 10, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
  ]));
  s.addTable(fRows, { x: 0.4, y: 4.14, w: 12.5, colW: [2.2, 10.3], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.36, valign: "middle" });
  srcLine(s, tSrc);
  footer(s);
}

/* ============ Slide 9d: Legal designations (one page per statute) ============ */
if (d.legal) {
  const L = d.legal;
  const pages = [
    { blk: L.specified, accent: NAVY, n: 1 },
    { blk: L.severe, accent: "9A3B12", n: 2 },
  ];
  pages.forEach(pg => {
    const blk = pg.blk;
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, blk.title_en + LX("", ` (${pg.n}/2)`, ""), blk.title_ja + `（${pg.n}/2）`);
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 1.00, w: 12.5, h: 0.92, fill: { color: "262626" }, line: { color: "262626", width: 1 }, rectRadius: 0.04 });
    s.addText([
      { text: L.intro_en + "\n", options: { fontSize: 10, bold: true, color: "FFFFFF" } },
      { text: L.intro_ja, options: { fontSize: 9.5, color: "E6E6E6" } },
    ], { x: 0.62, y: 1.04, w: 12.06, h: 0.84, align: "left", valign: "middle", fontFace: FONT, margin: 4 });

    s.addShape(p.ShapeType.rect, { x: 0.4, y: 2.06, w: 12.5, h: 0.90, fill: { color: LIGHT }, line: { color: pg.accent, width: 1 } });
    s.addText([
      { text: blk.law_en + "\n", options: { fontSize: 10, bold: true, color: pg.accent } },
      { text: blk.law_ja + "\n", options: { fontSize: 9.5, color: MUTED } },
      { text: blk.basis_en + "  ", options: { fontSize: 9.5, color: INK } },
      { text: blk.basis_ja, options: { fontSize: 9, color: "444444" } },
    ], { x: 0.62, y: 2.10, w: 12.06, h: 0.82, align: "left", valign: "middle", fontFace: FONT, margin: 4 });

    const rows = [[tableHeaderCell("Measure / 措置"), tableHeaderCell("Content / 内容")]];
    blk.items.forEach((it, i) => rows.push([
      { text: LX(it[0] + "\n" + it[2], it[0], it[2]), options: { fontSize: 10, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: LX(it[1] + "\n" + it[3], it[1], it[3]), options: { fontSize: 9.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
    ]));
    s.addTable(rows, { x: 0.4, y: 3.10, w: 12.5, colW: [5.2, 7.3], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.52, valign: "middle" });

    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 6.24, w: 12.5, h: 0.44, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.04 });
    s.addText([
      { text: L.note_en + "  ", options: { fontSize: 8.5, bold: true, color: "9A3B12" } },
      { text: L.note_ja, options: { fontSize: 8, color: "7A2E0E" } },
    ], { x: 0.62, y: 6.26, w: 12.06, h: 0.40, align: "left", valign: "middle", fontFace: FONT, margin: 4 });
    srcLine(s, [{ label: "Cabinet Office (Disaster Management) / 内閣府防災", url: "https://www.bousai.go.jp/" }]);
    footer(s);
  });
}

/* ============ Slide 10: Response & Support - International ============ */
{
  const iH = BI ? 5.45 : 5.66;
  const iOpt = { base: 14, min: 11.5 };
  const ipages = BI ? packBullets(d.support_international, 21, 118, 57)
                    : packBulletsTier(d.support_international, 12.5, iH, iOpt);
  ipages.forEach((items, pi) => {
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, "Response & Support - International" + (ipages.length > 1 ? ` (${pi + 1}/${ipages.length})` : ""),
      "対応・支援（国際）" + (ipages.length > 1 ? `（${pi + 1}/${ipages.length}）` : ""));
    biBulletsTier(s, 0.4, BI ? 1.15 : 1.12, 12.5, iH, items, Object.assign({ maxLines: items.lines }, iOpt));
    srcLine(s, [linkBy("Sentinel Asia"), linkBy("International Disaster Charter"), linkBy("ADRC")]);
    footer(s);
  });
  // Both mechanisms were activated on 28 Jul at ADRC's request — show the activation pages.
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "International Activation Pages (requested by ADRC)", "国際メカニズムの発動ページ（要請：ADRC）");
  imageSlot(s, 0.4, 1.20, 6.15, 5.30, "sentinel_asia", "Sentinel Asia Emergency Observation (requested by ADRC)", "Sentinel Asia 緊急観測（要請：ADRC）", "https://sentinel-asia.org/EO/2026/article20260728JP.html");
  imageSlot(s, 6.75, 1.20, 6.15, 5.30, "disaster_charter", "International Charter - Activation #1046 (requested by ADRC)", "国際災害チャーター Activation #1046（要請：ADRC）", "https://disasterscharter.org/activations/earthquake-in-japan-activation-1046-");
  srcLine(s, [linkBy("Sentinel Asia"), linkBy("International Disaster Charter"), linkBy("ADRC")]);
  footer(s);
}

/* ============ Slide 11: Emergency Observation by Satellites (1/2) ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Emergency Observation by Satellites (1/3)", "衛星による緊急観測（1/3）");
imageSlot(s, 0.4, 1.2, 6.2, 5.35, "alos2_insar", "GSI ALOS-2 InSAR - LOS crustal deformation (12 Aug 2025 - 28 Jul 2026); fringes concentrate along the Hinagu fault zone", "国土地理院 だいち2号 干渉SAR - 視線方向の地殻変動（2025/8/12〜2026/7/28）。変動縞は日奈久断層帯に集中", "https://www.gsi.go.jp/uchusokuchi/20260728kumamoto.html");
if (resolveImg("sentinel1_dpm")) {
  imageSlot(s, 6.9, 1.2, 6.0, 5.35, "sentinel1_dpm", "Copernicus Sentinel-1 Damage Proxy Map", "Copernicus Sentinel-1 被害推定図（DPM）", "https://sentinel-asia.org/EO/EmergencyObservation.html");
} else {
  // No DPM image on hand — use the space to interpret the GSI InSAR result (keeps the page complete, no placeholder).
  s.addShape(p.ShapeType.roundRect, { x: 6.9, y: 1.2, w: 6.0, h: 5.35, fill: { color: LIGHT }, line: { color: NAVY2, width: 1 }, rectRadius: 0.06 });
  s.addText([
    { text: "Reading the InSAR / 干渉SARの読み方\n\n", options: { bold: true, fontSize: 14, color: NAVY } },
    { text: "GSI analysed ALOS-2 (JAXA) SAR pairs spanning 12 Aug 2025 - 28 Jul 2026. Colours show line-of-sight (LOS) ground displacement: warm = moving away (subsidence / westward), cool = approaching (uplift / eastward), one cycle = 12 cm.\n", options: { fontSize: 12, color: INK } },
    { text: "国土地理院がだいち2号（JAXA）のSARを解析（2025/8/12〜2026/7/28）。色は視線方向の変位（暖色＝遠ざかる＝沈降・西向き、寒色＝近づく＝隆起・東向き、1周期＝12cm）。\n\n", options: { fontSize: 11, color: "444444" } },
    { text: "Key point / 要点\n", options: { bold: true, fontSize: 12.5, color: NAVY } },
    { text: "The dense fringes concentrate along the Hinagu fault zone, with a sharp displacement discontinuity across it - independent geodetic evidence that the 2026 rupture occurred on the Hinagu fault (see the source-fault page).\n", options: { fontSize: 12, color: INK } },
    { text: "変動縞は日奈久断層帯に集中し、同帯を境に変位が不連続。2026年の破壊が日奈久断層で生じたことを示す測地学的証拠（震源断層ページ参照）。\n\n", options: { fontSize: 11, color: "444444" } },
    { text: "Copernicus Sentinel-1 Damage Proxy Maps are also produced via Sentinel Asia; insert here when the image is on hand.\n", options: { fontSize: 10.5, italic: true, color: MUTED } },
    { text: "Copernicus Sentinel-1の被害推定図（DPM）もSentinel Asia経由で作成。画像入手時にここへ掲載。", options: { fontSize: 10, italic: true, color: MUTED } },
  ], { x: 7.15, y: 1.4, w: 5.5, h: 5.0, align: "left", valign: "top", fontFace: FONT, margin: 4 });
}
srcLine(s, [{ label: "GSI - crustal deformation / 国土地理院 地殻変動", url: "https://www.gsi.go.jp/uchusokuchi/20260728kumamoto.html" }, linkBy("JAXA"), linkBy("Sentinel Asia")]);
footer(s);

/* ============ Slide 12: Emergency Observation by Satellites (2/2) ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Emergency Observation by Satellites (2/3)", "衛星による緊急観測（2/3）");
if (resolveImg("building_damage")) {
  imageSlot(s, 0.4, 1.2, 4.0, 5.35, "building_damage", "Building-damage estimation", "建物被害推定図", "https://unosat.org/");
} else {
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 1.2, w: 4.0, h: 5.35, fill: { color: LIGHT }, line: { color: NAVY2, width: 1 }, rectRadius: 0.06 });
  s.addText([
    { text: "Building-damage estimation / 建物被害推定\n\n", options: { bold: true, fontSize: 13, color: NAVY } },
    { text: "Chiba University (CEReS) produced coherence-difference maps from pre- and co-event ALOS-2 InSAR pairs for Yatsushiro City (30 Jul) and Uki City (31 Jul), plus an HH backscatter colour composite for Shimabara.\n", options: { fontSize: 11, color: INK } },
    { text: "千葉大学（CEReS）が被災前後のALOS-2 InSARペアからコヒーレンス差分図を作成（八代市7/30、宇城市7/31）。島原はHH偏波の後方散乱カラー合成。\n\n", options: { fontSize: 10, color: "444444" } },
    { text: "How to read it / 読み方\n", options: { bold: true, fontSize: 11.5, color: NAVY } },
    { text: "Where buildings collapse, the radar scattering pattern changes and coherence between the two passes drops. Areas of strong coherence loss therefore flag probable building damage, and are used to prioritise field survey.\n", options: { fontSize: 11, color: INK } },
    { text: "建物が倒壊すると散乱パターンが変化し、2時期のコヒーレンスが低下する。コヒーレンス低下域は建物被害の可能性が高い場所を示し、現地調査の優先度判断に用いられる。\n\n", options: { fontSize: 10, color: "444444" } },
    { text: "Published via Sentinel Asia (EO #2026-07-28) and the Charter Activation #1046.", options: { fontSize: 9.5, italic: true, color: MUTED } },
  ], { x: 0.6, y: 1.4, w: 3.6, h: 5.0, align: "left", valign: "top", fontFace: FONT, margin: 4 });
}
if (resolveImg("nightlight_population")) {
  imageSlot(s, 4.6, 1.2, 4.0, 5.35, "nightlight_population", "Night-light reduction / population impact", "夜間光の減少・人口影響", "https://sentinel-asia.org/");
} else {
  s.addShape(p.ShapeType.roundRect, { x: 4.6, y: 1.2, w: 4.0, h: 5.35, fill: { color: LIGHT }, line: { color: NAVY2, width: 1 }, rectRadius: 0.06 });
  s.addText([
    { text: "Crustal deformation from space / 衛星による地殻変動\n\n", options: { bold: true, fontSize: 13, color: NAVY } },
    { text: "GSI 2.5-D analysis of ALOS-2 / ALOS-4 InSAR indicates up to about 1 m of eastward displacement and about 50 cm of subsidence in the north-western part of the Hinagu fault zone (2nd report, provisional).\n", options: { fontSize: 11, color: INK } },
    { text: "国土地理院のALOS-2／ALOS-4干渉SARの2.5次元解析では、日奈久断層帯北西部で最大約1mの東向き変位と約50cmの沈降（第2報・暫定）。\n\n", options: { fontSize: 10, color: "444444" } },
    { text: "Complementary SAR / 補完的なSAR\n", options: { bold: true, fontSize: 11.5, color: NAVY } },
    { text: "Natural Resources Canada released four RADARSAT Constellation Mission products on 31 Jul via the Charter - azimuth and range deformation maps - which resolve along-track motion that a single InSAR line of sight cannot capture.\n", options: { fontSize: 11, color: INK } },
    { text: "カナダ天然資源省がチャーター経由でRCMのプロダクト4点を7月31日に公開（方位方向・レンジ方向の変動図）。単一視線の干渉解析では捉えられない軌道進行方向の変位を補完する。\n\n", options: { fontSize: 10, color: "444444" } },
    { text: "GNSS: the Sencho station (Yatsushiro) moved ~87 cm NE and subsided ~32 cm. / GNSS：千丁観測点は北東に約87cm移動、約32cm沈降。", options: { fontSize: 9.5, italic: true, color: MUTED } },
  ], { x: 4.8, y: 1.4, w: 3.6, h: 5.0, align: "left", valign: "top", fontFace: FONT, margin: 4 });
}
{
  const fitS = fitRows(d.satellite.length, 5.35, { maxRowH: 0.9, minRowH: 0.55, baseFont: 11, minFont: 9.5 });
  const satRows = [[tableHeaderCell("Body / 機関"), tableHeaderCell("Status")]];
  d.satellite.slice(0, fitS.shownBody).forEach((r, i) => satRows.push([
    // Index only: the contribution text lives on the (3/3) pages. Printing it here
    // made row heights depend on text length and spilled past the source line.
    { text: r.org, options: { fontSize: fitS.fontSize, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 3 } },
    { text: jaSrc(r.status), options: { fontSize: fitS.fontSize, italic: r.status === "TBC", color: r.status === "TBC" ? MUTED : tierColor(r.tier), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
  ]));
  if (fitS.cap) satRows.push([{ text: `+${fitS.cap} more / 他${fitS.cap}件`, options: { fontSize: fitS.fontSize, italic: true, color: MUTED, colspan: 2, fill: { color: WHITE }, align: "left", valign: "middle", margin: 3 } }]);
  s.addTable(satRows, { x: 8.8, y: 1.2, w: 4.1, colW: [3.0, 1.1], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: fitS.rowH });
}
srcLine(s, [linkBy("Sentinel Asia"), linkBy("JAXA"), linkBy("Cabinet") || linkBy("GSI")]);
footer(s);

/* ============ Slide 12a: Contributing bodies & products (3/3) - full list, paginated ============ */
{
  // Bilingual: a fixed 7 rows/page. One language: pack by estimated height, so
  // the 12 bodies land on a single page instead of a 7 + 5 split with two
  // half-empty slides.
  const SAT_PER_PAGE = 7;
  const satPages = BI ? chunk(d.satellite, SAT_PER_PAGE) : (() => {
    const budget = 6.50 - 1.40 - 0.34, out = [];
    const rowH = (r) => estRowH([
      [`${r.en}\n${r.ja}`, 7.2, 10.5, 4], [r.org, 2.3, 12, 4], [jaSrc(r.status), 1.6, 11, 3],
    ], 0.40);
    let cur = [], h = 0;
    (d.satellite || []).forEach((r) => {
      const rh = rowH(r);
      // Hard cap as well as the height budget: the height estimate is optimistic
      // for long two-line cells, and a 15-row list used to spill past the source line.
      if (cur.length && (h + rh > budget || cur.length >= 6)) { out.push(cur); cur = []; h = 0; }
      cur.push(r); h += rh;
    });
    if (cur.length) out.push(cur);
    return out.length ? out : [[]];
  })();
  satPages.forEach((grp, pi) => {
    const sfx = satPages.length > 1 ? ` (3/3-${pi + 1})` : " (3/3)";
    const sfxJa = satPages.length > 1 ? `（3/3-${pi + 1}）` : "（3/3）";
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, "Observation Bodies & Products" + sfx, "緊急観測の参加機関とプロダクト" + sfxJa);
    s.addText("All bodies contributing observations or value-added products; source tier shown per row. 観測またはプロダクトを提供した全機関（各行に出典ティアを表示）。",
      { x: 0.4, y: 1.02, w: 12.5, h: 0.32, fontSize: 12, color: MUTED, italic: true, fontFace: FONT, valign: "top" });
    const rows = [[tableHeaderCell("Body / 機関"), tableHeaderCell("Contribution / 提供内容"), tableHeaderCell("Status / 状況"), tableHeaderCell(LX("Tier", "Tier", "出典区分"))]];
    grp.forEach((r, i) => rows.push([
      { text: r.org, options: { fontSize: 12, bold: true, color: NAVY, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: `${r.en}\n${r.ja}`, options: { fontSize: 10.5, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 } },
      { text: jaSrc(r.status), options: { fontSize: 11, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
      { text: tierLabel(r.tier), options: { fontSize: 10.5, bold: true, color: tierColor(r.tier), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
    ]));
    s.addTable(rows, { x: 0.4, y: 1.40, w: 12.5, colW: [2.3, 7.2, 1.6, 1.4], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.40, valign: "middle" });
    srcLine(s, [linkBy("Sentinel Asia"), linkBy("Charter") || linkBy("Cabinet"), linkBy("JAXA")]);
    footer(s);
  });
}

/* ============ NEW 1/3: Commercial SAR operators - emergency observation ============ */
if (d.sat_private) {
  const sp = d.sat_private;
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Commercial SAR Operators - Emergency Observation & Interpretation", "民間SAR事業者による緊急観測と判読");
  const spH = Math.max(0.72, Math.min(1.30, estBi2(sp.intro_en, sp.intro_ja, 92, 46) * 0.165 + 0.14));
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 0.98, w: 12.5, h: spH, fill: { color: "262626" }, line: { color: "262626", width: 1 }, rectRadius: 0.04 });
  s.addText([
    { text: sp.intro_en + "\n", options: { fontSize: 9.5, bold: true, color: "FFFFFF" } },
    { text: sp.intro_ja, options: { fontSize: 9, color: "E6E6E6" } },
  ], { x: 0.62, y: 1.01, w: 12.06, h: spH - 0.06, align: "left", valign: "middle", fontFace: FONT, margin: 3 });
  const spY = 0.98 + spH + 0.10;
  const spRows = [[tableHeaderCell(TT("Operator / sensor", "事業者・センサ")), tableHeaderCell(TT("Observation & interpretation", "観測と判読"))]];
  (sp.rows || []).forEach((r, i) => {
    const fill = i % 2 ? WHITE : LIGHT;
    spRows.push([
      { text: r[0] + "\n" + r[1], options: { fontSize: 9, bold: true, color: NAVY, fill: { color: fill }, align: "left", valign: "middle", margin: 3 } },
      { text: TT(r[2], r[3], "\n"), options: { fontSize: 8.5, color: INK, fill: { color: fill }, align: "left", valign: "middle", margin: 3 } },
    ]);
  });
  s.addTable(spRows, { x: 0.4, y: spY, w: 7.25, colW: [1.95, 5.30], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT,
    rowH: Math.max(0.28, Math.min(0.90, (6.10 - spY) / Math.max(1, spRows.length))), valign: "middle" });
  imageSlot(s, 7.85, spY - 0.02, 5.05, 2.62, "qps_yatsushiro",
    "QPS-SAR: derailed / overturned container wagons at Yatsushiro Station (green). Blue = wagons still upright, red circles = gaps where a wagon carried no container. (c)QPS Institute, interpretation by SKY Perfect JSAT",
    "QPS-SAR：八代駅で脱線・横転したコンテナ積載車両（緑枠）。青枠は横転していない積載車両、赤丸の空隙はコンテナ未積載の車両。©QPS研究所（画像判読協力：スカパーJSAT）",
    "https://www.skyperfectjsat.space/jp/news/20260805_1");
  imageSlot(s, 7.85, spY + 2.72, 5.05, 2.62, "kkc_insar",
    "Kokusai Kogyo: Sentinel-1 interferogram of coseismic displacement - concentric fringes centred on the epicentre, one colour cycle = +/-2.8 cm line-of-sight. Sentinel-1 data from ESA, processed by KKC",
    "国際航業：Sentinel-1による地殻変動の干渉縞画像。震央を中心に同心円状の縞が広がる（1色周期は視線方向±2.8cm）。Sentinel-1 data from ESA, processed by KKC");
  if (sp.note_en) {
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 6.24, w: 7.25, h: 0.50, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.04 });
    s.addText([
      { text: sp.note_en + " ", options: { fontSize: 8, bold: true, color: "9A3B12" } },
      { text: sp.note_ja, options: { fontSize: 7.5, color: "7A2E0E" } },
    ], { x: 0.58, y: 6.26, w: 6.92, h: 0.46, align: "left", valign: "middle", fontFace: FONT, margin: 3 });
  }
  srcLine(s, [
    { label: "SKY Perfect JSAT / QPS-SAR (5 Aug) / スカパーJSAT・QPS研究所", url: "https://www.skyperfectjsat.space/jp/news/20260805_1" },
    { label: "Kokusai Kogyo / 国際航業", url: "https://www.kkc.co.jp/disaster/2026/07/%e4%bb%a4%e5%92%8c8%e5%b9%b4%e7%86%8a%e6%9c%ac%e5%9c%b0%e9%9c%87/" },
    { label: "Synspective", url: "https://synspective.com/information/2026/kumamoto_earthquake/" },
  ]);
  footer(s);
}

/* ============ NEW 2/3: Satellite estimate vs official certification ============ */
if (d.sat_vs_official) {
  const sv = d.sat_vs_official;
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Satellite Estimate vs Official Certification - How to Read the Gap", "衛星による推計と公式の被害認定 — 差の読み方");
  const svH = Math.max(0.72, Math.min(1.30, estBi2(sv.intro_en, sv.intro_ja, 92, 46) * 0.165 + 0.14));
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 0.98, w: 12.5, h: svH, fill: { color: "262626" }, line: { color: "262626", width: 1 }, rectRadius: 0.04 });
  s.addText([
    { text: sv.intro_en + "\n", options: { fontSize: 9.5, bold: true, color: "FFFFFF" } },
    { text: sv.intro_ja, options: { fontSize: 9, color: "E6E6E6" } },
  ], { x: 0.62, y: 1.01, w: 12.06, h: svH - 0.06, align: "left", valign: "middle", fontFace: FONT, margin: 3 });
  const svY = 0.98 + svH + 0.10;
  imageSlot(s, 0.4, svY - 0.02, 4.15, 5.98 - svY, "kkc_estimate",
    "Kokusai Kogyo: SAR damage-likelihood map (provisional). Sentinel-1 data from ESA processed by KKC",
    "国際航業：SAR衛星による被害状況推定図（速報版）。Sentinel-1 data from ESA processed by KKC");
  const rdRows = [[tableHeaderCell(TT("Aspect", "観点")), tableHeaderCell(TT("Reading", "読み方"))]];
  (sv.reading || []).forEach((r, i) => {
    const fill = i % 2 ? WHITE : LIGHT;
    rdRows.push([
      { text: r[1], options: { fontSize: 9, bold: true, color: NAVY, fill: { color: fill }, align: "left", valign: "middle", margin: 3 } },
      { text: TT(r[2], r[3], "\n"), options: { fontSize: 8.5, color: INK, fill: { color: fill }, align: "left", valign: "middle", margin: 3 } },
    ]);
  });
  s.addTable(rdRows, { x: 4.75, y: svY, w: 8.15, colW: [1.55, 6.60], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT,
    rowH: Math.max(0.30, Math.min(1.10, (5.94 - svY) / Math.max(1, rdRows.length))), valign: "middle" });
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 6.06, w: 12.5, h: 0.70, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.04 });
  s.addText([
    { text: sv.official_en + " ", options: { fontSize: 8, bold: true, color: "9A3B12" } },
    { text: sv.official_ja, options: { fontSize: 7.5, color: "7A2E0E" } },
  ], { x: 0.58, y: 6.08, w: 12.14, h: 0.66, align: "left", valign: "middle", fontFace: FONT, margin: 3 });
  srcLine(s, [
    { label: "Kokusai Kogyo / 国際航業", url: "https://www.kkc.co.jp/disaster/2026/07/%e4%bb%a4%e5%92%8c8%e5%b9%b4%e7%86%8a%e6%9c%ac%e5%9c%b0%e9%9c%87/" },
    linkBy("FDMA"),
    { label: "Kumamoto Pref. Disaster HQ / 熊本県災害対策本部", url: "https://www.pref.kumamoto.jp/soshiki/222/274487.html" },
  ]);
  footer(s);
}

/* ============ NEW 3/3: Free-of-charge services & citizen reporting ============ */
if (d.sat_services) {
  const ss = d.sat_services;
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Free-of-Charge Services & Citizen Reporting", "民間サービスの無償提供と市民からの通報");
  const ssH = Math.max(0.62, Math.min(1.10, estBi2(ss.intro_en, ss.intro_ja, 96, 48) * 0.165 + 0.12));
  s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 0.98, w: 12.5, h: ssH, fill: { color: "262626" }, line: { color: "262626", width: 1 }, rectRadius: 0.04 });
  s.addText([
    { text: ss.intro_en + "\n", options: { fontSize: 9.5, bold: true, color: "FFFFFF" } },
    { text: ss.intro_ja, options: { fontSize: 9, color: "E6E6E6" } },
  ], { x: 0.62, y: 1.01, w: 12.06, h: ssH - 0.06, align: "left", valign: "middle", fontFace: FONT, margin: 3 });
  const ssY = 0.98 + ssH + 0.10;
  const ssRows = [[tableHeaderCell(TT("Service", "サービス")), tableHeaderCell(TT("Since", "開始")), tableHeaderCell(TT("Content", "内容")), tableHeaderCell(TT("Tier", "区分"))]];
  (ss.rows || []).forEach((r, i) => {
    const fill = i % 2 ? WHITE : LIGHT;
    ssRows.push([
      { text: r[0], options: { fontSize: 9, bold: true, color: NAVY, fill: { color: fill }, align: "left", valign: "middle", margin: 3 } },
      { text: jaDate(r[1]), options: { fontSize: 8.5, color: INK, fill: { color: fill }, align: "center", valign: "middle", margin: 3 } },
      { text: TT(r[2], r[3], "\n"), options: { fontSize: 8.5, color: INK, fill: { color: fill }, align: "left", valign: "middle", margin: 3 } },
      { text: LX((TIER[r[4]] || TIER.tbc).ja, (TIER[r[4]] || TIER.tbc).en, (TIER[r[4]] || TIER.tbc).ja), options: { fontSize: 8.5, bold: true, color: tierColor(r[4]), fill: { color: fill }, align: "center", valign: "middle", margin: 3 } },
    ]);
  });
  const ssTblBottom = 3.72;
  s.addTable(ssRows, { x: 0.4, y: ssY, w: 12.5, colW: [2.95, 1.05, 7.55, 0.95], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT,
    rowH: Math.max(0.26, Math.min(0.80, (ssTblBottom - ssY) / Math.max(1, ssRows.length))), valign: "middle" });
  imageSlot(s, 0.4, 3.90, 6.15, 2.30, "sagri_ai65",
    "Sagri x Terra Labo: 65 damaged buildings extracted automatically (verified 2 Aug). Imagery by Terra Labo, building AI by Sagri, building map OpenStreetMap",
    "サグリ×テラ・ラボ：建物被害判定65棟を自動抽出（2026-08-02検証済み）。画像提供：テラ・ラボ、建物AI解析：サグリ、建物の地図：OpenStreetMap",
    "https://prtimes.jp/main/html/rd/p/000000190.000040885.html");
  imageSlot(s, 6.75, 3.90, 6.15, 2.30, "sagri_map2",
    "Sagri damage-information map: building-damage likelihood from Sentinel-1 over pre-event aerial photography, auto-refreshed every 10 minutes ((c)Sagri)",
    "サグリ 被害情報マップ：Sentinel-1による建造物被害の可能性を発災前の空中写真に重ねて表示。10分ごとに自動更新（©サグリ）",
    "https://kumamoto-quake-map.sagri.workers.dev/");
  if (ss.note_en) {
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 6.24, w: 12.5, h: 0.50, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.04 });
    s.addText([
      { text: ss.note_en + " ", options: { fontSize: 8, bold: true, color: "9A3B12" } },
      { text: ss.note_ja, options: { fontSize: 7.5, color: "7A2E0E" } },
    ], { x: 0.58, y: 6.26, w: 12.14, h: 0.46, align: "left", valign: "middle", fontFace: FONT, margin: 3 });
  }
  srcLine(s, [
    { label: "Sagri / サグリ", url: "https://prtimes.jp/main/html/rd/p/000000190.000040885.html" },
    { label: "Sagri Kumamoto Quake Map / 熊本地震マップ", url: "https://kumamoto-quake-map.sagri.workers.dev/" },
    { label: "WHERE", url: "https://prtimes.jp/main/html/rd/p/000000045.000146022.html" },
  ]);
  footer(s);
}

/* ============ Slide 12b: Disaster-information platform pages ============ */
(d.platform_pages || []).forEach(pf => {
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, pf.title_en, pf.title_ja);
  s.addText([
    { text: pf.intro_en + "\n", options: { fontSize: 11.5, color: INK } },
    { text: pf.intro_ja, options: { fontSize: 11, color: "444444" } },
  ], { x: 0.4, y: 1.12, w: 6.35, h: 1.30, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  const runs = [{ text: "Key points / 主な内容\n", options: { bold: true, fontSize: 12, color: NAVY } }];
  (pf.features || []).forEach(fe => {
    if (BI) {
      runs.push({ text: fe[0], options: { fontSize: 10.5, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 1 } });
      runs.push({ text: fe[1], options: { fontSize: 9.5, color: "444444", bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 2 } });
    } else {
      runs.push({ text: ENO ? fe[0] : fe[1], options: { fontSize: 11.5, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 3 } });
    }
  });
  s.addText(runs, { x: 0.4, y: 2.48, w: 6.35, h: 3.62, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  if (pf.note_en) {
    s.addShape(p.ShapeType.roundRect, { x: 0.4, y: 6.12, w: 6.35, h: 0.68, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 0.75 }, rectRadius: 0.04 });
    s.addText([
      { text: pf.note_en + "\n", options: { fontSize: 8.5, bold: true, color: "9A3B12" } },
      { text: pf.note_ja || "", options: { fontSize: 8, color: "7A2E0E" } },
    ], { x: 0.62, y: 6.19, w: 5.93, h: 0.54, align: "left", valign: "middle", fontFace: FONT, margin: 5 });
  }
  if (pf.layout === "double") {
    imageSlot(s, 6.9, 1.12, 6.0, 2.68, pf.key, pf.cap_en || pf.title_en, pf.cap_ja || pf.title_ja, pf.url);
    imageSlot(s, 6.9, 3.90, 6.0, 2.68, pf.key2, pf.cap2_en || "", pf.cap2_ja || "", pf.url);
  } else {
    imageSlot(s, 6.9, 1.12, 6.0, 5.35, pf.key, pf.cap_en || pf.title_en, pf.cap_ja || pf.title_ja, pf.url);
  }
  srcLine(s, [{ label: "NIED bosaiXview - 2026 Kumamoto Earthquake view / 防災クロスビュー", url: pf.url }]);
  footer(s);
});

/* ============ Slide 12b2: Civic-Tech Platform - Sagri Kumamoto Quake Map ============ */
{
  s = p.addSlide(); s.background = { color: WHITE };
  heading(s, "Civic-Tech Platform: Sagri Kumamoto Quake Map", "民間プラットフォーム：サグリ 熊本地震マップ");
  s.addText([
    { text: "A public-facing disaster map by Sagri Inc. (a Tamba City, Hyogo start-up), applying its satellite x AI x farmland-parcel technology to aggregate official announcements into \"what is usable, where\" and \"what is damaged, where\".\n", options: { fontSize: 12.5, color: INK } },
    { text: "兵庫県丹波市発のサグリ株式会社が、農業で培った「衛星×AI×区画解析」を防災に応用。公的発表を軸に「いま何がどこで使えるか」「どこで何が起きているか」を集約する住民向けマップ。", options: { fontSize: 11.5, color: "444444" } },
  ], { x: 0.4, y: 1.15, w: 6.35, h: 1.75, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  const sgRuns = [{ text: "Key features / 主な特徴\n", options: { bold: true, fontSize: 12, color: NAVY } }];
  [
    ["Life-Support Map: water, shelters, toilets, food, charging, fuel - each with status + last-checked time.", "生活支援MAP：給水・避難所・トイレ・食料・充電・燃料を、状態＋最終確認時刻つきで表示。"],
    ["Damage-Status Map: incidents by source type with photos; overlays GSI ortho-imagery and ALOS-2 SAR.", "被害状況MAP：出典種別ごとに写真付き。国土地理院の正射画像・だいち2号SARを重畳。"],
    ["Only three verified tiers: official (auto-extracted from FDMA/pref.) + media + AI-checked field photos; no unverified SNS.", "掲載は3種別のみ：公的（消防庁・県から自動抽出）＋報道＋AI確認の現地写真。未確認SNSは不採用。"],
    ["Auto-updated ~every 10 min; CSV/GeoJSON export; current location kept on-device (not sent).", "約10分ごと自動更新。CSV/GeoJSON出力。現在地は端末内のみ（送信しない）。"],
    ["Reference information only - for rescue/evacuation, follow municipal/police/fire instructions.", "参考情報の位置づけ。救助・避難は自治体・警察・消防の指示に従う。"],
  ].forEach(f => {
    if (BI) {
      sgRuns.push({ text: f[0], options: { fontSize: 11.5, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 1 } });
      sgRuns.push({ text: f[1], options: { fontSize: 10.5, color: "444444", bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 3 } });
    } else {
      sgRuns.push({ text: ENO ? f[0] : f[1], options: { fontSize: 12, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 4 } });
    }
  });
  s.addText(sgRuns, { x: 0.4, y: 3.0, w: 6.35, h: 3.5, align: "left", valign: "top", fontFace: FONT, margin: 4 });
  imageSlot(s, 6.9, 1.2, 6.0, 2.6, "sagri_life", "Life-Support Map ((c)Sagri)", "生活支援把握MAP（©サグリ）", "https://kumamoto-quake-map.sagri.workers.dev/");
  imageSlot(s, 6.9, 3.95, 6.0, 2.6, "sagri_damage", "Damage-Status Map ((c)Sagri)", "被害状況把握MAP（©サグリ）", "https://kumamoto-quake-map.sagri.workers.dev/");
  srcLine(s, [
    { label: "Sagri Kumamoto Quake Map / サグリ 熊本地震マップ", url: "https://kumamoto-quake-map.sagri.workers.dev/" },
    { label: "Sagri Inc. / サグリ株式会社", url: "https://sagri.tokyo/" },
  ]);
  footer(s);
}

/* ============ Slide 12c: Complementary Assessment - Spectee ============ */
s = p.addSlide(); s.background = { color: WHITE };
heading(s, "Complementary Assessment: Spectee (commercial)", "補完情報：Spectee（民間集約・AI/SNS）");
imageSlot(s, 0.4, 1.2, 7.4, 5.4, "spectee", "Spectee damage summary (©Spectee)", "Specteeによる被害まとめ（©Spectee）", "https://spectee.co.jp/report/reiwa8_kumamoto_earthquake/");
s.addShape(p.ShapeType.roundRect, { x: 8.0, y: 1.2, w: 4.9, h: 5.4, fill: { color: LIGHT }, line: { color: NAVY2, width: 1 }, rectRadius: 0.06 });
s.addText([
  { text: "About this source / 出典について\n", options: { bold: true, fontSize: 12.5, color: NAVY } },
  { text: "Spectee is a commercial disaster-intelligence firm fusing SNS, satellite and official data with AI. Tier: media / commercial — it complements, not replaces, official figures.\nSpecteeは民間の災害情報企業（SNS・衛星・公式をAIで統合）。ティアは報道／民間で、公式値を補完するもの。\n\n", options: { fontSize: 11, color: INK } },
  { text: "Casualties evolved over time / 死者数は時間とともに更新\n", options: { bold: true, fontSize: 12.5, color: "9A3B12" } },
  { text: "• FDMA 15th (29 Jul 11:00): 2 confirmed / 消防庁第15報 確認2\n• PM statement (29 Jul 08:30): ~13 incl. related / 首相発表 関連含め約13\n• FDMA 18th (30 Jul 06:30): 12 (Yatsushiro 8, Kashima 3, Kosa 1) / 消防庁第18報 12（八代8・嘉島3・甲佐1）\n", options: { fontSize: 11, color: INK } },
  { text: "The official (FDMA) count has now largely converged with the earlier higher estimates. A further 7 fire-HQ deaths remain under disaster-relation review. This report keeps the official (FDMA) figure as primary.\n公式（消防庁）値は先行の高い推計にほぼ収れん。消防本部情報の別途7人は関連死を調査中。本報告は公式を主とする。", options: { fontSize: 10.5, italic: true, color: MUTED } },
], { x: 8.2, y: 1.35, w: 4.5, h: 5.1, align: "left", valign: "top", fontFace: FONT, margin: 4 });
srcLine(s, [linkBy("Spectee")]);
footer(s);

/* ============ Slide 13: Useful Links & Sources (manually paginated) ============ */
{
  // rows/page — the table must stay clear of the footer under LibreOffice.
  // Single-language decks carry a shorter label column, so more rows fit.
  const LPER = BI ? 12 : 14, LPER0 = BI ? 12 : 13;   // page 1 also carries the policy note
  const lpages = [d.links.slice(0, LPER0)].concat(chunk(d.links.slice(LPER0), LPER)).filter(a => a.length);
  lpages.forEach((rows, pi) => {
    s = p.addSlide(); s.background = { color: WHITE };
    heading(s, "Useful Links & Sources" + (lpages.length > 1 ? ` (${pi + 1}/${lpages.length})` : ""),
      "有用リンク・出典" + (lpages.length > 1 ? `（${pi + 1}/${lpages.length}）` : ""));
    let tableY = 1.30;
    if (pi === 0) {
      s.addText([
        { text: TT("Source policy", "情報源方針", " / ") + ": ", options: { bold: true, fontSize: 12.5, color: NAVY } },
        { text: LX(d.source_policy_ja, d.source_policy_en, d.source_policy_ja), options: { fontSize: 12, color: "444444" } },
      ], { x: 0.4, y: 1.02, w: 12.5, h: 0.62, align: "left", valign: "top", fontFace: FONT, margin: 2 });
      tableY = 1.72;
    }
    const lfs = 10;
    const linkRows = [[tableHeaderCell("Source / 情報源"), tableHeaderCell(LX("Tier", "Tier", "出典区分")), tableHeaderCell("URL")]];
    rows.forEach((r, i) => linkRows.push([
      { text: r.label, options: { fontSize: lfs, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 3 } },
      { text: LX((TIER[r.tier] || TIER.tbc).ja, (TIER[r.tier] || TIER.tbc).en, (TIER[r.tier] || TIER.tbc).ja), options: { fontSize: lfs - 1, bold: true, color: tierColor(r.tier), fill: { color: i % 2 ? WHITE : LIGHT }, align: "center", valign: "middle", margin: 3 } },
      { text: r.url, options: { fontSize: lfs - 1.5, color: "0563C1", fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 3, hyperlink: { url: r.url } } },
    ]));
    s.addTable(linkRows, { x: 0.4, y: tableY, w: 12.5, colW: [4.6, 0.9, 7.0], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.38, valign: "middle" });
    footer(s);
  });
}

/* ============ Page numbers (added last, so the total is known) ============ */
{
  const slides = p.slides || [];
  const total = slides.length;
  slides.forEach((sl, i) => {
    // skip the cover page — numbering starts on the second slide but counts from 1
    if (i === 0) return;
    sl.addText(`${i + 1} / ${total}`, {
      x: 0.4, y: H - 0.36, w: 1.4, h: 0.26, align: "left", valign: "middle",
      color: MUTED, fontSize: 10, fontFace: FONT, margin: 0,
    });
  });
  console.log("page numbers added to", total - 1, "of", total, "slides");
}

p.writeFile({ fileName: OUT }).then(f => console.log("wrote", f));
