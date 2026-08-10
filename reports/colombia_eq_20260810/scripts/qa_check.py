#!/usr/bin/env python3
"""Mechanical QA for the built decks.

  python3 scripts/qa_check.py

Checks, for each language:
  - every linkBy() substring in the generator resolves to a link in the data
  - no placeholder text ("TBC" markers are allowed, "XXXX"/"TODO"/"Insert image" are not)
  - the PDF exists, its page count matches the PPTX, and no page is blank
  - the JA deck contains Japanese text; the EN deck contains no Japanese text
"""
import json
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
BASE = "ADRC_EQ_COL_Choco_20260810"
KANA = re.compile(r"[぀-ヿ一-鿿]")

fails, warns = [], []


def check(ok, msg):
    (print if ok else fails.append)("PASS  " + msg if ok else "FAIL  " + msg)


data = json.load(open(os.path.join(ROOT, "data", "report_data.json")))
gen = open(os.path.join(HERE, "gen_deck.js"), encoding="utf-8").read()

labels = [l["label_en"] for l in data["links"]]
missing = [s for s in sorted(set(re.findall(r'linkBy\("([^"]+)"\)', gen)))
           if not any(s in L for L in labels)]
check(not missing, f"all linkBy() references resolve (unmatched: {missing})")

blob = json.dumps(data, ensure_ascii=False)
bad = [w for w in ("TODO", "FIXME", "Insert image", "lorem") if w in blob]
check(not bad, f"no placeholder text left in the data ({bad})")
check(blob.count("XXXXXX") <= 1, "the only XXXXXX left is the pending GLIDE number")

for lang in ("EN", "JA"):
    pptx = os.path.join(ROOT, "output", f"{BASE}_{lang}.pptx")
    pdf = os.path.join(ROOT, "output", f"{BASE}_{lang}.pdf")
    check(os.path.exists(pptx), f"{lang}: PPTX exists")
    check(os.path.exists(pdf), f"{lang}: PDF exists")
    if not (os.path.exists(pptx) and os.path.exists(pdf)):
        continue
    n_slides = len([n for n in zipfile.ZipFile(pptx).namelist()
                    if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)])
    info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
    n_pages = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    check(n_slides == n_pages, f"{lang}: {n_slides} slides == {n_pages} PDF pages")

    text = subprocess.run(["pdftotext", pdf, "-"], capture_output=True, text=True).stdout
    pages = text.split("\f")[:n_pages]
    empty = [i + 1 for i, pg in enumerate(pages) if len(pg.strip()) < 40]
    check(not empty, f"{lang}: no near-empty pages ({empty})")

    ja_pages = sum(1 for pg in pages if KANA.search(pg))
    if lang == "JA":
        check(ja_pages >= n_pages - 1, f"JA: Japanese text present on {ja_pages}/{n_pages} pages")
    else:
        check(ja_pages == 0, f"EN: no Japanese text ({ja_pages} pages contain kana/kanji)")

for f in fails:
    print(f)
print(f"\n{'FAILED' if fails else 'ALL CHECKS PASSED'} — {len(fails)} failure(s)")
sys.exit(1 if fails else 0)
