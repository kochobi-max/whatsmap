#!/usr/bin/env python3
"""qa_layout_check.py — 出来上がった PDF から「文字のはみ出し」と「画像との重なり」を検出する

ページ数が出ても、例外が出なくても、枠に対して中身が大きすぎることはある。
実際、主な被害①のスライドでは高さ1.09インチに潰れた画像の上にキャプションが
重なっていたが、ビルドは成功と表示されていた。

既存の qa_overflow_check.py は pdftotext（poppler）に依存していて Windows では
動かない。ここでは pdfplumber だけを使う。

使い方:
    python qa_layout_check.py <PDFのパス> [<PDFのパス> ...]
    python qa_layout_check.py --margin 0.12 --min-size 9.5 report.pdf

終了コード: 0 = 指摘なし / 1 = 指摘あり / 2 = 実行できなかった
"""
import sys
import os

MARGIN_IN = 0.12      # ページ端からこの内側に文字が収まっていること（インチ）
FOOTER_IN = 0.50      # 下端のこの範囲は「フッター帯」。定型の飾りが入る前提で扱う
FURNITURE = 0.50      # フッター帯で、全ページのこの割合以上に出てくる文字列は飾りとみなす
MIN_CHARS = 3         # 画像との重なり判定の対象にする最小文字数
                      # 地図上の番号マーカーや★は意図的に画像へ載せているため
OVERLAP_R = 0.35      # 文字の面積のうちこの割合以上が画像と重なったら指摘
MIN_SIZE   = 9.5      # 画像との重なり判定の対象にする最小フォントサイズ(pt)
                      # 画像の隅に載せる「© Google」等のクレジットは意図的なので除く
TT_OVERLAP = 0.50     # 文字どうしがこの割合以上重なったら指摘
TT_VGAP    = 0.30     # 同じ行の字詰めを拾わないための縦ずれのしきい値（文字高に対する比）
PT = 72.0


def rects_overlap_area(a, b):
    x0 = max(a[0], b[0]); x1 = min(a[2], b[2])
    y0 = max(a[1], b[1]); y1 = min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return (x1 - x0) * (y1 - y0)


def furniture_texts(pdf, footer_in):
    """フッター帯に繰り返し現れる文字列を集める。

    ADRC・日付・「N / 149」のような定型の飾りを、溢れと取り違えないため。
    文字列を決め打ちせず、出現頻度で判定する。ページ番号だけは毎ページ違うので
    数字と区切り記号を別途落とす。
    """
    from collections import Counter
    n = len(pdf.pages)
    c = Counter()
    for page in pdf.pages:
        H = page.height
        band = H - footer_in * PT
        seen = set()
        try:
            words = page.extract_words() or []
        except Exception:
            words = []
        for w in words:
            if w["bottom"] > band:
                seen.add((w.get("text") or "").strip())
        c.update(seen)
    return {t for t, k in c.items() if t and k >= FURNITURE * n}


