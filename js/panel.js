/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (+ data-id / data-value); the app binds one delegated handler.
 * Actions: select-area · select-factory · select-building · select-province · filter-group · set-metric · back ·
 * explore-top · clear-focus · open-charts · open-table · clear-filter · leave-area.
 *
 * Copy (owner rule carried over from CityMETER Hotel 0.3.1: “กระชับอ่านเข้าใจง่าย ใช้ symbol, logo, icon, charts มาช่วย
 * ทำให้ text กระชับ … ไม่มี caveats เลย และเป็นธรรมชาติ”): short Thai in the words of the people deciding on land, labour
 * and services round factories; pictograms and small bar charts carry what a sentence used to; no caveat on screen.
 * Exactness comes from the names themselves — “ทะเบียน” (a registration, never a verified plant), “คนงานตามทะเบียน”,
 * “อก. ระบุ…” (the ministry's record), a rank “จาก N”, the numerator and denominator of every share (visible, or in the
 * tile's title and accessible name) — and from one provenance line per view: dataset · source (ทะเบียน กรอ. นอกนิคม
 * อุตสาหกรรม) · date · boundary, then “วิธีนับ” (DATA_METHOD.md, where the method and its limits live). Two measures
 * (js/model.js#METRICS): คน (default) · ทะเบียน. Distances are straight lines (the distance pictogram; “ระยะตรง” in
 * titles). A registration's point inside a drawn building is “โรงงานในอาคารนี้”, never “ตั้งอยู่ใน”. Sources, methods and
 * ids sit in one closed <details>. A natural person's name is never shown (js/model.js#PERSON_LABEL).
 */
import {LANG} from './shell/i18n.js';
import {thaiEstateName} from './lang.js';
import {productionLink, provinceByCode, hasPoint, SIZE_BANDS, SCOPE, MOI_TH, NO_FIGURE} from './model.js';
import {areaWord} from './areas.js';
import {cueMarkup} from './cues.js';
import {actionBar} from './ask.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => NUMBER.format(n);
/** Whole-number share; a non-zero part never prints as 0% ("<1%"). */
export const pct = (part, whole) => (!whole ? '—' : part && Math.round((part / whole) * 100) === 0 ? '<1%' : `${NUMBER.format(Math.round((part / whole) * 100))}%`);
/** A number and its unit never split across lines in running text. */
const nw = html => `<span class="nowrap">${html}</span>`;
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
/** Straight-line distance for display: "320 ม." / "1.4 กม.". */
export const meters = m => (!Number.isFinite(m) ? '' : m < 1000 ? `${num(Math.round(m / 10) * 10)} ม.` : `${(m / 1000).toLocaleString('th-TH', {maximumFractionDigits: 1})} กม.`);
/** A decorative pictogram of the approved subset (js/navigation.js PICTOGRAM_CONTRACT); the text carries the meaning. */
const pic = (kind, cls = '') => `<i class="${cls ? `${cls} ` : ''}pictogram pic-${esc(kind)}" aria-hidden="true"></i>`;
/** The method and its limits (one link at the end of every provenance line). */
export const METHOD_URL = 'DATA_METHOD.md';

