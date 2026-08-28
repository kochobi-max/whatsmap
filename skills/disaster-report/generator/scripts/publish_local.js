#!/usr/bin/env node
/*
 * publish_local.js — クラウドが作った成果物を LargeScaleDisasters へ置く。
 *
 *   node publish_local.js [--setup] [--dest <フォルダ>] [--glide <GLIDE>] [--no-pull]
 *
 * なぜ .bat をやめて Node にしたか（2026-08-28）。
 *
 *   同じ日に3回、荒木田さんに同じ作業をさせてしまった。3回とも原因は
 *   cmd 固有の落とし穴だった。
 *
 *     1. リダイレクトの内側で pause が動き、プロンプトがログへ流れて窓が無言で固まる
 *     2. 「人が見ているか」を cmd から判定できない。タスクスケジューラも
 *        ダブルクリックも別バッチからの call も同じに見える
 *     3. git commit が黙って失敗しても、続く push が 0 を返すので成功に見える
 *
 *   これらは私がこの環境で cmd を実行できないことに起因する。書いたものを
 *   一度も動かさずに渡していた。Node なら手元で通しで試せる。
 *   そして (2) は `process.stdout.isTTY` で答えが出る。cmd には無い情報。
 *
 * .bat 側は node を呼ぶだけにする。ロジックはここにしか無い。
 * ここはクローンの中にあるので、直せば git pull で必ず相手に届く。
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const RAW_BASE = "https://raw.githubusercontent.com/kochobi-max/whatsmap";
const DIST_BRANCH = "dist";
const BRANCH = "claude/workflow-automation-review-shyt35";
const TASKNAME = "ADRC disaster report daily";
const TASK_TIME = "08:10";

// 作らなくなった版。出力先に残っていると、更新されないまま
// 新しいものの隣に並び続ける。名前を挙げたものだけ消す。
const RETIRED_SUFFIXES = ["_ES.pptx", "_ES.pdf"];

// ---------------------------------------------------------------- 引数
const argv = process.argv.slice(2);
const takeFlag = n => { const i = argv.indexOf(n); if (i < 0) return null; return argv.splice(i, 2)[1]; };
const hasFlag = n => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };

const SETUP = hasFlag("--setup");
const CHECK = hasFlag("--check");
const NO_PULL = hasFlag("--no-pull");
const QUIET = hasFlag("--quiet");
const NO_PUSH = hasFlag("--no-push");
const ALLOW_PUSH = hasFlag("--allow-push");
hasFlag("--pause"); // 受け取って捨てる。古い登録を壊さないため
const DEST_ARG = takeFlag("--dest");
const GLIDE_ARG = takeFlag("--glide");
const TODAY_ARG = takeFlag("--today"); // 当日判定を試験するためだけの指定

// --dest を指定するのは試すときだけ。**既定でプッシュしない。**
// 2026-08-28、手元で通しの試験をしたら、テスト用フォルダを出力先として
// 書いた記録がそのまま GitHub へ行った。クラウド側はその記録を見て
// 「OneDrive に保存しました」というメールを出しうる。試験が本番の判断材料を
// 汚してはいけない。押し通すときだけ --allow-push と書く。
const PUSH = !NO_PUSH && (!DEST_ARG || ALLOW_PUSH);

// ---------------------------------------------------------------- ログ
const LOGPATH = path.join(os.tmpdir(), "adrc_daily_publish.txt");
const lines = [];
function say(s) { lines.push(s); console.log(s); }
function flushLog() {
  try { fs.writeFileSync(LOGPATH, lines.join(os.EOL) + os.EOL, "utf8"); } catch (_) {}
}

// ---------------------------------------------------------------- 場所
const SKILL = path.resolve(__dirname, "..", "..");
const REPO = path.resolve(SKILL, "..", "..");

function git(args, opts) {
  return execFileSync("git", args, Object.assign({ cwd: REPO, encoding: "utf8" }, opts || {}));
}
// 出力を捨てない。捨てたせいで「成功したのに何も起きていない」を見逃した
function gitLogged(args) {
  try {
    const out = git(args).trim();
    if (out) out.split(/\r?\n/).forEach(l => say("   | " + l));
    return { ok: true, out };
  } catch (err) {
    const out = String((err.stdout || "") + (err.stderr || "")).trim();
    if (out) out.split(/\r?\n/).forEach(l => say("   | " + l));
    return { ok: false, out };
  }
}
function gitQuiet(args) {
  try { return { ok: true, out: git(args).trim() }; } catch (err) { return { ok: false, out: "" }; }
}

function curl(url, outFile) {
  const args = ["-fsSL", "--retry", "3", "--retry-delay", "3"];
  if (outFile) args.push("-o", outFile);
  try {
    const out = execFileSync("curl", args.concat([url]), { encoding: outFile ? "utf8" : "utf8", maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, body: out };
  } catch (err) {
    return { ok: false, body: "", code: err.status };
  }
}

function todayLocal() {
  if (TODAY_ARG) return TODAY_ARG;
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function nowLocal() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return todayLocal() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

// ---------------------------------------------------------------- 本体
let status = "OK";
let anyPublished = false;

function main() {
  if (!fs.existsSync(path.join(SKILL, "SKILL.md"))) {
    say("STATUS: FAIL no-skill");
    say("  スキル一式が見当たらない: " + SKILL);
    return 3;
  }

  // ---- リポジトリを最新にする ----
  // Node はファイルを起動時に読み切るので、この pull が
  // このスクリプト自身を書き換えても実行中の動作は変わらない。
  // .bat では同じことが事故になる。
  if (!NO_PULL) {
    say("STEP: pull");
    for (const a of [["fetch", "origin", BRANCH], ["checkout", BRANCH], ["pull", "origin", BRANCH]]) {
      const r = gitLogged(a);
      if (!r.ok) {
        say("STATUS: FAIL git");
        say("  git " + a.join(" ") + " が通らなかった。理由は上の行にある。");
        return 3;
      }
    }
  }

  // ---- どのイベントを出すか ----
  const evDir = path.join(SKILL, "events");
  let glides;
  if (GLIDE_ARG) {
    glides = [GLIDE_ARG];
  } else {
    glides = fs.readdirSync(evDir).filter(f => f.endsWith(".json") && !f.startsWith("_"))
      .map(f => f.replace(/\.json$/, ""))
      .filter(g => {
        try { return JSON.parse(fs.readFileSync(path.join(evDir, g + ".json"), "utf8")).meta.status === "active"; }
        catch (_) { return false; }
      });
  }
  if (!glides.length) { say("STATUS: FAIL no-active-event"); return 3; }

  const markers = [];
  for (const glide of glides) {
    const rc = publishOne(glide, markers);
    if (rc !== 0) return rc;
  }

  if (!markers.length) return 0;
  if (!PUSH) {
    say("");
    say("STEP: push  — 見送り（--dest を指定した試験のため）");
    say("   記録は手元にだけ書きました。GitHub へは出していません。");
    say("   本番として出すなら --allow-push を付けてください。");
    return 0;
  }
  pushMarkers(markers);
  return 0;
}

function publishOne(glide, markers) {
  say("");
  say("=== " + glide + " ===");

  const evPath = path.join(SKILL, "events", glide + ".json");
  if (!fs.existsSync(evPath)) {
    say("STATUS: FAIL no-event");
    say("   イベントJSONが無い: " + evPath);
    say("   GLIDE番号の綴りか、ブランチを確認してください。");
    return 3;
  }
  const ev = JSON.parse(fs.readFileSync(evPath, "utf8"));
  const dest = DEST_ARG || (ev.meta && ev.meta.onedrive_dir);
  if (!dest) { say("STATUS: FAIL no-dest-configured"); return 2; }
  if (!fs.existsSync(dest)) {
    say("STATUS: FAIL no-dest");
    say("  出力先が見当たらない: " + dest);
    say("  「OneDrive - adrc.asia」の空白を含め、名前が正確か確認してください。");
    return 2;
  }

  // ---- 台帳 ----
  say("STEP: manifest");
  const base = RAW_BASE + "/" + DIST_BRANCH + "/" + glide;
  const r = curl(base + "/manifest.txt");
  if (!r.ok) {
    say("   " + glide + " はまだ配布されていません。何もコピーしていません。");
    return 0; // 他のイベントを止めない
  }
  const man = {};
  for (const line of r.body.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) man[line.slice(0, i)] = line.slice(i + 1);
  }
  if (man.GLIDE !== glide) { say("STATUS: FAIL manifest-mismatch " + man.GLIDE); return 4; }

  const today = todayLocal();
  say("   ビルド " + man.BUILT_AT_JST + " JST  /  今日 " + today);
  if (man.BUILT_DATE_JST !== today) {
    say("STATUS: SKIP stale-dist");
    say("   配布されている最新は " + man.BUILT_DATE_JST + " のもので、今日のものではない。");
    say("   何もコピーしない。クラウド側はメールを見送る。");
    say("   これは意図した動作。前日のファイルを置き直して");
    say("   「本日更新しました」と書いたメールを出さないため。");
    // **飛ばしたことを、クラウドからも見えるようにする。**
    // 以前はここで何も書かずに終わっていたので、クラウド側からは
    // 「PCが動いて飛ばした」のか「PCが動いていない」のかが区別できなかった。
    // 2026-08-29、コロンビアが08:10の実行で飛ばされていたことに、
    // 荒木田さんに「メールは出さないの？」と聞かれるまで気づけなかった。
    try {
      const dir = path.join(REPO, "skills", "disaster-report", "_published");
      fs.mkdirSync(dir, { recursive: true });
      const rel = "skills/disaster-report/_published/" + glide + ".skipped.json";
      fs.writeFileSync(path.join(dir, glide + ".skipped.json"),
        JSON.stringify({
          glide,
          skipped_at_jst: nowLocal(),
          reason: "stale-dist",
          dist_built_date_jst: man.BUILT_DATE_JST,
          today_jst: today,
          note: "配布ブランチのビルドが当日のものではないため、コピーしていない。" +
                "クラウド側でビルドし直して publish_dist.js を回すこと。",
        }, null, 2) + "\n", "utf8");
      markers.push({ glide, rel });
      say("   記録 " + glide + ".skipped.json（飛ばしたことをクラウドへ伝える）");
    } catch (err) {
      say("   WARN skip-marker: " + err.message);
    }
    return 0;
  }

  // ---- ダウンロード ----
  say("STEP: download");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "adrc-dist-"));
  const got = [];
  const n = Number(man.FILE_COUNT || 0);
  for (let i = 1; i <= n; i++) {
    const name = man["FILE" + i];
    const want = Number(man["BYTES" + i]);
    const to = path.join(work, name);
    if (!curl(base + "/" + name, to).ok) {
      say("STATUS: FAIL download " + name);
      say("   " + dest + " には何もコピーしていない。");
      return 4;
    }
    const bytes = fs.statSync(to).size;
    // 途中で切れたものを、いま出ている良いものに上書きさせない
    if (bytes !== want) {
      say("STATUS: FAIL size " + name + " 取得 " + bytes + " / 台帳 " + want);
      say("   " + dest + " には何もコピーしていない。");
      return 4;
    }
    say("   ok " + name + " " + bytes + " bytes");
    got.push({ name, from: to });
  }

  // ---- コピー ----
  say("STEP: publish");
  for (const f of got) {
    try {
      fs.copyFileSync(f.from, path.join(dest, f.name));
    } catch (err) {
      say("STATUS: FAIL copy-locked " + f.name);
      say("   " + dest + " へ上書きできない。PowerPoint か PDF ビューアで開いたままでは。");
      say("   " + err.message);
      return 5;
    }
  }

  // ---- 作らなくなった版を片づける ----
  for (const suf of RETIRED_SUFFIXES) {
    const p = path.join(dest, man.FILEBASE + suf);
    if (!fs.existsSync(p)) continue;
    try {
      fs.unlinkSync(p);
      say("   削除 " + path.basename(p) + " — もう作らない版。OneDrive のごみ箱から戻せます");
    } catch (err) {
      say("   WARN " + path.basename(p) + " を消せなかった。開いたままかもしれません");
    }
  }

  // ---- 記録 ----
  const { writePublished } = require("./write_published.js");
  let rec;
  try {
    rec = writePublished(glide, dest);
  } catch (err) {
    say("WARN: marker-not-written");
    say("   " + err.message);
    say("   ファイルは出ています。クラウド側はメールを見送ります。");
    anyPublished = true;
    say("STATUS: PUBLISHED " + dest);
    return 0;
  }
  say("STEP: marker  " + rec.published_at_jst + " " + rec.files.length + " files");
  markers.push({ glide, rel: "skills/disaster-report/_published/" + glide + ".json" });

  anyPublished = true;
  say("STATUS: PUBLISHED " + dest);
  for (const f of got) say("   " + f.name);
  return 0;
}

function pushMarkers(markers) {
  say("");
  say("STEP: push");
  for (const m of markers) gitLogged(["add", m.rel]);
  gitLogged(["-c", "user.name=ADRC publish", "-c", "user.email=noreply@adrc.asia",
             "commit", "-m", "chore(disaster-report): published to LargeScaleDisasters"]);
  // クラウドが35分ほど前にこのブランチへ出しているので、先に取り込む
  gitLogged(["pull", "--rebase", "--autostash", "origin", BRANCH]);
  let pushed = gitLogged(["push", "origin", BRANCH]).ok;
  if (!pushed) {
    gitLogged(["pull", "--rebase", "--autostash", "origin", BRANCH]);
    pushed = gitLogged(["push", "origin", BRANCH]).ok;
  }

  // 終了コードを信用しない。GitHub が実際に何を持っているかを見る。
  // 「向こうにファイルがある」でも足りない。前日の記録が残っていれば
  // 今日のコミットが黙って失敗していても通ってしまう。中身で照合する。
  gitQuiet(["fetch", "origin", BRANCH]);
  let allOk = true;
  for (const m of markers) {
    const local = gitQuiet(["hash-object", m.rel]).out;
    const remote = gitQuiet(["rev-parse", "FETCH_HEAD:" + m.rel]).out;
    if (local && remote && local === remote) {
      say("   確認 " + m.glide + " の記録が GitHub にあります " + local.slice(0, 8));
    } else {
      allOk = false;
      say("WARN: marker-not-pushed " + m.glide);
      say("   手元 " + (local || "なし").slice(0, 8) + " / GitHub " + (remote || "なし").slice(0, 8));
    }
  }
  if (!allOk) {
    status = "WARN";
    say("   ファイルは出ています。記録だけが届いていないので、");
    say("   クラウド側はメールを見送ります。理由は上の git の行にあります。");
    say("   初回であれば GitHub のサインイン窓が待っているかもしれません。");
  }
}

// ---------------------------------------------------------------- 点検
// 何も変えない。必要なものが揃っているかを1行ずつ出すだけ。
function check() {
  let bad = 0;
  const ok = (n, v) => say("OK  " + n.padEnd(12) + " " + (v || ""));
  const ng = (n, v) => { say("NG  " + n.padEnd(12) + " " + (v || "")); bad++; };

  for (const name of ["git", "curl"]) {
    try {
      const v = execFileSync(name, ["--version"], { encoding: "utf8" }).split(/\r?\n/)[0];
      ok(name, v);
    } catch (_) { ng(name, "PATH に見当たらない"); }
  }
  ok("node", process.version);

  fs.existsSync(path.join(SKILL, "SKILL.md"))
    ? ok("skill", SKILL)
    : ng("skill", "スキル一式が無い。ブランチ違いでは: " + SKILL);

  const evDir = path.join(SKILL, "events");
  const glides = GLIDE_ARG ? [GLIDE_ARG] : (fs.existsSync(evDir)
    ? fs.readdirSync(evDir).filter(f => f.endsWith(".json") && !f.startsWith("_"))
        .map(f => f.replace(/\.json$/, ""))
        .filter(g => { try { return JSON.parse(fs.readFileSync(path.join(evDir, g + ".json"), "utf8")).meta.status === "active"; } catch (_) { return false; } })
    : []);

  for (const g of glides) {
    let dest = DEST_ARG;
    try { dest = dest || JSON.parse(fs.readFileSync(path.join(evDir, g + ".json"), "utf8")).meta.onedrive_dir; } catch (_) {}
    dest && fs.existsSync(dest) ? ok("出力先", dest) : ng("出力先", dest || "設定が無い");

    const r = curl(RAW_BASE + "/" + DIST_BRANCH + "/" + g + "/manifest.txt");
    if (!r.ok) { ng("配布物", g + " に届かない。まだ出ていないか、社内ネットが塞いでいる"); continue; }
    const m = /BUILT_AT_JST=(.*)/.exec(r.body);
    ok("配布物", g + "  最新ビルド " + (m ? m[1].trim() : "?") + " JST");
  }

  if (process.platform === "win32") {
    taskExists()
      ? ok("定期タスク", "登録済み — 毎日 " + TASK_TIME)
      : say("--  定期タスク   未登録。ADRC_setup_and_publish.bat を1回動かせば入ります");
  }

  say("");
  say(bad === 0 ? "=== すべて OK ===" : "=== NG が " + bad + " 件。上の行に直し方があります ===");
  return bad === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- 定期タスク
function registerTask() {
  say("");
  say("STEP: daily task");
  if (process.platform !== "win32") { say("   Windows ではないので登録しません"); return; }
  const bat = path.join(__dirname, "daily_publish.bat");
  const q = taskExists();
  if (q) { say("   登録済み — 毎日 " + TASK_TIME + " に走ります"); return; }
  try {
    execFileSync("schtasks",
      ["/create", "/tn", TASKNAME, "/tr", '"' + bat + '"', "/sc", "daily", "/st", TASK_TIME, "/f"],
      { encoding: "utf8" });
  } catch (err) {
    say("   WARN 定期タスクを登録できませんでした。ほかはすべて済んでいます。");
    say("   手で入れる場合は、コマンドプロンプトで1行:");
    say('   schtasks /create /tn "' + TASKNAME + '" /tr "\\"' + bat + '\\"" /sc daily /st ' + TASK_TIME);
    return;
  }
  say(taskExists()
    ? "   登録しました — 毎日 " + TASK_TIME + " に走ります"
    : "   WARN 登録したはずが見つかりません。手で確認してください。");
}
function taskExists(args) {
  args = args || ["/query", "/tn", TASKNAME];
  try { execFileSync("schtasks", args, { encoding: "utf8", stdio: "pipe" }); return true; }
  catch (_) { return false; }
}

// ---------------------------------------------------------------- 実行
let rc = 0;
try {
  rc = CHECK ? check() : main();
  if (SETUP && !CHECK) registerTask();
} catch (err) {
  say("STATUS: FAIL unexpected");
  say(String(err && err.stack || err));
  rc = 9;
}

say("");
say("（この内容は " + LOGPATH + " にも残しています）");
flushLog();

// 窓を開いたままにするかどうか。
//
// cmd では判定できなかった。タスクスケジューラも、ダブルクリックも、
// リダイレクトしている別バッチからの呼び出しも、区別がつかない。
// Node なら stdout が端末かどうかで分かる。
//   ダブルクリック          → 端末       → 開いたままにする
//   タスクスケジューラ      → 端末でない → 閉じる
//   リダイレクトされた呼出  → 端末でない → 閉じる（ここで固まっていた）
// 迷ったら閉じる。二度と入力待ちで固まらせない。
if (!QUIET && process.stdout.isTTY === true && process.stdin.isTTY === true) {
  process.stdout.write("\n閉じるには Enter を押してください . . . ");
  try {
    const buf = Buffer.alloc(1);
    fs.readSync(0, buf, 0, 1, null);
  } catch (_) {}
}
process.exit(rc);
