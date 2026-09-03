#!/usr/bin/env node
/*
 * ensure_soffice.js — PDF変換ができる状態かを確かめ、欠けていれば入れ直す。
 *
 *   node ensure_soffice.js            確かめる（必要なら入れ直す）
 *   node ensure_soffice.js --check    確かめるだけ。入れ直さない
 *
 * 終了コード 0 = 変換できる / 1 = できない（理由を表示する）
 *
 * **なぜ「soffice が在る」だけでは足りないのか（2026-09-03）**
 *
 * ビルド用コンテナに `libreoffice-core` だけが入っていて、
 * `libreoffice-impress` が欠けていた日があった。`/usr/bin/soffice` は在るので
 * `soffice.js` の探索は通る。しかし **pptx を読む取り込みフィルタが無いため
 * 変換が1枚も出ない。** 定期タスクが気づいて apt-get で入れ直したが、
 * コンテナは毎回作り直されるので、その修復は次の回まで残らない。
 *
 * `build_event.js` は `STATUS: FAIL no-pdf` で止まるので黙って空を出しはしない。
 * ただし**止まるだけでは毎朝レポートが出ない。** ここで直してから進む。
 *
 * 判定はバイナリの有無ではなく、**Impress のモジュールが在るか**で行う。
 *
 *   /usr/lib/libreoffice/program/libwpftimpresslo.so   libreoffice-impress
 *   /usr/lib/libreoffice/program/libslideshowlo.so     libreoffice-impress
 *
 * Windows（荒木田さんのPC）には LibreOffice を入れない方針なので、
 * ここは Linux のときだけ働く。PC側は PDF を作らず、配布ブランチから受け取る。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolveSoffice } = require("./soffice.js");

const CHECK_ONLY = process.argv.includes("--check");

// Impress が入っていることの印。どれか1つでも在れば取り込みフィルタは在る。
const IMPRESS_MARKS = [
  "/usr/lib/libreoffice/program/libwpftimpresslo.so",
  "/usr/lib/libreoffice/program/libslideshowlo.so",
  "/usr/lib/libreoffice/program/libsdlo.so",
];
const hasImpress = () => IMPRESS_MARKS.some(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });

function say(s) { console.log(s); }

const found = resolveSoffice();
if (!found.path) {
  console.error("STATUS: FAIL soffice-missing");
  console.error("  LibreOffice 本体が見つからない。探した場所:");
  for (const t of found.tried) console.error("    " + t);
  process.exit(1);
}
say("   soffice: " + found.path);

if (process.platform !== "linux") {
  // Windows/macOS では apt が無い。判定だけして通す
  say("STATUS: OK （Linux 以外のため取り込みフィルタの確認は行わない）");
  process.exit(0);
}

if (hasImpress()) {
  say("STATUS: OK Impress あり");
  process.exit(0);
}

console.error("   **LibreOffice Impress が入っていない。** pptx を読めないので PDF が1枚も出ない。");
console.error("   探した印: " + IMPRESS_MARKS.join(", "));

if (CHECK_ONLY) {
  console.error("STATUS: FAIL impress-missing");
  console.error("  対処: apt-get install -y libreoffice-impress");
  process.exit(1);
}

// 入れ直す。root でなければ諦めて理由を言う
if (typeof process.getuid === "function" && process.getuid() !== 0) {
  console.error("STATUS: FAIL impress-missing (root ではないので入れ直せない)");
  console.error("  対処: sudo apt-get install -y libreoffice-impress");
  process.exit(1);
}

say("   入れ直します: apt-get install -y libreoffice-impress");
const env = Object.assign({}, process.env, { DEBIAN_FRONTEND: "noninteractive" });
const up = spawnSync("apt-get", ["update", "-qq"], { encoding: "utf8", env, timeout: 300000 });
if (up.status !== 0) say("   （apt-get update は失敗したが、そのまま install を試す）");
const ins = spawnSync("apt-get", ["install", "-y", "--no-install-recommends", "libreoffice-impress"],
  { encoding: "utf8", env, timeout: 900000 });

if (ins.status !== 0 || !hasImpress()) {
  console.error("STATUS: FAIL impress-install");
  console.error((ins.stderr || ins.stdout || "").split("\n").slice(-12).join("\n"));
  console.error("  ネットワークポリシーで apt のミラーに届いていない可能性がある。");
  console.error("  **「変化なし」で終わらせず、この行をそのまま報告すること。**");
  process.exit(1);
}

say("   入りました。");

// 印が在るだけでは足りない。**実際に1枚変換して確かめる。**
// 「ビルドが通った」を検証にしない、というこのリポジトリの方針に合わせる。
const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "sofficechk-"));
try {
  const PptxGenJS = require("pptxgenjs");
  const p = new PptxGenJS();
  p.addSlide().addText("check", { x: 1, y: 1 });
  const src = path.join(tmp, "check.pptx");
  // writeFile は Promise。同期で待つために、書けたことを確かめてから変換する
  p.writeFile({ fileName: src }).then(() => {
    const c = spawnSync(found.path, ["--headless", "--convert-to", "pdf", "--outdir", tmp, src],
      { encoding: "utf8", timeout: 300000 });
    const out = path.join(tmp, "check.pdf");
    let ok = false;
    try { ok = fs.statSync(out).size > 0; } catch { ok = false; }
    if (!ok) {
      console.error("STATUS: FAIL convert-smoke-test");
      console.error("  Impress は入ったが、実際の変換が1枚も出なかった。");
      console.error((c.stderr || c.stdout || "").split("\n").slice(-10).join("\n"));
      process.exit(1);
    }
    say("STATUS: OK 変換まで確認した（" + fs.statSync(out).size + " bytes）");
    process.exit(0);
  }).catch(e => {
    say("   （試験用 pptx を作れなかったので変換の確認は省いた: " + String(e.message).slice(0, 80) + "）");
    say("STATUS: OK Impress あり");
    process.exit(0);
  });
} catch (e) {
  say("   （pptxgenjs が無いので変換の確認は省いた）");
  say("STATUS: OK Impress あり");
  process.exit(0);
}
