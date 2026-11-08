/**
 * citymeter-shell · breadcrumb — ประเทศไทย › จังหวัด › เขต/อำเภอ, the CityMETER production hierarchy.
 *
 * Every administrative crumb carries the production deep link of its level (js/shell/area-path.js#productionHref),
 * so a demo crumb and a production page name the same place. An item, a station or a building is the panel
 * heading, never a crumb (demo-platform-review §5.3). With four levels the upper ones fold behind “…” on narrow
 * screens. The dataset passes its own lookups, so the module knows no dataset:
 *   ctx = {dataset: 'hotel', provinceByCode: code => {code, th} | null, areaWord: provinceCode => 'เขต' | 'อำเภอ'}
 *
 * Part of the shared CityMETER demo shell: edit it in every repository at once (js/shell/manifest.json).
 */
import {productionHref} from './area-path.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Pure model. sel.province = production code or ''; sel.area = an area record ({id, name, province}) or null. */
export function buildBreadcrumb({province = '', area = null} = {}, {dataset = '', provinceByCode = () => null, areaWord = () => ''} = {}) {
  const crumbs = [{level: 'country', label: 'ประเทศไทย', action: 'crumb-country', href: productionHref(dataset)}];
  const code = area?.province || province || '';
  const p = provinceByCode(code);
  if (p) crumbs.push({level: 'province', label: p.th, id: p.code, action: 'crumb-province', href: productionHref(dataset, {province: p.code, kind: 'P'})});
  if (area) {
    crumbs.push({level: 'area', label: `${areaWord(code)}${area.name}`, id: area.id, action: 'crumb-area',
      href: productionHref(dataset, {province: code, kind: 'D', code: area.id})});
  }
  crumbs[crumbs.length - 1].current = true;
  return crumbs;
}

/** HTML for the panel header; the last crumb is the current level (aria-current="location"). */
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

/** Compact text form for the mobile map card. */
export const breadcrumbText = crumbs => crumbs.map(c => c.label).join(' › ');

/** Production deep link of the deepest administrative crumb (for “ดูใน CityMETER”). */
export const deepestHref = (crumbs, dataset = '') => [...crumbs].reverse().find(c => c.href)?.href || productionHref(dataset);
