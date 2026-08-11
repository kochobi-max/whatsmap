/*
 * ADRC Disaster Report deck generator - 2026 Choco Earthquake (Colombia).
 *
 * Layout and chrome follow the published ADRC disaster reports
 * (2024 Noto Peninsula EQ, 2025 Mandalay EQ, 2026 Mindanao EQ, 2026 Kumamoto EQ):
 *   Basic Info -> Seismotectonics -> Overview & Response -> Chronology ->
 *   Affected areas -> Parameters & intensity -> Seismicity -> Damage ->
 *   National response -> International support -> Satellite EO ->
 *   DRM system -> Historical events -> Observations -> Links & Sources.
 *
 * Source hierarchy is shown per item via a tier badge:
 *   official > media > TBC.
 *
 * One language per file (the bilingual variant proved too long to be usable):
 *   LANG=en OUT=/path/out.pptx node scripts/gen_deck.js
 *   LANG=ja OUT=/path/out.pptx node scripts/gen_deck.js
 */
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const DATA = process.env.DATA || path.join(ROOT, "data", "report_data.json");
const LANGS = ["en", "ja", "es"];
const LANG = LANGS.find(l => (process.env.LANG_OUT || "en").toLowerCase().startsWith(l)) || "en";
const OUT = process.env.OUT || path.join(ROOT, "output", `ADRC_EQ_COL_Choco_20260810_${LANG.toUpperCase()}.pptx`);
const d = JSON.parse(fs.readFileSync(DATA, "utf8"));

const p = new pptxgen();
p.layout = "LAYOUT_WIDE";
const W = 13.33, H = 7.5;

const NAVY = "1F3864", NAVY2 = "2E5496", RED = "C00000";
const INK = "222222", MUTED = "6A6A6A", LINE = "D9D9D9", LIGHT = "EAF2F8", WHITE = "FFFFFF";
const ADRC_ORANGE = "E8A317";
// Meiryo for Japanese (aliased to an installed CJK face at PDF time); Cambria for English headings.
const FONT = LANG === "ja" ? "Meiryo" : "Calibri";
const SERIF = LANG === "ja" ? "Meiryo" : "Cambria";  // Spanish sets like English
let PAGE = 0;

const JA = LANG === "ja";
/** pick the language variant of a field pair (`foo_en` / `foo_ja`) */
function L(obj, key) {
  if (!obj) return "";
  const v = obj[key + "_" + LANG];
  if (v !== undefined && v !== null && v !== "") return v;
  const alt = obj[key + "_en"];
  return alt === undefined || alt === null ? (obj[key] || "") : alt;
}
/** pick from an object that has bare `en` / `ja` keys */
function LL(obj) { return obj ? (obj[LANG] || obj.en || "") : ""; }
const UI_ES = {
  "Sources: ": "Fuentes: ",
  "USGS PAGER Assessment": "Evaluación PAGER del USGS",
  "onePAGER, version 5 (public domain, USGS)": "onePAGER, versión 5 (dominio público, USGS)",
  "Population exposed by shaking level": "Población expuesta por nivel de sacudimiento",
  "Exposed": "Expuestos",
  "Perceived shaking": "Movimiento percibido",
  "GEM-TREQ City Profile: Cali": "Perfil de ciudad GEM-TREQ: Cali",
  "National seismic hazard, 475-year return period": "Amenaza sísmica nacional, periodo de retorno de 475 años",
  "PGA (g), SGC / GEM national seismic hazard model (2020)": "PGA (g), modelo nacional de amenaza sísmica SGC / GEM (2020)",
  "Response photographs": "Fotografías de la respuesta",
  "Homes damaged": "Viviendas afectadas",
  "Cali: municipal damage report": "Cali: reporte municipal de daños",
  "Item": "Ítem",
  "Reported": "Reportado",
  "Officials of the Alcaldía de Santiago de Cali. City figures; they are not a subset of any national cut-off.": "Funcionarios de la Alcaldía de Santiago de Cali. Son cifras de la ciudad; no son el desglose de ningún corte nacional.",
  "15,568": "15.568",
  "2,542": "2.542",
  "Pre-event Risk Assessment: Santiago de Cali": "Evaluación del riesgo previa al evento: Santiago de Cali",
  "Modelled scenario (GEM-TREQ, 2022)": "Escenario modelado (GEM-TREQ, 2022)",
  "Both agencies report a strike-slip mechanism.": "Ambas entidades reportan un mecanismo de falla de rumbo.",
  "Copernicus EMS Rapid Mapping: EMSR916": "Cartografía rápida del Copernicus EMS: EMSR916",
  "Activation page (© Copernicus EMS)": "Página de la activación (© Copernicus EMS)",
  "Item": "Ítem",
  "Activation reason (verbatim)": "Razón de la activación (textual)",
  "What Rapid Mapping delivers": "Qué entrega la cartografía rápida",
  "Macroseismic Intensity (SGC)": "Intensidad macrosísmica (SGC)",
  "Official SGC intensity map": "Mapa de intensidades del SGC",
  "Modified Mercalli scale (Worden et al., 2012), as printed on the SGC map": "Escala de Mercalli modificada (Worden et al., 2012), tal como aparece en el mapa del SGC",
  "SGC event ID": "ID del evento SGC",
  "stations": "estaciones",
  "Insert image before web release.": "Insertar la imagen antes de la publicación.",
  "Disaster Report": "Informe de desastre",
  "depth": "profundidad",
  "(1) World / Colombia": "(1) Mundo / Colombia",
  "(2) NW South America": "(2) Noroeste de Suramérica",
  "(3) Epicentre & affected cities": "(3) Epicentro y ciudades afectadas",
  "Locator maps © Google (Google Maps). Distances shown on later pages are computed from the published USGS coordinates.": "Mapas de localización © Google (Google Maps). Las distancias mostradas en páginas posteriores se calculan a partir de las coordenadas publicadas por el USGS.",
  "Overview   ": "Resumen   ",
  "Seismotectonic Setting: an intraslab earthquake": "Marco sismotectónico: un sismo intraplaca dentro de la losa",
  "Schematic cross-section (ADRC)": "Corte esquemático (ADRC)",
  "Overview of the Earthquake & Response Measures": "Resumen del sismo y medidas de respuesta",
  "Chronology of the Response (10-11 August)": "Cronología de la respuesta (10-11 de agosto)",
  "Times are Colombia time (COT, UTC-5). The earthquake occurred at 07:34 COT = 21:34 JST on 10 August.": "Las horas están en hora de Colombia (COT, UTC-5). El sismo ocurrió a las 07:34 COT = 21:34 JST del 10 de agosto.",
  "Time": "Hora",
  "Action": "Hecho",
  "Source": "Fuente",
  "Affected Departments & Cities": "Departamentos y ciudades afectados",
  "Epicentral distances (ADRC)": "Distancias epicentrales (ADRC)",
  "Why damage is dispersed": "Por qué los daños están dispersos",
  "A 110 km-deep source puts every city in the region at a broadly similar hypocentral distance (110-205 km), so no single city sits in a narrow zone of extreme shaking.": "Una fuente a 110 km de profundidad deja a todas las ciudades de la región a una distancia hipocentral parecida (110-205 km), de modo que ninguna queda dentro de una franja estrecha de sacudimiento extremo.",
  "Department": "Departamento",
  "Main cities": "Ciudades principales",
  "Dist.": "Dist.",
  "Situation": "Situación",
  "Event Parameters & Observed Shaking": "Parámetros del sismo y sacudimiento observado",
  "Origin time (local)": "Hora de origen (local)",
  "Origin time (UTC / JST)": "Hora de origen (UTC / JST)",
  "Epicentre": "Epicentro",
  "Coordinates": "Coordenadas",
  "Magnitude": "Magnitud",
  "Depth": "Profundidad",
  "Mechanism": "Mecanismo focal",
  "Max. shaking": "Sacudimiento máximo",
  "Felt area": "Área sentida",
  "Tsunami": "Tsunami",
  "Alert level": "Nivel de alerta",
  "Item": "Ítem",
  "Value": "Valor",
  "Distance vs. reported MMI (ADRC)": "Distancia frente a la MMI reportada (ADRC)",
  "People exposed": "Personas expuestas",
  "Population exposed by shaking level (millions, USGS PAGER)": "Población expuesta por nivel de sacudimiento (millones, PAGER del USGS)",
  "Seismicity: Aftershocks": "Sismicidad: réplicas",
  "Note": "Observación",
  "Tier": "Categoría",
  "Operational implication": "Implicación operativa",
  "Buildings that survived the mainshock in a damaged state have lost capacity. Even moderate aftershocks can bring them down, so rapid habitability assessment before re-occupancy - and keeping people out of visibly damaged structures - matters as much as the aftershock statistics themselves.": "Las edificaciones que sobrevivieron al sismo principal en estado averiado han perdido capacidad. Incluso réplicas moderadas pueden derribarlas, de modo que la evaluación rápida de habitabilidad antes de volver a ocuparlas —y mantener a la gente fuera de las estructuras visiblemente averiadas— importa tanto como las estadísticas de réplicas.",
  "Human Damage": "Afectación humana",
  "Deaths": "Muertos",
  "Injured": "Heridos",
  "Buildings damaged": "Edificaciones afectadas",
  "1,600+": "más de 1.600",
  "Reported deaths by department (provisional)": "Muertos reportados por departamento (provisional)",
  "Reading the numbers": "Cómo leer las cifras",
  "Damage: Buildings, Services & Lifelines": "Daños: edificaciones, servicios y líneas vitales",
  "All figures preliminary. Official (government) figures are primary; media-sourced items are labelled.": "Todas las cifras son preliminares. Las cifras oficiales (del Gobierno) son la fuente primaria; los datos de prensa están identificados.",
  "Reported": "Cifra reportada",
  "National Response": "Respuesta nacional",
  "Legal basis": "Fundamento jurídico",
  "The national disaster declaration activates the SNGRD established by Law 1523 of 2012, allowing UNGRD to direct resources and the national disaster fund (FNGRD) to be used without the ordinary procurement timelines.": "La declaratoria de desastre nacional activa el SNGRD creado por la Ley 1523 de 2012, lo que permite a la UNGRD dirigir recursos y usar el fondo nacional de gestión del riesgo (FNGRD) sin los plazos ordinarios de contratación.",
  "International Support": "Apoyo internacional",
  "Channelling": "Canalización",
  "Offers of assistance are to be channelled through Colombia's Ministry of Foreign Affairs together with UNGRD.": "Los ofrecimientos de ayuda se canalizan a través de la Cancillería de Colombia junto con la UNGRD.",
  "Satellite & Analytical Support": "Apoyo satelital y analítico",
  "Organisation": "Entidad",
  "Contribution": "Aporte",
  "Status": "Estado",
  "Note on Sentinel Asia": "Nota sobre Sentinel Asia",
  "Sentinel Asia, for which ADRC serves as a joint project team member, covers the Asia-Pacific region. For a disaster in Colombia the equivalent international mechanisms are the International Charter 'Space and Major Disasters' and the Copernicus Emergency Management Service; UNOSAT/UNITAR rapid mapping is also commonly used in Latin America.": "Sentinel Asia, en cuyo equipo conjunto de proyecto participa el ADRC, cubre la región de Asia y el Pacífico. Para un desastre en Colombia, los mecanismos internacionales equivalentes son la Carta Internacional «Espacio y Grandes Catástrofes» y el Servicio de Gestión de Emergencias Copernicus; en América Latina también se emplea con frecuencia la cartografía rápida de UNOSAT/UNITAR.",
  "Colombia's Disaster Risk Management System": "El sistema de gestión del riesgo de desastres de Colombia",
  "The 1999 Armenia (Quindío) Earthquake & Recovery": "El terremoto de Armenia (Quindío) de 1999 y la reconstrucción",
  "1999 impact": "Impacto en 1999",
  "Figure": "Cifra",
  "What followed / lessons": "Lo que siguió y las lecciones",
  "Why this matters now": "Por qué importa ahora",
  "Historical Earthquakes in Colombia": "Sismos históricos en Colombia",
  "Year": "Año",
  "Event": "Sismo",
  "Mag.": "Mag.",
  "Impact": "Impacto y rasgos",
  "Pattern": "Patrón",
  "Colombia's deadliest earthquakes have not been its largest. Popayán 1983 (M5.5), Páez 1994 (M6.8) and Armenia 1999 (M6.1-6.2) were all shallow and close to towns; the largest events, offshore in 1906 and 1979, killed fewer people. Depth and proximity, not magnitude alone, drive the toll.": "Los sismos más mortales de Colombia no han sido los de mayor magnitud. Popayán 1983 (M5.5), Páez 1994 (M6.8) y Armenia 1999 (M6.1-6.2) fueron someros y cercanos a los cascos urbanos; los eventos mayores, mar adentro en 1906 y 1979, dejaron menos víctimas. Lo que determina el saldo es la profundidad y la cercanía, no la magnitud por sí sola.",
  "Damage Photographs": "Registro fotográfico de daños",
  "Credit is shown with each photograph. Check reuse permission before public release.": "Cada fotografía lleva su crédito. Verificar la autorización de reutilización antes de la publicación.",
  "Observations & Points to Watch": "Observaciones y puntos por seguir",
  "Useful Links & Sources": "Enlaces útiles y fuentes",
  "Source policy: ": "Política de fuentes: "
};

