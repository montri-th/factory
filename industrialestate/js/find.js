/**
 * What the search box of CityMETER · Industrial Estate knows by name: the entries js/shell/fuzzy.js matches and
 * js/shell/search.js lists (release 1.2.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว
 * implement กับ demo web ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”).
 *
 * The product statement asks where the industrial estates are, who develops them and what the directory lists in
 * them. So a name typed here opens what answers it: a province (its estates), an estate, park or zone (its page), a
 * type (its filter), or a developer (the estates that name it). The order below is the order among equal matches.
 *
 * Pure: entries from the decoded dataset; no DOM, no numbers shown (a row names what it is and where).
 */
import {PROVINCE_AKA} from './shell/fuzzy.js';

export const SEARCH_KINDS = Object.freeze([{id: 'province', level: 'province', auto: true}, {id: 'estate', auto: true}, {id: 'type', auto: true}, {id: 'developer', auto: true}]);
/** Words a name may begin with, or carry, that people add or leave out; an array is one word and its short form. */
export const SEARCH_HEADS = Object.freeze([['นิคมอุตสาหกรรม', 'นิคม'], 'สวนอุตสาหกรรม', 'เขตประกอบการอุตสาหกรรม', 'เขตอุตสาหกรรม', 'industrial', 'estate', 'park', 'zone']);
/** What to try when nothing is found: the kinds of name this demo knows. */
export const SEARCH_HINT = 'ลองชื่อนิคม ผู้พัฒนา ประเภท หรือจังหวัด';

/** Every entry: the provinces that have a record, the records, the types, the developers the records name. */
export function* searchEntries({data, index}) {
  const byCode = new Map(index.provinces.map(p => [p.id, p]));
  const places = new Map();
  for (const code of new Set(data.estates.map(e => e.province))) {
    const p = byCode.get(code);
    if (!p) continue;
    places.set(code, [p.name, p.nameEn]);
    yield {id: code, kind: 'province', name: p.name, nameEn: p.nameEn, aka: PROVINCE_AKA[p.name], codes: [code], province: code};
  }
  for (const e of data.estates) yield {id: e.id, kind: 'estate', name: e.name, nameEn: e.nameEn, aka: e.aliases, within: places.get(e.province), province: e.province, estate: e};
  for (const t of data.types) yield {id: t.id, kind: 'type', name: t.th, nameEn: t.en};
  // A developer as the records name it, and the brand its logo carries (กนอ.).
  const developers = new Map();
  for (const e of data.estates) for (const name of [e.developer, e.logoLabel]) if (name && !developers.has(name)) developers.set(name, {id: name, kind: 'developer', name});
  yield* developers.values();
}

/** The line under a name in the list: what it is and where. Thai; an English page translates it part by part. */
export function searchNote(entry, {index}) {
  const province = code => index.provinces.find(p => p.id === code)?.name || '';
  if (entry.kind === 'province') return 'จังหวัด';
  if (entry.kind === 'type') return 'ประเภท';
  if (entry.kind === 'developer') return 'ผู้พัฒนา';
  return [entry.estate.typeTh, province(entry.estate.province)].filter(Boolean).join(' · ');
}
