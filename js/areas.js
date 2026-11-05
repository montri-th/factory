/**
 * Administrative areas: เขต/อำเภอ (DISTRICT, the analytical unit of this product) and จังหวัด (PROVINCE), from
 * CityMETER production base info and boundaries.
 *
 * The index (data/area-index.json) holds every one of the 928 districts and 77 provinces — names, production
 * codes, production areaSqm, a label point and a bbox — without geometry, so ranks, search, breadcrumbs and
 * camera fits work at once. Outlines arrive per province from data/frames/{CODE}.json (js/frames.js) and are
 * attached to the same records (`feature`).
 *
 * Membership is the row's own: the production district its own district label names (row.admin). Nothing is
 * re-assigned here by the displayed point.
 *
 * The figures per district are totals (LDS `count`): Σ workers of the registrations (“คน”) and registrations
 * (“ทะเบียน”). No ratio to the district's area or population is drawn: workers per km² or per resident would read as
 * a density or a labour-market measure this registry is not.
 */
const km2 = sqm => (Number.isFinite(sqm) && sqm > 0 ? sqm / 1e6 : null);

export function buildAreaIndex(json) {
  const byId = new Map(), provinceById = new Map();
  for (const p of json?.provinces || []) {
    provinceById.set(p.id, {id: p.id, code: p.id, dopa: p.code, uuid: p.uuid, name: p.name, nameEn: p.nameEn, km2: km2(p.areaSqm),
      label: p.label || null, bbox: p.bbox || null, areaTotal: p.districts});
  }
  const a = json?.areas || {id: []};
  for (let i = 0; i < a.id.length; i++) {
    const id = a.id[i];
    byId.set(id, {id, name: a.name[i], nameEn: a.nameEn[i] || '', province: a.province[i], km2: km2(a.areaSqm[i]),
      label: a.label[i] || null, bbox: a.bbox[i] || null, feature: null});
  }
  return {byId, provinceById, areas: [...byId.values()], provinces: [...provinceById.values()]};
}

/** Attach the outlines of one province (data/frames/{CODE}.json) to the index records. Returns the area ids attached. */
export function attachFrames(index, frames) {
  const ids = [];
  for (const f of frames?.areas?.features || []) {
    const a = index.byId.get(String(f.id ?? f.properties?.id));
    if (a) { a.feature = f; ids.push(a.id); }
  }
  return ids;
}

/** District word in Bangkok (เขต) vs elsewhere (อำเภอ). */
export const areaWord = province => (province === 'BKK' ? 'เขต' : 'อำเภอ');
export const levelWords = province => ({area: areaWord(province)});
/** The district's own name already starts with เมือง… — "อำเภอเมืองภูเก็ต"; Bangkok: "เขตวัฒนา". */
export const areaLabel = a => (a ? `${areaWord(a.province)}${a.name}` : '');

/** Group rows by a key function into Map<key, rows[]>. */
export function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = key(r); let a = m.get(k); if (!a) m.set(k, a = []); a.push(r); }
  return m;
}

function stats(rows) {
  let points = 0, workers = 0;
  for (const r of rows) {
    if (Number.isFinite(r.latitude)) points++;
    workers += r.workers || 0;
  }
  return {points, workers};
}

/**
 * Per-district summaries for `rows`. With includeEmpty, every frame of `index` (optionally limited to a
 * province) is listed, zero included.
 */
export function summarizeAreas(rows, index, {includeEmpty = false, province = '', grouped = null} = {}) {
  const by = grouped || groupBy(rows.filter(r => r.area), r => r.area);
  const list = [];
  for (const area of index.areas) {
    if (province && area.province !== province) continue;
    const members = by.get(area.id) || [];
    if (!includeEmpty && !members.length) continue;
    list.push({...area, rows: members, count: members.length, ...stats(members)});
  }
  return list;
}

const COLLATOR = new Intl.Collator('th');
/** Stable ordering by registrations (desc), then workers, then name. */
export const byCount = (a, b) => b.count - a.count || (b.workers ?? 0) - (a.workers ?? 0) || COLLATOR.compare(a.name, b.name) || String(a.id).localeCompare(String(b.id));
/** Stable ordering by workers (desc), then registrations, then name. */
export const byWorkers = (a, b) => (b.workers ?? 0) - (a.workers ?? 0) || b.count - a.count || COLLATOR.compare(a.name, b.name) || String(a.id).localeCompare(String(b.id));
/** The ordering of a measure ('workers' | 'count'). */
export const byMetric = metric => (metric === 'count' ? byCount : byWorkers);

/** Bounds-like [[w, s], [e, n]] of a record: its loaded outline, else its index bbox. */
export function recordBounds(record) {
  const g = record?.feature?.geometry;
  if (g) {
    let w = 180, s = 90, e = -180, n = -90;
    const walk = v => { if (typeof v[0] === 'number') { if (v[0] < w) w = v[0]; if (v[0] > e) e = v[0]; if (v[1] < s) s = v[1]; if (v[1] > n) n = v[1]; } else v.forEach(walk); };
    walk(g.coordinates);
    return [[w, s], [e, n]];
  }
  const b = record?.bbox;
  return Array.isArray(b) ? [[b[0], b[1]], [b[2], b[3]]] : null;
}

/**
 * Point → district id among the LOADED outlines, for DISPLAY only (where to anchor a label that is on
 * screen). Never membership: a row's district is always the code matched at build time.
 */
export function areaLocator(index) {
  const inRing = ([x, y], ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const items = index.areas.filter(a => a.feature).map(a => {
    const g = a.feature.geometry;
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    return {id: a.id, polys, w, s, e, n};
  });
  return ([x, y]) => {
    for (const it of items) {
      if (x < it.w || x > it.e || y < it.s || y > it.n) continue;
      if (it.polys.some(p => inRing([x, y], p[0]) && !p.slice(1).some(h => inRing([x, y], h)))) return it.id;
    }
    return '';
  };
}
