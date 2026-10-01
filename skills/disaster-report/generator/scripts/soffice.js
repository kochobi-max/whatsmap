#!/usr/bin/env node
/*
 * soffice.js — LibreOffice の在り処を探す。build_event.js と check_setup.bat の
 * 両方から使う。判定を1箇所に置いて、検査とビルドが食い違わないようにする。
 *
 * 2026-08-27、既定パスだけを見ていて PDF 変換が落ちた。導入先は環境で違う。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// LibreOffice の在り処は環境によって違う。1箇所だけ見て諦めない。
// 2026-08-27、既定パスに無くて PDF 変換だけが落ちた。
function resolveSoffice() {
  const tried = [];
  const ok = p => { tried.push(p); try { return fs.statSync(p).isFile() ? p : null; } catch { return null; } };

  if (process.env.SOFFICE) {
    const hit = ok(process.env.SOFFICE);
    if (hit) return { path: hit, tried };
    // 明示指定が外れているなら、黙って別を使わずに知らせる
    console.error("   SOFFICE に指定されたパスが見つからない: " + process.env.SOFFICE);
  }

  // PATH を引く
  const which = process.platform === "win32" ? "where" : "which";
  for (const name of ["soffice.exe", "soffice", "soffice.com", "libreoffice"]) {
    try {
      const out = execFileSync(which, [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const first = out.split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0];
      if (first) { const hit = ok(first); if (hit) return { path: hit, tried }; }
    } catch { /* 見つからないだけ */ }
  }

  // よくある導入先を総当たりする
  const roots = [];
  if (process.platform === "win32") {
    for (const base of [process.env.ProgramW6432, process.env["ProgramFiles"],
                        process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA
                          ? path.join(process.env.LOCALAPPDATA, "Programs") : null,
                        "C:\\Program Files", "C:\\Program Files (x86)"]) {
      if (base) roots.push(base);
    }
  } else {
    roots.push("/usr/bin", "/usr/local/bin", "/opt");
  }
  const seen = new Set();
  for (const root of roots) {
    if (seen.has(root)) continue;
    seen.add(root);
    let entries = [];
    try { entries = fs.readdirSync(root); } catch { continue; }
    // "LibreOffice" / "LibreOffice 7.6" のような版番号付きも拾う
    for (const e of entries.filter(x => /^libreoffice/i.test(x))) {
      for (const exe of ["soffice.exe", "soffice"]) {
        const hit = ok(path.join(root, e, "program", exe));
        if (hit) return { path: hit, tried };
      }
    }
  }

  // レジストリの App Paths（Windows のみ）
  if (process.platform === "win32") {
    try {
      const out = execFileSync("reg",
        ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\soffice.exe", "/ve"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const m = out.match(/REG_SZ\s+(.+?)\s*$/m);
      if (m) { const hit = ok(m[1].trim().replace(/^"|"$/g, "")); if (hit) return { path: hit, tried }; }
    } catch { /* 無ければよい */ }
  }

  return { path: null, tried };
}

module.exports = { resolveSoffice };

// 単体で呼ばれたら、見つけた1行だけ出す（見つからなければ終了1）
if (require.main === module) {
  const r = resolveSoffice();
  if (!r.path) process.exit(1);
  process.stdout.write(r.path);
}
