#!/usr/bin/env python3
"""
Figures for the ADRC report on the 2026 Chocó (Colombia) earthquake.

Everything drawn here is derived from published event parameters (USGS/SGC) and
from public geographic coordinates — no basemap tiles are fetched (this machine
has no egress to map providers). Country outlines come from the Natural Earth
110 m cultural vectors bundled with geopandas 0.14.

Run once per language; the Japanese set is written with a `_ja` suffix and is
picked up automatically by the Japanese deck.

  python3 make_images.py               # English labels  -> ../images/<key>.png
  LANG_OUT=ja python3 make_images.py   # Japanese labels -> ../images/<key>_ja.png

Keys: locator_world, locator_region, locator_epicentre, slab_section, mmi_distance
"""
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Ellipse, Polygon, FancyArrow
import geopandas as gpd

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "images")
os.makedirs(IMG, exist_ok=True)

JA = os.environ.get("LANG_OUT", "en").lower().startswith("ja")
SUFFIX = "_ja" if JA else ""
if JA:
    matplotlib.rcParams["font.family"] = ["IPAGothic", "DejaVu Sans"]
matplotlib.rcParams["axes.unicode_minus"] = False

NAVY = "#1F3864"
NAVY2 = "#2E5496"
RED = "#C00000"
MUTED = "#6A6A6A"
LAND = "#E9E4DA"
LAND2 = "#DCD5C7"
SEA = "#EAF2F8"

EPI = (4.9031, -76.1885)      # USGS us6000tjl2
DEPTH_KM = 107.0


def t(en, ja):
    return ja if JA else en


# name(en), name(ja), lat, lon, max reported MMI (USGS ShakeMap class),
# label offsets in degrees (lon, lat) for the English and the Japanese figure
CITIES = [
    ("San José del Palmar", "サンホセ・デル・パルマル", 4.8969, -76.2286, "VII", (-1.78, -0.74), (-2.35, -0.74)),
    ("Quibdó", "キブド", 5.6947, -76.6611, "VI", (-1.05, 0.08), (-1.30, 0.08)),
    ("Pereira", "ペレイラ", 4.8133, -75.6961, "VII", (0.10, 0.00), (0.10, 0.00)),
    ("Manizales", "マニサレス", 5.0689, -75.5174, "VI-VII", (0.10, 0.14), (0.10, 0.14)),
    ("Armenia", "アルメニア", 4.5339, -75.6811, "VI-VII", (0.10, -0.32), (0.10, -0.32)),
    ("Cartago", "カルタゴ", 4.7467, -75.9117, "VII", (-1.10, 0.12), (-1.05, 0.14)),
    ("Cali", "カリ", 3.4516, -76.5320, "VI", (0.12, -0.02), (0.12, -0.02)),
    ("Buenaventura", "ブエナベントゥーラ", 3.8801, -77.0313, "VI", (-1.40, 0.02), (-1.95, 0.02)),
    ("Medellín", "メデジン", 6.2442, -75.5812, "V-VI", (0.12, 0.02), (0.12, 0.02)),
    ("Bogotá", "ボゴタ", 4.7110, -74.0721, "IV-V", (0.12, 0.02), (0.12, 0.02)),
]

NEIGHBOURS = [
    ("Quito (Ecuador)", "キト（エクアドル）", -0.1807, -78.4678),
    ("Panamá City (Panama)", "パナマシティ（パナマ）", 8.9824, -79.5199),
    ("Caracas (Venezuela)", "カラカス（ベネズエラ）", 10.4806, -66.9036),
]

COUNTRIES = {"Colombia": "コロンビア", "Ecuador": "エクアドル", "Peru": "ペルー",
             "Venezuela": "ベネズエラ", "Panama": "パナマ", "Brazil": "ブラジル"}


def city_name(c):
    return c[1] if JA else c[0]


def city_off(c):
    return c[6] if JA else c[5]


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def hypocentral(lat, lon):
    d = haversine(EPI[0], EPI[1], lat, lon)
    return d, math.hypot(d, DEPTH_KM)


def world():
    return gpd.read_file(gpd.datasets.get_path("naturalearth_lowres"))


def save(fig, key):
    path = os.path.join(IMG, key + SUFFIX + ".png")
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", os.path.relpath(path, HERE))


def fig_world():
    w = world()
    fig, ax = plt.subplots(figsize=(4.8, 3.6))
    ax.set_facecolor(SEA)
    w.plot(ax=ax, color=LAND, edgecolor="#BFB8A8", linewidth=0.3)
    w[w.name == "Colombia"].plot(ax=ax, color="#F3C9C9", edgecolor=RED, linewidth=0.6)
    ax.add_patch(Rectangle((-84, -6), 22, 20, fill=False, edgecolor=RED, linewidth=1.8))
    ax.plot(EPI[1], EPI[0], marker="*", color=RED, markersize=9, markeredgecolor="white",
            markeredgewidth=0.4, zorder=5)
    ax.set_xlim(-180, 180)
    ax.set_ylim(-60, 85)
    ax.set_xticks([])
    ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_edgecolor("#BFB8A8")
    ax.set_title(t("(1) World / Colombia", "①　世界とコロンビア"), fontsize=8, color=NAVY, pad=4)
    save(fig, "locator_world")


