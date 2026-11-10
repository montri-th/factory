/**
 * Factory sites (release 0.7.0; owner 2026-11-10 08:17 “อนุมัติครับ” to boundary_source osm_polygon_auto):
 * js/sites.js decodes data/factory-sites.json, attaches a site only to a registration with a published point, and the
 * shipped file keeps the contract (every building point close to its registration's own point, the credit present).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT, readJSON} from './helpers.js';
import {SITES_CONTRACT, decodeSites, attachSites, siteReach} from '../js/sites.js';

const doc = (sites, meta = {}) => ({meta: {contract: SITES_CONTRACT, osmOn: '2026-11-06',
  sources: {osm_polygon_auto: 'กรอบ OpenStreetMap (ตรวจอัตโนมัติ)'},
  credits: {osm_polygon_auto: {text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright'}}, ...meta}, sites});

test('decodeSites keeps sites of two points or more and reads their source, credit and dates', () => {
  const s = decodeSites(doc({
    a: {src: 'osm_polygon_auto', n: 3, on: '2026-11-10', url: 'https://www.openstreetmap.org/way/731804059', pts: [[101.01, 13.42], [101.011, 13.421], [101.012, 13.422]]},
    b: {src: 'osm_polygon_auto', n: 1, on: '2026-11-10', url: 'https://www.openstreetmap.org/way/1', pts: [[101.01, 13.42]]},
    c: {src: 'osm_polygon_auto', n: 2, on: '2026-11-10', url: 'javascript:alert(1)', pts: [[101.01, 13.42], [200, 13.42], [101.02, 13.43]]},
  }));
  assert.deepEqual([...s.keys()], ['a', 'c'], 'one building is not a site');
  const a = s.get('a');
  assert.equal(a.n, 3);
  assert.equal(a.source, 'กรอบ OpenStreetMap (ตรวจอัตโนมัติ)');
  assert.equal(a.url, 'https://www.openstreetmap.org/way/731804059');
  assert.deepEqual(a.credit, {text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright'});
  assert.equal(a.on, '2026-11-10');
  assert.equal(a.osmOn, '2026-11-06');
  assert.equal(s.get('c').url, '', 'only an OpenStreetMap way or relation page is linked');
  assert.equal(s.get('c').points.length, 2, 'a point outside Thailand is dropped');
  assert.equal(decodeSites({meta: {contract: 'other/1.0.0'}, sites: {}}), null);
  assert.equal(decodeSites(null), null);
});

test('attachSites puts a site only on a registration with a published point, never a natural person', () => {
  const sites = decodeSites(doc({
    p: {src: 'osm_polygon_auto', n: 2, on: '2026-11-10', pts: [[101.01, 13.42], [101.011, 13.421]]},
    q: {src: 'osm_polygon_auto', n: 2, on: '2026-11-10', pts: [[101.01, 13.42], [101.011, 13.421]]},
    r: {src: 'osm_polygon_auto', n: 2, on: '2026-11-10', pts: [[101.01, 13.42], [101.011, 13.421]]},
  }));
  const rows = new Map([
    ['p', {id: 'p', longitude: 101.0101, latitude: 13.4201, person: false}],
    ['q', {id: 'q', longitude: null, latitude: null, person: false}],
    ['r', {id: 'r', longitude: 101.0101, latitude: 13.4201, person: true}],
  ]);
  assert.equal(attachSites(sites, rows), 1);
  assert.ok(rows.get('p').site);
  assert.equal(rows.get('q').site, undefined);
  assert.equal(rows.get('r').site, undefined);
  assert.equal(attachSites(null, rows), 0);
});

test('siteReach holds the farthest building of the site plus a margin', () => {
  const r = {latitude: 13.42, longitude: 101.01, site: {points: [[101.01, 13.4245], [101.012, 13.42]]}};
  const reach = siteReach(r);
  assert.ok(Math.abs(reach - (80 + 0.0045 * 110574)) < 1, String(reach));
  assert.equal(siteReach({latitude: 13.42, longitude: 101.01}), 0);
});

test('the shipped data/factory-sites.json keeps the contract', {skip: !existsSync(join(ROOT, 'data/factory-sites.json'))}, () => {
  const json = readJSON('data/factory-sites.json');
  assert.equal(json.meta.contract, SITES_CONTRACT);
  assert.deepEqual(Object.keys(json.meta.sources), ['osm_polygon_auto'], 'only an approved source is published');
  assert.equal(json.meta.credits.osm_polygon_auto.text, '© OpenStreetMap contributors');
  assert.match(json.meta.osmBase, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  const cols = readJSON('data/factories.json').cols, at = new Map(cols.key.map((k, i) => [k, i]));
  const ids = Object.keys(json.sites);
  assert.equal(ids.length, json.meta.count);
  let buildings = 0;
  for (const id of ids) {
    const s = json.sites[id], i = at.get(id);
    assert.ok(i !== undefined, `${id} is a registration`);
    assert.ok(!cols.person[i] && Number.isFinite(cols.lat[i]) && Number.isFinite(cols.lon[i]), `${id} has a published point`);
    assert.ok(s.pts.length >= 2 && s.n >= s.pts.length, `${id}: two buildings or more`);
    assert.match(s.url, /^https:\/\/www\.openstreetmap\.org\/(way|relation)\/\d+$/);
    const kx = 111320 * Math.cos((cols.lat[i] * Math.PI) / 180), ky = 110574;
    for (const [lon, lat] of s.pts) assert.ok(Math.hypot((lon - cols.lon[i]) * kx, (lat - cols.lat[i]) * ky) <= json.meta.siteMaxM, `${id}: a point within ${json.meta.siteMaxM} m`);
    buildings += s.n;
  }
  assert.equal(buildings, json.meta.buildings);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(decodeSites(json).size, ids.length, 'every shipped site decodes');
});
