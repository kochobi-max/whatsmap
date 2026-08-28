#!/usr/bin/env python3
"""ネパールの位置図3枚を自作する。

    python3 make_locator_maps.py

**図の中の文字は英語だけ。** 日本語はスライドの見出しが持つ。

出力（`../../images/FF-2026-000162-NPL/`）:
    locator_world.png    地域→ネパール（周辺国とネパールの位置）
    locator_region.png   ネパール→ラスワ郡（全77郡と対象郡）

## なぜ自作するのか

Google の静的地図は鍵が要る。Natural Earth も naturalearthdata.com も
naciscdn.org も、このクラウドの許可リストに無く 000 で届かない（2026-08-28 実測）。

一方 **BIPAD ポータル（ネパール内務省）が全77郡のポリゴンを公開している。**

    https://bipadportal.gov.np/api/v1/district/?format=geojson&limit=100

被害の集計と同じ出処の境界線を使えるので、出典もそろう。
14.7MB あるので `data/np_districts.json` に間引いて置いてある（約650KB）。
取り直すときは `refresh_boundaries.py` を回す。

## 周辺国の輪郭は持っていない

1枚目に必要な中国・インドの輪郭は、届く情報源の中に無い。
**無いものを描かない。** 代わりに緯度経度の格子と方位・国名の注記で位置を示す。
輪郭があるように見せかけるより、そのほうが誠実で、読み手も誤解しない。
"""
import io
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib.font_manager import FontProperties

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "images", "FF-2026-000162-NPL"))
# **図の中の文字は英語だけにする。**
# 2026-08-28、LANG_OUT=ja で1組だけ作り、それを英語版のデッキにも使った。
# 英語版の表紙に日本語が入るという、読み手にすぐ分かる誤りになった。
#
# 画像はキー1つにつき1ファイルで、言語ごとには持てない。
# デッキの他の図（UNOSAT・USGS・ERCC）もすべて英語なので、
# **図は英語、見出しは言語ごと**（locator.steps[].label_en / _ja）に揃える。
# LANG_OUT は受け取るが、図の文字には使わない。
LANG = "en"

TARGET = "Rasuwa"
# 出水はここから来た。UNOSAT が「氷雪崩の推定発生地点」を置いた位置。
AVALANCHE = (85.60, 28.35)
EPI = (85.515, 28.271)          # USGS us7000tbwb（M5.2 氷河崩落）
PLACES = [
    ("Timure",      85.38, 28.27, "ティムレ"),
    ("Syabrubesi",  85.33, 28.16, "シャブルベシ"),
    ("Dhunche",     85.30, 28.11, "ドゥンチェ"),
    ("Kathmandu",   85.32, 27.71, "カトマンズ"),
]

INK, LINE, FILL, HI, RED = "#1b2a41", "#9aa7b8", "#eef2f7", "#f2b705", "#c0392b"


# デッキ本体は Meiryo（Windows）だが、ここは図なので入っているものを使う。
# 入っていない名前を指定すると matplotlib は警告だけ出して DejaVu に落ち、
# 日本語が豆腐になる。**実在するものから選ぶ。**
import matplotlib.font_manager as fm

_HAVE = {f.name for f in fm.fontManager.ttflist}
_FAM = next((n for n in ("Noto Sans CJK JP", "IPAGothic", "IPAPGothic", "DejaVu Sans")
             if n in _HAVE), None)


def font(size, bold=False):
    kw = {"size": size, "weight": "bold" if bold else "normal"}
    if _FAM:
        kw["family"] = _FAM
    return FontProperties(**kw)


def label(en, ja):
    if LANG == "ja":
        return ja
    if LANG == "en":
        return en
    return en + " / " + ja


def load():
    with io.open(os.path.join(HERE, "data", "np_districts.json"), encoding="utf-8") as fh:
        return json.load(fh)


def draw_districts(ax, districts, highlight=None, lw=0.35):
    for d in districts:
        on = (d["name"] == highlight)
        for ring in d["rings"]:
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            ax.fill(xs, ys, facecolor=(HI if on else FILL),
                    edgecolor=INK if on else LINE,
                    linewidth=(1.1 if on else lw), zorder=3 if on else 2)