// Short labels that live in the data (source names, statuses) rather than in the code.
const CELL = {
  "USGS / SGC": { ja: "USGS／SGC", es: "USGS / SGC" },
  "SGC": { ja: "SGC", es: "SGC" },
  "UNGRD": { ja: "UNGRD", es: "UNGRD" },
  "UNGRD / Presidency": { ja: "UNGRD／大統領府", es: "UNGRD / Presidencia" },
  "Mayor of Cali": { ja: "カリ市長", es: "Alcaldía de Cali" },
  "Mayor of Manizales": { ja: "マニサレス市長", es: "Alcaldía de Manizales" },
  "Aerocivil / media": { ja: "民間航空当局／報道", es: "Aerocivil / prensa" },
  "Government": { ja: "政府", es: "Gobierno" },
  "Presidency": { ja: "大統領府", es: "Presidencia" },
  "Presidency / UNGRD": { ja: "大統領府／UNGRD", es: "Presidencia / UNGRD" },
  "Presidency / local authorities": { ja: "大統領府／地元当局", es: "Presidencia / autoridades locales" },
  "11 Aug": { ja: "8月11日", es: "11 ago." },
  "11 Aug PM": { ja: "8月11日 午後", es: "11 ago. tarde" },
  "11 Aug 14:20 UTC": { ja: "8月11日 14:20 UTC", es: "11 ago. 14:20 UTC" },
  "Evening": { ja: "夕方", es: "Noche" },
  "International media": { ja: "国際報道", es: "Prensa internacional" },
  "Charter / Copernicus": { ja: "チャーター／コペルニクス", es: "Carta / Copernicus" },
  "Published": { ja: "公開済み", es: "Publicado" },
  "Ongoing (EMSR916)": { ja: "対応中（EMSR916）", es: "En curso (EMSR916)" },
  "Reported / number pending": { ja: "報道あり・番号未特定", es: "Reportada / número pendiente" },
  "Reported / confirming": { ja: "報道あり・確認中", es: "Reportado / en verificación" },
  "n/a": { ja: "対象外", es: "no aplica" },
  "Morning": { ja: "午前", es: "Mañana" },
  "Daytime": { ja: "日中", es: "Durante el día" },
  "Afternoon": { ja: "午後", es: "Tarde" },
  "Same day": { ja: "同日", es: "Mismo día" },
};
/** translate a short label that comes from the data; unknown labels pass through */
function C(v) {
  const e = CELL[v];
  return e && e[LANG] !== undefined ? e[LANG] : v;
}

/** UI label pairs; Spanish is looked up by the English string (see UI_ES) */
function T(en, ja) {
  if (JA) return ja;
  if (LANG === "es") return UI_ES[en] !== undefined ? UI_ES[en] : en;
  return en;
}

