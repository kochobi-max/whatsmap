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

// publish_local.js からは関数として呼ぶ。コマンドとしても従来どおり動く。
module.exports = { writePublished };

// 第3引数 man は配布台帳（manifest.txt）を読んだもの。publish_local.js が渡す。
// **バイト数の照合は、ここへ来る前に publish_local.js が済ませている。**
// 台帳の BYTESn と実際に落ちたファイルを突き合わせ、違えば STATUS: FAIL size で止まる。
// その事実をここに書き残し、クラウド側が「作り直して照合し直す」ことをしないで済むようにする。
//
// 2026-09-02、クラウド側の送信タスクが「_build/ を作り直して OneDrive と照合する」
// 手順を持っていたため、**PDF が必ず不一致になり、メールが1通も出なくなった。**
// PPTX は pptxgenjs が決定的に作るので一致するが、PDF は LibreOffice が変換のたびに
// 違うバイト列を吐く（作成日時などが埋まる）。**PDF は再現ビルドで照合できない。**
function writePublished(GLIDE, DEST, man) {
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
      throw new Error("出力先に " + name + " が見当たらない");
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
  // イベントJSONは edition_ja / edition_en を持つ。edition は無い。
  // メール本文の「第N報」はここから取るので、拾えないと空欄で出る。
  edition: (ev.meta && (ev.meta.edition_ja || ev.meta.edition || ev.meta.edition_en)) || null,
  update_date: (ev.meta && ev.meta.update_date) || null,
  stamp: (ev.meta && ev.meta.stamp) || null,
  files: files,
  // 配布物との照合結果。クラウド側はこれを見る。作り直して比べない
  verified: man ? "manifest" : null,
  dist_built_at_jst: (man && man.BUILT_AT_JST) || null,
  dist_built_date_jst: (man && man.BUILT_DATE_JST) || null,
};

const dir = path.join(SKILL, "_published");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, GLIDE + ".json"), JSON.stringify(rec, null, 2) + "\n", "utf8");
return rec;
}

if (require.main === module) {
  const GLIDE = process.argv[2];
  const DEST = process.argv[3];
  if (!GLIDE || !DEST) {
    console.error("usage: write_published.js <GLIDE> <dest-folder>");
    process.exit(2);
  }
  try {
    const rec = writePublished(GLIDE, DEST);
    console.log("MARKER: " + rec.published_date_jst + " " + rec.files.length + " files");
  } catch (err) {
    console.error("STATUS: FAIL marker " + err.message);
    process.exit(3);
  }
}
