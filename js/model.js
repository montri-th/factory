/**
 * Dataset vocabulary, decoding, shared filter and summary helpers.
 *
 * Rows are the factory registrations of “CityMETER Factory Thailand — Factory, Operator & Company Research Master
 * 2026-11-04” (data/factories.json, built by scripts/build-data.py). One row = one FID of the core registry 02_FACTORIES
 * (every size). A registration is not a verified physical site, a legal entity or proof of operation today. Nothing here
 * merges, moves or mutates a row. The 95+ lens (`row.p90`) = the registrations at or above the P90 of the worker figures
 * (95 workers; the FIDs of the sheet's tab 18_WORKERS_P90).
 *
 * Two measures (a contract, see DATA_METHOD.md §2):
 *   workers (default) — Σ workers of the registrations (“คน”): คนงานรวม of the DIW class 2/3 exports (resource metadata
 *                       2026-10-01). A registration without a figure (row.workers = null) adds nothing and is never
 *                       estimated; a 0 is the source's own 0.
 *   count             — registrations (“ทะเบียน”): FIDs, not unique sites.
 *
 * Area = the เขต/อำเภอ (DISTRICT) of CityMETER production matched at build time from the registration's own district
 * label (row.admin: name · province). Points are the source points the sheet screened as inside Thailand's bounding
 * box — not verified plant locations — and are never used to move a registration; a point outside the registration's
 * own district is withheld at build time (row.off).
 */
import {seriesOf} from './cues.js';

/** The product's scope, said wherever a figure could be read without it; `lens` names the 95+ registrations. */
export const SCOPE = Object.freeze({th: 'ทะเบียนโรงงานทุกขนาด', short: 'ทะเบียนโรงงาน', threshold: 95,
  lens: 'โรงงาน 95+ คน', lensTh: 'โรงงานคนงาน 95 คนขึ้นไป'});

/** Short labels for tight places (matrix columns); the full Thai label stays in titles, legends and lists. */
export const FAMILY_SHORT = Object.freeze({
  food: 'อาหาร', electrical: 'ไฟฟ้า', vehicle: 'ยานพาหนะ', textile: 'สิ่งทอ', metal: 'โลหะ', polymer: 'พลาสติก/ยาง',
  wood: 'ไม้/กระดาษ', mineral: 'อโลหะ', plant: 'พืช', other: 'อื่น ๆ',
});

/** Measures: `workers` (default) and `count`. `aha` is the subject of the first finding (scope included). */
export const METRICS = Object.freeze({
  workers: Object.freeze({id: 'workers', one: 'คน', label: 'คนงาน', subject: 'คนงาน', aha: 'คนงานโรงงาน', per: 'คน'}),
  count: Object.freeze({id: 'count', one: 'ทะเบียน', label: 'โรงงาน', subject: 'โรงงาน', aha: 'โรงงาน', per: 'ทะเบียน'}),
});
export const metricOf = id => METRICS[id] || METRICS.workers;
/** Unit words for a measure ('' = workers). */
export const unitWords = (metric = '') => ({...metricOf(metric), mode: metricOf(metric).id});

