#!/usr/bin/env python3
"""Natural Earth の全世界データを地図の範囲に切り出し、1 つの軽い JSON にまとめる。

全世界版は 61MB あり、毎回読むには重い。範囲外を落として basemap.json に固める。
"""
import json

# 地図の描画範囲（震源域 + カリ・メデジン・キブド）
W, E, S, N = -77.9, -74.8, 3.2, 6.7
PAD = 1.0  # 範囲外の線が途中で切れて見えないよう余白をとる


def inside(lon, lat):
    return (W - PAD) <= lon <= (E + PAD) and (S - PAD) <= lat <= (N + PAD)


def clip_lines(geom):
    """LineString / MultiLineString を範囲内の区間だけに切る。"""
    out = []
    t = geom["type"]
    parts = [geom["coordinates"]] if t == "LineString" else geom["coordinates"]
    for part in parts:
        run = []
        for x, y in part:
            if inside(x, y):
                run.append([round(x, 4), round(y, 4)])
            elif run:
                if len(run) > 1:
                    out.append(run)
                run = []
        if len(run) > 1:
            out.append(run)
    return out


def clip_polys(geom):
    """Polygon / MultiPolygon の外周リングを、範囲に触れるものだけ残す。"""
    out = []
    t = geom["type"]
    polys = [geom["coordinates"]] if t == "Polygon" else geom["coordinates"]
    for poly in polys:
        for ring in poly:
            if not any(inside(x, y) for x, y in ring):
                continue
            out.append([[round(x, 4), round(y, 4)] for x, y in ring])
    return out


base = {"bbox": [W, E, S, N], "admin1": [], "coast": [], "rivers": [],
        "places": []}

with open("ne/ne_10m_admin_1_states_provinces.geojson", encoding="utf-8") as fh:
    for f in json.load(fh)["features"]:
        p = f["properties"]
        if p.get("adm0_a3") not in ("COL", "ECU", "PAN", "VEN", "PER", "BRA"):
            continue
        rings = clip_polys(f["geometry"])
        if rings:
            base["admin1"].append({
                "name": p.get("name") or "",
                "iso3": p.get("adm0_a3"),
                "rings": rings,
            })

with open("ne/ne_10m_coastline.geojson", encoding="utf-8") as fh:
    for f in json.load(fh)["features"]:
        base["coast"] += clip_lines(f["geometry"])

with open("ne/ne_10m_rivers_lake_centerlines.geojson", encoding="utf-8") as fh:
    for f in json.load(fh)["features"]:
        base["rivers"] += clip_lines(f["geometry"])

with open("ne/ne_10m_populated_places_simple.geojson", encoding="utf-8") as fh:
    for f in json.load(fh)["features"]:
        p = f["properties"]
        if p.get("adm0name") != "Colombia":
            continue
        x, y = f["geometry"]["coordinates"]
        if not inside(x, y):
            continue
        base["places"].append({
            "name": p.get("name"), "lon": round(x, 4), "lat": round(y, 4),
            "pop": p.get("pop_max") or 0, "rank": p.get("scalerank") or 99,
        })

with open("basemap.json", "w", encoding="utf-8") as fh:
    json.dump(base, fh, ensure_ascii=False, separators=(",", ":"))

print("admin1 %d / coast %d / rivers %d / places %d"
      % (len(base["admin1"]), len(base["coast"]), len(base["rivers"]),
         len(base["places"])))
print("departments:", sorted({a["name"] for a in base["admin1"]
                              if a["iso3"] == "COL"}))
