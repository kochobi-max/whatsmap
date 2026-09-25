#!/usr/bin/env node
/*
 * build_all.js — active な全イベントを、検証 → ビルド → 配布まで通す
 *
 *   node scripts/build_all.js              # 全 active イベント
 *   node scripts/build_all.js <GLIDE> ...  # 指定したものだけ
 *   node scripts/build_all.js --no-dist    # 配布しない（手元で見るだけ）
 *
 * ## なぜこれが要るか
 *
 * 定期タスクをイベントごとに作っていたため、コロンビアだけに3本あり、
 * ネパールとインドネシアには1本も無かった。**災害が増えるたびに人がタスクを
 * 作らなければならない作りは、いつか抜ける。** 実際に抜けた。
 *
 * ここで全 active イベントをまとめて回す。災害が増えたときにすることは
 * `events/<GLIDE>.json` を1本足すことだけになる。タスクは触らない。
 *
 * ## 1件が落ちても、他を止めない
 *
 * 情報源に届かない、ビルドが失敗する、といったことは1件ずつ起きる。
 * 全部を巻き添えにしない。最後に表でまとめ、1件でも落ちていれば
 * 終了コードを 1 にする。
 *
 * 終了コード: 0 = 全件成功 / 1 = 1件以上失敗 / 2 = 実行できなかった
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HERE = __dirname;
const SKILL = path.resolve(HERE, "..", "..");
const EVENTS = path.join(SKILL, "events");

const args = process.argv.slice(2);
const NO_DIST = args.includes("--no-dist");
const only = args.filter(a => !a.startsWith("--"));

function activeGlides() {
  return fs.readdirSync(EVENTS)
    .filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .map(f => f.slice(0, -5))
    .filter(g => {
      try { return JSON.parse(fs.readFileSync(path.join(EVENTS, g + ".json"), "utf8")).meta.status === "active"; }
      catch (_) { return false; }
    });
}

function run(script, argv) {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...argv],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out);
  return { code: r.status === null ? 1 : r.status, out };
}

function lastStatus(out) {
  const lines = out.split("\n").filter(l => /^\s*STATUS:/.test(l));
  return lines.length ? lines[lines.length - 1].trim() : "";
}

function main() {
  const glides = only.length ? only : activeGlides();
  if (!glides.length) { console.error("STATUS: FAIL no-active-event"); process.exit(2); }

  const rows = [];
  for (const g of glides) {
    console.log("");
    console.log("========================================================");
    console.log("  " + g);
    console.log("========================================================");

    // 1. 情報源に届くか。**届かないことと変化がないことは別である。**
    console.log("\n-- check_sources");
    // 1回の失敗で決めない。**一度きりのタイムアウトを「遮断」と読み違えない。**
    // 2026-08-30、コロンビアが1回目だけ落ち、2回目以降は11件すべて到達できた。
    // 遮断なら何度やっても落ちるので、落ちた時だけ1回やり直す。
    let cs = run("check_sources.js", [g]);
    if (cs.code !== 0) {
      console.log("\n-- check_sources（1回目が落ちたのでやり直す）");
      cs = run("check_sources.js", [g]);
    }
    if (cs.code !== 0) {
      const ng = (cs.out.match(/^NG\s+(\S+)/gm) || [])
        .map(l => l.replace(/^NG\s+/, "")).join(", ");
      rows.push({ g, r: "SOURCES-FAIL",
                  note: "到達できない: " + (ng || "不明") + " — 変化なしと結論しないこと" });
      continue;                                   // 届かないならビルドもしない
    }
    // WARN はビルドを止めない。**ただしまとめの行に残し、報告から消えないようにする。**
    // 2026-09-02、DHM 1件の不調でネパールが丸ごと1日抜けた。止めない代わりに、
    // 「今日はこの情報源を見られていない」を最後まで持ち回る。
    const warnHosts = /SOURCES: WARN/.test(cs.out)
      ? (cs.out.match(/^\s+(\S+)\s+— /gm) || []).map(l => l.trim().split(/\s+/)[0]).join(", ")
      : "";

    // 2. 検証と数値急変ゲート。HOLD でもビルドはする（メールを送らないだけ）
    console.log("\n-- resolve_event");
    const rv = run("resolve_event.js", ["--event", g]);
    if (rv.code === 3 || rv.code === 4) {
      rows.push({ g, r: "INVALID", note: "スキーマ違反。直すまでビルドしない" });
      continue;
    }
    const gate = rv.code === 2 ? "HOLD" : "OK";

    // 3. ビルド
    console.log("\n-- build_event");
    const bd = run("build_event.js", [g]);
    if (bd.code !== 0) {
      rows.push({ g, r: "BUILD-FAIL", note: lastStatus(bd.out) });
      continue;
    }
    const pages = (lastStatus(bd.out).match(/JA=\d+p EN=\d+p/) || [""])[0];

    // 4. 配布。**これを飛ばすとPCが当日ぶんを取れず、OneDrive が前日のまま据え置かれる。**
    const warnNote = warnHosts ? "  ⚠未到達: " + warnHosts : "";
    if (NO_DIST) { rows.push({ g, r: gate, note: pages + "（配布なし）" + warnNote }); continue; }
    console.log("\n-- publish_dist");
    const pb = run("publish_dist.js", [g]);
    rows.push({
      g, r: pb.code === 0 ? gate : "DIST-FAIL",
      note: (pb.code === 0 ? pages : lastStatus(pb.out)) + warnNote,
    });
  }

  console.log("");
  console.log("========================================================");
  console.log("  まとめ");
  console.log("========================================================");
  for (const r of rows) {
    console.log("  " + r.g.padEnd(22) + " " + r.r.padEnd(13) + " " + r.note);
  }
  const bad = rows.filter(r => /FAIL|INVALID/.test(r.r));
  const hold = rows.filter(r => r.r === "HOLD");
  console.log("");
  if (hold.length) {
    console.log("  HOLD のイベントは**メールを送らない**。理由は上の resolve_event の行にある。");
  }
  if (bad.length) {
    console.log("STATUS: BUILD-ALL-PARTIAL  " + bad.length + " 件が落ちた: " +
                bad.map(r => r.g).join(", "));
    process.exit(1);
  }
  console.log("STATUS: BUILD-ALL-OK  " + rows.length + " 件");
}

main();
