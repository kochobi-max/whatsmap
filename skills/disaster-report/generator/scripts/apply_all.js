#!/usr/bin/env node
/*
 * apply_all.js — 21本のパッチを正しい順序でまとめて当てる
 *
 * 使い方:
 *   node scripts/apply_all.js --file "<gen_deck.js のパス>" --dry-run   ← まずこれ
 *   node scripts/apply_all.js --file "<gen_deck.js のパス>"             ← 本適用
 *
 * 例（OneDrive の権威版）:
 *   node scripts/apply_all.js --dry-run \
 *     --file "C:\\Users\\arakida\\OneDrive - adrc.asia\\LargeScaleDisasters\\_kumamoto_generator\\gen_deck.js"
 *
 * 途中で1本でも失敗したら、そこで止める。
 * 各パッチは適用前に置換対象を数え、適用後に構文チェックし、`.bak` を残す。
 * すでに当たっているパッチは「適用済み」と表示して飛ばす（冪等）。
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ORDER = [
  ["apply_event_patch.js", "EVENT でイベントを切り替えられるようにする"],
  ["apply_slide_gates.js", "イベント固有スライドを optional_slides で出し分ける"],
  ["apply_locator_patch.js", "表紙の3面ロケータを国ごとに変えられるようにする"],
  ["apply_receiver_slides.js", "汎用キー6種の受け皿スライドを足す"],
  ["apply_data_guards.js", "データが欠けてもビルドが落ちないようにする"],
  ["apply_attribution_patch.js", "出典・キャプション・発震機構の日本固有記述を外出しする"],
  ["apply_bilingual_fields.js", "value_en / value_ja のような言語別キーを読めるようにする"],
  ["apply_receiver_slides_2.js", "被災地域・主な余震・過去の地震・所見・自由記述・巻末を足す"],
  ["apply_event_images.js", "画像を images/<GLIDE>/ でイベントごとに分ける"],
  ["apply_image_report.js", "画像がどのファイルに解決したかをビルド時に一覧表示する"],
  ["apply_highlight_layout.js", "主な被害①の画像を1ページ1枚にする"],
  ["apply_param_table_fit.js", "震源・震度の諸元表が下端を越えないよう文字を縮める"],
  ["apply_image_isolation.js", "他イベントの画像を掴まないようにする"],
  ["apply_activation_pages.js", "発動ページを activation_pages で出し分ける"],
  ["apply_cover_and_figures.js", "表紙3行目のあふれ・PAGERの図・時系列の時間帯注記"],
  ["apply_country_neutral_headers.js", "日本固定の見出し（時系列・被害・発動ページ）を meta から読む"],
  ["apply_language_figures.js", "図を <key>_ja.png のように言語ごとに持てるようにする"],
  ["apply_sat_page_numbering.js", "出ていないページの番号を見出しに書かない（3/3 だけが残る）"],
  ["apply_table_fit.js", "表がページ番号・出典行に重ならないよう行送りと下端を直す"],
  ["apply_fitrows_measured.js", "右側の表が折り返しで伸びて枠外へ出るのを止める"],
  ["apply_locator_no_box.js", "表紙の赤枠を box: false で出さないようにする"],
];

function main() {
  const argv = process.argv;
  let file = null, dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--dry-run") dryRun = true;
  }
  if (!file) {
    console.error("✗ --file が必要です（gen_deck.js のパス）");
    console.error("  例: node scripts/apply_all.js --dry-run --file \"...\\_kumamoto_generator\\gen_deck.js\"");
    process.exit(1);
  }
  if (!fs.existsSync(file)) { console.error(`✗ 見つかりません: ${file}`); process.exit(1); }

  let before = fs.readFileSync(file, "utf8");
  // Windows の git は既定で CRLF に変換して取り出す。各パッチの照合は行末に \n を
  // 置いているので、CRLF のままだと 0 件になって当たらない（2026-08-27 に踏んだ）。
  // 当てる前に LF へ正規化する。JS の動作は変わらない。
  if (!dryRun && before.includes("\r\n")) {
    before = before.replace(/\r\n/g, "\n");
    fs.writeFileSync(file, before, "utf8");
    console.log("改行を CRLF から LF に正規化しました（パッチの照合が外れるため）");
  }
  console.log(`対象: ${file}`);
  console.log(`行数: ${before.split("\n").length}`);
  console.log(dryRun ? "モード: --dry-run（元ファイルは書き換えません）\n" : "モード: 本適用\n");

  // --dry-run は各パッチに --dry-run を渡すのでは意味がない。
  // 後段のパッチは前段のパッチが書き換えた行を探すので、素の gen_deck.js に対しては
  // 必ず「対象0件」で落ちる。実際 apply_bilingual_fields.js は
  // apply_attribution_patch.js が作る intensitySeg() を探すため、これで空振りした。
  // そこで一時ファイルへ実際に7本当てきり、成否だけを報告して元ファイルは触らない。
  let target = file;
  let tmpDir = null;
  if (dryRun) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apply_all-"));
    target = path.join(tmpDir, "gen_deck.js");
    // --dry-run では元ファイルを触らないので、一時コピー側だけ正規化する
    fs.writeFileSync(target, before.replace(/\r\n/g, "\n"), "utf8");
  }

  const HERE = __dirname;
  const done = [];
  for (const [script, what] of ORDER) {
    const p = path.join(HERE, script);
    if (!fs.existsSync(p)) { console.error(`✗ スクリプトが見つかりません: ${p}`); process.exit(1); }
    process.stdout.write(`── ${script}\n   ${what}\n`);
    try {
      const out = execFileSync(process.execPath, [p, "--file", target], { encoding: "utf8" });
      const line = out.split("\n").find(l => l.includes("✓") || l.includes("すでに")) || "";
      console.log(`   ${line.trim() || "完了"}\n`);
      done.push(script);
    } catch (e) {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      console.error(dryRun
        ? `\n✗ ${script} が当たりません（一時コピーでの試行なので、元ファイルは無傷です）。\n`
        : `\n✗ ${script} で中断しました。ここまでの ${done.length} 本は適用済みです。\n`);
      console.error((e.stdout || "") + (e.stderr || ""));
      console.error("gen_deck.js の該当箇所が変わっている可能性があります。");
      console.error("generator/README.md の該当節を見て、手で当ててください。");
      process.exit(2);
    }
  }

  if (dryRun) {
    const rehearsed = fs.readFileSync(target, "utf8");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("── すべて適用できました（一時コピーに全部通り、構文チェックも通過）。");
    console.log(`   行数: ${before.split("\n").length} → ${rehearsed.split("\n").length}`);
    console.log("   元ファイルは書き換えていません。--dry-run を外して実行してください。");
    return;
  }

  const after = fs.readFileSync(file, "utf8");
  console.log("── 完了");
  console.log(`   行数: ${before.split("\n").length} → ${after.split("\n").length}`);
  console.log(`   バックアップ: ${file}.bak / .gates.bak / .locator.bak / .receivers.bak / .guards.bak / .attrib.bak / .bilingual.bak / .receivers2.bak / .images.bak / .imgreport.bak / .hl.bak / .prm.bak / .isolation.bak`);
  console.log("\n次にやること:");
  console.log("  1. 熊本でビルドし、27ページ・内容が従来どおりであることを確認する");
  console.log("     LANG_OUT=ja EVENT=EQ-2026-000135-JPN node scripts/gen_deck.js");
  console.log("  2. gen_deck.js を _kumamoto_generator/ へ書き戻す");
}

main();
