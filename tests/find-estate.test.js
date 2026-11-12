/**
 * The search box of CityMETER · Industrial Estate (industrialestate/, 1.2.0; owner 2026-11-12 12:05, VERBATIM:
 * “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว implement กับ demo web ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม
 * product statement”): the names industrialestate/js/find.js gives js/shell/fuzzy.js, and what a name typed opens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from './helpers.js';
import {createIndex, key1, STEP} from '../js/shell/fuzzy.js';
import {translate, translateIn, registerDictionary} from '../js/shell/i18n.js';
import {decodeData, filterEstates} from '../industrialestate/js/model.js';
import {SEARCH_KINDS, SEARCH_HEADS, SEARCH_HINT, searchEntries, searchNote} from '../industrialestate/js/find.js';
import ESTATE_EN from '../industrialestate/js/lang-en.js';

const DIR = join(ROOT, 'industrialestate');
const read = file => JSON.parse(readFileSync(join(DIR, file), 'utf8'));
let built = null;
function index() {
  if (!built) {
    const areas = read('data/area-index.json'), data = decodeData(read('data/estates.json'), areas);
    const idx = createIndex({kinds: SEARCH_KINDS, heads: SEARCH_HEADS});
    idx.addAll(searchEntries({data, index: areas}));
    built = {idx, data, index: areas};
  }
  return built;
}

test('Industrial Estate: every record, its province, its type and its developer can be found by name', () => {
  const {idx, data} = index();
  const entries = [...searchEntries(index())];
  assert.equal(idx.size, entries.length);
  assert.deepEqual([...new Set(entries.map(e => e.kind))].sort(), SEARCH_KINDS.map(k => k.id).sort());
  assert.equal(entries.filter(e => e.kind === 'estate').length, data.estates.length);
  for (const e of data.estates) {
    for (const typed of [e.name, e.nameEn].filter(x => key1(x || ''))) {
      assert.ok(idx.search(typed).items.slice(0, 8).some(i => i.entry.kind === 'estate' && i.entry.id === e.id), typed);
    }
  }
  // A province without a record is no entry: the province filter offers no other.
  assert.deepEqual(entries.filter(e => e.kind === 'province').map(e => e.id).sort(), [...new Set(data.estates.map(e => e.province))].sort());
});

test('Industrial Estate: a name opens what answers it, however it is typed', () => {
  const {idx} = index();
  const first = typed => idx.search(typed).items[0];
  for (const typed of ['บางชัน', 'นิคมบางชัน', 'นิคมอุตสาหกรรมบางชัน', 'bangchan industrial estate']) {
    assert.deepEqual([first(typed).entry.kind, first(typed).entry.name, first(typed).step, idx.search(typed).preselect?.name], ['estate', 'นิคมอุตสาหกรรมบางชัน', STEP.name, 'นิคมอุตสาหกรรมบางชัน'], typed);
  }
  assert.deepEqual([first('ระยอง').entry.kind, idx.search('ระยอง').preselect?.id], ['province', 'RYG']);
  assert.deepEqual([first('สวนอุตสาหกรรม').entry.kind, idx.search('สวนอุตสาหกรรม').preselect?.kind], ['type', 'type']);
  assert.equal(first('กนอ').entry.kind, 'developer');
  let r = idx.search('มาบตะพุด');
  assert.deepEqual([r.items[0].entry.name, r.items[0].show, r.sure, r.preselect], ['นิคมอุตสาหกรรมมาบตาพุด', 'near', 0, null], 'a wrong vowel is a guess, said to be one and never chosen ahead');
  r = idx.search('ouiu=yo');
  assert.equal(r.total, 0);
  assert.equal(idx.search("[k'=yo").layout, 'บางชัน', 'typed with the keyboard in the other language');
});

test('Industrial Estate: the list says what an entry is and where; the page opens every kind; the words filter as before', () => {
  const {idx, data} = index();
  const note = entry => searchNote(entry, index());
  assert.equal(note(idx.search('บางชัน').items[0].entry), 'นิคมอุตสาหกรรม · กรุงเทพมหานคร');
  assert.equal(note(idx.search('ระยอง').items[0].entry), 'จังหวัด');
  for (const e of searchEntries(index())) assert.ok(note(e) && !/\d/.test(note(e)), `${e.kind} ${e.name}`);
  const app = readFileSync(join(DIR, 'js/app.js'), 'utf8');
  for (const k of SEARCH_KINDS) assert.ok(app.includes(`entry.kind === '${k.id}'`), `js/app.js opens a ${k.id}`);
  assert.ok(filterEstates(data.estates, {search: 'กนอ.'}).length > 0, 'a developer is the words of the text filter');
  registerDictionary(ESTATE_EN);
  assert.ok(translate(SEARCH_HINT), 'the hint has English');
  const part = {matches: selector => selector === '.find-where'};
  assert.deepEqual(['จังหวัด', 'ประเภท', 'ผู้พัฒนา'].map(th => translateIn(part, th)), ['Province', 'Type', 'Developer']);
});
