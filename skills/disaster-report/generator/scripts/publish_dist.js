#!/usr/bin/env node
/*
 * publish_dist.js — ビルド済みの4ファイルを配布用ブランチへ置く。
 *
 *   node publish_dist.js <GLIDE> [<ビルド出力フォルダ>] [--branch dist] [--dry-run]
 *
 * なぜこれが要るか。
 *   PDF 変換には LibreOffice が要るが、荒木田さんのPCには入っていない。
 *   入れてもらうのではなく、クラウド側で PPTX も PDF も作り、
 *   PC には「出来上がったものを取ってきて OneDrive へ置く」だけをしてもらう。
 *
 * 置き方。
 *   毎日16MBを main の履歴に積むわけにはいかないので、配布用の孤立ブランチを
 *   毎回まるごと作り直して force push する。履歴は常に1コミットしか無い。
 *   通常の作業ブランチには一切触らない（index も worktree も使わない）。
 *
 *   **ただし、いま向こうにある他のイベントは読んで残す。**
 *   2026-08-28、ネパールを出した時点でコロンビアが dist から消えた。
 *   PC 側は台帳が 404 なら黙って飛ばすので、前日のファイルが残ったまま
 *   誰も気づかない。押したあとに、残すはずのものが在るかを確かめる。
 *
 * PC 側は raw.githubusercontent.com から curl で取る。リポジトリは public。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); if (i < 0) return null; return args.splice(i, 2)[1]; };
const has = n => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };

const BRANCH = flag("--branch") || "dist";
const DRY = has("--dry-run");
const GLIDE = args[0];
if (!GLIDE) {
  console.error("usage: publish_dist.js <GLIDE> [build-dir] [--branch dist] [--dry-run]");
  process.exit(2);
}

const SKILL = path.resolve(__dirname, "..", "..");
const REPO = path.resolve(SKILL, "..", "..");
const OUTDIR = path.resolve(args[1] || path.join(REPO, "_build", GLIDE));

const git = (...a) => execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim();
const gitBuf = (...a) => execFileSync("git", a, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const gitQuiet = (...a) => { try { return git(...a); } catch (_) { return ""; } };

const ev = JSON.parse(fs.readFileSync(path.join(SKILL, "events", GLIDE + ".json"), "utf8"));
const filebase = ev.meta.filebase;

// ---- 4ファイルがそろっているか。1つでも欠けたら配布しない ----
const names = [];
for (const U of ["JA", "EN"]) for (const ext of ["pptx", "pdf"]) names.push(filebase + "_" + U + "." + ext);

const entries = [];
for (const name of names) {
  const p = path.join(OUTDIR, name);
  if (!fs.existsSync(p)) {
    console.error("STATUS: FAIL dist-missing " + name);
    console.error("  " + OUTDIR + " に見当たらない。先に build_event.js を通すこと。");
    process.exit(3);
  }
  const bytes = fs.statSync(p).size;
  if (bytes < 100 * 1024) {
    console.error("STATUS: FAIL dist-too-small " + name + " " + bytes + "B");
    console.error("  中身が入っていない疑いがある。配布しない。");
    process.exit(3);
  }
  entries.push({ name, path: p, bytes });
}

// ---- PC のバッチが読む台帳。cmd の for /f で読めるよう KEY=VALUE・CRLF ----
const now = new Date();
const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
const pad = n => String(n).padStart(2, "0");
const dateJst = jst.getFullYear() + "-" + pad(jst.getMonth() + 1) + "-" + pad(jst.getDate());
const timeJst = pad(jst.getHours()) + ":" + pad(jst.getMinutes());

// 台帳の決めごとが2つある。どちらも PC の cmd 側の都合。
//
//   1. ASCII だけ。cmd は cp932 で読むので日本語を入れると行が化け、
//      for /f の解析が狂う
//   2. 改行は LF。CRLF にすると for /f が行末の CR を最後のトークンに
//      くっつけることがあり、バイト数の文字列比較が必ず外れる。
//      LF なら CR が付きようがない
const man = [
  "GLIDE=" + GLIDE,
  "FILEBASE=" + filebase,
  "BUILT_DATE_JST=" + dateJst,
  "BUILT_AT_JST=" + dateJst + " " + timeJst,
  "UPDATE_DATE=" + ((ev.meta && ev.meta.update_date) || ""),
  "FILE_COUNT=" + entries.length,
];
entries.forEach((e, i) => {
  man.push("FILE" + (i + 1) + "=" + e.name);
  man.push("BYTES" + (i + 1) + "=" + e.bytes);
});
const manifest = man.join("\n") + "\n";
if (/[^\x20-\x7e\r\n]/.test(manifest)) {
  console.error("STATUS: FAIL manifest-not-ascii");
  console.error("  台帳に ASCII 以外が混じった。cp932 で化けるので配布しない。");
  process.exit(3);
}

console.log("── 配布 " + GLIDE + " → ブランチ " + BRANCH);
for (const e of entries) console.log("   " + e.name + "  " + Math.round(e.bytes / 1024) + "KB");
console.log("   manifest.txt  BUILT_AT_JST=" + dateJst + " " + timeJst);

if (DRY) { console.log("STATUS: DRY-RUN " + BRANCH); process.exit(0); }

// ---- blob を書く。作業ブランチの index には触らない ----
const blobs = [];
for (const e of entries) {
  const sha = git("hash-object", "-w", "--", e.path);
  // 台帳に書いたバイト数と、実際に配る中身の大きさが一致していること。
  // .gitattributes のフィルタが噛むと静かにずれ、PC側はサイズ不一致で
  // 「毎日ダウンロードに失敗する」ように見える。ここで先に気づく。
  const stored = Number(git("cat-file", "-s", sha));
  if (stored !== e.bytes) {
    console.error("STATUS: FAIL dist-filtered " + e.name);
    console.error("  手元 " + e.bytes + "B / 配る中身 " + stored + "B。");
    console.error("  .gitattributes のフィルタが噛んでいる。binary 指定を確認すること。");
    process.exit(3);
  }
  blobs.push({ mode: "100644", sha, name: e.name });
}
{
  // --stdin（--path なし）だと .gitattributes のフィルタが一切かからない。
  // ファイル経由にすると `* text=auto eol=lf` に噛まれて改行が書き換わり、
  // 「書いたものと配ったものが違う」が起きる。実際に1度起こした。
  const sha = execFileSync("git", ["hash-object", "-w", "--stdin"],
    { cwd: REPO, encoding: "utf8", input: manifest }).trim();
  blobs.push({ mode: "100644", sha, name: "manifest.txt" });
}

const mktree = lines =>
  execFileSync("git", ["mktree"], { cwd: REPO, encoding: "utf8", input: lines.join("\n") + "\n" }).trim();

const inner = mktree(blobs.map(b => b.mode + " blob " + b.sha + "\t" + b.name));

// **他のイベントを消さない。**
// 2026-08-28、ネパールを配布した時点でコロンビアが dist から消えた。
// 毎回まるごと作り直す作りだったため、後から出したものが前のを上書きしていた。
// PC 側は台帳が 404 なら「まだ配布されていません」と言って黙って飛ばすので、
// **前日のファイルが置かれたまま、誰も気づかない。**
// いまある dist の中身を読み、このイベントの枝だけ差し替える。
const treeEntries = new Map();
gitQuiet("fetch", "origin", BRANCH);
const listing = gitQuiet("ls-tree", "FETCH_HEAD");
for (const line of listing ? listing.split("\n") : []) {
  const m = /^(\d+)\s+(\w+)\s+([0-9a-f]+)\t(.+)$/.exec(line.trim());
  if (m) treeEntries.set(m[4], m[1] + " " + m[2] + " " + m[3] + "\t" + m[4]);
}
const kept = [...treeEntries.keys()].filter(k => k !== GLIDE);
treeEntries.set(GLIDE, "040000 tree " + inner + "\t" + GLIDE);
const root = mktree([...treeEntries.values()]);
if (kept.length) console.log("   そのまま残す: " + kept.join(", "));

// 親を付けない＝毎回1コミットだけの孤立ブランチ。履歴に16MBが積み上がらない
const msg = "dist " + GLIDE + " " + dateJst + " " + timeJst + " JST\n";
const commit = execFileSync(
  "git", ["commit-tree", root, "-m", msg],
  { cwd: REPO, encoding: "utf8",
    env: Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: "adrc-build", GIT_AUTHOR_EMAIL: "noreply@adrc.asia",
      GIT_COMMITTER_NAME: "adrc-build", GIT_COMMITTER_EMAIL: "noreply@adrc.asia",
    }) }
).trim();

let pushed = false, lastErr = null;
for (let i = 0; i < 4 && !pushed; i++) {
  try {
    gitBuf("push", "--force", "origin", commit + ":refs/heads/" + BRANCH);
    pushed = true;
  } catch (err) {
    lastErr = err;
    if (i < 3) execFileSync("sleep", [String(2 ** (i + 1))]);
  }
}
if (!pushed) {
  console.error("STATUS: FAIL dist-push");
  console.error(String((lastErr && (lastErr.stderr || lastErr.message)) || "").trim());
  process.exit(4);
}

// 終了コードではなく、向こうに何があるかを見る
gitQuiet("fetch", "origin", BRANCH);
const after = new Set((gitQuiet("ls-tree", "--name-only", "FETCH_HEAD") || "").split("\n").filter(Boolean));
const lost = [GLIDE, ...kept].filter(k => !after.has(k));
if (lost.length) {
  console.error("STATUS: FAIL dist-lost " + lost.join(", "));
  console.error("  配布ブランチから消えている。PC はこれらを黙って飛ばす。");
  process.exit(5);
}
console.log("   配布ブランチの中身: " + [...after].sort().join(", "));

const raw = "https://raw.githubusercontent.com/kochobi-max/whatsmap/" + BRANCH + "/" + GLIDE + "/";
console.log("STATUS: DIST " + BRANCH + " " + commit.slice(0, 8));
console.log("   " + raw + "manifest.txt");