def frame(ax, w, e, s, n, step):
    ax.set_xlim(w, e)
    ax.set_ylim(s, n)
    ax.set_aspect(1.0)
    for v in range(int(w // step) * step, int(e) + step, step):
        if w < v < e:
            ax.plot([v, v], [s, n], color="#dfe5ec", lw=0.5, zorder=1)
    for v in range(int(s // step) * step, int(n) + step, step):
        if s < v < n:
            ax.plot([w, e], [v, v], color="#dfe5ec", lw=0.5, zorder=1)
    for sp in ax.spines.values():
        sp.set_color(LINE)
        sp.set_linewidth(0.8)
    ax.set_xticks([])
    ax.set_yticks([])


def save(fig, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=200, bbox_inches="tight", pad_inches=0.04,
                facecolor="white")
    plt.close(fig)
    print("  " + path + "  " + str(round(os.path.getsize(path) / 1024)) + "KB")


def map_world(districts):
    """1枚目 — 周辺のどこにネパールがあるか。"""
    fig, ax = plt.subplots(figsize=(4.6, 3.4))
    W, E, S, N = 72.0, 98.0, 18.0, 38.0
    frame(ax, W, E, S, N, 5)
    # 全77郡をまとめて1つの国として見せる。この縮尺で郡界は意味を持たない。
    for dd in districts:
        for ring in dd["rings"]:
            ax.fill([q[0] for q in ring], [q[1] for q in ring],
                    facecolor="#f2b705", edgecolor="#f2b705", linewidth=0.3, zorder=3)

    ax.add_patch(Rectangle((80.0, 26.3), 8.3, 4.2, fill=False,
                           edgecolor=RED, linewidth=1.6, zorder=6))
    ax.text(84.1, 31.2, label("NEPAL", "ネパール"), ha="center", va="bottom",
            color=RED, fontproperties=font(11, True), zorder=7)

    # 輪郭を持っていない国は、線を引かずに名前だけ置く
    for name_en, name_ja, x, y in [
        ("CHINA", "中国", 88.0, 35.0),
        ("INDIA", "インド", 78.0, 22.0),
        ("BANGLADESH", "バングラデシュ", 90.5, 23.8),
        ("BHUTAN", "ブータン", 90.4, 27.4),
    ]:
        ax.text(x, y, label(name_en, name_ja), ha="center", va="center",
                color="#8592a3", fontproperties=font(7.5), zorder=5)

    for v in range(75, 100, 5):
        ax.text(v, S + 0.3, str(v) + "E", ha="center", va="bottom",
                color="#8592a3", fontproperties=font(5.5), zorder=5)
    for v in range(20, 38, 5):
        ax.text(W + 0.3, v, str(v) + "N", ha="left", va="bottom",
                color="#8592a3", fontproperties=font(5.5), zorder=5)

    # 表紙では横3インチに縮む。読めない大きさの注記は置かない。
    # 出典はスライドのキャプションと下段の出典行が持つ。
    save(fig, "locator_world.png")


def map_region(districts):
    """2枚目 — ネパールのどこがラスワ郡か。"""
    fig, ax = plt.subplots(figsize=(4.6, 2.6))
    frame(ax, 79.8, 88.5, 26.0, 30.7, 2)
    draw_districts(ax, districts, highlight=TARGET)

    tgt = next(d for d in districts if d["name"] == TARGET)
    w, s, e, n = tgt["bbox"]
    ax.add_patch(Rectangle((w - 0.25, s - 0.25), (e - w) + 0.5, (n - s) + 0.5,
                           fill=False, edgecolor=RED, linewidth=1.4, zorder=6))
    ax.annotate(label("Rasuwa District", "ラスワ郡"),
                xy=((w + e) / 2, n + 0.25), xytext=((w + e) / 2, 30.1),
                ha="center", color=RED, fontproperties=font(9, True), zorder=7,
                arrowprops=dict(arrowstyle="-", color=RED, lw=1.0))

    ax.plot([85.32], [27.71], marker="s", ms=3.5, color=INK, zorder=7)
    ax.text(85.32, 27.55, label("Kathmandu", "カトマンズ"), ha="center", va="top",
            color=INK, fontproperties=font(6.5), zorder=7)

    ax.text(79.95, 26.15,
            label("Source: BIPAD Portal, Ministry of Home Affairs, Nepal (77 districts).",
                  "出典：ネパール内務省 BIPAD ポータル（全77郡）。"),
            ha="left", va="bottom", color="#8592a3", fontproperties=font(5.2), zorder=7)
    save(fig, "locator_region.png")


def map_cities(districts):
    """3枚目 — ラスワ郡の拡大。被災した集落と、出水の来た方向。

    表紙では横3インチ程度に縮む。注記を詰め込むと読めなくなるので、
    **点と地名だけに絞り、説明はデッキ本文に持たせる。**
    文字は必ず白の下地を敷く。塗りの上に直接置くと読めない（2026-08-28 目視）。
    """
    fig, ax = plt.subplots(figsize=(4.6, 3.6))
    frame(ax, 85.02, 85.92, 27.90, 28.52, 1)
    draw_districts(ax, districts, highlight=TARGET, lw=0.5)

    halo = dict(boxstyle="round,pad=0.18", facecolor="white",
                edgecolor="none", alpha=0.85)

    ax.plot([AVALANCHE[0]], [AVALANCHE[1]], marker="^", ms=11, color=RED, zorder=8)
    ax.text(AVALANCHE[0] - 0.03, AVALANCHE[1] + 0.04,
            label("Potential ice avalanche", "氷雪崩の推定発生地点"),
            ha="right", va="bottom", color=RED, fontproperties=font(8, True),
            bbox=halo, zorder=9)

    ax.plot([EPI[0]], [EPI[1]], marker="*", ms=12, color="#8e44ad", zorder=8)
    ax.text(EPI[0] + 0.03, EPI[1] - 0.02, label("USGS M5.2", "USGS M5.2"),
            ha="left", va="top", color="#8e44ad", fontproperties=font(7.5, True),
            bbox=halo, zorder=9)

    for en, x, y, ja in PLACES:
        if not (85.02 < x < 85.92 and 27.90 < y < 28.52):
            continue
        ax.plot([x], [y], marker="o", ms=4, color=INK, zorder=8)
        ax.text(x - 0.025, y, label(en, ja), ha="right", va="center",
                color=INK, fontproperties=font(8), bbox=halo, zorder=9)

    ax.text(85.88, 28.49, label("CHINA (Tibet A.R.)", "中国（チベット自治区）"),
            ha="right", va="top", color="#8592a3", fontproperties=font(7),
            bbox=halo, zorder=9)
    ax.text(85.04, 27.92,
            label("Boundaries: BIPAD Portal.  Avalanche: UNOSAT.  Seismic: USGS.",
                  "境界線：BIPADポータル／氷雪崩：UNOSAT／地震動：USGS"),
            ha="left", va="bottom", color="#8592a3", fontproperties=font(5.6),
            bbox=halo, zorder=9)
    save(fig, "google_cities.png")


def main():
    print("LANG_OUT=" + LANG + " → " + OUT)
    districts = load()["districts"]
    map_world(districts)
    map_region(districts)
    map_cities(districts)


main()
