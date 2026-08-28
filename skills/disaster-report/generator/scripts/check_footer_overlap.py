#!/usr/bin/env python3
"""check_footer_overlap.py — 表がページ番号・ADRCの帯に重なっていないか、PDFで確かめる

    python3 check_footer_overlap.py <PDF> [<PDF> ...]

終了コード: 0 = 重なりなし / 1 = 重なりあり / 2 = 実行できなかった

## なぜ要るか

2026-08-28、インドネシア版の3ページ目で被害の表の最下辺（y=7.27in）が
左下のページ番号（y=7.14-7.40in）を横切り、4ページ目は右下の ADRC の帯
（y=7.12-7.42in）まで届いていた。**例外は出ない。ページ数も合う。**

行の高さの見積もりは文字数から計算しているので、実際の組版と必ずずれる。
ずれを小さくすることはできても、**ゼロにはできない。**
だから見積もりを直すのではなく、**出来上がったものを測る。**

`qa_layout_check.py` は下端 0.5in を「フッター帯（定型の飾り）」として
判定から外していたため、これを見逃していた。ここでは逆に、その帯に
飾り以外のものが入っていないかだけを見る。
"""
import sys

PT = 72.0
LIMIT_IN = 7.10          # この線より下は、ページ番号と ADRC の帯だけの場所
PAGENO_X_IN = 0.90       # 左下のページ番号が占める幅
ADRC_X_IN = 11.00        # 右下の ADRC の帯が始まるところ


def main(paths):
    try:
        import pdfplumber
    except ImportError:
        print("pdfplumber が要る: pip install pdfplumber")
        return 2

    findings = []
    for path in paths:
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                if i == 0:
                    continue        # 表紙は下端まで使う設計
                pw, ph = page.width, page.height
                limit = LIMIT_IN * PT

                for obj in list(page.lines) + list(page.rects):
                    # 背景の全面べた塗りは対象外
                    if obj["width"] >= pw * 0.98 and obj["height"] >= ph * 0.98:
                        continue
                    y = max(obj["top"], obj["bottom"])
                    if y > limit and obj["x0"] < ADRC_X_IN * PT:
                        findings.append((path, i + 1, "罫線", y / PT, obj["x0"] / PT, ""))
                        break

                for w in page.extract_words():
                    if w["bottom"] <= limit:
                        continue
                    if w["x0"] < PAGENO_X_IN * PT:      # ページ番号そのもの
                        continue
                    if w["x0"] >= ADRC_X_IN * PT:       # ADRC の帯の文字
                        continue
                    findings.append((path, i + 1, "文字", w["bottom"] / PT,
                                     w["x0"] / PT, w["text"][:24]))
                    break

    if not findings:
        print("STATUS: FOOTER-CLEAR  " + str(len(paths)) + " files")
        return 0

    print("STATUS: FOOTER-OVERLAP  " + str(len(findings)) + " findings")
    for path, page, kind, y, x, text in findings:
        name = path.replace("\\", "/").split("/")[-1]
        print("  %s p.%d  %s が y=%.3fin (x=%.2f) %s"
              % (name, page, kind, y, x, text))
    print("  下端 %.2fin より下はページ番号と ADRC の帯だけの場所。" % LIMIT_IN)
    return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
