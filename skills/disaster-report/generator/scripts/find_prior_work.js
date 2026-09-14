#!/usr/bin/env node
/*
 * find_prior_work.js — 同じ災害について、**他のセッションが既に作ったもの**を探す。
 *
 *   node scripts/find_prior_work.js EQ-2026-000150-IDN
 *   node scripts/find_prior_work.js IDN Flores
 *
 * ## なぜこれが要るか
 *
 * 2026-08-28、インドネシアのレポートを一から作った。作り終えたあとで、
 * 荒木田さんから既に出来上がった日英併記版（`ADRC_EQ_IDN_Flores_20260815_BI.pptx`）を
 * 渡された。**別のセッションの Claude が作っていた。**
 * 同じ日に、コロンビアでも同じことが起きていた。`main` に
 * `reports/colombia_eq_20260810/` があり、そこでは figures を
 * `_ja` / `_es` と言語別に持つ仕組みまで出来ていた。私はその問題を
 * 「図は英語だけにする」という後退で回避していた。
 *
 * 原因は単純で、**見に行っていなかった。** セッションは main を clone して始まり、
 * 他のセッションの成果は別のブランチに乗っている。手元に無いので、無いものとして
 * 作り直してしまう。荒木田さんの言葉:
 *
 *   「Claudeの他のセッションで作ったものです。他のセッションの経験を使えないと困ります。」
 *
 * ## 何を見るか
 *
 *   1. リモートの全ブランチ（他セッションの作業ブランチを含む）のファイル一覧
 *   2. 全ブランチのコミット件名
 *   3. 配布ブランチ dist に既に置かれている成果物
 *   4. このスキルの events/ と references/sources/
 *
 * 出力に何か出たら、**作り始める前に中身を読むこと。**
 * 「見当たらない」は「無い」ではない。プッシュされていない成果物は見えない。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SKILL = path.resolve(__dirname, "..", "..");
const REPO = path.resolve(SKILL, "..", "..");
const SELF = (() => { try { return git("rev-parse", "--abbrev-ref", "HEAD"); } catch (_) { return ""; } })();

function git(...a) { return execFileSync("git", a, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim(); }
function quiet(...a) { try { return git(...a); } catch (_) { return ""; } }

const terms = process.argv.slice(2).filter(t => !t.startsWith("--"));
if (!terms.length) {
  console.error("usage: find_prior_work.js <GLIDE|ISO3|キーワード> [...]");
  console.error("  例: find_prior_work.js EQ-2026-000150-IDN");
  process.exit(2);
}

// GLIDE を渡されたら、そこから探し語を増やす。
// 別セッションはファイル名に GLIDE を使っていないことが多い（reports/colombia_eq_...）。
const words = new Set();
for (const t of terms) {
  words.add(t.toLowerCase());
  const m = /^([A-Z]{2})-(\d{4})-(\d{6})-([A-Z]{3})$/.exec(t.toUpperCase());
  // 年（m[2]）は入れない。"2026" は全部のファイル名に当たって、探索の意味が無くなる。
  if (m) { words.add(m[4].toLowerCase()); words.add(m[3]); }
}
// ISO3 → 別セッションが使いそうな綴り。ここに無い国は ISO3 だけで拾う。
const ALIAS = {
  col: ["colombia"], idn: ["indonesia", "flores"], npl: ["nepal", "rasuwa"],
  jpn: ["japan", "kumamoto"], phl: ["philippines"], tha: ["thailand"],
  vnm: ["vietnam"], mmr: ["myanmar"], ind: ["india"], pak: ["pakistan"],
  bgd: ["bangladesh"], lka: ["srilanka", "sri_lanka"], khm: ["cambodia"],
  mng: ["mongolia"], kaz: ["kazakhstan"], tur: ["turkey", "turkiye"],
};
for (const w of [...words]) for (const a of ALIAS[w] || []) words.add(a);
const RE = new RegExp([...words].map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

console.log("── 探す語: " + [...words].join(", "));

// 他のセッションの成果は、こちらが fetch するまで見えない
for (let i = 0; i < 4; i++) {
  try { git("fetch", "--prune", "origin"); break; }
  catch (_) { if (i < 3) execFileSync("sleep", [String(2 ** (i + 1))]); }
}

const branches = quiet("for-each-ref", "--format=%(refname:short)", "refs/remotes/origin")
  .split("\n").map(s => s.trim()).filter(b => b && !/->/.test(b));

let hits = 0;

console.log("\n■ ブランチごとのファイル");
for (const b of branches) {
  const listing = quiet("ls-tree", "-r", "--name-only", b);
  const files = listing.split("\n").filter(f => f && RE.test(f));
  if (!files.length) continue;
  hits += files.length;
  const mine = b === "origin/" + SELF;
  const dst = /\/dist$/.test(b);
  const tag = mine ? "  ← いま自分がいるブランチ"
            : dst  ? "  ← 配布ブランチ（PC が取りに来る成果物）"
                   : "  ← **別のセッション**";
  console.log("\n  " + b + tag + "   (" + files.length + "件)");
  const dirs = new Map();
  for (const f of files) {
    const dir = path.posix.dirname(f);
    dirs.set(dir, (dirs.get(dir) || 0) + 1);
  }
  for (const [dir, n] of [...dirs].sort()) {
    console.log("     " + dir + "/   " + n + "件");
  }
  if (!mine && !dst) {
    console.log("     読む:  git show " + b + ":<パス>");
    console.log("     一覧:  git ls-tree -r --name-only " + b + " | grep -i " + terms[0]);
  }
}
if (!hits) console.log("  （該当なし）");

console.log("\n■ コミット件名");
const log = quiet("log", "--all", "--oneline", "--no-merges", "-40",
  "--regexp-ignore-case", ...[...words].map(w => "--grep=" + w));
if (log) {
  for (const line of log.split("\n")) console.log("  " + line);
  hits++;
} else {
  console.log("  （該当なし）");
}

console.log("\n■ 配布ブランチ dist");
const dist = quiet("ls-tree", "--name-only", "origin/dist");
if (dist) {
  for (const g of dist.split("\n").filter(Boolean)) {
    console.log("  " + g + (RE.test(g) ? "   ← これ" : ""));
  }
} else {
  console.log("  （dist が取れない）");
}

console.log("\n■ このスキルの中");
for (const [label, dir] of [["events", path.join(SKILL, "events")],
                            ["references/sources", path.join(SKILL, "references", "sources")],
                            ["_published", path.join(SKILL, "_published")]]) {
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => RE.test(n)); } catch (_) {}
  console.log("  " + label + ": " + (names.length ? names.join(", ") : "（なし）"));
}

console.log("");
if (hits) {
  console.log("**作り始める前に、上に出たものを読むこと。**");
  console.log("一から作り直すと、既にある図・訳語・出典の判断を捨てることになる。");
} else {
  console.log("見当たらなかった。ただし **「無い」ではない。**");
  console.log("プッシュされていない成果物と、荒木田さんの PC にあるものは、ここには出ない。");
  console.log("表紙や図で迷ったら、既存のデッキが無いかを先に尋ねる。");
}