function today_ddmmyyyy() {
  const t = new Date(Date.now() + 9 * 3600 * 1000); // JST
  const z = n => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}/${z(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
}
const UPDATE_DATE = d.meta.update_date || process.env.UPDATE_DATE || today_ddmmyyyy();

/* ---------------- image helpers ---------------- */
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
function resolveImg(key) {
  if (key.startsWith("photo:")) {
    const f = path.join(ROOT, "images", key.slice(6));
    return fs.existsSync(f) ? f : null;
  }
  // hand-supplied images win over generated ones; a language-specific one wins over a shared one
  for (const stem of [key + "_manual_" + LANG, key + "_manual"]) {
    for (const ext of ["png", "jpg", "jpeg"]) {
      const m = path.join(ROOT, "images", stem + "." + ext);
      if (fs.existsSync(m)) return m;
    }
  }
  // language-specific variant of a generated figure (images/<key>_ja.png)
  const loc = path.join(ROOT, "images", key + "_" + LANG + ".png");
  if (fs.existsSync(loc)) return loc;
  const v = d.images && d.images[key];
  if (v) {
    const abs = path.isAbsolute(v) ? v : path.join(ROOT, v);
    if (fs.existsSync(abs)) return abs;
  }
  const conv = path.join(ROOT, "images", key + ".png");
  return fs.existsSync(conv) ? conv : null;
}

/* ---------------- source tiers ---------------- */
const TIER = {
  official: { en: "Official", ja: "公式", es: "Oficial", color: "1E7A34" },
  media: { en: "Media", ja: "報道", es: "Prensa", color: "B8860B" },
  tbc: { en: "TBC", ja: "確認中", es: "Por confirmar", color: "888888" },
};
function tierColor(t) { return (TIER[t] || TIER.tbc).color; }
function tierLabel(t) { const x = TIER[t] || TIER.tbc; return x[LANG] || x.en; }
function tierRun(t, size) {
  return { text: `[${tierLabel(t)}] `, options: { fontSize: size, bold: true, color: tierColor(t) } };
}

/* ---------------- text-fitting helpers ---------------- */
function vlen(s) { let n = 0; for (const ch of String(s)) n += /[^\x00-\xff]/.test(ch) ? 2 : 1; return n; }
function estLines(s, upl) { return String(s).split("\n").reduce((a, l) => a + Math.max(1, Math.ceil(vlen(l) / upl)), 0); }
function fitSize(strs, { base, min, upl, maxLines }) {
  const lines = (Array.isArray(strs) ? strs : [strs]).reduce((a, s) => a + estLines(s, upl), 0);
  if (lines <= maxLines) return base;
  return Math.max(min, Math.round((base * maxLines / lines) * 10) / 10);
}
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

/* ---------------- chrome ---------------- */
function logoPath() {
  for (const ext of ["png", "jpg", "jpeg", "gif"]) {
    const pth = path.join(ROOT, "images", "adrc_logo." + ext);
    if (fs.existsSync(pth)) return pth;
  }
  return null;
}
function logoMark(slide, x, y, w, h) {
  const img = logoPath();
  if (img) {
    let dw = w, dh = h, dx = x, dy = y;
    const sz = imgSize(img);
    if (sz && sz.w > 0 && sz.h > 0) {
      const k = Math.min(w / sz.w, h / sz.h);
      dw = sz.w * k; dh = sz.h * k; dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
    }
    slide.addImage({ path: img, x: dx, y: dy, w: dw, h: dh });
    return;
  }
  slide.addText("ADRC", { x, y, w, h, align: "right", valign: "middle", color: NAVY, bold: true, fontSize: 15, fontFace: SERIF, charSpacing: 2, margin: 0 });
}
function footer(slide) {
  PAGE += 1;
  const cw = 1.7, ch = 0.3, cx = W - 0.4 - cw, cy = H - 0.38;
  slide.addShape(p.ShapeType.rect, { x: cx, y: cy, w: cw, h: ch, fill: { color: ADRC_ORANGE }, line: { color: ADRC_ORANGE, width: 0 } });
  slide.addText(`ADRC  ${UPDATE_DATE}`, { x: cx, y: cy, w: cw, h: ch, align: "center", valign: "middle", color: "000000", bold: true, fontSize: 9.5, fontFace: FONT, margin: 0 });
  slide.addText(String(PAGE), { x: 0.4, y: H - 0.34, w: 0.6, h: 0.24, align: "left", color: MUTED, fontSize: 9, fontFace: FONT, margin: 0 });
}
function linkBy(sub) { return (d.links || []).find(l => (l.label_en || "").includes(sub)); }
function srcLine(slide, items) {
  items = (items || []).filter(Boolean);
  if (!items.length) return;
  const runs = [{ text: T("Sources: ", "出典："), options: { fontSize: 8.5, color: MUTED, bold: true } }];
  items.forEach((it, i) => {
    if (i) runs.push({ text: "   ·   ", options: { fontSize: 8.5, color: MUTED } });
    runs.push({ text: L(it, "label"), options: { fontSize: 8.5, color: "0563C1", hyperlink: { url: it.url } } });
  });
  slide.addText(runs, { x: 0.4, y: 6.86, w: 12.5, h: 0.24, align: "left", fontFace: FONT, margin: 0, valign: "middle" });
}
function heading(slide, en, ja, extra) {
  slide.addText(T(en, ja) + (extra || ""), {
    x: 0.4, y: 0.32, w: 11.3, h: 0.62, align: "left", margin: 0, valign: "middle",
    bold: true, color: NAVY, fontSize: JA ? 19 : 21, fontFace: SERIF, wrap: false, shrinkText: true,
  });
  logoMark(slide, W - 1.5, 0.08, 1.24, 0.96);
}
function subNote(slide, en, ja, y) {
  slide.addText(T(en, ja), { x: 0.4, y: y || 0.98, w: 12.5, h: 0.3, fontSize: 9.5, color: MUTED, italic: true, fontFace: FONT, valign: "top", margin: 0 });
}
function th(t) { return { text: t, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 11.5, align: "left", valign: "middle", margin: 4 } }; }
function td(t, i, opt) {
  return { text: t, options: Object.assign({ fontSize: 10, color: INK, fill: { color: i % 2 ? WHITE : LIGHT }, align: "left", valign: "middle", margin: 4 }, opt || {}) };
}
function imageSlot(slide, x, y, w, h, key, cap, url) {
  const img = resolveImg(key);
  if (img) {
    const iw = w, ih = h - (cap ? 0.24 : 0);
    let dw = iw, dh = ih, dx = x, dy = y;
    const sz = imgSize(img);
    if (sz && sz.w > 0 && sz.h > 0) { const k = Math.min(iw / sz.w, ih / sz.h); dw = sz.w * k; dh = sz.h * k; dx = x + (iw - dw) / 2; dy = y + (ih - dh) / 2; }
    slide.addImage({ path: img, x: dx, y: dy, w: dw, h: dh });
    if (cap) {
      const runs = [{ text: cap, options: { fontSize: 8, color: MUTED } }];
      if (url) runs.push({ text: "  —  " + url, options: { fontSize: 7, color: "0563C1", hyperlink: { url } } });
      slide.addText(runs, { x, y: y + h - 0.22, w, h: 0.22, align: "center", fontFace: FONT, margin: 0 });
    }
    return;
  }
  slide.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: LIGHT }, line: { color: NAVY2, width: 1, dashType: "dash" }, rectRadius: 0.06 });
  slide.addText(T("Insert image before web release.", "公開前に画像を挿入。"), { x: x + 0.15, y: y + 0.15, w: w - 0.3, h: h - 0.3, align: "center", valign: "middle", color: MUTED, italic: true, fontSize: 10, fontFace: FONT });
}
function bulletsTier(slide, x, y, w, h, items, opt) {
  opt = opt || {};
  const upl = Math.round(w * (JA ? 5.2 : 9.0)), maxLines = Math.floor(h / 0.24);
  const all = items.map(it => LL(it));
  const fsz = fitSize(all, { base: opt.base || 12, min: opt.min || 8.5, upl, maxLines });
  const bs = Math.max(7.5, fsz - 1);
  const runs = [];
  items.forEach(it => {
    runs.push(Object.assign(tierRun(it.tier, bs), { options: { fontSize: bs, bold: true, color: tierColor(it.tier), bullet: { code: "2022" } } }));
    runs.push({ text: LL(it), options: { fontSize: fsz, color: INK, breakLine: true, paraSpaceAfter: 5 } });
  });
  slide.addText(runs, { x, y, w, h, align: "left", valign: "top", fontFace: FONT, margin: 4 });
}
function plainBullets(slide, x, y, w, h, lines, opt) {
  opt = opt || {};
  const upl = Math.round(w * (JA ? 5.2 : 9.0)), maxLines = Math.floor(h / 0.24);
  const fsz = fitSize(lines, { base: opt.base || 11, min: opt.min || 8.5, upl, maxLines });
  const runs = lines.map(t => ({ text: t, options: { fontSize: fsz, color: INK, bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 5 } }));
  slide.addText(runs, { x, y, w, h, align: "left", valign: "top", fontFace: FONT, margin: 4 });
}
function noteBox(slide, x, y, w, h, title, body) {
  slide.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: "FCE9DC" }, line: { color: ADRC_ORANGE, width: 1 }, rectRadius: 0.05 });
  slide.addText([
    { text: title + "\n", options: { bold: true, fontSize: 10.5, color: "9A3B12" } },
    { text: body, options: { fontSize: 9.5, color: "7A2E0E" } },
  ], { x: x + 0.18, y: y + 0.06, w: w - 0.36, h: h - 0.12, align: "left", valign: "middle", fontFace: FONT, margin: 2 });
}
function newSlide() { const sl = p.addSlide(); sl.background = { color: WHITE }; return sl; }

let s;

