/**
 * CityMETER · Industrial Estate — application orchestration.
 *
 * Rows are the 106 catalogue records of the industrial-estate research master (registry
 * research.TH.industrial_estates, contract industrial-estate-demo/1.0.0): estates, parks and zones as the master lists
 * them. One committed selection drives everything: filters (search · type · province · outline · listed) give the
 * scope; the province filter is the province level (`at`); an estate is the item (`e=estate:<estate_id>`).
 *
 * Map (3D first, like the other CityMETER demos): the 46 OpenStreetMap outlines the master selected for the demo,
 * coloured by IEAT directory listings on one 41-sample LDS `count` ramp (no listing in this snapshot → the EVID-05
 * no-data hatch, never 0), province outlines for context, the city's buildings, and — round the open estate — the
 * CityMETER Factory registrations with a point within 3 km of its outline (a distance set, never membership). An estate
 * without an outline is never drawn as a guessed point; it is listed with the reason.
 *
 * First finding (Aha, js/model.js#ahaOf): how many records of the scope sit in the three EEC provinces, the camera on
 * their outlines in 3D. Panel modes: overview | province | estate (with a back stack). URL state (own names, inside):
 * filters, estate, view, view3d — written in the shared grammar d · at · e · f.* · view · v3d by citymeter-shell
 * (js/shell/url.js), with a browser history entry per level (the back button goes up a level).
 */
import {registerDataNames, keepNames} from './lang.js';
import {EN, T, decodeData, filterEstates, summarize, ahaOf, estateRamp, developerGroups, catalogueOrder, provinceByCode, provinceName,
  nameOf, typeOf, aroundRows, directoryRows, aroundRadius, shortLabel, FAMILY_IDS, EEC, FILTERS} from './model.js';
import {renderOverview, renderProvince, renderEstate, renderDirectory, renderFilterChips, estateList, esc, num, pct, dateText, provenance} from './panel.js';
import {loadMapLibrary} from './shell/vendors.js';
import {buildMapStyle, basemapPalette, TILEJSON_URL, MASSING_BEFORE} from './shell/map-style.js';
import {installMassing, outerRings, GEOJSON_MAXZOOM} from './massing.js';
import {createBuildingUnitStore, cmTileUrl, CM_ATTRIBUTION} from './shell/building-units.js';
import {applyPreset, fitPitched, presetFor} from './shell/camera.js';
import {guardRetainedTiles, guardElevationFreeze, mapBudget, budgetPixelRatio, reloadOnContextLoss} from './shell/maplibre-guard.js';
import {buildBreadcrumb, renderBreadcrumb} from './shell/breadcrumb.js';
import {rampLegendHTML} from './scales.js';
import {cueImage, seriesOf} from './cues.js';
import {installEstateLabels} from './labels.js';
import {createCodec, createNavigator} from './shell/url.js';
import {pageTitle} from './shell/title.js';
import {createIndex} from './shell/fuzzy.js';
import {installSearch} from './shell/search.js';
import {SEARCH_KINDS, SEARCH_HEADS, SEARCH_HINT, searchEntries, searchNote} from './find.js';
import {DEMOS, demoUrl} from './shell/datasets.js';

const $ = id => document.getElementById(id);
const FIELDS = FILTERS; // search · type · province · outline · listed
const THEME_KEY = 'citymeter-industrialestate-theme';
const RELEASE = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch { return ''; } })();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobilePortrait = () => matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
const THAILAND = [[97.34, 5.61], [105.64, 20.47]];
const ESTATE_SRC = 'estates', AROUND_SRC = 'around', PROVINCE_SRC = 'provinces', HATCH = 'estate-nodata-hatch';
const PAGE_SIZE = 25;
const FACTORY = DEMOS.find(d => d.path === 'factory');

const state = {
  data: null, index: null, provincesGeo: null, boundaries: null, directory: null, around: null,
  scope: [], ramp: null, summary: null, view: 'provinces', page: 0,
  panel: {mode: 'overview', id: ''}, history: [], dirQuery: '', dirLimit: 60,
  map: null, loaded: false, mapTheme: '', view3d: true, showAround: true, initialCameraDone: false, tileTemplate: '',
  massing: null, labels: null, buildingUnits: null, popup: null,
};

/* ---------- address (citymeter-shell) ---------- */
const nav = createNavigator(createCodec({
  dataset: 'industrialEstate', levels: ['P'], place: {province: 'province'},
  items: {estate: 'estate'}, filters: FIELDS,
  rename: {view: 'view', view3d: 'v3d'},
}), {onPop: restoreFromHistory});

/* ---------- helpers ---------- */
const values = () => Object.fromEntries(FIELDS.map(k => [k, $(k).value]));
const estateById = id => state.data?.byId.get(id) || null;
const announce = text => { $('announcement').textContent = text; };
const theme = () => document.documentElement.dataset.theme;
const animate = () => !reduced();
const cssVar = (name, fallback = '') => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const overviewPanel = () => ({mode: 'overview', id: ''});
const langQuery = () => (EN ? '&lang=en' : '');
/** CityMETER Factory, the same estate (e=estate:…): Factory frames its outline and lists the registrations round it. */
/** The estate in CityMETER Factory: its estate view (outline + registrations ≤ 3 km) when it has an outline — the estate
 * is the place there, so no `at` — else its province, whose panel lists the register. */
const factoryEstateHref = e => `${demoUrl(FACTORY)}?d=factory${e.outline ? `&e=estate:${encodeURIComponent(e.id)}` : `&at=${encodeURIComponent(e.province)}`}${langQuery()}`;
const factoryRowHref = fid => `${demoUrl(FACTORY)}?d=factory&e=factory:${encodeURIComponent(fid)}${langQuery()}`;

function saveURL() {
  const f = values(), p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  if (state.panel.mode === 'estate' && state.panel.id) p.set('estate', state.panel.id);
  if (state.view !== 'provinces') p.set('view', state.view);
  if (!state.view3d) p.set('view3d', '0');
  nav.commit(p);
}

