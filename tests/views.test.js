import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.js';
import {buildOverview, buildAreaProfile, buildFactoryDetail, buildBuildingProfile, nearbyOf, listOrder, unplacedOf, NEARBY_RADIUS_M} from '../js/profile-model.js';
import {renderOverview, renderArea, renderBuilding, renderFactory, renderFilterChips, provenance, pct, meters} from '../js/panel.js';
import {summarizeAreaInsight, filterAreaRows} from '../js/area-insight.js';
import {summarize, productionLink, filterRows, unitWords, hasPoint, PERSON_LABEL} from '../js/model.js';
import {buildChartModel, areaMatrix, industryRanking} from '../js/chart-model.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText, productionHref} from '../js/breadcrumb.js';
import {CUES, CUE_PATHS, GROUP_SERIES, cueMarkup, seriesOf} from '../js/cues.js';
import {contextActions} from '../js/ask.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const ctxFor = (data, index, metric = 'workers', filtered = false) => ({meta: data.meta, unit: unitWords(metric), index, sources: data.sources, filtered});
/** บริษัท ซีเกทเทคโนโลยี (ประเทศไทย) จำกัด (อำเภอเมืองสมุทรปราการ, in the Aha focus): a registration with a source point. */
const FACTORY = '00110800125327';
/** บริษัท ชำนิเฟอร์นิเจอร์ จำกัด: registered in เขตบางขุนเทียน, its source point lies in another เขต — withheld. */
const OFF_POINT = '10100017125556';
const contextOf = data => ({registry: data.registry, classes: data.classes, estates: data.estates, allRows: data.rows});

function views(metric = 'workers') {
  const {data, index} = load();
  const rows = data.rows, ctx = ctxFor(data, index, metric), context = contextOf(data);
  const insight = summarizeAreaInsight(rows, index, {metric, families: data.families});
  const factory = rows.find(r => r.id === FACTORY);
  return {
    overview: renderOverview({insight, summary: summarize(filterAreaRows(rows, new Set(insight.areaIds))), overview: buildOverview(rows, index, {families: data.families, metric, ...context}),
      focusMode: 'auto', provinces: [], unknownProvince: 0, province: '', ctx}),
    province: renderOverview({insight: summarizeAreaInsight(filterRows(rows, {province: 'SPK'}), index, {metric, families: data.families}), summary: summarize(rows),
      overview: buildOverview(filterRows(rows, {province: 'SPK'}), index, {province: 'SPK', families: data.families, metric, ...context}), focusMode: 'auto', province: 'SPK', ctx}),
    area: renderArea(buildAreaProfile(rows, '1103', index, data.families, {metric, ...context}), () => '#000', ctx),
    factory: renderFactory(buildFactoryDetail(factory, {scopeRows: rows, allRows: rows, index, families: data.families}), ctx),
    person: renderFactory(buildFactoryDetail(rows.find(r => r.person), {scopeRows: rows, allRows: rows, index, families: data.families}), ctx),
    building: renderBuilding(buildBuildingProfile({key: 'osm:1', kind: 'osm', rows: rows.filter(hasPoint).slice(0, 3), height: 24}, index, data.families), ctx),
  };
}

