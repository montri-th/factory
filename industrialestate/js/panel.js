/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (+ data-id / data-value); the app binds one delegated handler.
 * Actions: select-estate · select-province · back · open-table · open-charts · filter-type · filter-listed ·
 * show-directory · show-around · open-factory (a link).
 *
 * Copy (the CityMETER rule carried from Hotel 0.3.1 and Factory: “กระชับอ่านเข้าใจง่าย ใช้ symbol, logo, icon, charts
 * มาช่วยทำให้ text กระชับ … ไม่มี caveats เลย และเป็นธรรมชาติ”): short Thai in the words of people who choose land and
 * plants — นิคม ผู้พัฒนา ทำเนียบ โรงงานรอบนิคม. Exactness comes from the names themselves: “รายชื่อในทำเนียบ กนอ.” (a
 * listing, never “โรงงานในนิคม”), “ชื่อตรงกับทะเบียนโรงงาน” (a name candidate, never a confirmed factory), “รอบนิคม 3 กม.”
 * (a distance set, never membership), and from one provenance line per view: dataset · source · date · boundary, then
 * “วิธีนับ” (DATA_METHOD.md, where the method and its limits live). A natural person's name is never shown.
 */
import {EN, T, nameOf, typeOf, provinceName, boundaryWords, logoCaption, shortLabel, AROUND_KM, FAMILY_IDS} from './model.js';
import {cueMarkup, seriesOf} from './cues.js';
import {actionBar} from './ask.js';

const NUMBER = new Intl.NumberFormat(EN ? 'en-GB' : 'th-TH', {maximumFractionDigits: 0});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => NUMBER.format(n);
/** Whole-number share; a non-zero part never prints as 0% ("<1%"). */
export const pct = (part, whole) => (!whole ? '—' : part && Math.round((part / whole) * 100) === 0 ? '<1%' : `${NUMBER.format(Math.round((part / whole) * 100))}%`);
const nw = html => `<span class="nowrap">${html}</span>`;
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const pic = (kind, cls = '') => `<i class="${cls ? `${cls} ` : ''}pictogram pic-${esc(kind)}" aria-hidden="true"></i>`;
export const METHOD_URL = 'DATA_METHOD.md';