/** Worker bands of the registration; w1…w6 keep their 0.1.0 meaning (the 95+ lens). */
export const SIZE_BANDS = Object.freeze([
  Object.freeze({id: 's1', th: '0–9 คน', short: '0–9', min: 0, max: 9}),
  Object.freeze({id: 's2', th: '10–49 คน', short: '10–49', min: 10, max: 49}),
  Object.freeze({id: 's3', th: '50–94 คน', short: '50–94', min: 50, max: 94}),
  Object.freeze({id: 'w1', th: '95–199 คน', short: '95–199', min: 95, max: 199}),
  Object.freeze({id: 'w2', th: '200–499 คน', short: '200–499', min: 200, max: 499}),
  Object.freeze({id: 'w3', th: '500–999 คน', short: '500–999', min: 500, max: 999}),
  Object.freeze({id: 'w4', th: '1,000–1,999 คน', short: '1,000+', min: 1000, max: 1999}),
  Object.freeze({id: 'w5', th: '2,000–4,999 คน', short: '2,000+', min: 2000, max: 4999}),
  Object.freeze({id: 'w6', th: '5,000 คนขึ้นไป', short: '5,000+', min: 5000, max: Infinity}),
]);
/** Registrations without a worker figure (never a band of 0). */
export const NO_FIGURE = Object.freeze({id: 'none', th: 'ไม่มีตัวเลขคนงาน', short: 'ไม่มีตัวเลข'});
/** The size filter: the 95+ lens, every band, then the registrations without a figure. */
export const SIZE_FILTERS = Object.freeze([Object.freeze({id: 'p90', th: 'คนงาน 95 คนขึ้นไป'}), ...SIZE_BANDS, NO_FIGURE]);
export const sizeOf = workers => (Number.isFinite(workers) && workers >= 0 ? SIZE_BANDS.find(b => workers >= b.min && workers <= b.max)?.id || '' : NO_FIGURE.id);
/**
 * Symbol size on the map: the symbol's AREA grows with the workers — radius = k(zoom) · √(workers / WORKERS_UNIT),
 * workers capped at WORKERS_SIZE_CAP (above it the cap size), never below PIN_MIN_RADIUS. PIN_SCALE gives k (px of
 * radius for WORKERS_UNIT workers) by zoom; the legend and the HTML pins use the same numbers.
 */
export const PIN_SCALE = Object.freeze([[6, 0.9], [8, 1.3], [10, 2.0], [12, 3.2], [14, 4.8], [16, 5.8], [18, 6.4]]);
export const WORKERS_UNIT = 400;
export const WORKERS_SIZE_CAP = 6400;
export const PIN_MIN_RADIUS = 1.6;
export function pinK(zoom) {
  const s = PIN_SCALE;
  if (!(zoom > s[0][0])) return s[0][1];
  for (let i = 1; i < s.length; i++) if (zoom <= s[i][0]) return s[i - 1][1] + (s[i][1] - s[i - 1][1]) * (zoom - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
  return s.at(-1)[1];
}
/** Symbol radius in px for a row's workers at a zoom. */
export const pinRadius = (workers, zoom) => {
  const n = Number.isFinite(workers) && workers > 0 ? Math.min(workers, WORKERS_SIZE_CAP) : 0;
  return Math.max(PIN_MIN_RADIUS, pinK(zoom) * Math.sqrt(n / WORKERS_UNIT));
};
/**
 * The same size as a MapLibre expression of feature property `r` (workers): min(cap, `factor` × radius) + `add` px
 * (zoom stays the top-level input, as MapLibre requires).
 */
export function pinSizeExpression(factor = 1, add = 0, cap = 1e6) {
  const at = k => ['+', add, ['min', cap, ['*', factor, ['max', PIN_MIN_RADIUS, ['*', k, ['sqrt', ['/', ['min', ['max', ['get', 'r'], 1], WORKERS_SIZE_CAP], WORKERS_UNIT]]]]]]];
  return ['interpolate', ['linear'], ['zoom'], ...PIN_SCALE.flatMap(([z, k]) => [z, at(k)])];
}
/** Size class kept for HTML pins and lists: 0 small (< 400 workers), 1 medium (400–1,999), 2 large (≥ 2,000). */
export const pinSizeOf = workers => (Number.isFinite(workers) && workers >= 2000 ? 2 : Number.isFinite(workers) && workers >= 400 ? 1 : 0);

/**
 * Importance of a registration for labels: its percentile among all rows by workers (share of rows at or below it).
 * Ranking only — never shown as a figure.
 */
export function importanceScores(rows) {
  const sorted = rows.map(r => r.workers).filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return rows.map(r => {
    if (!Number.isFinite(r.workers) || !n) return 0;
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= r.workers) lo = mid + 1; else hi = mid; }
    return lo / n;
  });
}

/** The value a row adds to a measure: its workers or 1 registration. */
export const rowValue = (r, metric = 'workers') => (metric === 'count' ? 1 : (Number.isFinite(r?.workers) && r.workers > 0 ? r.workers : 0));
/** The value of an aggregate ({count, workers}) under a measure. */
export const valueOf = (a, metric = 'workers') => (metric === 'count' ? a?.count || 0 : a?.workers || 0);