/* ---------- theme ---------- */
function applyTheme() {
  const value = $('theme').value;
  const next = value === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, value); } catch {}
  if (state.map && next !== state.mapTheme) {
    state.loaded = false;
    disposeSpatial();
    state.mapTheme = next;
    state.map.setStyle(buildMapStyle(next), {diff: false});
  }
}

function disposeSpatial() {
  for (const k of ['massing']) { try { state[k]?.dispose?.(); } catch (e) { console.warn('dispose', k, e); } state[k] = null; }
}

/* ---------- selection ---------- */
function update({fit = false} = {}) {
  const f = values();
  state.scope = filterEstates(state.data.estates, f).sort(catalogueOrder);
  state.summary = summarize(state.scope);
  state.ramp = estateRamp(state.scope);
  state.page = 0;
  const active = FIELDS.filter(k => f[k]).length;
  $('filter-count').textContent = active ? T(`${active} ตัวกรอง`, `${active} active`) : '';
  $('filter-chips').innerHTML = renderFilterChips(f, {types: state.data.types, provinceName});
  $('result-count').textContent = num(state.scope.length);
  renderCrumbs();
  renderPanel();
  renderLegend();
  renderTable.stale = true;
  if (!$('results').hidden) renderTable();
  drawChart();
  updateSpatialLayers();
  if (fit && state.loaded) fitMap();
  saveURL();
  state.finder?.sync();
  document.title = pageTitle(titlePage());
}

function titlePage() {
  if (state.panel.mode === 'estate') return nameOf(estateById(state.panel.id));
  const code = $('province').value;
  return code ? T(`นิคมอุตสาหกรรม ${provinceName(code)}`, `Industrial estates · ${provinceName(code)}`) : 'Industrial Estate';
}

function renderCrumbs() {
  const e = state.panel.mode === 'estate' ? estateById(state.panel.id) : null;
  const province = e?.province || $('province').value || '';
  const crumbs = buildBreadcrumb({province}, {dataset: '', provinceByCode: code => {
    const p = provinceByCode(code);
    return p ? {code: p.code, th: p.th} : null;
  }});
  $('crumbs').innerHTML = renderBreadcrumb(crumbs);
}

function panelBase() { return ''; }

function renderPanel() {
  const meta = state.data.meta;
  const view = $('panel-view');
  const mode = state.panel.mode;
  // The stylesheet reads the mode: on a phone the heading and the search stand with the overview only. Without it
  // the phone sheet showed no search and no filter in any view (release 1.1.0 and before).
  $('panel').dataset.mode = mode;
  const back = state.history.length ? `<button type="button" class="back-button" data-action="back">${T('กลับ', 'Back')}</button>` : '';
  if (mode === 'estate') {
    const e = estateById(state.panel.id);
    if (!e) { state.panel = overviewPanel(); return renderPanel(); }
    const families = {th: state.around?.meta?.families || [], en: state.around?.meta?.familiesEn || []};
    view.innerHTML = back + renderEstate({estate: e, meta, base: panelBase(), around: null, families: families.th.length ? families : FALLBACK_FAMILIES,
      factoryHref: factoryEstateHref(e), factoryRowHref, directoryState: directoryHTML(e)});
    if (e.listed && !state.directory) loadDirectory();
    if (e.outline && !state.around) loadAround();
  } else if (mode === 'province') {
    const code = state.panel.id;
    const list = state.scope.filter(e => e.province === code);
    view.innerHTML = back + renderProvince({code, summary: summarize(list), estates: list, meta, base: panelBase(), ramp: state.ramp});
  } else {
    const f = values();
    view.innerHTML = renderOverview({summary: state.summary, aha: ahaOf(state.scope), types: state.data.types,
      groups: developerGroups(state.scope), meta, base: panelBase(), filtered: FIELDS.some(k => f[k])});
  }
  renderMapAha();
}

/** Industry family names before data/around.json has arrived (CityMETER Factory families). */
const FALLBACK_FAMILIES = {th: [], en: []};

function directoryHTML(e) {
  if (!e.listed) return '';
  const rows = state.directory ? directoryRows(state.directory, e.id) : null;
  return `<div id="directory-box">${renderDirectory(rows, {query: state.dirQuery, limit: state.dirLimit, factoryRowHref})}</div>`;
}

