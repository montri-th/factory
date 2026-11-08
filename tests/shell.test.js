/**
 * citymeter-shell — the shared navigation of the CityMETER demos (js/shell/). This file is the same in every
 * repository that carries the shell: the files must match js/shell/manifest.json byte for byte, and the modules
 * must keep the contract of demo-platform-review §5.2–5.3 (address grammar, history, breadcrumb, tab title).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {parseAt, formatAt, clampAt, districtOf, productionHref} from '../js/shell/area-path.js';
import {splitRef, joinRef, serialize, createCodec, createNavigator, LEVEL_KEYS} from '../js/shell/url.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText, deepestHref} from '../js/shell/breadcrumb.js';
import {pageTitle, TITLE_MAX} from '../js/shell/title.js';

const SHELL = new URL('../js/shell/', import.meta.url);
const sha256 = buf => createHash('sha256').update(buf).digest('hex');

test('the shell files match their manifest byte for byte, and the manifest lists every shell module', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', SHELL), 'utf8'));
  assert.equal(manifest.name, 'citymeter-shell');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const modules = readdirSync(SHELL).filter(f => f.endsWith('.js')).map(f => `js/shell/${f}`).sort();
  assert.deepEqual(Object.keys(manifest.files).sort(), modules);
  for (const [path, hash] of Object.entries(manifest.files)) {
    assert.equal(sha256(readFileSync(new URL(`../${path}`, import.meta.url))), hash, `${path} differs from citymeter-shell ${manifest.version}`);
  }
});

test('area paths are the production path after /v3/citymeter/, letter for letter', () => {
  assert.deepEqual(parseAt('BKK'), {province: 'BKK', kind: 'P', code: ''});
  assert.deepEqual(parseAt('BKK/D/1039'), {province: 'BKK', kind: 'D', code: '1039'});
  assert.deepEqual(parseAt('BKK/S/103902'), {province: 'BKK', kind: 'S', code: '103902'});
  assert.deepEqual(parseAt('CBI/M/03200701'), {province: 'CBI', kind: 'M', code: '03200701'});
  assert.equal(parseAt('BKK/L/a29ec31e-3a36-4ab7-9670-7cef38873c80').kind, 'L');
  for (const bad of ['', 'bkk', 'BKK/D/103', 'BKK/D/10390', 'BKK/X/1039', 'BKK/D', 'BKK/D/1039/x', null]) assert.equal(parseAt(bad), null, String(bad));
  assert.equal(formatAt(parseAt('BKK/S/103902')), 'BKK/S/103902');
  assert.equal(formatAt({province: 'BKK'}), 'BKK');
  assert.equal(formatAt({province: 'BKK', kind: 'D', code: 'x'}), '');
  assert.equal(districtOf(parseAt('BKK/S/103902')), '1039');
  // A dataset opens the deepest level it supports.
  assert.deepEqual(clampAt(parseAt('BKK/S/103902'), ['P', 'D']), {province: 'BKK', kind: 'D', code: '1039'});
  assert.deepEqual(clampAt(parseAt('CBI/M/03200701'), ['P', 'D']), {province: 'CBI', kind: 'P', code: ''});
  assert.deepEqual(clampAt(parseAt('BKK/S/103902'), ['P', 'D', 'S']), parseAt('BKK/S/103902'));
  assert.equal(productionHref('hotel'), 'https://landometer.com/v3/citymeter?d=hotel');
  assert.equal(productionHref('hotel', parseAt('BKK/D/1039')), 'https://landometer.com/v3/citymeter/BKK/D/1039?d=hotel');
  assert.equal(productionHref('governmentOfficer', {province: 'PKT', kind: 'P'}), 'https://landometer.com/v3/citymeter/PKT?d=governmentOfficer');
});

test('e and n split at the first colon; the id is kept verbatim', () => {
  assert.deepEqual(splitRef('station:CONSTCAT:MRT_ORANGE:OR02'), {kind: 'station', id: 'CONSTCAT:MRT_ORANGE:OR02'});
  assert.deepEqual(splitRef('hotel:HT-3e3f6a0b'), {kind: 'hotel', id: 'HT-3e3f6a0b'});
  for (const bad of ['', 'hotel', 'hotel:', ':x', 'Hotel:x', null]) assert.equal(splitRef(bad), null, String(bad));
  assert.equal(joinRef('company', 'HGRP-accor'), 'company:HGRP-accor');
});

test('the canonical address keeps the shared keys in order and "/", ":" and "," readable', () => {
  const p = new URLSearchParams([['view3d', '0'], ['f.group', 'resort'], ['e', 'station:CONSTCAT:MRT_ORANGE:OR02'], ['at', 'BKK/D/1039'], ['d', 'hotel'], ['focus', '1039,1033'], ['m', 'count'], ['f.search', 'ภูเขา ทะเล']]);
  assert.equal(serialize(p), 'd=hotel&at=BKK/D/1039&e=station:CONSTCAT:MRT_ORANGE:OR02&m=count&f.group=resort&f.search=%E0%B8%A0%E0%B8%B9%E0%B9%80%E0%B8%82%E0%B8%B2%20%E0%B8%97%E0%B8%B0%E0%B9%80%E0%B8%A5&focus=1039,1033&view3d=0');
  assert.equal(new URLSearchParams(serialize(p)).get('f.search'), 'ภูเขา ทะเล');
});

const PROVINCES = {'10': 'BKK', '83': 'PKT'};
const codec = () => createCodec({
  dataset: 'hotel', levels: ['P', 'D'], place: {province: 'province', D: 'area'},
  items: {hotel: 'hotel', station: 'station'}, filters: ['search', 'group', 'province'],
  provinceOf: code => PROVINCES[code.slice(0, 2)] || '',
});

test('the codec writes a dataset\'s own parameters in the shared grammar and reads them back', () => {
  const c = codec();
  const own = new URLSearchParams([['search', 'resort'], ['province', 'BKK'], ['metric', 'count'], ['area', '1039'], ['areas', 'all'], ['view', 'mix'], ['hotel', 'HT-1'], ['view3d', '0']]);
  const shared = c.encode(own);
  assert.equal(serialize(shared), 'd=hotel&at=BKK/D/1039&e=hotel:HT-1&m=count&f.province=BKK&f.search=resort&focus=all&view=mix&v3d=0');
  const back = c.decode(serialize(shared));
  assert.equal(back.legacy, false);
  for (const k of ['search', 'province', 'metric', 'area', 'areas', 'view', 'hotel', 'view3d']) assert.equal(back.own.get(k), own.get(k), k);
  // A province alone is the area; a district opened from the whole country carries no province filter.
  assert.equal(serialize(c.encode(new URLSearchParams('province=PKT'))), 'd=hotel&at=PKT');
  assert.equal(serialize(c.encode(new URLSearchParams('area=8301'))), 'd=hotel&at=PKT/D/8301');
  assert.equal(c.decode('at=PKT/D/8301').own.get('province'), null);
  // A district the address cannot spell is kept as it is, never dropped.
  assert.equal(serialize(c.encode(new URLSearchParams('area=9999'))), 'd=hotel&area=9999');
});

test('old links keep working, the shared keys win, and deeper or unknown places fall back', () => {
  const c = codec();
  const old = c.decode('?province=BKK&area=1039&hotel=HT-1&metric=count&view3d=0');
  assert.equal(old.legacy, true);
  assert.equal(serialize(c.encode(old.own)), 'd=hotel&at=BKK/D/1039&e=hotel:HT-1&m=count&f.province=BKK&v3d=0');
  assert.equal(c.decode('at=BKK/D/1039&area=1001').own.get('area'), '1039');
  assert.equal(c.decode('at=BKK/S/103902').own.get('area'), '1039');
  assert.equal(c.decode('at=CBI/M/03200701').own.get('province'), 'CBI');
  assert.equal(c.decode('e=shop:X').own.get('hotel'), null);
  assert.equal(c.decode('e=station:CONSTCAT:MRT_ORANGE:OR02').own.get('station'), 'CONSTCAT:MRT_ORANGE:OR02');
  assert.equal(c.decode('d=hotel&lang=en').legacy, false);
});

function fakeWindow(search = '') {
  const listeners = {}, entries = [{state: null, url: `/hotel/${search}`}];
  let index = 0;
  const searchOf = url => { const q = url.indexOf('?'); return q >= 0 ? url.slice(q) : ''; };
  const win = {
    location: {pathname: '/hotel/', hash: '', search},
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      pushState(state, _t, url) { entries.splice(index + 1); entries.push({state, url}); index += 1; win.location.search = searchOf(url); },
      replaceState(state, _t, url) { entries[index] = {state, url}; win.location.search = searchOf(url); },
      back() { index -= 1; win.location.search = searchOf(entries[index].url); listeners.popstate?.({state: entries[index].state}); },
    },
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  return {win, entries: () => entries.map(e => e.url), index: () => index};
}

test('a change of d, at, e or n pushes a history entry; anything else replaces it; back restores the level', () => {
  assert.deepEqual([...LEVEL_KEYS], ['d', 'at', 'e', 'n']);
  const w = fakeWindow('?area=1039&lang=en');
  const popped = [];
  const nav = createNavigator(codec(), {win: w.win, onPop: own => popped.push(own.get('area'))});
  assert.equal(nav.read().get('area'), '1039');
  assert.equal(nav.commit(nav.read()), false, 'the first commit replaces (rewrites the old link)');
  assert.deepEqual(w.entries(), ['/hotel/?d=hotel&at=BKK/D/1039&lang=en']);
  assert.equal(nav.commit(new URLSearchParams('area=1039&metric=count')), false, 'a measure change replaces');
  assert.equal(nav.commit(new URLSearchParams('area=1039&metric=count&hotel=HT-1')), true, 'opening an item pushes');
  assert.equal(nav.commit(new URLSearchParams('area=1039&metric=count&hotel=HT-1')), false, 'the same address is not written twice');
  assert.equal(w.entries().length, 2);
  assert.equal(nav.canGoBack(), true);
  nav.back();
  assert.deepEqual(popped, ['1039']);
  assert.equal(nav.canGoBack(), false);
  assert.match(w.entries()[0], /lang=en$/);
});

test('the tab title is [page] · CityMETER, at most 60 characters, cut at a character boundary', () => {
  assert.equal(pageTitle('ห้องพัก เขตวัฒนา'), 'ห้องพัก เขตวัฒนา · CityMETER');
  assert.equal(pageTitle(''), 'CityMETER');
  const page = 'โรงแรมแกรนด์ไฮแอท เอราวัณ กรุงเทพ ราชประสงค์ ประตูน้ำ สุขุมวิท ถนนเพลินจิตตะวันออก';
  const long = pageTitle(page);
  assert.ok(long.length <= TITLE_MAX, `${long.length}`);
  assert.ok(long.endsWith('… · CityMETER'));
  const cut = long.slice(0, long.length - '… · CityMETER'.length);
  assert.ok(page.startsWith(cut));
  assert.doesNotMatch(page.slice(cut.length, cut.length + 1), /[ัิ-ฺ็-๎]/u, 'a vowel or tone mark is never cut from its letter');
  for (const p of ['a'.repeat(47), 'a'.repeat(48), 'a'.repeat(200)]) assert.ok(pageTitle(p).length <= TITLE_MAX, `${p.length}`);
});

test('the breadcrumb is the administrative path with production deep links; items are never crumbs', () => {
  const ctx = {dataset: 'hotel', provinceByCode: c => ({BKK: {code: 'BKK', th: 'กรุงเทพมหานคร'}}[c] || null), areaWord: c => (c === 'BKK' ? 'เขต' : 'อำเภอ')};
  const crumbs = buildBreadcrumb({province: 'BKK', area: {id: '1039', name: 'วัฒนา', province: 'BKK'}}, ctx);
  assert.equal(breadcrumbText(crumbs), 'ประเทศไทย › กรุงเทพมหานคร › เขตวัฒนา');
  assert.equal(crumbs[2].href, 'https://landometer.com/v3/citymeter/BKK/D/1039?d=hotel');
  assert.equal(crumbs.at(-1).current, true);
  assert.equal(deepestHref(crumbs), 'https://landometer.com/v3/citymeter/BKK/D/1039?d=hotel');
  assert.equal(breadcrumbText(buildBreadcrumb({}, ctx)), 'ประเทศไทย');
  const html = renderBreadcrumb(crumbs);
  assert.ok(html.includes('aria-current="location"'));
  assert.ok(html.includes('data-action="crumb-province"'));
  assert.ok(!html.includes('crumb-more'), 'three levels never fold');
});
