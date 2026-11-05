# CityMETER Factory 0.1.0 — implementation plan

คู่กับ `implementation-plan.json` (schema 1.5.0)

## สถาปัตยกรรม

Static site บน GitHub Pages · ES modules ผ่าน import map (cache tag เดียวทุกไฟล์) · ไม่มี build step · MapLibre GL 5.6.2 (unpkg, pinned) · OpenFreeMap tiles · กราฟเป็น HTML ล้วน · Node ≥ 20 สำหรับ tests · Python 3 สำหรับสร้างข้อมูล

| โมดูล | หน้าที่ |
|---|---|
| `js/model.js` | คำศัพท์ (SCOPE, METRICS, SIZE_BANDS, MOI_TH), decode, filter, summarize, familyShares, ขนาดสัญลักษณ์, ลิงก์ production |
| `js/area-insight.js` | ข้อค้นพบแรก + อุตสาหกรรมหลัก + ข้อค้นพบนอกจังหวัด |
| `js/profile-model.js` | โมเดลของ overview / area / building / factory, บริบททะเบียนและนิคม, โรงงานใกล้เคียง |
| `js/panel.js` | แผงเป็น HTML string, บรรทัดที่มา, filter chips |
| `js/chart-model.js` · `js/charts.js` | กราฟอำเภอ · อำเภอ × หมวด · กลุ่ม กรอ. |
| `js/pins.js` · `js/labels.js` | สัญลักษณ์รายทะเบียน (ขนาดตามคนงาน) · ชื่อกลางจอ + การ์ด |
| `js/app.js` | การเลือก สถานะ URL แผนที่ แผง กล้องอาคาร |
| อื่น ๆ | สืบทอดจาก CityMETER · Hotel 0.3.6 (camera, massing, venue-xray, terrain, frames, building-units, maplibre-guard, map-style, breadcrumb, navigation, launch) |

## งาน

T1 สร้างข้อมูล → T2 model → T3 ข้อค้นพบ → T4 แผง → T5 กราฟและตาราง → T6 แผนที่ → T7 pictogram → T8 เอกสาร → T9 เผยแพร่และตรวจ live (สถานะใน JSON)

## Acceptance criteria

AC1–AC15 ใน `implementation-plan.json` (build, unit, render, live) — ผลตรวจอยู่ใน `VERIFICATION.md`

## Backlog

โรงงานในนิคม กนอ. ที่มีตัวเลขคนงานพร้อมวันที่ · คีย์ไซต์ของ 430 ทะเบียนที่ชื่อและที่อยู่ซ้ำ · โลโก้บริษัท 457 ทะเบียน · ขอบเขตนิคมเมื่อเลือกและตรวจสิทธิ์แล้ว · หน่วยอาคารของ อปท. ที่มีแต่โรงงาน · ตัวเลขคนงานที่มีวันที่
