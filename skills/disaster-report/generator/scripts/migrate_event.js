#!/usr/bin/env node
/*
 * migrate_event.js — 旧 report_data.json を events/<GLIDE>.json へ移行する
 *
 * 既存の内容は一切書き換えず、運用用フィールド（meta.status / iso3 / filebase /
 * mail / onedrive_dir / headline、および _prev）を足すだけ。
 * 英日同居の構造はそのまま保持する（分離してはいけない）。
 *
 * 使い方:
 *   node scripts/migrate_event.js \
 *     --in  /path/to/report_data.json \
 *     --iso3 JPN \
 *     --filebase ADRC_EQ_JPN_Kumamoto_20260728 \
 *     --primary-source "消防庁 (FDMA)" \
 *     [--glide EQ-2026-000135-JPN]   # 省略時は meta.glide から読む
 *     [--out events/<GLIDE>.json]    # 省略時は events/<GLIDE>.json
 *     [--dry-run]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.join(HERE, "..", "..");
const EVENTS_DIR = path.join(ROOT, "events");

const DEFAULT_MAIL = {
  to: ["kenkyubu@adrc.asia", "td-date@adrc.asia"],
  from: "ma-arakida@adrc.asia",
  send_at: "07:00 JST のみ",
};
const DEFAULT_ONEDRIVE = "C:\\Users\\arakida\\OneDrive - adrc.asia\\LargeScaleDisasters";
// apply_slide_gates.js が用意するゲートキーの全集合
const ALL_OPTIONAL_SLIDES = ["prior_event", "focus_incident", "civic_tech", "spectee"];

function parseArgs(argv) {
  const a = { dryRun: false };
  const map = {
    "--in": "in", "--out": "out", "--iso3": "iso3", "--filebase": "filebase",
    "--glide": "glide", "--primary-source": "primarySource",
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--dry-run") { a.dryRun = true; continue; }
    const k = map[argv[i]];
    if (k) a[k] = argv[++i];
  }
  return a;
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function main() {
  const a = parseArgs(process.argv);
  if (!a.in) die("--in が必要です（旧 report_data.json のパス）");
  if (!fs.existsSync(a.in)) die(`入力が見つかりません: ${a.in}`);

  const d = JSON.parse(fs.readFileSync(a.in, "utf8"));
  if (!d.meta) die("meta が無いため、これは report_data.json ではありません");

  const glide = a.glide || d.meta.glide;
  if (!glide) die("GLIDE番号が特定できません（--glide を指定してください）");
  if (!a.iso3) die("--iso3 が必要です（例: JPN / COL / IDN）");
  if (!a.filebase) die("--filebase が必要です（例: ADRC_EQ_JPN_Kumamoto_20260728）");

  // meta は「運用フィールドを先頭に、既存フィールドをその後ろに」の順で組み直す。
  // 既存の値は上書きしない（|| で既存優先）。
  const meta = {
    status: d.meta.status || "active",
    glide,
    iso3: a.iso3,
    filebase: a.filebase,
    sources_profile: `references/sources/${a.iso3}.md`,
    primary_official_source: a.primarySource || d.meta.primary_official_source || "",
    mail: d.meta.mail || DEFAULT_MAIL,
    onedrive_dir: d.meta.onedrive_dir || DEFAULT_ONEDRIVE,
    ...d.meta,
    // 既存イベントは現在の出力を1ページも変えないよう、全キーを明示的に固定する。
    // （フィールドが無くても全描画されるが、意図を残すため書き出す）
    optional_slides: d.meta.optional_slides || ALL_OPTIONAL_SLIDES,
    headline: d.meta.headline || {
      deaths: null, injured: null, missing: null,
      houses_destroyed: null, evacuees: null,
      tier: "official", as_of: "",
    },
  };
  // spread で上書きされた運用フィールドを戻す（既存metaに同名キーがあった場合の保険）
  meta.status = d.meta.status || "active";
  meta.glide = glide;
  meta.iso3 = a.iso3;
  meta.filebase = a.filebase;
  meta.sources_profile = `references/sources/${a.iso3}.md`;
  if (a.primarySource) meta.primary_official_source = a.primarySource;

  const out = { meta, _prev: d._prev || {
    deaths: null, injured: null, missing: null,
    houses_destroyed: null, evacuees: null, tier: null, as_of: "",
  } };
  // meta / _prev 以外のトップレベルキーは順序を保って丸ごと引き継ぐ
  for (const [k, v] of Object.entries(d)) {
    if (k === "meta" || k === "_prev") continue;
    out[k] = v;
  }

  const outPath = a.out || path.join(EVENTS_DIR, `${glide}.json`);
  const carried = Object.keys(d).filter(k => k !== "meta" && k !== "_prev");

  console.log(`  GLIDE      : ${glide}`);
  console.log(`  ISO3       : ${a.iso3}`);
  console.log(`  filebase   : ${a.filebase}`);
  console.log(`  引き継ぎキー: ${carried.length}件 (${carried.join(", ")})`);
  console.log(`  出力先     : ${outPath}`);

  if (a.dryRun) { console.log("\n  --dry-run のため書き込みませんでした。"); return; }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n✓ 書き出しました。次に meta.headline と meta.primary_official_source を埋め、`);
  console.log(`  node scripts/resolve_event.js --event ${glide} で検証してください。`);
}

main();
