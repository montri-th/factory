/**
 * CityMETER · Industrial Estate — the data model. Pure: no DOM, no map.
 *
 * One row = one catalogue record of the industrial-estate research master (registry research.TH.industrial_estates,
 * contract industrial-estate-demo/1.0.0): an estate, park or zone as the master lists it — sometimes a project, a phase
 * or a campus, never “one legal estate” or “one site”. Measures (registry P03, DATA_METHOD.md §2):
 *   records    distinct estate_id (the catalogue), counted per source province label
 *   listed     IEAT directory records per estate (`dir.n`, snapshot 4 Nov 2026) — a listing, not verified factories,
 *              tenants or companies; an estate with no linked record in this snapshot is `none` (no_data), never 0
 *   candidates FIDs whose operator name matches a directory name (`dir.cand`) — name candidates only, never summed
 *              across estates, never a factory count
 *   verified   accepted factories in the estate: null for every record (no_data)
 * Province = the source label (production code of the same name); nothing is assigned by point-in-polygon.
 */
import {LANG} from './shell/i18n.js';
import {buildRamp, classify, COUNT_SCALE} from './scales.js';

export const EN = LANG === 'en';
/** Thai or English for the page language. */
export const T = (th, en) => (EN && en ? en : th);

/** The three Eastern Economic Corridor provinces (ฉะเชิงเทรา ชลบุรี ระยอง), production codes. */
export const EEC = Object.freeze(['CCO', 'CBI', 'RYG']);
/** Straight-line reach of the around-estate set (km), as built (data/estates.json meta.around.km). */
export const AROUND_KM = 3;

let PROVINCES = new Map();
/** Province lookup (production code → {code, th, en, label, bbox}). */
export const provinceByCode = code => PROVINCES.get(code) || null;
export const provinceName = code => (EN ? PROVINCES.get(code)?.en || PROVINCES.get(code)?.th : PROVINCES.get(code)?.th) || code || '';

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const fold = s => clean(s).toLowerCase().normalize('NFC');

/** data/estates.json + data/area-index.json → the model. */
export function decodeData(raw, index) {
  PROVINCES = new Map(index.provinces.map(p => [p.id, {code: p.id, th: p.name, en: p.nameEn || p.name, label: p.label, bbox: p.bbox}]));
  const types = raw.types;
  const estates = raw.estates.map(e => {
    const type = types[e.type];
    return Object.freeze({
      ...e,
      typeId: type.id, typeTh: type.th, typeEn: type.en,
      outline: e.boundary.state === 'shown',
      // R9 (release 1.3.0): a context area is drawn apart from the outlines and never counts as one.
      context: e.boundary.state === 'context',
      listed: e.dir.state === 'measured',
      label: e.boundary.label || null,
      search: fold([e.name, e.nameEn, ...(e.aliases || []), e.developer, e.logoLabel, PROVINCES.get(e.province)?.th, PROVINCES.get(e.province)?.en, type.th, e.id].filter(Boolean).join(' ')),
    });
  });
  return {meta: raw.meta, types, estates, byId: new Map(estates.map(e => [e.id, e]))};
}

/** Display name for the page language: the record's English name on an English page (when the source gives one). */
export const nameOf = e => (EN && e?.nameEn ? e.nameEn : e?.name || '');
export const typeOf = e => (EN ? e.typeEn : e.typeTh);

export const FILTERS = Object.freeze(['search', 'type', 'province', 'outline', 'listed']);

/** Rows after the filters (search, type, province, outline, listed). */
export function filterEstates(estates, f = {}) {
  const q = fold(f.search || '');
  const words = q ? q.split(' ').filter(Boolean) : [];
  return estates.filter(e => (!f.type || e.typeId === f.type)
    && (!f.province || e.province === f.province)
    && (!f.outline || (f.outline === 'yes') === e.outline)
    && (!f.listed || (f.listed === 'yes') === e.listed)
    && words.every(w => e.search.includes(w)));
}

/** Sorted the catalogue way: province (Thai order of the source label), then name. */
const COLLATOR = new Intl.Collator('th');
export function catalogueOrder(a, b) {
  return COLLATOR.compare(provinceByCode(a.province)?.th || '', provinceByCode(b.province)?.th || '') || COLLATOR.compare(a.name, b.name);
}

