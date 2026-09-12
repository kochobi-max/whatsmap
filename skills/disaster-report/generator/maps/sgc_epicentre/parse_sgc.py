#!/usr/bin/env python3
"""SGC カタログの検索結果 HTML から震源リストを取り出して CSV にする。

入力は Consulta_Experta_Seiscomp/consulta_sismo.php が返す HTML。
列は SGC の表そのまま: Fecha-Hora (UTC), Lat, Long, Prof, Mag, Tipo Mag, ...
"""
import csv
import html
import re
import sys

src = sys.argv[1] if len(sys.argv) > 1 else "q3.html"
out = sys.argv[2] if len(sys.argv) > 2 else "sgc_events.csv"

s = open(src, encoding="utf-8", errors="replace").read()

rows = []
for tr in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", s):
    cells = re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", tr)
    if len(cells) < 6:
        continue
    txt = []
    for c in cells:
        c = re.sub(r"(?is)<script.*?</script>", " ", c)
        c = re.sub(r"(?s)<[^>]+>", " ", c)
        txt.append(re.sub(r"\s+", " ", html.unescape(c)).strip())
    # データ行は 1 列目が日時 YYYY-MM-DD HH:MM:SS
    if not re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", txt[0]):
        continue
    try:
        lat, lon, dep, mag = (float(txt[1]), float(txt[2]),
                              float(txt[3]), float(txt[4]))
    except (ValueError, IndexError):
        continue
    rows.append({
        "time_utc": txt[0], "lat": lat, "lon": lon,
        "depth_km": dep, "mag": mag,
        "mag_type": txt[5] if len(txt) > 5 else "",
        "region": txt[12] if len(txt) > 12 else "",
    })

rows.sort(key=lambda r: r["time_utc"])
with open(out, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

print(f"{len(rows)} events -> {out}")
if rows:
    big = max(rows, key=lambda r: r["mag"])
    print("max mag:", big["time_utc"], big["mag"], big["mag_type"],
          big["lat"], big["lon"], big["depth_km"], "km", big["region"])
    print("period :", rows[0]["time_utc"], "->", rows[-1]["time_utc"])
    print("mag    :", min(r["mag"] for r in rows), "-",
          max(r["mag"] for r in rows))
    print("depth  :", min(r["depth_km"] for r in rows), "-",
          max(r["depth_km"] for r in rows))