export function link(url, label, cls = 'source-link') {
  const u = safeURL(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-11-04 → “4 พ.ย. 2569” (Thai) or “4 Nov 2026” (English, Christian era). */
export function dateText(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return EN ? `${d} ${MONTHS_EN[m - 1]} ${y}` : `${d} ${MONTHS_TH[m - 1]} ${y + 543}`;
}

/** Metric tile; `detail` (numerator and denominator, what the number counts) is its title and accessible text. */
export function metricTile(value, label, kind = '', detail = '') {
  const shown = typeof value === 'string' ? value : num(value);
  return `<div class="metric${kind ? ` metric-${kind}` : ''}"${detail ? ` title="${esc(detail)}"` : ''}>${pic(kind || 'plain', 'metric-symbol')}<strong class="data-number">${esc(shown)}</strong><span>${esc(label)}</span>${detail ? `<span class="sr-only">${esc(detail)}</span>` : ''}</div>`;
}
export const heading = (kind, text, id = '') => `<h3${id ? ` id="${esc(id)}"` : ''}>${pic(kind)}${esc(text)}</h3>`;

/** The logo of a record (a display copy of the master's file) or its short label; never redrawn. */
export function logoMark(e, {size = 'md', base = ''} = {}) {
  if (e?.logo) {
    const alt = T(`โลโก้ ${e.logo.label}`, `${e.logo.label} logo`);
    return `<span class="estate-logo is-${esc(size)} surface-${esc(e.logo.surface || 'any')}"><img src="${esc(base)}assets/logos/${esc(e.logo.file)}" alt="${esc(alt)}" loading="lazy" decoding="async"${e.logo.w && e.logo.h ? ` width="${e.logo.w}" height="${e.logo.h}"` : ''}></span>`;
  }
  return '';
}

/** One provenance line per view: dataset · source · date · boundary, then the method. */
export function provenance(meta, {boundary = '', factory = false, directory = true} = {}) {
  const sources = [T('ทะเบียนวิจัยนิคม สวน และเขตอุตสาหกรรม', 'industrial-estate research register'),
    directory ? T(`ทำเนียบ กนอ. ${dateText(meta.directorySnapshotOn)}`, `IEAT directory ${dateText(meta.directorySnapshotOn)}`) : '',
    T(`ขอบเขต OpenStreetMap ${dateText(meta.osmSnapshotOn)}`, `OpenStreetMap outlines ${dateText(meta.osmSnapshotOn)}`),
    factory ? T('CityMETER Factory (ทะเบียน กรอ. นอกนิคม · อก.)', 'CityMETER Factory (DIW registers outside estates · MOI)') : ''].filter(Boolean);
  return `<p class="hint panel-foot provenance"><span class="prov-part" data-prov="dataset">${pic('dataset')}<span class="sr-only">${T('ชุดข้อมูล ', 'Dataset ')}</span>CityMETER Industrial Estate</span> <span class="prov-part" data-prov="source"><span class="sr-only">${T('แหล่ง', 'Source')}</span>${T('จาก', 'from')} ${esc(sources.join(' · '))}</span><span class="prov-part" data-prov="date">${pic('date')}<span class="sr-only">${T('ตรวจ ', 'Checked ')}</span>${esc(dateText(meta.catalogCheckedOn))}</span><span class="prov-part" data-prov="boundary">${pic('area')}<span class="sr-only">${T('ขอบเขต ', 'Boundary ')}</span>${esc(boundary)}</span><span class="prov-part prov-method"><a href="${METHOD_URL}" target="_blank" rel="noopener">${T('วิธีนับ', 'Method')}</a></span></p>`;
}

/* ---------- fragments ---------- */

/** Bars of records per province (source label); a row opens the province. */
function provinceBars(provinces, {max = 8} = {}) {
  if (!provinces.length) return '';
  const top = Math.max(1, ...provinces.map(p => p.n));
  const rows = provinces.slice(0, max).map(p => `
    <li><button type="button" class="mix-row" data-action="select-province" data-id="${esc(p.code)}" title="${esc(`${p.name}: ${num(p.n)} ${T('รายการ', p.n === 1 ? 'record' : 'records')}`)}"><span class="mix-label">${esc(p.name)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill neutral-fill" style="width:${Math.max(3, Math.round((p.n / top) * 100))}%"></span></span>
      <span class="mix-value data-number">${num(p.n)}</span></button></li>`).join('');
  const more = provinces.length > max ? `<p class="hint">${T(`อีก ${num(provinces.length - max)} จังหวัด`, `${num(provinces.length - max)} more provinces`)} · <button type="button" class="link-button" data-action="open-charts">${T('ดูกราฟ', 'Open the chart')}</button></p>` : '';
  return `<ul class="mix-list" aria-label="${T('รายการตามจังหวัด', 'Records by province')}">${rows}</ul>${more}`;
}

/** Bars per type (นิคม · สวน · เขต); a row filters the type. */
function typeBars(byType, types) {
  const list = types.map(t => ({...t, n: byType.get(t.id) || 0})).filter(t => t.n);
  if (!list.length) return '';
  const top = Math.max(1, ...list.map(t => t.n));
  return `<ul class="mix-list" aria-label="${T('ประเภท', 'Types')}">${list.map(t => `
    <li><button type="button" class="mix-row" data-action="filter-type" data-value="${esc(t.id)}" title="${esc(T(`${t.th}: ${num(t.n)} รายการ (ดูเฉพาะประเภทนี้)`, `${t.en}: ${num(t.n)} records (show this type only)`))}"><span class="mix-label">${pic('estate')}${esc(T(t.th, t.en))}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill neutral-fill" style="width:${Math.max(3, Math.round((t.n / top) * 100))}%"></span></span>
      <span class="mix-value data-number">${num(t.n)}</span></button></li>`).join('')}</ul>`;
}

/** Developer / brand groups as logo chips (or their short label). */
function developerChips(groups, {max = 12, base = ''} = {}) {
  if (!groups.length) return '';
  return `<ul class="developer-grid" aria-label="${T('ผู้พัฒนาและเครือ', 'Developers and networks')}">${groups.slice(0, max).map(g => `
    <li><span class="developer-chip" title="${esc(`${g.label}: ${num(g.n)} ${T('รายการ', g.n === 1 ? 'record' : 'records')}`)}">${g.logo ? `<span class="estate-logo is-sm surface-${esc(g.logo.surface || 'any')}"><img src="${esc(base)}assets/logos/${esc(g.logo.file)}" alt="" loading="lazy" decoding="async"></span>` : ''}<span class="developer-name">${esc(shortLabel(g.label))}</span><span class="developer-count data-number">${num(g.n)}</span></span></li>`).join('')}</ul>`;
}

/** A compact list of records (cards): logo, name, type, listing count, outline badge. */
export function estateList(estates, {base = '', ramp = null} = {}) {
  if (!estates.length) return `<p class="hint">${T('ไม่มีรายการตามตัวกรอง', 'No record matches the filters')}</p>`;
  return `<ul class="estate-list">${estates.map(e => {
    const c = ramp?.byId.get(e.id);
    const swatch = e.outline ? (c?.fill ? `<i class="estate-swatch" style="background:${esc(c.fill)}" aria-hidden="true"></i>` : '<i class="estate-swatch is-hatch" aria-hidden="true"></i>') : '<i class="estate-swatch is-none" aria-hidden="true"></i>';
    const listed = e.listed ? nw(`<strong class="data-number">${num(e.dir.n)}</strong> ${T('รายชื่อ', e.dir.n === 1 ? 'listing' : 'listings')}`) : `<span class="muted">${T('ไม่มีในทำเนียบรอบนี้', 'not in this directory snapshot')}</span>`;
    return `<li><button type="button" class="estate-row" data-action="select-estate" data-id="${esc(e.id)}">
      ${swatch}<span class="estate-row-main"><span class="estate-row-name">${esc(nameOf(e))}</span><span class="estate-row-meta">${esc(typeOf(e))} · ${esc(provinceName(e.province))}${e.outline ? '' : ` · ${T('ไม่มีขอบเขต', 'no outline')}`}</span></span>
      <span class="estate-row-count">${listed}</span>${logoMark(e, {size: 'xs', base})}</button></li>`;
  }).join('')}</ul>`;
}

/* ---------- views ---------- */

/** Overview: the Aha, the catalogue at a glance, provinces, types, developers. */
export function renderOverview(ctx) {
  const {summary, aha, types, groups, meta, filtered, base} = ctx;
  const ahaHTML = aha ? `
    <section class="aha-card" aria-labelledby="aha-title">
      <p class="aha-kicker">${pic('estate')}${T('ข้อค้นพบแรก', 'First finding')}</p>
      <h2 id="aha-title" class="aha-title">${T(`${nw(`<strong class="data-number">${num(aha.n)}</strong>`)} จาก ${nw(`${num(aha.total)} รายการ`)} อยู่ใน 3 จังหวัด EEC`, `${nw(`<strong class="data-number">${num(aha.n)}</strong>`)} of ${nw(`${num(aha.total)} records`)} are in the three EEC provinces`)} <span class="aha-share data-number">${pct(aha.n, aha.total)}</span></h2>
      <ul class="aha-parts">${aha.parts.map(p => `<li><button type="button" class="link-button" data-action="select-province" data-id="${esc(p.code)}">${esc(p.name)}</button> ${nw(`<strong class="data-number">${num(p.n)}</strong>`)}</li>`).join('')}</ul>
      ${aha.listedEstates ? `<p class="hint">${T(`ทำเนียบ กนอ. มี ${nw(`${num(aha.listed)} รายชื่อ`)} ใน ${nw(`${num(aha.listedEstates)} นิคม`)} ของ EEC`, `The IEAT directory lists ${nw(`${num(aha.listed)} names`)} in ${nw(`${num(aha.listedEstates)} EEC estates`)}`)}</p>` : ''}
    </section>` : '';
  const tiles = `<div class="metrics">
    ${metricTile(summary.n, T('รายการ', 'records'), 'estate', T(`${num(summary.n)} รายการในทะเบียนวิจัย (นิคม โครงการ ระยะ หรือ campus)`, `${num(summary.n)} catalogue records (estates, projects, phases or campuses)`))}
    ${metricTile(summary.provinces.length, T('จังหวัด', 'provinces'), 'province', T('จังหวัดตามแหล่ง', 'province as the source labels it'))}
    ${metricTile(summary.outlines, T('มีขอบเขตบนแผนที่', 'outlined on the map'), 'area', T(`${num(summary.outlines)} จาก ${num(summary.n)} รายการมีขอบเขตจาก OpenStreetMap ที่ทะเบียนเลือกให้แสดง`, `${num(summary.outlines)} of ${num(summary.n)} records have an OpenStreetMap outline the register selected`))}
    ${metricTile(summary.listed, T('รายชื่อในทำเนียบ', 'directory listings'), 'factory', T(`รายชื่อในทำเนียบ กนอ. ${num(summary.listed)} รายการ ใน ${num(summary.listedEstates)} นิคม (ไม่ใช่จำนวนโรงงานที่ยืนยัน)`, `${num(summary.listed)} IEAT directory listings in ${num(summary.listedEstates)} estates (not a count of verified factories)`))}
  </div>`;
  return `
    ${ahaHTML}
    ${tiles}
    ${filtered ? `<p class="hint">${T('ตามตัวกรอง', 'With the filters')} · <button type="button" class="link-button" data-action="open-table">${T('เปิดรายชื่อ', 'Open the list')}</button></p>` : ''}
    <section aria-labelledby="ov-province">${heading('province', T('จังหวัด', 'Provinces'), 'ov-province')}${provinceBars(summary.provinces)}</section>
    <section aria-labelledby="ov-type">${heading('segment', T('ประเภท', 'Types'), 'ov-type')}${typeBars(summary.byType, types)}</section>
    <section aria-labelledby="ov-dev">${heading('building', T('ผู้พัฒนาและเครือ', 'Developers and networks'), 'ov-dev')}${developerChips(groups, {base})}</section>
    ${actionBar({kind: 'overview'})}
    ${provenance(meta, {boundary: T('จังหวัดตามแหล่ง · ขอบเขตนิคม OpenStreetMap', 'source province · OpenStreetMap estate outlines')})}`;
}

/** A province: its records as a list (logo, name, type, listings), totals on top. */
export function renderProvince(ctx) {
  const {code, summary, estates, meta, base, ramp} = ctx;
  const name = provinceName(code);
  return `
    <div class="detail-head">
      <p class="detail-kicker">${pic('province')}${T('จังหวัด', 'Province')}</p>
      <h2 class="detail-title">${esc(name)}</h2>
      <div class="metrics compact">
        ${metricTile(summary.n, T('รายการ', 'records'), 'estate')}
        ${metricTile(summary.outlines, T('มีขอบเขต', 'outlined'), 'area')}
        ${metricTile(summary.listed, T('รายชื่อในทำเนียบ', 'listings'), 'factory', T(`ใน ${num(summary.listedEstates)} นิคม`, `in ${num(summary.listedEstates)} estates`))}
      </div>
    </div>
    <section aria-labelledby="pv-list">${heading('estate', T('นิคม สวน และเขตอุตสาหกรรม', 'Estates, parks and zones'), 'pv-list')}${estateList(estates, {base, ramp})}</section>
    ${actionBar({kind: 'province', province: name})}
    ${provenance(meta, {boundary: T(`จังหวัด${name}ตามแหล่ง`, `${name} as the source labels it`)})}`;
}

/** One record: logo and developer, type, listings, name candidates, the around-estate set, the outline, links. */
export function renderEstate(ctx) {
  const {estate: e, meta, base, around, families, factoryHref, factoryRowHref, directoryState} = ctx;
  const cap = logoCaption(e);
  const developer = e.developer && e.developer !== e.logo?.label ? e.developer : '';
  const head = `
    <div class="detail-head estate-head">
      <div class="estate-brand">${logoMark(e, {size: 'lg', base})}${e.logo ? `<span class="logo-caption" title="${esc(e.logo.label)}">${esc(cap)}${e.logo.label && e.logo.label !== nameOf(e) ? ` · ${esc(shortLabel(e.logo.label))}` : ''}</span>` : (e.logoLabel ? `<span class="logo-caption" title="${esc(e.logoLabel)}">${T('ผู้พัฒนา', 'Developer')} · ${esc(shortLabel(e.logoLabel))}</span>` : '')}</div>
      <p class="detail-kicker">${pic('estate')}${esc(typeOf(e))} · ${esc(provinceName(e.province))}</p>
      <h2 class="detail-title">${esc(nameOf(e))}</h2>
      ${EN ? (e.name !== nameOf(e) ? `<p class="detail-sub" lang="th">${esc(e.name)}</p>` : '') : (e.nameEn ? `<p class="detail-sub" lang="en">${esc(e.nameEn)}</p>` : '')}
      <div class="metrics compact">
        ${metricTile(e.listed ? num(e.dir.n) : '—', T('รายชื่อในทำเนียบ', 'directory listings'), 'factory', e.listed ? T(`รายชื่อในทำเนียบ กนอ. ${dateText(meta.directorySnapshotOn)} (ไม่ใช่จำนวนโรงงานที่ยืนยัน)`, `IEAT directory, ${dateText(meta.directorySnapshotOn)} (not a count of verified factories)`) : T('ไม่มีรายชื่อในทำเนียบรอบนี้ ไม่ได้แปลว่าไม่มีโรงงาน', 'No listing in this directory snapshot, which does not mean no factory'))}
        ${metricTile(e.dir.cand ? num(e.dir.cand) : '—', T('ชื่อตรงกับทะเบียนโรงงาน', 'names matching a registration'), 'compare', T('ทะเบียนโรงงาน (FID) ที่ชื่อผู้ประกอบการตรงกับรายชื่อในทำเนียบ — ผู้สมัครจากชื่อ ยังไม่ยืนยันว่าเป็นแห่งเดียวกัน', 'Factory registrations (FID) whose operator name matches a listing — name candidates, not confirmed as the same plant'))}
        ${e.around ? metricTile(num(e.around.n), T(`ทะเบียนรอบ ${AROUND_KM} กม.`, `registrations within ${AROUND_KM} km`), 'distance', T(`ทะเบียนโรงงานใน CityMETER Factory ที่มีพิกัดห่างขอบเขตไม่เกิน ${AROUND_KM} กม. (รวมจุดในขอบเขต)`, `CityMETER Factory registrations with a point within ${AROUND_KM} km of the outline (inside it included)`)) : ''}
      </div>
    </div>`;
  const aroundHTML = e.around ? aroundSection(e, {families, factoryHref}) : `
    <section aria-labelledby="es-around">${heading('distance', T(`โรงงานรอบนิคม ${AROUND_KM} กม.`, `Factories within ${AROUND_KM} km`), 'es-around')}
      <p class="hint">${esc(boundaryWords(e))}</p>
      ${factoryHref ? `<p><a class="source-link" href="${esc(factoryHref)}">${T(`ดูโรงงาน${provinceName(e.province)}ใน CityMETER Factory`, `See the factories of ${provinceName(e.province)} in CityMETER Factory`)}</a></p>` : ''}
    </section>`;
  const dirHTML = `
    <section aria-labelledby="es-dir">${heading('factory', T('ทำเนียบ กนอ.', 'IEAT directory'), 'es-dir')}
      ${e.listed ? directoryState : `<p class="hint">${T('ไม่มีรายชื่อของนิคมนี้ในทำเนียบรอบนี้', 'This estate has no listing in this directory snapshot')}</p>`}
    </section>`;
  const facts = [
    [T('ขอบเขต', 'Outline'), e.outline ? `${esc(boundaryWords(e))} · ${link(`https://www.openstreetmap.org/${e.boundary.osm}`, `${e.boundary.osm} v${e.boundary.osmVersion}`)} · ${esc(dateText(e.boundary.snapshot))}` : esc(boundaryWords(e))],
    [T('ผู้พัฒนาตามแหล่ง', 'Developer named by the source'), esc(developer || e.developer || '—')],
    [T('หน้าในบัญชี กนอ.', 'IEAT catalogue page'), e.url ? link(e.url, T('industrial-estates.ieat.go.th', 'industrial-estates.ieat.go.th')) : '—'],
    [T('รหัสในทะเบียนวิจัย', 'Register id'), `<span class="data-number">${esc(e.id)}</span>`],
  ];
  return `
    ${head}
    ${aroundHTML}
    ${dirHTML}
    ${actionBar({kind: 'estate', estate: e})}
    <details class="source-details"><summary>${T('ที่มาและขอบเขต', 'Sources and outline')}</summary><dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></details>
    ${provenance(meta, {factory: Boolean(e.around), boundary: e.outline ? T(`ขอบเขต OSM ${e.boundary.osm}`, `OSM outline ${e.boundary.osm}`) : T(`จังหวัด${provinceName(e.province)}ตามแหล่ง`, `${provinceName(e.province)} as the source labels it`)})}`;
}

/** Around-estate set: registrations and workers within 3 km (CityMETER Factory), families as bars, a link to Factory. */
function aroundSection(e, {families, factoryHref}) {
  const a = e.around;
  const fam = a.families.filter(f => f[1] > 0 || f[2] > 0);
  const top = Math.max(1, ...fam.map(f => f[1] || 0));
  const famName = i => (EN ? families.en[i] : families.th[i]) || '';
  const bars = fam.length && fam.some(f => f[1] > 0) ? `<ul class="mix-list" aria-label="${T('อุตสาหกรรมรอบนิคม (คนงาน)', 'Industries around the estate (workers)')}">${fam.filter(f => f[1] > 0).map(([i, w, n]) => `
    <li><span class="mix-row is-static" title="${esc(`${famName(i)}: ${num(w)} ${T('คน', 'workers')} · ${num(n)} ${T('ทะเบียน', 'registrations')}`)}"><span class="mix-label">${cueMarkup(seriesOf(FAMILY_IDS[i]))}${esc(famName(i))}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill category-${seriesOf(FAMILY_IDS[i])}" style="width:${Math.max(3, Math.round((w / top) * 100))}%"></span></span>
      <span class="mix-value data-number">${num(w)}</span></span></li>`).join('')}</ul>` : '';
  const workers = a.withWorkers ? T(`คนงาน ${nw(`<strong class="data-number">${num(a.workers)}</strong> คน`)} จาก ${nw(`${num(a.withWorkers)} ทะเบียน`)}ที่มีตัวเลข`, `${nw(`<strong class="data-number">${num(a.workers)}</strong> workers`)} at the ${nw(`${num(a.withWorkers)} registrations`)} with a figure`) : (a.n ? T('ทะเบียนรอบนิคมไม่มีตัวเลขคนงาน', 'No worker figure at these registrations') : '');
  return `
    <section aria-labelledby="es-around">${heading('distance', T(`โรงงานรอบนิคม ${AROUND_KM} กม.`, `Factories within ${AROUND_KM} km`), 'es-around')}
      <p>${a.n ? T(`${nw(`<strong class="data-number">${num(a.n)}</strong> ทะเบียน`)}ใน CityMETER Factory`, `${nw(`<strong class="data-number">${num(a.n)}</strong> registrations`)} in CityMETER Factory`) : T('ไม่มีทะเบียนที่มีพิกัดในระยะนี้', 'No registration with a point in this range')}${workers ? ` · ${workers}` : ''}</p>
      ${bars}
      ${a.n ? `<p><button type="button" class="link-button" data-action="show-around">${T('ดูจุดบนแผนที่', 'Show them on the map')}</button>${factoryHref ? ` · <a class="source-link" href="${esc(factoryHref)}">${T('เปิดใน CityMETER Factory', 'Open in CityMETER Factory')}</a>` : ''}</p>` : (factoryHref ? `<p><a class="source-link" href="${esc(factoryHref)}">${T('เปิดใน CityMETER Factory', 'Open in CityMETER Factory')}</a></p>` : '')}
    </section>`;
}

/**
 * The directory list of one estate (loaded on demand): names (a natural person's withheld), each with its name
 * candidates as links to the registration in CityMETER Factory.
 */
export function renderDirectory(rows, {query = '', limit = 60, factoryRowHref = () => ''} = {}) {
  if (!rows) return `<p class="hint">${T('กำลังโหลดรายชื่อ…', 'Loading the listings…')}</p>`;
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
  const withCand = rows.filter(r => r.fids.length).length;
  const items = shown.slice(0, limit).map(r => {
    const name = r.person ? `<span class="muted">${T('ผู้ประกอบการบุคคลธรรมดา', 'Individual operator')}</span>` : esc(r.name);
    const cands = r.fids.length ? `<span class="dir-cands">${r.fids.slice(0, 3).map(fid => `<a class="dir-cand" href="${esc(factoryRowHref(fid))}" title="${esc(T(`ทะเบียนโรงงาน ${fid} ชื่อตรงกัน (ยังไม่ยืนยัน) — เปิดใน CityMETER Factory`, `Registration ${fid}, same name (not confirmed) — open in CityMETER Factory`))}">${pic('factory')}<span class="data-number">${esc(fid)}</span></a>`).join('')}${r.fids.length > 3 ? `<span class="hint">+${num(r.fids.length - 3)}</span>` : ''}</span>` : '';
    return `<li><span class="dir-name">${name}</span>${cands}</li>`;
  }).join('');
  return `
    <p class="hint">${T(`${nw(`${num(rows.length)} รายชื่อ`)} · ชื่อตรงกับทะเบียนโรงงาน ${nw(`${num(withCand)} รายชื่อ`)}`, `${nw(`${num(rows.length)} listings`)} · ${nw(`${num(withCand)}`)} match a factory registration by name`)}</p>
    <label class="dir-search"><span class="sr-only">${T('ค้นหาในทำเนียบ', 'Search the directory')}</span><input type="search" data-role="dir-search" placeholder="${T('ค้นหาชื่อในทำเนียบ', 'Search the listings')}" value="${esc(query)}"></label>
    <ul class="dir-list">${items || `<li class="hint">${T('ไม่พบชื่อ', 'No name found')}</li>`}</ul>
    ${shown.length > limit ? `<p><button type="button" class="link-button" data-action="more-directory">${T(`ดูเพิ่ม (${num(shown.length - limit)})`, `Show more (${num(shown.length - limit)})`)}</button></p>` : ''}`;
}

/** Filter chips (one per active filter, removable). */
export function renderFilterChips(f, {types, provinceName: pname}) {
  const chips = [];
  if (f.search) chips.push(['search', `“${f.search}”`]);
  if (f.type) { const t = types.find(x => x.id === f.type); chips.push(['type', t ? T(t.th, t.en) : f.type]); }
  if (f.province) chips.push(['province', pname(f.province)]);
  if (f.outline) chips.push(['outline', f.outline === 'yes' ? T('มีขอบเขต', 'outlined') : T('ยังไม่มีขอบเขต', 'no outline')]);
  if (f.listed) chips.push(['listed', f.listed === 'yes' ? T('มีในทำเนียบ', 'in the directory') : T('ไม่มีในทำเนียบรอบนี้', 'not in the directory')]);
  return chips.map(([k, label]) => `<button type="button" class="filter-chip" data-action="clear-filter" data-value="${esc(k)}" aria-label="${esc(T(`ล้างตัวกรอง ${label}`, `Clear the filter ${label}`))}">${esc(label)} <span aria-hidden="true">×</span></button>`).join('');
}
