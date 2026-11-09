/**
 * Analytical scales — LDS 0.9.7 (v0.9.7-owner.1, color-srgb-10), copied exactly from the approved source; parity is
 * checked by scripts/check-lds-parity.mjs against Landometer-Design-System-v0.9.7.md (handoff/VERIFICATION.md).
 * DATAVIZ-02/03: the approved light 41-sample LUT is consumed unchanged on both themes; nothing is interpolated here.
 *
 * Family used by this product (selected from metric + unit + denominator, DATAVIZ-02 “count for totals, not density”):
 *   `count` — Landometer-Design-System-v0.9.7.md machine.analyticalScales (SHA-256 d3085cbc…96). Both measures are
 *             totals with no denominator: Σ workers of the registrations per เขต/อำเภอ, per province frame and per matrix
 *             cell (“คน”), and registrations (“ทะเบียน”). No per-area or per-person ratio is drawn, so no density family
 *             applies; the legend title and unit say which total is shown.
 * The EVID-05 treatments (zero outline, no-data ground) are the base `dataState` values.
 *
 * All 41 samples (owner standing rule “Color scale ขอให้ใช้ 41 scales ตาม LDS เสมอ”, the CityMETER · Shopping
 * centers method of 2026-10-25, `buildRamp`): the colour of a value is the LUT sample of its rank among the
 * measured nonzero values of the areas being read (the selected province's เขต/อำเภอ, or every one when the
 * country is read; the province frames; the matrix cells). Each distinct value takes the sample of its mid-rank
 * percentile, rescaled so the lowest value sits on sample 0 and the highest on sample 40 (one value alone sits on
 * sample 40). Equal values share one sample; nothing falls between samples; the highest value closes the ramp
 * (no clamp, no open class); the renderer, the legend, the labels and the charts read the same `levels`. The LDS
 * class tables (`classColors`, n ∈ {3,5,7,9} at index round(i × 40 / (n − 1))) remain for static tokens. Zero
 * is a measured fact (EVID-05 measured_zero: sample 0 + the zero outline), never a level; missing is no_data.
 */
const freeze = Object.freeze;

export const COUNT_SCALE = freeze({
  scaleId: 'count', kind: 'sequential', labelTh: 'จำนวนรวม (คนงาน หรือ ทะเบียน)',
  anchors: freeze(['#F4F0E7', '#7DBAC0', '#213E70']),
  lut: freeze(['#F4F0E7', '#EEEDE5', '#E8EBE3', '#E3E8E1', '#DDE5DF', '#D7E3DD', '#D1E0DB', '#CBDDD9', '#C5DAD7', '#C0D8D6',
    '#BAD5D4', '#B4D2D2', '#AED0D0', '#A8CDCE', '#A2CACC', '#9CC8CA', '#96C5C8', '#90C2C6', '#8ABFC4', '#83BDC2', '#7DBAC0',
    '#78B3BC', '#73ADB8', '#6EA7B4', '#69A0B0', '#649AAC', '#5F93A8', '#5A8DA4', '#5587A0', '#50809C', '#4C7A98', '#477494',
    '#436E90', '#3E688C', '#3A6288', '#355C84', '#315680', '#2D507C', '#294A78', '#254474', '#213E70']),
  noData: '#D5DAD6', zeroOutline: '#7D877F',
  scaleVersion: '4ff5c1fb4be71ecd13c48685b38371b528bcd4ce369ce964a75354c2eb4d0980',
  themePolicy: 'identical-light-values-on-both-themes',
});

/** The family of a measure: both measures are totals → count. */
export const scaleFor = () => COUNT_SCALE;

/** WCAG relative-luminance contrast ratio (used for ink choice and tests). */
export function contrastRatio(hexA, hexB) {
  const lum = hex => {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hexA), lum(hexB)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Label ink on a class fill: the foundation text pair that reaches the higher contrast. */
export function inkFor(fill) {
  const dark = '#182327', light = '#FFFFFF';
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
}

/** Exact class colours for n ∈ {3,5,7,9}: index round(i × 40 / (n − 1)). */
export function classColors(n = 5, scale = COUNT_SCALE) {
  if (![3, 5, 7, 9].includes(n)) throw new RangeError('Class count must be 3, 5, 7 or 9');
  return Array.from({length: n}, (_, i) => scale.lut[Math.round((i * 40) / (n - 1))]);
}

/**
 * Numbers set directly on a data fill need 4.5:1. Three `count` samples (27–29) reach it with neither foundation
 * ink, so text on them sits on a neutral plate (LDS: keep the data colour, add a backplate) — `plate` in classify().
 */
export const needsPlate = fill => contrastRatio(fill, inkFor(fill)) < 4.5;

export const RAMP_STEPS = 41;
const INTEGER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});

