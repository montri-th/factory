/**
 * Breadcrumb — ประเทศไทย › จังหวัด › เขต/อำเภอ — the CityMETER production hierarchy.
 *
 * Production routes (observed in the landometer.com/v3 bundle, 2026-10-22: ViewMode = {D, S, M, L};
 * lv1 = province abbrEn, lv2 = one typed level):
 *   /v3/citymeter/{abbrEn}                         e.g. BKK
 *   /v3/citymeter/{abbrEn}/D/{district code}       เขต/อำเภอ (DOPA code, e.g. 1039)
 * Production has a hotel dataset (`?d=hotel`: dataset code `hotel` in the production bundle, checked 2026-11-01),
 * so every link opens the same place with it. The demo is static, so it serialises the same ids as query
 * parameters: ?province=BKK&area=1039 — every administrative crumb also carries the production deep link.
 *
 * A hotel or a station is the panel heading, never a crumb — a hotel's crumbs are its own matched district and
 * province (a row placed only at province level stops there).
 */
import {provinceByCode, productionLink} from './model.js';
import {areaWord} from './areas.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Pure model. province = production code or ''; area = index record or null. */
export function buildBreadcrumb({province = '', area = null} = {}) {
  const crumbs = [{level: 'country', label: 'ประเทศไทย', action: 'crumb-country', href: productionLink()}];
  const code = area?.province || province || '';
  const p = provinceByCode(code);
  if (p) crumbs.push({level: 'province', label: p.th, id: p.code, action: 'crumb-province', href: productionLink({province: p.code})});
  if (area) crumbs.push({level: 'area', label: `${areaWord(code)}${area.name}`, id: area.id, action: 'crumb-area', href: productionLink({province: code, area: area.id})});
  crumbs[crumbs.length - 1].current = true;
  return crumbs;
}

/**
 * HTML for the panel header; the last crumb is the current level (aria-current).
 * With four levels the upper ones fold behind “…” on narrow screens.
 */
export function renderBreadcrumb(crumbs) {
  const collapsible = crumbs.length >= 4;
  const items = crumbs.map((c, i) => {
    const fold = collapsible && i < crumbs.length - 2;
    const inner = c.current
      ? `<span class="crumb is-current" aria-current="location">${esc(c.label)}</span>`
      : `<button type="button" class="crumb" data-action="${esc(c.action)}" data-id="${esc(c.id || '')}">${esc(c.label)}</button>`;
    return `<li${fold ? ' class="is-collapsible"' : ''}>${inner}</li>`;
  });
  if (collapsible) items.splice(crumbs.length - 2, 0, '<li class="crumb-ellipsis"><button type="button" class="crumb crumb-more" data-action="crumb-expand" aria-expanded="false" aria-label="แสดงระดับบน">…</button></li>');
  return `<ol class="crumbs${collapsible ? ' is-collapsible' : ''}">${items.join('')}</ol>`;
}

/** Compact text form for the mobile map card and the document title. */
export const breadcrumbText = crumbs => crumbs.map(c => c.label).join(' › ');

/** Production deep link of the deepest administrative crumb (for “ดูใน CityMETER”). */
export const productionHref = crumbs => [...crumbs].reverse().find(c => c.href)?.href || productionLink();
