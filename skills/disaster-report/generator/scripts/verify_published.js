#!/usr/bin/env node
/*
 * verify_published.js — 送信の前提を確かめる。**作り直して比べない。**
 *
 *   node verify_published.js <GLIDE>
 *
 * 終了コード
 *   0  送ってよい
 *   1  送らない（理由を表示する）
 *
 * なぜ「作り直して比べない」のか
 * ------------------------------
 * 2026-09-02、送信タスクが1通もメールを出さなくなった。プロンプトに
 * 「_build/ を作り直して OneDrive のバイト数と照合し、MISMATCH なら送らない」
 * という手順が入っていたためである。
 *
 *   PPTX  pptxgenjs が決定的に作る          → 何度作っても一致する
 *   PDF   LibreOffice が変換のたびに違う値  → **絶対に一致しない**
 *
 * 定期タスクは毎回まっさらなセッションで走るので `_build/` が無く、必ず作り直す。
 * つまりこの照合は**構造的に必ず落ちる。** コロンビア第14報とインドネシア第3報が
 * OneDrive に入っているのに、メールだけ出ないという形で表に出た。
 *
 * バイト数の照合は、**PC側が配布台帳（manifest.txt）と突き合わせて済ませている**
 * （publish_local.js。違えば STATUS: FAIL size で止まり、記録も書かれない）。
 * ここでは、その記録が当日のものであることだけを確かめる。二重にやらない。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SKILL = path.resolve(__dirname, "..", "..");
const glide = process.argv[2];
if (!glide) { console.error("usage: verify_published.js <GLIDE>"); process.exit(2); }

const now = new Date();
const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
const pad = n => String(n).padStart(2, "0");
const today = jst.getFullYear() + "-" + pad(jst.getMonth() + 1) + "-" + pad(jst.getDate());

const pub = path.join(SKILL, "_published", glide + ".json");
const skip = path.join(SKILL, "_published", glide + ".skipped.json");

console.log("── 公開の確認  " + glide + "  （今日 " + today + " JST）");

// 見送りと成功の両方が今日あることがある。**新しいほうが本当である。**
// 2026-09-02、08:10 の見送り（配布物が前日ビルド）のあと、配布を作り直して
// 09:22 に成功したのに、見送りのほうを先に見て NO-SEND を返した。
const pubRec = fs.existsSync(pub) ? JSON.parse(fs.readFileSync(pub, "utf8")) : null;
const pubStamp = (pubRec && pubRec.published_at_jst) || "";

if (fs.existsSync(skip)) {
  const sk = JSON.parse(fs.readFileSync(skip, "utf8"));
  const skipStamp = sk.skipped_at_jst || "";
  const skipIsNewer = skipStamp > pubStamp;      // 文字列比較で足りる形式
  if (skipStamp.slice(0, 10) === today && skipIsNewer) {
    console.log("   PCは動いたが、配布物が当日ビルドでないため飛ばしている。");
    console.log("   skipped_at_jst = " + sk.skipped_at_jst);
    console.log("   dist_built_date_jst = " + sk.dist_built_date_jst);
    console.log("STATUS: NO-SEND stale-dist");
    console.log("  クラウド側で build_all.js を回し直し、PCで ADRC_setup_and_publish.bat を実行する。");
    process.exit(1);
  }
}

if (!fs.existsSync(pub)) {
  console.log("   公開記録が無い。PCが LargeScaleDisasters へ出していない。");
  console.log("STATUS: NO-SEND no-record");
  process.exit(1);
}

const r = pubRec;
console.log("   published_at_jst = " + r.published_at_jst + "   " + (r.edition || ""));
for (const f of r.files) console.log("     " + f.name + "  " + f.bytes + " bytes");

if (r.published_date_jst !== today) {
  // **なぜ古いのかを言う。** 「old-record」だけでは打つ手が分からない。
  // 2026-09-05、荒木田さんのPCがオフラインで3件とも止まったが、
  // 報告は「NO-SEND old-record 2026-09-04」としか言わなかった。
  //
  //   今日の見送り記録がある   → PCは動いた。配布物が当日ビルドでなく飛ばした
  //   今日の見送り記録も無い   → **PCがそもそも動いていない**（電源・ネットワーク・
  //                              タスクスケジューラのいずれか）
  const skipToday = fs.existsSync(skip)
    && (JSON.parse(fs.readFileSync(skip, "utf8")).skipped_at_jst || "").slice(0, 10) === today;
  console.log("   公開日が今日ではない（" + r.published_date_jst + "）。");
  if (skipToday) {
    console.log("   今日の見送り記録がある。**PCは動いたが、配布物が当日ビルドでないため飛ばした。**");
    console.log("STATUS: NO-SEND old-record " + r.published_date_jst + " (pc-skipped)");
  } else {
    console.log("   今日の見送り記録も無い。**PCがそもそも動いていない。**");
    console.log("   電源が入っていないか、ネットワークに繋がっていないか、");
    console.log("   タスクスケジューラの定期実行（08:10 JST）が走っていない。");
    console.log("   対処: PCで C:\\Users\\arakida\\ADRC_setup_and_publish.bat を実行する。");
    console.log("STATUS: NO-SEND old-record " + r.published_date_jst + " (pc-not-run)");
  }
  process.exit(1);
}

// 配布台帳との照合は publish_local.js が済ませている。その事実を確かめるだけ。
if (r.verified === "manifest") {
  console.log("   配布台帳と照合済み（PC側）。dist ビルド " + (r.dist_built_at_jst || "不明"));
} else {
  console.log("   ※ この記録には照合の印が無い（PC側が古い publish_local.js で書いた記録）。");
  console.log("      ファイルは出ている。**作り直して比べないこと。PDFは必ず不一致になる。**");
}

console.log("STATUS: SEND-OK");
process.exit(0);