/* ============ 1. Title / Basic information ============ */
s = newSlide();
logoMark(s, W - 1.48, 0.2, 1.24, 0.98);
s.addText(T("Disaster Report", "災害レポート"), { x: 0.4, y: 0.28, w: 6, h: 0.3, color: MUTED, fontSize: 11, italic: true, fontFace: FONT, valign: "middle" });
s.addText(L(d.meta, "title"), { x: 0.5, y: 0.62, w: 12.33, h: 0.62, align: "center", color: "111111", fontSize: JA ? 24 : 26, bold: true, fontFace: SERIF, valign: "middle" });
s.addText(L(d.meta, "subtitle"), { x: 0.5, y: 1.22, w: 12.33, h: 0.32, align: "center", color: INK, fontSize: 13, fontFace: FONT });
s.addText([
  { text: `${d.event.magnitude}   ·   ${T("depth", "深さ")} ${d.event.depth_km} km   ·   ${L(d.event, "max_intensity")}   ·   GLIDE ${d.meta.glide}`, options: { fontSize: 11.5, color: MUTED } },
], { x: 0.5, y: 1.54, w: 12.33, h: 0.3, align: "center", fontFace: FONT });
s.addShape(p.ShapeType.line, { x: 0.4, y: 1.92, w: W - 0.8, h: 0, line: { color: LINE, width: 1 } });

{
  const mapY = 2.12, mapH = 2.72, mapW = 4.06, gap = 0.28;
  const xs = [0.4, 0.4 + mapW + gap, 0.4 + 2 * (mapW + gap)];
  const seq = [
    { t: T("(1) World / Colombia", "①　世界とコロンビア"), key: "locator_world" },
    { t: T("(2) NW South America", "②　南米北西部"), key: "locator_region" },
    { t: T("(3) Epicentre & affected cities", "③　震央と主な被災都市"), key: "locator_epicentre" },
  ];
  seq.forEach((m, i) => {
    s.addText(m.t, { x: xs[i], y: mapY - 0.26, w: mapW, h: 0.24, align: "left", color: NAVY, bold: true, fontSize: 10, fontFace: FONT, margin: 0 });
    s.addShape(p.ShapeType.rect, { x: xs[i], y: mapY, w: mapW, h: mapH, fill: { color: "F7F7F7" }, line: { color: LINE, width: 0.75 } });
    imageSlot(s, xs[i] + 0.04, mapY + 0.04, mapW - 0.08, mapH - 0.08, m.key, null, null);
  });
  s.addText(T("Locator maps © Google (Google Maps). Distances shown on later pages are computed from the published USGS coordinates.",
    "位置図 © Google（Google マップ）。以降のページに示す距離は、USGS公表座標から計算したもの。"),
    { x: 0.4, y: mapY + mapH + 0.04, w: 12.5, h: 0.22, align: "left", color: MUTED, fontSize: 7.5, italic: true, fontFace: FONT, margin: 0 });
}
{
  const descY = 5.10, descH = 1.64, bw = 12.33, bh = descH - 0.18;
  s.addShape(p.ShapeType.rect, { x: 0, y: descY, w: W, h: descH, fill: { color: "262626" }, line: { width: 0 } });
  // characters per line differ by script, so calibrate the fit per language
  const sz = fitSize(L(d.event, "summary"), {
    base: JA ? 9.5 : 9.8, min: 8, upl: Math.round(bw * (JA ? 21 : 14.5)), maxLines: Math.floor(bh / 0.165),
  });
  s.addText([
    { text: T("Overview   ", "概要　　"), options: { bold: true, fontSize: 11.5, color: "FFC000" } },
    { text: L(d.event, "summary"), options: { fontSize: sz, color: "FFFFFF" } },
  ], { x: 0.5, y: descY + 0.09, w: bw, h: bh, align: "left", valign: "top", fontFace: FONT, margin: 3 });
}
srcLine(s, [linkBy("USGS - M 7.4"), linkBy("event bulletin"), linkBy("UNGRD"), { label_en: "Google Maps", label_ja: "Google マップ", label_es: "Google Maps", url: "https://www.google.com/maps/" }]);
footer(s);

/* ============ 2. Seismotectonic setting ============ */
s = newSlide();
heading(s, "Seismotectonic Setting: an intraslab earthquake", "地震テクトニクス：スラブ内地震");
imageSlot(s, 0.4, 1.12, 7.5, 3.5, "slab_section", T("Schematic cross-section (ADRC)", "模式断面図（ADRC作成）"), null);
s.addText(L(d.tectonics, "text"), { x: 0.4, y: 4.72, w: 6.2, h: 2.0, align: "left", valign: "top", fontFace: FONT, fontSize: JA ? 9.5 : 10, color: INK, margin: 4 });
imageSlot(s, 6.75, 4.74, 1.15, 1.38, "beachball", null, null);
s.addText([
  { text: L(d.mechanism_fig, "caption") + "\n", options: { fontSize: 7.5, color: MUTED, bold: true } },
  { text: T("Both agencies report a strike-slip mechanism.", "両機関とも横ずれ断層型としている。"), options: { fontSize: 7, color: MUTED } },
], { x: 6.5, y: 6.14, w: 1.65, h: 0.5, align: "center", valign: "top", fontFace: FONT, margin: 0 });
bulletsTier(s, 8.1, 1.12, 4.8, 5.6, d.tectonics.points, { base: 11.5 });
srcLine(s, [linkBy("USGS - M 7.4"), linkBy("event bulletin"), linkBy("GDACS")]);
footer(s);

/* ============ 3. Overview & response measures ============ */
s = newSlide();
heading(s, "Overview of the Earthquake & Response Measures", "地震の概要と対応措置");
s.addText([
  { text: `${L(d.event, "origin_time_short")}    |    ${d.event.magnitude}    |    ${T("depth", "深さ")} ${d.event.depth_km} km    |    ${L(d.event, "max_intensity")}`, options: { fontSize: 11.5, bold: true, color: NAVY } },
], { x: 0.4, y: 1.04, w: 12.5, h: 0.42, align: "left", fontFace: FONT, margin: 2 });
s.addText(L(d.meta, "as_of"), { x: 0.4, y: 1.46, w: 12.5, h: 0.3, fontSize: 9.5, color: MUTED, italic: true, fontFace: FONT, margin: 2 });
bulletsTier(s, 0.4, 1.82, 12.5, 4.86, d.response_measures, { base: 13.5 });
srcLine(s, [linkBy("UNGRD"), linkBy("Colombia One - Government"), linkBy("France 24")]);
footer(s);

/* ============ 4. Chronology of response ============ */
{
  const PER = 9;
  const pages = chunk(d.timeline, PER);
  pages.forEach((rows, pi) => {
    s = newSlide();
    const suffix = pages.length > 1 ? T(` (${pi + 1}/${pages.length})`, `（${pi + 1}/${pages.length}）`) : "";
    heading(s, "Chronology of the Response (10-11 August)", "対応の時系列（8月10〜11日）", suffix);
    subNote(s, "Times are Colombia time (COT, UTC-5). The earthquake occurred at 07:34 COT = 21:34 JST on 10 August.",
      "時刻はコロンビア時間（COT、UTC-5）。地震発生は8月10日07:34 COT＝同日21:34 JST。");
    const rowsT = [[th(T("Time", "時刻")), th(T("Action", "事項")), th(T("Source", "出典"))]];
    rows.forEach((r, i) => rowsT.push([
      td(C(r.time), i, { fontSize: 10, bold: true, color: NAVY, align: "center" }),
      td(LL(r), i, { fontSize: JA ? 9 : 9.5 }),
      td(C(r.src), i, { fontSize: 8.5, bold: true, color: tierColor(r.tier), align: "center" }),
    ]));
    s.addTable(rowsT, { x: 0.4, y: 1.34, w: 12.5, colW: [1.4, 9.1, 2.0], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.50, valign: "middle" });
    srcLine(s, [linkBy("USGS - M 7.4"), linkBy("UNGRD"), linkBy("CNN"), linkBy("Colombia One - First")]);
    footer(s);
  });
}