/** Every province of the production base info, keyed by the production route code (/v3/citymeter/{code}). */
let PROVINCE_LIST = [];
export function setProvinces(list) { PROVINCE_LIST = Object.freeze((list || []).map(p => Object.freeze({code: p.id, dopa: p.code, th: p.name, en: p.nameEn}))); }
export const provinces = () => PROVINCE_LIST;
export const provinceByCode = code => PROVINCE_LIST.find(p => p.code === String(code || '').toUpperCase()) || null;
/** Accept a production code (BKK), a DOPA code (10) or an English/Thai name; returns the production code or ''. */
export const provinceCodeFrom = value => {
  const v = String(value || '').trim();
  const p = PROVINCE_LIST.find(x => x.code === v.toUpperCase() || x.dopa === v || x.en.toLowerCase() === v.toLowerCase() || x.th === v);
  return p ? p.code : '';
};

/** A usable coordinate inside Thailand's bounding box (never invented). */
export const hasPoint = r => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude) &&
  r.latitude >= 5 && r.latitude <= 21 && r.longitude >= 97 && r.longitude <= 106;

// Thai has no letter case; Latin letters fold the same way in every locale (toLowerCase is ~10× faster over 74k rows).
const lower = v => String(v || '').toLowerCase();

/** Name shown for a registration whose only name is a natural person's (withheld at build time). */
export const PERSON_LABEL = 'ผู้ประกอบการบุคคลธรรมดา';
/** Name shown when the source has no name for the registration. */
export const NO_NAME = 'ไม่มีชื่อในแหล่ง';
/**
 * The registered name without the company form words (บริษัท … จำกัด (มหาชน), ห้างหุ้นส่วนจำกัด …, “(ประเทศไทย)”),
 * for map labels only — the full name stays the heading and the accessible name. The same rules as
 * scripts/build-data.py#short_name (tests/fixtures/short-names.json).
 */
const FORM_HEAD = /^(บริษัท|บจก\.?|บมจ\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|หจก\.?)\s*/;
const FORM_TAIL = /\s*(จำกัด\s*\(มหาชน\)|\(มหาชน\)|จำกัด\s*มหาชน|จำกัด|มหาชน)\s*$/;
const COUNTRY = /\s*\((ประเทศไทย|ประทศไทย|ไทยแลนด์|Thailand)\)\s*/gi;
const EN_TAIL = /\s*(co\.?,?\s*ltd\.?|company limited|limited|public company limited)\s*$/i;
export function shortNameOf(name) {
  const full = String(name || '').trim();
  let s = String(name || '').replace(/\s+/g, ' ').trim().replace(FORM_HEAD, '');
  for (let i = 0; i < 3; i++) s = s.replace(FORM_TAIL, '');
  s = s.replace(COUNTRY, ' ').trim().replace(EN_TAIL, '').trim();
  return s || full;
}

/** The heading of a registration: its name, else the operator label, else what the source lacks. */
export const titleOf = r => (r?.name || (r?.person ? PERSON_LABEL : r?.op || NO_NAME));
/** The line under a heading: the operator label when it differs from the name ('' when there is none). */
export const subName = r => (r?.name && r?.op ? r.op : '');

/**
 * Raw status of the Ministry of Industry's location export (กระทรวงอุตสาหกรรม, อก.; MOI in the sheet) → the words of a
 * chip. The status is the ministry's record, never a field check.
 */
export const MOI_TH = Object.freeze({
  'ดำเนินการ': 'อก. ระบุดำเนินการ', 'ได้รับใบอนุญาต': 'อก. ระบุได้รับใบอนุญาต', 'หยุดดำเนินการ': 'อก. ระบุหยุดดำเนินการ',
  'จำหน่าย': 'อก. ระบุจำหน่ายทะเบียน', '': 'ไม่พบใน อก.',
});
export const ADMIN_LIST = Object.freeze(['name', 'province']);

/**
 * Decode data/factories.json into row objects plus dictionaries.
 * `index` is the area index (js/areas.js#buildAreaIndex): every placed district code must exist there.
 */
