#!/usr/bin/env node
/*
 * resolve_event.js — イベントJSONの解決・検証・数値急変ゲート
 *
 * gen_deck.js の本体には手を入れない。ビルドの前段に置き、
 *   1. EVENT（GLIDE番号 or JSONパス）を実ファイルへ解決する
 *   2. スキーマとプレースホルダを検証する
 *   3. 数値急変ゲート（SKILL.md §2）を判定する
 * の3つを行う。依存パッケージなし。
 *
 * 使い方:
 *   node scripts/resolve_event.js --event EQ-2026-000135-JPN
 *   node scripts/resolve_event.js --event events/EQ-2026-000135-JPN.json --json
 *
 * 終了コード:
 *   0  OK              — そのままビルドしてメールを送ってよい
 *   2  HOLD            — ビルドはしてよいが、メールを送らず人に確認を求める
 *   3  INVALID         — スキーマ違反。ビルドしない
 *   4  NOT_FOUND       — イベントJSONが見つからない
 */
"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.join(HERE, "..", ".."); // skills/disaster-report/
const EVENTS_DIR = path.join(ROOT, "events");
const SOURCES_DIR = path.join(ROOT, "references", "sources");

const GLIDE_RE = /^[A-Z]{2}-\d{4}-\d{6}-[A-Z]{3}$/;
const PLACEHOLDERS = ["DRAFT", "TBD", "PLACEHOLDER", "TODO", "XXXX", "＿＿"];

// 数値急変ゲートのしきい値（SKILL.md §2 と一致させること）
//
// monotonic: 累積値かどうか。
//   true  … 死者・負傷者・住家被害のような累積値。減少は訂正報か報の取り違えなので HOLD。
//   false … 避難者数のような「現在値」。復旧に伴って減るのが正常なので、減少では止めない。
//           行方不明者は救出・遺体確認で減るため false。
const SURGE = {
  deaths:           { ratio: 1.5, monotonic: true,  label: "死者数" },
  injured:          { ratio: 2.0, monotonic: true,  label: "負傷者数" },
  missing:          { ratio: 2.0, monotonic: false, label: "行方不明者数" },
  houses_destroyed: { ratio: 2.0, monotonic: true,  label: "住家全壊" },
  evacuees:         { ratio: 2.0, monotonic: false, label: "避難者数" },
};
const TIER_RANK = { official: 3, media: 2, tbc: 1 };

function parseArgs(argv) {
  const a = { json: false, event: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--json") a.json = true;
    else if (argv[i] === "--event") a.event = argv[++i];
    else if (argv[i].startsWith("--event=")) a.event = argv[i].slice(8);
  }
  return a;
}

function resolveEventPath(ref) {
  if (!ref) {
    // 引数なし: active な全イベントを返す（定期タスク用）。
    // pending（データ未整備・別実装で運用中）と archived は対象外。
    if (!fs.existsSync(EVENTS_DIR)) return [];
    return fs.readdirSync(EVENTS_DIR)
      .filter(f => f.endsWith(".json") && !f.startsWith("_"))
      .map(f => path.join(EVENTS_DIR, f))
      .filter(p => {
        try { return JSON.parse(fs.readFileSync(p, "utf8")).meta?.status === "active"; }
        catch { return false; }
      });
  }
  const cands = [
    ref,
    path.join(EVENTS_DIR, ref),
    path.join(EVENTS_DIR, ref.endsWith(".json") ? ref : ref + ".json"),
  ];
  const hit = cands.find(c => fs.existsSync(c) && fs.statSync(c).isFile());
  return hit ? [hit] : [];
}

/** 文字列値を再帰的に走査してプレースホルダ残存を拾う */
function scanPlaceholders(obj, trail, out) {
  if (typeof obj === "string") {
    for (const ph of PLACEHOLDERS) {
      if (obj.includes(ph)) out.push(`${trail || "(root)"}: "${ph}" が残存`);
    }
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanPlaceholders(v, `${trail}[${i}]`, out));
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_comment")) continue;
      scanPlaceholders(v, trail ? `${trail}.${k}` : k, out);
    }
  }
  return out;
}