/** The 41-sample rank ramp of one reading (see the header). `unit` names what is counted, for legends. */
export function buildRamp(values, {scale = COUNT_SCALE, unit = 'คน'} = {}) {
  const measured = (Array.isArray(values) ? values : []).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const distinct = [];
  for (const v of measured) {
    const last = distinct.at(-1);
    if (last && last.value === v) last.n++;
    else distinct.push({value: v, n: 1});
  }
  const total = measured.length;
  let below = 0;
  const mid = distinct.map(d => { const p = (below + d.n / 2) / total; below += d.n; return p; });
  const span = mid.length > 1 ? mid.at(-1) - mid[0] : 0;
  const levels = distinct.map((d, j) => {
    const index = span > 0 ? Math.round(((mid[j] - mid[0]) / span) * (RAMP_STEPS - 1)) : RAMP_STEPS - 1;
    const fill = scale.lut[index];
    return {value: d.value, areas: d.n, index, fill, ink: inkFor(fill)};
  });
  const format = x => INTEGER.format(x);
  return {
    scaleId: scale.scaleId, scaleVersion: scale.scaleVersion, unit, method: 'rank', steps: RAMP_STEPS, lut: scale.lut,
    min: measured.length ? measured[0] : 0, max: measured.length ? measured.at(-1) : 0,
    levels, levelCount: new Set(levels.map(l => l.index)).size, ticks: rampTicks(levels, format), format,
    zero: {fill: scale.lut[0], ink: inkFor(scale.lut[0]), outline: scale.zeroOutline, label: '0'}, scale,
  };
}

/** The ramp of one reading under a measure (workers or registrations → count). */
export const buildMetricRamp = (values, {metric = 'workers', unit = 'คน'} = {}) => buildRamp(values, {scale: scaleFor(metric), unit});
/** The count ramp (count family) of one reading. */
export const buildCountRamp = (values, {unit = 'ทะเบียน'} = {}) => buildRamp(values, {scale: COUNT_SCALE, unit});

/**
 * Width the ticks are spaced for (px): the legend ramp on wider screens (`.legend-ramp`, 204 px). A narrower ramp — the
 * phone dock (0.3.5) — hides the ticks that would touch at its own width when it renders (js/app.js#spaceTicks).
 */
export const RAMP_MIN_WIDTH = 204;
/** Width of a tick label at 11 px tabular figures (px): digits 6.2, separators 3, anything else 6.6. */
export const tickLabelWidth = label => [...String(label)].reduce((w, c) => w + (/\d/.test(c) ? 6.2 : /[.,]/.test(c) ? 3 : 6.6), 0);

/**
 * Legend ticks: the lowest and highest values plus the values nearest samples 10, 20 and 30, each placed at its
 * own sample (the lowest anchored at the start, the highest at the end, the rest centred). A tick whose label
 * would touch its neighbour's on a ramp `widthPx` wide is dropped; the highest value always stays (0.3.5: the
 * phone showed “11,026” over “153,200” when the spacing counted samples only).
 */
