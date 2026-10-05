#!/usr/bin/env python3
"""ADRC レポートQAスクリプト
Usage: python qa_report.py <path.docx> [--type ldi|generic] [--json]
Exit code: 0=PASS(WARNのみ含む) / 1=FAIL / 2=実行エラー
"""
import sys, re, json, datetime

PLACEHOLDER_FAIL = ["XXXX", "TBD", "○○", "△△", "例:", "例）", "[日本語タイトル]", "[英語タイトル]"]
PLACEHOLDER_WARN = ["確認中", "TBC"]
GLIDE_RE = re.compile(r"\b[A-Z]{2}-\d{4}-\d{6}-[A-Z]{3}\b")
GLIDE_LOOSE_RE = re.compile(r"\b[A-Z]{2}-\d{4}-\d{4,7}-[A-Z]{2,4}\b")
LDI_LABELS = ["レポートの種類", "タイトル（日本語）", "タイトル（英語）", "内容（日本語）", "内容（英語）", "URL1", "URL2"]

def result(item, status, detail=""):
    return {"item": item, "status": status, "detail": detail}

def check_ldi(doc):
    res = []
    paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    all_text = "\n".join(paras)

    # 2. title
    if any("ADRC LDI CMS" in p and "レポート" in p for p in paras):
        res.append(result("タイトル行", "PASS"))
    else:
        res.append(result("タイトル行", "FAIL", "「ADRC LDI CMS レポート入力データ」が見つからない"))

    # 3. date freshness
    # 作成日は **JST で見る。**
    #
    # 2026-10-06、実物に「作成日が今日ではない」WARN が出続けていた。
    # 文書の日付は JST（2026-10-06）、`date.today()` を呼んだコンテナは UTC（2026-10-05）。
    # **ずれていたのは日付ではなく、時間帯である。**
    # この業務は全部 JST で回っているので JST を基準にする。
    # どこで動かしても通るよう、UTC の今日も許容する。
    _utc = datetime.datetime.now(datetime.timezone.utc)
    _jst = _utc + datetime.timedelta(hours=9)
    ok_dates = {_utc.date().isoformat(), _jst.date().isoformat()}
    today = _jst.date().isoformat()
    m = re.search(r"作成日[:：]?\s*(\d{4}-\d{2}-\d{2})", all_text)
    if m:
        if m.group(1) in ok_dates:
            res.append(result("作成日", "PASS", m.group(1)))
        else:
            res.append(result("作成日", "WARN", f"作成日 {m.group(1)} ≠ 今日 {today}（JST）"))
    else:
        res.append(result("作成日", "WARN", "作成日が抽出できない"))

    # 4. counts
    #
    # 2026-10-06 修正。ここには2つの誤りがあり、**仕様どおりのdocxを必ず FAIL にしていた。**
    #
    #   (1) 「全N件検証」を期待エントリ数として比べていた。
    #       これは**確認した総数**であって、更新必要件数ではない（全13件検証 → 更新2件）。
    #       比べる相手は「更新必要 X件」である。
    #   (2) エントリ数を `doc.paragraphs` だけで数えていた。
    #       節見出し「No.1  Report (LDI ID: 2821)」は**1セルの表の中**にあるので0件になる。
    #       （出力フォーマットが「セクションヘッダ（青背景）」＝表、と定めている）
    #   また、フッタを「以上 N 件」で探していたが、仕様は
    #       `--- 更新必要 X件 / スキップ Y件 ---` である。
    #
    # 実害: Step 8 は FAIL ならメールを送らない BLOCKING ゲートである。
    # 毎日 FAIL していたか、FAIL を無視して送っていたかのどちらかで、
    # **どちらにしてもゲートとして機能していなかった。**
    tbl_text_for_count = "\n".join(c.text for t in doc.tables for row in t.rows for c in row.cells)
    scan = all_text + "\n" + tbl_text_for_count
    entries = len(re.findall(r"Report\s*[（(]?\s*LDI\s*ID", scan))

    def _num(pat, where):
        m = re.search(pat, where)
        return int(m.group(1)) if m else None

    # 実物の文面（2026-10-06 の LDI_CMS_Reports を実機で確認）に合わせる。
    #
    #   サブヘッダ: 作成日: … ／ LDI全13Key検証 → 更新必要 全2件・スキップ 11件 ／ 自動生成
    #   フッタ    : --- 以上 2件（更新必要 2件：既存Key更新2件 / スキップ 11件）---
    #
    # SKILL.md の「出力フォーマット（固定）」とは文面が違う（仕様は
    # 「全N件検証」「--- 更新必要 X件 / スキップ Y件 ---」）。**実物のほうが運用されている。**
    # どちらでも読めるようにする。
    #
    # 2026-10-06 以前の版は `全\s*(\d+)\s*件` で期待件数を取っていた。実物では
    # これが「更新必要 **全2件**」の中の 2 に当たって**偶然通っていた。**
    # 「LDI全13Key検証」のほうは `件` が無いので当たらない。
    # 仕様どおりの「全13件検証」に書き換えられた日に、黙って FAIL に変わる作りだった。
    verified = (_num(r"全\s*(\d+)\s*(?:件|Key)\s*検証", all_text)
                or _num(r"LDI\s*全\s*(\d+)", all_text))

    # **「どれか1つが合っている」では足りない。** サブヘッダとフッタに同じ件数が
    # 2回3回出てくるので、**全部が実エントリ数と一致していること**を見る。
    # 2026-10-06、最初の実装は最初に見つかった1つだけを見ており、
    # フッタだけを書き換えた文書を合格にしていた（実測で判明）。
    upd_all = [int(x) for x in re.findall(r"更新必要\s*全?\s*(\d+)\s*件", all_text)]
    upd_all += [int(x) for x in re.findall(r"以上\s*(\d+)\s*件", all_text)]
    skip_foot = _num(r"スキップ\s*(\d+)\s*件", all_text)
    upd = upd_all[0] if upd_all else None

    if upd is None:
        res.append(result("件数整合", "FAIL",
                          f"更新必要件数が読めない（実エントリ{entries}件）。"
                          "サブヘッダかフッタに「更新必要 X件」または「以上 X件」を書くこと"))
    elif any(u != entries for u in upd_all):
        res.append(result("件数整合", "FAIL",
                          f"文書内の更新必要件数の表記 {sorted(set(upd_all))} が"
                          f"実エントリ{entries}件と合わない"))
    else:
        detail = f"更新必要{upd}=実{entries}"
        if verified is not None:
            detail += f" / 全{verified}件検証"
        res.append(result("件数整合", "PASS", detail))
        # 全件数が内訳と合わないのは注意喚起にとどめる（検証総数の定義に幅がある）
        if verified is not None and skip_foot is not None and verified < entries + skip_foot:
            res.append(result("検証総数", "WARN",
                              f"全{verified}件 < 更新{entries}+スキップ{skip_foot}"))

    # 5-8, 12: per-entry tables
    entry_tables = []
    for t in doc.tables:
        labels = [row.cells[0].text.strip() for row in t.rows if len(row.cells) >= 2]
        if any("レポートの種類" in l for l in labels):
            entry_tables.append(t)

    if len(entry_tables) != entries and entries > 0:
        res.append(result("エントリ表数", "FAIL", f"セクションヘッダ{entries}件に対し表{len(entry_tables)}件"))
    else:
        res.append(result("エントリ表数", "PASS", f"{len(entry_tables)}表"))

    for i, t in enumerate(entry_tables, 1):
        rows = {row.cells[0].text.strip(): row.cells[1].text.strip() for row in t.rows if len(row.cells) >= 2}
        missing = [lb for lb in LDI_LABELS if not any(lb.split("（")[0] in k or lb in k for k in rows)]
        if missing:
            res.append(result(f"No.{i} 行構成", "FAIL", f"欠落: {missing}"))
        empties = [k for k, v in rows.items() if not v]
        if empties:
            res.append(result(f"No.{i} 空セル", "FAIL", f"{empties}"))
        # URL checks
        url1 = next((v for k, v in rows.items() if k.strip().startswith("URL1")), None)
        url2 = next((v for k, v in rows.items() if k.strip().startswith("URL2")), None)
        if url1 is not None and not re.match(r"https?://\S+$", url1):
            res.append(result(f"No.{i} URL1形式", "FAIL", repr(url1[:60])))
        if url2 is not None and url2 not in ("—", "-", "ー") and not re.match(r"https?://\S+$", url2):
            res.append(result(f"No.{i} URL2形式", "FAIL", repr(url2[:60])))
        # length checks
        jp = next((v for k, v in rows.items() if k.startswith("内容（日本語")), "")
        en = next((v for k, v in rows.items() if k.startswith("内容（英語")), "")
        # 長さの目安（2026-10-06 に実測で設定）
        #
        # それまでは JA 30-120字 / EN 30-100語 を見ていたが、**表示していた文は
        # 「目安50-80」で、コードの閾値と食い違っていた。** そして
        # どちらの数字も根拠が無かった（SKILL.md に長さの定めは無い）。
        #
        # 実物（LDI_CMS_Reports_2026-10-06）の2件を測ると
        #
        #     内容（日本語）  196字 / 282字
        #     内容（英語）     77語 / 106語
        #
        # で、**毎日 WARN が出続ける状態だった。** 鳴り続ける警報は読まれない。
        # 荒木田さんの判断（2026-10-06）で、実態に合わせて目安を直した。
        #
        # 何を捕まえたいのか: 短すぎ＝被害と対応が書けていない、
        # 長すぎ＝複数の報を1エントリに混ぜている（1エントリ=1ソースの形が崩れている）。
        #
        # **根拠は実物2件だけである。** 日数が溜まったら見直すこと。
        JA_MIN, JA_MAX = 60, 400
        EN_MIN, EN_MAX = 25, 180
        if jp and not (JA_MIN <= len(jp) <= JA_MAX):
            res.append(result(f"No.{i} 内容(日)文字数", "WARN",
                              f"{len(jp)}字（目安{JA_MIN}-{JA_MAX}字）"))
        wc = len(en.split())
        if en and not (EN_MIN <= wc <= EN_MAX):
            res.append(result(f"No.{i} 内容(英)語数", "WARN",
                              f"{wc}語（目安{EN_MIN}-{EN_MAX}語）"))
        # 言語の取り違え（2026-10-06 追加）。このリポジトリで実際に起きた事故の型。
        if jp and not re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", jp):
            res.append(result(f"No.{i} 内容(日)の言語", "FAIL", "日本語が1文字も無い"))
        if en and re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", en):
            res.append(result(f"No.{i} 内容(英)の言語", "FAIL", "日本語が混ざっている"))
        if en and not re.search(r"[A-Za-z]{3,}", en):
            res.append(result(f"No.{i} 内容(英)の言語", "FAIL", "英単語が無い"))
        # 内容欄にメタ情報を含めない（SKILL.md Step 7 の明文）
        for banned in ("GLIDE", "GDACS", "Sentinel Asia", "センチネルアジア"):
            if banned in jp or banned in en:
                res.append(result(f"No.{i} 内容欄のメタ情報", "FAIL",
                                  f"「{banned}」が内容欄にある"))

    # 9-10. placeholders (whole doc incl. tables)
    table_text = "\n".join(c.text for t in doc.tables for row in t.rows for c in row.cells)
    full = all_text + "\n" + table_text
    hits_fail = sorted({p for p in PLACEHOLDER_FAIL if p in full})
    # 使用方法ボックスの定型文は除外対象外だが「例:」誤検知を避けるため使用方法行を除去
    if hits_fail:
        res.append(result("プレースホルダ", "FAIL", f"{hits_fail}"))
    else:
        res.append(result("プレースホルダ", "PASS"))
    hits_warn = sorted({p for p in PLACEHOLDER_WARN if p in full})
    if hits_warn:
        res.append(result("暫定値マーカー", "WARN", f"{hits_warn} が残存（意図的か確認）"))

    # 11. GLIDE format
    loose = set(GLIDE_LOOSE_RE.findall(full))
    bad = [g for g in loose if not GLIDE_RE.match(g)]
    if bad:
        res.append(result("GLIDE書式", "WARN", f"非標準書式: {bad}"))
    elif loose:
        res.append(result("GLIDE書式", "PASS", f"{len(loose)}件確認"))
    return res