export function link(url, label, cls = 'source-link') {
  const u = safeURL(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}

export function thaiDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

/** Metric tile with a decorative pictogram; value may be a preformatted string. `detail` (numerator and denominator)
 *  is the tile's title and part of its accessible text. */
export function metricTile(value, label, kind = '', detail = '') {
  const shown = typeof value === 'string' ? value : num(value);
  return `<div class="metric${kind ? ` metric-${kind}` : ''}"${detail ? ` title="${esc(detail)}"` : ''}>${pic(kind || 'plain', 'metric-symbol')}<strong class="data-number">${esc(shown)}</strong><span>${esc(label)}</span>${detail ? `<span class="sr-only">${esc(detail)}</span>` : ''}</div>`;
}
export const heading = (kind, text, id = '') => `<h3${id ? ` id="${esc(id)}"` : ''}>${pic(kind)}${esc(text)}</h3>`;

const provinceName = code => provinceByCode(code)?.th || code || '';
/** "เขตบางนา" / "อำเภอเมืองสมุทรปราการ". */
const placeName = a => (a ? `${areaWord(a.province)}${a.name}` : '');
/** One word for a list of districts: เขต (all Bangkok), อำเภอ (none), else เขต/อำเภอ. */
export const words = areas => {
  const p = new Set(areas.map(a => a.province));
  return p.size === 1 ? areaWord([...p][0]) : 'เขต/อำเภอ';
};
const valueText = (v, unit) => nw(`<strong class="data-number">${num(v)}</strong> ${esc(unit.one)}`);
const workersText = r => (Number.isFinite(r?.workers) ? `${num(r.workers)} คน` : '');
/** Workers of an aggregate in words; registrations that all lack a figure say so (never “0 คน”). */
const workersWords = x => (x.count && x.figured === 0 ? NO_FIGURE.th : `${num(x.workers)} คน`);
/** The other measure of an aggregate, in words ("85,921 คน" beside registrations, "211 ทะเบียน" beside workers). */
const otherOf = (x, unit) => (unit.id === 'count' ? workersWords(x) : `${num(x.count)} ทะเบียน`);

/* ---------- vocabularies (source details only) ---------- */

/** How the row's district was matched at build time (row.admin). */
export const ADMIN_TH = Object.freeze({
  name: 'จากชื่อเขต/อำเภอในทะเบียน',
  province: 'ระบุได้แค่จังหวัด',
});
/** DIW open-data export of each factory class (จำพวก); the public dataset page. */
const CLASS_SOURCE = Object.freeze({2: 'DIW_factype2', 3: 'DIW_factype3'});

/**
 * The provenance line every view that shows numbers ends with: dataset · source · date · boundary (each part in
 * `data-prov`, its word for screen readers), then the method link. The estate register and the terrain sources join
 * the source part when the view shows them.
 */
export function provenance(ctx = {}, boundary = '', {terrain = false, estates = false} = {}) {
  const meta = ctx.meta || {};
  const sources = ['ทะเบียน กรอ. นอกนิคมอุตสาหกรรม', 'อก.',
    estates ? `ทะเบียนนิคมและสวนอุตสาหกรรม (งานวิจัย ${thaiDate(meta.context?.estates?.checkedOn || '')})`.replace(' ()', '') : '',
    terrain ? `SRTM 30 ม. (2543)${ctx.osmDate ? ` · OSM ${thaiDate(ctx.osmDate)}` : ''}` : ''].filter(Boolean);
  return `<p class="hint panel-foot provenance"><span class="prov-part" data-prov="dataset">${pic('dataset')}<span class="sr-only">ชุดข้อมูล </span>CityMETER Factory · ${esc(SCOPE.short)}</span> <span class="prov-part" data-prov="source"><span class="sr-only">แหล่ง</span>จาก ${esc(sources.join(' · '))}</span><span class="prov-part" data-prov="date">${pic('date')}<span class="sr-only">ตรวจ </span>${esc(thaiDate(meta.checkedOn || ''))}</span><span class="prov-part" data-prov="boundary">${pic('area')}<span class="sr-only">ขอบเขต </span>${esc(boundary)}</span><span class="prov-part prov-method"><a href="${METHOD_URL}" target="_blank" rel="noopener">วิธีนับ</a></span></p>`;
}

/* ---------- shared fragments ---------- */

/** Bars per industry family in the family's series colour + shape cue; value = the measure. */
function familyBars(byGroup, unit) {
  const val = g => (unit.id === 'count' ? g.count : g.workers);
  const list = byGroup.filter(g => val(g) > 0).sort((a, b) => val(b) - val(a) || a.index - b.index);
  if (!list.length) return `<p class="hint">${unit.id === 'workers' && byGroup.some(g => g.count) && !byGroup.some(g => g.figured) ? esc(NO_FIGURE.th) : `ไม่มี${esc(unit.subject)}`}</p>`;
  const max = Math.max(1, ...list.map(val));
  return `<ul class="mix-list" aria-label="อุตสาหกรรม (${esc(unit.one)})">${list.map(g => `
    <li><button type="button" class="mix-row" data-action="filter-group" data-value="${esc(g.id)}" title="${esc(g.th)}: ${esc(`${num(g.count)} ทะเบียน · ${num(g.workers)} คน`)} (ดูเฉพาะอุตสาหกรรมนี้)"><span class="mix-label">${cueMarkup(g.series)}${esc(g.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill category-${g.series}" style="width:${Math.max(3, Math.round((val(g) / max) * 100))}%"></span></span>
      <span class="mix-value data-number">${num(val(g))}</span></button></li>`).join('')}</ul>`;
}

/**
 * Registrations per worker band (one neutral fill: the bands are ordinal, not categories); the registrations without a
 * worker figure last, only when there are any, in the no-data hatch (never a band of 0).
 */
function sizeBars(sizes) {
  if (!sizes.bands.some(b => b.count)) return '';
  const max = Math.max(1, ...sizes.bands.map(b => b.count));
  const width = n => (n ? Math.max(3, Math.round((n / max) * 100)) : 0);
  const bands = sizes.bands.filter(b => b.id !== NO_FIGURE.id || b.count);
  return `<ul class="mix-list size-list" aria-label="ขนาดตามคนงาน (ทะเบียน)">${bands.map(b => {
    const none = b.id === NO_FIGURE.id;
    return `
    <li title="${esc(b.th)}: ${num(b.count)} ทะเบียน${none ? '' : ` · ${num(b.workers)} คน`}"><span class="mix-label">${esc(b.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill ${none ? 'nodata-fill' : 'size-fill'}" style="width:${width(b.count)}%"></span></span>
      <span class="mix-value data-number">${num(b.count)}</span></li>`;
  }).join('')}</ul>`;
}

/** The 95+ lens of a place: its registrations and their share of the place's workers (both bases in the title). */
function lensLine(lens, place = '') {
  if (!lens?.base?.count) return '';
  const detail = `คนงาน 95 คนขึ้นไป ${num(lens.count)} จาก ${num(lens.base.count)} ทะเบียน · ${num(lens.workers)} จาก ${num(lens.base.workers)} คน${place ? ` ใน${place}` : ''}`;
  return `<p class="fact-line" title="${esc(detail)}">${pic('workers', 'fact-icon')}คนงาน 95 คนขึ้นไป ${nw(`<strong class="data-number">${num(lens.count)}</strong> ทะเบียน`)}${lens.base.workers ? ` · ${nw(`${pct(lens.workers, lens.base.workers)} ของคนงาน`)}` : ''}<span class="sr-only"> (${esc(detail)})</span></p>`;
}

/** Registrations by function (ผลิต · บริการ · อื่น ๆ · รอตรวจหน้าที่), the research's rule-based classification. */
function classSection(classes, total) {
  const list = (classes || []).filter(c => c.count > 0);
  if (!list.length) return '';
  const max = Math.max(1, ...list.map(c => c.count));
  return `<section class="panel-section"><div class="section-heading">${heading('class', 'หน้าที่ของโรงงาน')}<span class="hint">ทะเบียน</span></div>
    <ul class="mix-list registry-list" aria-label="ทะเบียนตามหน้าที่">${list.map(c => `<li title="${esc(c.th)}: ${num(c.count)} จาก ${num(total)} ทะเบียน · ${num(c.workers)} คน"><span class="mix-label">${esc(c.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill size-fill" style="width:${Math.max(3, Math.round((c.count / max) * 100))}%"></span></span>
      <span class="mix-value data-number">${num(c.count)}</span></li>`).join('')}</ul></section>`;
}

/** Official DIW industry groups (กลุ่มอุตสาหกรรม กรอ.) ranked by the measure; the family cue beside each, one neutral fill. */
function industryBars(list, unit) {
  if (!list.length) return '';
  const max = Math.max(1, ...list.map(c => c.value));
  const unknown = c => unit.id === 'workers' && c.count && !c.figured;
  return `<ul class="mix-list industry-list" aria-label="กลุ่มอุตสาหกรรม กรอ. (${esc(unit.one)})">${list.map(c => `
    <li title="${esc(c.industry.th)}: ${esc(`${num(c.count)} ทะเบียน · ${workersWords(c)}`)}"><span class="mix-label">${c.industry.familyRec ? cueMarkup(c.industry.familyRec.series) : ''}${esc(c.industry.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill industry-fill" style="width:${unknown(c) ? 0 : Math.max(3, Math.round((c.value / max) * 100))}%"></span></span>
      <span class="mix-value data-number">${unknown(c) ? '—' : num(c.value)}</span></li>`).join('')}</ul>`;
}

/** The industrial-area register (01_ESTATES) of a province — names, types and their pages; national: types only. */
function estatesSection(est, {province = ''} = {}) {
  if (!est?.total) return '';
  const types = `<p class="rule-chips">${est.types.map(t => `<span class="rule-chip">${pic('estate')}${esc(t.type)} ${nw(num(t.count))}</span>`).join('')}</p>`;
  if (!province) {
    const provinces = new Set(est.list.map(e => e.province)).size;
    return `<section class="panel-section"><div class="section-heading">${heading('estate', 'นิคม สวน เขตอุตสาหกรรม')}<span class="hint">${nw(`${num(est.total)} แห่ง`)} · ${nw(`${num(provinces)} จังหวัด`)}</span></div>${types}</section>`;
  }
  const item = e => `<li><span class="estate-name">${esc(e.name)}${LANG === 'en' ? (thaiEstateName(e) ? `<small lang="th" translate="no">${esc(e.name)}</small>` : '') : e.nameEn ? `<small lang="en">${esc(e.nameEn)}</small>` : ''}</span><span class="estate-type">${esc(e.type)}</span>${link(e.url, e.ieat ? 'หน้า กนอ.' : 'หน้าโครงการ', 'source-link estate-link')}</li>`;
  const shown = est.list.slice(0, 8), rest = est.list.slice(8);
  return `<section class="panel-section"><div class="section-heading">${heading('estate', 'นิคม สวน เขตอุตสาหกรรม')}<span class="hint">${nw(`${num(est.total)} แห่ง`)}</span></div>${types}
    <ul class="estate-list">${shown.map(item).join('')}</ul>
    ${rest.length ? `<details class="more-provinces"><summary>อีก ${num(rest.length)} แห่ง</summary><ul class="estate-list">${rest.map(item).join('')}</ul></details>` : ''}</section>`;
}

function rowMeta(r, {showArea = false, index = null, distance = null} = {}) {
  const area = showArea && index && r.area ? index.byId.get(r.area) : null;
  const d = distance?.get?.(r.id);
  return [workersText(r), r.industry?.th || '', area ? placeName(area) : showArea && !r.area ? (r.province ? provinceName(r.province) : 'ไม่ระบุจังหวัด') : '',
    Number.isFinite(d) ? meters(d) : ''].filter(Boolean).join(' · ');
}

/** Registrations: cue (industry family) + name, then workers · DIW group · where · distance. */
export function factoryList(rows, opts = {}) {
  return `<ul class="outlet-list">${rows.map(r => `<li><button type="button" class="brand-row" data-action="select-factory" data-id="${esc(r.id)}">${cueMarkup(r.series, {className: 'row-cue'})}<span class="row-text"><strong>${esc(r.title)}</strong>${r.op ? `<span class="row-branch">${esc(r.op)}</span>` : ''}<span class="row-meta">${esc(rowMeta(r, opts))}</span></span></button></li>`).join('')}</ul>`;
}

/** "ดูทั้งหมด 193 ทะเบียน" under a shortened list. */
const moreButton = count => `<p class="list-more"><button type="button" class="link-button" data-action="open-table">ดูทั้งหมด ${num(count)} ทะเบียน</button></p>`;

/** Districts ranked by the measure, bars in the map's 41-sample ramp colour (classOf). */
function areaRanking(list, classOf, unit, {title, note = '', limit = 10, showProvince = false, id = 'rank-title'} = {}) {
  const top = list.filter(a => a.value > 0).slice(0, limit);
  if (!top.length) return '';
  const max = Math.max(1, ...top.map(a => a.value));
  return `<section class="panel-section" aria-labelledby="${esc(id)}">
    <div class="section-heading">${heading('area', title, id)}<span class="hint">${esc(note)}</span></div>
    <ol class="rank-list">${top.map((a, i) => {
      const other = otherOf(a, unit);
      const where = `${showProvince ? `${provinceName(a.province)} · ` : ''}${num(a.value)} ${unit.one} · ${other}`;
      return `<li><button type="button" class="rank-row" data-action="select-area" data-id="${esc(a.id)}" aria-label="อันดับ ${i + 1} ${esc(placeName(a))} ${showProvince ? esc(provinceName(a.province)) : ''} ${num(a.value)} ${esc(unit.one)} ${esc(other)}">
        <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
        <span class="rank-name">${esc(placeName(a))}<small>${esc(where)}</small></span>
        <span class="rank-track" aria-hidden="true"><span class="rank-fill" style="width:${Math.max(3, Math.round((a.value / max) * 100))}%;background:${esc(classOf(a))}"></span></span>
        <span class="rank-value data-number" aria-hidden="true">${num(a.value)}</span></button></li>`;
    }).join('')}</ol>
  </section>`;
}

/* ---------- Overview ---------- */

/** "x จาก y คนในโฟกัส" — the title and accessible text of an industry share. */
const shareDetail = (g, base, unit, where) => `${g.th}: ${num(g.value)} จาก ${num(base)} ${unit.one}${where ? ` ใน${/^\d/.test(where) ? ' ' : ''}${where}` : ''}`;

/** The industries of the focus as bars (family colour + cue), each with its share of the focus total. */
function industryCompare(insight, unit, here) {
  const ind = insight.industry;
  if (!ind?.list?.length || !ind.base) return '';
  const bar = g => `<li title="${esc(shareDetail(g, ind.base, unit, here))}"><span class="mix-label">${cueMarkup(g.series)}${esc(g.short || g.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill category-${g.series}" style="width:${Math.max(2, Math.round(g.share))}%"></span></span>
      <span class="mix-value data-number">${pct(g.value, ind.base)}</span><span class="sr-only">${esc(shareDetail(g, ind.base, unit, here))}</span></li>`;
  return `<div class="aha-rail aha-industry"><p class="aha-rail-title">${pic('segment')}อุตสาหกรรมหลัก</p>
    <ul class="mix-list rail-compare">${ind.list.map(bar).join('')}</ul></div>`;
}

/** The district(s) with the most of the measure outside the leading province — every district tied at that value. */
function outsideLine(insight, home, unit, province) {
  const o = insight.outside;
  if (!o || province || o.value < 2) return '';
  const linkTo = a => `<button type="button" class="link-button" data-action="select-area" data-id="${esc(a.id)}">${esc(placeName(a))}</button> ${esc(provinceName(a.province))}`;
  const tied = o.tied || [o];
  const top = insight.areas[0];
  const lead = `${pic('rank')}อันดับ 1 นอก${esc(home)}`;
  if (tied.length === 1) {
    const more = top && o.value > top.value ? ` · มากกว่าทุก${esc(areaWord(insight.home))}ของ${esc(home)}` : '';
    const g = o.industry?.list?.[0];
    const ind = g && o.industry.base ? ` · <span title="${esc(shareDetail(g, o.industry.base, unit, placeName(tied[0])))}">${cueMarkup(g.series)}${esc(g.short || g.th)} ${nw(pct(g.value, o.industry.base))}</span>` : '';
    return `<p class="aha-secondary">${lead}: ${linkTo(tied[0])} ${valueText(o.value, unit)}${more}${ind}</p>`;
  }
  const shown = tied.slice(0, 3), rest = tied.length - shown.length;
  return `<p class="aha-secondary">${lead} (เท่ากัน ${num(tied.length)} พื้นที่): ${shown.map(linkTo).join(' · ')}${rest ? ` +${num(rest)}` : ''} · ${valueText(o.value, unit)}</p>`;
}

/**
 * focusMode: 'auto' (default top districts) · 'explicit' (user-chosen) · 'none' (every district).
 */
export function renderOverview({insight, summary, overview, focusMode = 'auto', classOf = () => 'var(--scale-count-3)', provinces = [], unknownProvince = 0,
  province = '', ctx = {}}) {
  const unit = ctx.unit;
  const count = insight.areas.length;
  const w = words(insight.areas);
  const names = insight.areas.map(a => `<button type="button" class="link-button" data-action="select-area" data-id="${esc(a.id)}">${esc(a.name)}</button>`).join(' · ');
  const home = provinceName(insight.home);
  let aha;
  if (!summary.count && focusMode !== 'explicit') {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p><h2>ไม่พบโรงงานตามตัวกรองนี้</h2>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="all" class="btn">ล้างตัวกรอง</button></div></section>`;
  } else if (focusMode === 'explicit') {
    aha = `<section class="aha is-focused" aria-label="ข้อค้นพบ"><p class="eyebrow">โฟกัส ${num(count)} ${esc(w)}</p>
      <h2>${insight.areas.map(a => esc(a.name)).join(' · ')}</h2>
      <p class="aha-copy">${valueText(insight.value, unit)} · ${nw(esc(otherOf({count: insight.count, workers: insight.workers ?? 0}, unit)))}</p>
      ${industryCompare(insight, unit, `${num(count)} ${w}นี้`)}
      <div class="aha-actions"><button type="button" data-action="clear-focus" class="btn">ดูทุกพื้นที่</button><button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบพื้นที่</button></div></section>`;
  } else if (unit.id === 'workers' && summary.count && !summary.figured) {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p><h2><span class="aha-number data-number">${num(summary.count)}</span><span class="aha-headline">ทะเบียน · ${esc(NO_FIGURE.th)}</span></h2>
      <div class="aha-actions"><button type="button" data-action="set-metric" data-value="count" class="btn">นับเป็นทะเบียน</button><button type="button" data-action="open-table" class="btn quiet">ดูรายชื่อ</button></div></section>`;
  } else if (!count && insight.spread) {
    const sw = areaWord(insight.home), sp = insight.spread;
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p>
      <h2><span class="aha-number data-number">${num(sp.areas)}</span><span class="aha-headline">${esc(sw)}ใน${esc(home)} มี${esc(unit.aha)}เท่ากัน ${esc(sw)}ละ ${num(sp.value)} ${esc(unit.one)}</span></h2>
      ${outsideLine(insight, home, unit, province)}
      <div class="aha-actions"><button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบพื้นที่</button></div></section>`;
  } else if (!count) {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p><h2><span class="aha-number data-number">${num(summary.count)}</span><span class="aha-headline">ทะเบียน · ไม่ระบุเขต/อำเภอ</span></h2>
      <div class="aha-actions"><button type="button" data-action="open-table" class="btn">ดูรายชื่อ</button></div></section>`;
  } else {
    const toggle = focusMode === 'auto'
      ? '<button type="button" data-action="clear-focus" class="btn">ดูทุกพื้นที่</button>'
      : `<button type="button" data-action="explore-top" class="btn primary">โฟกัส ${num(count)} ${esc(w)}นี้</button>`;
    const where = count === 1 ? esc(placeName(insight.areas[0])) : ` ${nw(`${num(count)} ${esc(w)}นี้`)}`;
    const here = count === 1 ? placeName(insight.areas[0]) : `${num(count)} ${w}นี้`;
    const total = insight.homeValue ?? insight.homePlacedValue;
    aha = `<section class="aha${focusMode === 'auto' ? ' is-auto' : ''}" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p>
      <h2><span class="aha-number data-number">${pct(insight.value, total)}</span><span class="aha-headline">ของ${esc(unit.aha)}ใน${esc(home)} อยู่ใน${where}</span></h2>
      <p class="aha-copy">${names}<br>${nw(`<strong class="data-number">${num(insight.value)}</strong> จาก ${num(total)} ${esc(unit.one)}`)}</p>
      ${industryCompare(insight, unit, here)}${outsideLine(insight, home, unit, province)}
      <div class="aha-actions">${toggle}<button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบพื้นที่</button></div></section>`;
  }
  const narrowed = focusMode !== 'none' && count > 0 && summary.count !== overview.count;
  const metrics = `<section class="metrics" aria-label="${narrowed ? 'ตัวเลขของพื้นที่ที่โฟกัส' : 'ตัวเลขรวมของข้อมูลที่เลือก'}">
    ${metricTile(summary.count && !summary.figured ? '—' : summary.workers, `คน${narrowed ? ' ในโฟกัส' : ''}`, 'workers', summary.count && !summary.figured ? NO_FIGURE.th : '')}
    ${metricTile(summary.count, `ทะเบียน${narrowed ? ' ในโฟกัส' : ''}`, 'factory')}
    ${metricTile(summary.areas, narrowed ? w : 'เขต/อำเภอ', 'area')}
    ${metricTile(summary.provinces, 'จังหวัด', 'province')}
  </section>`;
  const scopeText = province ? provinceName(province) : 'ประเทศไทย';
  const provinceRows = p => `<li><button type="button" class="province-row" data-action="select-province" data-id="${esc(p.code)}" aria-label="${esc(p.name)} ${num(p.value)} ${esc(unit.one)} กดเพื่อดูจังหวัด"><i class="province-swatch" style="background:${esc(p.fill)}" aria-hidden="true"></i><span class="province-name">${esc(p.name)}</span><span class="province-count data-number">${num(p.value)}<small>${esc(unit.one)}</small></span></button></li>`;
  const shown = provinces.slice(0, 8), rest = provinces.slice(8);
  const unknown = unknownProvince ? `<p class="hint">ไม่ระบุจังหวัด ${nw(`${num(unknownProvince)} ทะเบียน`)}</p>` : '';
  const provinceList = provinces.length > 1 ? `<section class="panel-section" aria-labelledby="province-title">
    <div class="section-heading">${heading('province', `จังหวัดที่มี${unit.subject}มากที่สุด`, 'province-title')}<span class="hint">${num(provinces.length)} จังหวัด</span></div>
    <ul class="province-list">${shown.map(provinceRows).join('')}</ul>
    ${rest.length ? `<details class="more-provinces"><summary>อีก ${num(rest.length)} จังหวัด</summary><ul class="province-list">${rest.map(provinceRows).join('')}</ul></details>` : ''}
    ${unknown}</section>` : '';
  const rw = province ? areaWord(province) : 'เขต/อำเภอ';
  const ranking = areaRanking(overview.ranking, classOf, unit, {title: `${rw}ที่มี${unit.subject}มากที่สุด`, note: `${num(overview.ranking.filter(a => a.value > 0).length)} ${rw}`, showProvince: !province});
  const mix = overview.count ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'อุตสาหกรรม')}<span class="hint">${esc(unit.one)}</span></div>${familyBars(overview.mix.byGroup, unit)}</section>` : '';
  const groups = overview.industries.length ? `<section class="panel-section"><div class="section-heading">${heading('factory', 'กลุ่มอุตสาหกรรม กรอ.')}<span class="hint"><button type="button" class="link-button" data-action="open-charts" data-value="industries">ดูทุกกลุ่ม</button></span></div>${industryBars(overview.industries, unit)}</section>` : '';
  const sizes = overview.count ? `<section class="panel-section"><div class="section-heading">${heading('workers', 'ขนาดตามคนงาน')}<span class="hint">ทะเบียน</span></div>${sizeBars(overview.sizes)}${lensLine(overview.lens, scopeText)}</section>` : '';
  const classes = classSection(overview.classes, overview.count);
  const estates = estatesSection(overview.estates, {province});
  return `${aha}${metrics}${provinceList}${ranking}${mix}${groups}${sizes}${classes}${estates}${actionBar({kind: 'overview', province: province ? provinceName(province) : ''})}${provenance(ctx, scopeText, {estates: Boolean(estates)})}`;
}

/* ---------- Empty selections (EVID-05) ---------- */

/**
 * measured_zero: every district is in the registry's national scope, so a district with no registration under the
 * filters is a measured 0 of this dataset — offered with where the same filters match. Never "no data".
 */
function selectionNote(p, place, ctx) {
  if (p.coverageState !== 'measured_zero') return '';
  const elsewhere = p.scopeCount > 0
    ? `<span>พบในพื้นที่อื่น <strong class="data-number">${num(p.scopeCount)}</strong> ทะเบียน</span><button type="button" class="btn quiet" data-action="leave-area">ดูพื้นที่ที่พบ</button>`
    : '';
  return `<div class="empty-note" role="note"><strong>ไม่พบโรงงานใน${esc(place)}${ctx.filtered ? 'ตามตัวกรองนี้' : ''}</strong>${elsewhere}</div>`;
}

/* ---------- District (เขต/อำเภอ) ---------- */

export function renderArea(p, classOf, ctx = {}) {
  if (!p) return '';
  const unit = ctx.unit, a = p.area, w = p.words;
  const place = `${w.area}${a.name}`, prov = provinceName(a.province);
  const rank = p.rank ? `<p class="rank-line">${pic('rank')}อันดับ ${num(p.rank)} จาก ${num(p.rankOf)} ทั่วประเทศ${p.rankProvince && p.rankProvinceOf > 1 ? ` · ${num(p.rankProvince)} จาก ${num(p.rankProvinceOf)} ใน${esc(prov)}` : ''}</p>` : '';
  const listLimit = 30;
  const share = p.count && p.provinceValue ? pct(p.value, p.provinceValue) : '—';
  const shareText = p.count && p.provinceValue ? `${num(p.value)} จาก ${num(p.provinceValue)} ${unit.one}ของ${prov}` : '';
  // The 95+ lens of the district (U+00A0 keeps “95+ คน” on one line on a narrow tile).
  const lensTile = p.count ? metricTile(p.lens.count, 'ทะเบียน 95+\u00A0คน', 'workers', `คนงาน 95 คนขึ้นไป ${num(p.lens.count)} จาก ${num(p.count)} ทะเบียน · ${num(p.lens.workers)} จาก ${num(p.workers)} คน ใน${place}`) : '';
  const workersTile = p.count && !p.figured ? metricTile('—', 'คน', 'workers', NO_FIGURE.th) : metricTile(p.workers, 'คน', 'workers');
  const head = `<section class="detail-head">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow">${esc(w.area)} · <button type="button" class="link-button" data-action="select-province" data-id="${esc(a.province)}">${esc(prov)}</button></p>
      <h2>${esc(place)}</h2>${a.nameEn ? (LANG === 'en' ? `<p class="subtle" lang="th" translate="no">${esc(place)}</p>` : `<p class="subtle">${esc(a.nameEn)}</p>`) : ''}
      ${rank}
      <div class="metrics compact">${workersTile}${metricTile(p.count, 'ทะเบียน', 'factory')}${metricTile(share, `ของ${prov}`, 'province', shareText)}${lensTile}</div>
      ${selectionNote(p, place, ctx)}
      ${actionBar({kind: 'area', area: {place, province: prov}})}
      <div class="detail-actions">${p.count ? '<button type="button" class="btn" data-action="open-table">ดูรายชื่อ</button><button type="button" class="btn quiet" data-action="open-charts">เปรียบเทียบพื้นที่</button>' : ''}${link(productionLink({province: a.province, area: a.id}), 'ดูใน CityMETER', 'btn quiet source-link')}</div>
    </section>
`;
  const boundary = `${place} ${prov}`;
  const estates = estatesSection(p.estates, {province: a.province});
  if (!p.count) return `${head}${estates}${provenance(ctx, boundary, {estates: Boolean(estates)})}`;
  const big = p.big ? `<p class="fact-line" title="ทะเบียนที่มีคนงานตั้งแต่ 1,000 คน">${pic('workers', 'fact-icon')}1,000 คนขึ้นไป ${nw(`${num(p.big)} ทะเบียน`)}</p>` : '';
  return `${head}    <section class="panel-section"><div class="section-heading">${heading('segment', 'อุตสาหกรรม')}<span class="hint">${esc(unit.one)}</span></div>${familyBars(p.byGroup, unit)}</section>
    ${p.industries.length ? `<section class="panel-section"><div class="section-heading">${heading('factory', 'กลุ่มอุตสาหกรรม กรอ.')}<span class="hint">${esc(unit.one)}</span></div>${industryBars(p.industries.slice(0, 6), unit)}</section>` : ''}
    <section class="panel-section"><div class="section-heading">${heading('workers', 'ขนาดตามคนงาน')}<span class="hint">ทะเบียน</span></div>${sizeBars(p.sizes)}${lensLine(p.lens, place)}${big}</section>
    <section class="panel-section"><div class="section-heading">${heading('factory', 'โรงงาน')}<span class="hint">เรียงตามคนงาน</span></div>${factoryList(p.rows.slice(0, listLimit))}
      ${p.count > listLimit ? moreButton(p.count) : ''}</section>
    ${classSection(p.classes, p.count)}${estates}
    ${provenance(ctx, boundary, {estates: Boolean(estates)})}`;
}

/* ---------- Building (display-time spatial join) ---------- */

/** Where a drawn building's outline and height come from (Hotel 0.3.0, per อปท./เขต). */
export const BUILDING_SOURCE_TH = Object.freeze({osm: 'OpenStreetMap', cm: 'CityMETER Building V4'});

export function renderBuilding(b, ctx = {}) {
  if (!b) return '';
  const w = b.words;
  const area = b.area ? `${w.area}${b.area.name}` : '';
  const source = BUILDING_SOURCE_TH[b.kind] || BUILDING_SOURCE_TH.osm;
  // “สูงราว”: a CityMETER height is the dataset's model estimate, an OSM height a tag or the schema's default; the
  // source is named in the title and in the provenance line.
  const height = b.height != null ? `<span title="ความสูงจาก ${esc(source)}">สูงราว ${num(Math.round(b.height))} ม.</span>` : '';
  const withPoint = b.rows.find(hasPoint);
  return `<section class="detail-head building">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow">${pic('building')} ${b.area ? `<button type="button" class="link-button" data-action="select-area" data-id="${esc(b.area.id)}">${esc(area)}</button>` : 'อาคาร'}${height ? ` · ${height}` : ''}</p>
      <h2>โรงงานในอาคารนี้</h2>
      <div class="metrics compact">${metricTile(b.workers, 'คน', 'workers')}${metricTile(b.count, 'ทะเบียน', 'factory')}</div>
      ${actionBar({kind: 'building', rows: b.rows, area: b.area ? {place: area, province: provinceName(b.area.province)} : null,
        point: withPoint ? {lat: withPoint.latitude, lon: withPoint.longitude, role: 'point'} : null})}
    </section>
    <section class="panel-section"><div class="section-heading">${heading('factory', 'โรงงาน')}<span class="hint">${num(b.count)}</span></div>${factoryList(b.rows.slice(0, 40), {showArea: b.areaCount > 1, index: ctx.index})}
      ${b.count > 40 ? moreButton(b.count) : ''}</section>
    ${provenance(ctx, `จุดในขอบอาคาร ${source}${area ? ` · ${area}` : ''}`)}`;
}

/* ---------- Factory registration ---------- */

/** Nearby set: the rule as chips (family · workers · radius), nearest first, and every registration round it. */
function nearbySection(c, family) {
  if (!c) return '';
  const sized = c.rule.min != null;
  const rule = [`${family ? cueMarkup(family.series) : pic('segment')}${esc(family?.short || 'อุตสาหกรรมเดียวกัน')}`, `${pic('workers')}${sized ? `${num(c.rule.min)}–${num(c.rule.max)} คน` : 'ทุกขนาด'}`,
    `${pic('distance')}≤ ${esc(meters(c.radius))}`].map(t => `<span class="rule-chip">${t}</span>`).join('');
  const list = c.rows.length
    ? `<ul class="outlet-list compset">${c.rows.map(({row: r, m}) => `<li><button type="button" class="brand-row" data-action="select-factory" data-id="${esc(r.id)}">${cueMarkup(r.series, {className: 'row-cue'})}<span class="row-text"><strong>${esc(r.title)}</strong><span class="row-meta">${esc([meters(m), workersText(r), r.industry?.th || ''].filter(Boolean).join(' · '))}</span></span></button></li>`).join('')}</ul>`
    : '<p class="hint">ไม่พบโรงงานตามเกณฑ์นี้</p>';
  return `<section class="panel-section"><div class="section-heading">${heading('compare', 'โรงงานใกล้เคียง')}<span class="hint">${num(c.matches)} ทะเบียน</span></div>
    <p class="rule-chips" title="อุตสาหกรรมเดียวกัน${sized ? ' คนงานครึ่งเท่าถึงสองเท่า' : ''} ในระยะตรง ${esc(meters(c.radius))} เรียงใกล้ก่อน">${rule}</p>${list}
    <p class="fact-line">${pic('factory', 'fact-icon')}โรงงานทุกอุตสาหกรรมรอบ ${esc(meters(c.radius))} ${nw(`<strong class="data-number">${num(c.around.count)}</strong> ทะเบียน`)} · ${nw(`${num(c.around.workers)} คน`)}</p></section>`;
}

export function renderFactory(d, ctx = {}) {
  if (!d) return '';
  const r = d.row, w = d.words, fam = d.family;
  const prov = provinceName(r.province);
  const coords = hasPoint(r) ? `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}` : '';
  const areaChip = d.area
    ? `<button type="button" class="fact-chip" data-action="select-area" data-id="${esc(d.area.id)}">${pic('area')}${esc(w.area)}${esc(d.area.name)} · ${esc(prov)}</button>`
    : r.province ? `<button type="button" class="fact-chip" data-action="select-province" data-id="${esc(r.province)}">${pic('province')}${esc(prov)}</button>` : '<span class="fact-chip is-quiet">ไม่ระบุจังหวัด</span>';
  const size = SIZE_BANDS.find(b => b.id === r.size);
  const workersChip = r.workers == null
    ? `<span class="fact-chip is-quiet" title="ทะเบียนนี้ไม่มีตัวเลขคนงานในข้อมูล กรอ.">${pic('workers')}${esc(NO_FIGURE.th)}</span>`
    : `<span class="fact-chip" title="คนงานตามทะเบียน กรอ.">${pic('workers')}${esc(workersText(r))}${size ? ` · ${esc(size.short)}` : ''}</span>`;
  const rankChip = r.rank ? `<span class="fact-chip" title="อันดับตามคนงาน จาก ${num(d.rankOf)} ทะเบียนที่มีตัวเลขคนงานทั่วประเทศ">${pic('rank')}อันดับ ${num(r.rank)} จาก ${num(d.rankOf)}</span>` : '';
  const familyChip = fam ? `<button type="button" class="fact-chip" data-action="filter-group" data-value="${esc(fam.id)}" title="${esc(r.industry?.th || fam.th)} (ดูเฉพาะ${esc(fam.th)})">${cueMarkup(fam.series)}${esc(fam.th)}</button>` : '';
  const classChip = r.fcls ? `<span class="fact-chip" title="โรงงานจำพวก ${num(r.fcls)} ตามทะเบียน กรอ.">${pic('class')}จำพวก ${num(r.fcls)}</span>` : '';
  const functionChip = r.cls ? `<span class="fact-chip" title="หน้าที่ของโรงงานตามประเภทโรงงาน (การจัดกลุ่มของงานวิจัย)">${pic('factory')}${esc(r.cls.th)}</span>` : '';
  const statusChip = `<span class="fact-chip${r.moi ? '' : ' is-quiet'}" title="${esc(r.moi ? `สถานะตามข้อมูลที่ตั้งประกอบกิจการโรงงานของกระทรวงอุตสาหกรรม${r.moiOn ? ` ${thaiDate(r.moiOn)}` : ''}` : 'ไม่พบเลขทะเบียนนี้ในข้อมูลที่ตั้งประกอบกิจการโรงงานของกระทรวงอุตสาหกรรม')}">${pic('status')}${esc(MOI_TH[r.moi] ?? r.moi)}</span>`;
  const bd = d.building;
  const buildingChip = bd?.others ? `<button type="button" class="fact-chip" data-action="select-building" data-id="${esc(bd.key)}" title="จุดของโรงงานอีก ${num(bd.others)} ทะเบียนอยู่ในอาคารนี้บนแผนที่">${pic('building')}อีก ${num(bd.others)} ทะเบียนในอาคารนี้</button>` : '';
  const sameArea = d.area && d.sameArea.count ? `<p class="fact-line">${pic('factory', 'fact-icon')}ใน${esc(w.area)}${esc(d.area.name)}อีก ${nw(`<button type="button" class="link-button" data-action="select-area" data-id="${esc(d.area.id)}">${num(d.sameArea.count)} ทะเบียน</button>`)} · ${nw(`${num(d.sameArea.workers)} คน`)}</p>` : '';
  const own = d.area ? `${w.area}${d.area.name}` : prov;
  const point = coords
    ? `<span class="data-number">${esc(coords)}</span><br><span class="hint">จุดจากแหล่ง</span>`
    : `<span>${r.person ? 'ไม่เผยแพร่' : r.off ? `จุดในแหล่งอยู่นอก${esc(own)}` : 'ไม่มีพิกัด'}</span>`;
  const noPointChip = r.person ? 'ไม่เผยแพร่พิกัด' : r.off ? 'ไม่แสดงพิกัด' : 'ไม่มีพิกัด';
  const sourceOf = id => (ctx.sources || []).find(s => s.id === id);
  const diw = sourceOf(CLASS_SOURCE[r.fcls]), moi = sourceOf('MOI_location');
  const sourceLinks = [diw ? link(diw.url, `ทะเบียนจำพวก ${num(r.fcls)}`) : '', r.moi && moi ? link(moi.url, 'ที่ตั้งโรงงาน อก.') : ''].filter(Boolean).join(' · ');
  const nameLine = r.person ? '' : r.op ? `<p class="branch-name">${esc(r.op)}</p>` : '';
  return `<section class="detail-head store">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity"><span class="identity-cue">${cueMarkup(r.series)}</span><div>
        <p class="eyebrow eyebrow-cue">${esc(fam?.th || '')}${r.industry?.th && r.industry.th !== fam?.th ? ` · ${esc(r.industry.th)}` : ''}</p>
        <h2>${esc(r.title)}</h2>
        ${nameLine}</div></div>
      <div class="fact-chips">${workersChip}${rankChip}${areaChip}${familyChip}${functionChip}${classChip}${statusChip}${buildingChip}${coords ? '' : `<span class="fact-chip is-quiet"${r.off ? ` title="จุดในแหล่งอยู่นอก${esc(own)}ของทะเบียน"` : ''}>${noPointChip}</span>`}</div>
      ${sameArea}
      ${actionBar(r.person ? {kind: 'area', area: d.area ? {place: `${w.area}${d.area.name}`, province: prov} : null}
        : {kind: 'factory', row: r, area: d.area ? {place: `${w.area}${d.area.name}`, province: prov} : r.province ? {place: '', province: prov} : null,
          point: hasPoint(r) ? {lat: r.latitude, lon: r.longitude, role: 'point'} : null})}
      <details class="source-details"><summary>ที่มาและพิกัด</summary>
        <dl class="facts">
          <dt>แหล่ง</dt><dd>${esc(r.basis || 'ทะเบียน กรอ.')}${sourceLinks ? ` · ${sourceLinks}` : ''}</dd>
          ${r.type?.code ? `<dt>ประเภท</dt><dd><span class="data-number">${esc(r.type.code)}</span> ${esc(r.type.th)}</dd>` : ''}
          ${r.industry?.th ? `<dt>กลุ่ม กรอ.</dt><dd>${esc(r.industry.th)}</dd>` : ''}
          ${r.cls ? `<dt>หน้าที่</dt><dd>${esc(r.cls.th)} · จัดจากประเภทโรงงาน (งานวิจัย)</dd>` : ''}
          <dt>สถานะ อก.</dt><dd>${r.moi ? `${esc(r.moi)}${r.moiOn ? ` · ${nw(esc(thaiDate(r.moiOn)))}` : ''}` : 'ไม่พบใน อก.'}</dd>
          <dt>พื้นที่</dt><dd>${esc(ADMIN_TH[r.admin] || '')}${r.sub ? ` · ตำบล/แขวง${esc(r.sub)}` : ''}</dd>
          <dt>พิกัด</dt><dd>${point}</dd>
          ${r.dup ? '<dt>ทะเบียนซ้ำ</dt><dd>ชื่อและที่อยู่ตรงกับอีกทะเบียน</dd>' : ''}
          <dt>เลขทะเบียน</dt><dd><span class="hint data-number">${esc(r.id)}</span></dd>
        </dl>
        <p class="links">${d.area ? link(productionLink({province: r.province, area: r.area}), 'ดูพื้นที่นี้ใน CityMETER') : ''}</p>
      </details>
    </section>
    ${hasPoint(r) ? `<section class="panel-section terrain-section"><div class="section-heading">${heading('elevation', 'ภูมิประเทศ')}</div>
      <div class="fact-chips terrain-chips" data-terrain-for="${esc(r.id)}"><span class="hint">กำลังอ่านภูมิประเทศ</span></div></section>` : ''}
    ${nearbySection(d.nearby, fam)}
    ${provenance(ctx, d.area ? `${w.area}${d.area.name} ${prov}` : prov || 'ไม่ระบุจังหวัด', {terrain: hasPoint(r)})}`;
}

/** Terrain chips (js/shell/terrain.js#terrainChips) as fact chips; '' when nothing is known. */
export function terrainChipsHTML(chips) {
  return chips.map(c => `<span class="fact-chip" title="${esc(c.title)}">${pic(c.kind)}${esc(c.text)}</span>`).join('');
}

/* ---------- Active filter chips ---------- */

export function renderFilterChips(values, labels) {
  const chips = [];
  const push = (key, text) => chips.push(`<li><button type="button" class="filter-chip" data-action="clear-filter" data-id="${esc(key)}" aria-label="ล้างตัวกรอง ${esc(text)}"><span>${esc(text)}</span><i aria-hidden="true">×</i></button></li>`);
  if (values.search) push('search', `ค้นหา “${values.search}”`);
  if (values.group) push('group', labels.group[values.group] || values.group);
  if (values.size) push('size', labels.size[values.size] || values.size);
  if (values.province) push('province', labels.province[values.province] || values.province);
  if (values.cls) push('cls', labels.cls[values.cls] || values.cls);
  return chips.length ? `<ul class="filter-chips" aria-label="ตัวกรองที่ใช้อยู่">${chips.join('')}<li><button type="button" class="filter-chip clear-all" data-action="clear-filter" data-id="all">ล้างทั้งหมด</button></li></ul>` : '';
}
