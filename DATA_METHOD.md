# CityMETER · Factory — data and method

How `data/factories.json` is built, what one row and one figure mean, and what the demo never claims. Every number below is
a snapshot of release 0.2.0 (data built 2026-11-05 from the research master checked 2026-11-04); the page computes
everything from the data at run time, so these are fixtures, not constants.

## วิธีนับ — อ่านตัวเลขในหน้าอย่างไร

หน้าจอไม่มีคำเตือน (กติกาเดียวกับ CityMETER: Hotel ที่เจ้าของกำหนด 1 พ.ย. 2569: “ไม่มี caveats เลย”) ทุกบรรทัดที่มาท้ายหน้ามีลิงก์ “วิธีนับ” มาที่นี่ ขอบเขตของตัวเลขอยู่ตรงนี้ที่เดียว

- **ขอบเขตชุดข้อมูล** = ทะเบียนโรงงานหลักทุกขนาดของชีตวิจัย (74,047 เลขทะเบียนโรงงาน 14 หลัก, FID): ทะเบียนในข้อมูลเปิดของกรมโรงงานอุตสาหกรรม จำพวก 2 และ 3 (71,126) ซึ่งครอบคลุมโรงงานนอกนิคมอุตสาหกรรมของ กนอ. และทะเบียนที่กระทรวงอุตสาหกรรมระบุดำเนินการแต่ไม่อยู่ในชุดของ กรอ. (2,921) — โรงงานในนิคมอุตสาหกรรมขึ้นทะเบียนกับ กนอ. และไม่อยู่ในชุดนี้ ยอดของอำเภอที่มีนิคมอุตสาหกรรมของ กนอ. จึงต่ำกว่าคนงานโรงงานทั้งหมดของอำเภอนั้น
- **คน** = จำนวนคนงานรวมที่ระบุในข้อมูลเปิดของ กรอ. (`คนงานรวม` ของไฟล์จำพวก 2 และ 3) รวมต่อพื้นที่ มีตัวเลข 71,124 ทะเบียน (391 ทะเบียนระบุ 0 คน ตามแหล่ง) อีก 2,923 ทะเบียนไม่มีตัวเลข (2 ทะเบียนช่องว่างในไฟล์ กรอ. และ 2,921 ทะเบียนที่มีเฉพาะใน อก.) — ไม่ถูกนับเป็น 0 และไม่ถูกประมาณแทน ข้อมูลเปิดไม่บอกวันที่ของตัวเลขนี้ จึงไม่ใช่การจ้างงานปัจจุบัน ตลาดแรงงาน หรือจำนวนคนที่อาศัยในพื้นที่
- **ไม่มีตัวเลขคนงาน** = ทะเบียนที่แหล่งไม่มีตัวเลขคนงาน แสดงเป็นคำนี้ หรือ “—” ในตาราง ในแผนที่ เขตหรือจังหวัดที่ทุกทะเบียนในตัวกรองไม่มีตัวเลขคนงานเป็นลายเส้นทแยง (ไม่มีข้อมูล) ไม่ใช่ 0
- **คนงาน 95 คนขึ้นไป** = เกณฑ์ P90 ของชีตวิจัย: เปอร์เซ็นไทล์ที่ 90 (PERCENTILE.INC 0.9) ของ 71,124 ตัวเลขคนงาน = 95 คน → 7,175 ทะเบียน (ตรงกับแท็บ `18_WORKERS_P90` ทุกทะเบียน รวมทะเบียนที่มีคนงานเท่าเกณฑ์พอดี 122 ทะเบียน) มีคนงานรวมกัน 2,435,798 คน หรือ 65% ของคนงานทั้งหมดในชุด เป็นตัวเลือกหนึ่งในตัวกรองขนาด
- **ทะเบียน (โรงงาน)** = หนึ่งเลขทะเบียน ไม่ใช่หนึ่งโรงงานจริงหรือหนึ่งบริษัท บริษัทหนึ่งมีได้หลายทะเบียน (ต่างโรงงาน ต่างกระบวนการ) และ 3,328 ทะเบียนมีชื่อและที่อยู่ตรงกับทะเบียนอื่น (`dup`) ซึ่งอาจเป็นไซต์เดียวกัน
- **สัดส่วนของจังหวัด** = คน (หรือทะเบียน) ในพื้นที่ ÷ ทั้งจังหวัดในตัวกรอง
- **อุตสาหกรรม** = กลุ่มอุตสาหกรรมทางการของ กรอ. ตามรหัสประเภทโรงงาน (`official_industry_group_raw`) — 21 กลุ่ม และ 3,114 ทะเบียนที่ไม่ระบุกลุ่ม — จัดเป็น 10 หมวดเพื่อใช้สีและรูปทรงบนแผนที่ (ตาราง `FAMILIES` ใน `scripts/build-data.py`) หมวดเป็นการจัดกลุ่มเพื่อการแสดงผล ชื่อกลุ่มของ กรอ. อยู่ในทุกแผงและกราฟ “กลุ่ม กรอ.”
- **หน้าที่ (ผลิต · บริการ · อื่น ๆ · รอตรวจหน้าที่)** = การจัดประเภทของชีตวิจัยจากประเภทโรงงานด้วยกฎ (functional-factory-classification v2, 4 พ.ย. 2569) ไม่ได้ตรวจทีละทะเบียนโดยคน
- **สถานะ อก.** = สถานะในข้อมูลที่ตั้งประกอบกิจการโรงงานของกระทรวงอุตสาหกรรม (GD Catalog) ณ วันที่ในแผง (“ไม่พบใน อก.” = ไม่พบเลขทะเบียนนี้ในข้อมูลชุดนั้น) ไม่ใช่การตรวจภาคสนามว่าโรงงานยังเปิดหรือปิด
- **จุด** = พิกัดจากแหล่งที่ชีตตรวจว่าอยู่ในกรอบประเทศไทย (`within_TH_bbox_unverified`) ไม่ใช่ตำแหน่งโรงงานที่ยืนยันแล้ว มี 15,654 ทะเบียน แหล่งไม่มีพิกัดสำหรับทะเบียนส่วนใหญ่ (55,772 ทะเบียน) จุดที่อยู่นอกอำเภอของทะเบียนเอง (718 ทะเบียน) ไม่แสดง (“ไม่แสดงพิกัด”) และทะเบียนอยู่ในอำเภอตามทะเบียนเสมอ ทุกทะเบียนนับในยอดของพื้นที่ แม้ไม่มีจุด
- **นิคม สวน เขตอุตสาหกรรม** = รายชื่อจากชีตวิจัยนิคมอุตสาหกรรม (106 รายการ ตรวจ 25–26 ต.ค. 2569) พร้อมลิงก์หน้าทางการและเดโม CityMETER Industrial Estate ไม่ได้บอกว่าโรงงานใดอยู่ในนิคม
- **ขอบเขตนิคมและโรงงานรอบนิคม (0.6.0)** = ขอบเขต OpenStreetMap 46 แห่งที่ทะเบียนวิจัยนิคมเลือกให้แสดงในเดโม (`DEMO_BOUNDARIES`, snapshot 25 ต.ค. 2569, © OpenStreetMap contributors, ODbL 1.0, ลดจุดที่ 6 ม.) เป็นเส้นบริบท ไม่ใช่ขอบเขตตามกฎหมาย · “โรงงานรอบนิคม ≤ 3 กม.” = ทะเบียนที่มีพิกัดเผยแพร่ห่างจากขอบเขตเป็นเส้นตรงไม่เกิน 3 กม. (จุดในขอบเขต = 0) วัดตอนสร้างข้อมูลกับขอบเขตเต็ม อ่านผ่านตัวกรองของหน้า (ยกเว้นจังหวัด) เป็นชุดตามระยะ ไม่ใช่สมาชิกนิคม · “ชื่อตรงกับทำเนียบ กนอ.” = ชื่อผู้ประกอบการของทะเบียนตรงกับรายชื่อในทำเนียบโรงงานในนิคมของ กนอ. (snapshot 4 พ.ย. 2569, `DEMO_FID_CANDIDATES`) จับคู่ด้วยชื่อเท่านั้น (`industrialestate/DATA_METHOD.md`)
- **ผู้ประกอบการบุคคลธรรมดา** = ทะเบียนที่ชื่อเป็นชื่อบุคคล (6,036 ทะเบียน) แสดงโดยไม่มีชื่อและไม่มีจุด ยังนับในยอดของพื้นที่
- **โรงงานใกล้เคียง** = ทะเบียนหมวดอุตสาหกรรมเดียวกัน คนงานครึ่งเท่าถึงสองเท่า (ทุกขนาดเมื่อทะเบียนนั้นไม่มีตัวเลขคนงานหรือระบุ 0 คน) ในระยะตรง 3 กม. จากจุด เรียงใกล้ก่อน เป็นรายชื่อเริ่มต้นสำหรับเทียบ ไม่ใช่ห่วงโซ่อุปทานหรือคู่แข่งที่ยืนยันแล้ว
- **อาคาร** = อาคารบนแผนที่ (CityMETER Building V4 หรือ OpenStreetMap ตามพื้นที่) ความสูง “สูงราว” เป็นค่าประมาณ “โรงงานในอาคารนี้” = จุดของทะเบียนอยู่ในขอบอาคาร เมื่อจุดไม่อยู่ในอาคารใด มุมมองอาคารเปิดที่อาคารใกล้จุดที่สุด (≤ 300 ม. ไม่มีก็ ≤ 800 ม.) เป็นการเลือกมุมกล้องเท่านั้น
- **ทั้งโรงงาน N อาคาร (ไซต์, 0.7.0)** = อาคาร CityMETER Building V4 ในกรอบพื้นที่โรงงานของ OpenStreetMap (`man_made=works`) ที่จุดของทะเบียนนี้ตกอยู่ และไม่มีจุดของทะเบียนอื่นในชุดนี้ในกรอบ (ข้อมูล OSM ถึง 6 พ.ย. 2569, © OpenStreetMap contributors, ODbL) ตรวจด้วยกฎอัตโนมัติ แล้วสุ่มเทียบภาพดาวเทียม (ผิด 2 จาก 45) ไม่ใช่โฉนด เนื้อที่ หรือกรรมสิทธิ์ และไม่ได้บอกว่าในกรอบมีโรงงานกี่แห่ง ทะเบียนที่ไม่มีไซต์ใช้อาคารใกล้จุดเหมือนเดิม (§4.1)
- **ภูมิประเทศ** = พื้นดินรอบจุด (รัศมี 500 ม.) จาก SRTM 30 ม. (สำรวจปี 2543) และแผนที่ OSM ไม่ใช่การประเมินความเสี่ยงน้ำท่วมหรือความเหมาะสมของที่ดิน