def check_generic(doc):
    res = []
    paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    table_text = "\n".join(c.text for t in doc.tables for row in t.rows for c in row.cells)
    full = "\n".join(paras) + "\n" + table_text
    if not full.strip():
        res.append(result("本文", "FAIL", "本文が空"))
    else:
        res.append(result("本文", "PASS", f"{len(paras)}段落 / {len(doc.tables)}表"))
    hits = sorted({p for p in PLACEHOLDER_FAIL if p in full})
    res.append(result("プレースホルダ", "FAIL" if hits else "PASS", f"{hits}" if hits else ""))
    hits_warn = sorted({p for p in PLACEHOLDER_WARN if p in full})
    if hits_warn:
        res.append(result("暫定値マーカー", "WARN", f"{hits_warn}"))
    return res

def main():
    args = sys.argv[1:]
    as_json = "--json" in args
    args = [a for a in args if a != "--json"]
    rtype = "ldi"
    if "--type" in args:
        i = args.index("--type"); rtype = args[i+1]; del args[i:i+2]
    if not args:
        print("Usage: qa_report.py <path.docx> [--type ldi|generic] [--json]"); sys.exit(2)
    path = args[0]
    try:
        import docx
        doc = docx.Document(path)
        res = [result("ファイル開封", "PASS")]
    except Exception as e:
        res = [result("ファイル開封", "FAIL", str(e))]
        emit(res, path, as_json); sys.exit(1)
    res += check_ldi(doc) if rtype == "ldi" else check_generic(doc)
    emit(res, path, as_json)
    sys.exit(1 if any(r["status"] == "FAIL" for r in res) else 0)

def emit(res, path, as_json):
    fails = sum(1 for r in res if r["status"] == "FAIL")
    warns = sum(1 for r in res if r["status"] == "WARN")
    verdict = "不合格" if fails else ("条件付き合格" if warns else "合格")
    out = {"file": path, "verdict": verdict, "fail": fails, "warn": warns, "results": res}
    if as_json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
    else:
        print(f"=== QA結果: {path}")
        print(f"判定: {verdict}（FAIL {fails} / WARN {warns}）")
        for r in res:
            mark = {"PASS": "OK ", "WARN": "WARN", "FAIL": "FAIL"}[r["status"]]
            print(f"[{mark}] {r['item']}" + (f" — {r['detail']}" if r["detail"] else ""))

if __name__ == "__main__":
    main()