def fig_region():
    w = world()
    fig, ax = plt.subplots(figsize=(4.8, 3.6))
    ax.set_facecolor(SEA)
    w.plot(ax=ax, color=LAND, edgecolor="#BFB8A8", linewidth=0.4)
    w[w.name == "Colombia"].plot(ax=ax, color="#F6E2CC", edgecolor="#B07A3A", linewidth=0.8)
    for en, ja, la, lo in NEIGHBOURS:
        ax.plot(lo, la, "o", color=MUTED, markersize=3)
        ax.annotate(t(en, ja), (lo, la), textcoords="offset points", xytext=(4, 3),
                    fontsize=6.0, color="#444444")
    for nm, ja in COUNTRIES.items():
        g = w[w.name == nm]
        if len(g):
            c = g.geometry.iloc[0].representative_point()
            ax.annotate(t(nm.upper(), ja), (c.x, c.y), fontsize=6.5, color="#7A7266",
                        ha="center", va="center")
    ax.plot(EPI[1], EPI[0], marker="*", color=RED, markersize=15,
            markeredgecolor="white", markeredgewidth=0.6, zorder=6)
    ax.annotate(t("Epicentre\nM7.4, 107 km", "震央\nM7.4・深さ107km"), (EPI[1], EPI[0]),
                textcoords="offset points", xytext=(8, -18), fontsize=6.8, color=RED,
                fontweight="bold")
    ax.add_patch(Rectangle((-78.2, 3.0), 4.6, 3.6, fill=False, edgecolor=RED, linewidth=1.4))
    ax.set_xlim(-84, -62)
    ax.set_ylim(-6, 14)
    ax.set_xticks([])
    ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_edgecolor("#BFB8A8")
    ax.set_title(t("(2) NW South America", "②　南米北西部"), fontsize=8, color=NAVY, pad=4)
    save(fig, "locator_region")


def fig_epicentre():
    w = world()
    fig, ax = plt.subplots(figsize=(4.8, 3.6))
    ax.set_facecolor(SEA)
    w.plot(ax=ax, color=LAND2, edgecolor="#BFB8A8", linewidth=0.4)
    w[w.name == "Colombia"].plot(ax=ax, color="#F8F2E6", edgecolor="#B07A3A", linewidth=0.9)

    # epicentral distance rings (km) — drawn in degrees, corrected for latitude
    for km in (50, 100, 150, 200):
        dlat = km / 111.0
        dlon = km / (111.0 * math.cos(math.radians(EPI[0])))
        ax.add_patch(Ellipse((EPI[1], EPI[0]), 2 * dlon, 2 * dlat, fill=False,
                             edgecolor="#B0B8C4", linewidth=0.7, linestyle=(0, (4, 3))))
        ax.annotate(f"{km} km", (EPI[1], EPI[0] + dlat), fontsize=5.6, color="#8A90A0",
                    ha="center", va="bottom")

    for c in CITIES:
        la, lo = c[2], c[3]
        off = city_off(c)
        ax.plot(lo, la, "o", color=NAVY, markersize=3.4, markeredgecolor="white",
                markeredgewidth=0.5, zorder=5)
        dist, _ = hypocentral(la, lo)
        ax.annotate(f"{city_name(c)}\n{dist:.0f} km", (lo + off[0], la + off[1]),
                    fontsize=5.6, color=NAVY, zorder=6, linespacing=1.15)

    ax.plot(EPI[1], EPI[0], marker="*", color=RED, markersize=17,
            markeredgecolor="white", markeredgewidth=0.6, zorder=7)
    ax.set_xlim(-79.2 if JA else -78.6, -73.0)
    ax.set_ylim(2.6, 7.0)
    ax.set_xticks([])
    ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_edgecolor("#BFB8A8")
    ax.set_title(t("(3) Epicentre and main affected cities (epicentral distance)",
                   "③　震央と主な被災都市（数値は震央距離）"), fontsize=7.2, color=NAVY, pad=4)
    save(fig, "locator_epicentre")


