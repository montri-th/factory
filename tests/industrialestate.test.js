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
import {decodeData, summarize, ahaOf, estateRamp, developerGroups, filterEstates, shortLabel, logoCaption, directoryRows, aroundRows} from '../industrialestate/js/model.js';
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

test('data contract industrial-estate-demo/1.0.0: 106 records, 46 outlines, 6,811 listings in 56 estates, 50 no data, verified no data', () => {
  const {meta, estates} = model();
  assert.equal(meta.contract, 'industrial-estate-demo/1.0.0');
  assert.equal(meta.registryId, 'research.TH.industrial_estates');
  assert.equal(estates.length, 106);
  assert.deepEqual(meta.counts.types, {estate: 84, park: 16, zone: 6});
  assert.equal(new Set(estates.map(e => e.province)).size, 21);
  assert.equal(estates.filter(e => e.outline).length, 46);
  assert.equal(json('data/boundaries.geojson').features.length, 46);
  const listed = estates.filter(e => e.listed);
  assert.equal(listed.length, 56);
  assert.equal(listed.reduce((s, e) => s + e.dir.n, 0), 6811);
  for (const e of estates.filter(x => !x.listed)) assert.equal(e.dir.n, null, `${e.id}: no listing is no data, never 0`);
  assert.equal(meta.counts.verifiedFactories, null);
  for (const e of estates) if (!e.outline) assert.ok(['hold', 'scope', 'missing', 'license'].includes(e.boundary.state), e.id);
  assert.deepEqual(meta.counts.boundaryStates, {shown: 46, hold: 40, scope: 4, missing: 9, license: 7});
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

test('map names: short, never overlapping, the open estate first', () => {
  assert.equal(shortName('นิคมอุตสาหกรรมลาดกระบัง'), 'ลาดกระบัง');
  assert.equal(shortName('Lat Krabang Industrial Estate'), 'Lat Krabang');
  const shown = placeChips([{id: 'a', x: 100, y: 100, w: 80, h: 24, priority: 1}, {id: 'b', x: 110, y: 104, w: 80, h: 24, priority: 1e6}], {width: 400, height: 400});
  assert.deepEqual([...shown], ['b']);
  const {estates} = model();
  assert.equal(filterEstates(estates, {listed: 'yes'}).length, 56);
  assert.equal(filterEstates(estates, {outline: 'no'}).length, 60);
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
