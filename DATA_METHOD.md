# CityMETER · Factory — data and method

How `data/factories.json` is built, what one row and one figure mean, and what the demo never claims. Every number below is
a snapshot of release 0.1.0 (data built 2026-11-05 from the research master checked 2026-11-04); the page computes
everything from the data at run time, so these are fixtures, not constants.

## วิธีนับ — อ่านตัวเลขในหน้าอย่างไร

หน้าจอไม่มีคำเตือน (กติกาเดียวกับ CityMETER: Hotel ที่เจ้าของกำหนด 1 พ.ย. 2569: “ไม่มี caveats เลย”) ทุกบรรทัดที่มาท้ายหน้ามีลิงก์ “วิธีนับ” มาที่นี่ ขอบเขตของตัวเลขอยู่ตรงนี้ที่เดียว

- **ขอบเขตชุดข้อมูล** = ทะเบียนโรงงาน (เลขทะเบียนโรงงาน 14 หลัก, FID) ที่มีคนงานตามทะเบียน 95 คนขึ้นไป จากข้อมูลเปิดของกรมโรงงานอุตสาหกรรม จำพวก 2 และ 3 ซึ่งครอบคลุมโรงงานนอกนิคมอุตสาหกรรมของ กนอ. — โรงงานในนิคมอุตสาหกรรมขึ้นทะเบียนกับ กนอ. และไม่อยู่ในชุดนี้ ยอดของอำเภอที่มีนิคมอุตสาหกรรมของ กนอ. จึงต่ำกว่าคนงานโรงงานทั้งหมดของอำเภอนั้น
- **95 คน** = เกณฑ์ P90 ของชีตวิจัย: เปอร์เซ็นไทล์ที่ 90 (PERCENTILE.INC 0.9) ของ 71,124 ทะเบียนที่มีตัวเลขคนงาน จาก 74,047 ทะเบียนหลัก ทุกทะเบียนที่มีคนงานเท่าเกณฑ์พอดี (122 ทะเบียน) อยู่ในชุด
- **คน** = จำนวนคนงานที่ระบุในทะเบียน กรอ. (`workers` ของ `18_WORKERS_P90`) รวมต่อพื้นที่ ข้อมูลเปิดไม่บอกวันที่ของตัวเลขนี้ จึงไม่ใช่การจ้างงานปัจจุบัน ตลาดแรงงาน หรือจำนวนคนที่อาศัยในพื้นที่ ทะเบียนที่ต่ำกว่าเกณฑ์ไม่อยู่ในยอด และไม่ถูกประมาณแทน
- **ทะเบียน (โรงงาน)** = หนึ่งเลขทะเบียน ไม่ใช่หนึ่งโรงงานจริงหรือหนึ่งบริษัท บริษัทหนึ่งมีได้หลายทะเบียน (ต่างโรงงาน ต่างกระบวนการ) และทะเบียนในชุดนี้ 430 ทะเบียนมีชื่อและที่อยู่ตรงกับทะเบียนอื่น (`dup`) ซึ่งอาจเป็นไซต์เดียวกัน
- **สัดส่วนของจังหวัด** = คน (หรือทะเบียน) ในพื้นที่ ÷ ทั้งจังหวัดในตัวกรอง
- **อุตสาหกรรม** = กลุ่มอุตสาหกรรมทางการของ กรอ. ตามรหัสประเภทโรงงาน (`official_industry_group_raw`) — 21 กลุ่ม และ 25 ทะเบียนที่ไม่ระบุกลุ่ม — จัดเป็น 10 หมวดเพื่อใช้สีและรูปทรงบนแผนที่ (ตาราง `FAMILIES` ใน `scripts/build-data.py`) หมวดเป็นการจัดกลุ่มเพื่อการแสดงผล ชื่อกลุ่มของ กรอ. อยู่ในทุกแผงและกราฟ “กลุ่ม กรอ.”
- **หน้าที่ (ผลิต · บริการ · อื่น ๆ · รอตรวจหน้าที่)** = การจัดประเภทของชีตวิจัยจากประเภทโรงงานด้วยกฎ (functional-factory-classification v2, 4 พ.ย. 2569) ไม่ได้ตรวจทีละทะเบียนโดยคน
- **สถานะ อก.** = สถานะในข้อมูลที่ตั้งประกอบกิจการโรงงานของกระทรวงอุตสาหกรรม (GD Catalog) ณ วันที่ในแผง (“ไม่พบใน อก.” = ไม่พบเลขทะเบียนนี้ในข้อมูลชุดนั้น) ไม่ใช่การตรวจภาคสนามว่าโรงงานยังเปิดหรือปิด
- **จุด** = พิกัดจากแหล่งที่ชีตตรวจว่าอยู่ในกรอบประเทศไทย (`within_TH_bbox_unverified`) ไม่ใช่ตำแหน่งโรงงานที่ยืนยันแล้ว มี 2,306 ทะเบียน จุดที่อยู่นอกอำเภอของทะเบียนเอง (79 ทะเบียน) ไม่แสดง (“ไม่แสดงพิกัด”) และทะเบียนอยู่ในอำเภอตามทะเบียนเสมอ
- **ทะเบียนโรงงานทุกขนาด** = ทุกทะเบียนหลักของ `02_FACTORIES` (74,047) ในพื้นที่ แยกตามหน้าที่ เป็นบริบท ไม่รวมเข้ากับตัวเลขคนงาน
- **นิคม สวน เขตอุตสาหกรรม** = รายชื่อจากชีตวิจัยนิคมอุตสาหกรรม (106 รายการ ตรวจ 25–26 ต.ค. 2569) พร้อมลิงก์หน้าทางการ แสดงเป็นรายชื่อเท่านั้น ไม่มีขอบเขตบนแผนที่ (ชีตยังไม่เลือกขอบเขตและยังไม่ได้ตรวจสิทธิ์) และไม่ได้บอกว่าโรงงานใดอยู่ในนิคม
- **ผู้ประกอบการบุคคลธรรมดา** = ทะเบียนที่ชื่อเป็นชื่อบุคคล (58 ทะเบียน) แสดงโดยไม่มีชื่อและไม่มีจุด ยังนับในยอดของพื้นที่
- **โรงงานใกล้เคียง** = ทะเบียนหมวดอุตสาหกรรมเดียวกัน คนงานครึ่งเท่าถึงสองเท่า ในระยะตรง 3 กม. จากจุด เรียงใกล้ก่อน เป็นรายชื่อเริ่มต้นสำหรับเทียบ ไม่ใช่ห่วงโซ่อุปทานหรือคู่แข่งที่ยืนยันแล้ว
- **อาคาร** = อาคารบนแผนที่ (CityMETER Building V4 หรือ OpenStreetMap ตามพื้นที่) ความสูง “สูงราว” เป็นค่าประมาณ “โรงงานในอาคารนี้” = จุดของทะเบียนอยู่ในขอบอาคาร เมื่อจุดไม่อยู่ในอาคารใด มุมมองอาคารเปิดที่อาคารใกล้จุดที่สุด (≤ 300 ม. ไม่มีก็ ≤ 800 ม.) เป็นการเลือกมุมกล้องเท่านั้น
- **ภูมิประเทศ** = พื้นดินรอบจุด (รัศมี 500 ม.) จาก SRTM 30 ม. (สำรวจปี 2543) และแผนที่ OSM ไม่ใช่การประเมินความเสี่ยงน้ำท่วมหรือความเหมาะสมของที่ดิน

