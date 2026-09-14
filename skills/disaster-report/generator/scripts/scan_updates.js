#!/usr/bin/env node
/*
 * scan_updates.js — まだ取り込んでいない一次情報を、イベントごとに一覧にする
 *
 *   node scripts/scan_updates.js            # active な全イベント
 *   node scripts/scan_updates.js <GLIDE>    # 1件だけ
 *
 * ## なぜこれが要るか
 *
 * このスキルで実際に起きた失敗は2つとも「探しに行かなかった」ことだった。
 *
 *   * 2026-08-20〜28、コロンビアの一次情報に一度も到達しないまま「変化なし」を
 *     報告し続け、レポートが11日止まった。その間に死者は 287 → 329 に動いていた
 *   * 2026-08-29、ネパールの IRDR 速報解析を**一覧に出しておきながら題名だけで
 *     判断して開かなかった**。災害の種別を書き換える内容だった
 *
 * どちらも「新しい資料が出ていることに気づけなかった」ではなく、
 * **「気づく手順が無かった」** のが原因である。ここで機械に拾わせる。
 *
 * ## やること
 *
 * ReliefWeb の国別ページ（`/country/<iso3>`）から報告・地図の一覧を取り、
 * **イベントJSONの `links[]` にまだ無いもの**を「未取り込み」として並べる。
 * ReliefWeb は各国の政府発表・国連・NGO・衛星解析の集積点なので、
 * ここに出ていないものは、そもそも公開情報として追いにくい。
 *
 * 判断はしない。**開くべきものを漏れなく机の上に出すだけ。**
 * 題名で切らないこと。`Rapid Analysis` `Situation Report` `Flash Update`
 * `Anatomy` `Assessment` の類は、中身が数値や機構を書き換えることがある。
 *
 * 終了コード: 0 = 実行できた（未取り込みの有無は問わない） / 2 = 実行できなかった
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const HERE = __dirname;
const SKILL = path.resolve(HERE, "..", "..");
const EVENTS = path.join(SKILL, "events");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// 題名にこれが入っていたら、数値や機構を書き換える可能性が高い。先に読む。
const HOT = /rapid analysis|scientific anatomy|situation report|flash update|sitrep|assessment|situation overview|satellite-detected|damage/i;

function curl(url) {
  try {
    return execFileSync("curl", ["-sSL", "--max-time", "60", "-A", UA, url],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (_) { return ""; }
}

function activeEvents(arg) {
  const files = fs.readdirSync(EVENTS).filter(f => f.endsWith(".json") && !f.startsWith("_"));
  const out = [];
  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(EVENTS, f), "utf8")); } catch (_) { continue; }
    if (arg ? d.meta.glide !== arg : d.meta.status !== "active") continue;
    out.push(d);
  }
  return out;
}

// 記事リンクを拾う。ReliefWeb の slug は題名から作られているので、そのまま題名に使える。
// リバーから拾うときだけ必要になる、ISO3 → ReliefWeb の国 slug。
// 国別ページが使えている限りこの表は要らない（多数決で決まる）。
const SLUG = { NPL: "nepal", COL: "colombia", IDN: "indonesia", JPN: "japan",
               PHL: "philippines", VNM: "viet-nam" };

function harvest(html) {
  const seen = new Map();
  const re = /href="(https:\/\/reliefweb\.int\/(?:report|map)\/([a-z-]+)\/([^"]+))"/g;
  let m;
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.set(m[1], { country: m[2], title: m[3].replace(/-/g, " ") });
  }
  return seen;
}

// 国別ページが空を返すことがある。**それを「取り込み済み」と読み違えない。**
// 2026-09-02、reliefweb.int/country/npl が 200 で 32KB を返しながら記事リンクを
// 1件も含まず、scan_updates が「一覧 0 件。すべて links[] に取り込み済み。」と
// 報告した。同じ時刻に col は15件、idn は6件を返している。ネパールだけである。
// 実際には韓国の救助隊派遣（9月1日）など新しい資料が出ていた。
//
// 0件だったときは、更新リバー（/updates）から同じ国 slug の項目を拾い直す。
// それでも0件なら「取得できていない」と言う。「無い」とは言わない。
function listing(iso3) {
  const html = curl("https://reliefweb.int/country/" + iso3.toLowerCase());
  if (!html) return null;                       // 取れなかった。「無い」ではない
  let seen = harvest(html);
  let fellBack = false;
  if (seen.size === 0) {
    // 国別ページが空。更新リバーから拾い直す
    const river = curl("https://reliefweb.int/updates");
    if (river) { seen = harvest(river); fellBack = true; }
  }
  const byCountry = new Map();
  for (const [, v] of seen) byCountry.set(v.country, (byCountry.get(v.country) || 0) + 1);
  // 国別ページには「関連」として他国の項目も並ぶ（南アジア地域版など）。
  // その国のページなのだから、いちばん多い国セグメントがその国である。
  // ISO3 から slug を引く表を持たずに済ませる。
  let own = null, best = 0;
  for (const [c, n] of byCountry) if (n > best) { own = c; best = n; }
  // リバーから拾ったときは「いちばん多い国」が対象国とは限らない。国名で絞る。
  if (fellBack) own = SLUG[iso3.toUpperCase()] || own;
  const rows = [...seen.entries()]
    .filter(([, v]) => v.country === own)
    .map(([url, v]) => ({ url, title: v.title }));
  rows.fellBack = fellBack;
  return rows;
}

function main() {
  const arg = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : null;
  const events = activeEvents(arg);
  if (!events.length) { console.error("対象イベントが無い"); process.exit(2); }

  let anyNew = false, anyUnreachable = false;
  for (const d of events) {
    const m = d.meta;
    console.log("");
    console.log("── " + m.glide + "  " + (m.title_ja || m.title_en || ""));
    console.log("   手元の最終更新: " + (m.stamp || "不明") +
                "  /  headline as_of: " + ((m.headline && m.headline.as_of) || "不明"));

    const items = listing(m.iso3);
    if (items === null) {
      anyUnreachable = true;
      console.log("   ! reliefweb.int/country/" + m.iso3.toLowerCase() + " に到達できない。");
      console.log("     **「新しい資料は無い」と結論しないこと。** 届いていないだけである。");
      continue;
    }
    const cited = new Set((d.links || []).map(l => l.url));
    const fresh = items.filter(it => !cited.has(it.url));
    if (!fresh.length) {
      if (items.length === 0) {
      anyUnreachable = true;
      console.log("   ! 一覧が **0件**。ReliefWeb から記事リンクが1件も取れていない。");
      console.log("     **「新しい資料が無い」ではない。取得できていない。**");
      console.log("     reliefweb.int/country/" + m.iso3.toLowerCase() + " を直接開いて確かめること。");
    } else {
      console.log("   一覧 " + items.length + " 件"
        + (items.fellBack ? "（国別ページが空だったため /updates から取得）" : "")
        + "。すべて links[] に取り込み済み。");
    }
      continue;
    }
    anyNew = true;
    const hot = fresh.filter(it => HOT.test(it.title));
    const rest = fresh.filter(it => !HOT.test(it.title));
    console.log("   一覧 " + items.length + " 件のうち **未取り込み " + fresh.length + " 件**");
    if (hot.length) {
      console.log("");
      console.log("   ▼ 先に開く（数値・機構を書き換えうる題名）");
      for (const it of hot) console.log("     " + it.title + "\n       " + it.url);
    }
    if (rest.length) {
      console.log("");
      console.log("   ▽ そのほか");
      for (const it of rest) console.log("     " + it.title + "\n       " + it.url);
    }
  }

  printWatchlist();

  console.log("");
  if (anyNew) {
    console.log("STATUS: NEW  未取り込みの資料がある。**題名で切らずに開くこと。**");
    console.log("  取り込んだら links[] に URL を足す。次回からここに出なくなる。");
  } else if (anyUnreachable) {
    console.log("STATUS: UNREACHABLE  一部の国別ページに到達できなかった。");
  } else {
    console.log("STATUS: NONE  未取り込みの資料は見当たらない。");
    console.log("  ただし ReliefWeb に出ていないものはここに出ない。政府サイトは別途見ること。");
  }
}

// 見送り済みの災害を毎回そえる。人が「非対応」と判断したものを毎朝報告し直さないため、
// また、被害が拡大したときに誰も気づかないまま流れないため。
// 判定そのものは watchlist.js が持つ（node watchlist.js --check <要請番号> --deaths N）。
function printWatchlist() {
  const wl = path.join(__dirname, "..", "..", "events", "_watchlist.json");
  if (!fs.existsSync(wl)) return;
  let db;
  try { db = JSON.parse(fs.readFileSync(wl, "utf8")); } catch (e) { return; }
  if (!db.entries || !db.entries.length) return;
  console.log("");
  console.log("── レポート化を見送った災害（人が判断済み。毎朝の報告に書かない） ──");
  for (const e of db.entries) {
    console.log("   " + e.id + "  " + e.country_ja + "  " + e.hazard_ja + "  （" + e.decided_on + " 判断）");
  }
  console.log("   被害が拡大していないかは、その都度これで判定する:");
  console.log("     node skills/disaster-report/generator/scripts/watchlist.js --check <要請番号> --deaths <人数>");
  console.log("   STATUS: RERAISE が出たときだけ、報告に書いて人に尋ねる。");
}

main();
