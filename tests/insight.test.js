import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.js';
import {summarizeAreaInsight, filterAreaRows, INDUSTRY_LIMIT} from '../js/area-insight.js';
import {levelWords, areaLabel} from '../js/areas.js';
import {filterRows} from '../js/model.js';
import {buildAreaModel} from '../js/map-layers.js';
import {buildProvinceModel} from '../js/provinces.js';
import {COUNT_SCALE} from '../js/scales.js';

test('first Aha (snapshot fixture, workers): the three อำเภอ with the most workers in the province holding the most of them at district level', () => {
  const {data, index} = load();
  const a = summarizeAreaInsight(data.rows, index, {families: data.families});
  assert.equal(a.metric, 'workers');
  assert.equal(a.home, 'SPK');
  assert.deepEqual(a.areas.map(x => [x.id, x.name, x.value]), [['1103', 'บางพลี', 130258], ['1101', 'เมืองสมุทรปราการ', 124142], ['1104', 'พระประแดง', 76587]]);
  assert.deepEqual([a.value, a.homePlacedValue, a.homeValue, Math.round(a.share)], [330987, 457353, 457353, 72], 'the share is of the province’s whole total');
  assert.deepEqual([a.count, a.workers, a.homePlaced, a.homeUnplacedValue], [5041, 330987, 7170, 0]);
  // Second line: the industries of the focus, each with its share of the focus total (numerator and denominator kept).
  assert.equal(INDUSTRY_LIMIT, 3);
  assert.equal(a.industry.base, a.value);
  assert.deepEqual(a.industry.list.map(g => [g.id, g.value, Math.round(g.share)]), [['vehicle', 57959, 18], ['textile', 57590, 17], ['metal', 53221, 16]]);
  // The district with the most workers outside Samut Prakan holds more than any Samut Prakan district.
  assert.deepEqual([a.outside.id, a.outside.name, a.outside.province, a.outside.value, a.outside.count], ['7401', 'เมืองสมุทรสาคร', 'SKN', 264666, 4346]);
  assert.ok(a.outside.value > a.areas[0].value);
  assert.deepEqual(a.outside.industry.list.map(g => [g.id, g.value]), [['food', 109886]]);
  assert.equal(a.outside.industry.base, 264666);
  assert.deepEqual(filterAreaRows(data.rows, new Set(a.areaIds)).length, a.count);
});

test('registrations Aha: the same province, ordered by registrations', () => {
  const {data, index} = load();
  const c = summarizeAreaInsight(data.rows, index, {metric: 'count', families: data.families});
  assert.equal(c.home, 'SPK');
  assert.deepEqual(c.areas.map(x => [x.name, x.value]), [['บางพลี', 2114], ['เมืองสมุทรปราการ', 1987], ['บางเสาธง', 1009]]);
  assert.deepEqual([c.value, c.homeValue, Math.round(c.share)], [5110, 7171, 71]);
  assert.deepEqual(c.industry.list.map(g => [g.id, g.value]), [['metal', 1025], ['other', 964], ['polymer', 916]]);
  assert.deepEqual([c.outside.name, c.outside.value], ['เมืองสมุทรสาคร', 4346]);
});

test('the 95+ lens (size filter p90) reads as release 0.1.0 did: the same three อำเภอ and 74%', () => {
  const {data, index} = load();
  const l = summarizeAreaInsight(filterRows(data.rows, {size: 'p90'}), index, {families: data.families});
  assert.equal(l.home, 'SPK');
  assert.deepEqual(l.areas.map(x => [x.id, x.value]), [['1101', 85921], ['1103', 79620], ['1104', 55439]]);
  assert.deepEqual([l.value, l.homeValue, Math.round(l.share)], [220980, 299796, 74]);
});

test('the focus is never every district holding the measure (food: Samut Sakhon has three such districts → its top two)', () => {
  const {data, index} = load();
  const food = summarizeAreaInsight(filterRows(data.rows, {group: 'food'}), index, {families: data.families});
  assert.equal(food.home, 'SKN');
  assert.equal(food.homeAreaIds.length, 3);
  assert.deepEqual(food.areas.map(x => x.name), ['เมืองสมุทรสาคร', 'กระทุ่มแบน']);
  assert.deepEqual(food.industry.list.map(g => [g.id, Math.round(g.share)]), [['food', 100]]);
});

