#!/usr/bin/env node
/*
 * fetch_ungrd.js — UNGRD（コロンビア）の公式記事を本文ごと取る。
 *
 *   node fetch_ungrd.js                 # 直近の記事を一覧
 *   node fetch_ungrd.js --grep sismo    # 見出しで絞って本文を出す
 *   node fetch_ungrd.js --year 2026 --limit 5
 *
 * **なぜ専用スクリプトが要るのか**
 *
 * portal.gestiondelriesgo.gov.co は SharePoint で、記事本文が静的HTMLに無い。
 * curl でもヘッドレスChromium でも本文は取れない（2026-08-28 に確認）。
 * 一方 **SharePoint の REST API は匿名で応答し、本文フィールド
 * PublishingPageContent をそのまま返す**。ここが唯一通る経路。
 *
 * **取れないもの（重要）**
 *
 * 死者・負傷者・住家被害の**数値集計は、UNGRD のサイトには記事として載らない**。
 * 公式Xで発表され、報道がそれを引く。x.com は遮断されているため、
 * 数値をこの経路で公式一次情報として取ることはできない。
 * 数値を扱うときは出典ティアを正しく付けること（SKILL.md §1）。
 */
"use strict";
const { execFileSync } = require("child_process");

const BASE = "https://portal.gestiondelriesgo.gov.co";
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const year = opt("year", String(new Date().getUTCFullYear()));
const limit = parseInt(opt("limit", "10"), 10);
const grep = opt("grep", null);

const curl = url => execFileSync("curl", ["-sS", "--max-time", "90", url],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const unesc = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#xD;/g, "\n")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

function props(xml) {
  return [...xml.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)].map(m => {
    const b = m[1];
    const g = k => {
      const r = new RegExp("<d:" + k + "[^>]*>([\\s\\S]*?)</d:" + k + ">").exec(b);
      return r ? r[1] : "";
    };
    return { name: g("Name"), when: g("TimeLastModified"), url: g("ServerRelativeUrl") };
  });
}

let files;
try {
  files = props(curl(BASE + "/_api/web/GetFolderByServerRelativeUrl('/Paginas/Noticias/"
    + year + "')/Files?$select=Name,TimeLastModified,ServerRelativeUrl&$top=300"));
} catch (e) {
  console.error("UNGRD: FAIL 一覧を取得できない");
  console.error(String(e.message || e).slice(0, 200));
  console.error("check_sources.js で portal.gestiondelriesgo.gov.co の到達を確認する。");
  process.exit(7);
}
files = files.filter(f => f.name).sort((a, b) => b.when.localeCompare(a.when));
if (grep) {
  const re = new RegExp(grep, "i");
  files = files.filter(f => re.test(decodeURIComponent(f.name)));
}
files = files.slice(0, limit);

if (!files.length) { console.log("該当記事なし（year=" + year + (grep ? " grep=" + grep : "") + "）"); process.exit(0); }

for (const f of files) {
  const title = decodeURIComponent(f.name).replace(/\.aspx$/, "").replace(/-/g, " ");
  console.log("=".repeat(72));
  console.log(f.when.slice(0, 10) + "  " + title);
  console.log(BASE + f.url);
  if (!grep) continue;             // 一覧のときは本文を出さない
  let body = "";
  try {
    const xml = curl(BASE + "/_api/web/GetFileByServerRelativeUrl('"
      + f.url.replace(/'/g, "''") + "')/ListItemAllFields?$select=Title,Created,PublishingPageContent");
    const m = /<d:PublishingPageContent[^>]*>([\s\S]*?)<\/d:PublishingPageContent>/.exec(xml);
    body = m ? m[1] : "";
  } catch (e) { console.log("  （本文を取得できない: " + String(e.message).slice(0, 80) + "）"); continue; }
  if (!body) { console.log("  （本文フィールドが空）"); continue; }
  let t = unesc(body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log("----");
  console.log(t.slice(0, 8000));
  console.log("");
}