/* ============ 5. Affected departments ============ */
s = newSlide();
heading(s, "Affected Departments & Cities", "被災した県・都市");
imageSlot(s, 0.4, 1.12, 5.5, 4.4, "distance_map", T("Epicentral distances (ADRC)", "震央距離（ADRC作成）"), null);
noteBox(s, 0.4, 5.66, 5.5, 1.0,
  T("Why damage is dispersed", "被害が分散する理由"),
  T("A 110 km-deep source puts every city in the region at a broadly similar hypocentral distance (110-205 km), so no single city sits in a narrow zone of extreme shaking.",
    "震源が深さ110kmであるため、域内の都市はいずれも震源距離110〜205kmとほぼ同程度になり、極端に強い揺れが特定の都市に集中しない。"));
{
  const rows = [[th(T("Department", "県")), th(T("Main cities", "主な都市")), th(T("Dist.", "距離")), th("MMI"), th(T("Situation", "状況"))]];
  d.areas.forEach((a, i) => rows.push([
    td(L(a, "dept"), i, { fontSize: 9.5, bold: true, color: NAVY }),
    td(L(a, "city"), i, { fontSize: 9 }),
    td(a.dist, i, { fontSize: 8.5, align: "center" }),
    td(a.mmi, i, { fontSize: 9, align: "center", bold: true, color: RED }),
    td(L(a, "note"), i, { fontSize: 8.5 }),
  ]));
  s.addTable(rows, { x: 6.1, y: 1.12, w: 6.8, colW: [1.42, 1.26, 0.68, 0.62, 2.82], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.68, valign: "middle" });
}
srcLine(s, [linkBy("UNGRD"), linkBy("Colombia One - First"), linkBy("CBS News")]);
footer(s);

/* ============ 6. Event parameters & shaking ============ */
s = newSlide();
heading(s, "Event Parameters & Observed Shaking", "地震の諸元と観測された揺れ");
{
  const prm = [
    [T("Origin time (local)", "発生時刻（現地）"), L(d.event, "origin_time_local")],
    [T("Origin time (UTC / JST)", "発生時刻（UTC／JST）"), `${L(d.event, "origin_time_utc")}  /  ${L(d.event, "origin_time_jst")}`],
    [T("Epicentre", "震央"), L(d.event, "epicentre")],
    [T("Coordinates", "緯度経度"), `USGS ${d.event.lat} N, ${Math.abs(d.event.lon)} W   ·   SGC ${d.event.sgc.lat} N, ${Math.abs(d.event.sgc.lon)} W`],
    [T("Magnitude", "規模"), L(d.event, "magnitude_display")],
    [T("Depth", "深さ"), L(d.event, "depth_display")],
    [T("Mechanism", "発震機構"), L(d.event, "mechanism")],
    [T("Max. shaking", "最大の揺れ"), L(d.event, "max_intensity")],
    [T("Felt area", "有感範囲"), L(d.event, "felt")],
    [T("Tsunami", "津波"), L(d.event, "tsunami")],
    [T("Alert level", "警報レベル"), L(d.event, "alert")],
    ["GLIDE", d.meta.glide],
  ];
  s.addTable([[th(T("Item", "項目")), th(T("Value", "値"))]].concat(
    prm.map((r, i) => [td(r[0], i, { fontSize: 9.5, bold: true, color: NAVY }), td(r[1], i, { fontSize: 9.5 })])
  ), { x: 0.4, y: 1.12, w: 7.3, colW: [2.0, 5.3], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.36, valign: "middle" });
}
imageSlot(s, 7.9, 1.12, 5.0, 2.9, "mmi_distance", T("Distance vs. reported MMI (ADRC)", "距離と報告されたMMI（ADRC作成）"), null);
{
  const ex = d.exposure.filter(x => x.n > 0);
  s.addChart(p.ChartType.bar, [{ name: T("People exposed", "曝露人口"), labels: ex.map(x => "MMI " + x.mmi), values: ex.map(x => Math.round(x.n / 1000000 * 10) / 10) }], {
    x: 7.9, y: 4.12, w: 5.0, h: 2.1, barDir: "col", showTitle: true,
    title: T("Population exposed by shaking level (millions, USGS PAGER)", "揺れの強さ別の曝露人口（百万人、USGS PAGER）"),
    titleFontSize: 9.5, titleColor: NAVY, chartColors: [NAVY2], showLegend: false, showValue: true,
    dataLabelPosition: "outEnd", dataLabelFontSize: 8, catAxisLabelColor: MUTED, valAxisLabelColor: MUTED,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, valGridLine: { color: LINE, size: 0.5 }, catGridLine: { style: "none" },
  });
  s.addText(L(d, "exposure_note"), { x: 7.9, y: 6.24, w: 5.0, h: 0.56, fontSize: 7.5, color: MUTED, fontFace: FONT, valign: "top", margin: 0 });
}
s.addText(L(d, "param_note"), { x: 0.4, y: 6.50, w: 7.3, h: 0.34, fontSize: 6.8, color: MUTED, italic: true, fontFace: FONT, valign: "top", margin: 0 });
srcLine(s, [linkBy("USGS - M 7.4"), linkBy("event bulletin"), linkBy("GDACS")]);
footer(s);

/* ============ 6b. Macroseismic intensity (SGC ShakeMap) ============ */
if (d.intensity_map) {
  const im = d.intensity_map;
  s = newSlide();
  heading(s, "Macroseismic Intensity (SGC)", "体感震度分布（SGC）");
  imageSlot(s, 0.4, 1.12, 5.7, 5.3, "sgc_shakemap",
    T("Official SGC intensity map", "SGC 公式の震度分布図") + "  (© SGC)", im.url);
  s.addText(L(im, "stamp"), { x: 6.4, y: 1.12, w: 6.5, h: 0.62, fontSize: 8, color: MUTED, fontFace: FONT, valign: "top", margin: 0 });
  s.addText(L(im, "text"), { x: 6.4, y: 1.80, w: 6.5, h: 1.68, fontSize: JA ? 9.5 : 10, color: INK, fontFace: FONT, valign: "top", margin: 0 });
  {
    const hd = JA ? im.scale_header_ja : (LANG === "es" ? im.scale_header_es : im.scale_header_en);
    const rows = [hd.map(th)];
    im.scale.forEach((r, i) => rows.push([
      td(r.mmi, i, { fontSize: 9, bold: true, color: NAVY, align: "center" }),
      td(L(r, "shake"), i, { fontSize: 8.5 }),
      td(L(r, "dmg"), i, { fontSize: 8.5 }),
      td(r.pga, i, { fontSize: 8.5, align: "center" }),
      td(r.pgv, i, { fontSize: 8.5, align: "center" }),
    ]));
    s.addTable(rows, { x: 6.4, y: 3.56, w: 6.5, colW: [0.72, 1.72, 1.66, 1.2, 1.2],
      border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.28, valign: "middle" });
    s.addText(T("Modified Mercalli scale (Worden et al., 2012), as printed on the SGC map",
      "改正メルカリ震度階（Worden et al., 2012）。SGCの図に掲載されているもの。"),
      { x: 6.4, y: 6.42, w: 6.5, h: 0.22, fontSize: 7.5, color: MUTED, italic: true, fontFace: FONT, margin: 0 });
  }
  srcLine(s, [linkBy("macroseismic intensity map"), linkBy("event bulletin"), linkBy("USGS - M 7.4")]);
  footer(s);
}

/* ============ 8b. USGS PAGER assessment ============ */
if (d.pager) {
  const pg = d.pager;
  s = newSlide();
  heading(s, "USGS PAGER Assessment", "USGS PAGERによる影響評価");
  imageSlot(s, 0.4, 1.12, 5.5, 5.3, "usgs_pager",
    T("onePAGER, version 5 (public domain, USGS)", "onePAGER 第5版（USGS、パブリックドメイン）"), pg.url);
  s.addText(L(pg, "text"), { x: 6.2, y: 1.12, w: 6.7, h: 2.15, fontSize: JA ? 9.5 : 10, color: INK, fontFace: FONT, valign: "top", margin: 0 });
  {
    const rows = [[th("MMI"), th(T("Perceived shaking", "体感")), th(T("Exposed", "曝露人口"))]];
    d.exposure.forEach((x, i) => rows.push([
      td(x.mmi, i, { fontSize: 10, bold: true, color: NAVY, align: "center" }),
      td(L(x, "label"), i, { fontSize: 9.5 }),
      td(x.n ? (Math.round(x.n / 1000).toLocaleString("en-US") + "k") : "-", i, { fontSize: 9.5, align: "right" }),
    ]));
    s.addTable(rows, { x: 6.2, y: 3.42, w: 6.7, colW: [1.0, 3.3, 2.4], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.34, valign: "middle" });
  }
  s.addText(L(d, "exposure_note"), { x: 6.2, y: 5.56, w: 6.7, h: 0.6, fontSize: 7.5, color: MUTED, fontFace: FONT, valign: "top", margin: 0 });
  srcLine(s, [linkBy("USGS - M 7.4"), linkBy("GDACS")]);
  footer(s);
}