test('the focus never cuts through a tie; a province where every district holds the same value is “spread”', () => {
  const {index} = load();
  const row = (area, workers, i) => ({id: `t${area}-${i}`, area, province: index.byId.get(area).province, workers, latitude: null, longitude: null});
  // Bangkok: 1033 (400), then 1037 and 1039 tied (200) above 1001 (100): the cut after three is above the tie.
  const tie = [row('1033', 400, 1), row('1037', 200, 1), row('1039', 200, 1), row('1001', 100, 1)];
  assert.deepEqual(summarizeAreaInsight(tie, index).areas.map(a => a.id), ['1033', '1037', '1039']);
  const tie4 = [...tie, row('1002', 200, 1)];
  assert.deepEqual(summarizeAreaInsight(tie4, index).areas.map(a => a.id), ['1033'], 'three districts tied at 200: only 1033 is above them');
  const spread = [row('1033', 150, 1), row('1037', 150, 1), row('1039', 150, 1), row('1001', 150, 1)];
  const s = summarizeAreaInsight(spread, index);
  assert.deepEqual(s.areas, []);
  assert.deepEqual(s.spread, {areas: 4, value: 150});
});

test('the Aha follows the filters: a province, an industry, nothing', () => {
  const {data, index} = load();
  const cbi = summarizeAreaInsight(filterRows(data.rows, {province: 'CBI'}), index, {families: data.families});
  assert.equal(cbi.home, 'CBI');
  assert.deepEqual(cbi.areas.map(a => a.name), ['บ้านบึง', 'ศรีราชา', 'เมืองชลบุรี']);
  assert.equal(cbi.industry.list[0].id, 'electrical');
  assert.equal(cbi.outside, null, 'a one-province selection has no outside finding');
  const none = summarizeAreaInsight([], index);
  assert.deepEqual([none.areas.length, none.share, none.home, none.industry.list.length], [0, 0, '', 0]);
});

test('district model: EVID-05 — a district with no registration is a measured zero; workers unknown for every registration is no data', () => {
  const {data, index} = load();
  const workers = buildAreaModel(data.rows, index);
  assert.equal(workers.areas.length, 928);
  assert.equal(workers.zeroCount, 13, 'twelve districts without a registration and one whose registrations record 0 workers');
  assert.equal(workers.noDataCount, 0, 'every district with registrations has a worker figure');
  assert.equal(workers.ramp.scaleId, COUNT_SCALE.scaleId);
  assert.deepEqual([workers.ramp.min, workers.ramp.max, workers.ramp.steps], [2, 264666, 41]);
  assert.equal(workers.byId.get('7401').fill, COUNT_SCALE.lut[40], 'เมืองสมุทรสาคร (the national maximum) closes the ramp on sample 40');
  assert.ok(workers.areas.filter(a => a.state === 'measured_zero').every(a => a.workers === 0 && (a.count === 0 || a.figured === a.count)));
  const count = buildAreaModel(data.rows, index, {metric: 'count'});
  assert.equal(count.ramp.scaleId, COUNT_SCALE.scaleId);
  assert.deepEqual([count.zeroCount, count.ramp.min, count.ramp.max], [13, 1, 4346]);
  // Only registrations without a figure: their districts are no_data (the hatch), never a measured 0 of workers.
  const none = buildAreaModel(filterRows(data.rows, {size: 'none'}), index);
  assert.ok(none.noDataCount > 0);
  assert.ok(none.areas.filter(a => a.count > 0).every(a => a.state === 'no_data'));
  assert.ok(none.areas.filter(a => a.state === 'measured_zero').every(a => a.count === 0));
});

test('province frames total the measure per province; every province holds registrations', () => {
  const {data, provincesGeo} = load();
  const m = buildProvinceModel(data.rows, provincesGeo);
  assert.equal(m.provinces.length, 77);
  const by = new Map();
  for (const r of data.rows) if (r.province) by.set(r.province, (by.get(r.province) || 0) + (r.workers || 0));
  for (const p of m.provinces) assert.equal(p.value, by.get(p.code) || 0, p.code);
  assert.equal(m.provinces.find(p => p.code === 'SPK').fill, COUNT_SCALE.lut[40], 'Samut Prakan closes the province ramp');
  assert.equal(m.zeroCount, 0);
  const none = buildProvinceModel([], provincesGeo);
  assert.ok(none.provinces.every(p => p.state === 'measured_zero'));
});

test('level words follow the province: เขต in Bangkok, อำเภอ elsewhere', () => {
  const {index} = load();
  assert.deepEqual(levelWords('BKK'), {area: 'เขต'});
  assert.deepEqual(levelWords('SPK'), {area: 'อำเภอ'});
  assert.equal(areaLabel(index.byId.get('1039')), 'เขตวัฒนา');
  assert.equal(areaLabel(index.byId.get('1101')), 'อำเภอเมืองสมุทรปราการ');
});
