/*
 * fetch_adrc.js — ADRC LDI の全Keyから Report/Articles を丸ごと取り出す
 *
 * **ブラウザの中で動かす。** Chrome MCP の javascript_tool で、
 * https://www.adrc.asia/latest/ に navigate した状態で貼って実行する。
 *
 *   理由: `www.adrc.asia` は中間証明書を添えて出していないため、
 *   クラウドから curl / node fetch で叩くと TLS の検証に失敗する。
 *
 *     CONNECT www.adrc.asia:443  →  200（トンネルは通る）
 *     TLSv1.3 (OUT), TLS alert, unknown CA
 *
 *   ポリシーの拒否ではない。**TLSの検証は外さない。**
 *   ブラウザは中間証明書を自分で取りに行くので、ページの中からなら読める。
 *   だからこれは node スクリプトではなく、ページ内で動く JavaScript である。
 *
 * ## これは判定を省く道具ではない
 *
 * Step 3.5 は「一覧ページの日付や要約だけで判定してはならない」と定めている。
 * **その定めは変えない。** このスクリプトが返すのは要約ではなく、
 * 各Keyの Report/Articles セクションの**全エントリの日付と本文（全文）**である。
 * 個別ページを開いて読むのと同じ情報を、1回で、本文だけ取ってくる。
 *
 *   省けるもの  : ページを1枚ずつ開く往復と、メニュー・広告などの付随テキスト
 *   省けないもの: 最新エントリの日付と本文を読んで判定すること
 *
 * **取り出せなかったKeyは `extract: "FAIL"` で返す。黙って縮めない。**
 * FAIL のKeyは、従来どおり個別ページを開いて確認する。
 *
 * ## 返り値
 *
 * {
 *   fetched_at: "...", list_count: 23,
 *   rows: [
 *     { key: "2821", name: "Philippines Earthquake", period: "2026/06/27",
 *       url: "https://www.adrc.asia/view_disaster_en.php?...",
 *       extract: "OK",
 *       reports: [ { date: "2026/07/16", source: "NDRRMC", text: "...全文..." }, ... ] },
 *     { key: "2899", ..., extract: "FAIL", error: "Report/Articles セクションが見つからない" }
 *   ],
 *   failures: ["2899"]
 * }
 *
 * ## 未検証の箇所（正直に書く）
 *
 * **DOMの形に合わせた部分（下の SELECTORS と parseReports）は、実機で確認していない。**
 * クラウドから adrc.asia を開けないため、保存したページで突き合わせられなかった。
 * 初回は `failures` が出る前提で動かし、出たKeyのページ構造を見て直すこと。
 * **「0件だった」を「更新が無い」と読まない。** 取り出せていないだけである。
 */