## 1. Sources

| Input | What it is | Published here? |
|---|---|---|
| `02_FACTORIES` of “CityMETER Factory Thailand — Factory, Operator & Company Research Master 2026-11-04” (Google Sheets, registry id `research.TH.factory`; columns listed in `scripts/build-data.py`) | the rows of this product: the 74,047 core FIDs with name, operator label, district, subdistrict, functional class, DIW class, type code, MOI status and its date, core basis, duplicate flag, estate context, source point and its screen | derived fields only (`data/factories.json`); the sheet and its export are never committed |
| `คนงานรวม` of the DIW class 2 and class 3 open-data exports (`factype2.csv`, `factype3.csv`, [diw-dataset.diw.go.th](https://diw-dataset.diw.go.th/th/dataset/factype3), resource updated 2026-10-01) | the worker figure of each DIW-listed FID; both files read 2026-11-05 with the SHA-256 the research master registers (`99_SOURCE_FILES`) | the figure only (fid · workers); every other field of the exports stays out |
| `18_WORKERS_P90` (gid 2026110418, same sheet) | the 7,175 FIDs at or above the P90 of the worker figures | a parity check: every figure equals the DIW export, and the tab is exactly the FIDs with 95+ workers |
| `02_TYPES` (same sheet, `02_FACTORIES` grouped by type code) | DIW type definition and official industry group per type code | code, definition and group |
| `99_SOURCE_FILES` (same sheet) | the source register: DIW class 2/3 exports (resource updated 2026-10-01), MOI location and permit exports (row updates through 2026-11-03), all checked 2026-11-04 | public https pages only |
| `01_ESTATES` of “CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม 106 รายการ — Research Master 2026-10-25” | names, type, province and the official page of 106 industrial areas | the list only |
| CityMETER Industrial Estate (`data/estate-context.json`, from the same master's `DEMO_*` tabs and its R7 OpenStreetMap outlines; `industrialestate/DATA_METHOD.md`) | the 46 outlines the master selected for the demo, the around-estate set per outline, directory name matches | built with the estate demo's data in one run; ODbL attribution in the map and the provenance |
| `data/area-index.json`, `data/frames/`, `data/provinces.geojson`, `data/boundary-receipts.json` | CityMETER production district and province outlines and base info (read 2026-11-01), copied from `montri-th/hotel@177e592` | yes (display geometry, production codes) |
| English district names | OpenGISData-Thailand `districts.geojson` @ `fafcea1` (CC BY 4.0, DOPA-credited; SHA-256 in `data/area-index.json → metadata.englishNames`), joined by production district code; read on the English page and in search, never as a boundary | Yes (the names, in `data/area-index.json`) |
| `data/building-units/` | buildings per อปท./เขต by the 15 % rule, from `montri-th/hotel@177e592` (units that hold a hotel with a point); every other unit draws OpenStreetMap | yes |

SHA-256 of every input file read is in `meta.inputs` (the files themselves stay in the owner's research workspace).

## 2. One row, two measures

One row = one FID of `02_FACTORIES`. Its worker figure is `คนงานรวม` of its DIW export row; the build stops if a FID of the
exports is missing from the registry, if a DIW-listed FID has no export row, if a figure differs from `18_WORKERS_P90`, if the
P90 of the figures is not 95, or if `18_WORKERS_P90` is not exactly the FIDs with 95+ workers. Nothing is merged, split, moved
or re-labelled. The page ranks the registrations by workers and builds the short label names itself (`js/model.js`).

| Measure | Unit | Definition | LDS family |
|---|---|---|---|
| `workers` (default) | คน | Σ `workers` of the registrations with a figure (3,755,632 in all; median 15, max 13,200) | `count` (a total, no denominator) |
| `count` | ทะเบียน | number of FIDs | `count` |

Both measures are totals: no per-km² or per-resident ratio is drawn, so no density family applies. A registration without a
figure (`workers = null`, 2,923) adds nothing to a worker total and is never estimated; where every registration of a district
or province in the selection lacks a figure, its worker total is EVID-05 no data (the hatch), never a measured 0.

Worker bands (ทะเบียน): 0–9 คน 23,462 · 10–49 33,178 · 50–94 7,309 · 95–199 3,998 · 200–499 2,216 · 500–999 585 ·
1,000–1,999 244 · 2,000–4,999 108 · 5,000+ 24 · ไม่มีตัวเลขคนงาน 2,923. The size filter offers “คนงาน 95 คนขึ้นไป” (`p90`,
7,175), every band and “ไม่มีตัวเลขคนงาน” (`none`); the band ids `w1`…`w6` keep their release 0.1.0 meaning.

## 3. District membership (build time, never re-assigned on screen)

The registration's own district label (`02_FACTORIES.district`, DIW 2026 first, otherwise MOI) is matched by name to a
production district of its own province (`row.admin = name`, 74,045 rows). A label that names no district of its province
leaves the row at province level (`province`, 2 rows). The source point never decides membership.

## 4. Points

`latitude_observed` / `longitude_observed` are published only where `coordinate_quality` is `within_TH_bbox_unverified`
(17,392 registrations; the sources have no point for 55,772 and an unusable one for 883), rounded to 5 decimals, and only
when the point falls inside the registration's own district outline: 585 points in another district, 128 in another province
and 5 outside every outline are withheld (`row.off`, `meta.checks.pointWithheld`). Points of registrations known only by a
natural person's name (1,020 of them had one) are not published. 15,654 rows carry a point; the others count in their
district and are listed in panels and the table without a symbol.

## 4.1 Sites (release 0.7.0)

Owner 2026-11-10 08:17 approved boundary_source `osm_polygon_auto` for this dataset. Built from the Geofabrik extract
`thailand-261106.osm.pbf` (OSM data to 2026-11-06 21:21:21 UTC) and the 15,654 published points:

1. **Area:** the smallest OpenStreetMap area holding the point that is `man_made=works`, `landuse=industrial` or
   `industrial=*`, not a building, not estate-wide (no estate word in its names; not the same area as one of the 46 estate
   outlines, IoU > 0.5), 1,000 m² – 5 km², holding no other published point of this dataset, and unnamed or named for the
   registration (the name rules of the skill `osm-area-site-join`). 550 points pass; 789 share their area with other
   points, 1,462 lie only in estate-wide areas, 11,773 have no area at all.
2. **Buildings:** CityMETER Building V4 read with the page's own code; a building belongs when its interior point lies in
   the area, one mostly outside is dropped and one mostly inside added, the building the point stands in is never
   dropped; two buildings or more make a site, within 1,000 m of the point. 448 sites (10,972 buildings); not built: 63
   points where the map draws OpenStreetMap buildings, 16 areas reaching past 1 km, 23 with no or one building.
3. **Sample against imagery** (30 random sites, then 30 more of `man_made=works` / `industrial=*`): all areas 3 wrong of 30
   (two `landuse=industrial` areas covering houses or several plants, one works area covering a whole block);
   `man_made=works` 2 wrong of 45. Only the `man_made=works` sites are published: **221 sites, 4,899 buildings** (mostly
   in Chon Buri, Rayong and Samut Prakan estates); the 227 others are held for a layout check.

`data/factory-sites.json` carries per registration the interior points of its site's buildings (6 decimals), the
OpenStreetMap element page, the count and the dates — never the area, the OSM names or the notes. A site is a group of
buildings for the map: not a deed, a land area, ownership, the number of factories in the area or their workers. Many
registrations without a published point may lie in the same areas; the rule only sees published points.

## 5. Industry, function and status

- **Type → group → family:** `factory_type_code_raw` → `official_industry_group_raw` (one group per code) → one of ten
  families (`FAMILIES`): food · electrical · vehicle (vehicles and machinery, which in the DIW grouping includes electronic
  computing devices such as type 06900) · textile · metal · polymer · wood · mineral · plant · other (incl. the 3,114 rows
  with no group). The family binds to an LDS categorical series and its shape cue by id (`js/cues.js#GROUP_SERIES`).
- **Function:** `functional_class` of `02_FACTORIES` (manufacturing 54,229 · review 7,729 · other 6,967 · service 5,122).
  All classes stay in the legal-factory scope.
- **DIW class (จำพวก):** 3 for 67,778 rows, 2 for 3,348; the 2,921 MOI-only registrations have no DIW class.
- **MOI status:** `moi_location_status_raw` (ดำเนินการ 27,007 · ได้รับใบอนุญาต 3,621 · หยุดดำเนินการ 902 · จำหน่าย 9 ·
  not found 42,508) with its update date. A stopped or removed status is not read as a closure of the site.
- **Core basis:** listed in the DIW export of 2026-10-01 (47,040), listed and MOI-operating (24,086), MOI-operating only
  (2,921).

## 6. Context (build time)

- **Industrial areas:** 106 names in 21 provinces (84 นิคมอุตสาหกรรม · 16 สวนอุตสาหกรรม · 6 เขตอุตสาหกรรม), each with its
  official page (IEAT estate pages, developers' pages, government pages). The list never says which registration lies in an
  estate: the DIW-listed rows have `estate_context = outside_estate_source_scope_DIW_catalog`, the MOI-only rows
  `unknown_estate_context`, and every row `estate_verification_status = individual_membership_unverified`.
- The panels read the 95+ lens and the functional classes from the same rows; release 0.1.0's separate registry context is
  gone because the rows are now the registry.

## 7. What the page computes

- **First Aha** (`js/area-insight.js`): the province holding the most of the measure among rows placed at district level;
  up to three of its districts with the most of it (never cutting a tie; never every district that holds the measure); their
  share of the province's whole total; the industry families of those rows with each share (numerator and denominator in
  the title and accessible text); the district with the most of the measure outside that province and its first family.
  Snapshot: 72 % of the workers of Samut Prakan (330,987 of 457,353) are in Bang Phli, Mueang Samut Prakan and Phra Pradaeng;
  with the 95+ lens the same three อำเภอ hold 74 % (220,980 of 299,796), as in release 0.1.0.
- **Ranks and charts:** districts ranked over `scopeRows` (filters before any area selection); the matrix of district ×
  family with equal cells; the official DIW groups ranked by the measure.
- **Nearby set** (`js/profile-model.js#nearbyOf`): same family, workers ½–2× (any size without a figure), straight line
  ≤ 3 km, every row of the dataset, nearest first; the count and workers of every registration within 3 km beside it.
- **Map colour:** the LDS `count` family, all 41 samples by rank among the measured nonzero values of the districts being read
  (`js/scales.js#buildRamp`); a district with no registration is a measured zero (sample 0 + the zero outline): 13 of 928
  districts unfiltered (12 without a registration, 1 whose registrations record 0 workers). Workers unknown for every
  registration of an area under the filters → no data (the 135° hatch), for districts and provinces alike.

## 8. Not published

Addresses, raw MOI operator names (ONAME), the 2025 operator label, operator context ids, legal operator and parent fields,
researcher notes and human review fields, evidence and conflict flags, source record ids, logo files and URLs, points outside
the screen or outside the registration's own district, names and points of natural-person operators, private Drive or Sheet
URLs, and every field of the DIW exports except the FID and `คนงานรวม` (`meta.excludedFields`). Estate boundaries are not
published. Operator labels (`operator_display_observed`) are shown only where they differ from the registration's name
beyond spacing and legal-form words (3,405 rows).

## 9. Research follow-ups (reported, not patched in `data/`)

1. **IEAT estates:** factories registered with IEAT (the sheet's IEAT portal tab holds 6,937 source records) are outside this
   product; a dated worker figure per IEAT factory would be needed to compare estate districts fairly.
2. **Worker date:** the DIW exports carry no date for the worker figure; a dated source would let the panel say “ณ ปี …”.
3. **Same-site registrations:** 3,328 rows share an exact name and address with another FID; a site key would let the map
   show one plant once.
4. **Company logos:** the sheet selects logos for 457 FIDs (`20_LOGO_USE`, supported company context); the files are in the
   research workspace and are not in this release.
5. **Estate boundaries:** only the 46 OpenStreetMap outlines the estate master selected for the demo are drawn (release 0.6.0); they are not legal or current boundaries, and the other 60 records have none yet.
6. **Building units:** the 15 % rule was decided for the units that hold a hotel; units holding factories only draw OpenStreetMap
   until `scripts/build-building-units.py` is run for them.
7. **Points:** the sources have no point for 75 % of the registrations; a geocoded point per FID (with its method) would put
   them on the map.

## 10. Rebuild

```sh
python3 -I scripts/build-data.py --csv <dir of tab CSV exports> --workers <fid,workers,class of the DIW exports> \
  --estates <dir of estate-master CSVs> --index data/area-index.json --frames data/frames \
  --out data/factories.json --report data/build-report.json --built-on YYYY-MM-DD
python3 -I scripts/build-sites.py --sites <site rows CSV: the research site tab's export>   # data/factory-sites.json (§4.1)
npm test
```

The CSV exports are read from the research master (tabs listed in §1) and the DIW open-data portal, and stay outside the
repository. Changes to names, links, statuses or classes are made in the research sheet itself, then re-exported and rebuilt —
never patched in `data/`.
