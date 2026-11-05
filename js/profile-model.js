/**
 * Reading-panel view models. Pure: no DOM, no map.
 *
 * Every profile reads `scopeRows` (filters before any area selection) so ranks and comparisons keep the whole
 * selection as reference. A row is one FID of the core registry 02_FACTORIES (every size); the default measure is
 * Σ workers (registrations without a worker figure add nothing), the other registrations (“ทะเบียน”). District
 * membership is the matched production code of the registration's own district label (row.admin); points are source
 * points, never upgraded. The 95+ lens (row.p90) and the functional classes are read from the same rows.
 *
 * Distances (nearby factories) are straight lines between source points, computed here from the published
 * coordinates; they are not travel times, commuting zones or catchments.
 */
import {mixOf, sizeMixOf, lensOf, classMixOf, hasPoint, valueOf, rowValue} from './model.js';
import {summarizeAreas, byMetric, levelWords} from './areas.js';

const COLLATOR = new Intl.Collator('th');
/** Lists: most workers first, then name, then FID — the size is the order users scan by. */
export const listOrder = (a, b) => (b.workers || 0) - (a.workers || 0) || COLLATOR.compare(a.title || '', b.title || '') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371008.8, rad = Math.PI / 180;
  const p1 = lat1 * rad, p2 = lat2 * rad, dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const sum = (rows, metric) => rows.reduce((s, r) => s + rowValue(r, metric), 0);

/** Official DIW industry groups present in rows, most of the measure first (then the other measure, then name). */
export function industriesIn(rows, limit = 12, metric = 'workers') {
  const m = new Map();
  for (const r of rows) {
    const g = r.industry;
    if (!g) continue;
    const e = m.get(g.index) || {industry: g, count: 0, workers: 0, figured: 0};
    e.count++;
    if (r.workers != null) { e.figured++; e.workers += r.workers; }
    m.set(g.index, e);
  }
  const key = metric === 'count' ? ['count', 'workers'] : ['workers', 'count'];
  return [...m.values()].map(e => ({...e, value: e[key[0]]}))
    .sort((a, b) => b[key[0]] - a[key[0]] || b[key[1]] - a[key[1]] || COLLATOR.compare(a.industry.th, b.industry.th)).slice(0, limit);
}

/** Districts of a selection ranked by the measure (ties: the other measure, then name). */
export function rankAreas(rows, index, {province = '', metric = 'workers'} = {}) {
  return summarizeAreas(rows, index, {province}).map(a => ({...a, value: valueOf(a, metric)})).sort(byMetric(metric));
}

/** Rows of the selection that no district holds (their own district label names no district of their province). */
export function unplacedOf(rows) {
  let noArea = 0, noProvince = 0, workers = 0;
  for (const r of rows) {
    if (r.area) continue;
    workers += r.workers || 0;
    if (r.province) noArea++; else noProvince++;
  }
  return {noArea, noProvince, workers, total: noArea + noProvince};
}

/** The industrial-area register (01_ESTATES) of a province, by type then name; the whole register without one. */
export function estatesOf(estates, province = '') {
  const list = (estates || []).filter(e => !province || e.province === province);
  const types = new Map();
  for (const e of list) types.set(e.type, (types.get(e.type) || 0) + 1);
  return {list, total: list.length, types: [...types].map(([type, count]) => ({type, count})).sort((a, b) => b.count - a.count || COLLATOR.compare(a.type, b.type))};
}

/** The overview of the scope (the country, or the province of the จังหวัด filter). */
export function buildOverview(scopeRows, index, {province = '', families = [], metric = 'workers', classes = [], estates = []} = {}) {
  return {ranking: rankAreas(scopeRows, index, {province, metric}), industries: industriesIn(scopeRows, 8, metric), unplaced: unplacedOf(scopeRows),
    mix: mixOf(scopeRows, families), sizes: sizeMixOf(scopeRows), count: scopeRows.length, workers: sum(scopeRows, 'workers'),
    figured: scopeRows.filter(r => r.workers != null).length, points: scopeRows.filter(hasPoint).length,
    lens: lensOf(scopeRows), classes: classMixOf(scopeRows, classes), estates: estatesOf(estates, province)};
}

/**
 * EVID-05 state of a selection: every district is in the national scope of the registry, so a district with no
 * registration is a measured zero of this dataset (“0 ที่พบ”), never no_data.
 */
const selectionState = count => (count ? 'measured' : 'measured_zero');