test('every panel view ends with one provenance line — dataset · source · date · boundary, then the method — and carries no caveat on screen', () => {
  for (const metric of ['workers', 'count']) {
    for (const [name, html] of Object.entries(views(metric))) {
      const t = text(html);
      for (const k of ['dataset', 'source', 'date', 'boundary']) assert.equal((html.match(new RegExp(`data-prov="${k}"`, 'g')) || []).length, 1, `${name}: ${k}`);
      assert.ok(t.includes('ชุดข้อมูล CityMETER Factory · โรงงาน 95+ คน'), `${name}: dataset and its scope`);
      assert.ok(/แหล่ง\s*จาก ทะเบียน กรอ\. นอกนิคมอุตสาหกรรม · อก\./.test(t), `${name}: source`);
      assert.ok(t.includes('ตรวจ 4 พ.ย. 2569'), `${name}: date`);
      assert.ok(/ขอบเขต \S/.test(t), `${name}: boundary`);
      assert.ok(html.includes('<span class="prov-part prov-method"><a href="DATA_METHOD.md"'), `${name}: the method link`);
      assert.equal((html.match(/class="hint panel-foot provenance"/g) || []).length, 1, `${name}: exactly one provenance line`);
      // Carried over from Hotel 0.3.1: “ไม่มี caveats เลย” — exactness comes from names, numerators, denominators and the provenance.
      assert.ok(!/ไม่ใช่|ยังไม่ได้ตรวจ|อาจเป็น|ไม่ได้แปลว่า|ยืนยันแล้ว|ค่าประมาณ|นับในยอดรวม/.test(t), `${name}: no caveat on screen — ${(t.match(/.{0,40}(ไม่ใช่|ยังไม่ได้ตรวจ|อาจเป็น|ไม่ได้แปลว่า|ยืนยันแล้ว|ค่าประมาณ|นับในยอดรวม).{0,40}/) || [''])[0]}`);
      assert.ok(!/ตั้งอยู่ใน|ยอดขาย|ส่วนแบ่งตลาด|การจ้างงานของ|ตลาดแรงงาน|รายได้|ความหนาแน่น|กำลังการผลิต/.test(t), `${name}: no located-inside, sales, market, employment, labour-market, revenue, density or capacity claim`);
      assert.ok(!/ที่พัก|ห้องพัก|โรงแรม|สถานี/.test(t), `${name}: no hotel words`);
    }
  }
});

test('first screen (workers): the Aha with numerator and denominator, the industries of the focus as bars with both bases, the outside finding', () => {
  const o = text(views().overview);
  assert.ok(o.includes('74% ของคนงานโรงงาน 95+ คนในสมุทรปราการ อยู่ใน 3 อำเภอนี้'), o.slice(0, 300));
  assert.ok(o.includes('เมืองสมุทรปราการ · บางพลี · พระประแดง') && o.includes('220,980 จาก 299,796 คน'), 'the share of the province’s whole total');
  assert.ok(o.includes('อุตสาหกรรมหลัก ยานพาหนะ 20% ยานพาหนะและเครื่องจักร: 43,591 จาก 220,980 คน ใน 3 อำเภอนี้'), 'each share with its numerator and denominator in the accessible text');
  assert.ok(o.includes('อันดับ 1 นอกสมุทรปราการ: อำเภอเมืองสมุทรสาคร สมุทรสาคร 169,944 คน · มากกว่าทุกอำเภอของสมุทรปราการ · อาหาร 55%'));
  assert.ok(o.includes('ทะเบียนโรงงานทุกขนาด 74,047 ทะเบียน ผลิต 54,229 บริการ 5,122 อื่น ๆ 6,967 รอตรวจหน้าที่ 7,729'), 'the registry context, by function');
  assert.ok(o.includes('คนงาน 95 คนขึ้นไป 7,175 ทะเบียน · 10% (7,175 จาก 74,047 ทะเบียนทุกขนาด)'), 'this product within the registry: numerator and denominator');
  assert.ok(o.includes('นิคม สวน เขตอุตสาหกรรม 106 แห่ง · 21 จังหวัด นิคมอุตสาหกรรม 84 สวนอุตสาหกรรม 16 เขตอุตสาหกรรม 6'));
  assert.ok(o.includes('95–199 คน 3,998') && o.includes('5,000 คนขึ้นไป 24'), 'size bands in registrations');
  const c = text(views('count').overview);
  assert.ok(c.includes('72% ของโรงงาน 95+ คนในสมุทรปราการ อยู่ใน 3 อำเภอนี้') && c.includes('714 จาก 997 ทะเบียน'));
  const p = views().province;
  assert.ok(text(p).includes('นิคม สวน เขตอุตสาหกรรม 6 แห่ง นิคมอุตสาหกรรม 6'), 'a province lists its industrial areas');
  assert.ok(text(p).includes('นิคมอุตสาหกรรมบางปู') && /href="https:\/\/www\.industrial-estates\.ieat\.go\.th\/[^"]+"[^>]*>หน้า กนอ\.</.test(p), 'each with its public page');
  assert.ok(!/<svg[^>]*estate|data-estate-geometry/.test(p), 'a list, never a drawn boundary');
});

