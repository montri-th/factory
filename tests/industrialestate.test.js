/**
 * CityMETER Industrial Estate (industrialestate/, release 1.0.0): the data contract industrial-estate-demo/1.0.0 of the
 * registry, the page hygiene, the shared shell bytes, one provenance line per view, privacy and the logo files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT, readJSON} from './helpers.js';
import {decodeData, summarize, ahaOf, estateRamp, developerGroups, filterEstates, shortLabel, logoCaption, directoryRows, aroundRows, partialOutline} from '../industrialestate/js/model.js';
import {renderOverview, renderProvince, renderEstate, renderDirectory} from '../industrialestate/js/panel.js';
import {shortName, placeChips} from '../industrialestate/js/labels.js';

const DIR = join(ROOT, 'industrialestate');
const read = p => readFileSync(join(DIR, p), 'utf8');
const json = p => JSON.parse(read(p));
const sha256 = b => createHash('sha256').update(b).digest('hex');
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const raw = json('data/estates.json');
const index = json('data/area-index.json');
const model = () => decodeData(raw, index);

test('data contract industrial-estate-demo/1.0.0: 106 records, 64 outlines from 66 parts and 3 context areas (R9), 6,811 listings in 56 estates, 50 no data, verified no data', () => {
  const {meta, estates} = model();
  assert.equal(meta.contract, 'industrial-estate-demo/1.0.0');
  assert.equal(meta.registryId, 'research.TH.industrial_estates');
  assert.equal(estates.length, 106);
  assert.deepEqual(meta.counts.types, {estate: 84, park: 16, zone: 6});
  assert.equal(new Set(estates.map(e => e.province)).size, 21);
  assert.equal(estates.filter(e => e.outline).length, 64);
  assert.equal(estates.filter(e => e.context).length, 3);
  const shapes = json('data/boundaries.geojson').features;
  assert.deepEqual([shapes.filter(f => !f.properties.ctx).length, shapes.filter(f => f.properties.ctx).length], [66, 3]);
  const listed = estates.filter(e => e.listed);
  assert.equal(listed.length, 56);
  assert.equal(listed.reduce((s, e) => s + e.dir.n, 0), 6811);
  for (const e of estates.filter(x => !x.listed)) assert.equal(e.dir.n, null, `${e.id}: no listing is no data, never 0`);
  assert.equal(meta.counts.verifiedFactories, null);
  for (const e of estates) if (!e.outline) assert.ok(['context', 'hold', 'scope', 'missing', 'license'].includes(e.boundary.state), e.id);
  assert.deepEqual(meta.counts.boundaryStates, {shown: 64, hold: 25, scope: 0, missing: 9, license: 5, context: 3});
  assert.match(json('data/boundaries.geojson').attribution, /OpenStreetMap contributors · ODbL 1\.0/);
});

test('the around-estate set is the one CityMETER Factory reads (same ids, same order)', () => {
  const around = json('data/around.json');
  const context = readJSON('data/estate-context.json');
  assert.deepEqual(Object.keys(around.estates).sort(), Object.keys(context.around).sort());
  for (const [id, list] of Object.entries(around.estates)) {
    assert.deepEqual(aroundRows(around, id).map(r => r.fid), context.around[id], id);
    const e = raw.estates.find(x => x.id === id);
    assert.equal(e.around.n, list.length, `${id}: count`);
  }
  assert.match(around.meta.rule, /never membership/);
});

test('first finding: the share of records in the three EEC provinces (a composition, no ranking)', () => {
  const {estates} = model();
  const aha = ahaOf(estates);
  assert.equal(aha.n, 62);
  assert.equal(aha.total, 106);
  assert.deepEqual(aha.parts.map(p => [p.code, p.n]), [['CCO', 8], ['CBI', 31], ['RYG', 23]]);
  const ramp = estateRamp(estates);
  assert.equal(ramp.noData, estates.filter(e => e.outline && !e.listed).length);
  assert.equal(ramp.ramp.levels.length > 0, true, 'a ramp over the measured listings');
});

test('every view ends with one provenance line (dataset · source · date · boundary, then the method)', () => {
  const {meta, estates, types} = model();
  const families = {th: json('data/around.json').meta.families, en: json('data/around.json').meta.familiesEn};
  const views = {
    overview: renderOverview({summary: summarize(estates), aha: ahaOf(estates), types, groups: developerGroups(estates), meta, base: '', filtered: false}),
    province: renderProvince({code: 'RYG', summary: summarize(estates.filter(e => e.province === 'RYG')), estates: estates.filter(e => e.province === 'RYG'), meta, base: '', ramp: estateRamp(estates)}),
    estate: renderEstate({estate: estates.find(e => e.id === 'EST-IEAT-2722'), meta, base: '', families, factoryHref: 'https://example.test/factory/?d=factory&e=estate:EST-IEAT-2722', factoryRowHref: f => `https://example.test/factory/?e=factory:${f}`, directoryState: ''}),
    bare: renderEstate({estate: estates.find(e => !e.outline && !e.listed), meta, base: '', families, factoryHref: '', factoryRowHref: () => '', directoryState: ''}),
  };
  for (const [name, html] of Object.entries(views)) {
    for (const k of ['dataset', 'source', 'date', 'boundary']) assert.equal((html.match(new RegExp(`data-prov="${k}"`, 'g')) || []).length, 1, `${name}: ${k}`);
    assert.equal((html.match(/class="hint panel-foot provenance"/g) || []).length, 1, `${name}: one provenance line`);
    assert.ok(html.includes('href="DATA_METHOD.md"'), `${name}: the method`);
    const t = text(html);
    assert.ok(t.includes('CityMETER Industrial Estate'), `${name}: dataset`);
    assert.ok(!/โรงงานในนิคม \d|ผู้เช่า|ส่วนแบ่งตลาด|ความหนาแน่น|อันดับ \d/.test(t), `${name}: no factory count, tenant, market, density or rank claim`);
  }
  assert.ok(text(views.estate).includes('โรงงานรอบนิคม 3 กม.') && !text(views.estate).includes('ในนิคม'), 'the around set is round the estate');
});

test('privacy: directory names written as a natural person’s are withheld and never matched', () => {
  const directory = json('data/directory.json');
  const person = /^\s*(นาย|นาง|นางสาว|น\.ส\.|mr\.?\s|mrs\.?\s|ms\.?\s|miss\s)/i;
  let withheld = 0;
  for (const id of Object.keys(directory.estates)) {
    for (const r of directoryRows(directory, id)) {
      assert.ok(!person.test(r.name), `${id}: ${r.id}`);
      if (r.person) { withheld++; assert.deepEqual(r.fids, [], `${r.id}: never matched`); }
    }
  }
  assert.ok(withheld > 0);
  const html = renderDirectory(directoryRows(directory, Object.keys(directory.estates)[0]), {limit: 5000});
  assert.ok(!person.test(text(html)));
});

test('logos: a display file only when its source SHA-256 is the library’s, no logo URL copied; short labels and captions', () => {
  const manifest = json('assets/logos/manifest.json');
  for (const l of manifest.logos) {
    assert.ok(existsSync(join(DIR, 'assets/logos', l.file)), l.file);
    assert.equal(sha256(readFileSync(join(DIR, 'assets/logos', l.file))), l.sha256, l.file);
    assert.ok(!('sourceUrl' in l));
  }
  assert.ok(!/https?:\/\//.test(read('assets/logos/manifest.json')), 'no URL in the manifest');
  const files = new Set(manifest.logos.map(l => l.file));
  for (const e of raw.estates) if (e.logo) assert.ok(files.has(e.logo.file), e.id);
  assert.equal(shortLabel('Industrial Estate Authority of Thailand'), 'กนอ.');
  assert.equal(shortLabel('WHA Industrial Development Public Company Limited'), 'WHA Industrial Development');
  assert.equal(logoCaption({logo: {}, logoRole: 'exact_estate_mark'}), 'โลโก้นิคม');
  assert.equal(logoCaption({logo: {}, logoRole: 'verified_parent_company'}), 'บริษัทแม่');
  assert.equal(logoCaption({logo: {}, logoRole: 'company_or_shared_brand'}), 'ผู้พัฒนา');
});

test('R8 review round (1.1.0): the rejected Bluetech artwork is gone; recovered and new marks, English names, outline QA, owner lists', () => {
  const manifest = json('assets/logos/manifest.json');
  assert.deepEqual(manifest.excluded, ['EST-IEAT-2704'], 'the Bluetech artwork belongs to an unrelated company (R8)');
  assert.deepEqual(manifest.missing, []);
  assert.ok(!manifest.logos.some(l => l.sourceSha256.startsWith('f0c45351a7a5')) && !existsSync(join(DIR, 'assets/logos/logo-f0c45351a7a5fd9c.webp')));
  const {estates, byId, meta} = model();
  const blue = byId.get('EST-IEAT-2704');
  assert.deepEqual([blue.logo, blue.logoLabel, blue.logoRole], [null, null, 'text_fallback']);
  assert.equal(readJSON('data/estate-context.json').estates.find(e => e.id === 'EST-IEAT-2704').logo, null, 'Factory shows the name too');
  assert.deepEqual(['EST-IEAT-2721', 'EST-IEAT-2751', 'EST-IEAT-2731', 'EST-IEAT-2685'].map(id => [byId.get(id).logo?.label, byId.get(id).logoRole]),
    [['AMATA', 'verified_parent_company'], ['UBD', 'company_or_shared_brand'], ['Yamato', 'exact_estate_mark'], ['MLD', 'company_or_shared_brand']]);
  assert.deepEqual([meta.counts.logos, meta.counts.logoFallback], [99, 7]);
  assert.equal(shortLabel('กนอ.'), 'กนอ.');
  assert.equal(byId.get('EST-AREA-SAHA-KABINBURI').nameEn, 'SAHA Group Industrial Park - Kabinburi');
  assert.equal(byId.get('EST-AREA-SURANAREE').nameEn, null, 'not found in the bounded search: the name stays Thai');
  assert.equal(meta.counts.namesEnR8, 16);
  const qa = estates.filter(e => e.boundary.qa);
  assert.equal(qa.length, 15);
  for (const e of qa) {
    assert.ok(e.outline, e.id);
    assert.deepEqual(Object.keys(e.boundary.qa).sort(), ['dir', 'on', 'url'], `${e.id}: no area or ratio is published`);
  }
  assert.deepEqual([byId.get('EST-AREA-SAHA-KABINBURI').boundary.qa.dir, byId.get('EST-IEAT-2699').boundary.qa.dir], ['smaller', 'larger']);
  const lists = estates.filter(e => e.ownerList);
  assert.equal(lists.length, 17);
  for (const e of lists) assert.deepEqual(Object.keys(e.ownerList).sort(), ['on', 'shared', 'url'], `${e.id}: a link and its date, never a count`);
  const families = {th: json('data/around.json').meta.families, en: json('data/around.json').meta.familiesEn};
  const html = text(renderEstate({estate: byId.get('EST-AREA-SAHA-KABINBURI'), meta, base: '', families, factoryHref: '', factoryRowHref: () => '', directoryState: ''}));
  assert.ok(html.includes('กรอบเล็กกว่าพื้นที่ที่แหล่งระบุเกิน 15%') && html.includes('รายชื่อลูกค้าบนเว็บผู้พัฒนา'), 'area check and owner list');
  // R8: the area check carries no area figure. R9 (1.3.0): the register's own outline note is shown as written (it may name rai).
  assert.ok(!/\d[\d,]* ไร่/.test(html.replace(text(byId.get('EST-AREA-SAHA-KABINBURI').boundary.note || ''), '')), 'no area figure outside the register note');
});

test('map names: short, never overlapping, the open estate first', () => {
  assert.equal(shortName('นิคมอุตสาหกรรมลาดกระบัง'), 'ลาดกระบัง');
  assert.equal(shortName('Lat Krabang Industrial Estate'), 'Lat Krabang');
  assert.equal(shortName('Nava Nakorn Industrial Estate, Nakhon Ratchasima'), 'Nava Nakorn, Nakhon Ratchasima', 'no space before a comma');
  assert.equal(shortName('Nava Nakorn Industrial Promotion Zone, Pathum Thani'), 'Nava Nakorn, Pathum Thani');
  const shown = placeChips([{id: 'a', x: 100, y: 100, w: 80, h: 24, priority: 1}, {id: 'b', x: 110, y: 104, w: 80, h: 24, priority: 1e6}], {width: 400, height: 400});
  assert.deepEqual([...shown], ['b']);
  const {estates} = model();
  assert.equal(filterEstates(estates, {listed: 'yes'}).length, 56);
  assert.equal(filterEstates(estates, {outline: 'no'}).length, 42, 'R9: 39 without an outline and 3 context areas');
});

test('page: noindex, Thai and English, one cache tag on every entry and module, the shared shell bytes', () => {
  const html = read('index.html');
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.ok(html.includes('<meta name="citymeter:languages" content="th en">'));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const tags = [...html.matchAll(/\?v=([0-9A-Za-z-]+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(tags)], [tags[0]]);
  assert.match(tags[0], /^\d{8}-r\d{1,2}$/);
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const modules = [...readdirSync(join(DIR, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    ...readdirSync(join(DIR, 'js/vendor')).filter(f => f.endsWith('.js')).map(f => `js/vendor/${f}`),
    ...readdirSync(join(DIR, 'js/shell')).filter(f => f.endsWith('.js') && f !== 'launch.js').map(f => `js/shell/${f}`)];
  for (const m of modules) assert.equal(map[`./${m}`], `./${m}?v=${tags[0]}`, m);
  assert.ok(html.includes('data-public="https://montri-th.github.io/factory/industrialestate/"'));
  for (const f of readdirSync(join(ROOT, 'js/shell'))) assert.equal(sha256(readFileSync(join(DIR, 'js/shell', f))), sha256(readFileSync(join(ROOT, 'js/shell', f))), `js/shell/${f}`);
  assert.equal(sha256(readFileSync(join(DIR, 'navigation.css'))), sha256(readFileSync(join(ROOT, 'navigation.css'))), 'navigation.css');
  for (const f of ['DATA_METHOD.md', 'PRODUCT_STATEMENT.md', 'AGENTS.md', 'README.md', 'llms.txt', 'design-intent.json', 'site.webmanifest']) assert.ok(existsSync(join(DIR, f)), f);
});

test('around-estate workers (1.2.0, Factory 0.9.0): DIW first, MOI only where DIW has none — split under the total; “not stated” never a ranked family', () => {
  const {meta, estates} = model();
  const around = json('data/around.json');
  const fac = readJSON('data/factories.json');
  const ws = new Map(fac.cols.key.map((k, i) => [k, fac.cols.ws[i]]));
  const unstated = around.meta.families.indexOf('ไม่ระบุกลุ่มอุตสาหกรรม');
  assert.equal(unstated, around.meta.families.length - 1);
  for (const e of estates.filter(x => x.around)) {
    const rows = aroundRows(around, e.id);
    const moi = rows.filter(r => r.moi);
    assert.ok(rows.every(r => r.moi === (ws.get(r.fid) === 1)), `${e.id}: the MOI flag is Factory's`);
    assert.equal(e.around.moi || 0, moi.length, e.id);
    assert.equal(e.around.moiWorkers || 0, moi.reduce((s, r) => s + r.workers, 0), e.id);
    assert.equal((e.around.unstated || [0, 0])[1], rows.filter(r => r.family === unstated).length, e.id);
    assert.ok(!e.around.families.some(f => f[0] === unstated), `${e.id}: not stated is never a ranked family`);
  }
  const esb = estates.find(x => x.id === 'EST-IEAT-2706');
  assert.deepEqual([esb.around.n, esb.around.workers, esb.around.moi, esb.around.moiWorkers, esb.around.unstated], [156, 38529, 148, 38241, [38241, 148]]);
  const families = {th: around.meta.families, en: around.meta.familiesEn};
  const html = renderEstate({estate: esb, meta, base: '', families, factoryHref: '', factoryRowHref: () => '', directoryState: ''});
  assert.ok(text(html).includes('กรอ. 288 คน · อก. เติม 38,241 คน (148 ทะเบียน)'), 'the two sources apart under the total');
  assert.ok(text(html).includes('ผลิตภัณฑ์อโลหะ 7 ไม่ระบุกลุ่มอุตสาหกรรม 38,241') && html.includes('<li class="is-unstated">'), 'not stated after the ranked families, set apart');
});

test('R9 (1.3.0): 64 estates from 66 source parts kept apart, 3 context areas never counted, the register label and note beside every shape', () => {
  const {meta, estates, byId} = model();
  const shapes = json('data/boundaries.geojson').features;
  // Parts stay apart and the estate counts once.
  for (const id of ['EST-AREA-ROJANA-AYUTTHAYA', 'EST-AREA-304-PRACHINBURI']) {
    assert.equal(shapes.filter(f => f.properties.id === id && !f.properties.ctx).length, 2, id);
    assert.equal(byId.get(id).boundary.parts.length, 2, id);
  }
  assert.equal(new Set(shapes.filter(f => !f.properties.ctx).map(f => f.properties.id)).size, 64);
  // Context areas: drawn apart, no outline, no around set; Map Ta Phut, the Southern estate (Rubber City), Kaeng Khoi.
  assert.deepEqual(estates.filter(e => e.context).map(e => e.id).sort(), ['EST-IEAT-2672', 'EST-IEAT-2691', 'EST-IEAT-2745']);
  for (const e of estates.filter(x => x.context)) assert.ok(!e.outline && !e.around && e.boundary.labelTh && e.boundary.note, e.id);
  // Every drawn shape carries its label and note; the 39 without one carry the register's status label.
  for (const e of estates.filter(x => x.outline || x.context)) assert.ok(e.boundary.labelTh && e.boundary.note && e.boundary.osm, e.id);
  for (const e of estates.filter(x => !x.outline && !x.context)) assert.equal(e.boundary.labelTh, 'ยังไม่มีขอบเขตที่ใช้แสดงได้', e.id);
  assert.equal(estates.filter(e => e.outline && e.boundary.r9).length, 18, 'outlines newly available for the demo (46 → 64)');
  assert.equal(estates.filter(e => e.outline && e.around).length, 64, 'an around set for every drawn estate');
  assert.deepEqual(meta.r9.counts, {outlines: 64, parts: 66, context: 3, none: 39});
  // The panel shows them; the context area says it is not the estate outline.
  const families = {th: json('data/around.json').meta.families, en: json('data/around.json').meta.familiesEn};
  const view = id => text(renderEstate({estate: byId.get(id), meta, base: '', families, factoryHref: '', factoryRowHref: () => '', directoryState: ''}));
  const amata = view('EST-IEAT-2718');
  assert.ok(amata.includes('อมตะซิตี้ ชลบุรี — ส่วนที่ OSM เรียกโครงการ 1; ยังไม่ครอบทั้งนิคม') && amata.includes('หมายเหตุขอบเขต ใช้เฉพาะเส้นที่ระบุโครงการ 1'), amata.slice(0, 200));
  const rojana = view('EST-AREA-ROJANA-AYUTTHAYA');
  assert.ok(rojana.includes('2 ส่วนตามแหล่ง แยกกัน'), 'two source parts, said so');
  const mtp = view('EST-IEAT-2745');
  assert.ok(mtp.includes('ย่านอุตสาหกรรมมาบตาพุดตาม OSM — ไม่ใช่ขอบนิคมที่ยืนยันแล้ว · พื้นที่บริบท ·') && mtp.includes('พื้นที่บริบทไม่ใช่ขอบนิคม จึงไม่วัดระยะโรงงานรอบนิคม') && !mtp.includes('โรงงานรอบนิคม 3 กม. 0'), mtp.slice(0, 200));
  // A part-only outline keeps a dashed edge on the map (R9 roles), so the shape never reads as the whole estate.
  assert.deepEqual(estates.filter(partialOutline).map(e => e.id).sort(), ['EST-AREA-304-CHACHOENGSAO', 'EST-AREA-304-PRACHINBURI', 'EST-AREA-ROJANA-AYUTTHAYA', 'EST-IEAT-2687', 'EST-IEAT-2700', 'EST-IEAT-2717', 'EST-IEAT-2718', 'EST-IEAT-2720', 'EST-IEAT-2746', 'EST-IEAT-2747', 'EST-IEAT-2759'].sort());
  // Factory reads the same 64 estates and their labels; never the context areas.
  const ctx = readJSON('data/estate-context.json');
  assert.equal(ctx.outlines.features.length, 66);
  assert.deepEqual(ctx.estates.filter(e => e.outline).map(e => e.id).sort(), estates.filter(e => e.outline).map(e => e.id).sort());
  assert.ok(ctx.estates.filter(e => !e.outline).every(e => !e.bbox && !e.outlineTh), 'no frame or label without a drawn outline');
});
