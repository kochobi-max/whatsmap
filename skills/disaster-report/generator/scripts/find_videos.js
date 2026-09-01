#!/usr/bin/env node
/*
 * find_videos.js — 災害の様子が分かる動画の候補を集めて、人が選べる形に並べる。
 *
 *   node find_videos.js <GLIDE> [--limit 12] [--all]
 *
 * **これは候補を出すだけの道具である。載せるものを決めるのは人。**
 *
 * なぜ機械に選ばせないか
 * ---------------------
 * 動画は中身を見ないと本物か分からないが、**クラウドのセッションは動画を再生できない。**
 * 読めるのは題名・チャンネル名・公開日・説明文だけである。
 * 災害の映像は、別の災害の映像が題名だけ差し替えられて出回ることが日常的に起きる。
 * とくに「衝撃」「BIBLICAL」のような題名を付ける無署名の集約チャンネルは、
 * 出所を書かずに他所の映像を使う。所内メールに貼れば ADRC の名前で回る。
 *
 * そこで、選別は**中身ではなく出所**で行う。
 * `references/sources/_video.md` の「載せてよい媒体」に載っているチャンネルだけを
 * `OK` とし、それ以外は `要確認` として、人が見るまでメールに入れない。
 *
 * 出力の最後に、そのままメールへ貼れるHTMLの断片を出す。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const glide = process.argv[2];
const args = process.argv.slice(3);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LIMIT = parseInt(opt("limit", "12"), 10);
const SHOW_ALL = args.includes("--all");

if (!glide) {
  console.error("usage: find_videos.js <GLIDE> [--limit 12] [--all]");
  process.exit(2);
}
const evPath = path.join(ROOT, "events", glide + ".json");
if (!fs.existsSync(evPath)) { console.error("イベントが無い: " + evPath); process.exit(2); }
const ev = JSON.parse(fs.readFileSync(evPath, "utf8"));

// ── 載せてよい媒体 ──────────────────────────────────────────
// 編集責任がはっきりしている先だけ。ここに無いものは人が見るまで載せない。
const TRUSTED_FILE = path.join(ROOT, "references", "sources", "_video.md");
// 見出しごとに読む。「載せてよいドメイン」の節はドメイン、それ以外の節はチャンネル名。
function loadTrusted() {
  const domains = [], channels = [];
  if (!fs.existsSync(TRUSTED_FILE)) return { domains, channels };
  let inDomains = false;
  for (const line of fs.readFileSync(TRUSTED_FILE, "utf8").split("\n")) {
    if (/^##\s/.test(line)) { inDomains = /載せてよいドメイン/.test(line); continue; }
    const m = /^\s*[-*]\s*`([^`]+)`/.exec(line);
    if (!m) continue;
    (inDomains ? domains : channels).push(m[1].trim().toLowerCase());
  }
  return { domains, channels };
}
const TRUSTED = loadTrusted();
const isTrusted = ch => {
  const c = String(ch || "").toLowerCase();
  return TRUSTED.channels.some(t => c === t || c.includes(t));
};
// ドメインは末尾一致。aljazeera.com は www.aljazeera.com にも当たるが、
// evil-aljazeera.com には当たらない（"." を挟んで見る）。
const trustedDomain = host => {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  return TRUSTED.domains.find(d => h === d || h.endsWith("." + d)) || null;
};

function curl(url) {
  return execFileSync("curl", ["-sS", "--max-time", "60", "--compressed",
    "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    url], { encoding: "latin1", maxBuffer: 96 * 1024 * 1024 });
}
function utf8(s) { return Buffer.from(s, "latin1").toString("utf8"); }

// ── 報道の動画ページを検証する ────────────────────────────
// URLを渡すと、実際に取得して次を確かめる。
//   1. 200 で返ること（貼ってから切れているリンクを出さない）
//   2. ドメインが _video.md の「載せてよいドメイン」にあること
//   3. JSON-LD に "@type":"VideoObject" があること
//      = そのページが自分で「これは動画である」と名乗っていること
// 題名と公開日時は、こちらで書き写さずページ自身の値を使う。
function verifyPage(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return { url, ok: false, why: "URLとして読めない" }; }
  const dom = trustedDomain(host);
  if (!dom) return { url, host, ok: false, why: "_video.md の載せてよいドメインに無い" };

  let html, code;
  try {
    html = execFileSync("curl", ["-sS", "--max-time", "40", "--compressed", "-L",
      "-w", "\n@@HTTP@@%{http_code}",
      "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      url], { encoding: "latin1", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return { url, host, ok: false, why: "取得できない — " + String(e.message).slice(0, 90) };
  }
  const cm = /@@HTTP@@(\d{3})\s*$/.exec(html);
  code = cm ? cm[1] : "???";
  if (code !== "200") return { url, host, ok: false, why: "HTTP " + code };

  // JSON-LD を全部拾って VideoObject を探す
  let vo = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>(.*?)<\/script>/gs)) {
    let j; try { j = JSON.parse(utf8(m[1])); } catch { continue; }
    const walk = n => {
      if (vo || !n || typeof n !== "object") return;
      if (Array.isArray(n)) { for (const x of n) walk(x); return; }
      if (n["@type"] === "VideoObject") { vo = n; return; }
      for (const k of Object.keys(n)) walk(n[k]);
    };
    walk(j);
    if (vo) break;
  }
  if (!vo) return { url, host, ok: false, why: "動画ページではない（VideoObject が無い）" };

  // 媒体名は、ページが名乗るものを優先する。メールには "aljazeera.com" ではなく
  // "Al Jazeera" と出したい。VideoObject の publisher → og:site_name → ドメインの順。
  let pub = vo.publisher && (vo.publisher.name || vo.publisher);
  if (typeof pub !== "string" || !pub.trim()) {
    const om = /<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/i.exec(html)
            || /<meta[^>]+content="([^"]+)"[^>]+property="og:site_name"/i.exec(html);
    pub = om ? utf8(om[1]) : dom;
  }
  return {
    url, host, ok: true, domain: dom,
    title: String(vo.name || "").trim(),
    date: String(vo.uploadDate || vo.datePublished || "").slice(0, 10),
    publisher: String(pub).trim(),
    description: String(vo.description || "").trim()
  };
}

// ── YouTube ────────────────────────────────────────────────
// 検索結果ページの初期HTMLに ytInitialData が埋まっている。JSは要らない。
function youtube(query) {
  let html;
  try {
    html = curl("https://www.youtube.com/results?search_query=" + encodeURIComponent(query)
                + "&sp=CAI%253D");   // 新しい順
  } catch (e) {
    return { blocked: true, err: String(e.message).slice(0, 120), items: [] };
  }
  const m = /ytInitialData\s*=\s*(\{.*?\});<\/script>/s.exec(html);
  if (!m) return { blocked: false, err: "ytInitialData が見つからない（仕様変更の可能性）", items: [] };
  let data;
  try { data = JSON.parse(utf8(m[1])); } catch (e) { return { blocked: false, err: "JSON 解析不能", items: [] }; }

  const items = [];
  const walk = n => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    const v = n.videoRenderer;
    if (v && v.videoId) {
      const txt = o => (o && (o.simpleText || (o.runs || []).map(r => r.text).join(""))) || "";
      items.push({
        id: v.videoId,
        title: txt(v.title),
        channel: txt(v.ownerText) || txt(v.longBylineText),
        published: txt(v.publishedTimeText),
        length: txt(v.lengthText),
        url: "https://www.youtube.com/watch?v=" + v.videoId
      });
    }
    for (const k of Object.keys(n)) walk(n[k]);
  };
  walk(data);
  return { blocked: false, err: null, items };
}

// ── X（アカウントの最新のみ。検索も遡りもできない） ────────────
function xLatest(handle) {
  let html;
  try { html = curl("https://x.com/" + handle); }
  catch (e) { return { blocked: true, err: String(e.message).slice(0, 120), items: [] }; }
  const items = [];
  // 投稿IDごとに、その媒体エントリに video_info が入っているかを見る
  for (const m of html.matchAll(/VHdlZXQ6(\d{15,25})/g)) { /* base64 内の id は下で拾う */ }
  const ids = new Set();
  for (const m of html.matchAll(/([A-Za-z0-9+/=]{20,})/g)) {
    let d; try { d = Buffer.from(m[1], "base64").toString("ascii"); } catch { continue; }
    const mm = /^(?:Note)?Tweet:(\d{15,25})$/.exec(d);
    if (mm) ids.add(mm[1]);
  }
  for (const id of ids) {
    const key = Buffer.from("Tweet:" + id).toString("base64").replace(/=+$/, "");
    const i = html.indexOf(key);
    if (i < 0) continue;
    const near = html.slice(i, i + 6000);
    const hasVideo = /video_info:\s*\{/.test(near) || /"type":"video"/.test(near);
    if (!hasVideo) continue;
    items.push({ id, url: "https://x.com/" + handle + "/status/" + id, channel: "@" + handle });
  }
  return { blocked: false, err: null, items };
}

