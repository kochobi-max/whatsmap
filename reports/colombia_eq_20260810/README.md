# ADRC Disaster Report — 2026 Chocó Earthquake (Colombia)

M7.4, San José del Palmar, Chocó Department, 10 August 2026 (07:34 COT / 12:34 UTC / 21:34 JST).

Bilingual ADRC disaster report in the usual layout (2024 Noto / 2025 Mandalay / 2026 Mindanao /
2026 Kumamoto style): one file per language, PPTX + PDF, 21 pages each.

| File | Contents |
| --- | --- |
| `output/ADRC_EQ_COL_Choco_20260810_EN.pptx` / `.pdf` | English edition |
| `output/ADRC_EQ_COL_Choco_20260810_JA.pptx` / `.pdf` | Japanese edition |

Figures as of **10 Aug 2026 17:00 COT (11 Aug 07:00 JST)** — about 9.5 hours after the earthquake.
All figures are preliminary.

## Build

```bash
bash scripts/build.sh        # figures (EN+JA) -> PPTX (EN+JA) -> PDF
python3 scripts/qa_check.py  # mechanical QA
```

Requirements: Node 18+ (`pptxgenjs`), Python 3 with `matplotlib` and `geopandas==0.14`
(for the bundled Natural Earth outlines), LibreOffice **with `libreoffice-impress`** for the PDF
step, and `poppler-utils` for QA. Fonts: the deck records *Meiryo* (Japanese) and *Cambria*
(English headings); on Linux, alias Meiryo to an installed CJK face in
`~/.config/fontconfig/fonts.conf` so the PDF renders — the PPTX still opens with real Meiryo on
Windows.

## Layout

- `data/report_data.json` — all content. Every field carries an `_en` / `_ja` pair (or bare
  `en` / `ja` keys inside list items), so the two decks are generated from one source of truth.
  Each item also carries a source tier: `official` > `media` > `tbc`.
- `scripts/gen_deck.js` — the deck. `LANG_OUT=en|ja`, `OUT=<path>`.
- `scripts/make_images.py` — figures. `LANG_OUT=ja` writes a `_ja` variant of each figure, which
  `gen_deck.js` picks up automatically for the Japanese deck.
- `images/` — generated figures plus the ADRC logo. A hand-saved `<key>_manual.png` always wins,
  so an official ShakeMap or SGC intensity map can be dropped in without touching the code.

## Supplying photographs and official maps

Drop the file into `images/` and rebuild — nothing else to edit for maps.

**Replacing a generated figure** — name the file after the figure key:

| Key | Figure it replaces |
| --- | --- |
| `locator_world` | world locator |
| `locator_region` | NW South America locator |
| `locator_epicentre` | epicentre / affected cities |
| `slab_section` | Nazca-slab cross-section |
| `mmi_distance` | distance vs. MMI chart |

- `images/<key>_manual.png` (or `.jpg`) — used by **both** decks.
- `images/<key>_manual_ja.png` / `_manual_en.png` — used by that language only (wins over the shared one).

A hand-supplied file always beats the generated one, and the aspect ratio is preserved, so an
official USGS ShakeMap or SGC intensity map can go straight in.

**Adding photographs** — put the image files in `images/` and list them under `photos` in
`data/report_data.json`; a "Damage Photographs / 被害状況写真" page (up to 6 per page, more pages
added automatically) appears only when the list is non-empty:

```json
"photos": [
  { "file": "pereira_airport.jpg",
    "caption_en": "Partially collapsed terminal, Matecaña International Airport, Pereira",
    "caption_ja": "一部倒壊したマテカニャ国際空港ターミナル（ペレイラ）",
    "credit": "© photographer / agency",
    "url": "https://source-page" }
]
```

Always fill in `credit`, and confirm reuse permission before public release — press photographs
are not free to redistribute.

## Updating for a later report

1. Edit `data/report_data.json` — figures, timeline rows, damage rows, observations. Keep the
   source hierarchy: do not overwrite an official figure with a media one, and mark unverified
   items `tbc`.
2. Update `meta.as_of_en` / `as_of_ja` to the new cut-off time, and fill in `meta.glide` once the
   GLIDE number is issued (currently `EQ-2026-XXXXXX-COL (TBC)`).
3. Rebuild and run the QA script.

## Note on sources

No basemap tiles, satellite imagery or agency screenshots are embedded: this build environment has
no egress to map providers, so the locator maps and the cross-section are ADRC-drawn schematics
derived from published event parameters and public coordinates, and are labelled as such on the
slide. Official maps (USGS ShakeMap, SGC intensity, Copernicus/Charter damage products) should be
dropped into `images/` as `<key>_manual.png` before public release.
