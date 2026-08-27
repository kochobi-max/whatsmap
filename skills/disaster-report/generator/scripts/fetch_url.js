#!/usr/bin/env node
/*
 * fetch_url.js — 一次情報源のページを取って、本文だけを出す。
 *
 *   node fetch_url.js <URL> [--raw] [--render]
 *
 * **WebFetch を使わないこと。** WebFetch はこの環境の egress 許可リストを
 * 見ておらず、許可済みのドメインでも "EGRESS_BLOCKED" を返す
 * （2026-08-28、許可済みの www.sgc.gov.co で確認）。curl は同じドメインで 200。
 * 許可リストに何件足しても WebFetch では届かない。
 *
 *   --raw     HTMLをそのまま出す
 *   --render  JavaScript で描画されるページ用にヘッドレスChromiumで開く
 *             （SharePoint 系はこれでも本文が出ないことがある）
 */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith("--"));
if (!url) { console.error("usage: fetch_url.js <URL> [--raw] [--render]"); process.exit(2); }
const raw = args.includes("--raw");
const render = args.includes("--render");

function viaCurl(u) {
  return execFileSync("curl", [
    "-sS", "-L", "--max-time", "90",
    "-A", "Mozilla/5.0 (compatible; ADRC-disaster-report)",
    u,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function viaChromium(u) {
  const dirs = fs.readdirSync("/opt/pw-browsers").filter(d => /^chromium-\d+$/.test(d));
  if (!dirs.length) throw new Error("chromium が見つからない");
  const chrome = path.join("/opt/pw-browsers", dirs[0], "chrome-linux", "chrome");
  const argv = ["--headless", "--disable-gpu", "--no-sandbox",
                "--virtual-time-budget=30000", "--dump-dom", u];
  if (process.env.HTTPS_PROXY) argv.unshift("--proxy-server=" + process.env.HTTPS_PROXY);
  return execFileSync(chrome, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
                                      stdio: ["ignore", "pipe", "ignore"] });
}

let html;
try {
  html = render ? viaChromium(url) : viaCurl(url);
} catch (e) {
  console.error("FETCH: FAIL");
  console.error(String(e.message || e).slice(0, 300));
  console.error("届かない場合は check_sources.js で許可リストを確認する。");
  process.exit(7);
}

if (raw) { process.stdout.write(html); process.exit(0); }

// 本文らしいところだけ残す
let t = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
  .replace(/<[^>]+>/g, " ");
t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
     .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
t = t.split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");

console.log("URL: " + url);
console.log("BYTES: " + html.length + "  TEXT-LINES: " + t.split("\n").length);
console.log("----");
console.log(t.slice(0, 200000));