## 1. Sources

| Input | What it is | Published here? |
|---|---|---|
| `18_WORKERS_P90` (gid 2026110418) of “CityMETER Factory Thailand — Factory, Operator & Company Research Master 2026-11-04” (Google Sheets, registry id `research.TH.factory`) | the rows of this product: 7,175 FIDs at or above the P90 of DIW-reported workers | derived fields only (`data/factories.json`); the sheet and its export are never committed |
| `02_FACTORIES` (same sheet; columns listed in `scripts/build-data.py`) | the core registry, 74,047 FIDs: district, subdistrict, functional class, DIW class, type code, MOI status, core basis, duplicate flag, estate context, source point and its screen | joined by FID; registry context aggregated per district and province |
| `02_TYPES` (same sheet, `02_FACTORIES` grouped by type code) | DIW type definition and official industry group per type code | code, definition and group |
| `99_SOURCE_FILES` (same sheet) | the source register: DIW class 2/3 exports (resource updated 2026-10-01), MOI location and permit exports (row updates through 2026-11-03), all checked 2026-11-04 | public https pages only |
| `01_ESTATES` of “CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม 106 รายการ — Research Master 2026-10-25” | names, type, province and the official page of 106 industrial areas | the list only; no geometry is read |
| `data/area-index.json`, `data/frames/`, `data/provinces.geojson`, `data/boundary-receipts.json` | CityMETER production district and province outlines and base info (read 2026-11-01), copied from `montri-th/hotel@177e592` | yes (display geometry, production codes) |
| `data/building-units/` | buildings per อปท./เขต by the 15 % rule, from `montri-th/hotel@177e592` (units that hold a hotel with a point); every other unit draws OpenStreetMap | yes |