export function decodeDataset(json, index) {
  if (!json?.cols || !Array.isArray(json.cols.key)) throw new Error('Invalid factory dataset');
  const c = json.cols, n = c.key.length;
  const families = (json.families || []).map((f, i) => ({...f, index: i, series: seriesOf(f.id), short: FAMILY_SHORT[f.id] || f.th}));
  const industries = (json.groups || []).map((g, i) => ({...g, index: i, familyRec: families[g.family] || families.at(-1)}));
  const types = json.types || [];
  const classes = (json.classes || []).map((x, i) => ({...x, index: i}));
  const subs = json.subs || [], dates = json.dates || [];
  // Competition rank by workers among the registrations with a figure (equal workers share a rank).
  const figures = c.workers.filter(Number.isFinite).sort((a, b) => b - a);
  const rankOf = new Map();
  figures.forEach((w, i) => { if (!rankOf.has(w)) rankOf.set(w, i + 1); });
  const provinceOf = new Map(PROVINCE_LIST.map(p => [p.code, p]));
  const rows = [];
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const area = c.district[i] >= 0 ? json.districts[c.district[i]] : '';
    const province = c.province[i] >= 0 ? json.provinces[c.province[i]] : '';
    if (area && !index?.byId.has(area)) { dropped++; continue; }
    const industry = industries[c.group[i]] || industries.at(-1);
    const family = industry?.familyRec || families.at(-1);
    const workers = Number.isFinite(c.workers[i]) && c.workers[i] >= 0 ? c.workers[i] : null;
    const lat = c.lat[i], lon = c.lon[i];
    const type = types[c.type[i]] || {code: '', th: ''};
    const name = c.name[i] || '';
    const short = name ? shortNameOf(name) : '';
    const row = {
      id: c.key[i], name, op: c.op[i] || '', person: c.person[i] === 1, short: short === name ? '' : short, index: i,
      group: family.index, groupId: family.id, series: family.series, family, industry, type,
      cls: classes[c.cls[i]] || null, fcls: c.fcls[i] || null,
      workers, size: sizeOf(workers), rank: workers == null ? null : rankOf.get(workers) || null,
      p90: workers != null && workers >= SCOPE.threshold, tie: workers === SCOPE.threshold,
      area, province, admin: ADMIN_LIST[c.admin[i]] || 'province', sub: c.sub[i] >= 0 ? subs[c.sub[i]] || '' : '',
      longitude: Number.isFinite(lon) ? lon : null, latitude: Number.isFinite(lat) ? lat : null,
      moi: json.moi?.[c.moi[i]] ?? '', moiOn: c.moiOn[i] >= 0 ? dates[c.moiOn[i]] || '' : '', basis: json.basis?.[c.basis[i]] || '', dup: c.dup[i] === 1,
      off: c.off?.[i] === 1,
    };
    row.title = titleOf(row);
    const a = area ? index.byId.get(area) : null;
    const p = province ? provinceOf.get(province) : null;
    row.haystack = lower([row.name, row.op, row.short, a?.name, a?.nameEn, p?.th, p?.en, family.th, industry?.th, type.th, type.code, row.sub, row.id]
      .filter(Boolean).join(' '));
    rows.push(row);
  }
  const scores = importanceScores(rows);
  rows.forEach((r, i) => { r.importance = scores[i]; });
  return {meta: json.meta || {}, rows, groups: families, families, industries, classes, types, sources: json.sources || [],
    figured: figures.length, estates: json.estates || [], dropped};
}

/**
 * Shared filter used by map, counters, charts, panel and table.
 * f = {search, group (industry family id), size, province, cls (functional class id)}.
 * Area selection and area focus are applied by the caller (row scopes, see app.js).
 */
export function filterRows(rows, f = {}) {
  // Every word of the search, anywhere in the registration's names, area, industry, type or FID.
  const terms = lower(f.search).trim().split(/\s+/).filter(Boolean);
  return rows.filter(r => {
    if (f.group && r.groupId !== f.group) return false;
    if (f.size && (f.size === 'p90' ? !r.p90 : r.size !== f.size)) return false;
    if (f.province && r.province !== f.province) return false;
    if (f.cls && r.cls?.id !== f.cls) return false;
    return terms.every(t => r.haystack.includes(t));
  });
}