export function rampTicks(levels, fmt = String, {widthPx = RAMP_MIN_WIDTH, gapPx = 5} = {}) {
  if (!levels.length) return [];
  const picks = [];
  for (const target of [0, 10, 20, 30, 40]) {
    let best = levels[0];
    for (const l of levels) if (Math.abs(l.index - target) < Math.abs(best.index - target)) best = l;
    if (!picks.includes(best)) picks.push(best);
  }
  const top = levels.at(-1);
  if (!picks.includes(top)) picks.push(top);
  const perSample = widthPx / RAMP_STEPS;
  const box = t => {
    const x = (t.index + 0.5) * perSample, w = tickLabelWidth(fmt(t.value));
    const edge = t.index <= 2 ? 'start' : t.index >= RAMP_STEPS - 3 ? 'end' : 'mid';
    return edge === 'start' ? [x - 2, x - 2 + w] : edge === 'end' ? [x + 2 - w, x + 2] : [x - w / 2, x + w / 2];
  };
  const fits = (a, b) => b.index - a.index >= 8 && box(a)[1] + gapPx <= box(b)[0];
  const kept = [];
  for (const l of picks.sort((a, b) => a.index - b.index)) {
    if (l === top) {
      while (kept.length > 1 && !fits(kept.at(-1), l)) kept.pop();
      if (kept.length === 1 && kept[0] !== l && !fits(kept[0], l) && kept[0].index !== l.index) kept.pop();
      if (!kept.includes(l)) kept.push(l);
      continue;
    }
    if (!kept.length || fits(kept.at(-1), l)) kept.push(l);
  }
  return kept.map(l => ({index: l.index, value: l.value, label: fmt(l.value)}));
}

/** The level that holds `value`: the highest level whose value is ≤ value (levels ascend). */
function levelOf(value, levels) {
  let lo = 0, hi = levels.length - 1, found = levels[0];
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (levels[m].value <= value) { found = levels[m]; lo = m + 1; } else hi = m - 1;
  }
  return found;
}

/**
 * Resolve one value to its EVID-05 state and treatment.
 *  measured: finite > 0 → the LUT sample of its level · measured_zero: 0 → sample 0 + zero outline
 *  no_data: null fill (caller draws the hatch) · out_of_scope: nothing drawn
 */
export function classify(value, model, state = 'measured') {
  if (state === 'out_of_scope') return {state, fill: null, ink: null, label: 'นอกขอบเขตข้อมูล'};
  if (state === 'no_data' || value == null || !Number.isFinite(value)) return {state: 'no_data', fill: null, ink: null, label: 'ไม่มีข้อมูล'};
  const fmt = model?.format || String;
  if (value <= 0) return {state: 'measured_zero', fill: model.zero.fill, ink: model.zero.ink, outline: model.zero.outline, label: '0'};
  if (!model.levels?.length) { const top = (model.lut || COUNT_SCALE.lut)[40]; return {state: 'measured', fill: top, ink: inkFor(top), label: fmt(value), index: 40, plate: needsPlate(top)}; }
  const level = levelOf(value, model.levels);
  return {state: 'measured', fill: level.fill, ink: level.ink, label: fmt(value), index: level.index, plate: needsPlate(level.fill)};
}

const escHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/**
 * Legend markup for a ramp: all 41 samples in order (the scale itself), ticks at the samples their values take,
 * and the zero swatch when zero occurs (`zeroTitle` says what zero means here). The accessible name states the
 * method, the range and the unit in text.
 */
export function rampLegendHTML(model, {zero = false, zeroTitle = ''} = {}) {
  if (!model?.levels?.length) return '';
  const fmt = model.format || String;
  const cells = model.lut.map((c, i) => `<i style="background:${c}" data-step="${i}"></i>`).join('');
  const edge = i => (i <= 2 ? ' is-start' : i >= model.steps - 3 ? ' is-end' : '');
  const ticks = model.ticks.map(t => `<span class="ramp-tick${edge(t.index)}" style="left:${(((t.index + 0.5) / model.steps) * 100).toFixed(2)}%">${escHTML(t.label)}</span>`).join('');
  const name = `${model.steps} ระดับสีตามลำดับค่า ต่ำสุด ${fmt(model.min)} สูงสุด ${fmt(model.max)} ${model.unit}`;
  const zeroSwatch = zero ? `<span class="legend-step ramp-zero"${zeroTitle ? ` title="${escHTML(zeroTitle)}"` : ''}><i class="legend-zero" style="background:${model.zero.fill}" aria-hidden="true"></i>0</span>` : '';
  return `<span class="legend-ramp" role="img" aria-label="${escHTML(name)}"><span class="ramp-bar" aria-hidden="true">${cells}</span><span class="ramp-ticks" aria-hidden="true">${ticks}</span></span>${zeroSwatch}`;
}
