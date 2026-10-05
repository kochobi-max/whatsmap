#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ldi_state.py — 「もう使った記事」を覚えておく台帳

    python scripts/ldi_state.py --show                 今日の作業前に読む
    python scripts/ldi_state.py --seen <URL>           その記事を既に使ったか（0=使った / 3=まだ）
    python scripts/ldi_state.py --record <判定JSON>     今日の結果を書き足す

台帳: skills/ldi-cms-report/_state/ldi_seen.json

## なぜこれが要るか

定期タスクは**毎回まっさらなセッションで始まる。**前日の記憶が何も残らない。
そのため毎朝、同じ災害の同じ記事を読み直していた。

2026-10-05 に実測した1回のコストは **$15.87**、読み込みは2,000万トークン超。
**前日と同じものを読み直す時間が、その相当部分を占めていた。**

## これは Step 3.5 の代わりにはならない

**LDI個別ページの確認（Step 3.5）は毎回・全Key、省略不可のままである。**
CMS担当者が昨日入力したかもしれないので、LDI側は毎朝読み直さなければならない。
この台帳が省くのは「**一次情報源の記事**を二度読むこと」だけである。

  省けるもの  : 昨日使った記事そのもの（同じURL）の読み直し
  省けないもの: LDI個別ページの確認、新しい記事の探索、URLの動作確認

**判定を省く道具ではない。読み直しを省く道具である。**
"""
import argparse
import json
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)

# 台帳をどこに置くか
# ------------------
# **スキルのフォルダに書いても残らない。** 2026-10-06 に気づいた。
#
# このスキルは Cowork 環境で動く。セッションはリポジトリを clone しないし、
# アカウントから同期されたスキルのフォルダは**毎回配られるもの**で、
# こちらが書いたものが次の朝まで残る場所ではない。
#
# 残るのは、docx を毎日置いている場所だけである。
#
#   C:\Users\arakida\OneDrive - adrc.asia\LatestDisasterInfo\
#
# ここは OneDrive の同期フォルダで、Cowork からは `request_cowork_directory` で
# マウントして書き込んでいる（SKILL.md 上部「共有フォルダ」）。
# **docx が残っているのだから、台帳も残る。** 同じ場所に置く。
CANDIDATES = [
    os.environ.get("LDI_STATE_DIR"),
    r"C:\Users\arakida\OneDrive - adrc.asia\LatestDisasterInfo",
    "/mnt/user-data/outputs/LatestDisasterInfo",
    r"C:\Users\arakida\LatestDisasterInfo",
]


def ledger_path(explicit=None):
    """台帳のパスと、それが残る場所かどうかを返す。"""
    if explicit:
        return os.path.join(explicit, "ldi_seen.json"), True
    for d in CANDIDATES:
        if d and os.path.isdir(d):
            return os.path.join(d, "ldi_seen.json"), True
    # **見つからなかったことを黙らない。** ここに書いても次の朝には無い。
    return os.path.join(SKILL, "_state", "ldi_seen.json"), False


LEDGER = None          # main() で決める
PERSISTS = False


def load():
    try:
        with open(LEDGER, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        d = {}
    d.setdefault("keys", {})
    d.setdefault("urls", {})
    return d


def save(d):
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def show(d):
    keys = d["keys"]
    print("── 前回までに使った記事  （%s）" % LEDGER)
    if not PERSISTS:
        print("   ⚠ **この場所は次の朝まで残らない。**"
              " OneDrive の LatestDisasterInfo が見えていない。")
        print("     `request_cowork_directory` でマウントしてから、"
              "`--dir <マウント先>` を付けて呼び直すこと。")
    if not keys:
        print("   台帳が空。初回、または定期タスクが台帳をコミットしていない。")
        print("   **「前回と同じ」と判断できないので、今回はすべて読む。**")
        print("STATUS: EMPTY")
        return
    print("   %-8s %-22s %-12s %-8s %s" % ("Key", "災害", "前回の判定", "判定日", "使った記事"))
    for k in sorted(keys):
        v = keys[k]
        print("   %-8s %-22s %-12s %-8s %s" % (
            k, (v.get("disaster") or "")[:22], v.get("decision") or "-",
            v.get("judged_on") or "-", (v.get("source_url") or "-")[:60]))
    print("   記事の総数: %d" % len(d["urls"]))
    print("")
    print("   **LDI個別ページの確認（Step 3.5）は、この台帳に関わらず毎回・全Keyで行う。**")
    print("   台帳が省くのは『同じ記事を二度読むこと』だけである。")
    print("STATUS: OK %d keys" % len(keys))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", help="台帳を置くフォルダ（既定: OneDrive の LatestDisasterInfo）")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--show", action="store_true")
    g.add_argument("--seen", metavar="URL")
    g.add_argument("--record", metavar="JSON")
    a = ap.parse_args()
    global LEDGER, PERSISTS
    LEDGER, PERSISTS = ledger_path(a.dir)
    d = load()

    if a.show:
        show(d)
        return 0

    if a.seen:
        hit = d["urls"].get(a.seen.strip())
        if hit:
            print("   使った: %s（%s、Key %s）" % (a.seen, hit.get("used_on"), hit.get("key")))
            print("STATUS: SEEN")
            return 0
        print("   まだ使っていない: %s" % a.seen)
        print("STATUS: NEW")
        return 3

    # --record
    with open(a.record, encoding="utf-8") as f:
        rec = json.load(f)
    today = rec.get("created_date") or date.today().isoformat()
    rows = rec.get("skip_table") or []
    by_id = {str(e.get("ldi_id")): e for e in (rec.get("entries") or [])}
    n = 0
    for r in rows:
        k = str(r.get("ldi_id") or "").strip()
        if not k:
            continue
        e = by_id.get(k) or {}
        url = (e.get("url1") or "").strip()
        d["keys"][k] = {
            "disaster": r.get("disaster"),
            "decision": r.get("decision"),
            "judged_on": today,
            "ldi_current": r.get("ldi_current"),
            "today_source": r.get("today_source"),
            "source_url": url or None,
        }
        if url.startswith("http"):
            d["urls"][url] = {"key": k, "used_on": today}
        n += 1
    save(d)
    print("   %d件を台帳に書いた（%s）" % (n, today))
    print("   置いた場所: %s" % LEDGER)
    if PERSISTS:
        print("   docx と同じフォルダなので、次の朝のセッションから読める。")
    else:
        print("   ⚠ **この場所は残らない。** 翌朝また同じ記事を読み直すことになる。")
        print("     OneDrive の LatestDisasterInfo をマウントして `--dir` で指定し直すこと。")
    print("STATUS: RECORDED %d" % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
