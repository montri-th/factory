/**
 * CityMETER Industrial Estate, seen from Factory (release 0.6.0; owner 2026-11-10: “สร้างเดโม Industrial Estate และปรับ
 * Factory ให้สอดคล้องกัน … ทำให้สองเดโมเป็นประสบการณ์ที่ต่อเนื่องกัน”).
 *
 * data/estate-context.json is written by industrialestate/scripts/build-data.py from the industrial-estate research
 * master (registry research.TH.industrial_estates, contract industrial-estate-demo/1.0.0) and this dataset:
 *   estates   the 106 catalogue records: id, names, type, source province label, official page, logo label and mark
 *   outlines  the 46 OpenStreetMap outlines the master selected for the demo (© OpenStreetMap contributors, ODbL 1.0;
 *             simplified to 6 m) — context on the map, never a legal or current boundary
 *   around    per outlined estate, the registrations of this dataset with a published point ≤ 3 km in a straight line
 *             from the outline (0 inside it): the estate demo lists the same set. A distance set for context, never
 *             membership, tenancy or “in the estate” (this dataset is the DIW register outside IEAT estates).
 *   fid       registration → the estates whose IEAT directory lists a name matching its operator: a name match only.
 * Pure helpers and the map layer; js/app.js wires them, js/panel.js#renderEstate reads them.
 */
import {GEOJSON_MAXZOOM} from './map-layers.js';
import {listOrder} from './profile-model.js';
import {mixOf, sizeMixOf, lensOf} from './model.js';

/** Straight-line reach of the around-estate set (km), as built (meta.around.km). */
export const AROUND_KM = 3;
/** Outlines are drawn from this zoom (smaller, they would be specks). */
export const ESTATE_MIN_ZOOM = 8;

/** data/estate-context.json → the context, or null when the file is not what the build writes. */
export function decodeEstateContext(json) {
  if (!json || !Array.isArray(json.estates) || json.outlines?.type !== 'FeatureCollection' || !Array.isArray(json.outlines.features)) return null;
  const types = Array.isArray(json.types) ? json.types : [];
  const estates = json.estates.map((e, index) => Object.freeze({...e, index, typeTh: types[e.type]?.th || '', typeEn: types[e.type]?.en || ''}));
  const byId = new Map(estates.map(e => [e.id, e]));
  const features = json.outlines.features
    .map(f => ({type: 'Feature', id: f.id, properties: {id: estates[f.properties?.i]?.id || ''}, geometry: f.geometry}))
    .filter(f => f.properties.id && byId.get(f.properties.id)?.outline);
  const outlineById = new Map(features.map(f => [f.properties.id, f]));
  const fid = new Map(Object.entries(json.fid || {}).map(([k, v]) => [k, (Array.isArray(v) ? v : []).map(i => estates[i]).filter(Boolean)]));
  const around = new Map(Object.entries(json.around || {}).filter(([id, v]) => byId.has(id) && Array.isArray(v)));
  return {meta: json.meta || {}, types, estates, byId, outlines: {type: 'FeatureCollection', features}, outlineById, fid, around,
    km: Number(json.meta?.around?.km) || AROUND_KM};
}

/** [[w, s], [e, n]] of an estate's outline grown by `km` on every side, or null without an outline. */
export function estateBounds(e, km = AROUND_KM) {
  const b = e?.bbox;
  if (!Array.isArray(b) || b.length !== 4) return null;
  const lat = (b[1] + b[3]) / 2, dy = (km * 1000) / 110574, dx = (km * 1000) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[b[0] - dx, b[1] - dy], [b[2] + dx, b[3] + dy]];
}

/**
 * An estate seen from Factory: the record and the registrations of the scope in its around set (heaviest first).
 * `scopeIds` = ids of the rows after the filters; the set itself is read from every row of the dataset at build time.
 */
export function buildEstateProfile(ctx, id, {scopeIds, rowById, families = [], metric = 'workers'} = {}) {
  const estate = ctx?.byId.get(id);
  if (!estate) return null;
  const ids = ctx.around.get(id) || [];
  const rows = ids.map(k => rowById(k)).filter(r => r && (!scopeIds || scopeIds.has(r.id))).sort(listOrder);
  const workers = rows.reduce((s, r) => s + (r.workers || 0), 0);
  return {estate, km: ctx.km, outline: Boolean(estate.outline && ctx.outlineById.has(id)), all: ids.length, rows, count: rows.length, workers,
    figured: rows.filter(r => r.workers != null).length, value: metric === 'count' ? rows.length : workers, ...mixOf(rows, families),
    sizes: sizeMixOf(rows), lens: lensOf(rows), osmOn: ctx.meta.osmSnapshotOn || ''};
}

