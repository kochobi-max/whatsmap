#!/usr/bin/env node
/*
 * warning_gate.js — 進行中の警告だけを、OneDrive保存を待たずに先に出す
 *
 *   node warning_gate.js <GLIDE>            判定して、送るなら本文を出す
 *   node warning_gate.js <GLIDE> --record   送ったことを記録する（送信後に呼ぶ）
 *   node warning_gate.js                    active な全イベントを判定する
 *
 * 終了コード
 *   0  送らない（該当なし／送信済み）
 *   3  送る（本文を標準出力に出してある）
 *   2  実行できなかった
 *
 * ## なぜこれが要るか
 *
 * 2026-09-19〜09-23 の5日間、荒木田さんのPCが動かなかった（休日）。
 * クラウド側は毎日ビルドして配布していたが、**メールは1通も出ていない。**
 * 送信タスクが毎朝「PC側の公開が今日でない」で見送っていたためである。
 * ゲートとしては正しい。存在しないファイルを「保存しました」と書いて送るよりよい。
 *
 * ただし、この5日のあいだ溜まっていたものの中に
 * **レンデ川の閉塞で上流に推定0.11km²の湖が形成され、NDRRMAが洪水リスクの
 * 継続を警告している**という内容が含まれていた。09-24 にようやく出た。
 *
 * **人命に関わる警告が、PCの電源に依存していた。**
 *
 * 荒木田さんの判断（2026-09-24）で、警告だけは切り離す。
 * レポート本体の保存を待たず、**本文だけ先に送る。**
 *
 * ## 書かないこと
 *
 * この経路のメールは **「OneDriveに保存しました」と書かない。** 保存されていない。
 * そこを間違えると、通常メールで積み上げてきた信頼がまとめて崩れる。
 * だから本文はここで組み立てて渡す。人にも他のセッションにも書かせない。
 *
 * ## 同じ警告を毎日出さない
 *
 * `active_warnings[]` の各件の指紋（id＋as_of＋本文）を `_warned` に控える。
 * 指紋が変わったときだけ送る。内容が変わらない限り二度目は出ない。
 * **警告が更新された（湖が拡大した、決壊したなど）ときは指紋が変わるので出る。**
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SKILL = path.resolve(__dirname, "..", "..");
const EVENTS = path.join(SKILL, "events");

const argv = process.argv.slice(2);
const RECORD = argv.includes("--record");
const only = argv.filter(a => !a.startsWith("--"));

function activeGlides() {
  return fs.readdirSync(EVENTS)
    .filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .map(f => f.slice(0, -5))
    .filter(g => {
      try { return JSON.parse(fs.readFileSync(path.join(EVENTS, g + ".json"), "utf8")).meta.status === "active"; }
      catch (_) { return false; }
    });
}

function fingerprint(w) {
  return crypto.createHash("sha256")
    .update([w.id || "", w.as_of || "", w.ja || "", w.en || ""].join("\u0000"))
    .digest("hex").slice(0, 16);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 送る本文。**「保存しました」と書かない。**
function body(meta, pending) {
  const title = meta.title_ja || meta.glide;
  const out = [];
  out.push("<p>研究部各位</p>");
  out.push("<p><b>進行中の警告についてのみ、先にお知らせします。</b></p>");
  for (const w of pending) {
    out.push("<p>" + esc(w.ja) + "</p>");
    const src = [w.src, w.as_of].filter(Boolean).map(esc).join("、");
    if (src) out.push("<p>出典：" + src + (w.url ? " <a href=\"" + esc(w.url) + "\">" + esc(w.url) + "</a>" : "") + "</p>");
  }
  out.push("<p><b>レポート本体（PPTX / PDF）は、まだ OneDrive「LargeScaleDisasters」に保存できていません。</b>"
    + "保存でき次第、数値を含む通常の更新メールをあらためてお送りします。"
    + "このメールは警告の内容を早くお伝えするためのもので、"
    + "添付・保存済みファイルの案内ではありません。</p>");
  out.push("<p>数値はすべて速報値です。ご確認のほどよろしくお願いいたします。</p>");
  out.push("<p>データ検索、集計、レポート作成、ファイルアップロード、メール送信、これらはClaude AIを使用しています。誤りがあればお知らせください。</p>");
  out.push("<p>荒木田</p>");
  // 件名は短く保つ。`as_of` は括弧の前までを使う（注記まで入れると読めなくなる）。
  const when = String(pending[0].as_of || "").split(/[（(]/)[0].trim();
  return {
    subject: "ADRC警戒情報：" + title + (when ? "（" + when + "時点）" : ""),
    html: out.join("\n\n")
  };
}

function one(glide) {
  const p = path.join(EVENTS, glide + ".json");
  if (!fs.existsSync(p)) { console.log("   " + glide + " が無い"); return 2; }
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const warns = Array.isArray(d.active_warnings) ? d.active_warnings.filter(w => w && w.active !== false) : [];

  console.log("── 進行中の警告  " + glide);
  if (warns.length === 0) {
    console.log("   active_warnings に該当なし");
    console.log("STATUS: NO-WARNING " + glide);
    return 0;
  }

  const warned = d._warned && typeof d._warned === "object" ? d._warned : {};
  const pending = [];
  for (const w of warns) {
    const id = w.id || "(id無し)";
    const fp = fingerprint(w);
    const bad = [];
    if (!w.id) bad.push("id");
    if (!w.as_of) bad.push("as_of");
    if (!w.ja || !w.en) bad.push("ja/en");
    if (!w.src) bad.push("src");
    if (bad.length) {
      // **黙って落とさない。** 警告を出す経路で取りこぼすのが一番まずい。
      console.log("   ✗ " + id + "  項目が足りない: " + bad.join(", ") + " — 送れない。JSONを直すこと");
      continue;
    }
    if (warned[id] === fp) {
      console.log("   ・" + id + "  送信済み（" + fp + "）");
    } else {
      console.log("   ▲ " + id + "  " + (warned[id] ? "内容が変わった（" + warned[id] + " → " + fp + "）" : "未送信（" + fp + "）"));
      pending.push(w);
    }
  }

  if (pending.length === 0) {
    console.log("STATUS: WARNING-ALREADY-SENT " + glide);
    return 0;
  }

  if (RECORD) {
    d._warned = Object.assign({}, warned);
    for (const w of pending) d._warned[w.id] = fingerprint(w);
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
    console.log("   記録した: " + pending.map(w => w.id).join(", "));
    console.log("STATUS: WARNING-RECORDED " + glide);
    return 0;
  }

  const b = body(d.meta || {}, pending);
  console.log("");
  console.log("   宛先: kenkyubu@adrc.asia, td-date@adrc.asia   差出人: ma-arakida@adrc.asia");
  console.log("   件名: " + b.subject);
  console.log("");
  console.log("----- ここから本文HTML（そのまま body に渡す。書き換えない） -----");
  console.log(b.html);
  console.log("----- ここまで -----");
  console.log("");
  console.log("   送信できたら必ず: node warning_gate.js " + glide + " --record");
  console.log("STATUS: WARNING-SEND " + glide);
  return 3;
}

let rc = 0;
const list = only.length ? only : activeGlides();
if (list.length === 0) { console.log("active なイベントが無い"); process.exit(2); }
for (const g of list) {
  const r = one(g);
  if (r === 3) rc = 3;
  else if (r === 2 && rc === 0) rc = 2;
  console.log("");
}
process.exit(rc);
