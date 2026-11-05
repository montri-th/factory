/**
 * Chart models — every chart describes scopeRows (filters before any area selection) over the same membership as
 * the map (the row's own matched district) and the same measure (Σ workers, or registrations). Ranking and top-N
 * trimming happen only after every district has been summarised.
 */
import {rankAreas, industriesIn} from './profile-model.js';
import {rowValue} from './model.js';

export function buildChartModel(rows, index, groups, {limit = 20, metric = 'workers'} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const ranking = rankAreas(list, index, {metric}).filter(a => a.value > 0);
  const unplaced = list.filter(r => !r.area);
  return {metric, areas: ranking.slice(0, limit), totalAreas: ranking.length, values: ranking.map(a => a.value), groups, totalRows: list.length,
    placedRows: list.length - unplaced.length, unplacedValue: unplaced.reduce((s, r) => s + rowValue(r, metric), 0)};
}

/** District × industry family matrix of the measure (equal cells; zero is a measured 0 in this selection). */
export function areaMatrix(model, {areaLimit = 12} = {}) {
  const areas = model.areas.slice(0, areaLimit);
  const groups = model.groups;
  const cells = areas.flatMap(a => {
    const values = new Array(groups.length).fill(0), counts = new Array(groups.length).fill(0), figured = new Array(groups.length).fill(0);
    for (const r of a.rows) { values[r.group] += rowValue(r, model.metric); counts[r.group]++; if (r.workers != null) figured[r.group]++; }
    return groups.map(g => ({areaId: a.id, areaName: a.name, groupId: g.id, group: g.index, groupName: g.th, value: values[g.index], count: counts[g.index],
      figured: figured[g.index], total: a.value}));
  });
  return {areas, groups, cells, max: Math.max(0, ...cells.map(c => c.value))};
}

/** Official DIW industry groups of the selection ranked by the measure; every group counted, the list cut after ranking. */
export function industryRanking(rows, {limit = 22, metric = 'workers'} = {}) {
  const all = industriesIn(Array.isArray(rows) ? rows : [], Infinity, metric);
  return {industries: all.slice(0, limit), total: all.length};
}
