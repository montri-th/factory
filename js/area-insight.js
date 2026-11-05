/**
 * First Aha: where the workforce of the factories with 95+ workers concentrates — the top เขต/อำเภอ of the leading
 * province — and which industries it works in.
 *
 * Measure: Σ workers of the registrations per district by default (DIW-reported workers, LDS `count`), or
 * registrations (`count`) when the reader switches the measure. The figure is “how many workers the DIW registry
 * records at registrations with 95+ workers”, never employment of the district, a labour market or a density.
 *
 * One 3D frame: the leading province is the province holding the most of the measure among rows placed at district
 * level; the Aha shows up to three districts of that province with the most of it (one coherent city scene) and
 * their share of the province's whole total in the selection (`homeValue`: placed rows and rows the source places
 * only at province level) — numerator and denominator stated. The focus is never every district that holds the
 * measure (a province with N ≤ 3 such districts shows its top N − 1; “100% in all of them” says nothing). The
 * district with the most of the measure outside that province is the third finding.
 *
 * Ties: the focus never cuts through a tie. When the district after the last one shown has the same value, only
 * the districts strictly above that value are shown (possibly one, possibly none). With none — every district of
 * the province holds the same value — the Aha says the measure is spread (`spread`), not concentrated. The outside
 * finding lists every district tied at its top value.
 *
 * Industry (the second line): the industry families of the focus rows ranked by the measure, each with its share of
 * the focus total (numerator and denominator in the title and the accessible text). A family is a fixed grouping of
 * the official DIW industry groups (scripts/build-data.py#FAMILIES).
 *
 * Snapshot values in the handoff JSON are regression fixtures, never UI constants.
 */
import {summarizeAreas, byMetric} from './areas.js';
import {valueOf, rowValue, familyShares} from './model.js';

export const INDUSTRY_LIMIT = 3;

export function summarizeAreaInsight(rows = [], index, {limit = 3, metric = 'workers', families = []} = {}) {
  const selected = Array.isArray(rows) ? rows : [];
  const summaries = summarizeAreas(selected, index).map(a => ({...a, value: valueOf(a, metric)}));
  const ranked = summaries.filter(a => a.value > 0).sort(byMetric(metric));
  const placedBy = new Map();
  for (const r of selected) if (r.area && r.province) placedBy.set(r.province, (placedBy.get(r.province) || 0) + rowValue(r, metric));
  const home = [...placedBy].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] || '';
  const homeRanked = ranked.filter(a => a.province === home);
  const cap = Math.min(limit, Math.max(1, homeRanked.length - 1));
  let areas = homeRanked.slice(0, cap);
  const cut = homeRanked[cap];
  if (cut && areas.at(-1).value === cut.value) areas = areas.filter(a => a.value > cut.value);
  const spread = !areas.length && homeRanked.length ? {areas: homeRanked.length, value: homeRanked[0].value} : null;
  const ids = new Set(areas.map(a => a.id));
  const value = areas.reduce((s, a) => s + a.value, 0);
  const homeRows = home ? selected.filter(r => r.province === home) : [];
  const homePlaced = homeRows.filter(r => r.area);
  const focusRows = homePlaced.filter(r => ids.has(r.area));
  const sum = list => list.reduce((s, r) => s + rowValue(r, metric), 0);
  const homePlacedValue = sum(homePlaced), homeValue = sum(homeRows);
  const outsideRanked = ranked.filter(a => a.province !== home);
  const outsideTop = outsideRanked.filter(a => a.value === outsideRanked[0]?.value);
  const outsideRows = outsideTop.length === 1 ? selected.filter(r => r.area === outsideTop[0].id) : [];
  return {
    mode: metric, metric, areas, areaIds: areas.map(a => a.id), home, value, count: focusRows.length, workers: focusRows.reduce((s, r) => s + (r.workers || 0), 0),
    spread, homeAreaIds: homeRanked.map(a => a.id),
    homeRows: homeRows.length, homeValue, homePlaced: homePlaced.length, homePlacedValue, homeUnplaced: homeRows.length - homePlaced.length,
    homeUnplacedValue: sum(homeRows.filter(r => !r.area)),
    share: homeValue ? (value / homeValue) * 100 : 0,
    industry: families.length && focusRows.length ? familyShares(focusRows, families, metric, INDUSTRY_LIMIT) : {base: 0, list: []},
    totalRows: selected.length, placedRows: selected.filter(r => r.area).length, areaCount: summaries.length,
    outside: outsideTop.length ? {id: outsideTop[0].id, name: outsideTop[0].name, province: outsideTop[0].province, value: outsideTop[0].value,
      count: outsideTop[0].count, tied: outsideTop.map(a => ({id: a.id, name: a.name, province: a.province})),
      industry: families.length && outsideRows.length ? familyShares(outsideRows, families, metric, 1) : {base: 0, list: []}} : null,
  };
}

/** Rows inside a set of district ids (membership = the row's own matched district). */
export function filterAreaRows(rows, areaIdsSet) {
  if (!(areaIdsSet instanceof Set) || !areaIdsSet.size) return [];
  return (Array.isArray(rows) ? rows : []).filter(r => areaIdsSet.has(r.area));
}
