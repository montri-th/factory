/**
 * CityMETER Industrial Estate in Factory (release 0.6.0): data/estate-context.json, js/estates.js and the estate view.
 * The outlines are the estate master's demo selection (OpenStreetMap, ODbL); the around set is a straight-line distance
 * set (≤ 3 km from the outline, 0 inside it), the same one the estate demo lists — never membership.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {load, readJSON} from './helpers.js';
import {decodeEstateContext, buildEstateProfile, estateBounds, nameMatches, AROUND_KM} from '../js/estates.js';
import {renderEstate, renderFactory, renderOverview} from '../js/panel.js';
import {buildFactoryDetail, buildOverview} from '../js/profile-model.js';
import {summarizeAreaInsight} from '../js/area-insight.js';
import {summarize, unitWords, hasPoint, filterRows} from '../js/model.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const context = () => decodeEstateContext(readJSON('data/estate-context.json'));
/** นิคมอุตสาหกรรมปิ่นทอง (ชลบุรี): outlined, with registrations round it. */
const PINTHONG = 'EST-IEAT-2722';

function ringDistance(lon, lat, geometry) {
  // Equirectangular metres around the point; inside → 0, else the nearest edge.
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = Infinity, inside = false;
  for (const poly of polys) {
    let inPoly = false;
    poly.forEach((ring, k) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
        const ax = (xi - lon) * kx, ay = (yi - lat) * ky, bx = (xj - lon) * kx, by = (yj - lat) * ky;
        const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
      if (k === 0) inPoly = c; else if (c) inPoly = false;
    });
    inside ||= inPoly;
  }
  return inside ? 0 : best;
}

test('estate context: 106 records, the 46 outlines the master selected, around sets only for outlined estates', () => {
  const ctx = context();
  assert.ok(ctx, 'decodes');
  assert.equal(ctx.estates.length, 106);
  assert.equal(ctx.outlines.features.length, 46);
  assert.equal(ctx.estates.filter(e => e.outline).length, 46);
  for (const f of ctx.outlines.features) assert.ok(ctx.byId.get(f.properties.id)?.outline, f.properties.id);
  assert.equal(ctx.km, AROUND_KM);
  assert.match(ctx.meta.attribution.boundaries, /OpenStreetMap contributors · ODbL 1\.0/);
  assert.match(ctx.meta.around.rule, /never membership/);
  for (const id of ctx.around.keys()) assert.ok(ctx.byId.get(id)?.outline, `${id}: around set only with an outline`);
  // Same ids as the register Factory already lists (01_ESTATES): one estate, both demos.
  const {data} = load();
  assert.deepEqual(new Set(ctx.estates.map(e => e.id)), new Set(data.estates.map(e => e.id)));
});

test('around set: every registration has a published point ≤ 3 km from the outline, and no other point is closer than the edge of the rule', () => {
  const ctx = context();
  const {data} = load();
  const byId = new Map(data.rows.map(r => [r.id, r]));
  const points = data.rows.filter(hasPoint);
  let checked = 0;
  for (const [id, fids] of ctx.around) {
    const outline = ctx.outlineById.get(id);
    const set = new Set(fids);
    assert.equal(set.size, fids.length, `${id}: no repeat`);
    for (const fid of fids) {
      const r = byId.get(fid);
      assert.ok(r && hasPoint(r), `${id}: ${fid} has a published point`);
      // The outlines here are simplified to 6 m (the build measured on the full outline): allow 15 m.
      assert.ok(ringDistance(r.longitude, r.latitude, outline.geometry) <= AROUND_KM * 1000 + 15, `${id}: ${fid} within ${AROUND_KM} km`);
    }
    const box = estateBounds(ctx.byId.get(id), AROUND_KM);
    for (const r of points) {
      if (set.has(r.id) || r.longitude < box[0][0] || r.longitude > box[1][0] || r.latitude < box[0][1] || r.latitude > box[1][1]) continue;
      assert.ok(ringDistance(r.longitude, r.latitude, outline.geometry) > AROUND_KM * 1000 - 15, `${id}: ${r.id} is within ${AROUND_KM} km but not in the set`);
    }
    checked++;
  }
  assert.equal(checked, ctx.around.size);
  assert.ok(ctx.around.get(PINTHONG)?.length > 50);
});

test('estate profile: the set read through the filters, heaviest first; workers add only figures; the bounds grow by 3 km', () => {
  const ctx = context();
  const {data} = load();
  const byId = new Map(data.rows.map(r => [r.id, r]));
  const all = buildEstateProfile(ctx, PINTHONG, {scopeIds: new Set(data.rows.map(r => r.id)), rowById: id => byId.get(id), families: data.families});
  assert.equal(all.count, ctx.around.get(PINTHONG).length);
  assert.equal(all.workers, all.rows.reduce((s, r) => s + (r.workers || 0), 0));
  for (let i = 1; i < all.rows.length; i++) assert.ok((all.rows[i - 1].workers || 0) >= (all.rows[i].workers || 0), 'heaviest first');
  const food = filterRows(data.rows, {group: 'food'});
  const some = buildEstateProfile(ctx, PINTHONG, {scopeIds: new Set(food.map(r => r.id)), rowById: id => byId.get(id), families: data.families});
  assert.ok(some.count < all.count && some.rows.every(r => r.groupId === 'food'), 'the filters narrow the set');
  assert.equal(buildEstateProfile(ctx, 'EST-NONE', {scopeIds: new Set(), rowById: () => null}), null);
  const e = ctx.byId.get(PINTHONG), b = estateBounds(e, 3);
  assert.ok(Math.abs((e.bbox[1] - b[0][1]) * 110574 - 3000) < 1, 'south edge 3 km out');
  assert.equal(estateBounds(ctx.estates.find(x => !x.outline)), null);
});