/** Totals of a set of records; directory records add only over disjoint estates (each estate once). */
export function summarize(estates) {
  const byProvince = new Map(), byType = new Map();
  let outlines = 0, listedEstates = 0, listed = 0;
  for (const e of estates) {
    byProvince.set(e.province, (byProvince.get(e.province) || 0) + 1);
    byType.set(e.typeId, (byType.get(e.typeId) || 0) + 1);
    if (e.outline) outlines++;
    if (e.listed) { listedEstates++; listed += e.dir.n; }
  }
  const provinces = [...byProvince].map(([code, n]) => ({code, n, name: provinceName(code)}))
    .sort((a, b) => b.n - a.n || COLLATOR.compare(provinceByCode(a.code)?.th || '', provinceByCode(b.code)?.th || ''));
  return {n: estates.length, outlines, listed, listedEstates, provinces, byType};
}

/**
 * First finding (Aha): how many of the records in scope sit in the three EEC provinces, per province — a composition
 * of the catalogue by its source province label, not a ranking of estates (the contract approves no ranking feature).
 * null when no record of the scope is in the EEC.
 */
export function ahaOf(estates) {
  const total = estates.length;
  const parts = EEC.map(code => ({code, name: provinceName(code), n: estates.filter(e => e.province === code).length})).filter(p => p.n);
  const n = parts.reduce((s, p) => s + p.n, 0);
  if (!n || !total) return null;
  const inEec = estates.filter(e => EEC.includes(e.province));
  return {n, total, share: n / total, parts, outlines: inEec.filter(e => e.outline).length,
    listed: inEec.filter(e => e.listed).reduce((s, e) => s + e.dir.n, 0), listedEstates: inEec.filter(e => e.listed).length};
}

/**
 * The colour of each drawn estate: one 41-sample LDS `count` ramp over the directory listings of the drawn estates in
 * scope (js/scales.js#buildRamp, owner rule “41 scales ตาม LDS เสมอ”); an estate with no listing is no_data (hatch).
 */
export function estateRamp(estates) {
  const drawn = estates.filter(e => e.outline);
  const ramp = buildRamp(drawn.filter(e => e.listed).map(e => e.dir.n), {scale: COUNT_SCALE, unit: T('รายชื่อ', 'listings')});
  const byId = new Map(drawn.map(e => [e.id, e.listed ? classify(e.dir.n, ramp) : classify(null, ramp, 'no_data')]));
  return {ramp, byId, noData: drawn.filter(e => !e.listed).length};
}

/**
 * Developers and brands of a set: records grouped by the logo label of the master (the developer, the parent company
 * or the network brand it names), with the logo file when there is one.
 */
export function developerGroups(estates) {
  const groups = new Map();
  for (const e of estates) {
    const key = e.logoLabel || e.developer || '';
    if (!key) continue;
    const g = groups.get(key) || {label: key, logo: e.logo, role: e.logoRole, ids: []};
    if (!g.logo && e.logo) g.logo = e.logo;
    g.ids.push(e.id);
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({...g, n: g.ids.length})).sort((a, b) => b.n - a.n || COLLATOR.compare(a.label, b.label));
}

/** What the page says about an estate that has no outline on the map (DEMO_BOUNDARIES status → words). */
export const BOUNDARY_WORDS = Object.freeze({
  shown: ['ขอบเขตจาก OpenStreetMap', 'Outline from OpenStreetMap'],
  context: ['พื้นที่บริบทจาก OpenStreetMap — ไม่ใช่ขอบนิคม', 'Context area from OpenStreetMap — not the estate outline'],
  hold: ['ยังไม่แสดงขอบเขต: แหล่งขอบเขตยังขัดกัน', 'No outline yet: the boundary sources still conflict'],
  scope: ['ยังไม่แสดงขอบเขต: ต้องแยกโครงการย่อยก่อน', 'No outline yet: the sub-projects must be separated first'],
  missing: ['ยังไม่แสดงขอบเขต: ยังไม่พบขอบเขตเต็มที่จับคู่ได้', 'No outline yet: no matching whole outline found'],
  license: ['ยังไม่แสดงขอบเขต: แหล่งที่พบยังไม่ยืนยันสิทธิ์ใช้', 'No outline yet: the sources found have no confirmed reuse right'],
});
export const boundaryWords = e => T(...BOUNDARY_WORDS[e.boundary.state]);

/**
 * R9 (estate master 30_DEMO_COVERAGE_R9, reviewed 2026-11-10): the label and the note that stay beside a drawn shape.
 * English: the labels and the three shared notes are translated here; a note written for one estate stays in Thai (the
 * register's words, marked lang="th"), never paraphrased.
 */
