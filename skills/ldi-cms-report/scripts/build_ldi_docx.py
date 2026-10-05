#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_ldi_docx.py — 判定結果のJSONから、LDI CMS入力支援レポートのdocxを組み立てる

    python scripts/build_ldi_docx.py <入力JSON> [--out <出力docx>]

## なぜこれが要るか

2026-10-05、定期タスク1回のコストを調べたところ **$15.87/回（毎日）** だった。
内訳のうち出力が **99,413 トークン**。原稿用紙およそ500枚ぶんを毎朝書いていた。

その大半が「文書の組み立て」だった。モデルが各エントリについて
日本語タイトル・英語タイトル・日本語本文・英語本文・URL を書くだけでなく、
表の罫線や背景色、ラベル列の文字、フッタの体裁まで毎回書き起こしていた。

**体裁は毎日同じである。毎日書く必要がない。**

ここに固定する。モデルが書くのは**中身だけ**（JSON）。
判定（スキップ・登録基準・昇格）は従来どおりモデルが行う。**判断は1つも機械に渡していない。**

## 出力様式は変えない

SKILL.md Step 7 の「出力フォーマット（固定）」をそのまま実装している。
行の順序・ラベルの文字・中央揃え・背景色の塗り分けを変えてはならない。
**変えるときは SKILL.md と この両方を直す。**

## 入力JSONの形

```json
{
  "created_date": "2026-10-05",
  "verified_total": 23,
  "skip_table": [
    {"ldi_id": "2821", "disaster": "フィリピン地震",
     "ldi_current": "NDRRMC 7/16「26 dead」", "today_source": "7/18 NDRRMC（28人）",
     "decision": "含める"}
  ],
  "entries": [
    {"ldi_id": "2821",
     "title_ja": "フィルスター 7/18", "title_en": "Philstar 18 Jul",
     "body_ja": "NDRRMC（7/18、比国防省）：死者28人…",
     "body_en": "NDRRMC (18 Jul): 28 dead…",
     "url1": "https://...", "url2": "—"}
  ]
}
```

- `update_count` / `skip_count` は**書かせない。** `entries` と `skip_table` から数える。
  二重に書かせると、片方だけ直して食い違う（実際にそういう事故を何度も見ている）