/** The estates whose IEAT directory lists a name matching a registration's operator (name match only). */
export const nameMatches = (ctx, fid) => ctx?.fid.get(fid) || [];

const SRC = 'estate-outlines';
const LAYERS = ['estate-hit', 'estate-casing', 'estate-outline', 'estate-hover', 'estate-selected-casing', 'estate-selected'];
const none = ['==', ['get', 'id'], '__none__'];
const only = id => (id ? ['==', ['get', 'id'], id] : none);

/**
 * The outlines on the map: a dashed foundation line on a halo casing (readable on every district fill; context, not a
 * data colour), a hover line and the open estate's line; an invisible fill answers clicks. `colors` = {line, halo, hover,
 * selected} from the theme.
 */
export function installEstateLayers(map, outlines, {colors = {}, beforeId} = {}) {
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  map.addSource(SRC, {type: 'geojson', data: outlines, maxzoom: GEOJSON_MAXZOOM});
  const width = (a, b, c) => ['interpolate', ['linear'], ['zoom'], ESTATE_MIN_ZOOM, a, 12, b, 16, c];
  map.addLayer({id: 'estate-hit', type: 'fill', source: SRC, minzoom: ESTATE_MIN_ZOOM, paint: {'fill-color': '#000000', 'fill-opacity': 0}}, before);
  map.addLayer({id: 'estate-casing', type: 'line', source: SRC, minzoom: ESTATE_MIN_ZOOM, layout: {'line-join': 'round'},
    paint: {'line-color': colors.halo || '#FFFFFF', 'line-width': width(2.6, 3.4, 4.4), 'line-opacity': 0.8}}, before);
  map.addLayer({id: 'estate-outline', type: 'line', source: SRC, minzoom: ESTATE_MIN_ZOOM, layout: {'line-join': 'round'},
    paint: {'line-color': colors.line || '#5F635A', 'line-width': width(1, 1.6, 2.4), 'line-opacity': 0.9, 'line-dasharray': [2, 1.5]}}, before);
  map.addLayer({id: 'estate-hover', type: 'line', source: SRC, minzoom: ESTATE_MIN_ZOOM, filter: none, layout: {'line-join': 'round'},
    paint: {'line-color': colors.hover || '#347DA8', 'line-width': width(2, 2.6, 3.4)}}, before);
  map.addLayer({id: 'estate-selected-casing', type: 'line', source: SRC, filter: none, layout: {'line-join': 'round'},
    paint: {'line-color': colors.halo || '#FFFFFF', 'line-width': width(4.4, 5.6, 6.8), 'line-opacity': 0.9}}, before);
  map.addLayer({id: 'estate-selected', type: 'line', source: SRC, filter: none, layout: {'line-join': 'round'},
    paint: {'line-color': colors.selected || '#176B82', 'line-width': width(2.4, 3.2, 4)}}, before);
  let selected = '', hovered = '';
  return {
    select(id = '') {
      if (id === selected) return;
      selected = id;
      for (const l of ['estate-selected-casing', 'estate-selected']) if (map.getLayer(l)) map.setFilter(l, only(id));
    },
    hover(id = '') { const next = id === selected ? '' : id; if (next === hovered) return; hovered = next; if (map.getLayer('estate-hover')) map.setFilter('estate-hover', only(next)); },
    /** The estate under a screen point ('' when none, or below ESTATE_MIN_ZOOM). */
    hitTest(point) {
      if (!map.getLayer('estate-hit') || map.getZoom() < ESTATE_MIN_ZOOM) return '';
      return String(map.queryRenderedFeatures(point, {layers: ['estate-hit']})[0]?.properties?.id || '');
    },
    dispose() { for (const l of LAYERS) if (map.getLayer(l)) map.removeLayer(l); if (map.getSource(SRC)) map.removeSource(SRC); },
  };
}