const OUTLINE_EN = Object.freeze({
  'แนวจาก OSM — ยังไม่ยืนยันครบทั้งโครงการ': 'Outline from OSM — not confirmed for the whole project',
  'แนว OSM บางชัน — ขอบเขตยังไม่ยืนยัน': 'OSM outline, Bang Chan — boundary not confirmed',
  'ขอบเขต TFD 2 บางส่วนตาม OSM — ส่วนขยายยังไม่ครบ': 'TFD 2, part of the boundary per OSM — extensions not complete',
  'อมตะซิตี้ ชลบุรี — ส่วนที่ OSM เรียกโครงการ 1; ยังไม่ครอบทั้งนิคม': 'Amata City Chonburi — the part OSM calls Project 1; not the whole estate',
  'แนว OSM นครหลวง — ขอบเขตยังไม่ยืนยัน': 'OSM outline, Nakhon Luang — boundary not confirmed',
  'แนว OSM พิจิตร — ครอบคลุมบางส่วน': 'OSM outline, Phichit — covers part of the estate',
  'CPGC — เส้นจาก OSM ยังไม่ยืนยันครบทั้ง 3 เฟส': 'CPGC — OSM line not confirmed for all 3 phases',
  'WHA ระยอง 36 — ขอบเขตประมาณการจาก OSM มีส่วนรอยืนยัน': 'WHA Rayong 36 — approximate boundary from OSM; parts await confirmation',
  'หลักชัยเมืองยาง — ส่วนที่ปรากฏใน OSM; ส่วนขยายยังรอยืนยัน': 'Lakchai Mueang Yang — the part shown in OSM; extensions await confirmation',
  'อมตะซิตี้ ระยอง — ขอบเขตประมาณการจาก OSM ยังไม่ยืนยันครบทุกระยะ': 'Amata City Rayong — approximate boundary from OSM; not confirmed for every phase',
  'แนว OSM ภาคเหนือ — เฉพาะส่วนตะวันออก': 'OSM outline, Northern Region — eastern part only',
  'แนว OSM บางปู — ขอบเขตยังไม่ยืนยัน': 'OSM outline, Bang Poo — boundary not confirmed',
  'แนว OSM บางพลี — ขอบเขตยังไม่ยืนยัน': 'OSM outline, Bang Phli — boundary not confirmed',
  'สวนอุตสาหกรรม 304 ฉะเชิงเทรา — ขอบตาม OSM ยังไม่ยืนยันทั้งโครงการ': '304 Industrial Park Chachoengsao — OSM boundary not confirmed for the whole project',
  'แนว OSM สุรนารี — ขอบเขตยังไม่ยืนยัน': 'OSM outline, Suranaree — boundary not confirmed',
  'แนว OSM สวน 304 ปราจีนบุรี — ส่วนพื้นที่แยกกัน': 'OSM outline, 304 Industrial Park Prachinburi — separate parts',
  'แนว OSM โรจนะ อยุธยา — ส่วนพื้นที่ยังไม่ครบทุกเฟส': 'OSM outline, Rojana Ayutthaya — parts, not every phase',
  'SEP1 สยามอีสเทิร์น — แนว OSM โดยประมาณ; ขอบเต็มยังรอยืนยัน': 'SEP1 Siam Eastern — approximate OSM outline; the full boundary awaits confirmation',
  'WHA Rayong Industrial Land — แนว OSM โดยประมาณ; ขอบเต็มยังรอยืนยัน': 'WHA Rayong Industrial Land — approximate OSM outline; the full boundary awaits confirmation',
  'แนว OSM แก่งคอย — อาจรวมพื้นที่นอกนิคม': 'OSM outline, Kaeng Khoi — may take in land outside the estate',
  'แนว OSM นิคมภาคใต้ จังหวัดสงขลา — ยังไม่แยก Rubber City': 'OSM outline, Southern Region estate, Songkhla — Rubber City not separated',
  'ย่านอุตสาหกรรมมาบตาพุดตาม OSM — ไม่ใช่ขอบนิคมที่ยืนยันแล้ว': 'Map Ta Phut industrial district per OSM — not a confirmed estate boundary',
  'ยังไม่มีขอบเขตที่ใช้แสดงได้': 'No outline that can be shown yet',
  'ยังไม่ยืนยันว่าครบทุกเฟสและส่วนขยาย': 'Not confirmed to cover every phase and extension',
  'ยังไม่ยืนยันว่าครบทุกเฟสและส่วนขยาย; พื้นที่แนวต่างจากฐานอ้างอิงเกิน 15% ใช้เตือนเพื่อตรวจต่อ ไม่ใช่ข้อพิสูจน์ว่าแนวผิดหรือครบ':
    'Not confirmed to cover every phase and extension; the outline’s area is more than 15% from the reference — a flag to check further, not proof that the outline is wrong or complete',
  'ยังไม่ยืนยันว่าครบทุกเฟสและส่วนขยาย; พื้นที่แนวต่างจากฐานอ้างอิงเกิน 15% ใช้เตือนเพื่อตรวจต่อ ไม่ใช่ข้อพิสูจน์ว่าแนวผิดหรือครบ; แหล่งเจ้าของมีฐานพื้นที่ 3,900 ไร่ และ 2,025 ไร่ที่ยังอธิบายความต่างไม่ได้':
    'Not confirmed to cover every phase and extension; the outline’s area is more than 15% from the reference — a flag to check further, not proof that the outline is wrong or complete; the owner’s sources state 3,900 rai and 2,025 rai, a difference not yet explained',
});
/** {text, th} — `th` when the English page keeps the register's Thai words. */
const outlineText = th => (!th ? null : !EN ? {text: th, th: false} : OUTLINE_EN[th] ? {text: OUTLINE_EN[th], th: false} : {text: th, th: true});
export const outlineLabel = e => outlineText(e.boundary.labelTh);
/** R9 roles of an outline that is part of the estate only: drawn with a dashed edge so the shape never reads as the whole. */
export const PARTIAL_ROLES = Object.freeze(['known_incomplete_source_outline', 'source_part', 'named_project_part_source_outline', 'source_parts_separate']);
export const partialOutline = e => Boolean(e?.outline && PARTIAL_ROLES.includes(e.boundary.role));
export const outlineNote = e => outlineText(e.boundary.note);

