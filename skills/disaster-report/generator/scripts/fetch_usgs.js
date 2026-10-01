#!/usr/bin/env node
/*
 * fetch_usgs.js — USGS の地震イベントを機械的に取る。
 *
 *   node fetch_usgs.js us6000tjl2
 *   node fetch_usgs.js us6000tjl2 --json
 *   node fetch_usgs.js us6000tjl2 --download images/EQ-2026-000146-COL
 *
 * 取れるもの:
 *   震源要素（M・深さ・緯度経度・発生時刻）、PAGER警報レベルと版、
 *   最大MMI、体感報告数、余震予測(OAF)、発震機構、そして**図**。
 *
 * --download で、PAGER の alertfatal.png（推定死者数・経済損失）と
 * ShakeMap の intensity.jpg を指定フォルダへ保存する。
 * 手で拾って manual と名付けたファイルを置く必要がなくなる。
 *
 * **なぜ自前で叩くのか**: WebFetch はこの環境の egress 許可リストを
 * 見ておらず届かない（references/environment.md）。curl なら通る。
 *
 * 2026-08-28。この実装時点で、コロンビアの PAGER 警報は **red** に
 * 上がっていた（レポート本文は orange のままだった）。**版と警報レベルは
 * 改訂されるので、毎回取り直して突き合わせること。**
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const id = args.find(a => !a.startsWith("--"));
if (!id) { console.error("usage: fetch_usgs.js <eventid> [--json] [--download <dir>]"); process.exit(2); }
const asJson = args.includes("--json");
const di = args.indexOf("--download");
const outDir = di >= 0 ? args[di + 1] : null;

const curl = (u, bin) => execFileSync("curl",
  ["-sS", "-L", "--max-time", "120", "-A", "ADRC-disaster-report", u],
  bin ? { maxBuffer: 128 * 1024 * 1024, encoding: "buffer" }
      : { maxBuffer: 128 * 1024 * 1024, encoding: "utf8" });

let ev;
try {
  ev = JSON.parse(curl("https://earthquake.usgs.gov/fdsnws/event/1/query?eventid="
    + encodeURIComponent(id) + "&format=geojson"));
} catch (e) {
  console.error("USGS: FAIL 取得できない — " + String(e.message).slice(0, 160));
  console.error("check_sources.js で earthquake.usgs.gov の到達を確認する。");
  process.exit(7);
}

const P = ev.properties, C = ev.geometry.coordinates;
const prod = k => (P.products && P.products[k] && P.products[k][0]) || null;
const pager = prod("losspager"), shake = prod("shakemap"), mt = prod("moment-tensor"), oaf = prod("oaf");

// PAGER の警報は「人的被害」と「経済損失」の2本立てで、表に出るのは高い方。
// 本文で「オレンジ警報」とだけ書くと、経済損失が赤に上がっていても気づけない。
// 2026-08-28、コロンビアが実際にこの状態だった（人的=orange、経済=red）。
let alerts = null;
if (pager && pager.contents["json/alerts.json"]) {
  try {
    const a = JSON.parse(curl(pager.contents["json/alerts.json"].url));
    alerts = {};
    for (const k of Object.keys(a)) if (a[k] && a[k].level) alerts[k] = a[k].level;
  } catch (e) { /* 取れなければ全体レベルだけで進む */ }
}

const out = {
  id: ev.id,
  title: P.title,
  magnitude: P.mag, magType: P.magType,
  lon: C[0], lat: C[1], depth_km: C[2],
  origin_utc: new Date(P.time).toISOString().replace("T", " ").slice(0, 19) + " UTC",
  place: P.place,
  pager_alert: P.alert || (pager && pager.properties.alertlevel) || null,
  pager_alert_by_type: alerts,
  max_mmi: P.mmi != null ? P.mmi : (pager ? Number(pager.properties.maxmmi) : null),
  felt_reports: P.felt, cdi: P.cdi,
  tsunami: P.tsunami === 1,
  url: P.url,
  pager_url: P.url + "/pager",
  shakemap_url: P.url + "/shakemap",
  updated: {
    pager: pager ? new Date(pager.updateTime).toISOString().slice(0, 19).replace("T", " ") + " UTC" : null,
    shakemap: shake ? new Date(shake.updateTime).toISOString().slice(0, 19).replace("T", " ") + " UTC" : null,
    oaf: oaf ? new Date(oaf.updateTime).toISOString().slice(0, 19).replace("T", " ") + " UTC" : null,
  },
  moment_tensor: mt ? {
    derived_magnitude: mt.properties["derived-magnitude"],
    derived_magnitude_type: mt.properties["derived-magnitude-type"],
    derived_depth_km: mt.properties["derived-depth"],
    status: mt.properties["evaluation-status"],
  } : null,
};

