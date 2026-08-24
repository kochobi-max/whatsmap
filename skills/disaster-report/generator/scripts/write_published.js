#!/usr/bin/env node
/*
 * write_published.js — LargeScaleDisasters へ実際に出たことを記録する。
 *
 *   node write_published.js <GLIDE> "<公開先フォルダ>"
 *
 * クラウド側は、この記録が当日のものであるときだけ更新メールを送る。
 * 「OneDriveに保存しました」と書いたメールが、実際には保存されていない、
 * という事故を防ぐためのもの。記録が無ければメールは出ない。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const GLIDE = process.argv[2];
const DEST = process.argv[3];
if (!GLIDE || !DEST) {
  console.error("usage: write_published.js <GLIDE> <dest-folder>");
  process.exit(2);
}

const SKILL = path.resolve(__dirname, "..", "..");
const eventJson = path.join(SKILL, "events", GLIDE + ".json");
const ev = JSON.parse(fs.readFileSync(eventJson, "utf8"));
const filebase = ev.meta.filebase;

const files = [];
for (const U of ["JA", "EN"]) {
  for (const ext of ["pptx", "pdf"]) {
    const name = filebase + "_" + U + "." + ext;
    const p = path.join(DEST, name);
    if (!fs.existsSync(p)) {
      console.error("STATUS: FAIL marker-missing-file " + name);
      process.exit(3);
    }
    const st = fs.statSync(p);
    files.push({ name: name, bytes: st.size, mtime: st.mtime.toISOString() });
  }
}

const now = new Date();
const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
const pad = n => String(n).padStart(2, "0");

const rec = {
  glide: GLIDE,
  published_at_jst: jst.getFullYear() + "-" + pad(jst.getMonth() + 1) + "-" + pad(jst.getDate()) +
                    " " + pad(jst.getHours()) + ":" + pad(jst.getMinutes()),
  published_date_jst: jst.getFullYear() + "-" + pad(jst.getMonth() + 1) + "-" + pad(jst.getDate()),
  destination: DEST,
  // メール本文に載せる版の情報。イベントJSONから取るので手で書かない
  edition: (ev.meta && ev.meta.edition) || null,
  update_date: (ev.meta && ev.meta.update_date) || null,
  stamp: (ev.meta && ev.meta.stamp) || null,
  files: files,
};

const dir = path.join(SKILL, "_published");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, GLIDE + ".json"), JSON.stringify(rec, null, 2) + "\n", "utf8");
console.log("MARKER: " + rec.published_date_jst + " " + files.length + " files");