SHA-256 of every input file read is in `meta.inputs` (the files themselves stay in the owner's research workspace).

## 2. One row, two measures

One row = one FID of `18_WORKERS_P90`, joined to `02_FACTORIES` by FID (every P90 FID is in the core registry; the build stops
if one is missing, if the province differs between the two tabs, or if a figure is below the threshold). Nothing is merged,
split, moved or re-labelled.

| Measure | Unit | Definition | LDS family |
|---|---|---|---|
| `workers` (default) | คน | Σ `workers` of the registrations (2,435,798 in all; median 180, max 13,200) | `count` (a total, no denominator) |
| `count` | ทะเบียน | number of FIDs | `count` |

Both measures are totals: no per-km² or per-resident ratio is drawn, so no density family applies. Every row has a worker
figure (≥ 95), so no total is partial; a figure missing from a future export would add nothing and never be estimated.

Worker bands (ทะเบียน): 95–199 คน 3,998 · 200–499 2,216 · 500–999 585 · 1,000–1,999 244 · 2,000–4,999 108 · 5,000+ 24.

## 3. District membership (build time, never re-assigned on screen)

The registration's own district label (`02_FACTORIES.district`, DIW 2026 first, otherwise MOI) is matched by name to a
production district of its own province (`row.admin = name`, 7,175 rows). A label that names no district of its province
leaves the row at province level (`province`, none in this release). The source point never decides membership.

## 4. Points

`latitude_observed` / `longitude_observed` are published only where `coordinate_quality` is `within_TH_bbox_unverified`,
rounded to 5 decimals, and only when the point falls inside the registration's own district outline: 61 points in another
district and 18 in another province are withheld (`row.off`, `meta.checks.pointWithheld`). Points of registrations known only
by a natural person's name are not published. 2,306 rows carry a point; the other 4,869 count in their district and are
listed in panels and the table without a symbol.

## 5. Industry, function and status

- **Type → group → family:** `factory_type_code_raw` → `official_industry_group_raw` (one group per code) → one of ten
  families (`FAMILIES`): food · electrical · vehicle (vehicles and machinery, which in the DIW grouping includes electronic
  computing devices such as type 06900) · textile · metal · polymer · wood · mineral · plant · other (incl. the 25 rows with
  no group). The family binds to an LDS categorical series and its shape cue by id (`js/cues.js#GROUP_SERIES`).
- **Function:** `functional_class` of `02_FACTORIES` (manufacturing 6,531 · review 339 · service 236 · other 69 in this
  product; 54,229 · 7,729 · 5,122 · 6,967 in the whole registry). All classes stay in the legal-factory scope.
- **DIW class (จำพวก):** 3 for 7,139 rows, 2 for 36.
- **MOI status:** `moi_location_status_raw` (ดำเนินการ 2,894 · ได้รับใบอนุญาต 200 · หยุดดำเนินการ 137 · not found 3,944) with
  its update date. A stopped or removed status is not read as a closure of the site.
- **Core basis:** listed in the DIW export of 2026-10-01 (4,281) or listed and MOI-operating (2,894).

## 6. Context (same research master, build time)

- **Registry:** every core FID per district and province by functional class (`registry.areas`, `registry.provinces`;
  74,045 placed in a district, 2 at province level). The panel shows it beside this product's figures and states the share of
  95+ registrations in it (both from the same universe, before any filter): 7,175 of 74,047 nationally (10 %).
- **Industrial areas:** 106 names in 21 provinces (84 นิคมอุตสาหกรรม · 16 สวนอุตสาหกรรม · 6 เขตอุตสาหกรรม), each with its
  official page (IEAT estate pages, developers' pages, government pages). The list never says which registration lies in an
  estate: every row of this product has `estate_context = outside_estate_source_scope_DIW_catalog` and
  `estate_verification_status = individual_membership_unverified`.

## 7. What the page computes

- **First Aha** (`js/area-insight.js`): the province holding the most of the measure among rows placed at district level;
  up to three of its districts with the most of it (never cutting a tie; never every district that holds the measure); their
  share of the province's whole total; the industry families of those rows with each share (numerator and denominator in
  the title and accessible text); the district with the most of the measure outside that province and its first family.
- **Ranks and charts:** districts ranked over `scopeRows` (filters before any area selection); the matrix of district ×
  family with equal cells; the official DIW groups ranked by the measure.
- **Nearby set** (`js/profile-model.js#nearbyOf`): same family, workers ½–2×, straight line ≤ 3 km, every row of the dataset,
  nearest first; the count and workers of every 95+ registration within 3 km beside it.
- **Map colour:** the LDS `count` family, all 41 samples by rank among the measured nonzero values of the districts being read
  (`js/scales.js#buildRamp`); a district with no registration is a measured zero (sample 0 + the zero outline), never no data:
  every district is in the registry's national scope (375 of 928 districts hold none; Mae Hong Son holds none).

## 8. Not published

Addresses, raw MOI operator names (ONAME), the 2025 operator label, operator context ids, legal operator and parent fields,
researcher notes and human review fields, evidence and conflict flags, source record ids, logo files and URLs, points outside
the screen or outside the registration's own district, names and points of natural-person operators, private Drive or Sheet
URLs (`meta.excludedFields`). Estate boundaries are not published. Operator labels (`operator_display_observed`) are shown
only where they differ from the registration's name beyond spacing and legal-form words (279 rows).

## 9. Research follow-ups (reported, not patched in `data/`)

1. **IEAT estates:** factories registered with IEAT (the sheet's IEAT portal tab holds 6,937 source records) are outside this
   product; a dated worker figure per IEAT factory would be needed to compare estate districts fairly.
2. **Worker date:** the DIW exports carry no date for the worker figure; a dated source would let the panel say “ณ ปี …”.
3. **Same-site registrations:** 430 rows share an exact name and address with another FID; a site key would let the map show
   one plant once.
4. **Company logos:** the sheet selects logos for 457 FIDs (`20_LOGO_USE`, supported company context); the files are in the
   research workspace and are not in this release.
5. **Estate boundaries:** `19_MAP_EXPORT` of the estate master selects no boundary yet; rights are not cleared.
6. **Building units:** the 15 % rule was decided for the units that hold a hotel; units holding factories only draw OpenStreetMap
   until `scripts/build-building-units.py` is run for them.

## 10. Rebuild

```sh
python3 -I scripts/build-data.py --csv <dir of tab CSV exports> --estates <dir of estate-master CSVs> \
  --index data/area-index.json --frames data/frames --out data/factories.json --report data/build-report.json --built-on YYYY-MM-DD
npm test
```

The CSV exports are read from the research master (tabs listed in §1) and stay outside the repository. Changes to names,
links, statuses or classes are made in the research sheet itself, then re-exported and rebuilt — never patched in `data/`.
