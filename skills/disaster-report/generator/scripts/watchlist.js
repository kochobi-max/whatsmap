#!/usr/bin/env node
// レポート化を見送った災害の判断台帳。
//
// 毎朝の定期タスクが、センチネルアジアの通知メールで未レポートの要請番号を見つけたときに、
// 「これは前に人が見送ったものか」「見送ったが、その後の被害拡大で再提案すべきか」を
// 機械に判定させるためのもの。人の記憶に頼ると、同じ件を毎日報告し続けるか、
// 拡大したときに誰も気づかないかのどちらかになる。
//
// 使い方
//   node watchlist.js                              台帳を表示する
//   node watchlist.js --check SA-00659             その番号が既決かどうかを判定する
//   node watchlist.js --check SA-00659 --deaths 140
//   node watchlist.js --check SA-00659 --charter --deaths 12
//
// 終了コード
//   0  HOLD    既に人が見送っている。しきい値も超えていない → 報告に書かない
//   3  NEW     台帳に無い → 報告に1行書いて、人の判断を仰ぐ
//   4  RERAISE 見送ったが、しきい値を超えた → 報告に書いて、再提案する

const fs = require("fs");
const path = require("path");

const WATCHLIST = path.join(__dirname, "..", "..", "events", "_watchlist.json");
const EVENTS_DIR = path.join(__dirname, "..", "..", "events");

function load() {
  if (!fs.existsSync(WATCHLIST)) {
    console.error("台帳が見つからない: " + WATCHLIST);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(WATCHLIST, "utf8"));
}

function parseArgs(argv) {
  const o = { check: null, deaths: null, magnitude: null,
              charter: false, adrcRequester: false, jdr: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") o.check = argv[++i];
    else if (a === "--deaths") o.deaths = Number(argv[++i]);
    else if (a === "--magnitude") o.magnitude = Number(argv[++i]);
    else if (a === "--charter") o.charter = true;
    else if (a === "--adrc-requester") o.adrcRequester = true;
    else if (a === "--jdr") o.jdr = true;
    else { console.error("知らない引数: " + a); process.exit(2); }
  }
  if (o.deaths !== null && !Number.isFinite(o.deaths)) { console.error("--deaths が数値でない"); process.exit(2); }
  if (o.magnitude !== null && !Number.isFinite(o.magnitude)) { console.error("--magnitude が数値でない"); process.exit(2); }
  return o;
}

// 既にレポート対象になっているか（events/*.json の activation 番号を見る）
function coveredEventFor(id) {
  for (const f of fs.readdirSync(EVENTS_DIR)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const raw = fs.readFileSync(path.join(EVENTS_DIR, f), "utf8");
    if (raw.includes(id)) return f.replace(/\.json$/, "");
  }
  return null;
}

function findEntry(db, id) {
  const key = String(id).trim().toUpperCase();
  return db.entries.find(e =>
    String(e.id).toUpperCase() === key ||
    String(e.iso3 || "").toUpperCase() === key ||
    String(e.glide || "").toUpperCase() === key) || null;
}

function list(db) {
  console.log("レポート化を見送った災害（判断基準: ldi-cms-report SKILL.md Step 5.5）\n");
  if (!db.entries.length) { console.log("  （台帳は空）"); return; }
  for (const e of db.entries) {
    const r = e.reconsider_if || {};
    console.log(`  ${e.id}  ${e.country_ja}（${e.iso3}）  ${e.hazard_ja}`);
    console.log(`      要請 ${e.requested} / 判断 ${e.decided_on} ${e.decided_by || ""}`);
    console.log(`      ${e.decision_ja}`);
    if (e.why_not_ja) console.log(`      見送りの理由: ${e.why_not_ja}`);
    const conds = [];
    if (r.deaths_at_least != null) conds.push(`死者${r.deaths_at_least}人以上`);
    if (r.magnitude_at_least != null) conds.push(`M${r.magnitude_at_least}以上かつ死者確認`);
    if (r.charter_activated) conds.push("国際災害チャーター発動（センチネルアジアEOと併発）");
    if (r.adrc_is_requester) conds.push("ADRCが要請主体のEO");
    if (r.jdr_dispatched) conds.push("日本の国際緊急援助隊派遣");
    console.log(`      再提案の条件（いずれか）: ${conds.join(" ／ ")}`);
    const ob = e.observed || {};
    if (ob.deaths != null) console.log(`      直近の把握: 死者 ${ob.deaths} 人（${ob.as_of || "日付不明"}）`);
    else console.log(`      直近の把握: 死者数 未確認`);
    console.log("");
  }
  console.log(`STATUS: ${db.entries.length} 件`);
}

function check(db, o) {
  const covered = coveredEventFor(o.check);
  if (covered) {
    console.log(`${o.check} は既にレポート対象。イベント: ${covered}`);
    console.log("STATUS: HOLD covered");
    process.exit(0);
  }

  const e = findEntry(db, o.check);
  if (!e) {
    console.log(`${o.check} は台帳に無い。人がまだ判断していない。`);
    console.log("報告に1行書いて、レポート化するかどうかを尋ねること。自分で events/ を作らない。");
    console.log("STATUS: NEW");
    process.exit(3);
  }

  const r = e.reconsider_if || {};
  const hit = [];
  if (r.deaths_at_least != null && o.deaths !== null && o.deaths >= r.deaths_at_least)
    hit.push(`死者 ${o.deaths} 人（基準 ${r.deaths_at_least} 人以上）`);
  if (r.magnitude_at_least != null && o.magnitude !== null && o.magnitude >= r.magnitude_at_least
      && o.deaths !== null && o.deaths > 0)
    hit.push(`M${o.magnitude} かつ死者確認（基準 M${r.magnitude_at_least} 以上）`);
  if (r.charter_activated && o.charter)
    hit.push("国際災害チャーター発動（センチネルアジアEOと併発）");
  if (r.adrc_is_requester && o.adrcRequester) hit.push("ADRCが要請主体のEO");
  if (r.jdr_dispatched && o.jdr) hit.push("日本の国際緊急援助隊派遣");

  console.log(`${o.check}  ${e.country_ja}（${e.iso3}）  ${e.hazard_ja}`);
  console.log(`${e.decided_on} に人が見送っている: ${e.decision_ja}`);

  if (!hit.length) {
    const known = (o.deaths !== null || o.magnitude !== null || o.charter || o.adrcRequester || o.jdr);
    if (!known) {
      console.log("今回の観測値を渡していない。数値が分かっているなら --deaths などを付けて判定し直すこと。");
    }
    console.log("再提案の条件に達していない。報告に書かない。");
    console.log("STATUS: HOLD");
    process.exit(0);
  }

  console.log("");
  console.log("再提案の条件に達した:");
  for (const h of hit) console.log("  - " + h);
  console.log("");
  console.log("報告に書き、レポート化するかどうかを人に尋ねること。自分で events/ を作らない。");
  console.log("承認されたら _watchlist.json の当該行を消し、events/<GLIDE>.json を作る。");
  console.log("STATUS: RERAISE");
  process.exit(4);
}

const o = parseArgs(process.argv.slice(2));
const db = load();
if (o.check) check(db, o); else list(db);
