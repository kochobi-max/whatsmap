#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
match_glide_emdat.py — GLIDE と EM-DAT を突合し、不整合をケース分類する

標準ライブラリだけで動く（pandas 不要）。

入力:
  --glide  GLIDE の CSV   （HDX の global-glide-events など）
  --emdat  EM-DAT の CSV  （EM-DAT public を CSV で書き出したもの）

出力:
  --out-matches  突合結果の全件 CSV（両者のIDと数値を横に並べたマスタ）
  --out-summary  ケース別集計 CSV
  標準出力に集計表

ケース分類:
  C1 整合         双方に存在し、国・種別・日付・規模が一致
  C2 GLIDE未登録   EM-DAT にあり GLIDE にない
  C3 EM-DAT未登録  GLIDE にあり EM-DAT にない
  C4 識別子ずれ    双方にあるが 国コード / 日付 / 種別分類 が不一致
  C5 粒度差       1対多・多対1（台風を国別に分割 / 複数洪水を1件に統合）
  C6 閾値差       相手方の登録基準に届かず対象外（＝正常な差・解消不要）
  C7 重複         同一DB内に同一災害が複数登録

自己テスト:
  python3 match_glide_emdat.py --selftest
"""

import argparse
import csv
import io
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, timedelta

# ---------------------------------------------------------------- 災害種別の対応

# GLIDE のイベントコード → 正規化した種別キー
GLIDE_TYPE = {
    "EQ": "earthquake", "TS": "tsunami", "VO": "volcano",
    "FL": "flood", "FF": "flood", "ST": "storm", "TC": "storm", "SS": "storm",
    "VW": "storm", "TO": "storm", "LS": "landslide", "MS": "landslide",
    "AV": "landslide", "DR": "drought", "WF": "wildfire", "FR": "fire",
    "EP": "epidemic", "IN": "infestation", "CW": "extreme_temp",
    "HT": "extreme_temp", "EC": "extreme_temp", "CE": "complex",
    "AC": "accident", "TC_": "storm", "OT": "other", "SL": "landslide",
}

# EM-DAT の Disaster Type / Subtype（表記ゆれを吸収するため小文字・部分一致で判定）
EMDAT_TYPE_PATTERNS = [
    ("earthquake",    [r"earthquake", r"ground movement"]),
    ("tsunami",       [r"tsunami"]),
    ("volcano",       [r"volcan"]),
    ("storm",         [r"storm", r"cyclone", r"tornado", r"hurricane", r"typhoon"]),
    ("flood",         [r"flood"]),
    ("landslide",     [r"landslide", r"mass movement", r"avalanche", r"mudslide", r"rockfall"]),
    ("drought",       [r"drought"]),
    ("wildfire",      [r"wildfire", r"forest fire"]),
    ("fire",          [r"^fire", r"industrial fire"]),
    ("epidemic",      [r"epidemic", r"viral", r"bacterial", r"infectious"]),
    ("infestation",   [r"infestation", r"insect"]),
    ("extreme_temp",  [r"extreme temperature", r"cold wave", r"heat wave", r"severe winter"]),
    ("accident",      [r"accident", r"collapse", r"explosion", r"transport"]),
    ("complex",       [r"complex"]),
]

GLIDE_RE = re.compile(r"\b([A-Z]{2})-(\d{4})-(\d{6})-([A-Z]{3})\b")


def norm_emdat_type(text):
    t = (text or "").strip().lower()
    if not t:
        return "unknown"
    for key, pats in EMDAT_TYPE_PATTERNS:
        for p in pats:
            if re.search(p, t):
                return key
    return "other"


def norm_glide_type(code):
    return GLIDE_TYPE.get((code or "").strip().upper(), "other")


# ---------------------------------------------------------------- 列名の推定

def pick(header, *candidates):
    """ヘッダから候補名に最も近い列を選ぶ（小文字・記号無視の部分一致）。"""
    def key(s):
        return re.sub(r"[^a-z0-9]", "", (s or "").lower())
    hk = {key(h): h for h in header}
    for c in candidates:
        ck = key(c)
        if ck in hk:
            return hk[ck]
    for c in candidates:
        ck = key(c)
        for k, orig in hk.items():
            if ck and ck in k:
                return orig
    return None


def to_int(v):
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if s == "" or s.lower() in ("na", "n/a", "nan", "-"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def to_date(y, m, d):
    y, m, d = to_int(y), to_int(m), to_int(d)
    if not y:
        return None
    return date(y, m or 1, min(d or 1, 28) if (m in (2,) and (d or 1) > 28) else (d or 1))


def parse_date_str(s):
    if not s:
        return None
    s = str(s).strip()
    m = re.match(r"(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?", s)
    if m:
        return to_date(m.group(1), m.group(2), m.group(3) or 1)
    m = re.match(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", s)
    if m:
        return to_date(m.group(3), m.group(2), m.group(1))
    return None


# ---------------------------------------------------------------- 読み込み

def read_csv_rows(path):
    with io.open(path, "r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(8192)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        return list(csv.DictReader(f, dialect=dialect))


def load_glide(path):
    rows = read_csv_rows(path)
    if not rows:
        return []
    h = list(rows[0].keys())
    c_num = pick(h, "glide", "glidenumber", "glide_number", "number")
    c_ev = pick(h, "event", "eventcode", "hazard", "disastertype")
    c_iso = pick(h, "iso3", "iso", "countrycode", "country_code")
    c_ctry = pick(h, "country", "countryname", "location")
    c_y, c_m, c_d = pick(h, "year"), pick(h, "month"), pick(h, "day")
    c_date = pick(h, "date", "startdate", "eventdate")
    c_deaths = pick(h, "deaths", "killed", "totaldeaths")
    c_comment = pick(h, "comments", "comment", "information", "title")

    out = []
    for i, r in enumerate(rows):
        num = (r.get(c_num) or "").strip() if c_num else ""
        ev = (r.get(c_ev) or "").strip() if c_ev else ""
        iso = (r.get(c_iso) or "").strip().upper() if c_iso else ""
        # GLIDE番号そのものから種別・年・国を補完できる
        m = GLIDE_RE.search(num)
        if m:
            ev = ev or m.group(1)
            iso = iso or m.group(4)
        dt = parse_date_str(r.get(c_date)) if c_date else None
        if dt is None and c_y:
            dt = to_date(r.get(c_y), r.get(c_m), r.get(c_d))
        out.append({
            "src": "GLIDE", "row": i + 2,
            "id": num or f"(no-number)#{i+2}",
            "iso3": iso, "country": (r.get(c_ctry) or "").strip() if c_ctry else "",
            "type": norm_glide_type(ev), "type_raw": ev,
            "date": dt,
            "deaths": to_int(r.get(c_deaths)) if c_deaths else None,
            "note": (r.get(c_comment) or "").strip()[:120] if c_comment else "",
        })
    return out


def load_emdat(path):
    rows = read_csv_rows(path)
    if not rows:
        return []
    h = list(rows[0].keys())
    c_id = pick(h, "disno", "disno.", "disasterno", "emdatid")
    c_glide = pick(h, "glide", "glideno", "glidenumber")
    c_iso = pick(h, "iso", "iso3", "countrycode")
    c_ctry = pick(h, "country", "countryname")
    c_type = pick(h, "disastertype", "type")
    c_sub = pick(h, "disastersubtype", "subtype")
    c_y = pick(h, "startyear", "year")
    c_m = pick(h, "startmonth")
    c_d = pick(h, "startday")
    c_deaths = pick(h, "totaldeaths", "deaths")
    c_aff = pick(h, "totalaffected", "affected")
    c_name = pick(h, "eventname", "name", "location")

    out = []
    for i, r in enumerate(rows):
        gl = (r.get(c_glide) or "").strip() if c_glide else ""
        gm = GLIDE_RE.search(gl)
        typ = norm_emdat_type(((r.get(c_sub) or "") + " " + (r.get(c_type) or "")) if (c_sub or c_type) else "")
        out.append({
            "src": "EMDAT", "row": i + 2,
            "id": (r.get(c_id) or f"(no-disno)#{i+2}").strip() if c_id else f"(no-disno)#{i+2}",
            "glide_ref": gm.group(0) if gm else "",
            "iso3": (r.get(c_iso) or "").strip().upper() if c_iso else "",
            "country": (r.get(c_ctry) or "").strip() if c_ctry else "",
            "type": typ, "type_raw": ((r.get(c_type) or "") + "/" + (r.get(c_sub) or "")).strip("/"),
            "date": to_date(r.get(c_y), r.get(c_m), r.get(c_d)) if c_y else None,
            "deaths": to_int(r.get(c_deaths)) if c_deaths else None,
            "affected": to_int(r.get(c_aff)) if c_aff else None,
            "note": (r.get(c_name) or "").strip()[:120] if c_name else "",
        })
    return out


# ---------------------------------------------------------------- 突合と分類

def within(a, b, days):
    if a is None or b is None:
        return False
    return abs((a - b).days) <= days


def dup_key(r):
    return (r["iso3"], r["type"], r["date"].isoformat() if r["date"] else "")


def classify(glide_rows, emdat_rows, window, emdat_death_floor):
    """EM-DAT の登録基準（既定: 死者10人以上）に満たないものは C6 として分母から外す。"""
    matches = []
    used_g, used_e = set(), set()

    # --- 同一DB内の重複（C7）を先に拾う
    dups = []
    for label, rows in (("GLIDE", glide_rows), ("EM-DAT", emdat_rows)):
        seen = defaultdict(list)
        for idx, r in enumerate(rows):
            if r["date"] and r["iso3"]:
                seen[dup_key(r)].append(idx)
        for k, idxs in seen.items():
            if len(idxs) > 1:
                dups.append({"db": label, "key": k, "ids": [rows[i]["id"] for i in idxs]})

    # --- 第1段: EM-DAT が保持する GLIDE 番号による明示リンク
    g_by_id = {}
    for i, g in enumerate(glide_rows):
        if g["id"]:
            g_by_id.setdefault(g["id"], i)

    for j, e in enumerate(emdat_rows):
        if not e["glide_ref"]:
            continue
        i = g_by_id.get(e["glide_ref"])
        if i is None or i in used_g:
            continue
        g = glide_rows[i]
        mism = []
        if g["iso3"] and e["iso3"] and g["iso3"] != e["iso3"]:
            mism.append("国コード")
        if g["type"] != e["type"]:
            mism.append("種別分類")
        if g["date"] and e["date"] and not within(g["date"], e["date"], window):
            mism.append("日付")
        matches.append({
            "case": "C4" if mism else "C1",
            "glide_id": g["id"], "emdat_id": e["id"],
            "iso3": g["iso3"] or e["iso3"], "type": g["type"],
            "glide_date": g["date"], "emdat_date": e["date"],
            "glide_deaths": g["deaths"], "emdat_deaths": e["deaths"],
            "reason": "、".join(mism) + "が不一致" if mism else "明示リンク一致",
            "link": "glide_ref",
        })
        used_g.add(i); used_e.add(j)

    # --- 第2段: 国 × 種別 × 日付±window
    bucket = defaultdict(list)
    for i, g in enumerate(glide_rows):
        if i in used_g:
            continue
        bucket[(g["iso3"], g["type"])].append(i)

    pair_count_g = defaultdict(int)
    pair_count_e = defaultdict(int)
    provisional = []

    for j, e in enumerate(emdat_rows):
        if j in used_e:
            continue
        for i in bucket.get((e["iso3"], e["type"]), []):
            g = glide_rows[i]
            if within(g["date"], e["date"], window):
                provisional.append((i, j))
                pair_count_g[i] += 1
                pair_count_e[j] += 1

    for i, j in provisional:
        if j in used_e:
            continue
        # 1対多のハブ（1つのGLIDEに複数のEM-DATがぶら下がる）は、
        # 2件目以降も同じGLIDEに紐づけて C5 にする。ここで打ち切ると
        # 2件目が「GLIDE未登録(C2)」に落ちてしまい、粒度差を取りこぼす。
        if i in used_g and pair_count_g[i] <= 1:
            continue
        g, e = glide_rows[i], emdat_rows[j]
        granular = pair_count_g[i] > 1 or pair_count_e[j] > 1
        exact = g["date"] and e["date"] and g["date"] == e["date"]
        matches.append({
            "case": "C5" if granular else ("C1" if exact else "C4"),
            "glide_id": g["id"], "emdat_id": e["id"],
            "iso3": g["iso3"], "type": g["type"],
            "glide_date": g["date"], "emdat_date": e["date"],
            "glide_deaths": g["deaths"], "emdat_deaths": e["deaths"],
            "reason": (f"1対多・多対1（GLIDE側{pair_count_g[i]}件・EM-DAT側{pair_count_e[j]}件）"
                       if granular else ("日付一致" if exact else f"日付が{window}日以内でずれ")),
            "link": "iso3+type+date",
        })
        used_g.add(i); used_e.add(j)

    # --- 残り: 片側のみ
    for i, g in enumerate(glide_rows):
        if i in used_g:
            continue
        matches.append({
            "case": "C3", "glide_id": g["id"], "emdat_id": "",
            "iso3": g["iso3"], "type": g["type"],
            "glide_date": g["date"], "emdat_date": None,
            "glide_deaths": g["deaths"], "emdat_deaths": None,
            "reason": "GLIDEのみ（EM-DAT未登録）", "link": "",
        })

    for j, e in enumerate(emdat_rows):
        if j in used_e:
            continue
        below = e["deaths"] is not None and e["deaths"] < emdat_death_floor
        matches.append({
            "case": "C6" if below else "C2",
            "glide_id": "", "emdat_id": e["id"],
            "iso3": e["iso3"], "type": e["type"],
            "glide_date": None, "emdat_date": e["date"],
            "glide_deaths": None, "emdat_deaths": e["deaths"],
            "reason": (f"死者{e['deaths']}人で閾値{emdat_death_floor}人未満（正常な差）"
                       if below else "EM-DATのみ（GLIDE未登録）"),
            "link": "",
        })

    return matches, dups


CASE_LABEL = {
    "C1": "整合", "C2": "GLIDE未登録", "C3": "EM-DAT未登録",
    "C4": "識別子ずれ", "C5": "粒度差", "C6": "閾値差（正常）", "C7": "重複",
}


def summarize(matches, dups):
    counts = defaultdict(int)
    for m in matches:
        counts[m["case"]] += 1
    counts["C7"] = len(dups)
    total = sum(counts.values())
    # C6 は「正常な差」なので不整合の分母から外す
    denom = total - counts["C6"]
    return counts, total, denom


def write_csv(path, rows, fields):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with io.open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fields})


def print_report(counts, total, denom, dups):
    print("\n## GLIDE × EM-DAT 突合結果\n")
    print("| コード | ケース | 件数 | 不整合分母に対する割合 |")
    print("|--------|--------|------|----------------------|")
    for c in ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]:
        n = counts.get(c, 0)
        pct = "—" if c == "C6" or denom == 0 else f"{n / denom * 100:.1f}%"
        print(f"| {c} | {CASE_LABEL[c]} | {n:,} | {pct} |")
    print(f"\n全 {total:,} 件（うち C6 閾値差 {counts.get('C6', 0):,} 件は正常な差のため分母から除外 → 分母 {denom:,} 件）")
    if dups:
        print(f"\n重複（C7）の例:")
        for d in dups[:5]:
            print(f"  - {d['db']}: {d['key']} → {', '.join(d['ids'][:4])}")


# ---------------------------------------------------------------- 自己テスト

SELFTEST_GLIDE = """glide,event,iso3,country,year,month,day,deaths,comments
EQ-2026-000135-JPN,EQ,JPN,Japan,2026,7,28,24,Kumamoto earthquake
EQ-2026-000146-COL,EQ,COL,Colombia,2026,8,10,,Choco earthquake
EQ-2026-000150-IDN,EQ,IDN,Indonesia,2026,8,15,,NTT earthquake
TC-2026-000101-PHL,TC,PHL,Philippines,2026,6,1,40,Typhoon A
FL-2026-000200-THA,FL,THA,Thailand,2026,5,3,12,Flood north
FL-2026-000201-THA,FL,THA,Thailand,2026,5,3,12,Flood north duplicate
VO-2026-000300-IDN,VO,IDN,Indonesia,2026,3,9,5,Volcano
"""

SELFTEST_EMDAT = """DisNo.,Glide,ISO,Country,Disaster Type,Disaster Subtype,Start Year,Start Month,Start Day,Total Deaths,Total Affected,Event Name
2026-0135-JPN,EQ-2026-000135-JPN,JPN,Japan,Geophysical,Earthquake,2026,7,28,24,120000,Kumamoto
2026-0146-COL,,COL,Colombia,Geophysical,Earthquake,2026,8,12,80,50000,Choco
2026-0101-PHL,,PHL,Philippines,Meteorological,Tropical cyclone,2026,6,1,40,900000,Typhoon A Luzon
2026-0102-PHL,,PHL,Philippines,Meteorological,Tropical cyclone,2026,6,3,15,300000,Typhoon A Visayas
2026-0400-VNM,,VNM,Viet Nam,Hydrological,Flood,2026,9,1,150,40000,Mekong flood
2026-0401-NPL,,NPL,Nepal,Hydrological,Flood,2026,7,2,3,900,Small flood
"""


def selftest():
    import tempfile
    d = tempfile.mkdtemp()
    gp, ep = os.path.join(d, "g.csv"), os.path.join(d, "e.csv")
    io.open(gp, "w", encoding="utf-8").write(SELFTEST_GLIDE)
    io.open(ep, "w", encoding="utf-8").write(SELFTEST_EMDAT)

    g, e = load_glide(gp), load_emdat(ep)
    assert len(g) == 7, f"GLIDE 7件のはずが {len(g)}"
    assert len(e) == 6, f"EM-DAT 6件のはずが {len(e)}"
    assert e[0]["glide_ref"] == "EQ-2026-000135-JPN", "EM-DAT の Glide 列を読めていない"
    assert e[0]["type"] == "earthquake" and e[2]["type"] == "storm", "EM-DAT 種別の正規化に失敗"
    assert g[3]["type"] == "storm", "GLIDE TC → storm の対応に失敗"

    matches, dups = classify(g, e, window=7, emdat_death_floor=10)
    by = defaultdict(list)
    for m in matches:
        by[m["case"]].append(m)

    checks = [
        ("熊本は明示リンクで C1",
         any(m["glide_id"] == "EQ-2026-000135-JPN" and m["case"] == "C1" for m in matches)),
        ("コロンビアは日付2日ずれで C4",
         any(m["glide_id"] == "EQ-2026-000146-COL" and m["case"] == "C4" for m in matches)),
        ("台風Aは1対多で C5（分割された EM-DAT 2件とも）",
         sum(1 for m in matches if m["glide_id"] == "TC-2026-000101-PHL" and m["case"] == "C5") == 2),
        ("台風Aの2件目が C2 に落ちていない",
         not any(m["emdat_id"] == "2026-0102-PHL" and m["case"] == "C2" for m in matches)),
        ("ベトナム洪水は GLIDE 未登録で C2",
         any(m["emdat_id"] == "2026-0400-VNM" and m["case"] == "C2" for m in matches)),
        ("ネパール小洪水(死者3)は閾値差 C6",
         any(m["emdat_id"] == "2026-0401-NPL" and m["case"] == "C6" for m in matches)),
        ("インドネシアNTT・火山は EM-DAT 未登録で C3",
         sum(1 for m in matches if m["case"] == "C3" and m["glide_id"].startswith(("EQ-2026-000150", "VO-2026-000300"))) == 2),
        ("タイ洪水の重複を C7 として検出",
         any(d["db"] == "GLIDE" and "THA" in d["key"] for d in dups)),
    ]
    ok = True
    print("\n## 自己テスト\n")
    for name, res in checks:
        print(f"  {'✓' if res else '✗'} {name}")
        ok = ok and res

    counts, total, denom = summarize(matches, dups)
    print_report(counts, total, denom, dups)
    print("\n合格" if ok else "\n不合格")
    return 0 if ok else 1


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="GLIDE と EM-DAT を突合してケース分類する")
    ap.add_argument("--glide")
    ap.add_argument("--emdat")
    ap.add_argument("--window", type=int, default=7, help="日付の許容差（日）。既定 7")
    ap.add_argument("--emdat-death-floor", type=int, default=10,
                    help="これ未満の死者数のEM-DAT単独案件は C6（正常な差）とする。既定 10")
    ap.add_argument("--out-matches", default="")
    ap.add_argument("--out-summary", default="")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()

    if a.selftest:
        sys.exit(selftest())

    if not a.glide or not a.emdat:
        ap.error("--glide と --emdat が必要です（または --selftest）")

    g, e = load_glide(a.glide), load_emdat(a.emdat)
    print(f"読み込み: GLIDE {len(g):,}件 / EM-DAT {len(e):,}件")
    matches, dups = classify(g, e, a.window, a.emdat_death_floor)
    counts, total, denom = summarize(matches, dups)
    print_report(counts, total, denom, dups)

    fields = ["case", "glide_id", "emdat_id", "iso3", "type",
              "glide_date", "emdat_date", "glide_deaths", "emdat_deaths", "reason", "link"]
    if a.out_matches:
        write_csv(a.out_matches, matches, fields)
        print(f"\n突合マスタ: {a.out_matches}")
    if a.out_summary:
        rows = [{"case": c, "label": CASE_LABEL[c], "count": counts.get(c, 0)}
                for c in ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]]
        write_csv(a.out_summary, rows, ["case", "label", "count"])
        print(f"集計: {a.out_summary}")


if __name__ == "__main__":
    main()