/* ============ 7. Seismicity / aftershocks ============ */
s = newSlide();
heading(s, "Seismicity: Aftershocks", "地震活動：余震");
{
  const rows = [[th(T("Time", "時刻")), th(T("Magnitude", "規模")), th(T("Note", "備考")), th(T("Tier", "区分"))]];
  d.aftershocks.rows.forEach((r, i) => rows.push([
    td(r.when, i, { fontSize: 10, bold: true, color: NAVY }),
    td(r.mag, i, { fontSize: 11, bold: true, color: RED, align: "center" }),
    td(LL(r) || L(r, "note"), i, { fontSize: 10 }),
    td(tierLabel(r.tier), i, { fontSize: 9, bold: true, color: tierColor(r.tier), align: "center" }),
  ]));
  s.addTable(rows, { x: 0.4, y: 1.12, w: 12.5, colW: [2.6, 1.5, 7.2, 1.2], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.46, valign: "middle" });
}
s.addText(L(d.aftershocks, "note"), { x: 0.4, y: 3.62, w: 7.3, h: 1.78, fontSize: JA ? 9 : 9.5, color: INK, fontFace: FONT, valign: "top", margin: 0 });
imageSlot(s, 7.62, 3.50, 5.3, 1.86, "aftershock_counts", L(d.aftershocks, "fig_caption"), null);
noteBox(s, 0.4, 5.40, 12.5, 0.86, L(d.aftershocks, "spread_title"), L(d.aftershocks, "spread"));
s.addText(L(d.aftershocks, "query"), { x: 0.4, y: 6.26, w: 12.5, h: 0.38, fontSize: 7, color: MUTED, italic: true, fontFace: FONT, valign: "top", margin: 0 });
srcLine(s, [linkBy("Servicio Geológico"), linkBy("Semana"), linkBy("El Tiempo — 99"), linkBy("USGS - M 7.4")]);
footer(s);