function validate(d, file) {
  const errs = [], warns = [];
  const m = d.meta || {};

  const required = [
    ["meta.status", m.status],
    ["meta.glide", m.glide],
    ["meta.iso3", m.iso3],
    ["meta.filebase", m.filebase],
    ["meta.primary_official_source", m.primary_official_source],
    ["meta.onedrive_dir", m.onedrive_dir],
    ["meta.mail.from", m.mail && m.mail.from],
    ["meta.stamp", m.stamp],
    ["meta.update_date", m.update_date],
  ];
  for (const [k, v] of required) {
    if (v === undefined || v === null || v === "") errs.push(`${k} が未設定`);
  }
  if (!Array.isArray(m.mail && m.mail.to) || !m.mail.to.length) errs.push("meta.mail.to が空");

  if (m.glide && !GLIDE_RE.test(m.glide)) errs.push(`meta.glide の書式が不正: ${m.glide}（XX-YYYY-NNNNNN-XXX）`);
  // status:
  //   active   … 統一版ジェネレータで日次運用中。定期タスクの対象
  //   pending  … まだ統一版に載せていない。データ未整備、または別実装で運用中。対象外
  //   archived … 更新終了。対象外
  if (m.status && !["active", "pending", "archived"].includes(m.status)) {
    errs.push(`meta.status は active / pending / archived のみ: ${m.status}`);
  }

  // イベントJSONのファイル名は GLIDE と一致していること
  const base = path.basename(file, ".json");
  if (m.glide && base !== m.glide) errs.push(`ファイル名(${base})と meta.glide(${m.glide})が不一致`);

  // 情報源プロファイルの実在確認
  if (m.iso3) {
    const prof = path.join(SOURCES_DIR, `${m.iso3}.md`);
    if (!fs.existsSync(prof)) errs.push(`情報源プロファイルが無い: references/sources/${m.iso3}.md`);
  }

  // 表紙の黒帯に収まる字数（SKILL.md §1）
  const ev = d.event || {};
  if (typeof ev.summary_en === "string" && ev.summary_en.length > 1450)
    errs.push(`event.summary_en が ${ev.summary_en.length} 字（上限1,450）`);
  if (typeof ev.summary_ja === "string" && ev.summary_ja.length > 530)
    errs.push(`event.summary_ja が ${ev.summary_ja.length} 字（上限530）`);

  scanPlaceholders(d, "", errs);

  if (!m.headline) warns.push("meta.headline が無いため数値急変ゲートを判定できない");
  return { errs, warns };
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,，\s人棟世帯]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function surgeGate(d) {
  const cur = d.meta && d.meta.headline;
  const prev = d._prev;
  if (!cur) return { hold: true, reasons: ["meta.headline が無く前報比較ができない"] };

  const isFirst = !prev || Object.keys(prev).filter(k => !k.startsWith("_")).every(k => num(prev[k]) === null);
  if (isFirst) return { hold: true, reasons: ["初版（前報なし）— 全ページの目視確認が必要"] };

  const reasons = [];
  for (const [key, cfg] of Object.entries(SURGE)) {
    const a = num(prev[key]), b = num(cur[key]);
    if (a === null || b === null) continue;
    if (b < a && cfg.monotonic) {
      reasons.push(`${cfg.label}が減少（前報 ${a} → 今報 ${b}）— 累積値が減っている。訂正報か、古い報を新しい報と誤認した可能性`);
    } else if (a > 0 && b / a >= cfg.ratio) {
      const pct = Math.round((b / a - 1) * 100);
      reasons.push(`${cfg.label}が前報比 +${pct}%（${a} → ${b}）— しきい値 +${Math.round((cfg.ratio - 1) * 100)}%`);
    }
  }

  const pt = TIER_RANK[prev.tier], ct = TIER_RANK[cur.tier];
  if (pt && ct && ct < pt) {
    reasons.push(`ティア降格（${prev.tier} → ${cur.tier}）— 公式値を下位ティアで上書きしている可能性`);
  }

  if (cur.as_of && prev.as_of && cur.as_of === prev.as_of) {
    reasons.push(`as_of が前報と同一（${cur.as_of}）— 最新報が未公表の可能性。メール本文にその旨を明記すること`);
  }

  return { hold: reasons.length > 0, reasons };
}

