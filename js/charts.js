/**
 * Comparison charts rendered as plain HTML — no chart vendor.
 *
 * Three views share the committed selection (scopeRows), the map's membership and the map's measure:
 *  - areas (URL view key `areas`): Σ workers (or registrations) per เขต/อำเภอ, bars in the map's colour (the same
 *    41-sample rank ramp over the same districts, js/scales.js#buildMetricRamp)
 *  - mix: district × industry family, a numeric table with equal cells (its own 41-sample ramp over the cells)
 *  - industries: Σ workers (or registrations) per official DIW industry group, the family cue beside each bar and
 *    one neutral bar colour (a group is a finer level of the map's category)
 * District marks emit {type:'area', id}; industry marks emit {type:'family', id} (the group's family).
 */
import {buildChartModel, areaMatrix, industryRanking} from './chart-model.js';
import {buildMetricRamp, classify, rampLegendHTML} from './scales.js';
import {cueMarkup} from './cues.js';
import {areaWord} from './areas.js';
import {provinceByCode} from './model.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => NUMBER.format(n);
const place = a => `${areaWord(a.province)}${a.name}`;
const where = (a, national) => (national ? provinceByCode(a.province)?.th || '' : '');

function empty(element, message) {
  element.innerHTML = `<div class="chart-empty"><p>${esc(message)}</p></div>`;
}

function areas(element, model, select, selectedId, unit, national) {
  // Every district of the reading, not only the 20 drawn: the same ramp as the map's district layer.
  const ramp = buildMetricRamp(model.values, {metric: model.metric, unit: unit.one});
  const max = Math.max(1, ...model.areas.map(a => a.value));
  const other = a => (unit.id === 'count' ? `${num(a.workers)} คน` : `${num(a.count)} ทะเบียน`);
  const rows = model.areas.map((a, i) => {
    const cls = classify(a.value, ramp);
    const pressed = a.id === selectedId;
    return `<li><button type="button" class="bar-row${pressed ? ' is-selected' : ''}" data-area="${esc(a.id)}" aria-pressed="${pressed}"
      aria-label="อันดับ ${i + 1} ${esc(place(a))} ${esc(where(a, national))}: ${num(a.value)} ${esc(unit.one)} ${esc(other(a))} กดเพื่อดูพื้นที่นี้">
      <span class="bar-rank data-number" aria-hidden="true">${i + 1}</span>
      <span class="bar-label">${esc(place(a))}<small>${esc([where(a, national), other(a)].filter(Boolean).join(' · '))}</small></span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${Math.max(2, Math.round((a.value / max) * 100))}%;background:${cls.fill}"></span></span>
      <span class="bar-value" aria-hidden="true"><b class="data-number">${num(a.value)}</b><small>${esc(unit.one)}</small></span>
    </button></li>`;
  }).join('');
  const w = national ? 'เขต/อำเภอ' : areaWord(model.areas[0]?.province);
  element.innerHTML = `<p class="chart-caption">${esc(unit.subject)}ต่อ${esc(w)} · ${num(model.areas.length)} จาก ${num(model.totalAreas)} ${esc(w)} · สีเดียวกับแผนที่</p><ol class="chart-bars">${rows}</ol>`;
  element.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => select({type: 'area', id: b.dataset.area})));
}

function matrix(element, model, select, selectedId, unit) {
  const m = areaMatrix(model, {areaLimit: 12});
  const ramp = buildMetricRamp(m.cells.map(c => c.value), {metric: model.metric, unit: unit.one});
  const head = m.groups.map(g => `<th scope="col" title="${esc(g.th)}"><span class="matrix-col">${cueMarkup(g.series)}<span>${esc(g.short || g.th)}</span></span></th>`).join('');
  const body = m.areas.map(a => {
    const pressed = a.id === selectedId;
    const cells = m.groups.map(g => {
      const cell = m.cells.find(c => c.areaId === a.id && c.group === g.index);
      const cls = classify(cell.value, ramp);
      // measured_zero: sample 0 + the theme's dataState.zero outline (EVID-05 treatment), never a blank cell.
      const style = cls.state === 'measured_zero' ? `background:${cls.fill};color:${cls.ink};box-shadow:inset 0 0 0 2px var(--data-zero-outline)` : `background:${cls.fill};color:${cls.ink}`;
      const said = `${num(cell.value)} ${unit.one}`;
      return `<td><button type="button" class="matrix-cell is-${cls.state}" data-area="${esc(a.id)}" style="${style}"
        aria-label="${esc(place(a))} × ${esc(g.th)}: ${esc(said)} กดเพื่อดูพื้นที่นี้" title="${esc(place(a))} × ${esc(g.th)} — ${num(cell.value)} จาก ${num(cell.total)} ${esc(unit.one)}"><span class="data-number${cls.plate ? ' on-plate' : ''}">${num(cell.value)}</span></button></td>`;
    }).join('');
    return `<tr${pressed ? ' class="is-selected"' : ''}><th scope="row"><button type="button" class="matrix-row" data-area="${esc(a.id)}" aria-pressed="${pressed}">${esc(a.name)}<small class="data-number">${num(a.value)}</small></button></th>${cells}</tr>`;
  }).join('');
  const columns = `<colgroup><col class="matrix-head-col">${m.groups.map(() => '<col class="matrix-cell-col">').join('')}</colgroup>`;
  element.innerHTML = `<p class="chart-caption">${num(m.areas.length)} เขต/อำเภอที่มี${esc(unit.subject)}มากที่สุด × ${num(m.groups.length)} อุตสาหกรรม · ตัวเลข = ${esc(unit.one)}</p>
    <div class="matrix-scroll"><table class="matrix" style="--matrix-columns:${m.groups.length}">${columns}<thead><tr><th scope="col" class="matrix-corner">พื้นที่ · ${esc(unit.one)}</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="chart-legend"><span class="legend-title">${esc(unit.one)}ในช่อง · สีเข้ม = มาก</span>${rampLegendHTML(ramp)}<span class="legend-step"><i class="legend-zero" aria-hidden="true"></i>0 = ไม่พบในตัวกรองนี้</span></p>`;
  element.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => select({type: 'area', id: b.dataset.area})));
}