/**
 * Short form of a long organisation label for chips and captions (owner 2026-11-10: “ยังคงให้สั้นเหมือนเดิม”); the full
 * label stays in the title and the sources. Only forms the organisation itself uses (กนอ. / IEAT) or a legal suffix.
 */
export function shortLabel(label) {
  const s = String(label || '').trim();
  if (/^(?:Industrial Estate Authority of Thailand|กนอ\.?)$/i.test(s)) return T('กนอ.', 'IEAT');
  return s.replace(/\s+(?:Public\s+)?Company\s+Limited$/i, '').replace(/\s+(?:PCL|Co\.,?\s*Ltd\.?)$/i, '').trim();
}

/** Logo caption: what the mark is (owner 2026-11-10: a company or parent mark is fine, kept short). */
export function logoCaption(e) {
  if (!e?.logo) return '';
  if (e.logoRole === 'exact_estate_mark') return T('โลโก้นิคม', 'Estate logo');
  if (e.logoRole === 'verified_parent_company') return T('บริษัทแม่', 'Parent company');
  return T('ผู้พัฒนา', 'Developer');
}

/** Around-estate set of one estate from data/around.json → rows [{fid, name, lon, lat, workers, family}]. */
export function aroundRows(around, id) {
  const list = around?.estates?.[id] || [];
  return list.map(([slot, workers, family, moi]) => {
    const [fid, name, lon, lat] = around.rows[slot];
    return {fid, name, lon, lat, workers, family, moi: moi === 1};
  });
}

/** Directory list of one estate from data/directory.json → [{id, name, person, fids:[fid]}]. */
export function directoryRows(directory, id) {
  const list = directory?.estates?.[id] || [];
  return list.map(([dirId, name, cand]) => ({id: dirId, name, person: !name, fids: cand.map(i => directory.fids[i])}));
}

/** Marker radius for an around point by workers (area grows with workers; 5–12 px, 4.4 px without a figure). */
export const aroundRadius = w => (Number.isFinite(w) && w > 0 ? Math.max(5, Math.min(12, 4.4 + Math.sqrt(w) / 5)) : 4.4);

/** Factory family index → LDS series (js/cues.js GROUP_SERIES order of CityMETER Factory). */
export const FAMILY_IDS = Object.freeze(['food', 'electrical', 'vehicle', 'textile', 'metal', 'polymer', 'wood', 'mineral', 'plant', 'other', 'unstated']);
