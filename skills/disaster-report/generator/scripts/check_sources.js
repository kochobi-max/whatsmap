#!/usr/bin/env node
/*
 * check_sources.js — 一次情報源に実際に到達できるかを確かめる。
 *
 *   node check_sources.js <GLIDE>
 *
 * **情報源に届かないことを「変化なし」と取り違えないための門番。**
 *
 * 2026年8月20日にクラウドのネットワークポリシーを Custom にした際、
 * 既定の許可リストごと置き換わり、sgc.gov.co 以外の全ての一次情報源が
 * 遮断された。日次タスクは UNGRD（死者・住家被害の出どころ）に一度も
 * 到達できないまま「変化なし」を報告し続け、レポートは11日間 8/16 の値で
 * 止まっていた。実際には死者が 287 → 329 に動いていた。
 *
 * 終了コード:
 *   0  すべて到達できた
 *   7  1件以上到達できない（**この場合「変化なし」と結論してはいけない**）
 */
"use strict";
const fs = require("fs");
const path = require("path");

const GLIDE = process.argv[2];
const SKILL = path.resolve(__dirname, "..", "..");

// 情報源プロファイルからホストを拾う。一覧を二重管理しない。
//
// **参考扱いの情報源は、届かなくても日次を止めない。**
// プロファイルの行に「要ログイン」または「到達確認の対象外」と書いてあれば、
// その行のホストは参考扱いにする。状態は表に出すが、終了コードには数えない。
//
// 2026-08-30、インドネシアの OPTEMIS ダッシュボード
// （optemis.sentinel-asia.org、プロファイル自身が「要ログイン」と書いている）で
// 日次のビルドが丸ごと止まった。**そもそも認証が要るので機械では読めない。**
// 読めない情報源のために、読める情報源からの更新まで止めるのは筋が悪い。
//
// 数値の出どころになる情報源には、この印を付けないこと。
// 届かないことを「変化なし」と取り違えない、という門番の役目はそちらで果たす。
const OPTIONAL_MARK = /要ログイン|到達確認の対象外/;

function hostsFrom(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const optional = OPTIONAL_MARK.test(line);
    for (const m of line.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      out.push({ h: m[1].toLowerCase(), optional });
    }
  }
  return out;
}

const files = [path.join(SKILL, "references", "sources", "_global.md")];
if (GLIDE) {
  const iso3 = (GLIDE.split("-").pop() || "").toUpperCase();
  files.push(path.join(SKILL, "references", "sources", iso3 + ".md"));
}
// 同じホストが必須の行と参考の行の両方に出たら、**必須として扱う**。
const seen = new Map();
for (const e of files.flatMap(hostsFrom)) {
  if (!seen.has(e.h) || !e.optional) seen.set(e.h, e.optional);
}
const hosts = [...seen.keys()].sort();
const isOptional = h => seen.get(h) === true;
if (hosts.length === 0) {
  console.error("SOURCES: FAIL no-profile");
  console.error("情報源プロファイルが見つからない: " + files.join(", "));
  process.exit(7);
}

// 到達判定は curl で行う。
// Node の fetch はこの環境のプロキシ設定を見ないため、遮断されていない
// ドメインまで一律 403 になり、全件「到達」と誤判定した（2026-08-28）。
// curl は遮断されていれば接続自体が失敗して 000 を返す。実測と一致する。
const { execFileSync } = require("child_process");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function probe(host) {
  try {
    // リダイレクトを追い、ブラウザのUAで名乗る。
    // 2026-08-28、ICIMOD が独自UAに 403 を返し、遮断と読み違えるところだった。
    // 403 の主は nginx で、プロキシ自体は通っていた。ブラウザのUAなら 200。
    // リダイレクトも追わないと、nature.com のように 301 だけ見て終わる。
    const code = execFileSync("curl", [
      "-sS", "-L", "-o", "/dev/null", "-w", "%{http_code}",
      "-A", UA, "--max-time", "25", "https://" + host + "/",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    // 000 = 接続できていない（＝遮断）。それ以外は何らかの応答が返っている
    if (code === "000" || code === "") return { ok: false, note: "接続できない（遮断）" };
    // 3xx のまま終わるのは、飛び先が許可リストに無いとき。到達とは言えない
    if (/^3\d\d$/.test(code)) return { ok: false, note: "HTTP " + code + "（飛び先が許可リストに無い疑い）" };
    return { ok: true, note: "HTTP " + code };
  } catch (e) {
    return { ok: false, note: "接続できない（遮断）" };
  }
}

const results = hosts.map(h => Object.assign({ h }, probe(h)));
results.sort((a, b) => a.h.localeCompare(b.h));
for (const r of results) {
  const tag = r.ok ? "OK  " : (isOptional(r.h) ? "--  " : "NG  ");
  console.log(tag + r.h.padEnd(34) + r.note + (isOptional(r.h) ? "   （参考扱い）" : ""));
}

const skipped = results.filter(r => !r.ok && isOptional(r.h));
if (skipped.length) {
  console.log("");
  console.log("参考扱いのため、届かなくても止めない: " + skipped.map(r => r.h).join(", "));
  console.log("  プロファイルに「要ログイン」または「到達確認の対象外」と書いてあるもの。");
  console.log("  **数値の出どころではない。** 数値はほかの情報源から取ること。");
}

const bad = results.filter(r => !r.ok && !isOptional(r.h));
if (bad.length) {
  console.error("");
  console.error("SOURCES: FAIL unreachable=" + bad.length + "/" + results.length);
  console.error("届かない情報源がある。**「変化なし」と結論してはいけない。**");
  console.error("クラウドのネットワークポリシー（Custom の許可リスト）に");
  console.error("次のドメインが入っているか確認する:");
  for (const r of bad) console.error("   " + r.h);
  process.exit(7);
}
console.log("");
console.log("SOURCES: OK " + (results.length - skipped.length) + "/" + results.length + " reachable");
