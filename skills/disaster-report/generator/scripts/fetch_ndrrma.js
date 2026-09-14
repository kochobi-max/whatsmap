#!/usr/bin/env node
/*
 * fetch_ndrrma.js — ネパール NDRRMA の状況報告を一覧する。
 *
 *   node fetch_ndrrma.js                 ラスワ洪水の状況報告を新しい順に
 *   node fetch_ndrrma.js --en            英語版だけ
 *   node fetch_ndrrma.js --get <URL>     PDFを落として本文を出す
 *
 * **なぜこれが要るのか（2026-09-02 の失敗）**
 *
 * NDRRMA の状況報告第1号（9月1日09:00）を、こちらは見つけられず、
 * 荒木田さんに手で渡してもらった。ChatGPT は見つけていた。
 *
 * 原因は許可リストでもネットワークでもない。`ndrrma.gov.np` は許可済みで 200 を返す。
 * ただしトップは 566 バイトの JavaScript アプリの外枠で、curl では中身が見えない。
 * そして `references/sources/NPL.md` に **「/api/... は全て404」と書いてあった。**
 * これが誤りだった。叩いたパスが違っただけで、API は動いている。
 *
 *   https://ndrrma.gov.np/api/v1/publication/rasuwa-sitrep/
 *
 * **一度「無い」と書いた自分のメモを、そのまま信じ続けたのがいちばんの問題である。**
 * JavaScript のサイトは、配信されている JS を読めばエンドポイントが書いてある。
 * ndrrma.gov.np/assets/index-*.js の中に、上のパスがそのまま入っていた。
 */
"use strict";
const { execFileSync } = require("child_process");

const API = "https://ndrrma.gov.np/api/v1";
const args = process.argv.slice(2);
const EN_ONLY = args.includes("--en");
const getIdx = args.indexOf("--get");

function curl(url, bin) {
  const a = ["-sS", "--max-time", "90", "--compressed",
    "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", url];
  return execFileSync("curl", a, bin ? { maxBuffer: 96 * 1024 * 1024 }
                                     : { encoding: "utf8", maxBuffer: 96 * 1024 * 1024 });
}

if (getIdx >= 0 && args[getIdx + 1]) {
  const url = args[getIdx + 1];
  const os = require("os"), path = require("path"), fs = require("fs");
  const tmp = path.join(os.tmpdir(), "ndrrma_" + Date.now() + ".pdf");
  fs.writeFileSync(tmp, curl(url, true));
  console.log("保存: " + tmp + "  " + fs.statSync(tmp).size + " bytes");
  // pdfplumber があれば本文を出す。無ければ場所だけ伝える
  for (const py of ["python3", "python", "py"]) {
    try {
      const out = execFileSync(py, ["-c",
        "import sys,pdfplumber\nwith pdfplumber.open(sys.argv[1]) as p:\n"
        + "  print('\\n'.join((g.extract_text() or '') for g in p.pages))", tmp],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      console.log(out);
      process.exit(0);
    } catch (e) { /* 次を試す */ }
  }
  console.log("（pdfplumber が無い。上のファイルを読むこと）");
  process.exit(0);
}

let data;
try {
  data = JSON.parse(curl(API + "/publication/rasuwa-sitrep/?limit=30"));
} catch (e) {
  console.error("NDRRMA: FAIL 取得できない — " + String(e.message).slice(0, 140));
  console.error("  ndrrma.gov.np が許可リストにあるかを check_sources.js で確かめる。");
  console.error("  **「新しい報が無い」と結論しないこと。**");
  process.exit(7);
}

const rows = (data.results || []).filter(r => !EN_ONLY || /english|_ENG_/i.test((r.title || "") + (r.pdffile || "")));
console.log("── NDRRMA 状況報告（ラスワ洪水）  全 " + (data.count != null ? data.count : "?") + " 件");
console.log("   " + API + "/publication/rasuwa-sitrep/");
console.log("");
for (const r of rows) {
  const en = /english|_ENG_/i.test((r.title || "") + (r.pdffile || "")) ? "  [EN]" : "";
  console.log("   " + (r.date || "日付なし") + en + "  " + (r.title || "").slice(0, 72));
  console.log("      " + (r.pdffile || "（PDFなし）"));
}
console.log("");
console.log("STATUS: OK " + rows.length + " 件");
console.log("  本文を読むには: node fetch_ndrrma.js --get <PDFのURL>");
