#!/usr/bin/env node
/*
 * mark_swept.js — 「今日、この災害を確認し終えた」をイベントJSONに書く（ビルド側）
 *
 *   node mark_swept.js <GLIDE> --latest "<機関> YYYY-MM-DD" --changed
 *   node mark_swept.js <GLIDE> --latest "<機関> YYYY-MM-DD" --unchanged
 *
 *   --latest     主たる公式情報源の、確認できた最新発表（例: "UNGRD 2026-10-02"）
 *   --changed    headline の数値が今回動いた
 *   --unchanged  一次情報に到達したうえで動いていない
 *
 * 終了コード
 *   0  記録した（meta.swept を書いた）
 *   7  記録しない（未取り込みの資料が残っている／ReliefWeb に届かない）
 *   2  実行できなかった（引数の誤りなど）
 *
 * ## なぜこれが要るか
 *
 * 2026-10-06（火）、ビルドタスクが5分・出力4,400トークンで「成功」し、
 * **どの災害の資料も開かずに終わった。** コミットも残っていない。
 * その日はコロンビアの週1回の確認日だった。08:50 の送信タスクは
 * 10/4 の第28報をそのまま送った。数値は結果的に最新だったが、**確かめた者はいない。**
 * ネパールには UNICEF 人道状況報告 第6号（10/5）が取り込まれずに残っていた。
 *
 * 送信側には「今日ちゃんと見たか」を知る手段が無かった。ここで残す。
 *
 * ## 記録を拒む条件
 *
 * `scan_updates.js <GLIDE>` が **STATUS: NONE** を返さない限り書かない。
 * 開いた資料は、関係なくても `_note` を付けて `links[]` に足す運用なので
 * （§1-1 (1)）、きちんと見た日は未取り込みが0件になる。
 * **0件にならないのは、見ていない資料が残っているということである。**
 *
 * 送信側の `sweep_gate.js` が、この記録の日付を見て送るかどうかを決める。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL = path.resolve(__dirname, "..", "..");
const EVENTS = path.join(SKILL, "events");

function jstNow() {
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const p = (n) => String(n).padStart(2, "0");
  const date = jst.getFullYear() + "-" + p(jst.getMonth() + 1) + "-" + p(jst.getDate());
  return { date: date, at: date + " " + p(jst.getHours()) + ":" + p(jst.getMinutes()) };
}

function fail(msg) { console.error(msg); process.exit(2); }

const argv = process.argv.slice(2);
const glide = argv.find(a => !a.startsWith("--"));
const li = argv.indexOf("--latest");
const latest = li >= 0 ? (argv[li + 1] || "") : "";
const changed = argv.includes("--changed");
const unchanged = argv.includes("--unchanged");

if (!glide) fail("使い方: node mark_swept.js <GLIDE> --latest \"<機関> YYYY-MM-DD\" --changed|--unchanged");
const file = path.join(EVENTS, glide + ".json");
if (!fs.existsSync(file)) fail("イベントが無い: " + file);
if (!/\d{4}-\d{2}-\d{2}/.test(latest)) fail("--latest に「機関名 YYYY-MM-DD」を渡す（例: \"UNGRD 2026-10-02\"）。受け取った値: " + JSON.stringify(latest));
if (changed === unchanged) fail("--changed か --unchanged のどちらか一方を渡す");

// 未取り込みが残っていないかを scan_updates.js に判定させる。ここでは数え直さない。
const r = spawnSync(process.execPath, [path.join(__dirname, "scan_updates.js"), glide], { encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
const st = /^STATUS: (NEW|UNREACHABLE|NONE)\b/m.exec(out);
if (!st) { console.log(out); fail("scan_updates.js の判定が読めない"); }

if (st[1] !== "NONE") {
  const urls = out.split("\n").filter(l => /^\s+https:\/\/reliefweb\.int\//.test(l)).map(l => l.trim());
  console.log("STATUS: NOT-SWEPT " + glide + "  (" + st[1] + ")");
  if (st[1] === "NEW") {
    console.log("未取り込みの資料が " + urls.length + " 件残っている。開いて links[] に足してから、もう一度実行する。");
    console.log("関係ない資料も `_note` を付けて足す（§1-1 (1)）。");
    urls.forEach(u => console.log("  " + u));
  } else {
    console.log("ReliefWeb に届いていない。**「変化なし」として記録しない。**");
  }
  process.exit(7);
}

const d = JSON.parse(fs.readFileSync(file, "utf8"));
const t = jstNow();
d.meta.swept = {
  date_jst: t.date,
  at_jst: t.at,
  latest_official: latest,
  changed: changed,
  _note: "mark_swept.js が書く。送信側 sweep_gate.js がこの日付を見る。手で書き換えない。",
};
fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
console.log("STATUS: SWEPT " + glide + "  " + t.at + " JST  最新発表: " + latest + "  " + (changed ? "数値が動いた" : "変化なし"));
process.exit(0);