- `skip_table` は任意（SKILL.md で「任意・推奨」）。無ければ節ごと省く
"""
import argparse
import json
import os
import re
import sys

try:
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Pt, Cm
except ImportError:
    sys.stderr.write(
        "STATUS: FAIL no-python-docx\n"
        "python-docx が無い。pip install python-docx を実行する。\n")
    sys.exit(2)

# 背景色（2026-10-05 に固定した。**勝手に変えない。**）
#   節見出し: 青 / ラベル列: 薄青 / 使用方法ボックス: 黄
C_SECTION = "2F5496"
C_LABEL = "D9E2F3"
C_USAGE = "FFF2CC"

LABELS = [
    ("レポートの種類 / Report Type", None),          # 固定値を入れる行
    ("タイトル（日本語）", "title_ja"),
    ("タイトル（英語）/ Title", "title_en"),
    ("内容（日本語）", "body_ja"),
    ("内容（英語）/ Outlines", "body_en"),
    ("URL1", "url1"),
    ("URL2", "url2"),
]
REPORT_TYPE = "Report/Articles"

USAGE_TEXT = (
    "今日CMS入力が必要なエントリのみ記載。内容をADRC LDI CMS「レポート編集」フォームに"
    "入力してください。LDI IDは対象災害のKey番号を参照。URLはブラウザで動作確認後に入力。")


def shade(cell, hex_color):
    """セルの背景を塗る。python-docx に API が無いので XML を足す。"""
    el = cell._tc.get_or_add_tcPr()
    for old in el.findall(qn("w:shd")):
        el.remove(old)
    shd = el.makeelement(qn("w:shd"), {})
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    el.append(shd)


def centered(doc, text, size=None, bold=False):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.bold = bold
    if size:
        r.font.size = Pt(size)
    return p


def set_cell(cell, text, bold=False, white=False):
    cell.text = ""
    p = cell.paragraphs[0]
    r = p.add_run("" if text is None else str(text))
    r.bold = bold
    if white:
        r.font.color.rgb = None  # 既定（黒）。節見出しのみ別途指定する
    return cell


def require(obj, keys, where):
    """**欠けているものを黙って空欄で出さない。** 空欄のまま出た事故が実際にある。"""
    missing = [k for k in keys if not str(obj.get(k, "")).strip()]
    if missing:
        raise ValueError("%s に %s が無い: %s" % (where, "・".join(missing),
                                               json.dumps(obj, ensure_ascii=False)[:160]))


def build(data, out_path):
    created = str(data.get("created_date", "")).strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", created):
        raise ValueError("created_date が YYYY-MM-DD でない: %r" % created)

    entries = data.get("entries") or []
    skip_table = data.get("skip_table") or []
    # **数えて書く。** 件数を二重に持たせない
    n_update = len(entries)
    n_skip = sum(1 for r in skip_table if str(r.get("decision", "")).strip() == "SKIP")
    verified = data.get("verified_total")
    if verified is None:
        verified = len(skip_table) if skip_table else n_update
    verified = int(verified)

    doc = Document()
    doc.styles["Normal"].font.name = "Yu Gothic"
    doc.styles["Normal"]._element.rPr.rFonts.set(qn("w:eastAsia"), "Yu Gothic")
    doc.styles["Normal"].font.size = Pt(10)

    # 1. タイトル行
    centered(doc, "ADRC LDI CMS レポート入力データ", size=16, bold=True)
    # 2. サブヘッダ
    centered(doc, "作成日: %s  ／  全%d件検証 → 更新必要 %d件・スキップ %d件  ／  自動生成"
             % (created, verified, n_update, n_skip), size=9)

    # 3. スキップ判定サマリ表（任意・推奨）
    if skip_table:
        doc.add_paragraph()
        head = ["LDI ID", "災害", "LDI現況（最新ソース）", "今日の最新ソース", "判定"]
        t = doc.add_table(rows=1, cols=len(head))
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for i, h in enumerate(head):
            set_cell(t.rows[0].cells[i], h, bold=True)
            shade(t.rows[0].cells[i], C_LABEL)
        for r in skip_table:
            require(r, ["disaster", "decision"], "skip_table の行")
            row = t.add_row().cells
            for i, k in enumerate(["ldi_id", "disaster", "ldi_current", "today_source", "decision"]):
                set_cell(row[i], r.get(k, "—") or "—")

    # 4. 使用方法ボックス（1行テーブル・黄背景）
    doc.add_paragraph()
    ut = doc.add_table(rows=1, cols=1)
    ut.style = "Table Grid"
    set_cell(ut.rows[0].cells[0], USAGE_TEXT)
    shade(ut.rows[0].cells[0], C_USAGE)

    # 5. 各エントリ
    for idx, e in enumerate(entries, 1):
        require(e, ["ldi_id", "title_ja", "title_en", "body_ja", "body_en", "url1"],
                "entries[%d]" % idx)
        doc.add_paragraph()
        st = doc.add_table(rows=1, cols=1)
        st.style = "Table Grid"
        c = st.rows[0].cells[0]
        set_cell(c, "No.%d  Report (LDI ID: %s)" % (idx, e["ldi_id"]), bold=True)
        shade(c, C_SECTION)
        from docx.shared import RGBColor
        c.paragraphs[0].runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        t = doc.add_table(rows=0, cols=2)
        t.style = "Table Grid"
        for label, key in LABELS:
            row = t.add_row().cells
            set_cell(row[0], label, bold=True)
            shade(row[0], C_LABEL)
            if key is None:
                set_cell(row[1], REPORT_TYPE)
            else:
                set_cell(row[1], e.get(key) or "—")
        try:
            t.columns[0].width = Cm(5.0)
            t.columns[1].width = Cm(11.5)
        except Exception:
            pass  # 幅が取れなくても中身は出す

    # 6. フッタ
    doc.add_paragraph()
    centered(doc, "--- 更新必要 %d件 / スキップ %d件 ---" % (n_update, n_skip), size=9)
    centered(doc, "自動生成: %s  /  各ADRC記事ページのLDI現況を照合済み" % created, size=9)

    doc.save(out_path)
    return {"out": out_path, "update": n_update, "skip": n_skip, "verified": verified}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json_path")
    ap.add_argument("--out")
    a = ap.parse_args()
    with open(a.json_path, encoding="utf-8") as f:
        data = json.load(f)
    out = a.out
    if not out:
        d = str(data.get("created_date", "")).strip()
        out = os.path.join(os.path.dirname(os.path.abspath(a.json_path)),
                           "LDI_CMS_Reports_%s.docx" % d)
    try:
        r = build(data, out)
    except ValueError as e:
        print("STATUS: FAIL input")
        print("  " + str(e))
        sys.exit(3)
    print("   %s" % r["out"])
    print("   更新必要 %d件 / スキップ %d件 / 全%d件検証" % (r["update"], r["skip"], r["verified"]))
    print("STATUS: OK docx")


if __name__ == "__main__":
    main()