def fig_slab():
    """Schematic W-E cross-section: Nazca slab under the Colombian Andes."""
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    ax.set_facecolor("white")
    ax.add_patch(Rectangle((-100, -260), 260, 260, color="#F2EFE9"))          # mantle wedge
    ax.add_patch(Rectangle((-100, 0), 78, 12, color=SEA))                     # ocean
    ax.add_patch(Polygon([(-22, 0), (160, 0), (160, -45), (-22, -35)], closed=True,
                         facecolor="#DCD5C7", edgecolor="#B8B0A0", linewidth=0.8))
    ax.add_patch(Polygon([(5, 0), (28, 26), (48, 10), (62, 30), (80, 0)], closed=True,
                         facecolor="#C8BFAA", edgecolor="#A79C84", linewidth=0.8))
    ax.add_patch(Polygon([(-100, -6), (-22, -6), (150, -190), (150, -215), (-22, -32), (-100, -32)],
                         closed=True, facecolor="#BBD3E8", edgecolor=NAVY2, linewidth=1.1))
    ax.annotate(t("Nazca plate (subducting)", "ナスカプレート（沈み込み）"), (18, -78),
                fontsize=8, color=NAVY2, rotation=-33)
    ax.annotate(t("South America plate", "南米プレート"), (95, -18), fontsize=8, color="#7A7266")
    ax.annotate(t("Pacific\nOcean", "太平洋"), (-78, -68), fontsize=7.5, color=NAVY2, ha="center")
    ax.annotate(t("Andes (Western / Central Cordillera)", "アンデス山脈（西部・中央山脈）"),
                (42, 36), fontsize=7.5, color="#7A6A4A", ha="center")
    ax.add_patch(FancyArrow(-92, 16, 34, 0, width=2.4, head_width=8, head_length=10,
                            color=NAVY2, length_includes_head=True))
    ax.annotate(t("~50-60 mm/yr", "年約50〜60mm"), (-75, 22), fontsize=7, color=NAVY2, ha="center")

    ax.plot(96, -107, marker="*", color=RED, markersize=20, markeredgecolor="white",
            markeredgewidth=0.7, zorder=8)
    ax.annotate(t("Hypocentre  M7.4  depth 107 km\nintermediate-depth, intraslab\n(strike-slip within the slab)",
                  "震源　M7.4　深さ107km\nやや深発・スラブ内地震\n（スラブ内部の横ずれ断層型）"),
                (96, -107), textcoords="offset points", xytext=(12, -6), fontsize=8,
                color=RED, fontweight="bold", linespacing=1.35)
    ax.plot([96, 96], [-107, 0], color=RED, linewidth=0.8, linestyle=(0, (3, 3)))
    ax.plot(96, 0, marker="v", color=RED, markersize=6)
    ax.annotate(t("Epicentre (Chocó)", "震央（チョコ県）"), (96, 2), fontsize=7.5, color=RED,
                ha="center", va="bottom")

    ax.set_xlim(-100, 160)
    ax.set_ylim(-260, 52)
    ax.set_xticks([])
    ax.set_yticks([-50, -100, -150, -200, -250])
    ax.set_yticklabels(["50", "100", "150", "200", "250"], fontsize=7, color=MUTED)
    ax.set_ylabel(t("Depth (km)", "深さ（km）"), fontsize=8, color=MUTED)
    for side in ("top", "right", "bottom"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_edgecolor("#CCCCCC")
    ax.set_title(t("Schematic cross-section (not to scale): why a 107 km-deep event shook a wide area",
                   "模式断面図（縮尺は正確ではない）：深さ107kmの地震が広域を揺らした理由"),
                 fontsize=8.5, color=NAVY, pad=6)
    save(fig, "slab_section")


def fig_mmi():
    fig, ax = plt.subplots(figsize=(5.2, 3.0))
    rows = sorted(((city_name(c), *hypocentral(c[2], c[3]), c[4]) for c in CITIES),
                  key=lambda r: r[1])
    names = [r[0] for r in rows]
    dist = [r[1] for r in rows]
    ax.barh(names, dist, color=NAVY2, height=0.62)
    for i, (nm, dd, hh, mmi) in enumerate(rows):
        ax.text(dd + 4, i, t(f"{dd:.0f} km  ·  hypo. {hh:.0f} km  ·  MMI {mmi}",
                             f"{dd:.0f}km ・ 震源距離{hh:.0f}km ・ MMI {mmi}"),
                va="center", fontsize=6.6, color="#333333")
    ax.set_xlim(0, max(dist) * 1.9)
    ax.invert_yaxis()
    ax.tick_params(axis="y", labelsize=7.0, colors="#333333", length=0)
    ax.tick_params(axis="x", labelsize=7, colors=MUTED)
    ax.set_xlabel(t("Epicentral distance (km)", "震央距離（km）"), fontsize=7.5, color=MUTED)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_edgecolor("#CCCCCC")
    ax.grid(axis="x", color="#EDEDED", linewidth=0.7)
    ax.set_axisbelow(True)
    ax.set_title(t("Distance to the epicentre and reported shaking (MMI)",
                   "震央距離と報告された揺れ（MMI）"), fontsize=8.5, color=NAVY, pad=6)
    save(fig, "mmi_distance")


if __name__ == "__main__":
    fig_world()
    fig_region()
    fig_epicentre()
    fig_slab()
    fig_mmi()
    if not JA:
        print("\ndistances from the epicentre (km, epicentral / hypocentral):")
        for c in CITIES:
            dd, hh = hypocentral(c[2], c[3])
            print(f"  {c[0]:22s} {dd:6.1f} / {hh:6.1f}   MMI {c[4]}")
