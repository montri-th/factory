# CityMETER Factory 0.1.0 — verification

Release 0.1.0 (commit `3fa74de`, cache tag `?v=20261105-r1`), checked 2026-11-05 (Asia/Bangkok). The commit that adds
this file changes documentation only; the final live attestation of the published commit is recorded in
`RELEASE_RECEIPT.json` of the handoff bundle (it cannot live in the commit it attests).

## 1. Data

- Inputs: CSV exports of `18_WORKERS_P90` (gid 2026110418), `02_FACTORIES` (columns listed in `scripts/build-data.py`),
  `02_TYPES`, `99_SOURCE_FILES` of the factory research master and `01_ESTATES` of the estate research master, read
  2026-11-05 through the sheets' own CSV view; SHA-256 of each in `meta.inputs`. The files stay outside the repository.
- Build: `scripts/build-data.py` stops on a P90 FID missing from `02_FACTORIES`, a province that differs between the two
  tabs, or a figure below the threshold — none occurred. `data/factories.json` SHA-256 `60ed6f5b…74ed05f6b` (1,989,573 B):
  7,175 rows, Σ workers 2,435,798, 2,306 published points (79 withheld: 61 in another district, 18 in another province),
  58 natural-person names withheld, 279 operator labels kept (differ beyond spacing and legal-form words).
- Every row `estate_context = outside_estate_source_scope_DIW_catalog` (`meta.counts.estateContext`).

## 2. Tests and parity

- `npm test`: 125 pass, 0 fail (data invariants incl. privacy and the point-in-own-district check over every published
  point; first Aha fixtures; ties and spread; panels and provenance; no caveat or hotel words on any view; charts; scales;
  camera, massing, x-ray, building units, terrain, MapLibre guards; release tag, product version, handoff schema,
  publication hygiene; icon fonts).
- `npm run check:lds -- --lds Landometer-Design-System-v0.9.7.md --li Location-Intelligence-Profile-for-LDS-v0.9.7.md`
  (montri-th/landometer `deployment/v0.9.7/normative/`, SHA-256 `d3085cbc…96` and `5d485604…3c`): 117 ok, 0 failed.
- Pictogram subset rebuilt from `MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf` (google/material-design-icons, SHA-256
  `7e74e365…0c97c`, the same source as Hotel): 21 glyphs, 3,148 B, SHA-256 `267debec…71ad`; every codepoint checked against
  the glyph name in the source cmap (`location_on` = `place`).

## 3. Local render (build container)

Playwright + MapLibre 5.6.2 from the npm package; OpenFreeMap and unpkg are blocked in the container (stub TileJSON with
empty tiles: no basemap, no OpenStreetMap buildings). 1440 × 900 and 393 × 852, light and dark. Walked: first screen
(Aha 74 % · 220,980 จาก 299,796 คน · three industry bars · outside #1 เมืองสมุทรสาคร), district 1103 and 1101, a factory
with a point, the three chart views, the table, the measure switch, the country view, 3D off, an industry filter chip,
back. No page error; the only console messages were the stub's missing source layers and blocked tiles.

## 4. Live

- GitHub Pages enabled 2026-11-05 on `main` / root (repository settings). `https://montri-th.github.io/factory/` 200.
- `npm run verify:live` against the manifest of `3fa74de`: 239 ok, 0 failed (every published file byte-identical);
  against `bf7cf9c` (the first version of this file): 240 ok, 0 failed.
- Owner's Chrome, desktop 1440 × 783, dark (auto): the first screen as specified — focus 1101 · 1103 · 1104, city preset
  (pitch 56, zoom 10.43), 63,173 focus buildings drawn of which 44,651 CityMETER Building V4, pictograms and navigation
  icons loaded, status “โรงงานที่มีจุดในจอ 445 ทะเบียน · นอกโฟกัส 1,861 ทะเบียน”, no Latin-only text block.
- Owner's Chrome again, after a reload with the console reader on, theme switched to light: the first screen as
  specified (Aha 74 % · 220,980 จาก 299,796 คน · ยานพาหนะ 20 % · สิ่งทอ 19 % · พลาสติก/ยาง 14 % · outside #1
  เมืองสมุทรสาคร 169,944 คน · อาหาร 55 %; legend 95 – 169,944 with the measured zero 0; “445 ในจอ”; “รายชื่อ 714”). The
  console reader returned no message for the reload and the theme switch; the extension then disconnected for a while.
- Owner's Chrome, light, once the extension reconnected: `?area=1103` (อำเภอบางพลี on the OpenFreeMap basemap), then
  factory `00110800125327`: the two-point view on the nearest drawn CityMETER Building V4 building (legend
  “อาคารใกล้หมุด”, pitch 75, zoom 18.20, the point in the frame), terrain read “ภูมิประเทศ 6 ม. ต่างระดับ 8 ม.”, one
  provenance line — dataset (CityMETER Factory · โรงงาน 95+ คน), source (ทะเบียน กรอ. นอกนิคมอุตสาหกรรม · อก. · SRTM
  30 ม. (2543) · OSM 1 พ.ย. 2569), date (4 พ.ย. 2569), boundary (อำเภอเมืองสมุทรปราการ สมุทรปราการ), วิธีนับ; then the
  chart view `mix` and the table. A probe message confirmed the console reader; it held no other message from these
  loads, the theme switch, the building view, the charts or the table. The theme was set back to auto (the setting
  found) and the tabs opened for the walk were closed.
- Live bytes + local render (Node fetches the published files and the CityMETER Building V4 tiles; OpenFreeMap stubbed):
  factory `00110800125327` (บริษัท ซีเกทเทคโนโลยี (ประเทศไทย) จำกัด) opens the two-point view on the nearest drawn
  CityMETER building (legend “อาคารใกล้หมุด”, pitch 75, zoom 18.48 desktop / 17.44 phone, the point in the frame);
  phone 393 × 852 first screen: free map 548 px between the toolbar and the dock; dark: district 1103, chart views
  `mix` and `industries`, table “1–25 / 287”. No page error.
- Live bytes + local render, light, 1440 × 900 and 393 × 852: district 1103 (อำเภอบางพลี · อันดับ 6 จาก 553
  ทั่วประเทศ · 79,620 คน · 287 ทะเบียน · 27 % ของสมุทรปราการ · 2,114 ทะเบียนทุกขนาด), the three chart views
  (`industries`: 22 จาก 22 กลุ่ม), the table (“1–25 / 287”), the deep link `?factory=00110800125327` (building view,
  “อาคารใกล้หมุด”), the phone first screen and the same factory as a phone sheet. Every panel view ended with one
  provenance line (dataset · source · date · boundary · วิธีนับ). No page error. The only failed requests were the
  harness's own stubs: terrarium DEM tiles answered 404 (so the factory panel read “อ่านภูมิประเทศไม่ได้ในตอนนี้”) and
  empty OpenFreeMap tiles. The only Latin-only text block of 40+ characters was the launch fallback link
  `#launch-public`, which is not displayed.

## 5. Not verified in this release

- A phone device: the phone layout (393 × 852) was walked with the live bytes in the container under mobile emulation
  (§4), not on a device or on the live origin.
- Terrain at a hilly site: read live at one flat site only (§4); DEM tiles are blocked in the container.
- Company logos (not in this release; `DATA_METHOD.md` §9).

## 6. Seen in the walk, not changed

- Phone, factory sheet open: the name label of a nearby registration can sit under the top edge of the sheet. Pins and
  labels reserve the dock height only, not the open sheet (`js/app.js#bottomSpace`, identical in CityMETER · Hotel
  `177e592`). Cosmetic; left for the next release of both demos.