(async () => {
  "use strict";

  const LIST = "https://www.adrc.asia/latest/";
  const DETAIL = (key) =>
    "https://www.adrc.asia/view_disaster_en.php?NationCode=&Lang=en&Key=" + encodeURIComponent(key);
  const CONCURRENCY = 6;      // 相手のサーバに一度に投げすぎない
  const TIMEOUT_MS = 20000;

  // Report/Articles セクションの見出しとして現れうる文字列。
  // **ここは実機で確認して直す前提の箇所である。**
  const SECTION_HEADINGS = [
    "Report/Articles", "Report / Articles", "Reports/Articles", "Report", "Articles",
  ];

  function text(el) {
    return (el ? el.textContent : "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
  }

  async function get(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { credentials: "same-origin", signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } finally {
      clearTimeout(t);
    }
  }

  function doc(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  // 一覧から Key を集める。view_disaster_en.php?...Key=NNNN の形のリンクを拾う。
  function parseList(d) {
    const out = new Map();
    for (const a of d.querySelectorAll('a[href*="view_disaster"]')) {
      const m = /[?&]key=(\d+)/i.exec(a.getAttribute("href") || "");
      if (!m) continue;
      const key = m[1];
      if (out.has(key)) continue;
      // 行のテキストから発生日（Period）らしいものを拾う。**判定には使わない。**
      const row = a.closest("tr") || a.parentElement;
      const rowText = text(row);
      const pm = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(rowText);
      out.set(key, {
        key: key,
        name: text(a) || null,
        period: pm ? pm[0] : null,          // 発生日。LDI最終更新日ではない
        url: DETAIL(key),
      });
    }
    return [...out.values()];
  }

  // 個別ページから Report/Articles の全エントリを取り出す。
  function parseReports(d) {
    // 見出しノードを探す
    let anchor = null;
    const cands = d.querySelectorAll("h1,h2,h3,h4,h5,th,td,strong,b,div,p,span");
    for (const el of cands) {
      const t = text(el);
      if (!t || t.length > 40) continue;
      if (SECTION_HEADINGS.some((h) => t.toLowerCase() === h.toLowerCase())) { anchor = el; break; }
    }
    if (!anchor) return { ok: false, error: "Report/Articles セクションが見つからない" };

    // 見出しの属する表を優先して読む。表でなければ以降の兄弟を読む。
    const table = anchor.closest("table");
    const chunks = [];
    if (table) {
      for (const tr of table.querySelectorAll("tr")) {
        const t = text(tr);
        if (!t) continue;
        if (SECTION_HEADINGS.some((h) => t.toLowerCase() === h.toLowerCase())) continue;
        chunks.push(t);
      }
    } else {
      let n = anchor.nextElementSibling;
      while (n && chunks.length < 200) {
        const t = text(n);
        if (t) chunks.push(t);
        n = n.nextElementSibling;
      }
    }
    if (!chunks.length) return { ok: false, error: "セクションの中身が空" };

    // 「ソース名 + 日付」ではじまる塊をエントリとして切る。
    // 日付の表記は複数ありうる（2026/07/16, 16 Jul 2026, 07/16 など）。
    const DATE = /(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}\s+[A-Z][a-z]{2,8}\.?\s+\d{4}|\b\d{1,2}\/\d{1,2}\b)/;
    const reports = [];
    for (const c of chunks) {
      const m = DATE.exec(c);
      if (!m) {
        // 日付が無い塊は直前のエントリの続きとみなす
        if (reports.length) reports[reports.length - 1].text += " " + c;
        continue;
      }
      reports.push({
        date: m[1],
        source: c.slice(0, m.index).replace(/[\s:：,，-]+$/, "").trim() || null,
        text: c,                      // **全文をそのまま返す。切り詰めない**
      });
    }
    if (!reports.length) return { ok: false, error: "日付を持つエントリが取れない" };
    return { ok: true, reports: reports };
  }

  async function pool(items, worker) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
        while (true) {
          const n = i++;
          if (n >= items.length) return;
          out[n] = await worker(items[n], n);
        }
      })
    );
    return out;
  }

  const listHtml = await get(LIST);
  const rowsIn = parseList(doc(listHtml));

  const rows = await pool(rowsIn, async (r) => {
    try {
      const p = parseReports(doc(await get(r.url)));
      if (!p.ok) return Object.assign({}, r, { extract: "FAIL", error: p.error, reports: [] });
      return Object.assign({}, r, { extract: "OK", reports: p.reports });
    } catch (e) {
      return Object.assign({}, r, { extract: "FAIL", error: String(e && e.message || e), reports: [] });
    }
  });

  const failures = rows.filter((r) => r.extract !== "OK").map((r) => r.key);
  return {
    fetched_at: new Date().toISOString(),
    list_count: rows.length,
    rows: rows,
    failures: failures,
    note: failures.length
      ? "FAIL のKeyは個別ページを開いて確認する。**取れていないことを『更新が無い』と読まない。**"
      : "全Keyから Report/Articles を取り出せた。判定（Step 3.5）はこの本文を読んで行う。",
  };
})();