test('estate view: record, its page in the estate demo, “โรงงานรอบนิคม ≤ 3 กม.”, one provenance line with the outline source; never “in the estate”', () => {
  const ctx = context();
  const {data, index} = load();
  const byId = new Map(data.rows.map(r => [r.id, r]));
  const panelCtx = {meta: data.meta, unit: unitWords('workers'), index, sources: data.sources, filtered: false,
    estateHref: id => `https://example.test/industrialestate/?e=estate:${id}`, estateLogo: f => `https://example.test/logos/${f}`};
  const html = renderEstate(buildEstateProfile(ctx, PINTHONG, {scopeIds: new Set(data.rows.map(r => r.id)), rowById: id => byId.get(id), families: data.families}), panelCtx);
  const t = text(html);
  assert.ok(t.includes('นิคมอุตสาหกรรมปิ่นทอง') && t.includes('Pinthong Industrial Estate'));
  assert.ok(html.includes('href="https://example.test/industrialestate/?e=estate:EST-IEAT-2722"') && t.includes('ดูใน Industrial Estate'));
  assert.ok(t.includes('โรงงานรอบนิคม ≤ 3 กม.') && html.includes('โรงงานรอบนิคม ≤\u00A03\u00A0กม.'), 'the set is named by its rule, on one line');
  for (const k of ['dataset', 'source', 'date', 'boundary']) assert.equal((html.match(new RegExp(`data-prov="${k}"`, 'g')) || []).length, 1, k);
  assert.equal((html.match(/class="hint panel-foot provenance"/g) || []).length, 1);
  assert.ok(/ขอบเขต OpenStreetMap \(25 ต\.ค\. 2569\)/.test(t), 'the outline source and its date');
  assert.ok(!/ในนิคม|ตั้งอยู่ใน|ผู้เช่า|สมาชิกนิคม/.test(t), 'no membership words');
  assert.ok(!/ไม่ใช่|อาจเป็น|ไม่ได้แปลว่า/.test(t), 'no caveat on screen');
  // An estate without an outline: its record and its page, no set.
  const bare = ctx.estates.find(e => !e.outline);
  const none = text(renderEstate(buildEstateProfile(ctx, bare.id, {scopeIds: new Set(), rowById: () => null, families: data.families}), panelCtx));
  assert.ok(none.includes('ยังไม่แสดงขอบเขตบนแผนที่') && !none.includes('โรงงานรอบนิคม'));
});

test('registration: the estates whose IEAT directory lists the same operator name, as links into the estate demo; a natural person never', () => {
  const ctx = context();
  const {data, index} = load();
  const fid = [...ctx.fid.keys()].find(k => data.rows.find(r => r.id === k && !r.person));
  const row = data.rows.find(r => r.id === fid);
  const panelCtx = {meta: data.meta, unit: unitWords('workers'), index, sources: data.sources,
    estateHref: id => `https://example.test/?e=estate:${id}`, estateMatches: k => nameMatches(ctx, k)};
  const html = renderFactory(buildFactoryDetail(row, {scopeRows: data.rows, allRows: data.rows, index, families: data.families}), panelCtx);
  assert.ok(text(html).includes('ชื่อตรงกับทำเนียบ กนอ.'), 'the name match line');
  for (const e of nameMatches(ctx, fid).slice(0, 2)) assert.ok(html.includes(`href="https://example.test/?e=estate:${e.id}"`), e.id);
  const person = data.rows.find(r => r.person);
  const ph = renderFactory(buildFactoryDetail(person, {scopeRows: data.rows, allRows: data.rows, index, families: data.families}), {...panelCtx, estateMatches: () => [ctx.estates[0]]});
  assert.ok(!text(ph).includes('ชื่อตรงกับทำเนียบ'), 'never for a natural person');
});

test('province register: an outlined estate opens on the map, every estate links to the estate demo and its official page', () => {
  const ctx = context();
  const {data, index} = load();
  const rows = filterRows(data.rows, {province: 'RYG'});
  const panelCtx = {meta: data.meta, unit: unitWords('workers'), index, sources: data.sources,
    estateHref: id => `https://example.test/?e=estate:${id}`, estateOutlined: id => ctx.outlineById.has(id)};
  const html = renderOverview({insight: summarizeAreaInsight(rows, index, {families: data.families}), summary: summarize(rows),
    overview: buildOverview(rows, index, {province: 'RYG', families: data.families, classes: data.classes, estates: data.estates}), focusMode: 'auto', province: 'RYG', ctx: panelCtx});
  const ryg = data.estates.filter(e => e.province === 'RYG');
  for (const e of ryg) assert.ok(html.includes(`href="https://example.test/?e=estate:${e.id}"`), `${e.id}: estate demo link`);
  const buttons = [...html.matchAll(/data-action="select-estate" data-id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(new Set(buttons), new Set(ryg.filter(e => ctx.outlineById.has(e.id)).map(e => e.id)));
});
