import test from 'node:test';
import assert from 'node:assert/strict';
import {load, readJSON, frameFiles, sha256} from './helpers.js';
import {hasPoint, filterRows, summarize, rowValue, unitWords, sizeOf, pinSizeOf, SIZE_BANDS, SIZE_FILTERS, NO_FIGURE, PERSON_LABEL, SCOPE, lensOf, classMixOf} from '../js/model.js';

// A natural person's name as the build screens it (scripts/build-data.py#PERSON).
const PERSON = /^\s*(?:(?:นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|ว่าที่\s*ร\.ต\.)\s*(?=[ก-ฮ])|(?:Mr|Mrs|Miss|Ms)\.?\s)/i;

test('factories.json decodes to every FID of 02_FACTORIES, nothing dropped, FIDs unique', () => {
  const {raw, data} = load();
  assert.equal(data.dropped, 0);
  assert.equal(data.rows.length, raw.meta.rows);
  assert.equal(data.rows.length, raw.meta.counts.rows);
  assert.equal(new Set(data.rows.map(r => r.id)).size, data.rows.length);
  assert.ok(data.rows.every(r => /^\d{14}$/.test(r.id)), 'a 14-digit DIW registration number (FID)');
  assert.equal(raw.meta.registryId, 'research.TH.factory');
  assert.deepEqual(raw.meta.tab, {name: '02_FACTORIES'});
  assert.deepEqual(raw.meta.lensTab, {name: '18_WORKERS_P90', gid: 2026110418});
  assert.equal(data.rows.length, raw.meta.scope.core, 'every core registration of the research master');
  assert.equal(raw.meta.productionCode, 'factory');
  assert.match(raw.meta.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
  for (const v of Object.values(raw.meta.inputs)) assert.match(v.sha256, /^[a-f0-9]{64}$/);
});

test('measure contract: workers are the DIW-reported figures (null when the source has none, never 0 or estimated); registrations count once', () => {
  const {raw, data} = load();
  const c = raw.meta.counts;
  assert.equal(SCOPE.threshold, raw.meta.scope.threshold);
  assert.ok(data.rows.every(r => r.workers === null || (Number.isInteger(r.workers) && r.workers >= 0)), 'a figure is a whole number ≥ 0, or null');
  const figured = data.rows.filter(r => r.workers !== null);
  assert.equal(figured.length, c.withWorkers);
  assert.equal(data.figured, c.withWorkers);
  assert.equal(data.rows.length - figured.length, c.sizes.none, 'registrations without a figure');
  assert.equal(figured.filter(r => r.workers === 0).length, c.zeroWorkers, 'a 0 is the source’s own 0');
  assert.ok(data.rows.filter(r => r.workers === null).every(r => r.basis !== 'อยู่ในทะเบียน กรอ. ชุด 1 ต.ค. 2569' || r.size === NO_FIGURE.id));
  const s = summarize(data.rows);
  assert.equal(s.workers, c.workers);
  assert.equal(s.figured, c.withWorkers);
  assert.equal(s.count, data.rows.length);
  assert.equal(rowValue({workers: 120}, 'workers'), 120);
  assert.equal(rowValue({workers: 120}, 'count'), 1);
  assert.equal(rowValue({workers: null}, 'workers'), 0, 'a missing figure adds nothing (never estimated)');
  assert.deepEqual([unitWords('workers').one, unitWords('count').one, unitWords('').one], ['คน', 'ทะเบียน', 'คน']);
  assert.deepEqual([0, 9, 10, 49, 50, 94, 95, 199, 200, 999, 1000, 4999, 5000].map(sizeOf), ['s1', 's1', 's2', 's2', 's3', 's3', 'w1', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
  assert.equal(sizeOf(null), NO_FIGURE.id);
  assert.deepEqual([95, 399, 400, 1999, 2000].map(pinSizeOf), [0, 0, 1, 1, 2]);
  assert.equal(SIZE_BANDS.length, 9);
  for (const b of [...SIZE_BANDS, NO_FIGURE]) assert.equal(data.rows.filter(r => r.size === b.id).length, c.sizes[b.id], b.id);
  assert.deepEqual(SIZE_FILTERS.map(b => b.id), ['p90', ...SIZE_BANDS.map(b => b.id), 'none']);
  assert.equal(c.estateContext.outside_estate_source_scope_DIW_catalog, c.basis.DIW2026_listed + c.basis.DIW2026_listed_and_MOI_operating, 'the DIW catalogue: outside IEAT estates');
  assert.equal(c.estateContext.unknown_estate_context, c.basis.MOI_operating_only, 'MOI-only registrations: estate context unknown');
});

test('the 95+ lens = the FIDs of 18_WORKERS_P90: every registration at or above the P90 of the figures (PERCENTILE.INC 0.9 = 95)', () => {
  const {raw, data} = load();
  const c = raw.meta.counts;
  const v = data.rows.map(r => r.workers).filter(w => w !== null).sort((a, b) => a - b);
  const h = (v.length - 1) * 0.9, lo = Math.floor(h);
  assert.equal(v[lo] + (h - lo) * (v[Math.min(lo + 1, v.length - 1)] - v[lo]), SCOPE.threshold);
  const lens = data.rows.filter(r => r.p90);
  assert.equal(lens.length, c.p90);
  assert.equal(c.p90Parity.workers, c.p90, 'every figure of 18_WORKERS_P90 equals the DIW export');
  assert.ok(lens.every(r => r.workers >= SCOPE.threshold) && data.rows.filter(r => !r.p90).every(r => r.workers === null || r.workers < SCOPE.threshold));
  assert.equal(lens.reduce((s, r) => s + r.workers, 0), c.p90Workers);
  assert.equal(data.rows.filter(r => r.tie).length, c.ties, 'every tie at the threshold is in the lens');
  assert.equal(filterRows(data.rows, {size: 'p90'}).length, c.p90);
  assert.equal(filterRows(data.rows, {size: 'none'}).length, c.sizes.none);
  const l = lensOf(data.rows);
  assert.deepEqual([l.count, l.workers, l.base.count, l.base.workers], [c.p90, c.p90Workers, c.rows, c.workers]);
});

test('membership: a placed row sits in an existing production district of its own province; the rest stop at province', () => {
  const {raw, data, index} = load();
  const by = {};
  for (const r of data.rows) {
    by[r.admin] = (by[r.admin] || 0) + 1;
    if (r.area) {
      const a = index.byId.get(r.area);
      assert.ok(a, r.id);
      assert.equal(a.province, r.province, `${r.id} district in its own province`);
      assert.equal(r.admin, 'name');
    } else assert.equal(r.admin, 'province', r.id);
  }
  for (const k of ['name', 'province']) assert.equal(by[k] || 0, raw.meta.counts.admin[k] || 0, k);
});

test('points are source points screened inside Thailand and inside the registration’s own district; never invented, never a natural person’s', async () => {
  const {raw, data, index} = load();
  const pts = data.rows.filter(hasPoint);
  assert.equal(pts.length, raw.meta.counts.points);
  const withheld = Object.values(raw.meta.checks.pointWithheld).reduce((s, n) => s + n, 0);
  assert.equal(data.rows.filter(r => r.off).length, withheld);
  assert.ok(data.rows.filter(r => r.off).every(r => !hasPoint(r)), 'a withheld point is not drawn');
  const {areaLocator} = await import('../js/areas.js');
  load({frames: [...new Set(pts.map(r => r.province))]});
  const locate = areaLocator(index);
  for (const r of pts) {
    const at = locate([r.longitude, r.latitude]);
    if (r.area) assert.equal(at, r.area, `${r.id}: the point lies in its own district`);
    else assert.equal(index.byId.get(at)?.province, r.province, `${r.id}: a province-only registration's point lies in its own province`);
  }
  assert.ok(data.rows.filter(r => !hasPoint(r)).every(r => r.latitude === null && r.longitude === null));
  assert.ok(data.rows.filter(r => r.person).every(r => !hasPoint(r)), 'a person-only registration has no published point');
  assert.ok(pts.every(r => Math.round(r.latitude * 1e5) / 1e5 === r.latitude && Math.round(r.longitude * 1e5) / 1e5 === r.longitude), '5 decimals');
});

test('privacy: no natural person’s name is published; such a registration reads “ผู้ประกอบการบุคคลธรรมดา”', () => {
  const {raw, data} = load();
  const persons = data.rows.filter(r => r.person);
  assert.equal(persons.length, raw.meta.counts.persons);
  assert.ok(persons.every(r => r.name === '' && r.title === PERSON_LABEL));
  for (const r of data.rows) {
    assert.ok(!PERSON.test(r.name), `${r.id}: name`);
    assert.ok(!PERSON.test(r.op), `${r.id}: operator label`);
  }
  for (const k of ['address', 'operator_name_moi_raw', 'historical_operator_name_2025', 'human_notes', 'names and points of natural-person operators'])
    assert.ok(raw.meta.excludedFields.includes(k), k);
});

test('industry: every registration has its official DIW group and one of ten families; the family filter partitions the rows', () => {
  const {data} = load();
  assert.equal(data.families.length, 10);
  assert.ok(data.rows.every(r => r.industry && r.family && r.industry.familyRec === r.family && data.families[r.group] === r.family));
  assert.equal(data.families.reduce((s, f) => s + filterRows(data.rows, {group: f.id}).length, 0), data.rows.length);
  assert.equal(data.classes.reduce((s, c) => s + filterRows(data.rows, {cls: c.id}).length, 0), data.rows.length);
  assert.ok(data.rows.every(r => (r.basis.startsWith('อยู่ในทะเบียน กรอ.') ? r.fcls === 2 || r.fcls === 3 : r.fcls === null)),
    'DIW class 2 or 3 (the open-data exports read); the MOI-only registrations have no DIW class');
  const figured = data.rows.filter(r => r.workers !== null);
  assert.ok(figured.every(r => r.rank >= 1 && r.rank <= figured.length) && data.rows.filter(r => r.workers === null).every(r => r.rank === null));
  const byRank = [...figured].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) assert.ok(byRank[i - 1].workers >= byRank[i].workers, 'rank follows workers');
  assert.ok(byRank.every(r => r.rank === 1 + figured.filter(x => x.workers > r.workers).length || r.rank === byRank.findIndex(x => x.workers === r.workers) + 1), 'competition rank');
});

test('functional classes: every registration has one, read from the same rows (no separate registry context)', () => {
  const {raw, data} = load();
  const mix = classMixOf(data.rows, data.classes);
  assert.deepEqual(Object.fromEntries(mix.map(c => [c.id, c.count])), Object.fromEntries(data.classes.map(c => [c.id, raw.meta.counts.classes[c.id] || 0])));
  assert.equal(mix.reduce((s, c) => s + c.count, 0), data.rows.length);
  assert.equal(raw.registry, undefined, 'no registry block: the rows are the registry');
});

test('industrial areas: the register as a list (names, type, province, public page) — no geometry is published', () => {
  const {raw, data} = load();
  assert.equal(data.estates.length, raw.meta.counts.estates);
  assert.ok(data.estates.every(e => e.name && e.type && e.province && /^https:\/\//.test(e.url)));
  assert.deepEqual(Object.keys(data.estates[0]).sort(), ['checkedOn', 'id', 'ieat', 'name', 'nameEn', 'province', 'type', 'url']);
  assert.ok(!/Polygon|coordinates|geometry"/.test(JSON.stringify(raw.estates)));
  assert.match(raw.meta.context.estates.geometry, /^not published/);
});

test('publication hygiene: no address, phone, raw operator field or researcher text; source links are public https', () => {
  const {raw} = load();
  const text = JSON.stringify(raw);
  for (const k of ['address', 'phone', 'notes', 'latitude', 'longitude', 'logo']) assert.ok(!Object.keys(raw.cols).includes(k), k);
  assert.ok(!/(docs|drive)\.google\.com/.test(text), 'no Google document link');
  assert.ok(!/google\.[a-z.]+\/maps|maps\.app\.goo\.gl/.test(text), 'no map links');
  assert.ok(!/landometer\.com\/api\//.test(text), 'no internal API link');
  assert.ok(raw.sources.every(s => /^https:\/\//.test(s.url)), 'source links are https');
  assert.ok(!/\b0\d{1,2}[- ]?\d{3}[- ]?\d{4}\b/.test(text), 'no telephone-like numbers');
  assert.ok(!/\/Users\/|\.codex|chatgpt/i.test(text), 'no local paths of the research workspace');
});

test('boundaries: 928 districts and 77 provinces from production; per-province frames match the index; receipts bound by hash', () => {
  const {index, indexJSON, provincesGeo} = load();
  assert.equal(index.areas.length, 928);
  assert.equal(index.provinces.length, 77);
  assert.equal(provincesGeo.features.length, 77);
  assert.ok(index.areas.every(a => a.km2 > 0 && Array.isArray(a.label) && Array.isArray(a.bbox)), 'production area, label and bbox for every district');
  const files = frameFiles();
  assert.equal(files.length, 77);
  let areas = 0;
  for (const f of files) {
    const code = f.replace('.json', ''), frame = readJSON(`data/frames/${f}`), p = index.provinceById.get(code);
    assert.ok(p, code);
    assert.equal(frame.areas.features.length, p.areaTotal, `${code} districts`);
    for (const ft of frame.areas.features) assert.equal(index.byId.get(String(ft.id ?? ft.properties.id))?.province, code);
    areas += frame.areas.features.length;
  }
  assert.equal(areas, 928);
  const receipts = readJSON('data/boundary-receipts.json');
  assert.equal(Object.keys(receipts.base).length, 78, 'the country list + 77 province base-info responses');
  assert.equal(indexJSON.metadata.receipts, 78);
  for (const r of Object.values(receipts.base)) {
    assert.match(r.sha256, /^[a-f0-9]{64}$/);
    assert.match(r.url, /^https:\/\/landometer\.com\/api\/v2\/citymeter-v3\/base\/info\//);
    assert.equal(r.status, 200);
  }
  const py = v => (Array.isArray(v) ? `[${v.map(py).join(', ')}]` : v && typeof v === 'object'
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}: ${py(v[k])}`).join(', ')}}` : JSON.stringify(v));
  assert.equal(sha256(Buffer.from(py(receipts.base))), receipts.baseSha256);
  assert.equal(indexJSON.metadata.receiptsSha256, receipts.baseSha256);
});