/* ============ 8. Human damage ============ */
s = newSlide();
heading(s, "Human Damage", "人的被害");
{
  const big = [
    [T("Deaths", "死者"), "182", RED],
    [T("Injured", "負傷者"), T("2,542", "2,542"), "9A3B12"],
    [T("Homes damaged", "住宅被害"), T("15,568", "15,568棟"), NAVY],
  ];
  big.forEach((b, i) => {
    const x = 0.4 + i * 4.2;
    s.addShape(p.ShapeType.roundRect, { x, y: 1.1, w: 3.95, h: 1.25, fill: { color: LIGHT }, line: { color: LINE, width: 1 }, rectRadius: 0.06 });
    s.addText(b[0], { x: x + 0.15, y: 1.18, w: 3.65, h: 0.32, fontSize: 11, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText(b[1], { x: x + 0.15, y: 1.46, w: 3.65, h: 0.8, fontSize: 34, bold: true, color: b[2], fontFace: SERIF, margin: 0, valign: "middle" });
  });
}
s.addText(L(d, "toll_caption"), { x: 0.4, y: 2.36, w: 12.5, h: 0.2, fontSize: 7.5, color: MUTED, italic: true, fontFace: FONT, valign: "top", margin: 0 });
{
  const rows = d.deaths_by_area;
  s.addChart(p.ChartType.bar, [{ name: T("Deaths", "死者"), labels: rows.map(r => L(r, "area")), values: rows.map(r => r.n) }], {
    x: 0.4, y: 2.6, w: 6.6, h: 2.86, barDir: "bar", showTitle: true,
    title: T("Reported deaths by department (provisional)", "県別の死者数（暫定）"),
    titleFontSize: 10.5, titleColor: NAVY, chartColors: [RED], showLegend: false, showValue: true,
    dataLabelPosition: "outEnd", dataLabelFontSize: 9, catAxisLabelColor: INK, valAxisLabelColor: MUTED,
    catAxisLabelFontSize: JA ? 8 : 9, valAxisLabelFontSize: 8, valGridLine: { color: LINE, size: 0.5 }, catGridLine: { style: "none" },
  });
  const rowsT = [[th(T("Department", "県")), th(T("Deaths", "死者")), th(T("Note", "備考"))]];
  rows.forEach((r, i) => rowsT.push([
    td(L(r, "area"), i, { fontSize: 10 }),
    td(String(r.n), i, { fontSize: 11, bold: true, color: RED, align: "center" }),
    td(L(r, "note"), i, { fontSize: 9, color: MUTED }),
  ]));
  s.addTable(rowsT, { x: 7.2, y: 2.6, w: 5.7, colW: [2.15, 1.05, 2.5], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.44, valign: "middle" });
}
noteBox(s, 0.4, 5.72, 12.5, 1.06, T("Reading the numbers", "数値の読み方"), L(d, "deaths_by_area_note"));
srcLine(s, [linkBy("UNGRD balance"), linkBy("RPP"), linkBy("El Tiempo"), linkBy("Asocapitales")]);
footer(s);

/* ============ 8c. Cali municipal damage report ============ */
if (d.cali) {
  const c = d.cali;
  s = newSlide();
  heading(s, "Cali: municipal damage report", "カリ市：市当局の被害報告");
  subNote(s, "Officials of the Alcaldía de Santiago de Cali. City figures; they are not a subset of any national cut-off.",
    "サンティアゴ・デ・カリ市職員による。市単位の数値であり、全国集計のある時点の内訳ではない。");
  const tone = { RED: RED, AMBER: "9A3B12", NAVY: NAVY };
  c.tiles.forEach((tl, i) => {
    const x = 0.4 + i * 3.16;
    s.addShape(p.ShapeType.roundRect, { x, y: 1.34, w: 2.95, h: 1.16, fill: { color: LIGHT }, line: { color: LINE, width: 1 }, rectRadius: 0.06 });
    s.addText(L(tl, "label"), { x: x + 0.14, y: 1.40, w: 2.67, h: 0.3, fontSize: 10.5, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText(tl.n, { x: x + 0.14, y: 1.66, w: 2.67, h: 0.76, fontSize: 30, bold: true, color: tone[tl.colour], fontFace: SERIF, margin: 0, valign: "middle" });
  });
  {
    const rows = [[th(T("Item", "項目")), th(T("Reported", "報告値"))]];
    c.rows.forEach((r, i) => rows.push([
      td(L(r, "item"), i, { fontSize: 10.5, bold: true, color: NAVY }),
      td(r.n, i, { fontSize: 12, bold: true, color: RED, align: "right" }),
    ]));
    s.addTable(rows, { x: 0.4, y: 2.68, w: 6.3, colW: [4.7, 1.6], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.46, valign: "middle" });
  }
  noteBox(s, 7.0, 2.68, 5.9, 2.16, L(c, "read_title"), L(c, "read"));
  s.addText(L(c, "note"), { x: 7.0, y: 5.00, w: 5.9, h: 1.1, fontSize: JA ? 9.5 : 10, color: INK, fontFace: FONT, valign: "top", margin: 0 });
  s.addText(L(c, "source"), { x: 0.4, y: 6.5, w: 12.5, h: 0.26, fontSize: 7.5, color: MUTED, italic: true, fontFace: FONT, valign: "top", margin: 0 });
  srcLine(s, [linkBy("Alcaldía de Santiago de Cali"), linkBy("El Tiempo"), linkBy("UNGRD")]);
  footer(s);
}

/* ============ 9. Damage to buildings, lifelines and services ============ */
{
  const PER = 8;
  const pages = chunk(d.damage, PER);
  pages.forEach((rows, pi) => {
    s = newSlide();
    const suffix = pages.length > 1 ? T(` (${pi + 1}/${pages.length})`, `（${pi + 1}/${pages.length}）`) : "";
    heading(s, "Damage: Buildings, Services & Lifelines", "被害状況：建物・公共サービス・ライフライン", suffix);
    subNote(s, "All figures preliminary. Official (government) figures are primary; media-sourced items are labelled.",
      "すべて速報値。公式（政府）値を主とし、報道由来の項目は区分を明示している。");
    const rowsT = [[th(T("Item", "項目")), th(T("Reported", "報告値")), th(T("Source", "出典")), th(T("Tier", "区分"))]];
    rows.forEach((r, i) => rowsT.push([
      td(L(r, "item"), i, { fontSize: 10, bold: true, color: NAVY }),
      td(L(r, "value"), i, { fontSize: JA ? 9 : 9.5 }),
      td(L(r, "source"), i, { fontSize: 8.5, color: MUTED }),
      td(tierLabel(r.tier), i, { fontSize: 8.5, bold: true, color: tierColor(r.tier), align: "center" }),
    ]));
    s.addTable(rowsT, { x: 0.4, y: 1.34, w: 12.5, colW: [2.1, 6.6, 2.7, 1.1], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.55, valign: "middle" });
    srcLine(s, [linkBy("UNGRD"), linkBy("Colombia One - First"), linkBy("CNN")]);
    footer(s);
  });
}

/* ============ 10. National response ============ */
s = newSlide();
heading(s, "National Response", "国内の対応");
bulletsTier(s, 0.4, 1.12, (d.response_photos || []).length ? 7.5 : 12.5, 4.4, d.support_domestic, { base: 13 });
(d.response_photos || []).forEach((ph, i) => {
  const y = 1.12 + i * 2.35;
  imageSlot(s, 8.15, y, 4.75, 2.2, "photo:" + ph.file,
    [L(ph, "caption"), ph.credit].filter(Boolean).join("   "), ph.url || null);
});
noteBox(s, 0.4, 5.7, 12.5, 1.0, T("Legal basis", "法的根拠"),
  T("The national disaster declaration activates the SNGRD established by Law 1523 of 2012, allowing UNGRD to direct resources and the national disaster fund (FNGRD) to be used without the ordinary procurement timelines.",
    "国家災害宣言により、2012年法律第1523号に基づくSNGRDが起動する。これによりUNGRDが資源配分を指揮でき、国家防災基金（FNGRD）を通常の調達手続によらず活用できる。"));
srcLine(s, [linkBy("UNGRD"), linkBy("Colombia One - Government"), linkBy("PreventionWeb")]);
footer(s);

/* ============ 11. International support ============ */
s = newSlide();
heading(s, "International Support", "国際的な支援");
bulletsTier(s, 0.4, 1.12, 12.5, 5.0, d.support_international, { base: 13 });
noteBox(s, 0.4, 6.2, 12.5, 0.52, T("Channelling", "受け入れ窓口"),
  T("Offers of assistance are to be channelled through Colombia's Ministry of Foreign Affairs together with UNGRD.",
    "支援の申し出は、コロンビア外務省とUNGRDを通じて受け入れることとされている。"));
srcLine(s, [linkBy("International Charter"), linkBy("Copernicus"), linkBy("ReliefWeb")]);
footer(s);

/* ============ 12. Satellite / EO support ============ */
s = newSlide();
heading(s, "Satellite & Analytical Support", "衛星・解析による支援");
{
  const rows = [[th(T("Organisation", "機関")), th(T("Contribution", "内容")), th(T("Status", "状況")), th(T("Tier", "区分"))]];
  d.satellite.forEach((r, i) => rows.push([
    td(r.org, i, { fontSize: 10, bold: true, color: NAVY }),
    td(LL(r), i, { fontSize: 9.5 }),
    td(C(r.status), i, { fontSize: 9, align: "center" }),
    td(tierLabel(r.tier), i, { fontSize: 8.5, bold: true, color: tierColor(r.tier), align: "center" }),
  ]));
  s.addTable(rows, { x: 0.4, y: 1.12, w: 12.5, colW: [2.2, 6.9, 2.3, 1.1], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.62, valign: "middle" });
}
noteBox(s, 0.4, 5.66, 12.5, 1.04, T("Note on Sentinel Asia", "センチネルアジアについて"),
  T("Sentinel Asia, for which ADRC serves as a joint project team member, covers the Asia-Pacific region. For a disaster in Colombia the equivalent international mechanisms are the International Charter 'Space and Major Disasters' and the Copernicus Emergency Management Service; UNOSAT/UNITAR rapid mapping is also commonly used in Latin America.",
    "ADRCが共同プロジェクトチームとして参画するセンチネルアジアはアジア太平洋地域を対象としている。コロンビアの災害では、これに相当する国際的枠組みは国際災害チャーター（Space and Major Disasters）とコペルニクス緊急管理サービスであり、中南米ではUNOSAT／UNITARのラピッドマッピングも広く用いられる。"));
srcLine(s, [linkBy("International Charter"), linkBy("Copernicus"), linkBy("GDACS")]);
footer(s);

/* ============ 12b. Copernicus EMS EMSR916 ============ */
if (d.emsr916) {
  const em = d.emsr916;
  s = newSlide();
  heading(s, "Copernicus EMS Rapid Mapping: EMSR916", "コペルニクスEMS ラピッドマッピング：EMSR916");
  imageSlot(s, 0.4, 1.12, 7.5, 5.3, "emsr916", T("Activation page (© Copernicus EMS)", "発動ページ（© Copernicus EMS）"), em.url);
  {
    const rows = [[th(T("Item", "項目")), th(T("Value", "値"))]];
    em.rows.forEach((r, i) => rows.push([
      td(JA ? r.k_ja : (LANG === "es" ? r.k_es : r.k_en), i, { fontSize: 9.5, bold: true, color: NAVY }),
      td(r.v, i, { fontSize: 9.5 }),
    ]));
    s.addTable(rows, { x: 8.1, y: 1.12, w: 4.8, colW: [1.7, 3.1], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.36, valign: "middle" });
  }
  s.addText([
    { text: T("Activation reason (verbatim)", "発動理由（原文）") + "\n", options: { bold: true, fontSize: 9.5, color: NAVY } },
    { text: L(em, "reason"), options: { fontSize: JA ? 8.5 : 9, color: INK, italic: true } },
  ], { x: 8.1, y: 4.42, w: 4.8, h: 1.6, align: "left", valign: "top", fontFace: FONT, margin: 0 });
  noteBox(s, 8.1, 6.06, 4.8, 0.62, T("What Rapid Mapping delivers", "ラピッドマッピングの内容"), L(em, "note"));
  srcLine(s, [linkBy("EMSR916"), linkBy("European Commission")]);
  footer(s);
}

/* ============ 13. Colombia's DRM system ============ */
s = newSlide();
heading(s, "Colombia's Disaster Risk Management System", "コロンビアの災害リスク管理体制");
s.addText(L(d.drm_system, "intro"), { x: 0.4, y: 1.12, w: 12.5, h: 0.95, fontSize: JA ? 10.5 : 11.5, color: INK, fontFace: FONT, valign: "top", margin: 4 });
plainBullets(s, 0.4, 2.14, 12.5, 4.5, d.drm_system.items.map(LL), { base: 11.5 });
srcLine(s, [linkBy("UN-SPIDER"), linkBy("Plan Nacional de Gestión"), linkBy("Decreto 1478"), linkBy("SATIC")]);
footer(s);

/* ============ 14. Prior event: 1999 Armenia ============ */
s = newSlide();
heading(s, "The 1999 Armenia (Quindío) Earthquake & Recovery", "1999年アルメニア（キンディオ）地震と復興");
s.addText([
  { text: L(d.prior_event, "title") + "\n", options: { bold: true, fontSize: 12, color: NAVY } },
  { text: L(d.prior_event, "overview"), options: { fontSize: JA ? 10 : 10.5, color: INK } },
], { x: 0.4, y: 1.12, w: 6.4, h: 1.95, align: "left", valign: "top", fontFace: FONT, margin: 4 });
{
  const rows = [[th(T("1999 impact", "1999年の被害")), th(T("Figure", "数値"))]];
  d.prior_event.stats.forEach((r, i) => rows.push([td(L(r, "item"), i, { fontSize: 10 }), td(L(r, "value"), i, { fontSize: 9.5 })]));
  s.addTable(rows, { x: 0.4, y: 3.14, w: 6.4, colW: [2.7, 3.7], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.42, valign: "middle" });
}
{
  const lines = JA ? d.prior_event.lessons_ja : d.prior_event.lessons_en;
  s.addText(T("What followed / lessons", "その後と教訓"), { x: 7.0, y: 1.12, w: 5.9, h: 0.3, bold: true, fontSize: 12, color: NAVY, fontFace: FONT, margin: 4 });
  plainBullets(s, 7.0, 1.44, 5.9, 4.3, lines, { base: 11 });
}
noteBox(s, 0.4, 5.86, 12.5, 0.82, T("Why this matters now", "現在の意味"), L(d.prior_event, "context"));
srcLine(s, [linkBy("GEM"), linkBy("PreventionWeb")]);
footer(s);

/* ============ 14b. Pre-event risk assessment (Cali) ============ */
if (d.pre_event) {
  const pe2 = d.pre_event;
  s = newSlide();
  heading(s, "Pre-event Risk Assessment: Santiago de Cali", "事前のリスク評価：サンティアゴ・デ・カリ");
  s.addText(L(pe2, "intro"), { x: 0.4, y: 1.08, w: 6.3, h: 1.15, fontSize: JA ? 9.5 : 10, color: INK, fontFace: FONT, valign: "top", margin: 0 });
  {
    const rows = [[th(T("Modelled scenario (GEM-TREQ, 2022)", "想定シナリオ（GEM-TREQ、2022年）")), th(T("Value", "値"))]];
    pe2.rows.forEach((r, i) => rows.push([
      td(JA ? r.k_ja : (LANG === "es" ? r.k_es : r.k_en), i, { fontSize: 9.5, bold: true, color: NAVY }),
      td(L(r, "v"), i, { fontSize: 9.5 }),
    ]));
    s.addTable(rows, { x: 0.4, y: 2.34, w: 6.3, colW: [2.3, 4.0], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.33, valign: "middle" });
  }
  s.addText(L(pe2, "credit"), { x: 0.4, y: 5.32, w: 6.3, h: 0.38, fontSize: 6.8, color: MUTED, italic: true, fontFace: FONT, valign: "top", margin: 0 });
  s.addText(L(pe2, "measures_title"), { x: 6.9, y: 1.08, w: 6.0, h: 0.28, bold: true, fontSize: 11.5, color: NAVY, fontFace: FONT, margin: 0 });
  plainBullets(s, 6.9, 1.4, 6.0, 4.24, pe2.measures.map(LL), { base: 10.5 });
  noteBox(s, 0.4, 5.74, 12.5, 0.94, L(pe2, "compare_title"), L(pe2, "compare"));
  srcLine(s, [linkBy("TREQ project"), linkBy("technical report D2.6.2"), linkBy("Alcaldía de Santiago de Cali")]);
  footer(s);
}

/* ============ 14c. GEM-TREQ city profile ============ */
if (d.pre_event && resolveImg("gem_treq_cali")) {
  s = newSlide();
  heading(s, "GEM-TREQ City Profile: Cali", "GEM-TREQ カリ市プロファイル");
  imageSlot(s, 1.15, 1.06, 11.0, 5.0, "gem_treq_cali", "© GEM Foundation / USAID / Alcaldía de Santiago de Cali / USGS", d.pre_event.url || "https://github.com/gem/treq-riesgo-urbano");
  s.addText(L(d.pre_event, "profile_caption"), { x: 1.15, y: 6.12, w: 11.0, h: 0.6, fontSize: JA ? 8.5 : 9, color: INK, fontFace: FONT, valign: "top", align: "left", margin: 0 });
  srcLine(s, [linkBy("technical report D2.6.2"), linkBy("TREQ project")]);
  footer(s);
}

/* ============ 15. Historical earthquakes ============ */
s = newSlide();
heading(s, "Historical Earthquakes in Colombia", "コロンビアの主な地震（歴史）");
{
  const rows = [[th(T("Year", "年")), th(T("Event", "地震")), th(T("Mag.", "規模")), th(T("Impact", "被害・特徴"))]];
  d.historical.forEach((r, i) => rows.push([
    td(r.year, i, { fontSize: 10, bold: true, color: NAVY, align: "center" }),
    td(L(r, "event"), i, { fontSize: 9 }),
    td(r.mag, i, { fontSize: 9.5, bold: true, color: RED, align: "center" }),
    td(L(r, "note"), i, { fontSize: 8.5 }),
  ]));
  s.addTable(rows, { x: 0.4, y: 1.12, w: 8.6, colW: [0.8, 2.5, 0.8, 4.5], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.40, valign: "middle" });
}
imageSlot(s, 9.2, 1.12, 3.7, 3.9, "sgc_hazard",
  T("PGA (g), SGC / GEM national seismic hazard model (2020)", "PGA（g）、SGC／GEM 国家地震ハザードモデル（2020年）"),
  "https://amenazasismica.sgc.gov.co/");
s.addText(T("National seismic hazard, 475-year return period", "全国地震ハザード（再現期間475年）"),
  { x: 9.2, y: 5.08, w: 3.7, h: 0.5, fontSize: 8.5, bold: true, color: NAVY, fontFace: FONT, align: "center", valign: "top", margin: 0 });
noteBox(s, 0.4, 5.72, 8.6, 0.96, T("Pattern", "傾向"),
  T("Colombia's deadliest earthquakes have not been its largest. Popayán 1983 (M5.5), Páez 1994 (M6.8) and Armenia 1999 (M6.1-6.2) were all shallow and close to towns; the largest events, offshore in 1906 and 1979, killed fewer people. Depth and proximity, not magnitude alone, drive the toll.",
    "コロンビアで最も多くの死者を出した地震は、最大規模の地震ではない。1983年ポパヤン（M5.5）、1994年パエス（M6.8）、1999年アルメニア（M6.1〜6.2）はいずれも浅く市街地に近かった。一方、規模の大きい1906年・1979年の海域地震の死者はより少ない。被害を決めるのは規模だけでなく、深さと震源の近さである。"));
srcLine(s, [linkBy("USGS - M 7.4"), linkBy("Servicio Geológico"), linkBy("GEM Foundation")]);
footer(s);

/* ============ 15b. Photographs (only if data.photos has entries) ============ */
if ((d.photos || []).length) {
  const PER = 6;
  chunk(d.photos, PER).forEach((rows, pi, pages) => {
    s = newSlide();
    const suffix = pages.length > 1 ? T(` (${pi + 1}/${pages.length})`, `（${pi + 1}/${pages.length}）`) : "";
    heading(s, "Damage Photographs", "被害状況写真", suffix);
    subNote(s, "Credit is shown with each photograph. Check reuse permission before public release.",
      "各写真にクレジットを表示。公開前に二次利用の可否を確認すること。");
    const xs = [0.4, 4.72, 9.04], ys = [1.34, 4.06], cw = 3.9, ch = 2.6;
    rows.forEach((ph, i) => {
      const x = xs[i % 3], y = ys[Math.floor(i / 3)];
      const cap = [L(ph, "caption"), ph.credit].filter(Boolean).join("   ");
      imageSlot(s, x, y, cw, ch, "photo:" + ph.file, cap, ph.url || null);
    });
    footer(s);
  });
}

/* ============ 16. Observations ============ */
s = newSlide();
heading(s, "Observations & Points to Watch", "所見と今後の注目点");
bulletsTier(s, 0.4, 1.12, 12.5, 5.6, d.observations, { base: 13 });
srcLine(s, [linkBy("UNGRD"), linkBy("USGS - M 7.4"), linkBy("ReliefWeb")]);
footer(s);

/* ============ 17. Links & sources ============ */
{
  // The first page carries the source-policy block, so it holds one row fewer.
  const pages = [];
  for (let i = 0; i < d.links.length; ) {
    const n = pages.length === 0 ? 15 : 17;
    pages.push(d.links.slice(i, i + n));
    i += n;
  }
  pages.forEach((rows, pi) => {
    s = newSlide();
    const suffix = pages.length > 1 ? T(` (${pi + 1}/${pages.length})`, `（${pi + 1}/${pages.length}）`) : "";
    heading(s, "Useful Links & Sources", "有用リンク・出典", suffix);
    if (pi === 0) {
      s.addText([
        { text: T("Source policy: ", "情報源方針："), options: { bold: true, fontSize: 9.5, color: NAVY } },
        { text: L(d, "source_policy"), options: { fontSize: 9, color: "444444" } },
      ], { x: 0.4, y: 1.0, w: 12.5, h: 0.62, align: "left", valign: "top", fontFace: FONT, margin: 2 });
    }
    const rowsT = [[th(T("Source", "情報源")), th(T("Tier", "区分")), th("URL")]];
    rows.forEach((r, i) => rowsT.push([
      td(L(r, "label"), i, { fontSize: 9.5 }),
      td(tierLabel(r.tier), i, { fontSize: 8.5, bold: true, color: tierColor(r.tier), align: "center" }),
      td(r.url, i, { fontSize: 8, color: "0563C1", hyperlink: { url: r.url } }),
    ]));
    s.addTable(rowsT, { x: 0.4, y: pi === 0 ? 1.68 : 1.12, w: 12.5, colW: [4.6, 0.9, 7.0], border: { type: "solid", color: LINE, pt: 0.5 }, fontFace: FONT, rowH: 0.32, valign: "middle" });
    footer(s);
  });
}

/* ============ 18. Back page ============ */
s = newSlide();
logoMark(s, (W - 2.2) / 2, 2.4, 2.2, 1.4);
s.addText(L(d.meta, "prepared_by"), { x: 0.5, y: 3.95, w: 12.33, h: 0.4, align: "center", fontSize: 15, bold: true, color: NAVY, fontFace: SERIF });
s.addText(L(d.meta, "disseminate"), { x: 2.0, y: 4.4, w: 9.33, h: 0.8, align: "center", fontSize: 10.5, color: MUTED, fontFace: FONT });
s.addText(L(d.meta, "as_of"), { x: 2.0, y: 5.2, w: 9.33, h: 0.5, align: "center", fontSize: 9.5, color: MUTED, italic: true, fontFace: FONT });
s.addText("https://www.adrc.asia/", { x: 0.5, y: 5.8, w: 12.33, h: 0.3, align: "center", fontSize: 10, color: "0563C1", fontFace: FONT, hyperlink: { url: "https://www.adrc.asia/" } });
footer(s);

p.writeFile({ fileName: OUT }).then(f => console.log("wrote", f, `(${PAGE} pages, ${LANG})`));