test('district and factory panels: ranks, shares, registry context, the nearby set and the source details', () => {
  const v = views();
  const a = text(v.area);
  assert.ok(a.includes('อำเภอบางพลี') && a.includes('อันดับ 6 จาก 553 ทั่วประเทศ · 2 จาก 6 ในสมุทรปราการ'), a.slice(0, 240));
  assert.ok(a.includes('27% ของสมุทรปราการ 79,620 จาก 299,796 คนของสมุทรปราการ'), 'the share tile carries numerator and denominator');
  assert.ok(a.replace(/\u200B/g, '').includes('2,114 ทะเบียน ทุกขนาด คนงาน 95 คนขึ้นไป 287 จาก 2,114 ทะเบียนทุกขนาดในอำเภอบางพลี'), 'registry tile with its detail');
  assert.ok(a.includes('1,000 คนขึ้นไป 7 ทะเบียน') && a.includes('ดูทั้งหมด 287 ทะเบียน'));
  const f = text(v.factory);
  assert.ok(f.includes('บริษัท ซีเกทเทคโนโลยี (ประเทศไทย) จำกัด') && f.includes('6,486 คน · 5,000+') && f.includes('อันดับ 12 จาก 7,175'), f.slice(0, 300));
  assert.ok(f.includes('อำเภอเมืองสมุทรปราการ · สมุทรปราการ') && f.includes('จำพวก 3') && f.includes('อก. ระบุดำเนินการ'));
  assert.ok(f.includes('ประเภท 06900') && f.includes('สถานะ อก. ดำเนินการ · 3 พ.ย. 2569') && f.includes('พิกัด 13.62418, 100.63312 จุดจากแหล่ง'));
  assert.ok(f.includes('ในอำเภอเมืองสมุทรปราการอีก 248 ทะเบียน · 79,435 คน'));
  assert.ok(f.includes('ทะเบียนจำพวก 3') && v.factory.includes('href="https://diw-dataset.diw.go.th/th/dataset/factype3"'), 'the public DIW dataset page of its class');
  assert.ok(f.includes('โรงงานใกล้เคียง 0 ทะเบียน') && f.includes('3,243–12,972 คน') && f.includes('≤ 3 กม.'), 'the nearby rule as chips');
  assert.ok(f.includes('โรงงาน 95+ คนทุกอุตสาหกรรมรอบ 3 กม. 18 ทะเบียน · 6,149 คน'));
  assert.ok(v.factory.includes('pic-distance'), 'the straight-line radius carries the distance pictogram');
  assert.deepEqual([meters(84), meters(1291), meters(3000)], ['80 ม.', '1.3 กม.', '3 กม.']);
});

test('privacy: a registration known only by a natural person’s name reads “ผู้ประกอบการบุคคลธรรมดา”, no point and no name search', () => {
  const v = views();
  const p = text(v.person);
  assert.ok(p.includes(PERSON_LABEL) && p.includes('ไม่เผยแพร่พิกัด') && p.includes('พิกัด ไม่เผยแพร่'));
  assert.ok(!v.person.includes('google.com/maps/search/?api=1&amp;query=%E0%B8%9C%E0%B8%B9%E0%B9%89'), 'never searched by a label');
  const {data} = load();
  const r = data.rows.find(x => x.person);
  const acts = contextActions({kind: 'factory', row: r, area: {place: 'อำเภอบำเหน็จณรงค์', province: 'ชัยภูมิ'}});
  assert.equal(acts.length, 0, 'no name-based action for a person');
});

test('nearby set: same industry family, workers within ½–2×, straight line ≤ 3 km, nearest first; never itself; no point → none', () => {
  const {data} = load();
  const pointed = data.rows.filter(hasPoint);
  const busy = pointed.map(r => ({r, n: nearbyOf(r, data.rows)})).find(x => x.n.rows.length >= 3);
  assert.ok(busy, 'some registration has a nearby set');
  const {r: h, n: c} = busy;
  assert.equal(c.radius, NEARBY_RADIUS_M);
  assert.deepEqual(c.rule, {group: h.group, min: Math.ceil(h.workers / 2), max: h.workers * 2});
  assert.ok(c.rows.every(x => x.row !== h && x.row.group === h.group && x.row.workers >= h.workers / 2 && x.row.workers <= h.workers * 2 && x.m <= 3000));
  for (let i = 1; i < c.rows.length; i++) assert.ok(c.rows[i - 1].m <= c.rows[i].m);
  assert.equal(nearbyOf({...h, latitude: null, longitude: null}, data.rows), null);
});

