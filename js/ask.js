/**
 * Contextual outbound actions: the next question a reader has at each view, answered outside the demo.
 *
 *  - ถาม Google AI — Google Search with a question written for the view: a factory registration (is it still running,
 *    what it makes, how many people work there, recent expansion or lay-off news), a district (its industries, its
 *    workforce, housing and shops round the plants, new or closed plants), a building, or the country/province overview
 *    (investment and closures). Google answers at the top of the results (AI Overview) and its AI Mode tab carries the
 *    question on. Never a link straight into AI Mode (`udm=50`): Google stops one that comes from another site at
 *    “Continue with this search?” (Hotel 0.3.3, measured 2026-11-02);
 *  - Street View — only where the view has a point (a registration's source point; the label says “Street View”);
 *  - Google Maps — a search by the registration's name + district + province (or “โรงงาน” + place).
 *
 * Pure: builds labels and https URLs from public names only (no user data, no internal ids). A registration whose name
 * is a natural person's is never searched by name (js/panel.js passes it as an area). The Google names on the buttons
 * say where the answers come from (no caveat lines).
 * An English page (citymeter-shell 0.5.x) asks Google AI in English, with the English area names the data gives
 * (js/lang.js); a registration keeps its Thai name (the register has no English one), and Google Maps keeps the Thai
 * search. The button labels are translated by js/shell/i18n.js.
 */
import {LANG, englishName} from './shell/i18n.js';

const enc = encodeURIComponent;
export const googleAskURL = q => `https://www.google.com/search?q=${enc(q)}`;
export const mapsSearchURL = q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
export const streetViewURL = (lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon)
  ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}` : '');

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const join = (...parts) => clean(parts.filter(Boolean).join(' '));
/**
 * ctx: {kind: 'factory'|'building'|'area'|'overview', row?, area?: {place, province}, province?, point?: {lat, lon, role}, rows?}
 * → [{id, label, href, note}] in display order (only the actions that apply).
 */
export function contextActions(ctx = {}, lang = LANG) {
  const out = [], place = ctx.area ? join(ctx.area.place, ctx.area.province) : '';
  const add = (id, label, href, note = '') => { if (href) out.push({id, label, href, note}); };
  const named = r => (r && !r.person ? clean(r.name || r.op) : '');
  if (lang === 'en') englishQuestions(ctx, add, named);
  else if (ctx.kind === 'factory' && named(ctx.row)) {
    const name = named(ctx.row);
    add('ai', 'ถาม Google AI', googleAskURL(`${join(name, place ? `(${place})` : '')} ยังเปิดดำเนินการอยู่ไหม ผลิตอะไร มีพนักงานประมาณกี่คน และมีข่าวขยายโรงงานหรือลดคนล่าสุดไหม`));
    add('maps', 'Google Maps', mapsSearchURL(join(name, ctx.area?.place, ctx.area?.province)));
  } else if (ctx.kind === 'building') {
    const names = [...new Set((ctx.rows || []).map(named).filter(Boolean))].slice(0, 2);
    if (names.length) add('ai', 'ถาม Google AI', googleAskURL(`${join(names.join(' และ '), place)} อยู่อาคารเดียวกันไหม และในอาคารนี้มีโรงงานอะไรอีกบ้าง`));
  } else if (ctx.kind === 'area' && ctx.area) {
    add('ai', 'ถาม Google AI', googleAskURL(`โรงงานใน${clean(ctx.area.place)} ${clean(ctx.area.province)} มีอุตสาหกรรมอะไรเด่น คนงานส่วนใหญ่พักที่ไหน ร้านค้าและบริการรอบโรงงานเป็นอย่างไร และมีโรงงานเปิดใหม่หรือปิดล่าสุดไหม`.replace(/\s+/g, ' ')));
    add('maps', 'Google Maps', mapsSearchURL(`โรงงาน ${join(ctx.area.place, ctx.area.province)}`));
  } else if (ctx.kind === 'overview') {
    const where = clean(ctx.province) || 'ประเทศไทย';
    add('ai', 'ถาม Google AI', googleAskURL(`ภาพรวมโรงงานและแรงงานภาคอุตสาหกรรมใน${where}ล่าสุด มีการลงทุนโรงงานใหม่ ขยาย หรือปิดโรงงานที่ไหนบ้าง`));
  }
  const p = ctx.point;
  if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    add('streetview', 'Street View', streetViewURL(p.lat, p.lon));
  }
  return out;
}

/** The Google AI questions of an English page (the Maps searches stay the Thai ones). */
function englishQuestions(ctx, add, named) {
  const N = s => englishName(clean(s));
  const where = ctx.area ? [N(ctx.area.place), N(ctx.area.province)].filter(Boolean).join(', ') : '';
  if (ctx.kind === 'factory' && named(ctx.row)) {
    const name = named(ctx.row);
    add('ai', 'ถาม Google AI', googleAskURL(`${name}${where ? ` (${where})` : ''}: is it still operating, what does it make, about how many people work there, and is there recent news of an expansion or lay-offs?`));
    add('maps', 'Google Maps', mapsSearchURL(join(name, ctx.area?.place, ctx.area?.province)));
  } else if (ctx.kind === 'building') {
    const names = [...new Set((ctx.rows || []).map(named).filter(Boolean))].slice(0, 2);
    if (names.length) add('ai', 'ถาม Google AI', googleAskURL(`Are ${names.join(' and ')}${where ? ` (${where})` : ''} in the same building, and which other factories are in it?`));
  } else if (ctx.kind === 'area' && ctx.area) {
    add('ai', 'ถาม Google AI', googleAskURL(`Factories in ${where}: which industries stand out, where do most of the workers live, what are the shops and services around the factories like, and have factories opened or closed recently?`));
    add('maps', 'Google Maps', mapsSearchURL(`โรงงาน ${join(ctx.area.place, ctx.area.province)}`));
  } else if (ctx.kind === 'overview') {
    const place = N(ctx.province) || 'Thailand';
    add('ai', 'ถาม Google AI', googleAskURL(`Latest overview of factories and industrial workers in ${place}: where has there been new factory investment, expansion or closures?`));
  }
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** The action bar (icon + short label). '' when nothing applies. */
export function actionBar(ctx) {
  const list = contextActions(ctx);
  if (!list.length) return '';
  return `<div class="ask-bar" role="group" aria-label="ค้นต่อใน Google">${list.map(a => `<a class="ask-link ask-${esc(a.id)}" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer"${a.note ? ` title="${esc(a.note)}"` : ''}><i class="pictogram pic-${a.id === 'ai' ? 'ai' : a.id === 'streetview' ? 'streetview' : 'maps'}" aria-hidden="true"></i><span>${esc(a.label)}</span></a>`).join('')}</div>`;
}
