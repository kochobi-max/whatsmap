#!/usr/bin/env python3
"""ネパール全77郡の境界を BIPAD ポータルから取り直し、間引いて data/ に置く。

    python3 refresh_boundaries.py

元データは 14.7MB ある。表示は横数百pxなので 0.004度（約400m）で間引く。
出力 `data/np_districts.json` は約650KB。郡界は年に何度も変わるものではないので、
普段は取り直さなくてよい。
"""
import io
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://bipadportal.gov.np/api/v1/district/?format=geojson&limit=100"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TOL = 0.004


def simplify(ring):
    out = [ring[0]]
    for p in ring[1:-1]:
        if abs(p[0] - out[-1][0]) > TOL or abs(p[1] - out[-1][1]) > TOL:
            out.append(p)
    out.append(ring[-1])
    return [[round(x, 4), round(y, 4)] for x, y in out]


def main():
    # Node の fetch も requests もこの環境のプロキシを見ない。curl で取る。
    raw = subprocess.run(["curl", "-sSL", "-A", UA, "--max-time", "120", URL],
                         check=True, capture_output=True).stdout
    src = json.loads(raw)
    feats = []
    for f in src["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        rings = [r for r in (simplify(p[0]) for p in polys) if len(r) >= 4]
        if not rings:
            continue
        p = f["properties"]
        feats.append({"name": p.get("title_en"), "code": p.get("code"),
                      "province": p.get("province"),
                      "bbox": [round(v, 4) for v in p.get("bbox", [])],
                      "centroid": [round(v, 4) for v in p["centroid"]["coordinates"]],
                      "rings": rings})
    if len(feats) < 70:
        raise SystemExit("郡が %d 件しか取れていない。77件あるはず。上書きしない。" % len(feats))

    out = {"source": "BIPAD Portal (Ministry of Home Affairs, Nepal) — " + URL,
           "districts": feats}
    path = os.path.join(HERE, "data", "np_districts.json")
    with io.open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("郡 %d / %s  %dKB" % (len(feats), path, os.path.getsize(path) // 1024))


main()
