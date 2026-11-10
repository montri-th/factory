/**
 * Factory sites (release 0.7.0; owner 2026-11-10 08:17 “อนุมัติครับ” to boundary_source `osm_polygon_auto`, after the
 * owner's question 07:37 “ของเรา join ได้อาคารเล็กๆมานิดเดียวไม่ได้ทั้งกลุ่มอาคารทั้งหมดของโรงงาน ทำไงดี”).
 *
 * A registration whose published point lies in an OpenStreetMap factory area (man_made=works, landuse=industrial or an
 * industrial=* area; not an estate-wide area) that holds no other published point of this dataset carries its site:
 * the interior points of the drawn buildings inside that area (data/factory-sites.json, written by
 * scripts/build-sites.py from the research site rows). The map shows every building that holds one of those points as
 * the factory's buildings (js/shell/building-join.js#buildingsAtPoints); the area itself stays in the research sheet.
 * A site is a group of buildings for the map — never a deed, a land area, ownership, a count of factories or workers.
 */
export const SITES_CONTRACT = 'factory-sites/1.0.0';

const okPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
  p[1] >= 5 && p[1] <= 21 && p[0] >= 97 && p[0] <= 106;

/**
 * data/factory-sites.json → Map registration id → {points, n, on, osmOn, source, url, credit}; null for a missing file or
 * another contract. A site keeps at least two building points (one building is not a site).
 */
export function decodeSites(json) {
  if (!json || json.meta?.contract !== SITES_CONTRACT || !json.sites || typeof json.sites !== 'object') return null;
  const sources = json.meta.sources || {}, credits = json.meta.credits || {};
  const osmOn = typeof json.meta.osmOn === 'string' ? json.meta.osmOn : '';
  const out = new Map();
  for (const [id, s] of Object.entries(json.sites)) {
    const points = Array.isArray(s?.pts) ? s.pts.filter(okPoint) : [];
    if (points.length < 2) continue;
    const credit = credits[s.src];
    out.set(id, Object.freeze({
      points,
      n: Number.isInteger(s.n) && s.n >= points.length ? s.n : points.length,
      on: typeof s.on === 'string' ? s.on : '',
      osmOn,
      source: sources[s.src] || '',
      url: typeof s.url === 'string' && /^https:\/\/www\.openstreetmap\.org\/(way|relation)\/\d+$/.test(s.url) ? s.url : '',
      credit: credit?.url ? Object.freeze({text: credit.text || '', url: credit.url}) : null,
    }));
  }
  return out;
}

/** Each site onto its registration: only a row with a published point, never a natural person's. Returns how many. */
export function attachSites(sites, rowById) {
  let n = 0;
  if (!sites || !rowById) return 0;
  for (const [id, site] of sites) {
    const r = rowById.get(id);
    if (!r || r.person || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    r.site = site;
    n++;
  }
  return n;
}

/** Half-size (m) of the square round a registration's pin that holds every building of its site plus `margin`; 0 without one. */
export function siteReach(r, margin = 80) {
  if (!r?.site?.points?.length || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return 0;
  const kx = 111320 * Math.cos((r.latitude * Math.PI) / 180), ky = 110574;
  return margin + Math.max(...r.site.points.map(([lon, lat]) => Math.max(Math.abs(lon - r.longitude) * kx, Math.abs(lat - r.latitude) * ky)));
}
