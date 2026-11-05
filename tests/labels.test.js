import test from 'node:test';
import assert from 'node:assert/strict';
import {rankLabelCandidates, shortName, labelParts, centreCandidates, placeLabels, LABEL_MIN_ZOOM, LABEL_MAX} from '../js/labels.js';
import {load} from './helpers.js';

// Carried over from Hotel 0.2.0 (owner 2026-11-01, point 5): names near the middle of the view, most important first
// (here: workers), short (icons before words), never covering the chrome or each other.
test('labels: importance first, then nearness to the centre; stable', () => {
  const c = [{row: {id: 'b', importance: 0.5}, d: 0.1}, {row: {id: 'a', importance: 0.9}, d: 0.9}, {row: {id: 'c', importance: 0.5}, d: 0.05}];
  assert.deepEqual(rankLabelCandidates(c).map(x => x.row.id), ['a', 'c', 'b']);
  assert.ok(LABEL_MIN_ZOOM >= 12 && LABEL_MAX.phone < LABEL_MAX.desktop);
});

test('short names drop the legal-form words the build strips; never shorter than 3 characters', () => {
  assert.equal(shortName({short: 'ชำนิเฟอร์นิเจอร์', title: 'บริษัท ชำนิเฟอร์นิเจอร์ จำกัด'}), 'ชำนิเฟอร์นิเจอร์');
  assert.equal(shortName({short: 'ab', title: 'บริษัท ab จำกัด'}), 'บริษัท ab จำกัด', 'too short: the full name stays');
  const {data} = load();
  const r = data.rows.find(x => x.id === '10100017125556');
  assert.deepEqual(labelParts(r), {name: 'ชำนิเฟอร์นิเจอร์', workers: 7780});
  assert.ok(data.rows.filter(x => x.short).every(x => !/^บริษัท|จำกัด$|\(มหาชน\)$/.test(x.short)), 'no legal-form word at either end of a short name');
});

test('candidates come from the central ellipse only; placement avoids blockers and other labels and respects the cap', () => {
  const rows = Array.from({length: 30}, (_, i) => ({id: `h${i}`, longitude: i, latitude: 0, importance: 1 - i / 30}));
  const box = {left: 0, right: 1000, top: 0, bottom: 600};
  const project = ([x]) => ({x: 100 + x * 30, y: 300});
  const cands = centreCandidates(rows, project, box, {skip: 'h3'});
  assert.ok(cands.every(c => Math.abs(c.x - 500) <= 360) && !cands.some(c => c.row.id === 'h3'));
  const blockers = [{left: 380, right: 520, top: 0, bottom: 600}];
  const placed = placeLabels(rankLabelCandidates(cands), () => ({w: 80, h: 20}), () => 5, box, {max: 4, blockers});
  assert.ok(placed.length <= 4);
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const p of placed) assert.ok(!blockers.some(b => overlaps(p.box, b)), 'never on the chrome');
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(!overlaps(placed[i].box, placed[j].box), 'never on another label');
});

test('a registration known only by a natural person’s name never gets a label (it has no point)', () => {
  const {data} = load();
  const persons = data.rows.filter(r => r.person);
  assert.ok(persons.length > 0);
  const project = () => ({x: 500, y: 300});
  assert.equal(centreCandidates(persons, project, {left: 0, right: 1000, top: 0, bottom: 600}).length, 0);
});