test('missing stays missing: no point says so; an empty district is a measured 0 with where the filters match', () => {
  const {data, index} = load();
  const ctx = ctxFor(data, index);
  const off = data.rows.find(r => r.id === OFF_POINT);
  assert.ok(off.off && !hasPoint(off), 'a source point outside its own district is withheld');
  const o = text(renderFactory(buildFactoryDetail(off, {scopeRows: data.rows, allRows: data.rows, index, families: data.families}), ctx));
  assert.ok(o.includes('ไม่แสดงพิกัด') && o.includes('พิกัด จุดในแหล่งอยู่นอกเขตบางขุนเทียน') && o.includes('เขตบางขุนเทียน · กรุงเทพมหานคร'), 'it stays in its own district');
  const noPoint = data.rows.find(r => !hasPoint(r) && r.area && !r.person);
  const t = text(renderFactory(buildFactoryDetail(noPoint, {scopeRows: data.rows, allRows: data.rows, index, families: data.families}), ctx));
  assert.ok(t.includes('ไม่มีพิกัด') && !t.includes('โรงงานใกล้เคียง'), 'no point: no nearby set (the chip says why)');
  const u = unplacedOf(data.rows);
  assert.deepEqual([u.noArea, u.noProvince], [0, 0]);
  const empty = buildAreaProfile([], '1039', index, data.families, contextOf(data));
  assert.equal(empty.coverageState, 'measured_zero');
  const e = text(renderArea(empty, () => '#000', ctx));
  assert.ok(e.includes('ไม่พบโรงงาน 95+ คนในเขตวัฒนา'), e.slice(0, 300));
});

test('charts: districts by the measure, district × industry matrix with equal cells, DIW groups by the measure', () => {
  const {data, index} = load();
  const m = buildChartModel(data.rows, index, data.families);
  assert.equal(m.areas.length, 20);
  assert.equal(m.totalAreas, 553);
  assert.equal(m.unplacedValue, 0);
  for (let i = 1; i < m.areas.length; i++) assert.ok(m.areas[i - 1].value >= m.areas[i].value);
  const mx = areaMatrix(m);
  assert.equal(mx.cells.length, 12 * data.families.length);
  for (const a of mx.areas) assert.equal(mx.cells.filter(c => c.areaId === a.id).reduce((s, c) => s + c.value, 0), a.value, 'cells add up to the district');
  assert.ok(!mx.cells.some(c => 'unknown' in c), 'every registration has workers: no unknown cell');
  const counts = buildChartModel(data.rows, index, data.families, {metric: 'count'});
  assert.equal(counts.areas[0].name, 'เมืองสมุทรสาคร');
  const ir = industryRanking(data.rows);
  assert.equal(ir.total, 22);
  assert.deepEqual(ir.industries.slice(0, 2).map(c => [c.industry.th, c.workers]), [['อุตสาหกรรมอาหาร', 481408], ['ผลิตเครื่องใช้ไฟฟ้าและอุปกรณ์', 307963]]);
});

test('breadcrumb follows production: ประเทศไทย › จังหวัด › เขต/อำเภอ with /D/ deep links and the factory dataset', () => {
  const {index} = load();
  const area = index.byId.get('1103');
  const crumbs = buildBreadcrumb({province: 'SPK', area});
  assert.equal(breadcrumbText(crumbs), 'ประเทศไทย › สมุทรปราการ › อำเภอบางพลี');
  assert.equal(crumbs.at(-1).current, true);
  assert.equal(crumbs[2].href, 'https://landometer.com/v3/citymeter/SPK/D/1103?d=factory');
  assert.equal(productionHref(crumbs), 'https://landometer.com/v3/citymeter/SPK/D/1103?d=factory');
  assert.ok(renderBreadcrumb(crumbs).includes('aria-current="location"'));
  assert.equal(productionLink(), 'https://landometer.com/v3/citymeter?d=factory');
  assert.equal(productionLink({province: 'SPK'}), 'https://landometer.com/v3/citymeter/SPK?d=factory');
});