function industries(element, rows, select, selectedFamily, unit, families) {
  const r = industryRanking(rows, {metric: unit.id});
  if (!r.industries.length) { empty(element, 'ไม่มีกลุ่มอุตสาหกรรมในตัวกรองนี้'); return; }
  const max = Math.max(1, ...r.industries.map(c => c.value));
  const other = c => (unit.id === 'count' ? `${num(c.workers)} คน` : `${num(c.count)} ทะเบียน`);
  const list = r.industries.map((c, i) => {
    const fam = families[c.industry.family] || null;
    const pressed = Boolean(fam) && fam.id === selectedFamily;
    return `<li><button type="button" class="bar-row${pressed ? ' is-selected' : ''}" data-family="${esc(fam?.id || '')}" aria-pressed="${pressed}"
      aria-label="อันดับ ${i + 1} ${esc(c.industry.th)}: ${num(c.value)} ${esc(unit.one)} ${esc(other(c))} กดเพื่อดูเฉพาะ${esc(fam?.th || '')}">
      <span class="bar-rank data-number" aria-hidden="true">${i + 1}</span>
      <span class="bar-label">${fam ? cueMarkup(fam.series, {className: 'bar-cue'}) : ''}${esc(c.industry.th)}<small>${esc(other(c))}</small></span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill industry-fill" style="width:${Math.max(2, Math.round((c.value / max) * 100))}%"></span></span>
      <span class="bar-value" aria-hidden="true"><b class="data-number">${num(c.value)}</b><small>${esc(unit.one)}</small></span>
    </button></li>`;
  }).join('');
  element.innerHTML = `<p class="chart-caption">${esc(unit.subject)}ต่อกลุ่มอุตสาหกรรมของกรมโรงงานฯ · ${num(r.industries.length)} จาก ${num(r.total)} กลุ่ม</p><ol class="chart-bars industry-bars">${list}</ol>`;
  element.querySelectorAll('[data-family]').forEach(b => b.addEventListener('click', () => { if (b.dataset.family) select({type: 'family', id: b.dataset.family}); }));
}

/** Render one view into #elementId. Returns an idempotent disposer. */
export function renderInsightChart({elementId, view = 'areas', rows = [], index, groups, theme, selectedAreaId = '', selectedFamily = '', unit, national = true} = {}, onSelect = () => {}) {
  const element = document.getElementById(elementId);
  if (!element) return () => {};
  const select = typeof onSelect === 'function' ? onSelect : () => {};
  element.replaceChildren();
  if (theme) element.dataset.chartTheme = theme;
  const labels = {areas: `เขต/อำเภอเรียงตาม${unit.subject}`, mix: 'อุตสาหกรรมในแต่ละเขต/อำเภอ', industries: `กลุ่มอุตสาหกรรมเรียงตาม${unit.subject}`};
  element.setAttribute('aria-label', labels[view] || labels.areas);
  if (!Array.isArray(rows) || !rows.length) { empty(element, 'ไม่พบโรงงานตามตัวกรอง'); return () => element.replaceChildren(); }
  try {
    if (view === 'industries') industries(element, rows, select, selectedFamily, unit, groups);
    else {
      const model = buildChartModel(rows, index, groups, {metric: unit.id});
      if (!model.areas.length) { empty(element, 'ไม่มีเขต/อำเภอในตัวกรองนี้'); return () => element.replaceChildren(); }
      if (view === 'mix') matrix(element, model, select, selectedAreaId, unit);
      else areas(element, model, select, selectedAreaId, unit, national);
    }
  } catch (error) {
    console.error('CityMETER chart could not render:', error);
    empty(element, 'แสดงกราฟไม่ได้ · ดูในตารางแทน');
  }
  return () => element.replaceChildren();
}
