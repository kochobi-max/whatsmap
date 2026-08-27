#!/usr/bin/env node
/*
 * build_event.js — イベント1件を JA/EN の PPTX + PDF まで作る。Windows でもクラウドでも動く。
 *
 *   node scripts/build_event.js <GLIDE> [出力ディレクトリ]
 *
 * 素の権威版 generator/gen_deck.base.js を一時ディレクトリへコピーし、
 * 14本のパッチを当ててからビルドする。**権威版そのものは書き換えない。**
 *
 * bash に依存しない。Windows の cmd から直接呼べる。
 * 進捗行は ASCII で出す（cp932 の findstr で拾えるようにするため）。
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const GLIDE = process.argv[2];
if (!GLIDE) {
  console.error("GLIDE番号を渡すこと（例 EQ-2026-000146-COL）");
  process.exit(2);
}

const HERE = __dirname;
const SKILL = path.resolve(HERE, "..", "..");
const OUTDIR = path.resolve(process.argv[3] || path.join(SKILL, "..", "..", "_build", GLIDE));

const eventJson = path.join(SKILL, "events", GLIDE + ".json");
if (!fs.existsSync(eventJson)) {
  console.error("STATUS: FAIL no-event-json");
  console.error("イベントJSONが無い: " + eventJson);
  process.exit(4);
}
const filebase = (JSON.parse(fs.readFileSync(eventJson, "utf8")).meta || {}).filebase;
if (!filebase) {
  console.error("STATUS: FAIL no-filebase");
  console.error("meta.filebase が空: " + eventJson);
  process.exit(3);
}

// 作業ディレクトリは毎回新しく作る。使い回すと前回分が別ユーザー所有で残って書けなくなる
const work = fs.mkdtempSync(path.join(os.tmpdir(), "build_event-"));
const cleanup = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {} };
process.on("exit", cleanup);

const wgen = path.join(work, "generator");
fs.mkdirSync(path.join(wgen, "scripts"), { recursive: true });
// 権威版を一時コピーへ。**改行を LF に正規化する。**
// Windows の git は既定で CRLF に変換して取り出す。パッチの照合は行末に
// \n を置いているので、CRLF のままだと 0 件になって当たらない。
// 2026-08-27、Windows でここに当たった。
{
  const src = fs.readFileSync(path.join(SKILL, "generator", "gen_deck.base.js"), "utf8");
  const lf = src.replace(/\r\n/g, "\n");
  if (lf !== src) console.log("   normalised CRLF to LF before patching");
  fs.writeFileSync(path.join(wgen, "scripts", "gen_deck.js"), lf, "utf8");
}
for (const f of fs.readdirSync(HERE)) {
  if (/^apply_.*\.js$/.test(f)) fs.copyFileSync(path.join(HERE, f), path.join(wgen, "scripts", f));
}
fs.cpSync(path.join(SKILL, "generator", "images"), path.join(wgen, "images"), { recursive: true });
fs.cpSync(path.join(SKILL, "events"), path.join(work, "events"), { recursive: true });
const refs = path.join(SKILL, "references");
if (fs.existsSync(refs)) fs.cpSync(refs, path.join(work, "references"), { recursive: true });

// pptxgenjs の在り処。OneDrive配下に node_modules を作らない運用なので外から渡せるようにする
const nmCandidates = [
  process.env.PPTXGENJS_NODE_MODULES,
  path.join(SKILL, "generator", "node_modules"),
  path.join(os.homedir(), "node_modules"),
].filter(Boolean);
const nm = nmCandidates.find(p => fs.existsSync(path.join(p, "pptxgenjs")));
if (!nm) {
  console.error("STATUS: FAIL no-pptxgenjs");
  console.error("pptxgenjs が見つからない。探した場所:");
  nmCandidates.forEach(p => console.error("  " + p));
  console.error('対処: npm install pptxgenjs を上のどれかで実行する');
  process.exit(6);
}
fs.symlinkSync(nm, path.join(wgen, "node_modules"), "junction");

console.log("STEP: patch");
execFileSync(process.execPath,
  [path.join(wgen, "scripts", "apply_all.js"), "--file", path.join(wgen, "scripts", "gen_deck.js")],
  { cwd: wgen, stdio: ["ignore", "ignore", "inherit"] });
const patchedLines = fs.readFileSync(path.join(wgen, "scripts", "gen_deck.js"), "utf8").split("\n").length;
console.log("   14 patches applied (" + patchedLines + " lines)");

fs.mkdirSync(OUTDIR, { recursive: true });
const now = new Date();
const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
const pad = n => String(n).padStart(2, "0");
const updateDate = process.env.UPDATE_DATE ||
  pad(jst.getDate()) + "/" + pad(jst.getMonth() + 1) + "/" + jst.getFullYear();

console.log("STEP: build");
for (const L of ["ja", "en"]) {
  const U = L.toUpperCase();
  execFileSync(process.execPath, [path.join(wgen, "scripts", "gen_deck.js")], {
    cwd: wgen,
    stdio: ["ignore", "inherit", "inherit"],
    env: Object.assign({}, process.env, {
      LANG_OUT: L, UPDATE_DATE: updateDate, EVENT: GLIDE,
      OUT: path.join(OUTDIR, filebase + "_" + U + ".pptx"),
    }),
  });
}

console.log("STEP: pdf");
// 開いたままの古い PDF を測り続けないよう、先に消してから作る
for (const U of ["JA", "EN"]) {
  const p = path.join(OUTDIR, filebase + "_" + U + ".pdf");
  try { fs.existsSync(p) && fs.unlinkSync(p); }
  catch (e) {
    console.error("STATUS: FAIL pdf-locked");
    console.error("古いPDFを消せない。ビューアで開いたままかもしれない: " + p);
    process.exit(7);
  }
}
const { resolveSoffice } = require("./soffice.js");
const found = resolveSoffice();
const soffice = found.path;
if (!soffice) {
  console.error("STATUS: FAIL soffice-missing");
  console.error("LibreOffice (soffice) が見つかりません。探した場所:");
  for (const t of found.tried) console.error("   " + t);
  console.error("PATH と、よくある導入先と、レジストリの App Paths も見ています。");
  console.error("対処: 環境変数 SOFFICE に soffice.exe のフルパスを入れて実行し直す。");
  process.exit(8);
}
console.log("   soffice: " + soffice);
const conv = spawnSync(soffice,
  ["--headless", "--convert-to", "pdf", "--outdir", OUTDIR,
   path.join(OUTDIR, filebase + "_JA.pptx"), path.join(OUTDIR, filebase + "_EN.pptx")],
  { stdio: ["ignore", "ignore", "inherit"] });
if (conv.error) {
  // 実体はあるのに起動できない。権限か、別プロセスが掴んでいる可能性
  console.error("STATUS: FAIL soffice-launch");
  console.error("見つかったが起動できない: " + soffice);
  console.error(String(conv.error.message || conv.error));
  console.error("対処: LibreOffice を開いたままなら閉じて実行し直す。");
  process.exit(8);
}

const pages = {};
for (const U of ["JA", "EN"]) {
  const p = path.join(OUTDIR, filebase + "_" + U + ".pdf");
  if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
    console.error("STATUS: FAIL no-pdf " + U);
    console.error("PDFが作られていない: " + p);
    process.exit(5);
  }
  const buf = fs.readFileSync(p);
  pages[U] = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
}

console.log("");
console.log("OUTDIR: " + OUTDIR);
for (const U of ["JA", "EN"]) {
  for (const ext of ["pptx", "pdf"]) {
    const f = filebase + "_" + U + "." + ext;
    console.log("   " + f + "  " + Math.round(fs.statSync(path.join(OUTDIR, f)).size / 1024) + "KB");
  }
}
console.log("STATUS: OK JA=" + pages.JA + "p EN=" + pages.EN + "p");