def check(path, margin_in, min_size, footer_in=FOOTER_IN):
    import pdfplumber
    findings = []
    with pdfplumber.open(path) as pdf:
        furn = furniture_texts(pdf, footer_in)
        for pno, page in enumerate(pdf.pages, 1):
            W, H = page.width, page.height
            m = margin_in * PT
            imgs = [(im["x0"], im["top"], im["x1"], im["bottom"]) for im in (page.images or [])]
            ok_words = []
            try:
                words = page.extract_words(extra_attrs=["size"]) or []
            except Exception:
                words = page.extract_words() or []
            for w in words:
                box = (w["x0"], w["top"], w["x1"], w["bottom"])
                size = float(w.get("size") or 0)
                text = (w.get("text") or "").strip()
                if not text:
                    continue

                in_footer = box[3] > H - footer_in * PT
                is_furn = in_footer and (text in furn or text.isdigit()
                                         or text in ("/", "・", "|"))
                sides = []
                if box[0] < m:      sides.append("左")
                if box[2] > W - m:  sides.append("右")
                if box[1] < m:      sides.append("上")
                if box[3] > H - m and not is_furn: sides.append("下")
                if is_furn:
                    continue        # フッターの飾り。溢れでも重なりでもない
                if sides:
                    findings.append((pno, "はみ出し", "／".join(sides), text, round(size, 1)))
                    continue   # はみ出していれば重なりは重複して報告しない

                if (size and size < min_size) or len(text) < MIN_CHARS:
                    continue
                area = max(1e-6, (box[2] - box[0]) * (box[3] - box[1]))
                hit = False
                for im in imgs:
                    r = rects_overlap_area(box, im) / area
                    if r > OVERLAP_R:
                        findings.append((pno, "画像と重なり", f"{int(r*100)}%", text, round(size, 1)))
                        hit = True
                        break
                if not hit:
                    ok_words.append((box, text, size))

            # 文字どうしの重なり。溢れた行が隣の行に食い込むと、ここに出る。
            # 同じ行の字詰めを拾わないよう、縦にずれている組だけ見る。
            ok_words.sort(key=lambda t: t[0][1])
            for i, (b1, t1, s1) in enumerate(ok_words):
                h1 = max(1e-6, b1[3] - b1[1])
                for b2, t2, s2 in ok_words[i + 1:]:
                    if b2[1] >= b1[3]:
                        break          # 以降は縦に離れている（top でソート済み）
                    if abs(b2[1] - b1[1]) < TT_VGAP * h1:
                        continue       # 同じ行
                    a1 = max(1e-6, (b1[2] - b1[0]) * h1)
                    a2 = max(1e-6, (b2[2] - b2[0]) * (b2[3] - b2[1]))
                    r = rects_overlap_area(b1, b2) / min(a1, a2)
                    if r > TT_OVERLAP:
                        findings.append((pno, "文字が重なり", f"{int(r*100)}%",
                                         f"{t1} ／ {t2}", round(max(s1, s2), 1)))
                        break
    return findings


def main():
    # Windows の cmd はファイルへリダイレクトすると cp932 で書こうとして
    # 「⚠」のような文字で UnicodeEncodeError を出す。UTF-8 に固定し、
    # それでも書けない文字は置き換えて、検査結果そのものを失わないようにする。
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    args = sys.argv[1:]
    margin_in, min_size, footer_in = MARGIN_IN, MIN_SIZE, FOOTER_IN
    paths = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--margin":   margin_in = float(args[i + 1]); i += 2
        elif a == "--min-size": min_size = float(args[i + 1]); i += 2
        elif a == "--footer": footer_in = float(args[i + 1]); i += 2
        elif a in ("-h", "--help"):
            print(__doc__); return 0
        else:
            paths.append(a); i += 1
    if not paths:
        print(__doc__)
        return 2
    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        print("✗ pdfplumber がありません。  pip install pdfplumber")
        return 2

    total = 0
    pages = 0
    for path in paths:
        if not os.path.exists(path):
            print(f"✗ 見つかりません: {path}")
            return 2
        if not path.lower().endswith(".pdf"):
            print(f"✗ PDF を渡してください（pptx ではありません）: {path}")
            return 2
        print(f"\n── {os.path.basename(path)}")
        try:
            findings = check(path, margin_in, min_size, footer_in)
        except Exception as e:
            print(f"   ✗ 読めませんでした: {e}")
            return 2
        if not findings:
            print("   ✓ 指摘なし")
            continue
        by_page = {}
        for f in findings:
            by_page.setdefault(f[0], []).append(f)
        for pno in sorted(by_page):
            rows = by_page[pno]
            print(f"   p.{pno}  {len(rows)}件")
            for _, kind, detail, text, size in rows[:6]:
                t = text if len(text) <= 28 else text[:27] + "…"
                print(f"      {kind:<6} {detail:<8} {size:>4}pt  {t}")
            if len(rows) > 6:
                print(f"      … 他 {len(rows) - 6}件")
        total += len(findings)
        pages += len(by_page)
        print(f"   合計 {len(findings)}件 / {len(by_page)}ページ")

    print(f"\n{'✓ 指摘なし' if total == 0 else f'⚠ 合計 {total}件'}"
          f"   （余白 {margin_in}インチ / フッター帯 {footer_in}インチ / "
          f"画像との重なりは {min_size}pt 以上かつ{MIN_CHARS}文字以上）")
    # Windows の findstr は cp932 で探すので、UTF-8 の日本語には一致しない。
    # バッチから拾えるよう、ASCII だけの行を最後に足す。
    print(f"SUMMARY: {total} findings / {pages} pages")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
