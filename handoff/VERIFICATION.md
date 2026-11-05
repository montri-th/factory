# CityMETER Factory 0.2.0 — verification

Release 0.2.0 (cache tag `?v=20261105-r2`), checked 2026-11-05 (Asia/Bangkok). The rows are every core registration of
`02_FACTORIES` (74,047) instead of the 7,175 FIDs of `18_WORKERS_P90` (owner 2026-11-05: “ขยายเลย”). The live record of
this release is added in the documentation-only commit that follows its publication; the final live attestation of the
published commit is in `RELEASE_RECEIPT.json` of the handoff bundle (it cannot live in the commit it attests).

## 1. Data

- Inputs: CSV exports of `02_FACTORIES` (three column sets: the registry fields, `fid · factory_name`, `fid ·
  operator_display_observed · moi_status_update`), `18_WORKERS_P90`, `02_TYPES`, `99_SOURCE_FILES` of the factory research
  master and `01_ESTATES` of the estate research master, read 2026-11-05 through the sheets' own CSV view; `fid · คนงานรวม`
  of the DIW class 2 and class 3 open-data exports (`factype2.csv` 2,094,306 B, `factype3.csv` 43,438,317 B, both
  `Last-Modified` 2026-10-01, SHA-256 equal to `99_SOURCE_FILES`: `7ad219ed…7701`, `4c3243bc…f4af`), read 2026-11-05 in the
  owner's browser. SHA-256 of each file the build reads in `meta.inputs`. The files stay outside the repository.
- Build checks (`scripts/build-data.py`, all passed): every DIW FID is in the registry and every DIW-listed registry FID has an
  export row (the 2,921 without one are all `MOI_operating_only`); the one FID listed twice in `factype3.csv` carries one
  figure (613); every figure of `18_WORKERS_P90` equals the export (7,175 of 7,175; names and MOI status equal too); the
  PERCENTILE.INC 0.9 of the 71,124 figures is 95 and `18_WORKERS_P90` is exactly the FIDs with 95+ workers.
- `data/factories.json` (11,878,550 B; ~1.9 MB gzip): 74,047 rows, Σ workers 3,755,632 over 71,124 figures (391 of them 0),
  2,923 without a figure, the 95+ lens 7,175 rows (Σ 2,435,798), 15,654 published points (718 withheld: 585 in another
  district, 128 in another province, 5 outside every outline), 6,036 natural-person names withheld, 3,405 operator labels
  kept. District membership by name for 74,045 rows, province only for 2.

## 2. Tests and parity

- `npm test`: 128 pass, 0 fail (data invariants incl. privacy, the point-in-own-district check over all 15,654 published points,
  the 95+ lens against the P90 and `18_WORKERS_P90`, missing figures never 0; first Aha fixtures for all sizes and the 95+
  lens; the no-figure Aha state; EVID-05 no data for districts and provinces; panels and provenance; no caveat or hotel
  words on any view; charts; scales; camera, massing, x-ray, building units, terrain, MapLibre guards; short label names
  against the build rule (`tests/fixtures/short-names.json`; the page's rule equals the build's for all 55,467 names);
  release tag, product version, handoff schema, publication hygiene; icon fonts).
- `npm run check:lds -- --lds Landometer-Design-System-v0.9.7.md --li Location-Intelligence-Profile-for-LDS-v0.9.7.md`
  (montri-th/landometer `deployment/v0.9.7/normative/`, SHA-256 `d3085cbc…96` and `5d485604…3c`): 117 ok, 0 failed.
- Decode of the dataset in Node: ~250 ms for 74,047 rows.

## 3. Local render (build container)

Playwright + MapLibre 5.6.2 from the npm package; OpenFreeMap, unpkg and DEM tiles are stubbed in the container. 1440 × 900
and 393 × 852, light and dark: first screen (72 % · 330,987 จาก 457,353 คน · บางพลี · เมืองสมุทรปราการ · พระประแดง ·
5,041 ทะเบียนในโฟกัส · 2,298 ในจอ), district 1103 (130,258 คน · 2,114 ทะเบียน · 28 % · 287 ทะเบียน 95+ คน), the size
filter options (คนงาน 95 คนขึ้นไป 7,175 · 0–9 … 5,000+ · ไม่มีตัวเลขคนงาน 2,923), `?size=none` (Aha “2,923 ทะเบียน · ไม่มี
ตัวเลขคนงาน” with นับเป็นทะเบียน, “— คน”, the hatch on the 19 provinces holding them, the chart's empty state),
`?factory=00110800125327` (two-point building view), a factory without a worker figure on the phone. No page error; the only
failed requests were the stubs.

## 4. Live

Recorded after publication.

## 5. Not verified in this release

- A phone device (the phone layout is walked under mobile emulation).
- Terrain at a hilly site.
- Company logos (not in this release; `DATA_METHOD.md` §9).

## 6. Seen, not changed

- Phone, factory sheet open: the name label of a nearby registration can sit under the top edge of the sheet (pins and labels
  reserve the dock height only, `js/app.js#bottomSpace`, identical in CityMETER · Hotel `177e592`).

## Previous release

0.1.0 (commit `3fa74de`, tag `20261105-r1`, the 7,175 FIDs of `18_WORKERS_P90`): 125 tests, LDS parity 117 ok,
`verify:live` 239 ok (and 240 ok on `bf7cf9c`, `95bc9c6`), real-browser walk in dark and light on the live origin — the record
is in the git history of this file.
