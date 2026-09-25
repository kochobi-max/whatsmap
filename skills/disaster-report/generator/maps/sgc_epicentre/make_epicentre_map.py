#!/usr/bin/env python3
"""SGC のカタログから 2026 チョコ地震の震央分布図をつくる。

入力
  sgc_events.csv  … SGC「Catálogo de Sismicidad」の検索結果（285件）
  basemap.json    … Natural Earth を描画範囲に切ったもの
  inset.json      … 位置図用の国境

出力
  epicentre_distribution.png

言語は環境変数 LANG_OUT（ja | en | bi、既定 bi）で切り替える。
デッキ側の LANG_OUT と同じ値を渡せば表記が揃う。
"""
import csv
import json
import math
import os

import matplotlib
import matplotlib.patheffects
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle

LANG = os.environ.get("LANG_OUT", "bi").lower()
if LANG not in ("ja", "en", "bi"):
    LANG = "bi"


def T(en, ja):
    """デッキの pickText() と同じ考え方で EN / JA を選ぶ。"""
    if LANG == "en":
        return en
    if LANG == "ja":
        return ja
    return en + " / " + ja


def T2(en, ja):
    """bi のときは 1 行に並べず改行する。横に伸ばすと枠から溢れるため。"""
    if LANG == "en":
        return en
    if LANG == "ja":
        return ja
    return en + "\n" + ja


for fam in ("Noto Sans CJK JP", "IPAPGothic", "DejaVu Sans"):
    if fam in {f.name for f in matplotlib.font_manager.fontManager.ttflist}:
        plt.rcParams["font.family"] = fam
        break
plt.rcParams["axes.unicode_minus"] = False

base = json.load(open("basemap.json", encoding="utf-8"))
inset = json.load(open("inset.json", encoding="utf-8"))
W, E, S, N = base["bbox"]

