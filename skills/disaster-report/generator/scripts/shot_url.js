#!/usr/bin/env node
/*
 * shot_url.js — ページの見た目をそのまま画像にする。
 *
 *   node shot_url.js <URL> <出力.png> [--width 1400] [--height 1000] [--wait 4000]
 *
 * 発動ページ（センチネルアジア・国際災害チャーター）のように、
 * **画面そのものを資料に載せたい**ときに使う。
 * 本文のテキストが欲しいだけなら fetch_url.js のほうが軽い。
 *
 * ヘッドレス Chromium を使う。プロキシは環境変数から渡す。
 * 独自の User-Agent を弾くサイトがあるので、ブラウザとして名乗る。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const take = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args.splice(i, 2)[1]; };
const WIDTH = take("--width", "1400");
const HEIGHT = take("--height", "1000");
const WAIT = take("--wait", "4000");
const url = args[0];
const out = args[1];
if (!url || !out) {
  console.error("usage: shot_url.js <URL> <out.png> [--width N] [--height N] [--wait ms]");
  process.exit(2);
}

function chromium() {
  const base = "/opt/pw-browsers";
  const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d));
  if (!dirs.length) throw new Error("chromium が見つからない");
  return path.join(base, dirs.sort().pop(), "chrome-linux", "chrome");
}

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || "";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "adrc-shot-"));
const abs = path.resolve(out);
fs.mkdirSync(path.dirname(abs), { recursive: true });

const argv = [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--user-data-dir=" + profile,
  "--ignore-certificate-errors",           // プロキシの証明書。中身は検証済みの相手
  "--window-size=" + WIDTH + "," + HEIGHT,
  "--virtual-time-budget=" + WAIT,
  "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "--screenshot=" + abs,
];
if (proxy) argv.push("--proxy-server=" + proxy);
argv.push(url);

try {
  execFileSync(chromium(), argv, { stdio: ["ignore", "ignore", "pipe"], timeout: 120000 });
} catch (err) {
  // Chromium は撮れていても終了コードが 0 以外になることがある。
  // 出来上がったファイルを見て判断する。
}
if (!fs.existsSync(abs) || fs.statSync(abs).size < 5000) {
  console.error("STATUS: FAIL shot  画像ができていない: " + abs);
  process.exit(3);
}

// **ファイルの大きさは、ページが開けた証拠にならない。**
// 2026-08-28、Chromium の「This site can't be reached」を 33KB の画像として
// 保存し、成功と報告した。中身がエラー画面かどうかを DOM で確かめる。
let dom = "";
try {
  dom = execFileSync(chromium(),
    argv.filter(a => !a.startsWith("--screenshot=")).concat(["--dump-dom"]),
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"], timeout: 120000 });
} catch (_) {}
const bad = /ERR_[A-Z_]+|This site can.t be reached|ページにアクセスできません/.test(dom);
if (bad || dom.length < 500) {
  const code = (dom.match(/ERR_[A-Z_]+/) || ["理由不明"])[0];
  fs.unlinkSync(abs);
  console.error("STATUS: FAIL shot-error-page  " + code);
  console.error("  Chromium がページを開けていない。撮れた画像は消した。");
  console.error("  curl では通っても Chromium が通らないことがある。");
  console.error("  check_sources.js で許可リストを確かめること。");
  process.exit(4);
}
console.log("STATUS: SHOT " + abs + "  " + Math.round(fs.statSync(abs).size / 1024) + "KB");