function refreshDirectory() {
  const box = $('directory-box');
  const e = estateById(state.panel.id);
  if (!box || !e) return;
  const rows = state.directory ? directoryRows(state.directory, e.id) : null;
  const focused = document.activeElement?.dataset?.role === 'dir-search';
  box.innerHTML = renderDirectory(rows, {query: state.dirQuery, limit: state.dirLimit, factoryRowHref});
  if (focused) { const input = box.querySelector('[data-role="dir-search"]'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }
}

async function loadDirectory() {
  if (loadDirectory.promise) return loadDirectory.promise;
  loadDirectory.promise = fetchJSON(`data/directory.json?v=${RELEASE}`, {timeout: 60000}).then(d => {
    state.directory = d;
    const names = new Set();
    for (const rows of Object.values(d.estates || {})) for (const r of rows) if (r[1]) names.add(r[1]);
    keepNames(names);
    refreshDirectory();
  }).catch(e => { partial('data/directory.json'); console.warn('Directory unavailable', e); loadDirectory.promise = null; const box = $('directory-box'); if (box) box.innerHTML = `<p class="hint">${T('โหลดรายชื่อไม่สำเร็จ', 'The listings did not load')}</p>`; });
  return loadDirectory.promise;
}

async function loadAround() {
  if (loadAround.promise) return loadAround.promise;
  loadAround.promise = fetchJSON(`data/around.json?v=${RELEASE}`, {timeout: 60000}).then(d => {
    state.around = d;
    keepNames(new Set(d.rows.map(r => r[1]).filter(Boolean)));
    if (state.panel.mode === 'estate') { const scroll = $('panel').scrollTop; renderPanel(); $('panel').scrollTop = scroll; }
    updateAroundLayer();
  }).catch(e => { partial('data/around.json'); console.warn('Around set unavailable', e); loadAround.promise = null; });
  return loadAround.promise;
}

/** The phone dock's Aha line (the panel carries the full card). */
function renderMapAha() {
  const el = $('map-aha');
  const aha = state.panel.mode === 'overview' ? ahaOf(state.scope) : null;
  if (!aha || !mobilePortrait() || $('panel').classList.contains('is-open')) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<h2>${T(`${num(aha.n)} จาก ${num(aha.total)} รายการอยู่ใน 3 จังหวัด EEC (${pct(aha.n, aha.total)})`, `${num(aha.n)} of ${num(aha.total)} records are in the three EEC provinces (${pct(aha.n, aha.total)})`)}</h2><button type="button" class="btn" data-action="open-panel">${T('ดูข้อมูล', 'Details')}</button>`;
}

function pushHistory() { state.history.push({...state.panel, province: $('province').value}); if (state.history.length > 12) state.history.shift(); }

function goBack() {
  const prev = state.history.pop();
  if (!prev) { state.panel = overviewPanel(); }
  else { state.panel = {mode: prev.mode, id: prev.id}; $('province').value = prev.province || ''; }
  closePopup();
  update({fit: true});
}

function selectEstate(id, {fromMap = false} = {}) {
  const e = estateById(id);
  if (!e) return;
  if (state.panel.mode !== 'estate' || state.panel.id !== id) pushHistory();
  state.panel = {mode: 'estate', id};
  state.dirQuery = ''; state.dirLimit = 60;
  closePopup();
  if (e.outline && !state.view3d) ensure3d();
  update({fit: true});
  openMobilePanel();
  announce(`${nameOf(e)} · ${typeOf(e)} · ${provinceName(e.province)}`);
  if (!fromMap) $('panel').scrollTop = 0;
}

function selectProvince(code) {
  if (!provinceByCode(code)) return;
  if (state.panel.mode !== 'province' || $('province').value !== code) pushHistory();
  $('province').value = code;
  state.panel = {mode: 'province', id: code};
  closePopup();
  update({fit: true});
  announce(provinceName(code));
}

function resetToOverview() {
  for (const f of FIELDS) $(f).value = '';
  state.panel = overviewPanel(); state.history = [];
  closePopup();
  update({fit: true});
}

function onPanelAction(event) {
  const t = event.target.closest('[data-action]');
  if (!t) return;
  const {action, id, value} = t.dataset;
  if (action === 'select-estate') { event.preventDefault(); selectEstate(id); }
  else if (action === 'select-province' || action === 'crumb-province') { event.preventDefault(); selectProvince(id); }
  else if (action === 'crumb-country') { event.preventDefault(); $('province').value = ''; state.history = []; state.panel = overviewPanel(); closePopup(); update({fit: true}); }
  else if (action === 'back') { event.preventDefault(); goBack(); }
  else if (action === 'filter-type') { $('type').value = value; state.panel = $('province').value ? {mode: 'province', id: $('province').value} : overviewPanel(); update({fit: true}); }
  else if (action === 'clear-filter') { $(value).value = ''; if (value === 'province') state.panel = overviewPanel(); update({fit: true}); }
  else if (action === 'open-table') { openTable(); }
  else if (action === 'open-charts') { openInsights(true); }
  else if (action === 'show-around') { state.showAround = true; $('toggle-around').setAttribute('aria-pressed', 'true'); updateAroundLayer(); fitMap({around: true}); closeMobilePanel(); }
  else if (action === 'more-directory') { state.dirLimit += 120; refreshDirectory(); }
  else if (action === 'open-panel') { openMobilePanel(); }
  else if (action === 'crumb-expand') { t.closest('.crumbs')?.classList.toggle('is-expanded'); t.setAttribute('aria-expanded', String(t.closest('.crumbs')?.classList.contains('is-expanded'))); }
}

/* ---------- legend, chart, table ---------- */
function renderLegend() {
  const r = state.ramp;
  const steps = r?.ramp?.levels?.length ? rampLegendHTML(r.ramp) : '';
  const hatch = r?.noData ? `<span class="legend-nodata-item" title="${esc(T('ไม่มีรายชื่อในทำเนียบรอบนี้ ไม่ได้แปลว่าไม่มีโรงงาน', 'No listing in this directory snapshot, which does not mean no factory'))}"><i class="legend-hatch" aria-hidden="true"></i>${T('ไม่มีในทำเนียบ', 'not listed')}</span>` : '';
  $('legend-steps').innerHTML = steps + hatch;
  $('legend-around').hidden = !(state.panel.mode === 'estate' && estateById(state.panel.id)?.outline && state.showAround);
}

function drawChart() {
  const el = $('chart');
  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
  el.setAttribute('aria-labelledby', `tab-${state.view}`);
  const bars = (items, action) => {
    if (!items.length) return `<p class="hint">${T('ไม่มีรายการ', 'Nothing to compare')}</p>`;
    const top = Math.max(1, ...items.map(i => i.n));
    return `<ul class="chart-bars">${items.map(i => `<li><button type="button" class="chart-row"${action ? ` data-action="${action}" data-id="${esc(i.id)}"` : ''} title="${esc(`${i.label}: ${num(i.n)} ${T('รายการ', 'records')}`)}"><span class="chart-label">${esc(i.label)}</span><span class="chart-track" aria-hidden="true"><span class="chart-fill" style="width:${Math.max(2, Math.round((i.n / top) * 100))}%"></span></span><span class="chart-value data-number">${num(i.n)}</span></button></li>`).join('')}</ul>`;
  };
  if (state.view === 'developers') {
    el.innerHTML = bars(developerGroups(state.scope).slice(0, 20).map(g => ({id: g.label, label: shortLabel(g.label), n: g.n})), '');
  } else {
    el.innerHTML = bars(state.summary.provinces.map(p => ({id: p.code, label: p.name, n: p.n})), 'select-province');
  }
  $('chart-scope').textContent = T(`${num(state.scope.length)} รายการ`, `${num(state.scope.length)} records`);
}

function openInsights(open) {
  $('insight-content').hidden = !open;
  $('insights').classList.toggle('is-collapsed', !open);
  $('toggle-insights').setAttribute('aria-expanded', String(open));
  $('toggle-insights').textContent = open ? T('ย่อกราฟ', 'Close charts') : T('เปิดกราฟ', 'Open charts');
  if (open) drawChart();
}

function openTable() { $('results').hidden = false; renderTable(); closeMobilePanel(); $('toggle-table').focus(); }

function renderTable() {
  renderTable.stale = false;
  const rows = state.scope;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  $('result-rows').innerHTML = slice.map(e => `<tr>
    <td><button type="button" class="link-button" data-action="select-estate" data-id="${esc(e.id)}">${esc(nameOf(e))}</button><span class="table-sub">${esc(typeOf(e))}</span></td>
    <td>${esc(provinceName(e.province))}</td>
    <td class="num data-number">${e.listed ? num(e.dir.n) : '—'}</td>
    <td>${e.outline ? T('มี', 'yes') : T('ยังไม่มี', 'not yet')}</td>
    <td>${esc(shortLabel(e.logoLabel || e.developer || '') || '—')}</td></tr>`).join('') || `<tr><td colspan="5" class="hint">${T('ไม่มีรายการตามตัวกรอง', 'No record matches the filters')}</td></tr>`;
  $('page-label').textContent = `${num(state.page + 1)} / ${num(pages)}`;
  $('prev-page').disabled = state.page === 0;
  $('next-page').disabled = state.page >= pages - 1;
}

/* ---------- map ---------- */
function estateFeatures() {
  const inScope = new Set(state.scope.map(e => e.id));
  const selected = state.panel.mode === 'estate' ? state.panel.id : '';
  return {type: 'FeatureCollection', features: state.boundaries.features.filter(f => inScope.has(f.properties.id) || f.properties.id === selected).map(f => {
    const c = state.ramp.byId.get(f.properties.id);
    return {type: 'Feature', id: f.id, geometry: f.geometry, properties: {id: f.properties.id, fill: c?.fill || '', nodata: !c?.fill}};
  })};
}

function updateSpatialLayers() {
  if (!state.loaded || !state.map) return;
  const map = state.map;
  map.getSource(ESTATE_SRC)?.setData(estateFeatures());
  const sel = state.panel.mode === 'estate' ? state.panel.id : '';
  const code = state.panel.mode === 'estate' ? estateById(sel)?.province || '' : $('province').value;
  if (map.getLayer('estate-selected')) map.setFilter('estate-selected', ['==', ['get', 'id'], sel || '__none__']);
  if (map.getLayer('province-selected')) map.setFilter('province-selected', ['==', ['to-string', ['get', 'id']], code || '__none__']);
  state.labels?.update(state.scope.filter(e => e.outline), {selected: sel, ramp: state.ramp, province: code});
  updateAroundLayer();
  updateMassing();
}

function updateMassing() {
  if (!state.massing) return;
  const e = state.panel.mode === 'estate' ? estateById(state.panel.id) : null;
  const feature = e?.outline ? state.boundaries.features.find(f => f.properties.id === e.id) : null;
  const regions = feature ? outerRings(feature) : [];
  const anchors = e?.label ? [e.label] : [state.map.getCenter().toArray()];
  const codes = e ? [e.province] : [];
  state.buildingUnits?.ensureMany(codes);
  if (!state.buildingUnits || codes.every(c => state.buildingUnits.settled(c))) {
    const zones = state.buildingUnits?.zonesFor(regions) || [];
    state.massing.update({regions, hosts: [], anchors, zones, enabled: true, city: state.view3d, zoom: state.map.getZoom(), latitude: state.map.getCenter().lat})?.catch(err => console.warn('Massing', err));
  }
}

function aroundCollection() {
  const e = state.panel.mode === 'estate' ? estateById(state.panel.id) : null;
  if (!e?.outline || !state.around || !state.showAround) return {type: 'FeatureCollection', features: []};
  return {type: 'FeatureCollection', features: aroundRows(state.around, e.id).map((r, i) => ({
    type: 'Feature', id: i, geometry: {type: 'Point', coordinates: [r.lon, r.lat]},
    properties: {fid: r.fid, name: r.name, workers: r.workers ?? -1, family: r.family ?? 9, series: seriesOf(FAMILY_IDS[r.family] || 'other'), size: aroundRadius(r.workers) / 8},
  }))};
}

function updateAroundLayer() {
  if (!state.loaded || !state.map) return;
  state.map.getSource(AROUND_SRC)?.setData(aroundCollection());
  renderLegend();
}

function hatchImage(ground, stroke, size = 8) {
  const parse = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const [gr, gg, gb] = parse(ground), [sr, sg, sb] = parse(stroke);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const on = ((x + y) % size) < 1.5, o = (y * size + x) * 4;
    data[o] = on ? sr : gr; data[o + 1] = on ? sg : gg; data[o + 2] = on ? sb : gb; data[o + 3] = 255;
  }
  return {width: size, height: size, data};
}

function installSpatialLayers() {
  const map = state.map;
  guardRetainedTiles(map, maplibregl.getVersion?.());
  guardElevationFreeze(map, maplibregl.getVersion?.());
  const palette = basemapPalette(theme());
  const ink = cssVar('--text-primary', '#182327');
  const selected = cssVar('--map-selected-stroke', '#176B82');
  const noData = cssVar('--data-no-data', '#D5DAD6'), emphasis = cssVar('--data-zero-outline', '#7D877F');
  if (!map.hasImage(HATCH)) map.addImage(HATCH, hatchImage(noData, emphasis));
  for (let s = 1; s <= 10; s++) {
    const name = `cue-${s}`;
    if (!map.hasImage(name)) map.addImage(name, cueImage(s, {size: 16, pixelRatio: 2, fill: cssVar(`--series-${s}-fill`, '#8AA4AA'), stroke: cssVar('--map-marker-stroke', '#182327')}), {pixelRatio: 2});
  }
  const before = map.getLayer('waterway') ? 'waterway' : undefined;
  map.addSource(PROVINCE_SRC, {type: 'geojson', data: state.provincesGeo, maxzoom: GEOJSON_MAXZOOM, promoteId: 'id'});
  map.addLayer({id: 'province-line', type: 'line', source: PROVINCE_SRC, paint: {'line-color': emphasis, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 10, 1.2], 'line-opacity': 0.55}}, before);
  map.addLayer({id: 'province-selected', type: 'line', source: PROVINCE_SRC, filter: ['==', ['to-string', ['get', 'id']], '__none__'], paint: {'line-color': selected, 'line-width': 2, 'line-opacity': 0.8}}, before);
  map.addSource(ESTATE_SRC, {type: 'geojson', data: estateFeatures(), maxzoom: GEOJSON_MAXZOOM, promoteId: 'id'});
  map.addLayer({id: 'estate-fill', type: 'fill', source: ESTATE_SRC, filter: ['!', ['get', 'nodata']],
    paint: {'fill-color': ['get', 'fill'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.85, 13, 0.62, 16, 0.4]}}, MASSING_BEFORE && map.getLayer(MASSING_BEFORE) ? MASSING_BEFORE : undefined);
  map.addLayer({id: 'estate-hatch', type: 'fill', source: ESTATE_SRC, filter: ['get', 'nodata'],
    paint: {'fill-pattern': HATCH, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 16, 0.5]}}, MASSING_BEFORE && map.getLayer(MASSING_BEFORE) ? MASSING_BEFORE : undefined);
  map.addLayer({id: 'estate-line', type: 'line', source: ESTATE_SRC, paint: {'line-color': ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 1.4, 16, 2], 'line-opacity': 0.75}});
  map.addLayer({id: 'estate-selected', type: 'line', source: ESTATE_SRC, filter: ['==', ['get', 'id'], '__none__'], paint: {'line-color': selected, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 14, 3.5]}});
  state.massing = installMassing(map, {
    beforeId: MASSING_BEFORE,
    colors: {quiet: palette.massingQuiet, focus: palette.massingFocus, ground: palette.ground, venue: cssVar('--map-active-layer') || undefined},
    tileUrl: t => (state.tileTemplate ? state.tileTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y) : ''),
    cmTileUrl, cmAttribution: CM_ATTRIBUTION, budget: mapBudget().level === 'full' ? null : mapBudget(),
    onResult: result => { $('map-status').dataset.massing = `${result.features || 0}`; },
  });
  map.addSource(AROUND_SRC, {type: 'geojson', data: aroundCollection(), maxzoom: GEOJSON_MAXZOOM});
  map.addLayer({id: 'around-points', type: 'symbol', source: AROUND_SRC, layout: {
    'icon-image': ['concat', 'cue-', ['to-string', ['get', 'series']]], 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, ['*', 0.8, ['get', 'size']], 15, ['*', 1.5, ['get', 'size']]],
    'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 'workers']]}});
  state.loaded = true;
  updateSpatialLayers();
  if (!state.initialCameraDone) { state.initialCameraDone = true; fitMap({instant: true}); }
}

/** Bounds of a set of estates' outlines ([[w,s],[e,n]]), or null. */
function boundsOf(list) {
  const boxes = list.map(e => e.boundary?.bbox).filter(Boolean);
  if (!boxes.length) return null;
  return [[Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1]))], [Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))]];
}

/** The phone sheet is open over the map (portrait): the camera frames the strip above it (as CityMETER Factory does). */
const sheetOpen = () => mobilePortrait() && $('panel').classList.contains('is-open');

function cameraPadding() {
  const map = state.map, el = map.getContainer(), w = el.clientWidth, h = el.clientHeight;
  const bottom = ($('insights')?.getBoundingClientRect().height || 0) + ($('map-legend')?.getBoundingClientRect().height || 0) * (mobilePortrait() ? 1 : 0) + 24;
  const top = Math.min(80, h * 0.12);
  if (sheetOpen()) {
    // The sheet grows with its content up to its max height (56dvh) and slides in: frame above its tallest top.
    const panel = $('panel'), max = parseFloat(getComputedStyle(panel).maxHeight);
    const sheetTop = Math.min(panel.getBoundingClientRect().top, Number.isFinite(max) ? window.innerHeight - max : Infinity);
    const covered = el.getBoundingClientRect().bottom - sheetTop;
    return {top, bottom: Math.max(24, Math.min(h - top - 80, covered + 16)), left: 24, right: 24};
  }
  return {top, bottom: Math.min(h * 0.45, bottom), left: Math.min(48, w * 0.06), right: Math.min(64, w * 0.08)};
}

function fitMap({instant = false, around = false} = {}) {
  const map = state.map;
  if (!map || !state.loaded) return;
  const e = state.panel.mode === 'estate' ? estateById(state.panel.id) : null;
  const code = e?.province || $('province').value;
  let box = null, preset = state.view3d ? 'city' : 'plan', maxZoom = 12.5;
  if (e?.outline) {
    const b = e.boundary.bbox;
    const pad = around ? 0.03 : 0.006;
    box = [[b[0] - pad, b[1] - pad], [b[2] + pad, b[3] + pad]];
    preset = state.view3d ? 'model' : 'plan'; maxZoom = 16;
  } else if (e || code) {
    box = boundsOf(state.scope.filter(x => x.province === code && x.outline));
    if (!box) { const p = provinceByCode(code); if (p?.bbox) box = [[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]]; }
    maxZoom = 12;
  } else {
    // The Aha: the outlines of the EEC records in scope, else every outline in scope, else the country.
    box = boundsOf(state.scope.filter(x => EEC.includes(x.province) && x.outline)) || boundsOf(state.scope.filter(x => x.outline));
    maxZoom = 11.5;
  }
  if (!box) box = THAILAND;
  const LngLatBounds = maplibregl.LngLatBounds;
  const bounds = new LngLatBounds(box[0], box[1]);
  try {
    fitPitched(map, bounds, {preset: sheetOpen() ? 'plan' : preset, padding: cameraPadding(), maxZoom, minZoom: 4, animate: !instant && animate(), duration: 900});
  } catch (err) { console.warn('fit', err); map.fitBounds(bounds, {padding: 40, animate: false}); }
}

function fitCountry() {
  const map = state.map;
  if (!map || !state.loaded) return;
  fitPitched(map, new maplibregl.LngLatBounds(THAILAND[0], THAILAND[1]), {preset: 'plan', padding: cameraPadding(), maxZoom: 7, minZoom: 3, animate: animate(), duration: 900});
}

function closePopup() { try { state.popup?.remove(); } catch {} state.popup = null; }

function openAroundPopup(f) {
  const p = f.properties;
  closePopup();
  const families = state.around?.meta || {};
  const fam = EN ? families.familiesEn?.[p.family] : families.families?.[p.family];
  const workers = p.workers >= 0 ? T(`${num(p.workers)} คน`, `${num(p.workers)} workers`) : T('ไม่มีตัวเลขคนงาน', 'no worker figure');
  const html = `<div class="around-pop"><strong>${esc(p.name || T('ทะเบียนโรงงาน', 'Factory registration'))}</strong><span>${esc(fam || '')} · ${esc(workers)}</span><a href="${esc(factoryRowHref(p.fid))}">${T('เปิดใน CityMETER Factory', 'Open in CityMETER Factory')}</a></div>`;
  state.popup = new maplibregl.Popup({closeButton: true, maxWidth: '280px', offset: 10}).setLngLat(f.geometry.coordinates).setHTML(html).addTo(state.map);
}

function onMapClick(event) {
  const map = state.map;
  const around = map.getLayer('around-points') ? map.queryRenderedFeatures(event.point, {layers: ['around-points']})[0] : null;
  if (around) { openAroundPopup(around); return; }
  const hit = map.queryRenderedFeatures(event.point, {layers: ['estate-fill', 'estate-hatch'].filter(id => map.getLayer(id))})[0];
  if (hit) { const id = hit.properties.id; if (id && id !== state.panel.id) selectEstate(id, {fromMap: true}); return; }
}

function onMapMove(event) {
  if (onMapMove.frame) { onMapMove.point = event.point; return; }
  onMapMove.point = event.point;
  onMapMove.frame = requestAnimationFrame(() => {
    onMapMove.frame = 0;
    const map = state.map;
    if (!map || !state.loaded) return;
    const layers = ['around-points', 'estate-fill', 'estate-hatch'].filter(id => map.getLayer(id));
    const over = layers.length && map.queryRenderedFeatures(onMapMove.point, {layers}).length > 0;
    map.getCanvas().style.cursor = over ? 'pointer' : '';
  });
}

const MAP_LOCALE = EN
  ? {'Map.Title': 'Map of industrial estates', 'NavigationControl.ZoomIn': 'Zoom in', 'NavigationControl.ZoomOut': 'Zoom out', 'NavigationControl.ResetBearing': 'Reset north (drag to rotate or tilt)', 'Popup.Close': 'Close', 'AttributionControl.ToggleAttribution': 'Show or hide the map credits'}
  : {'Map.Title': 'แผนที่นิคมอุตสาหกรรม', 'NavigationControl.ZoomIn': 'ซูมเข้า', 'NavigationControl.ZoomOut': 'ซูมออก', 'NavigationControl.ResetBearing': 'หมุนกลับทิศเหนือ (ลากเพื่อหมุนหรือเอียง)', 'Popup.Close': 'ปิด', 'AttributionControl.ToggleAttribution': 'แสดงหรือซ่อนที่มาของแผนที่'};

function initMap() {
  state.mapTheme = theme();
  state.map = new maplibregl.Map({container: 'map', pixelRatio: budgetPixelRatio(mapBudget()), maxTileCacheZoomLevels: mapBudget().cacheZoomLevels, center: [101.1, 13.1], zoom: 8, pitch: 0, maxPitch: 85, attributionControl: {compact: true}, locale: MAP_LOCALE, style: buildMapStyle(state.mapTheme)});
  state.map.addControl(new maplibregl.NavigationControl({showCompass: true, visualizePitch: true}), 'top-right');
  state.labels = installEstateLabels(state.map, $('map'), {onSelect: id => selectEstate(id, {fromMap: true}), name: nameOf, num, reservedBottom: () => ($('insights')?.getBoundingClientRect().height || 0) + 12});
  state.map.on('style.load', installSpatialLayers);
  state.map.on('click', onMapClick);
  state.map.on('mousemove', onMapMove);
  state.map.on('moveend', () => { if (state.loaded) updateMassing(); });
  state.map.on('error', e => console.warn('Map resource', e.error?.message || e));
    // A lost WebGL context (a phone under memory pressure): say so and reload once, lean (js/shell/maplibre-guard.js).
    reloadOnContextLoss(state.map);
  fetch(TILEJSON_URL).then(r => r.json()).then(j => { state.tileTemplate = j.tiles?.[0] || ''; if (state.loaded) updateMassing(); }).catch(e => { partial('basemap'); console.warn('TileJSON', e); });
}

async function startMap() {
  const el = $('map-failure');
  try { await loadMapLibrary(); el.hidden = true; initMap(); }
  catch (e) {
    el.hidden = false;
    el.innerHTML = `<p>${T('โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้', 'The map did not load; the data, the table and the charts still work')}</p><p class="hint">${esc(e.message || '')}</p><button type="button" class="btn">${T('ลองโหลดแผนที่ใหม่', 'Load the map again')}</button>`;
    el.querySelector('button').onclick = event => { event.target.disabled = true; startMap(); };
    console.warn(e);
  }
}

function ensure3d() {
  if (state.view3d) return false;
  state.view3d = true;
  $('toggle-3d').setAttribute('aria-pressed', 'true');
  return true;
}

function toggle3d() {
  state.view3d = !state.view3d;
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  if (state.map && state.loaded) {
    applyPreset(state.map, presetFor({view3d: state.view3d, mode: state.panel.mode === 'overview' ? 'overview' : 'detail'}), {animate: animate()});
    updateMassing();
  }
  saveURL();
}

/* ---------- mobile sheet ---------- */
function openMobilePanel() {
  if (!mobilePortrait()) return;
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.add('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'true');
  $('map-aha').hidden = true;
  // An open estate is framed again in the strip above the sheet.
  if (!wasOpen && state.loaded && state.panel.mode === 'estate') fitMap();
}
function closeMobilePanel() {
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.remove('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'false');
  if (mobilePortrait()) {
    $('mobile-panel').focus({preventScroll: true}); renderMapAha();
    // The estate fills the larger map again.
    if (wasOpen && state.loaded && state.panel.mode === 'estate') fitMap();
  }
}

/* ---------- data ---------- */
async function fetchJSON(resource, {timeout = 20000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(resource, {signal: controller.signal, cache: 'no-cache'});
    if (!r.ok) { const e = new Error('โหลดข้อมูลไม่สำเร็จ'); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) { e.resource = resource; e.phase = 'data'; throw e; }
  finally { clearTimeout(timer); }
}

function setOptions(id, items) {
  const s = $(id), keep = s.value;
  while (s.options.length > 1) s.remove(1);
  for (const [value, label] of items) { const o = document.createElement('option'); o.value = value; o.textContent = label; s.append(o); }
  s.value = [...s.options].some(o => o.value === keep) ? keep : '';
}

function refreshOptions() {
  const counts = (key) => { const m = new Map(); for (const e of state.data.estates) m.set(e[key], (m.get(e[key]) || 0) + 1); return m; };
  const byType = counts('typeId'), byProvince = counts('province');
  setOptions('type', state.data.types.map(t => [t.id, `${T(t.th, t.en)} (${num(byType.get(t.id) || 0)})`]));
  const collator = new Intl.Collator(EN ? 'en' : 'th');
  setOptions('province', [...byProvince.keys()].map(code => [code, `${provinceName(code)} (${num(byProvince.get(code))})`]).sort((a, b) => collator.compare(a[1], b[1])));
}

function restoreFromURL() {
  const p = nav.read();
  for (const f of FIELDS) if (p.has(f)) { const v = p.get(f); if (f === 'search' || [...($(f).options || [])].some(o => o.value === v)) $(f).value = v; }
  if (['provinces', 'developers'].includes(p.get('view'))) state.view = p.get('view');
  state.view3d = p.get('view3d') !== '0';
  state.panel = $('province').value ? {mode: 'province', id: $('province').value} : overviewPanel();
  const e = p.get('estate') && estateById(p.get('estate'));
  if (e) state.panel = {mode: 'estate', id: e.id};
}

function restoreFromHistory() {
  for (const f of FIELDS) $(f).value = '';
  Object.assign(state, {panel: overviewPanel(), history: []});
  closePopup();
  restoreFromURL();
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  update({fit: true});
}

/**
 * The search box (1.2.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว implement กับ demo web
 * ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”). A name typed is listed with what it is
 * and where (js/shell/search.js, names from js/find.js) and opens what answers the product statement's question for
 * it: a province its estates, an estate its page, a type its filter. A developer has no filter of its own: its name
 * becomes the words of the text filter. The map and the panel no longer change while the reader is still typing.
 */
function openFound(entry) {
  // A filter chosen by name is shown for the whole page: the filters that would leave it no estate are lifted first
  // (js/shell/search.js#makeWay). A developer has no filter of its own: its name is the words of the text filter.
  const offered = (field, id) => [...$(field).options].some(o => o.value === id);
  const way = (field, id) => state.finder.makeWay(field, id);
  const words = () => state.finder.filter(entry.name);
  if (entry.kind === 'province') selectProvince(entry.id);
  // An estate chosen by name always opens: the filters it does not pass — its province too — are lifted first, so
  // the map goes to it (selectEstate draws).
  else if (entry.kind === 'estate') { const e = estateById(entry.id); if (e) state.finder.makeWayFor(v => filterEstates([e], v).length); selectEstate(entry.id); }
  // A type has no action of its own: its select takes the value and says so, as a reader's choice would.
  else if (entry.kind === 'type') { if (offered('type', entry.id)) { way('type', entry.id); $('type').value = entry.id; $('type').dispatchEvent(new Event('change', {bubbles: true})); } else words(); }
  else if (entry.kind === 'developer') words();
}
function installFinder() {
  try {
    state.finder = installSearch({
      input: $('search'),
      index: createIndex({kinds: SEARCH_KINDS, heads: SEARCH_HEADS}),
      entries: () => searchEntries({data: state.data, index: state.index}),
      note: entry => searchNote(entry, {data: state.data, index: state.index}),
      // What the reader is looking at comes first among equal names.
      scope: () => ({province: $('province').value || estateById(state.panel.mode === 'estate' ? state.panel.id : '')?.province || ''}),
      rows: text => filterEstates(state.data.estates, {...values(), search: text}).length,
      unit: 'แห่ง',
      hint: SEARCH_HINT,
      pick: openFound,
      // The filters that may be lifted for a filter or words chosen from the list — never the province (a province
      // without it is a reading of that province).
      filters: {fields: ['type', 'outline', 'listed'], values, count: v => filterEstates(state.data.estates, v).length},
    });
  } catch (e) { state.finder = null; console.warn('Search list unavailable', e); }
}

function wireEvents() {
  let timer;
  for (const f of FIELDS) $(f).addEventListener(f === 'search' ? 'input' : 'change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.history = [];
      if (f === 'province') state.panel = $('province').value ? {mode: 'province', id: $('province').value} : overviewPanel();
      else if (state.panel.mode === 'estate') state.panel = $('province').value ? {mode: 'province', id: $('province').value} : overviewPanel();
      update({fit: true});
      // With the list, the words arrive whole (Enter or the list's last row); without it the box filters as it is typed in.
    }, f === 'search' && !state.finder ? 400 : 0);
  });
  $('filters').addEventListener('reset', () => setTimeout(resetToOverview, 0));
  for (const id of ['panel-view', 'filter-chips', 'map-aha', 'crumbs', 'chart', 'result-rows']) $(id).addEventListener('click', onPanelAction);
  $('panel-view').addEventListener('input', event => {
    if (event.target.dataset.role !== 'dir-search') return;
    clearTimeout(wireEvents.dirTimer);
    wireEvents.dirTimer = setTimeout(() => { state.dirQuery = event.target.value; state.dirLimit = 60; refreshDirectory(); }, 250);
  });
  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach((b, i) => {
    b.onclick = () => { state.view = b.dataset.view; drawChart(); saveURL(); };
    b.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[j].focus(); tabs[j].click();
    });
  });
  $('fit-map').onclick = () => fitMap();
  $('country-map').onclick = () => {
    $('province').value = ''; state.panel = overviewPanel(); state.history = [];
    closePopup(); update(); fitCountry();
    announce(T('ทั้งประเทศ', 'Whole country'));
  };
  $('toggle-around').onclick = () => { state.showAround = !state.showAround; $('toggle-around').setAttribute('aria-pressed', String(state.showAround)); updateAroundLayer(); };
  $('toggle-3d').onclick = toggle3d;
  $('mobile-panel').onclick = () => { $('panel').classList.contains('is-open') ? closeMobilePanel() : openMobilePanel(); };
  $('close-mobile-panel').onclick = closeMobilePanel;
  document.querySelector('.skip').onclick = () => { openMobilePanel(); $('dataset-title').focus(); };
  $('toggle-insights').onclick = () => openInsights($('insight-content').hidden);
  $('open-table').onclick = openTable;
  $('toggle-table').onclick = () => { $('results').hidden = true; $('open-table').focus(); };
  $('prev-page').onclick = () => { state.page--; renderTable(); };
  $('next-page').onclick = () => { state.page++; renderTable(); };
  $('theme').onchange = applyTheme;
  const colorMedia = matchMedia('(prefers-color-scheme: dark)');
  const onColorChange = () => { if ($('theme').value === 'auto') applyTheme(); };
  if (colorMedia.addEventListener) colorMedia.addEventListener('change', onColorChange); else colorMedia.addListener(onColorChange);
  matchMedia('(max-width: 760px) and (orientation: portrait)').addEventListener?.('change', () => { if (!mobilePortrait()) $('panel').classList.remove('is-open'); renderPanel(); });
}

/**
 * A part of the data that did not load is said on the page (citymeter-shell 0.6.0, js/shell/launch.js
 * `citymeter:partial`): what is missing and what that does to the result on screen, with a reload that keeps the
 * address. The words live here, by file: [Thai name, Thai effect, English name, English effect].
 */
const PARTIAL = {
  'data/provinces.geojson': ['กรอบจังหวัด', 'แผนที่ไม่แสดงขอบจังหวัด', 'Province outlines', 'The map shows no province outlines'],
  'units': ['รูปอาคารของ CityMETER', 'อาคารบางจังหวัดแสดงจากแผนที่ฐานแทนชุดอาคารของ CityMETER', 'CityMETER building shapes', 'Buildings in some provinces come from the basemap instead of the CityMETER set'],
  'basemap': ['แผนที่ฐาน', 'ถนน แหล่งน้ำ และอาคารพื้นหลังอาจไม่แสดง ข้อมูลในแผงและตารางยังใช้ได้', 'Basemap', 'Roads, water and background buildings may be missing; the panel and the table still work'],
  'data/directory.json': ['รายชื่อโรงงานในนิคม', 'ไม่แสดงรายชื่อโรงงานของนิคม', 'Factory directory', 'An estate\'s factory list is not shown'],
  'data/around.json': ['สิ่งที่อยู่รอบนิคม', 'ไม่แสดงสิ่งที่อยู่รอบนิคม', 'Around the estate', 'What lies around an estate is not shown'],
};
function partial(key) {
  const words = PARTIAL[key];
  if (!words || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('citymeter:partial', {detail: {id: key, label: words[0], effect: words[1], labelEn: words[2], effectEn: words[3]}}));
}

async function init() {
  try {
    const [estatesJSON, indexJSON, boundariesJSON, provincesJSON] = await Promise.all([
      fetchJSON(`data/estates.json?v=${RELEASE}`, {timeout: 30000}),
      fetchJSON(`data/area-index.json?v=${RELEASE}`, {timeout: 30000}),
      fetchJSON(`data/boundaries.geojson?v=${RELEASE}`, {timeout: 30000}),
      fetchJSON(`data/provinces.geojson?v=${RELEASE}`, {timeout: 30000}).catch(e => { partial('data/provinces.geojson'); console.warn('Province outlines unavailable', e); return {type: 'FeatureCollection', features: []}; }),
    ]);
    if (!Array.isArray(estatesJSON?.estates) || !Array.isArray(indexJSON?.provinces) || boundariesJSON?.type !== 'FeatureCollection') {
      const e = new Error('Invalid data'); e.phase = 'data-schema'; throw e;
    }
    state.index = indexJSON;
    state.data = decodeData(estatesJSON, indexJSON);
    state.boundaries = boundariesJSON;
    state.provincesGeo = provincesJSON;
    registerDataNames({index: indexJSON, data: state.data});
    state.buildingUnits = createBuildingUnitStore({fetchJSON, version: RELEASE, onLoad: () => { if (state.loaded) updateMassing(); },
      onError: (code, e) => { partial('units'); console.warn('Building units unavailable', code, e); if (state.loaded) updateMassing(); }});
    state.buildingUnits.loadIndex();
    refreshOptions();
    restoreFromURL();
    $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
    try { $('theme').value = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
    applyTheme();
    wireEvents();
    installFinder();
    update();
    if (state.panel.mode !== 'overview') openMobilePanel();
    window.dispatchEvent(new CustomEvent('citymeter:ready'));
    startMap();
  } catch (e) {
    window.dispatchEvent(new CustomEvent('citymeter:load-error', {detail: {message: T('โหลดข้อมูลนิคมไม่สำเร็จ กรุณาลองอีกครั้ง', 'The estate data did not load. Please try again.'), resource: e.resource, status: e.status, phase: e.phase || 'startup', diagnostic: e.message}}));
    console.error(e);
  }
}

// Developer hook for live checks in a browser console (not an API; may change without notice).
window.__citymeter = {state, get map() { return state.map; }, get finder() { return state.finder; }, update, fitMap, selectEstate, selectProvince, updateSpatialLayers};

init();
