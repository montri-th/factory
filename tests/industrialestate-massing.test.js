/**
 * Industrial Estate: an open estate's buildings are shaped whole, all at once (1.3.1; owner 2026-11-17 01:34:
 * “หน้า industrial estate เวลาคลิกที่นิคม ควรแสดง 3d building mass ทั้งหมดใน นิคมพร้อมกันด้วย”).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT, readJSON} from './helpers.js';
import {installMassing, outerRings, tilesForRegions, planCmRequests, TILE_ZOOM, MAX_TILES, WHOLE_CM_REQUESTS, WHOLE_MIN_ZOOM, CITY_MIN_ZOOM, FOCUS_LAYER, FOCUS_SOURCE} from '../industrialestate/js/massing.js';
import {zonesOf, zonesFor} from '../industrialestate/js/shell/building-units.js';
import {MAP_BUDGETS} from '../industrialestate/js/shell/maplibre-guard.js';
import {tileToLonLat} from '../industrialestate/js/shell/mvt.js';

test('every estate outline is planned whole: all its z14 tiles and CityMETER requests, none cut', () => {
  const geo = readJSON('industrialestate/data/boundaries.geojson');
  const dir = join(ROOT, 'industrialestate/data/building-units');
  // The worst case: the units of every province loaded (the page keeps the provinces opened before).
  const zones = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').flatMap(f => zonesOf(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  const ids = [...new Set(geo.features.filter(f => !f.properties.ctx).map(f => f.properties.id))];
  assert.equal(ids.length, 64);
  const most = {tiles: 0, requests: 0};
  for (const id of ids) {
    const regions = geo.features.filter(f => f.properties.id === id && !f.properties.ctx).flatMap(outerRings);
    const {tiles, truncated, total} = tilesForRegions(regions, TILE_ZOOM, MAX_TILES);
    assert.equal(truncated, false, `${id}: ${total} tiles`);
    const plan = planCmRequests(tiles, zonesFor(zones, regions), {max: WHOLE_CM_REQUESTS});
    assert.equal(plan.truncated, false, `${id}: more than ${WHOLE_CM_REQUESTS} CityMETER requests`);
    most.tiles = Math.max(most.tiles, tiles.length);
    most.requests = Math.max(most.requests, plan.requests.length);
  }
  assert.deepEqual(most, {tiles: 15, requests: 54}, 'the figures in js/massing.js#WHOLE_MIN_ZOOM');
});

function fakeMap(center) {
  const layers = new Map(), sources = new Map([['openmaptiles', {}]]);
  return {
    data: {}, zoomRange: {},
    setLayerZoomRange(id, min, max) { this.zoomRange[id] = [min, max]; },
    getLayer: id => layers.get(id), getSource: id => sources.get(id),
    addLayer(def) { layers.set(def.id, def); },
    addSource(id) { sources.set(id, {setData: d => { this.data[id] = d; }}); },
    removeLayer(id) { layers.delete(id); }, removeSource(id) { sources.delete(id); },
    setFilter() {}, setLayoutProperty() {}, setPaintProperty() {},
    getZoom: () => 11.5, getPitch: () => 60, getCenter: () => ({lat: center[1], toArray: () => center}),
    on() {}, off() {}, project: ([lon, lat]) => ({x: lon * 1e4, y: -lat * 1e4}),
    querySourceFeatures: () => [], setFeatureState() {}, removeFeatureState() {},
  };
}

test('an open estate is shaped whole on a phone\'s budget, drawn from WHOLE_MIN_ZOOM; a recovered page stays lean', async () => {
  const bytes = readFileSync(new URL('./fixtures/mvt-sample.pbf', import.meta.url));
  const tile = {z: 14, x: 12767, y: 7560};
  // An estate three z14 tiles across (≈ 7 km): wider than a phone's ring of 900 m.
  const estate = [[10, 10], [12278, 10], [12278, 12278], [10, 12278], [10, 10]].map(([px, py]) => tileToLonLat(px, py, tile));
  const center = tileToLonLat(6144, 6144, tile);
  const install = (map, budget, fetched) => installMassing(map, {
    beforeId: null, colors: {quiet: '#ECEDE8', focus: '#D9D7CD'}, tileUrl: t => `stub/${t.z}/${t.x}/${t.y}.pbf`, budget,
    fetchImpl: async url => { fetched.push(url); return {ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)}; },
  });

  const map = fakeMap(center), fetched = [];
  const massing = install(map, MAP_BUDGETS.phone, fetched);
  // Not whole (any other wide focus): the phone's ring, nothing below its zoom — as before.
  const ring = await massing.update({regions: [estate], hosts: [], zoom: 11.5, enabled: true, city: true, latitude: center[1]});
  assert.equal(ring.waiting, true);
  assert.equal(fetched.length, 0);
  // Whole: every tile of the estate, at the zoom that frames it, drawn from WHOLE_MIN_ZOOM.
  const whole = await massing.update({regions: [estate], hosts: [], zoom: 11.5, enabled: true, city: true, latitude: center[1], whole: true});
  assert.equal(whole.whole, true);
  assert.equal(whole.near, false);
  assert.equal(whole.truncated, false);
  assert.equal(whole.tiles, 9);
  assert.equal(new Set(fetched).size, 9);
  assert.ok(whole.features > 0);
  assert.equal(map.data[FOCUS_SOURCE].features.length, whole.features);
  assert.equal(whole.minZoom, WHOLE_MIN_ZOOM);
  assert.deepEqual(map.zoomRange[FOCUS_LAYER], [WHOLE_MIN_ZOOM, 24]);
  // Another zoom re-shapes from the tiles in memory (9 > the 8 a phone keeps otherwise): nothing is fetched again.
  const again = await massing.update({zoom: 12.5});
  assert.equal(again.whole, true);
  assert.equal(again.features, whole.features);
  assert.equal(fetched.length, 9);
  // Closing the estate empties the tier and gives back the city zoom.
  const closed = await massing.update({regions: [], whole: false, zoom: 11.5});
  assert.equal(closed.features, 0);
  assert.deepEqual(map.zoomRange[FOCUS_LAYER], [CITY_MIN_ZOOM, 24]);
  massing.dispose();

  // A page recovered from an ended one keeps its lean ring, also for an estate.
  const lean = install(fakeMap(center), MAP_BUDGETS.recovered, []);
  const kept = await lean.update({regions: [estate], hosts: [], zoom: 11.5, enabled: true, city: true, latitude: center[1], whole: true});
  assert.equal(kept.waiting, true);
  lean.dispose();
});