// ── --verify: URLを渡して検証だけする ─────────────────────
const verifyUrls = args.filter(a => /^https?:\/\//.test(a));
if (verifyUrls.length) {
  console.log("── 参考映像の検証  " + glide + "  " + (ev.meta.title_ja || ""));
  console.log("");
  const okv = [], ngv = [];
  for (const u of verifyUrls) { const r = verifyPage(u); (r.ok ? okv : ngv).push(r); }
  for (const r of okv) {
    console.log("   OK   " + r.url);
    console.log("        " + r.title);
    console.log("        " + r.publisher + "  /  公開 " + r.date);
  }
  for (const r of ngv) console.log("   NG   " + r.url + "\n        " + r.why);
  console.log("");
  if (okv.length) {
    console.log("── メールに貼るHTML（そのままコピーしてよい）");
    console.log("<p><b>参考映像（所内限り。外部への転載は不可）</b></p>");
    console.log("<p>各報道機関が公開しているものへのリンクです。ADRCが撮影・検証したものでは");
    console.log("ありません。媒体名と公開日は各ページの表示によります。レポート本体には含めていません。</p>");
    console.log("<ul>");
    for (const r of okv) {
      const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      console.log('<li><a href="' + r.url + '">' + esc(r.title) + "</a><br/>"
        + esc(r.publisher) + "、" + r.date + "</li>");
    }
    console.log("</ul>");
    console.log("");
  }
  console.log("STATUS: VERIFY  OK " + okv.length + "件 / NG " + ngv.length + "件");
  process.exit(ngv.length && !okv.length ? 1 : 0);
}

// ── 検索語 ────────────────────────────────────────────────
const queries = (ev.meta && ev.meta.video_queries) || [
  [ev.meta.title_en, "footage"].filter(Boolean).join(" "),
  [ev.meta.title_en, "video"].filter(Boolean).join(" ")
];
const handles = (ev.meta && ev.meta.video_handles) || [];

console.log("── 動画候補  " + glide + "  " + (ev.meta.title_ja || ""));
console.log("   検索語: " + queries.join(" ／ "));
console.log("   載せてよい媒体の一覧: " + (TRUSTED.length ? TRUSTED.length + "件（_video.md）" : "**未設定** → 全件が要確認になる"));
console.log("");

const seen = new Set();
const rows = [];
let blockedHosts = [];

for (const q of queries) {
  const r = youtube(q);
  if (r.blocked) { blockedHosts.push("www.youtube.com"); console.log("   YouTube: 到達できない — " + r.err); break; }
  if (r.err) { console.log("   YouTube: " + r.err); break; }
  for (const it of r.items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    rows.push({ ...it, source: "YouTube", ok: isTrusted(it.channel) });
  }
}
for (const h of handles) {
  const r = xLatest(h);
  if (r.blocked) { blockedHosts.push("x.com"); console.log("   X: 到達できない — " + r.err); break; }
  // 0件でも黙らない。X はログイン壁で最新10件程度しか返らないため、
  // 「動画付きの投稿が無い」ではなく「見えている範囲に無い」が正しい。
  console.log("   X @" + h + ": 見えている範囲に動画付きの投稿 " + r.items.length + "件"
    + (r.items.length ? "" : "（ログイン壁のため最新10件程度しか見えない。無いとは限らない）"));
  for (const it of r.items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    rows.push({ ...it, title: "(X の投稿。本文は fetch_x.js で読む)", published: "", length: "",
                source: "X", ok: isTrusted(it.channel) });
  }
}

const okRows = rows.filter(r => r.ok).slice(0, LIMIT);
const chk = rows.filter(r => !r.ok).slice(0, LIMIT);

const show = (label, list) => {
  console.log("── " + label + "（" + list.length + "件）");
  if (!list.length) { console.log("   なし"); console.log(""); return; }
  for (const r of list) {
    console.log("   " + r.url);
    console.log("     " + (r.title || "").slice(0, 100));
    console.log("     " + [r.channel, r.published, r.length, r.source].filter(Boolean).join("  /  "));
  }
  console.log("");
};

show("載せてよい媒体", okRows);
if (SHOW_ALL || !okRows.length) {
  show("要確認（_video.md に無い媒体。人が見るまでメールに入れない）", chk);
}

if (okRows.length) {
  console.log("── メールに貼るHTML（そのままコピーしてよい）");
  console.log("<p><b>参考映像（外部配布不可）</b></p>");
  console.log("<p>下記は各媒体が公開しているものへのリンクです。ADRCが撮影・検証したものではありません。<br/>");
  console.log("出所と公開日は各媒体の表示に基づきます。レポート本体には含めていません。</p>");
  console.log("<ul>");
  for (const r of okRows) {
    const cap = (r.title || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    console.log('<li><a href="' + r.url + '">' + cap + "</a><br/>"
      + [r.channel, r.published].filter(Boolean).join("、") + "</li>");
  }
  console.log("</ul>");
  console.log("");
}

if (blockedHosts.length) {
  console.log("STATUS: BLOCKED  " + [...new Set(blockedHosts)].join(", "));
  console.log("  ネットワークポリシーの許可リストに追加が必要。**「動画が無い」ではない。**");
  process.exit(7);
}
console.log("STATUS: OK  載せてよい媒体 " + okRows.length + "件 / 要確認 " + chk.length + "件");