function main() {
  const args = parseArgs(process.argv);
  const files = resolveEventPath(args.event);

  if (!files.length) {
    const msg = args.event
      ? `イベントJSONが見つかりません: ${args.event}`
      : `処理対象のイベントがありません（events/ に status: "active" のJSONが無い）`;
    if (args.json) console.log(JSON.stringify({ ok: false, code: "NOT_FOUND", message: msg }, null, 2));
    else console.error(`✗ ${msg}`);
    process.exit(4);
  }

  const results = files.map(file => {
    let d;
    try {
      d = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      return { file, verdict: "INVALID", errors: [`JSONとして読めません: ${e.message}`], warnings: [], gate: null };
    }
    // pending は「まだ統一版に載せていない」状態。未記入を欠陥として報告しない。
    if (d.meta && d.meta.status === "pending") {
      return {
        file, verdict: "PENDING", glide: d.meta.glide, iso3: d.meta.iso3,
        errors: [], warnings: [], gate: null,
        note: d.meta.pending_reason || "統一版への移行が未了。meta.status を active にすると対象になる",
      };
    }

    const { errs, warns } = validate(d, file);
    if (errs.length) return { file, verdict: "INVALID", errors: errs, warnings: warns, gate: null };

    const gate = surgeGate(d);
    const m = d.meta;
    return {
      file,
      verdict: gate.hold ? "HOLD" : "OK",
      glide: m.glide,
      iso3: m.iso3,
      filebase: m.filebase,
      sources_profile: `references/sources/${m.iso3}.md`,
      onedrive_dir: m.onedrive_dir,
      mail: m.mail,
      outputs: ["JA", "EN"].flatMap(L => [`${m.filebase}_${L}.pptx`, `${m.filebase}_${L}.pdf`]),
      errors: [],
      warnings: warns,
      gate,
    };
  });

  if (args.json) {
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`\n── ${path.basename(r.file)}`);
      console.log(`   判定: ${r.verdict === "OK" ? "✓ OK（ビルド→送信可）"
        : r.verdict === "HOLD" ? "⏸ HOLD（ビルドは可・メールは送らない）"
          : r.verdict === "PENDING" ? "— PENDING（統一版の対象外）"
            : "✗ INVALID（ビルドしない）"}`);
      if (r.note) console.log(`   ${r.note}`);
      if (r.errors.length) r.errors.forEach(e => console.log(`   ✗ ${e}`));
      if (r.warnings.length) r.warnings.forEach(w => console.log(`   ! ${w}`));
      if (r.gate && r.gate.reasons.length) {
        console.log(`   数値急変ゲート:`);
        r.gate.reasons.forEach(x => console.log(`     ⏸ ${x}`));
      }
      // 出力ファイル名は OK / HOLD のときだけ確定する（PENDING・INVALID では未算出）
      if (r.outputs && r.outputs.length) {
        console.log(`   出力: ${r.outputs.join(", ")}`);
        console.log(`   保存先: ${r.onedrive_dir}`);
      }
    }
    console.log("");
  }

  if (results.some(r => r.verdict === "INVALID")) process.exit(3);
  if (results.some(r => r.verdict === "HOLD")) process.exit(2);
  process.exit(0);
}

main();