export function buildAreaProfile(scopeRows, areaId, index, families, {metric = 'workers', classes = [], estates = []} = {}) {
  const area = index.byId.get(areaId);
  if (!area) return null;
  const ranking = rankAreas(scopeRows, index, {metric});
  const inProvince = ranking.filter(a => a.province === area.province);
  const mine = scopeRows.filter(r => r.area === areaId);
  // Share of the province's whole total in the scope (placed rows and rows placed only at province level).
  const provinceRows = scopeRows.filter(r => r.province === area.province);
  const pos = ranking.findIndex(a => a.id === areaId);
  const posProvince = inProvince.findIndex(a => a.id === areaId);
  const value = sum(mine, metric), provinceValue = sum(provinceRows, metric);
  return {
    area, words: levelWords(area.province), metric, value, count: mine.length, workers: sum(mine, 'workers'),
    figured: mine.filter(r => r.workers != null).length,
    km2: area.km2, coverageState: selectionState(mine.length), scopeCount: scopeRows.length,
    rank: pos >= 0 && value > 0 ? pos + 1 : null, rankOf: ranking.filter(a => a.value > 0).length,
    rankProvince: posProvince >= 0 && value > 0 ? posProvince + 1 : null, rankProvinceOf: inProvince.filter(a => a.value > 0).length,
    provinceValue, share: provinceValue ? (value / provinceValue) * 100 : null,
    points: mine.filter(hasPoint).length, ...mixOf(mine, families), sizes: sizeMixOf(mine), industries: industriesIn(mine, 8, metric),
    big: mine.filter(r => r.workers >= 1000).length,
    lens: lensOf(mine), classes: classMixOf(mine, classes), estates: estatesOf(estates, area.province),
    rows: [...mine].sort(listOrder),
  };
}

/**
 * A building the map draws, with the rows whose points fall inside it (building-join.js):
 * sel = {key, kind, rows, height}. Not a site: no name.
 */
export function buildBuildingProfile(sel, index, families) {
  if (!sel?.rows?.length) return null;
  const rows = [...sel.rows].sort(listOrder);
  const area = index.byId.get(rows[0].area) || null;
  const areaIds = [...new Set(rows.map(r => r.area))];
  return {key: sel.key, kind: sel.kind || 'osm', rows, count: rows.length, workers: sum(rows, 'workers'),
    area, areaCount: areaIds.length, words: levelWords(rows[0].province), height: Number.isFinite(sel.height) ? sel.height : null,
    ...mixOf(rows, families)};
}

export const NEARBY_RADIUS_M = 3000;
export const NEARBY_LIMIT = 10;

/**
 * Nearby comparison set of a registration (a screening aid, not a labour-market study): registrations with a point
 * within NEARBY_RADIUS_M in a straight line, of the same industry family, whose workers are within half to double its
 * own (any size when its own figure is missing or 0 — `rule.min` null), nearest first. Every registration of the dataset
 * within the radius (any family) is stated beside it. Reads every row of the dataset (`allRows`), so the set does not
 * move with the filters.
 */
export function nearbyOf(row, allRows, {radius = NEARBY_RADIUS_M, limit = NEARBY_LIMIT} = {}) {
  if (!hasPoint(row)) return null;
  const sized = row.workers > 0;
  const dLat = radius / 110574, dLon = radius / (111320 * Math.cos((row.latitude * Math.PI) / 180));
  const near = [];
  let count = 0, workers = 0;
  for (const r of allRows) {
    if (r === row || !hasPoint(r)) continue;
    if (Math.abs(r.latitude - row.latitude) > dLat || Math.abs(r.longitude - row.longitude) > dLon) continue;
    const m = distanceM(row.latitude, row.longitude, r.latitude, r.longitude);
    if (m > radius) continue;
    count++; workers += r.workers || 0;
    const sizeOK = !sized || (r.workers >= row.workers / 2 && r.workers <= row.workers * 2);
    if (r.group === row.group && sizeOK) near.push({row: r, m});
  }
  near.sort((a, b) => a.m - b.m || listOrder(a.row, b.row));
  return {radius, around: {count, workers}, matches: near.length, rows: near.slice(0, limit),
    rule: {group: row.group, min: sized ? Math.ceil(row.workers / 2) : null, max: sized ? row.workers * 2 : null}};
}

/** Registration detail: the nearby set, the other registrations of its district, and its building on the map. */
export function buildFactoryDetail(row, {scopeRows, allRows, index, families, building = null}) {
  if (!row) return null;
  const area = row.area ? index.byId.get(row.area) || null : null;
  const sameArea = row.area ? scopeRows.filter(r => r.area === row.area && r.id !== row.id) : [];
  return {row, area, words: levelWords(row.province), family: families[row.group], building,
    nearby: nearbyOf(row, allRows), rankOf: allRows.filter(r => r.workers != null).length,
    sameArea: {count: sameArea.length, workers: sum(sameArea, 'workers')}};
}