test('industry families bind to LDS series by stable id with the series shape cue', () => {
  const {data} = load();
  assert.deepEqual(CUES, ['circle', 'square', 'triangle', 'diamond', 'cross', 'star', 'hexagon', 'ring', 'dash', 'plus']);
  assert.deepEqual(GROUP_SERIES, {food: 1, electrical: 2, vehicle: 3, textile: 4, metal: 5, polymer: 6, wood: 7, mineral: 8, other: 9, plant: 10});
  assert.equal(new Set(Object.values(GROUP_SERIES)).size, 10, 'one series per family');
  for (const g of data.families) assert.equal(g.series, seriesOf(g.id));
  for (const name of CUES) assert.ok(CUE_PATHS[name].startsWith('M'));
  assert.match(cueMarkup(2), /class="cue-shape category-2".*data-cue="square".*aria-hidden="true"/);
});

test('lists put the most workers first, then name — deterministic', () => {
  const {data} = load();
  const rows = data.rows.filter(r => r.area === '1103').sort(listOrder);
  assert.deepEqual([...rows].reverse().sort(listOrder).map(r => r.id), rows.map(r => r.id), 'deterministic');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].workers >= rows[i].workers);
});

test('Google actions: public names and points only, https, the question of the view; Street View only with a point', () => {
  const {data} = load();
  const h = data.rows.find(r => r.id === FACTORY);
  const acts = contextActions({kind: 'factory', row: h, area: {place: 'อำเภอเมืองสมุทรปราการ', province: 'สมุทรปราการ'}, point: {lat: h.latitude, lon: h.longitude, role: 'point'}});
  assert.deepEqual(acts.map(a => a.id), ['ai', 'maps', 'streetview']);
  assert.ok(acts.every(a => a.href.startsWith('https://www.google.com/')));
  assert.ok(decodeURIComponent(acts[0].href).includes('ยังเปิดดำเนินการอยู่ไหม'));
  const all = [acts, contextActions({kind: 'area', area: {place: 'อำเภอบางพลี', province: 'สมุทรปราการ'}}),
    contextActions({kind: 'overview', province: 'สมุทรปราการ'}), contextActions({kind: 'building', rows: [h], area: {place: 'อำเภอเมืองสมุทรปราการ', province: 'สมุทรปราการ'}})];
  for (const list of all) {
    const ai = list.find(a => a.id === 'ai');
    assert.ok(ai, 'every view asks Google AI');
    assert.match(ai.href, /^https:\/\/www\.google\.com\/search\?q=[^&]+$/, 'a plain search, the question only');
    assert.ok(!/udm=/.test(ai.href), 'never straight into AI Mode');
  }
  assert.ok(!acts.some(a => a.href.includes(h.id)), 'no registration number leaves the page');
  assert.deepEqual(contextActions({kind: 'area', area: {place: 'อำเภอบางพลี', province: 'สมุทรปราการ'}}).map(a => a.id), ['ai', 'maps']);
});

test('filter chips escape user text, name the filters and offer one clear-all', () => {
  const html = renderFilterChips({search: '<b>ซัมมิท</b>', group: 'vehicle', size: 'w4', province: 'SPK', cls: 'manufacturing'},
    {group: {vehicle: 'ยานพาหนะและเครื่องจักร'}, size: {w4: '1,000–1,999 คน'}, province: {SPK: 'สมุทรปราการ'}, cls: {manufacturing: 'ผลิต'}});
  assert.ok(!html.includes('<b>'));
  for (const w of ['ยานพาหนะและเครื่องจักร', '1,000–1,999 คน', 'สมุทรปราการ', 'ผลิต']) assert.ok(text(html).includes(w), w);
  assert.equal((html.match(/data-id="all"/g) || []).length, 1);
});

test('shares print whole percentages; a non-zero part never prints as 0%', () => {
  assert.equal(pct(220980, 299796), '74%');
  assert.equal(pct(1, 352), '<1%');
  assert.equal(pct(0, 10), '0%');
  assert.equal(pct(3, 0), '—');
  assert.ok(text(provenance({meta: {checkedOn: '2026-11-04', context: {estates: {checkedOn: '2026-10-26'}}}, unit: unitWords('workers')}, 'x', {estates: true})).includes('ทะเบียนนิคมและสวนอุตสาหกรรม (งานวิจัย 26 ต.ค. 2569)'));
});
