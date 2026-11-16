/**
 * What the search box of CityMETER · Factory knows by name: the entries js/shell/fuzzy.js matches and js/shell/search.js
 * lists (release 0.9.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว implement กับ demo web
 * ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”).
 *
 * The product statement reads where factories and their workers are, by area, by industry and by industrial estate.
 * So a name typed here opens the level that answers it: a province or a เขต/อำเภอ (its factories and workers), an
 * industrial estate (the factories in it), an industry or a function (where it is), or one registration (its
 * profile). A registration is also found by its number, and a company without บริษัท … จำกัด. The order below is the
 * order among equal matches: places first.
 *
 * Pure: entries from the decoded dataset; no DOM, no numbers shown (a row names what it is and where).
 */
import {areaWord} from './areas.js';
import {provinces} from './model.js';
import {PROVINCE_AKA, withoutMueang} from './shell/fuzzy.js';

export const SEARCH_KINDS = Object.freeze([
  {id: 'province', level: 'province', auto: true}, {id: 'area', level: 'district', auto: true}, {id: 'estate', auto: true},
  {id: 'group', auto: true}, {id: 'cls', auto: true}, {id: 'factory'},
]);
/** Words a name may begin with, or carry, that people add or leave out; an array is one word and its abbreviations. */
export const SEARCH_HEADS = Object.freeze([['บริษัท', 'บจก.', 'บจ.'], ['ห้างหุ้นส่วนจำกัด', 'หจก.'], 'ห้างหุ้นส่วนสามัญ', 'โรงงาน', ['นิคมอุตสาหกรรม', 'นิคม'], 'เขตประกอบการอุตสาหกรรม', 'สวนอุตสาหกรรม', 'เขตอุตสาหกรรม']);
/** What to try when nothing is found: the kinds of name this demo knows. */
export const SEARCH_HINT = 'ลองชื่อโรงงาน เลขทะเบียน นิคม อุตสาหกรรม เขต/อำเภอ หรือจังหวัด';

/** Every entry, the few places and filters first, then the registrations. */
export function* searchEntries({data, index}) {
  const byCode = new Map(provinces().map(p => [p.code, p]));
  for (const p of provinces()) yield {id: p.code, kind: 'province', name: p.th, nameEn: p.en, aka: PROVINCE_AKA[p.th], codes: [p.code, p.dopa], province: p.code};
  const places = new Map();
  for (const a of index.byId.values()) {
    const p = byCode.get(a.province);
    places.set(a.id, [a.name, a.nameEn, p?.th, p?.en]);
    yield {id: a.id, kind: 'area', name: a.name, nameEn: a.nameEn, also: withoutMueang(a.name), codes: [a.id], within: [p?.th, p?.en], province: a.province, area: a.id};
  }
  for (const e of data.estates) yield {id: e.id, kind: 'estate', name: e.name, nameEn: e.nameEn, within: [byCode.get(e.province)?.th, byCode.get(e.province)?.en], province: e.province, estate: e};
  for (const g of data.groups) yield {id: g.id, kind: 'group', name: g.th, nameEn: g.en, aka: [g.short]};
  for (const c of data.classes) yield {id: c.id, kind: 'cls', name: c.th, nameEn: c.en};
  const provinceOnly = new Map();
  for (const r of data.rows) {
    let within = r.area ? places.get(r.area) : provinceOnly.get(r.province);
    if (!within) { const p = byCode.get(r.province); within = [p?.th, p?.en]; provinceOnly.set(r.province, within); }
    yield {id: r.id, kind: 'factory', name: r.name, label: r.title, aka: [r.short, r.op], codes: [r.id], within, province: r.province, area: r.area, weight: r.importance || 0, row: r};
  }
}

/** The line under a name in the list: what it is and where. Thai; an English page translates it part by part. */
export function searchNote(entry, {index, data}) {
  const province = code => provinces().find(p => p.code === code)?.th || '';
  if (entry.kind === 'province') return 'จังหวัด';
  if (entry.kind === 'area') return [areaWord(entry.province), province(entry.province)].filter(Boolean).join(' · ');
  if (entry.kind === 'estate') return [entry.estate.type, province(entry.estate.province)].filter(Boolean).join(' · ');
  if (entry.kind === 'group') return 'อุตสาหกรรม';
  if (entry.kind === 'cls') return 'หน้าที่ของโรงงาน';
  const r = entry.row, a = r.area ? index.byId.get(r.area) : null;
  return [data.groups[r.group]?.th, a?.name, province(r.province)].filter(Boolean).join(' · ');
}