events = []
with open("sgc_events.csv", encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        events.append({"t": r["time_utc"], "lat": float(r["lat"]),
                       "lon": float(r["lon"]), "dep": float(r["depth_km"]),
                       "mag": float(r["mag"])})
main = max(events, key=lambda e: e["mag"])
after = [e for e in events if e is not main]

# 深さの区分。本震は 103km のスラブ内地震で、余震は浅いものまで幅がある
DEPTH_BANDS = [
    (0, 30, "#d73027", T("0-30 km", "0〜30km")),
    (30, 70, "#fc8d59", T("30-70 km", "30〜70km")),
    (70, 110, "#4575b4", T("70-110 km", "70〜110km")),
    (110, 999, "#313695", T("110 km +", "110km以上")),
]


def depth_colour(d):
    for lo, hi, c, _ in DEPTH_BANDS:
        if lo <= d < hi:
            return c
    return "#313695"


def mag_size(m):
    """M2 で 12pt^2、M7.4 で 900pt^2 くらいになるよう指数で効かせる。"""
    return 9.0 * (2.35 ** m) / 12.0


# 主要な町。Natural Earth に無い小さな自治体は SGC / DANE の座標で補う
TOWNS = [
    ("San José del Palmar", -76.2286, 4.8944, "town"),
    ("Sipí", -76.6442, 4.6528, "town"),
    ("Nóvita", -76.6058, 4.9550, "town"),
    ("Istmina", -76.6853, 5.1594, "town"),
    ("Quibdó", -76.6614, 5.6947, "city"),
    ("Buenaventura", -77.0197, 3.8801, "city"),
    ("Cali", -76.5225, 3.4372, "city"),
    ("Pereira", -75.6906, 4.8133, "city"),
    ("Armenia", -75.6811, 4.5339, "city"),
    ("Manizales", -75.5138, 5.0689, "city"),
    ("Medellín", -75.5636, 6.2518, "city"),
]

fig = plt.figure(figsize=(10.0, 8.2), dpi=200)
ax = fig.add_axes([0.055, 0.085, 0.665, 0.795])
ax.set_xlim(W, E)
ax.set_ylim(S, N)
# 緯度による経度の縮みを補正して距離を正しく見せる
ax.set_aspect(1.0 / math.cos(math.radians((S + N) / 2.0)))
ax.set_facecolor("#eef2f5")

for a in base["admin1"]:
    face = "#f7f5ef" if a["iso3"] == "COL" else "#e9e9e9"
    for ring in a["rings"]:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        ax.fill(xs, ys, face, ec="#b6bcc2", lw=0.6, zorder=1)

for line in base["rivers"]:
    ax.plot([p[0] for p in line], [p[1] for p in line],
            color="#9fc5e8", lw=0.6, zorder=2)
for line in base["coast"]:
    ax.plot([p[0] for p in line], [p[1] for p in line],
            color="#5b8ca8", lw=1.0, zorder=3)

DEPT_LABELS = [
    ("CHOCÓ", -77.05, 5.55), ("VALLE DEL CAUCA", -76.55, 3.85),
    ("RISARALDA", -75.95, 5.30), ("CALDAS", -75.35, 5.45),
    ("ANTIOQUIA", -75.60, 6.55), ("QUINDÍO", -75.72, 4.35),
    ("CAUCA", -76.75, 3.15), ("TOLIMA", -75.05, 4.55),
]
for name, x, y in DEPT_LABELS:
    if W < x < E and S < y < N:
        ax.text(x, y, name, fontsize=6.5, color="#8a949c",
                ha="center", va="center", zorder=4)

# 余震（小さい順に描いて大きいものを上に出す）
for e in sorted(after, key=lambda e: e["mag"]):
    ax.scatter(e["lon"], e["lat"], s=mag_size(e["mag"]),
               facecolor=depth_colour(e["dep"]), edgecolor="#2b2b2b",
               linewidth=0.35, alpha=0.85, zorder=5)

# 本震
ax.scatter(main["lon"], main["lat"], s=620, marker="*",
           facecolor="#ffdd33", edgecolor="#a00000", linewidth=1.6, zorder=7)
ax.annotate(
    T2("Mainshock  Mw 7.4\n10 Aug 2026 12:34 UTC\ndepth 103 km",
       "本震  Mw7.4\n2026年8月10日 12:34 UTC\n深さ103km"),
    xy=(main["lon"], main["lat"]), xytext=(main["lon"] - 1.02, main["lat"] + 0.55),
    fontsize=7.6, color="#a00000", ha="left", va="bottom", zorder=8,
    bbox=dict(boxstyle="round,pad=0.32", fc="white", ec="#a00000", lw=0.9,
              alpha=0.94),
    arrowprops=dict(arrowstyle="-", color="#a00000", lw=0.9))

for name, x, y, kind in TOWNS:
    if not (W < x < E and S < y < N):
        continue
    big = kind == "city"
    ax.plot(x, y, marker="s", ms=3.6 if big else 2.6,
            mfc="#ffffff", mec="#333333", mew=0.8, zorder=9)
    ax.text(x + 0.055, y + 0.045, name,
            fontsize=7.2 if big else 6.4,
            color="#222222" if big else "#444444", zorder=9,
            path_effects=[matplotlib.patheffects.withStroke(
                linewidth=2.0, foreground="white")])

# 距離スケール（緯度中央での 1 度の長さから換算）
km_per_deg = 111.32 * math.cos(math.radians((S + N) / 2.0))
bar_km = 50.0
bar_deg = bar_km / km_per_deg
x0, y0 = W + 0.22, S + 0.24
ax.plot([x0, x0 + bar_deg], [y0, y0], color="#222222", lw=2.4, zorder=10,
        solid_capstyle="butt")
ax.plot([x0, x0], [y0 - 0.05, y0 + 0.05], color="#222222", lw=1.4, zorder=10)
ax.plot([x0 + bar_deg, x0 + bar_deg], [y0 - 0.05, y0 + 0.05],
        color="#222222", lw=1.4, zorder=10)
ax.text(x0 + bar_deg / 2, y0 + 0.09, "50 km", fontsize=7,
        ha="center", va="bottom", zorder=10)

ax.set_xticks([round(v, 1) for v in
               [W + 0.4 + 1.0 * i for i in range(int((E - W) / 1.0))]])
ax.set_yticks([round(v, 1) for v in
               [S + 0.2 + 1.0 * i for i in range(int((N - S) / 1.0) + 1)]])
ax.tick_params(labelsize=6.5, colors="#666666", length=2)
ax.set_xticklabels(["%.1f°W" % abs(v) for v in ax.get_xticks()])
ax.set_yticklabels(["%.1f°N" % v for v in ax.get_yticks()])
for s in ax.spines.values():
    s.set_edgecolor("#8a949c")
    s.set_linewidth(0.8)

# --- 位置図 -------------------------------------------------------------
iw, ie, isou, ino = inset["bbox"]
axi = fig.add_axes([0.745, 0.610, 0.235, 0.250])
axi.set_xlim(iw, ie)
axi.set_ylim(isou, ino)
axi.set_aspect(1.0 / math.cos(math.radians(5.0)))
axi.set_facecolor("#dce9f2")
for c in inset["countries"]:
    face = "#f7f5ef" if c["iso3"] == "COL" else "#e4e4e4"
    for ring in c["rings"]:
        axi.fill([p[0] for p in ring], [p[1] for p in ring], face,
                 ec="#a8afb5", lw=0.5)
axi.add_patch(Rectangle((W, S), E - W, N - S, fill=False, ec="#a00000",
                        lw=1.4, zorder=5))
axi.plot(-74.07, 4.71, marker="o", ms=3, mfc="#222222", mec="white", mew=0.7,
         zorder=6)
axi.text(-73.75, 4.71, "Bogotá", fontsize=6, va="center", zorder=6)
axi.set_xticks([])
axi.set_yticks([])
for s in axi.spines.values():
    s.set_edgecolor("#8a949c")
axi.set_title(T("Location", "位置図"), fontsize=7, pad=2)

# --- 凡例 ---------------------------------------------------------------
axl = fig.add_axes([0.745, 0.085, 0.235, 0.495])
axl.axis("off")

depth_handles = [
    Line2D([], [], marker="o", ls="", ms=7, mfc=c, mec="#2b2b2b", mew=0.5,
           label=lab)
    for _, _, c, lab in DEPTH_BANDS
]
leg1 = axl.legend(handles=depth_handles, loc="upper left",
                  bbox_to_anchor=(0.0, 1.0), frameon=True, fontsize=7,
                  title=T("Focal depth", "震源の深さ"), title_fontsize=7.5,
                  handletextpad=0.7, labelspacing=0.65, borderpad=0.7)
leg1.get_frame().set_edgecolor("#b6bcc2")
axl.add_artist(leg1)

mag_handles = [
    Line2D([], [], marker="o", ls="", mfc="#bbbbbb", mec="#2b2b2b", mew=0.5,
           ms=math.sqrt(mag_size(m)), label="M %.1f" % m)
    for m in (3.0, 4.0, 5.0, 6.0)
] + [
    Line2D([], [], marker="*", ls="", mfc="#ffdd33", mec="#a00000", mew=1.2,
           ms=17, label=T("Mainshock M 7.4", "本震 M7.4")),
]
leg2 = axl.legend(handles=mag_handles, loc="upper left",
                  bbox_to_anchor=(0.0, 0.535), frameon=True, fontsize=7,
                  title=T("Magnitude", "マグニチュード"), title_fontsize=7.5,
                  handletextpad=1.0, labelspacing=1.05, borderpad=0.7)
leg2.get_frame().set_edgecolor("#b6bcc2")

axl.text(0.0, 0.02,
         T2("%d events plotted (M %.1f-%.1f)" %
            (len(events), min(e["mag"] for e in events),
             max(e["mag"] for e in events)),
            "図示した地震 %d 個（M%.1f〜M%.1f）" %
            (len(events), min(e["mag"] for e in events),
             max(e["mag"] for e in events))),
         transform=axl.transAxes, fontsize=7, color="#444444",
         va="bottom", ha="left")

fig.text(0.055, 0.985,
         T2("2026 Chocó Earthquake (Colombia) — Epicentre distribution",
            "2026年コロンビア・チョコ地震　震央分布図"),
         fontsize=12.5, fontweight="bold", color="#1f3b52", va="top",
         linespacing=1.35)
fig.text(0.055, 0.924,
         T2("Mainshock and aftershocks, 10-19 August 2026",
            "本震および余震（2026年8月10日〜19日）"),
         fontsize=8.2, color="#4a5c6a", va="top", linespacing=1.35)
fig.text(0.055, 0.010,
         T2("Source: Servicio Geológico Colombiano (SGC), "
            "Catálogo de Sismicidad (accessed 20 Aug 2026). "
            "Base map: Natural Earth.",
            "出典：コロンビア地質調査所（SGC）地震カタログ"
            "（2026年8月20日取得）。地形：Natural Earth"),
         fontsize=6.6, color="#6b7780", va="bottom", linespacing=1.4)

fig.savefig("epicentre_distribution.png", dpi=200,
            facecolor="white", bbox_inches=None)
print("wrote epicentre_distribution.png")
print("events=%d  mainshock=%s M%.1f %.3f/%.3f %.1fkm"
      % (len(events), main["t"], main["mag"], main["lat"], main["lon"],
         main["dep"]))
