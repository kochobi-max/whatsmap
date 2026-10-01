#!/usr/bin/env python3
"""インドネシアの表紙①②から、英語版用に日本語の行だけを消す。

    python3 make_en_variants.py

## なぜ

表紙の地図3枚は荒木田さんが日英併記のデッキ（ADRC_EQ_IDN_Flores_20260815_BI.pptx）
のために作られたもの。**日本語が画像に焼き込まれている。**
言語別のデッキに使うと、英語版の表紙に日本語が出る。

3枚目（locator_flores.png）の凡例は日英併記で設計されたものなので触らない。
①②の赤い注記だけが、英語行の下に日本語行を重ねた形になっているので、
**下の1行だけを消す。**

    Flores Sea EQ  M7.7      ← 残す
    フローレス海地震          ← 英語版では消す

## やり方

赤い文字の画素だけを拾い、行のかたまりに分ける。2かたまりあれば下側が日本語。
消した画素は、同じ行の左右にある**赤でない最も近い画素**の色で埋める。
一様な矩形で塗りつぶすと海岸線と経緯線が切れるので、そうしない。

出力（`../../images/EQ-2026-000150-IDN/`）:
    locator_world.png       そのまま（併記。落とし先）
    locator_world_ja.png    日本語版が使う（＝併記のまま）
    locator_world_en.png    英語版が使う（日本語行なし）
    locator_region.png / _ja / _en   同上
"""
import os
import shutil

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "images", "EQ-2026-000150-IDN"))
TARGETS = ["locator_world.png", "locator_region.png"]


def red_mask(a):
    """はっきり赤い画素。行の位置を見つけるのに使う。"""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r > 110) & (r - g > 60) & (r - b > 60)


def tint_mask(a):
    """**赤みを帯びた画素**。消すのはこちらを使う。

    はっきり赤い画素だけを消すと、文字の縁のアンチエイリアス（薄いピンク）が
    残って、消したはずの日本語がうっすら読める。2026-08-28 に一度そうなった。

    地の色は陸が (237,231,218)、海が (214,233,245)。r-g はそれぞれ +6 と -19 で、
    海岸線・経緯線の灰色は 0 前後。赤い文字は +190、縁のピンクでも +40 ほどある。
    しきい値 15 なら地図の地物を巻き込まずに、縁まで拾える。
    """
    r, g = a[:, :, 0].astype(int), a[:, :, 1].astype(int)
    m = (r - g) > 15
    # 1画素ぶん太らせて、さらに薄い縁も含める
    out = m.copy()
    out[1:, :] |= m[:-1, :]
    out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    return out


def text_bands(mask, min_width):
    """赤い画素が「文字らしく横に広がっている」行だけを、かたまりにまとめて返す。

    枠線と引き出し線も赤なので、幅の細い行（1本の縦線＝数画素）は文字ではない。
    """
    wide = mask.sum(axis=1) >= min_width
    bands, start = [], None
    for y, on in enumerate(wide):
        if on and start is None:
            start = y
        elif not on and start is not None:
            bands.append((start, y - 1))
            start = None
    if start is not None:
        bands.append((start, len(wide) - 1))
    # 行間の隙間が数画素しかないものは同じ行の一部。3px 以下はつなぐ。
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] <= 3:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    return merged


def base_colors(a):
    """図の「地の色」2つ（陸と海）を、画素の多い順から拾う。"""
    flat = a.reshape(-1, 3)
    uniq, cnt = np.unique(flat, axis=0, return_counts=True)
    return uniq[np.argsort(-cnt)[:2]].astype(int)


def clean_map(a, base, tol=26):
    """陸か海の地の色そのものである画素。埋め草にはこれだけを使う。"""
    d = a.astype(int)
    out = np.zeros(a.shape[:2], dtype=bool)
    for c in base:
        out |= (np.abs(d - c[None, None, :]).sum(axis=2) <= tol)
    return out


def erase_band(a, erase, clean, y0, y1):
    """y0..y1 の帯にある赤みの画素を、**同じ列の上下にある地の色**で埋める。

    2つ決めごとがある。どちらも一度失敗して分かった（2026-08-28）。

      * 左右ではなく上下から取る。左右から取ると、海へはみ出した文字を消したときに
        海の色が陸側へ流れ込み、青い塊ができる
      * 埋め草は「地の色そのもの」に限る。すぐ上下の画素を無条件に使うと、
        赤い文字の下に隠れていた別の注記（Kupang）が縦に引き伸ばされる
    """
    h = a.shape[0]
    ok = clean & ~erase
    n = 0
    ys, xs = np.where(erase[y0:y1 + 1])
    for dy, x in zip(ys, xs):
        y = y0 + dy
        up = y - 1
        while up >= 0 and not ok[up, x]:
            up -= 1
        dn = y + 1
        while dn < h and not ok[dn, x]:
            dn += 1
        if up < 0 and dn >= h:
            continue
        pick = dn if up < 0 else up if dn >= h else (up if (y - up) <= (dn - y) else dn)
        a[y, x] = a[pick, x]
        n += 1
    return n


def grow_band(erase, top, bottom, x0, x1):
    """行の上下に残るアンチエイリアスまで帯を広げる。

    幅で行を見つける方法だと、はね・점のように画素の少ない行が帯から外れ、
    赤い切れはしが残る。**上の行を侵さない範囲で、下は尽きるまで広げる。**
    """
    y0 = (top[1] + bottom[0]) // 2 + 1
    y1 = bottom[1]
    h = erase.shape[0]
    while y1 + 1 < h and erase[y1 + 1, x0:x1 + 1].any():
        y1 += 1
    return y0, y1


def main():
    for name in TARGETS:
        src = os.path.join(OUT, name)
        img = Image.open(src).convert("RGB")
        a = np.array(img).astype(np.uint8)
        mask = red_mask(a.astype(int))
        erase = tint_mask(a)
        clean = clean_map(a, base_colors(a))

        # 赤いのは文字だけではない。枠の上下の辺、引き出し線、星も赤で、
        # どれも横に広がるので「幅のある行」に混ざる。注記は図の中でいちばん下に
        # 2行続けて置かれているので、**最後の2かたまり**を取り、
        # 行間が詰まっている（＝2行組）ことを確かめる。
        bands = text_bands(mask, min_width=30)
        if len(bands) < 2:
            raise SystemExit("%s: 赤いかたまりが %d 本しか無い。止める。" % (name, len(bands)))
        top, bottom = bands[-2], bands[-1]
        gap = bottom[0] - top[1]
        if gap > 15:
            raise SystemExit(
                "%s: 下2つのかたまりが y=%s と y=%s で、間が %dpx 空いている。\n"
                "  2行組の注記に見えないので、自動で消さない。全かたまり: %s"
                % (name, top, bottom, gap, bands))
        print("%s  赤いかたまり: %s" % (name, bands))
        cols = np.where(erase[bottom[0]:bottom[1] + 1].any(axis=0))[0]
        x0, x1 = int(cols.min()), int(cols.max())
        y0, y1 = grow_band(erase, top, bottom, x0, x1)

        n = erase_band(a, erase, clean, y0, y1)

        stem, ext = os.path.splitext(name)
        shutil.copyfile(src, os.path.join(OUT, stem + "_ja" + ext))
        Image.fromarray(a).save(os.path.join(OUT, stem + "_en" + ext))
        print("%s  英語行 y=%d-%d を残し、日本語行 y=%d-%d の %d 画素を消した"
              % (name, top[0], top[1], y0, y1, n))
        print("   → %s_ja%s（併記のまま） / %s_en%s（日本語なし）"
              % (stem, ext, stem, ext))


main()
