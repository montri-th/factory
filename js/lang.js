/**
 * Factory · page language (citymeter-shell, js/shell/i18n.js). js/app.js imports this module first, so an English page
 * is translated before anything renders. The words are in js/lang-en.js. Names come from the data's own English and
 * are never translated here (demo-platform-review §5.8): provinces and districts from the area index
 * (OpenGISData-Thailand names, DOPA-credited, data/area-index.json metadata.englishNames), industrial estates from
 * their nameEn (the estate register), the industry families and the functions from their en. The DIW registers give no
 * English for factory or operator names, subdistricts or the factory type descriptions: those stay Thai as the register
 * writes them (keepThai). Industry groups, sizes and statuses are words of the dictionary.
 */
import {LANG, registerDictionary, registerNames, keepThai, startTranslation} from './shell/i18n.js';
import FACTORY_EN from './lang-en.js';

const THAI = /[ก-ฺเ-๎]/;

if (LANG === 'en') {
  registerDictionary(FACTORY_EN);
  startTranslation();
  // The English is a draft until reviewed (demo-platform-review §5.8): the help dialog says so.
  const note = () => {
    const intro = document.querySelector('.usage-dialog .help-intro');
    if (!intro || document.getElementById('draft-english-note')) return;
    const p = document.createElement('p');
    p.id = 'draft-english-note';
    p.className = 'help-intro';
    p.textContent = 'English is a draft translation from the Thai. The registers give no English for factory and operator names or for the factory type descriptions, so they stay in Thai as the register writes them. The product statement is in Thai.';
    intro.after(p);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', note, {once: true}); else note();
}

/** Register the English the data carries. index = js/areas.js buildAreaIndex, data = js/model.js decodeDataset. */
export function registerDataNames({index, data}) {
  if (LANG !== 'en') return;
  // The families and the functions carry their own English (data/factories.json families[].en, classes[].en).
  const labels = {};
  for (const x of [...(data?.families || []), ...(data?.classes || [])]) if (x.th && x.en) labels[x.th] = x.en;
  registerDictionary({exact: labels});
  const pairs = [];
  for (const p of index?.provinces || []) if (p.nameEn) pairs.push([p.name, p.nameEn], [`จังหวัด${p.name}`, p.nameEn]);
  const bangkok = (index?.provinces || []).find(p => p.id === 'BKK')?.nameEn;
  if (bangkok) pairs.push(['กรุงเทพฯ', bangkok], ['กรุงเทพ', bangkok]);
  for (const a of index?.areas || []) {
    if (!a.nameEn) continue;
    pairs.push([a.name, a.nameEn], [`${a.province === 'BKK' ? 'เขต' : 'อำเภอ'}${a.name}`, a.nameEn]);
  }
  const thai = new Set();
  for (const e of data?.estates || []) {
    if (!e.name || !THAI.test(e.name)) continue;
    if (e.nameEn && !THAI.test(e.nameEn)) pairs.push([e.name, e.nameEn]); else thai.add(e.name);
  }
  // As the registers write them: factory and operator names, the short and title forms, subdistricts, type descriptions.
  // (r.title is the name or the operator, else a phrase of the dictionary: the person label or “no name in the source”.)
  for (const r of data?.rows || []) for (const v of [r.name, r.op, r.short, r.sub]) if (v && THAI.test(v)) thai.add(v);
  for (const t of data?.types || []) if (t.th && THAI.test(t.th)) thai.add(t.th);
  registerNames(pairs);
  keepThai(thai);
}

/** On an English page an estate's line under its English name is its Thai name, marked as Thai and left alone. */
export const thaiEstateName = e => (LANG === 'en' && e?.name && THAI.test(e.name) && e.nameEn && !THAI.test(e.nameEn) ? e.name : '');
