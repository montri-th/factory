/**
 * Industrial Estate · page language (citymeter-shell, js/shell/i18n.js). js/app.js imports this module first, so an
 * English page is translated before anything renders. The static words of the page are in js/lang-en.js; the panels
 * are written in the page language directly (js/model.js#T). Names come from the data's own English only: an estate's
 * name_en (the research master), the provinces' English names (data/area-index.json); a name without English stays Thai
 * (keepThai) — directory names and the names of the factory registrations are as the sources write them.
 */
import {LANG, registerDictionary, registerNames, keepThai, startTranslation} from './shell/i18n.js';
import ESTATE_EN from './lang-en.js';

const THAI = /[ก-ฺเ-๎]/;

if (LANG === 'en') {
  registerDictionary(ESTATE_EN);
  startTranslation();
  const note = () => {
    const intro = document.querySelector('.usage-dialog .help-intro');
    if (!intro || document.getElementById('draft-english-note')) return;
    const p = document.createElement('p');
    p.id = 'draft-english-note';
    p.className = 'help-intro';
    p.textContent = 'English is a draft translation from the Thai. Estate names are in English where the research register gives one; directory names and factory names stay as the sources write them. The product statement is in Thai.';
    intro.after(p);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', note, {once: true}); else note();
}

/** Register the English the data carries (estates' name_en, provinces' English names). */
export function registerDataNames({index, data}) {
  if (LANG !== 'en') return;
  const pairs = [];
  for (const p of index?.provinces || []) if (p.nameEn) pairs.push([p.name, p.nameEn], [`จังหวัด${p.name}`, p.nameEn]);
  const thai = new Set();
  for (const e of data?.estates || []) {
    if (!e.name || !THAI.test(e.name)) continue;
    if (e.nameEn && !THAI.test(e.nameEn)) pairs.push([e.name, e.nameEn]); else thai.add(e.name);
    for (const a of e.aliases || []) if (THAI.test(a)) thai.add(a);
  }
  registerNames(pairs);
  keepThai(thai);
}

/** Thai text the page keeps as it is on an English page (directory and factory names). */
export function keepNames(names) {
  if (LANG !== 'en') return;
  keepThai(new Set([...names].filter(n => n && THAI.test(n))));
}