if (asJson) { console.log(JSON.stringify(out, null, 2)); }
else {
  console.log("USGS " + out.id + "  " + out.title);
  console.log("  規模      " + out.magnitude + " " + (out.magType || ""));
  console.log("  深さ      " + out.depth_km + " km   " + out.lat + ", " + out.lon);
  console.log("  発生      " + out.origin_utc);
  const by = out.pager_alert_by_type;
  console.log("  PAGER     " + (out.pager_alert || "—")
    + (by ? "（人的 " + (by.fatality || "—") + " / 経済 " + (by.economic || "—") + "）" : "")
    + "   最終更新 " + (out.updated.pager || "—"));
  console.log("  最大MMI   " + (out.max_mmi != null ? out.max_mmi : "—")
            + "   体感報告 " + (out.felt_reports != null ? out.felt_reports : "—"));
  console.log("  津波      " + (out.tsunami ? "あり" : "なし"));
  if (out.moment_tensor) console.log("  発震機構  " + out.moment_tensor.derived_magnitude_type
    + " " + out.moment_tensor.derived_magnitude + "  深さ " + out.moment_tensor.derived_depth_km + " km");
  console.log("  " + out.url);
}

// 手で保存した <key>_manual.* があると、resolveImg はそちらを最優先する
// （自動取得で上書きしない、という規約）。**黙って隠れると版ずれに気づけない。**
// 2026-08-28、第5版の手動ファイルが第7版の自動取得を隠していた。
function warnShadow(dir, key) {
  for (const ext of ["png", "jpg", "jpeg"]) {
    const m = path.join(dir, key + "_manual." + ext);
    if (fs.existsSync(m)) {
      console.error("  ⚠ " + path.basename(m) + " が残っています。");
      console.error("    手動ファイルが最優先されるため、いま保存した図はデッキに出ません。");
      console.error("    古いものなら削除してください。");
    }
  }
}

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const want = [];
  // 一枚図（onepager.pdf）を優先する。alertfatal.png は死者数のヒストグラムだけで、
  // 曝露人口・都市・過去地震が載らない。PDFは poppler で1ページ目を画像にする。
  if (pager && pager.contents["onepager.pdf"]) {
    const pdf = path.join(outDir, "_usgs_onepager.pdf");
    try {
      fs.writeFileSync(pdf, curl(pager.contents["onepager.pdf"].url, true));
      execFileSync("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "1", pdf,
        path.join(outDir, "usgs_pager")], { stdio: ["ignore", "ignore", "ignore"] });
      const made = fs.readdirSync(outDir).find(f => /^usgs_pager-0?1\.png$/.test(f));
      if (made) fs.renameSync(path.join(outDir, made), path.join(outDir, "usgs_pager.png"));
      fs.unlinkSync(pdf);
      console.log("  保存 " + path.join(outDir, "usgs_pager.png") + "  (onepager 1ページ目)");
      warnShadow(outDir, "usgs_pager");
    } catch (e) {
      console.error("  ✗ onepager を画像にできない: " + String(e.message).slice(0, 90));
      if (pager.contents["alertfatal.png"]) want.push(["usgs_pager.png", pager.contents["alertfatal.png"].url]);
    }
  } else if (pager && pager.contents["alertfatal.png"]) {
    want.push(["usgs_pager.png", pager.contents["alertfatal.png"].url]);
  }
  if (shake && shake.contents["download/intensity.jpg"])
    want.push(["usgs_shakemap.jpg", shake.contents["download/intensity.jpg"].url]);
  if (!want.length && !fs.existsSync(path.join(outDir, "usgs_pager.png"))) {
    console.error("  （落とせる図が見つからない）"); process.exit(0);
  }
  for (const [name, url] of want) {
    const dest = path.join(outDir, name);
    try {
      fs.writeFileSync(dest, curl(url, true));
      console.log("  保存 " + dest + "  " + Math.round(fs.statSync(dest).size / 1024) + "KB");
      warnShadow(outDir, name.replace(/\.[a-z]+$/, ""));
    } catch (e) { console.error("  ✗ " + name + " を保存できない: " + String(e.message).slice(0, 100)); }
  }
}
