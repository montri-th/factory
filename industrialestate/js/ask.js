/**
 * Contextual outbound actions: the next question a reader has at each view, answered outside the demo.
 *
 *  - ถาม Google AI — Google Search with a question written for the view: an estate (who develops it, which
 *    industries and companies are in it, land and rent, utilities and news), a province (its estates and new
 *    investment), the overview (where industrial land is growing). Google answers at the top of the results (AI Overview);
 *    never a link straight into AI Mode (`udm=50`): Google stops one that comes from another site (Hotel 0.3.3).
 *  - Google Maps — a search by the estate's name and province.
 * Pure: builds labels and https URLs from public names only (no user data, no internal ids). An English page asks in
 * English with the record's English name when the source gives one.
 */
import {LANG} from './shell/i18n.js';
import {provinceName} from './model.js';

const enc = encodeURIComponent;
export const googleAskURL = q => `https://www.google.com/search?q=${enc(q)}`;
export const mapsSearchURL = q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** ctx: {kind: 'estate'|'province'|'overview', estate?, province?} → [{id, label, href}] in display order. */
export function contextActions(ctx = {}, lang = LANG) {
  const out = [];
  const add = (id, label, href) => { if (href) out.push({id, label, href}); };
  const en = lang === 'en';
  if (ctx.kind === 'estate' && ctx.estate) {
    const e = ctx.estate, place = provinceName(e.province);
    const name = clean(en && e.nameEn ? e.nameEn : e.name);
    add('ai', 'ถาม Google AI', googleAskURL(en
      ? `${name} (${place}, Thailand): who develops it, which industries and companies are there, land price or rent, utilities, and recent news?`
      : `${name} จังหวัด${place} ใครเป็นผู้พัฒนา มีอุตสาหกรรมและบริษัทอะไรอยู่บ้าง ราคาที่ดินหรือค่าเช่าเท่าไร สาธารณูปโภคเป็นอย่างไร และมีข่าวล่าสุดอะไร`));
    add('maps', 'Google Maps', mapsSearchURL(`${clean(e.name)} ${clean(provinceByName(e))}`));
  } else if (ctx.kind === 'province' && ctx.province) {
    add('ai', 'ถาม Google AI', googleAskURL(en
      ? `Industrial estates in ${clean(ctx.province)}, Thailand: which are the main ones, which industries do they hold, and where is new factory investment going?`
      : `นิคมอุตสาหกรรมใน${clean(ctx.province)} มีที่ไหนบ้าง อุตสาหกรรมหลักคืออะไร และการลงทุนโรงงานใหม่ไปที่ไหน`));
    add('maps', 'Google Maps', mapsSearchURL(`นิคมอุตสาหกรรม ${clean(ctx.province)}`));
  } else if (ctx.kind === 'overview') {
    add('ai', 'ถาม Google AI', googleAskURL(en
      ? 'Industrial estates in Thailand: where is industrial land growing, which developers lead, and how are land prices and occupancy changing?'
      : 'นิคมอุตสาหกรรมในไทยล่าสุด พื้นที่ไหนกำลังโต ผู้พัฒนารายใหญ่คือใคร และราคาที่ดินกับอัตราการขายพื้นที่เปลี่ยนไปอย่างไร'));
  }
  return out;
}
const provinceByName = e => provinceName(e.province);

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** The action bar (icon + short label). '' when nothing applies. */
export function actionBar(ctx) {
  const list = contextActions(ctx);
  if (!list.length) return '';
  return `<div class="ask-bar" role="group" aria-label="ค้นต่อใน Google">${list.map(a => `<a class="ask-link ask-${esc(a.id)}" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer"><i class="pictogram pic-${a.id === 'ai' ? 'ai' : 'maps'}" aria-hidden="true"></i><span>${esc(a.label)}</span></a>`).join('')}</div>`;
}