/** Totals for a selection: registrations, workers, points, placement; `figured` = registrations with a worker figure. */
export function summarize(rows) {
  let points = 0, placed = 0, provinced = 0, workers = 0, big = 0, figured = 0, lens = 0, lensWorkers = 0;
  const areas = new Set(), provinces = new Set();
  for (const r of rows) {
    if (hasPoint(r)) points++;
    if (r.area) { placed++; areas.add(r.area); }
    if (r.province) { provinced++; provinces.add(r.province); }
    if (r.workers != null) { figured++; workers += r.workers; }
    if (r.workers >= 1000) big++;
    if (r.p90) { lens++; lensWorkers += r.workers; }
  }
  return {count: rows.length, workers, figured, points, placed, provinced, big, lens, lensWorkers, areas: areas.size, provinces: provinces.size};
}

/** Registrations and workers per industry family for a selection (every family listed, zero kept as a measured 0). */
export function mixOf(rows, families) {
  const byGroup = families.map(g => ({id: g.id, index: g.index, series: g.series, th: g.th, short: g.short, count: 0, workers: 0, figured: 0}));
  for (const r of rows) { const g = byGroup[r.group]; if (!g) continue; g.count++; if (r.workers != null) { g.figured++; g.workers += r.workers; } }
  return {byGroup};
}

/** Registrations and workers per worker band, then the registrations without a figure (`none`). */
export function sizeMixOf(rows) {
  const bands = [...SIZE_BANDS, NO_FIGURE].map(b => ({...b, count: 0, workers: 0}));
  const by = new Map(bands.map(b => [b.id, b]));
  for (const r of rows) { const b = by.get(r.size); if (b) { b.count++; b.workers += r.workers || 0; } }
  return {bands};
}

/** The 95+ lens of a selection: its registrations and workers, with the selection's own totals as the bases. */
export function lensOf(rows) {
  let count = 0, workers = 0, total = 0;
  for (const r of rows) { if (r.workers != null) total += r.workers; if (r.p90) { count++; workers += r.workers; } }
  return {count, workers, base: {count: rows.length, workers: total}};
}

/** Registrations and workers per functional class (ผลิต · บริการ · อื่น ๆ · รอตรวจหน้าที่) of the research's classification. */
export function classMixOf(rows, classes) {
  const out = classes.map(c => ({id: c.id, th: c.th, index: c.index, count: 0, workers: 0}));
  for (const r of rows) { const c = r.cls ? out[r.cls.index] : null; if (c) { c.count++; c.workers += r.workers || 0; } }
  return out;
}

/**
 * Industry families of a selection ranked by the measure, each with its share of the selection's total
 * (numerator and denominator kept for titles and accessible text).
 */
export function familyShares(rows, families, metric = 'workers', limit = 3) {
  const mix = mixOf(rows, families).byGroup;
  const base = rows.reduce((s, r) => s + rowValue(r, metric), 0);
  const val = g => (metric === 'count' ? g.count : g.workers);
  return {base, list: mix.filter(g => val(g) > 0).sort((a, b) => val(b) - val(a) || a.index - b.index).slice(0, limit)
    .map(g => ({...g, value: val(g), share: base ? (val(g) / base) * 100 : 0}))};
}

export const safeURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; }
  catch { return ''; }
};

/**
 * Production CityMETER deep links (route scheme observed in the production bundle; dataset code `factory` in
 * web-v3 src/modules/citymeter/datasets.ts, checked 2026-11-05). The link opens the same area with the factory layer.
 */
export const PRODUCTION = 'https://landometer.com/v3/citymeter';
export function productionLink({province = '', area = ''} = {}) {
  if (!province) return `${PRODUCTION}?d=factory`;
  if (area) return `${PRODUCTION}/${province}/D/${area}?d=factory`;
  return `${PRODUCTION}/${province}?d=factory`;
}
