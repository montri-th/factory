/**
 * CityMETER · Factory — application orchestration.
 *
 * One committed selection drives everything. Three row scopes, named the same way everywhere:
 *   scopeRows — rows after the search/industry/size/province/function filters, BEFORE any district selection or district
 *               focus: the comparison base for the Aha, the choropleth, the charts and every rank.
 *   baseRows  — scopeRows narrowed by the selected เขต/อำเภอ (if any).
 *   rows      — baseRows narrowed by the district focus (if any): pins with detail, counters, the table.
 *
 * Rows are the factory registrations (FID) of the research master's core registry 02_FACTORIES, every size (DIW class
 * 2/3 open data outside IEAT industrial estates, and the FIDs the MOI records as operating). Measure (DATA_METHOD.md §2,
 * state.metric): `workers` (default) = Σ workers of the registrations (“คน”, LDS `count`; a registration without a
 * figure adds nothing); `count` = registrations (“ทะเบียน”, LDS `count`). The map, the legend, the labels, the Aha, the
 * ranks and the charts read the same measure. The size filter includes the 95+ lens (`p90`).
 *
 * District focus has three modes (state.focusAreaIds / state.autoFocus):
 *   auto     — default: up to three เขต/อำเภอ with the most of the measure in the province that holds the most of it
 *              at district level, so the first screen is one coherent 3D city scene.
 *   explicit — ?areas=a,b,c chosen by the user.
 *   none     — ?areas=all: every district filled, nothing quiet.
 *
 * National scale: the area index (data/area-index.json) has every district without geometry, so ranks, panels,
 * charts and camera fits work at once; outlines arrive per province (js/frames.js) — the provinces the selection
 * needs, and the provinces under the map once it is zoomed in to district level.
 *
 * Focus + quiet on the map: data fills, cue pins and rounded focus massing only for the focused part; everything
 * else stays visible but quiet (outline-only districts, grey dots, pale city massing). Below PROVINCE_FILL_MAX_ZOOM
 * the province frames carry the reading — except with a จังหวัด filter: that province shows its own เขต/อำเภอ at every
 * zoom (province view) and is fitted whole.
 *
 * Context from the estate research master: the industrial-area register (01_ESTATES, names and pages only — no geometry
 * is published).
 *
 * Buildings: the points of the scope are joined to the focus-tier footprints the map draws — OpenStreetMap, or
 * CityMETER Building V4 inside a CityMETER unit (js/shell/building-units.js) — (js/shell/building-join.js, “จุดตกในอาคาร”; pieces
 * of one building cut by a tile edge are one building). A building is a click target: its one registration, else the
 * building panel. The building being looked at — the open building, the open registration's building (focusTarget) —
 * is drawn over every other building (x-ray, js/shell/venue-xray.js), the focus buildings in front of it turn see-through,
 * and the camera looks at it in two-point perspective, zoomed to fit the free part of the map, from every way in
 * (frameFocus; the Fitness / Shopping centers / Hotel building camera).
 *
 * Map clicks, in order: focus pin → the building being looked at (x-ray: frame again) → focus building → below
 * PROVINCE_FILL_MAX_ZOOM a เขต/อำเภอ of the selected จังหวัด, else a province → เขต/อำเภอ (`area-hit`, every zoom from
 * AREA_MIN_ZOOM). Quiet context dots are never targets.
 * Panel modes: overview | area | building | factory (with a back stack).
 * URL state (own names, inside): filters, metric, area, areas, view, factory, view3d — written in the shared
 * grammar d · at · e · m · f.* · focus · view · v3d by citymeter-shell (js/shell/url.js), with a browser history
 * entry per level (the back button goes up a level).
 */
import {provinces as provinceList, provinceByCode, provinceCodeFrom, setProvinces, decodeDataset, filterRows, summarize, hasPoint, unitWords, rowValue, familyShares, SIZE_FILTERS, pinRadius} from './model.js';
import {buildAreaIndex, areaWord, areaLocator, recordBounds} from './areas.js';
import {summarizeAreaInsight, filterAreaRows} from './area-insight.js';
import {renderInsightChart} from './charts.js';
import {loadMapLibrary} from './shell/vendors.js';
import {installBranchPins, DETAIL_MIN_ZOOM} from './pins.js';
import {installAreaLayers, installAreaLabels, buildAreaModel, setFillSwitchZoom, AREA_MIN_ZOOM, PROVINCE_VIEW_MIN_ZOOM, FILL_MAX_ZOOM} from './map-layers.js';
import {installProvinceLayers, buildProvinceModel, PROVINCE_FILL_MAX_ZOOM, PROVINCE_LABEL_MAX_ZOOM} from './provinces.js';
import {createFrameStore, provinceLocator} from './frames.js';
import {buildOverview, buildAreaProfile, buildFactoryDetail, buildBuildingProfile, listOrder} from './profile-model.js';
import {renderOverview, renderArea, renderBuilding, renderFactory, renderFilterChips, terrainChipsHTML, esc, num, pct, words} from './panel.js';
import {joinBuildings, nearestBuilding} from './shell/building-join.js';
import {buildMapStyle, basemapPalette, TILEJSON_URL, MASSING_BEFORE, VENUE_XRAY_BEFORE} from './shell/map-style.js';
import {installMassing, outerRings} from './massing.js';
import {createBuildingUnitStore, cmTileUrl, CM_ATTRIBUTION} from './shell/building-units.js';
import {presetFor, applyPreset, fitPitched, fitBuilding, twoPointBearing, screenBounds, groundAt, BUILDING_MAX_ZOOM} from './shell/camera.js';
import {installVenueXray} from './shell/venue-xray.js';
import {guardRetainedTiles, guardElevationFreeze} from './shell/maplibre-guard.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText} from './breadcrumb.js';
import {rampLegendHTML} from './scales.js';
import {cueMarkup} from './cues.js';
import {installFactoryLabels} from './labels.js';
import {installTerrain, terrainFacts, terrainChips, TERRAIN} from './shell/terrain.js';
import {createCodec, createNavigator} from './shell/url.js';
import {pageTitle} from './shell/title.js';

const $ = id => document.getElementById(id);
const FIELDS = ['search', 'group', 'size', 'province', 'cls'];
/** Filters that remove rows from a district (the province does not narrow its own districts). */
const NARROWING = ['search', 'group', 'size', 'cls'];
const BANGKOK = {center: [100.56, 13.735], zoom: 11.5};
/** Release tag of this module (index.html import map) — also versions the province frame files. */
const RELEASE = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch { return ''; } })();
const THEME_KEY = 'citymeter-factory-theme';
const COLLATOR = new Intl.Collator('th');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobilePortrait = () => matchMedia('(max-width: 760px) and (orientation: portrait)').matches;

const state = {
  data: null, index: null, provincesGeo: null, frames: null,
  scopeRows: [], baseRows: [], rows: [], insight: null,
  view: 'areas', page: 0, metric: 'workers',
  focusAreaIds: [], autoFocus: true, focusIds: [], selectedArea: '', selectedId: '',
  panel: {mode: 'overview', id: ''}, history: [],
  map: null, loaded: false, mapTheme: '', popup: null, initialCameraDone: false, tileTemplate: '',
  view3d: true, showAreas: true,
  pins: null, massing: null, areaLayers: null, labels: null, areaModel: null,
  provinceLayers: null, provinceLabels: null, provinceModel: null, rowById: new Map(),
  scopeKey: '', join: null, buildingSel: null, labelView: new Map(), renderedSig: '', locateArea: null, locateProvince: null,
  blueBuildings: false, lastPreset: '',
  // Building camera: the x-ray solid, what was framed last ({id, key, refits}) and whether the user moved the map since.
  xray: null, framed: null, userCamera: false,
};

/* ---------- address (citymeter-shell, js/shell/url.js) ---------- */
// The page keeps its own parameter names inside (saveURL / restoreFromURL); the shell writes them in the shared
// grammar d · at · e · m · f.* · focus · view · v3d, and opening an area or an item adds one browser history entry,
// so the back button goes up a level. Old links (?area=, ?factory= …) still open and are rewritten.
// The `e` kinds are provisional until the dataset registry declares them.
const nav = createNavigator(createCodec({
  dataset: 'factory', levels: ['P', 'D'], place: {province: 'province', D: 'area'},
  items: {factory: 'factory'}, filters: FIELDS,
  provinceOf: code => state.index?.byId.get(code)?.province || '',
}), {onPop: restoreFromHistory});

/* ---------- helpers ---------- */
const values = () => Object.fromEntries(FIELDS.map(k => [k, $(k).value]));
const unit = () => unitWords(state.metric);
const rowById = id => state.rowById.get(id) || null;
const areaById = id => state.index.byId.get(id) || null;
const provinceRecord = code => state.index.provinceById.get(code) || null;
// Null-safe: an embedding page or extension may detach the tray while map callbacks are still queued.
const bottomSpace = () => ($('insights')?.getBoundingClientRect().height ?? 0) + 12;
/** Area/province labels also keep clear of the map attribution (its live height is --attrib-height on .map-panel). */
const labelBottomSpace = () => { const panel = document.querySelector('.map-panel'); return bottomSpace() + (panel ? parseFloat(getComputedStyle(panel).getPropertyValue('--attrib-height')) || 0 : 0); };
const activeFilterCount = f => FIELDS.filter(k => f[k]).length;
const overviewPanel = () => ({mode: 'overview', id: ''});
const announce = text => { $('announcement').textContent = text; };
const theme = () => document.documentElement.dataset.theme;
const focusMode = () => (state.focusAreaIds.length ? 'explicit' : state.focusIds.length ? 'auto' : 'none');
const sheetOpen = () => mobilePortrait() && $('panel').classList.contains('is-open');
const animate = () => !reduced();
const cssVar = (name, fallback = '') => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
/** The building being looked at (building mode): {key, kind, footprint, rows, height}. */
const currentBuilding = () => (state.panel.mode === 'building' ? state.buildingSel : null);
/**
 * A building and a registration with a point are looked at in two-point perspective (eye), framed to the free part of the
 * map (the Fitness / Shopping centers building camera, owner 2026-10-29: “อาคารที่เลือก หรือ on focus ให้แสดงด้วยมุมมอง
 * 2-point perspective เสมอ zoom to fit viewport เสมอ”).
 */
const twoPoint = () => state.panel.mode === 'building' || (state.panel.mode === 'factory' && hasPoint(rowById(state.panel.id)));
const cameraPreset = () => presetFor({view3d: state.view3d, mode: state.panel.mode === 'overview' ? 'overview' : 'detail', twoPoint: twoPoint()});

function saveURL() {
  const f = values(), p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  if (state.metric !== 'workers') p.set('metric', state.metric);
  if (state.selectedArea) p.set('area', state.selectedArea);
  if (state.focusAreaIds.length) p.set('areas', state.focusAreaIds.join(','));
  else if (!state.autoFocus) p.set('areas', 'all');
  if (state.view !== 'areas') p.set('view', state.view);
  if (state.panel.mode === 'factory' && state.panel.id) p.set('factory', state.panel.id);
  if (!state.view3d) p.set('view3d', '0');
  // A building view has no address of its own: the address stays on what it was opened from.
  if (state.panel.mode !== 'building') nav.commit(p);
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
  if (state.data) drawChart();
}

function disposeSpatial() {
  for (const k of ['siteLabels', 'terrain', 'xray', 'massing', 'pins']) { try { state[k]?.dispose(); } catch (e) { console.warn('dispose', k, e); } state[k] = null; }
  state.areaLayers = null; state.provinceLayers = null; state.join = null; refreshJoin.key = ''; syncFocusBuilding.key = '';
}

/* ---------- selection ---------- */
function update({fit = false} = {}) {
  const f = values();
  // The scope only changes with the filters: a selection reuses it (and the pins keep their context).
  const scopeKey = JSON.stringify(f);
  if (scopeKey !== state.scopeKey) { state.scopeRows = filterRows(state.data.rows, f); state.scopeKey = scopeKey; }
  const area = state.selectedArea ? areaById(state.selectedArea) : null;
  state.baseRows = area ? state.scopeRows.filter(r => r.area === area.id) : state.scopeRows;
  state.insight = summarizeAreaInsight(state.scopeRows, state.index, {metric: state.metric, families: state.data.families});
  state.focusIds = state.focusAreaIds.length ? state.focusAreaIds : (state.autoFocus && !area ? state.insight.areaIds : []);
  state.rows = state.focusIds.length ? filterAreaRows(state.baseRows, new Set(state.focusIds)) : state.baseRows;
  state.page = 0;
  if (update.modelScope !== state.scopeRows || update.modelProvince !== f.province || update.modelMetric !== state.metric) {
    state.areaModel = buildAreaModel(state.scopeRows, state.index, {province: f.province, metric: state.metric});
    update.modelScope = state.scopeRows; update.modelProvince = f.province; update.modelMetric = state.metric;
  }

  // Keep the panel honest: drop a registration or building that left the filtered scope.
  const fallback = () => (area ? {mode: 'area', id: area.id} : overviewPanel());
  if (state.panel.mode === 'factory' && !state.scopeRows.some(r => r.id === state.panel.id)) { state.panel = fallback(); state.history = []; }
  if (state.panel.mode === 'building') {
    // The building keeps its key: its list follows the filters (the join is redone for the new scope; without a map
    // the rows it had are narrowed by the scope); none left → back to the district.
    const b = state.buildingSel;
    refreshJoin();
    const rows = !b ? [] : state.join ? buildingRows(b.key) : b.rows.filter(r => state.scopeRows.includes(r));
    if (rows.length) state.buildingSel = {...b, rows};
    else { state.panel = fallback(); state.history = []; state.buildingSel = null; }
  }
  if (state.panel.mode === 'area' && !area) state.panel = overviewPanel();
  if (state.panel.mode === 'overview' && area) state.panel = fallback();
  if (state.panel.mode !== 'factory') { state.selectedId = ''; state.pins?.select(''); state.popup?.remove(); state.popup = null; }
  else state.selectedId = state.panel.id;
  ensureFrames();

  const s = summarize(state.rows);
  $('filter-count').textContent = activeFilterCount(f) ? String(activeFilterCount(f)) : '';
  $('filter-chips').innerHTML = renderFilterChips(f, {
    group: Object.fromEntries(state.data.families.map(g => [g.id, g.th])), size: Object.fromEntries(SIZE_FILTERS.map(b => [b.id, b.th])),
    province: Object.fromEntries(provinceList().map(p => [p.code, p.th])), cls: Object.fromEntries(state.data.classes.map(c => [c.id, c.th]))});
  renderPanel(s);
  renderLegend();
  syncMetricSwitch();
  if (state.loaded) {
    updatePins();
    updateSpatialLayers();
    if (fit) fitMap();
    else if (state.lastPreset && cameraPreset() !== state.lastPreset) applyPreset(state.map, cameraPreset(), {animate: animate()});
    state.lastPreset = cameraPreset();
  }
  drawChart();
  syncList();
  saveURL();
  announce(`พบ ${num(s.count)} ทะเบียน${s.figured ? ` ${num(s.workers)} คน` : ''}`);
}

/** Rows with full detail on the map, in the counter and in the table: the open building's rows, else the focused rows. */
function detailRows() {
  const b = currentBuilding();
  if (b) return b.rows;
  return state.rows;
}

/** Counter + table follow the rows that carry detail. */
function syncList() {
  const rows = detailRows(), b = currentBuilding();
  $('result-count').textContent = num(rows.length);
  $('results-title').textContent = b ? 'โรงงานในอาคารนี้' : 'โรงงานตามตัวกรอง';
  const sig = rows.map(r => r.id).join(',');
  if (syncList.sig !== sig) state.page = 0;
  syncList.sig = sig;
  renderTable();
}

function updatePins() {
  if (!state.pins) return;
  const focus = detailRows();
  const selected = state.selectedId ? rowById(state.selectedId) : null;
  const ids = new Set(focus.map(r => r.id));
  const list = selected && !ids.has(selected.id) ? [...focus, selected] : focus;
  // Context = the whole scope (same array while the filters are unchanged → not re-sent); focus symbols cover their own dot.
  state.pins.update(list, {context: state.scopeRows});
  if (state.selectedId) state.pins.select(state.selectedId);
  // Names near the middle of the view follow the same focus rows (the open registration has its popup instead).
  state.siteLabels?.update(list, {selectedId: state.selectedId});
}

/* ---------- province frames on demand ---------- */
/** Provinces the current selection needs outlines for (fills, massing regions, hit targets). */
function wantedProvinces() {
  const codes = new Set();
  const f = $('province').value;
  if (f) codes.add(f);
  const area = state.selectedArea && areaById(state.selectedArea);
  if (area) codes.add(area.province);
  for (const id of state.focusIds) { const a = areaById(id); if (a) codes.add(a.province); }
  if (state.panel.mode === 'factory') { const r = rowById(state.panel.id); if (r?.province) codes.add(r.province); }
  return [...codes].filter(Boolean).slice(0, 8);
}
function ensureFrames() { state.frames?.ensureMany(wantedProvinces()); }

/** Once the map shows districts, load the provinces under it (nearest the centre first, bounded). */
function ensureFramesInView() {
  const map = state.map;
  if (!map || !state.frames || !state.provincesGeo?.features?.length || map.getZoom() < AREA_MIN_ZOOM - 0.5) return;
  state.locateProvince ||= provinceLocator(state.provincesGeo);
  const el = map.getContainer(), w = el.clientWidth, h = el.clientHeight;
  const found = new Map();
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
    const sx = ((i + 0.5) / 5) * w, sy = ((j + 0.5) / 4) * h;
    const code = state.locateProvince(map.unproject([sx, sy]).toArray());
    if (!code) continue;
    const d = Math.hypot(sx - w / 2, sy - h / 2);
    if (!found.has(code) || d < found.get(code)) found.set(code, d);
  }
  state.frames.ensureMany([...found].sort((a, b) => a[1] - b[1]).slice(0, 6).map(([code]) => code));
}

function onFramesLoaded() {
  state.locateArea = null;
  refreshLabelView.key = '';
  if (!state.loaded) return;
  state.areaLayers?.setFrames(state.frames.areas());
  updateSpatialLayers();
  scheduleLabelView();
}

/* ---------- breadcrumb ---------- */
function renderCrumbs() {
  const {mode, id} = state.panel;
  let crumbs;
  if (mode === 'factory' || mode === 'building') {
    const r = mode === 'factory' ? rowById(id) : currentBuilding()?.rows[0];
    crumbs = buildBreadcrumb({area: r?.area ? areaById(r.area) : null, province: r?.province || ''});
  } else {
    crumbs = buildBreadcrumb({province: $('province').value, area: state.selectedArea ? areaById(state.selectedArea) : null});
  }
  $('crumbs').innerHTML = renderBreadcrumb(crumbs);
  // Tab title: what the view shows, then the product, ≤ 60 characters (LDS FAVICON-01, js/shell/title.js).
  const place = crumbs[crumbs.length - 1].label;
  document.title = pageTitle(mode === 'factory' ? rowById(id)?.title || place
    : mode === 'building' ? `อาคาร ${place}` : `${unit().subject} ${place}`);
  return crumbs;
}

/* ---------- panel ---------- */
const countClassOf = a => state.areaModel?.byId.get(a.id)?.fill || 'var(--scale-count-3)';

function panelCtx() {
  const f = values();
  const osm = /planet\/(\d{4})(\d{2})(\d{2})_/.exec(state.tileTemplate || '');
  return {meta: state.data.meta || {}, unit: unit(), index: state.index, sources: state.data.sources || [], filtered: NARROWING.some(k => f[k]), osmDate: osm ? `${osm[1]}-${osm[2]}-${osm[3]}` : ''};
}

/** Rows for the province frames: current filters WITHOUT the province filter, so every frame keeps its own count. */
function provinceScopeRows() {
  const f = {...values(), province: ''}, key = JSON.stringify(f);
  if (key !== provinceScopeRows.key) { provinceScopeRows.key = key; provinceScopeRows.rows = filterRows(state.data.rows, f); }
  return provinceScopeRows.rows;
}
function provinceSummaries() {
  try {
    const current = state.provinceModel?.metric === state.metric ? state.provinceModel : null;
    const list = current?.provinces || (state.provincesGeo?.features?.length ? buildProvinceModel(provinceScopeRows(), state.provincesGeo, {metric: state.metric}).provinces : []);
    return list.filter(p => p.value > 0).sort((a, b) => b.value - a.value || COLLATOR.compare(a.name, b.name));
  } catch { return []; }
}

/** The Aha of a user-chosen focus: the chosen districts, the rows in them and their industries. */
function explicitInsight() {
  const areas = state.focusAreaIds.map(areaById).filter(Boolean).map(a => {
    const rs = state.rows.filter(r => r.area === a.id);
    return {...a, count: rs.length, value: rs.reduce((s, r) => s + rowValue(r, state.metric), 0)};
  });
  return {...state.insight, areas, areaIds: areas.map(a => a.id), count: state.rows.length, value: areas.reduce((s, a) => s + a.value, 0),
    workers: state.rows.reduce((s, r) => s + (r.workers || 0), 0), industry: familyShares(state.rows, state.data.families, state.metric, 3)};
}

function renderPanel(summary = summarize(state.rows)) {
  const view = $('panel-view');
  const {mode, id} = state.panel;
  renderCrumbs();
  const families = state.data.families, ctx = panelCtx(), metric = state.metric;
  const context = {classes: state.data.classes, estates: state.data.estates};
  let html = '';
  if (mode === 'area') html = renderArea(buildAreaProfile(state.scopeRows, id, state.index, families, {metric, ...context}), countClassOf, ctx);
  else if (mode === 'building') html = renderBuilding(buildBuildingProfile(currentBuilding(), state.index, families), ctx);
  else if (mode === 'factory') html = renderFactory(buildFactoryDetail(rowById(id), {scopeRows: state.scopeRows, allRows: state.data.rows, index: state.index, families, building: factoryBuilding(id)}), ctx);
  state.renderedSig = panelSpatialSig();
  if (!html) {
    const f = values();
    const overview = buildOverview(state.scopeRows, state.index, {province: f.province, families, metric, ...context});
    const insight = focusMode() === 'explicit' ? explicitInsight() : state.insight;
    html = renderOverview({insight, summary, overview, focusMode: focusMode(), classOf: countClassOf, provinces: f.province ? [] : provinceSummaries(),
      unknownProvince: f.province ? 0 : state.scopeRows.filter(r => !r.province).length, province: f.province, ctx});
    renderMapAha(insight);
  } else {
    $('map-aha').hidden = true;
  }
  view.innerHTML = html;
  view.dataset.mode = mode;
  if (mode === 'factory') fillTerrain(rowById(id));
  $('panel').dataset.mode = mode;
  const key = `${mode}:${id}:${$('province').value}:${$('group').value}`;
  if (key !== renderPanel.lastKey) $('panel').scrollTop = 0;
  renderPanel.lastKey = key;
}

/** Terrain chips of the open registration (async; the DEM tiles and the basemap water/land cover are read in the browser). */
async function fillTerrain(r, attempt = 0) {
  const box = document.querySelector(`[data-terrain-for="${CSS.escape(r?.id || '')}"]`);
  if (!box) return;
  const facts = state.map && state.loaded ? await terrainFacts(state.map, r).catch(() => null) : null;
  const chips = terrainChips(facts, {num, subject: 'โรงงาน'});
  const now = document.querySelector(`[data-terrain-for="${CSS.escape(r.id)}"]`);
  if (!now) return;
  // The map may not reach 'idle' while terrain tiles stream in (building view on terrain), and the sea and tree cover
  // need the basemap at the point (a point chosen far away is read before the camera lands): read again a little later.
  const partial = facts && facts.seaBand === null && facts.treeShare === null;
  if ((!facts || partial) && attempt < 4) { setTimeout(() => fillTerrain(r, attempt + 1), 1500 * (attempt + 1)); if (attempt && !facts) return; }
  const html = chips.length ? terrainChipsHTML(chips) : '<span class="hint">อ่านภูมิประเทศไม่ได้ในตอนนี้</span>';
  if (now.innerHTML !== html) now.innerHTML = html;
}

function renderMapAha(insight) {
  const el = $('map-aha'), u = unit();
  if (!insight.areas.length) { el.hidden = true; return; }
  const mode = focusMode();
  el.hidden = $('panel').classList.contains('is-open');
  const crumb = `<p class="map-aha-crumb">${esc(breadcrumbText(buildBreadcrumb({province: insight.home || $('province').value})))}</p>`;
  const w = words(insight.areas);
  const names = insight.areas.map(a => esc(a.name)).join(' · ');
  el.innerHTML = mode === 'explicit'
    ? `<div>${crumb}<h2>โฟกัส ${num(insight.areas.length)} ${esc(w)}</h2><p>${num(insight.value)} ${esc(u.one)} · ${u.id === 'count' ? `${num(insight.workers || 0)} คน` : `${num(insight.count)} ทะเบียน`}</p></div><button type="button" class="btn" data-action="clear-focus">ดูทุกพื้นที่</button>`
    : `<div>${crumb}<h2><span class="nowrap">${pct(insight.value, insight.homeValue ?? insight.homePlacedValue)}</span> ของ${esc(u.aha)}ใน${esc(provinceByCode(insight.home)?.th || '')} อยู่ใน <span class="nowrap">${num(insight.areas.length)} ${esc(w)}นี้</span></h2><p>${names}</p></div>${mode === 'auto'
      ? '<button type="button" class="btn" data-action="clear-focus">ดูทุกพื้นที่</button>'
      : '<button type="button" class="btn primary" data-action="explore-top">โฟกัส</button>'}`;
}

function pushHistory() {
  state.history.push({...state.panel, area: state.selectedArea, building: state.buildingSel, province: $('province').value});
  if (state.history.length > 20) state.history.shift();
}

function goBack() {
  // Every level change is a browser history entry (citymeter-shell): go up the way the browser's button does.
  if (state.panel.mode !== 'building' && nav.canGoBack()) { nav.back(); return; }
  const previous = state.history.pop();
  if (!previous) { state.selectedArea = ''; state.panel = overviewPanel(); update({fit: true}); return; }
  // Leaving or reaching a building view always moves the camera.
  const fromView = twoPoint();
  const fit = fromView || ['building', 'factory'].includes(previous.mode) || previous.area !== state.selectedArea || previous.province !== $('province').value;
  if (previous.province !== $('province').value) $('province').value = previous.province || '';
  state.selectedArea = previous.area || '';
  if (previous.mode === 'building') state.buildingSel = previous.building || null;
  state.panel = {mode: previous.mode, id: previous.id};
  update({fit});
}

/** A selection in another province moves the จังหวัด filter with it (the scope stays one coherent province). */
function alignProvince(code) {
  const current = $('province').value;
  if (current && code && current !== code) $('province').value = code;
}

function selectArea(id, {fromMap = false} = {}) {
  const area = areaById(id);
  if (!area) return;
  if (state.panel.mode !== 'area' || state.panel.id !== id) pushHistory();
  alignProvince(area.province);
  state.selectedArea = id;
  state.focusAreaIds = [];
  state.panel = {mode: 'area', id};
  update();
  if (!fromMap) openMobilePanel();
  if (state.loaded) fitRecord(area, {maxZoom: 16});
}

function factoryPopup(r) {
  const wrap = document.createElement('div');
  wrap.className = 'popup-card';
  const meta = [state.data.families[r.group]?.th, Number.isFinite(r.workers) ? `${num(r.workers)} คน` : '', r.industry?.th !== state.data.families[r.group]?.th ? r.industry?.th : ''].filter(Boolean).join(' · ');
  wrap.innerHTML = `<div class="popup-identity">${cueMarkup(r.series)}<div><h3>${esc(r.title)}</h3>${r.op ? `<p class="popup-branch">${esc(r.op)}</p>` : ''}</div></div>
    <p class="popup-meta">${esc(meta)}</p>`;
  return wrap;
}

/**
 * Open a registration. One with a point is looked at like a building: the building its point falls in — or, while
 * that is unknown, a 90 m box round the point — in two-point perspective, zoomed to fit, from every way in (pin,
 * building, list, table, search, URL); the map turns 3D (the Hotel 0.3.2 rule). One without a point frames its district.
 */
function selectFactory(id, {fly = true, showPopup = false, fromPin = false} = {}) {
  const r = rowById(id);
  if (!r) return;
  if (state.reach?.id !== id) state.reach = null;
  if (hasPoint(r)) ensure3d();
  if (state.panel.mode !== 'factory') pushHistory();
  // A registration outside the filters (the nearby set reads every row): clear the filters to keep it in scope.
  const outside = !state.scopeRows.includes(r);
  if (outside) { for (const k of FIELDS) $(k).value = ''; state.selectedArea = ''; }
  state.panel = {mode: 'factory', id};
  state.selectedId = id;
  if (outside) update();
  else {
    ensureFrames();
    renderPanel();
    syncList();
    saveURL();
    if (state.loaded) { updatePins(); updateSpatialLayers(); state.pins?.select(id); }
  }
  state.popup?.remove(); state.popup = null;
  if (!fromPin || mobilePortrait()) openMobilePanel({frame: false});
  if (state.loaded) {
    state.framed = null;
    if (hasPoint(r)) {
      frameFocus();
      if (showPopup && !mobilePortrait()) {
        state.popup = new maplibregl.Popup({maxWidth: '280px', offset: 14, closeButton: true}).setLngLat([r.longitude, r.latitude]).setDOMContent(factoryPopup(r)).addTo(state.map);
      }
    } else if (fly) {
      // No point: frame the district (or province) the row is counted in.
      const record = r.area ? areaById(r.area) : r.province ? provinceRecord(r.province) : null;
      if (record) fitRecord(record, {maxZoom: 15});
    }
    state.lastPreset = cameraPreset();
  }
  announce(`เลือก ${r.title}`);
}

/** A building the map draws, opened from a click (or from a registration's panel): the registrations whose points fall in it. */
function selectBuilding(key) {
  const b = state.join?.buildings.get(key);
  const rows = buildingRows(key);
  if (!b || !rows.length) return;
  ensure3d();
  if (state.panel.mode !== 'building' || state.panel.id !== key) pushHistory();
  state.buildingSel = {key, kind: b.kind, footprint: b, rows, height: b.height};
  state.panel = {mode: 'building', id: key};
  state.selectedId = '';
  state.pins?.select('');
  state.popup?.remove(); state.popup = null;
  renderPanel();
  syncList();
  saveURL();
  if (state.loaded) { updatePins(); updateSpatialLayers(); }
  openMobilePanel({frame: false});
  state.framed = null;
  if (state.loaded) { frameFocus(); state.lastPreset = cameraPreset(); }
  announce(`อาคาร ${num(rows.length)} ทะเบียน`);
}

/* ---------- spatial join (points × drawn buildings) ---------- */

/**
 * Join the scope's points to the focus-tier footprints on the map — OpenStreetMap, or CityMETER Building V4 inside a
 * CityMETER unit (keys `osm:` / `cm:`). Recomputed only when either side changes.
 */
function refreshJoin() {
  if (!state.loaded) return false;
  const pieces = state.massing?.buildings() || [];
  const key = `${state.massing?.version ?? 0}|${state.scopeKey}`;
  if (key === refreshJoin.key && state.join) return false;
  refreshJoin.key = key;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const b of pieces) { const [bw, bs, be, bn] = b.bbox; if (bw < w) w = bw; if (be > e) e = be; if (bs < s) s = bs; if (bn > n) n = bn; }
  const within = x => x.longitude >= w && x.longitude <= e && x.latitude >= s && x.latitude <= n;
  const rows = pieces.length ? state.scopeRows.filter(r => hasPoint(r) && within(r)) : [];
  state.join = joinBuildings(pieces, rows, []);
  return true;
}

/** The registrations whose points fall in a drawn building (display only — never an area count). */
function buildingRows(key) {
  return state.join?.byBuilding.get(key) || [];
}


/** Registration panel: the drawn building its point falls in and how many other registrations' points fall in it. */
function factoryBuilding(id) {
  const key = state.join?.byRow.get(id);
  if (!key) return null;
  return {key, others: Math.max(0, buildingRows(key).filter(r => r.id !== id).length)};
}

/** What the open panel shows from the join — re-render only when this changes. */
function panelSpatialSig() {
  const {mode, id} = state.panel;
  if (mode === 'factory') { const b = factoryBuilding(id); return b ? `${b.key}|${b.others}` : ''; }
  return '';
}

/**
 * How far round a registration's pin the building camera looks for a building (the Hotel 0.3.2 rule: a point always
 * opens the two-point view of a 3D building mass): ± REACH_M, widened once for that registration when nothing is drawn
 * within the first reach.
 */
const REACH_M = 300, REACH_FAR_M = 800;
/** Refits of one frame: the building may arrive in steps (the nearest drawn, then the one holding the pin, a wider
 *  reach) and the ground may move once when its DEM tile arrives; never after the user has moved the map. */
const MAX_REFITS = 3;
const reachOf = id => (state.reach?.id === id ? state.reach.m : REACH_M);

/** The drawn building nearest a pin that falls in none (js/shell/building-join.js#nearestBuilding), per join and pieces. */
function nearestOf(r) {
  const pieces = state.massing?.buildings() || [], join = state.join, key = `${r.id}|${reachOf(r.id)}`;
  if (nearestOf.key !== key || nearestOf.join !== join || nearestOf.pieces !== pieces) {
    Object.assign(nearestOf, {key, join, pieces});
    nearestOf.value = join ? nearestBuilding(pieces, [r.longitude, r.latitude], {keyOfPiece: join.keyOfPiece, maxM: reachOf(r.id)}) : null;
  }
  return nearestOf.value;
}

/**
 * The building being looked at: the open building; else the building the open registration's point falls in, else the
 * drawn building nearest its pin (`near`: the camera's building, named “อาคารใกล้หมุด”, never a join).
 * {id, key, refs, anchor: [lon, lat], near} — key/refs are null/[] while no building is known (tiles still loading, or
 * nothing drawn within the reach); null without a point.
 */
function focusTarget() {
  const {mode, id} = state.panel, j = state.join;
  const of = key => ({key: key || null, refs: key ? j?.buildings.get(key)?.refs || [] : []});
  if (mode === 'building') {
    const b = state.buildingSel;
    if (!b) return null;
    const [w, s, e, n] = b.footprint.bbox;
    return {id: `building:${b.key}`, ...of(b.key), anchor: [(w + e) / 2, (s + n) / 2], near: false};
  }
  if (mode === 'factory') {
    const r = rowById(id);
    if (!hasPoint(r)) return null;
    const inside = j?.byRow.get(r.id) || null;
    const near = inside ? null : nearestOf(r)?.key || null;
    return {id: `factory:${r.id}`, ...of(inside || near), anchor: [r.longitude, r.latitude], near: Boolean(near)};
  }
  return null;
}

/** Focus buildings drawn in the data colour: the building being looked at (every piece of it). */
function highlightIds() {
  return focusTarget()?.refs || [];
}

/**
 * Drawn shape of the building being looked at: x-ray features, outer rings with heights, and fit points — the
 * pieces as the focus tier draws them at building zoom (≥ 18), not as drawn at the zoom the camera starts from.
 */
function focusShape(target = focusTarget()) {
  const features = target?.refs.length ? state.massing?.featuresOf(target.refs) || [] : [];
  const rings = features.flatMap(f => outerRings(f).map(ring => ({ring, height: Number(f.properties.height) || 3})));
  // On terrain each piece stands on the ground as drawn (pieceGrounds: its roof on the ground at its centroid, its
  // walls down to the lowest ground under it, as the x-ray draws it): its fit points carry that ground (4th value,
  // js/shell/camera.js#fitBuilding) — the base at the low ground, the roof at the centroid's.
  const map = state.map, terrain = Boolean(map?.terrain) && state.view3d;
  const pinGround = terrain && target ? groundAt(map, target.anchor) : 0;
  let points = features.flatMap(f => {
    const pts = state.massing?.fitPointsOf([f.id], 18) || [];
    if (!terrain) return pts;
    const {g, low} = pieceGrounds(f, pinGround);
    return pts.map(q => [q[0], q[1], q[2], q[2] ? g : low]);
  });
  if (!points.length) points = rings.flatMap(({ring, height}) => ring.flatMap(([lng, lat]) => [[lng, lat, 0], [lng, lat, height]]));
  // The building nearest the pin is framed with the pin, so the registration's symbol stays in view beside it.
  if (points.length && target?.near) points = [...points, terrain ? [target.anchor[0], target.anchor[1], 0, pinGround] : [target.anchor[0], target.anchor[1], 0]];
  if (!points.length && target) {
    // Not known yet: a 90 m box round the point (12 m tall), framed the same way.
    const [lon, lat] = target.anchor, dLat = 45 / 110574, dLng = 45 / (111320 * Math.cos((lat * Math.PI) / 180));
    points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [[lon + a * dLng, lat + b * dLat, 0], [lon + a * dLng, lat + b * dLat, 12]]);
  }
  return {features, rings, points, key: features.length ? features.map(f => f.id).sort((a, b) => a - b).join(',') : 'point'};
}

/** Theme colours of the x-ray: LDS map.activeLayer faces, map.selectedStroke edges (context, not a data scale). */
const xrayColors = () => ({fill: cssVar('--map-active-layer', '#347DA8'), stroke: cssVar('--map-selected-stroke', '#176B82')});

/**
 * Highlight, eye-view scene and x-ray of the building being looked at (after every join or selection change).
 * Owner 2026-10-29: “อย่าให้ 3d building mass ตึกอื่นบังอาคารที่กำลังดูอยู่” — the building is drawn over every
 * other building (js/shell/venue-xray.js) and the focus buildings standing in front of it turn see-through
 * (js/massing.js#setScene, SCENE.eye).
 */
function syncFocusBuilding() {
  if (!state.loaded) return;
  const shape = focusShape();
  const eye = state.view3d && twoPoint() && shape.features.length > 0;
  state.massing?.setScene(eye ? 'eye' : 'default', eye ? shape.rings : []);
  // On terrain every piece stands on the ground at its centroid, as MapLibre lifts fill-extrusions; the x-ray is drawn
  // over the ground, so its walls go down to the lowest ground under the piece (0.3.2: a fixed 10 m into the slope
  // showed below the ground on a hillside), never deeper.
  const grounds = shape.features.map(f => (state.view3d ? pieceGrounds(f) : {g: 0, low: 0}));
  const key = `${state.view3d}|${shape.key}|${state.massing?.version ?? 0}|${theme()}|${grounds.map(x => `${x.g.toFixed(1)}/${x.low.toFixed(1)}`).join(',')}`;
  if (key !== syncFocusBuilding.key) {
    syncFocusBuilding.key = key;
    state.xray?.update(state.view3d ? shape.features.map((f, i) => {
      const base = Number(f.properties.base) || 0, top = Number(f.properties.height) || 3, {g, low} = grounds[i];
      return {type: 'Feature', geometry: f.geometry, properties: {display_height_m: top + g, display_base_m: base > 0 ? base + g : low}};
    }) : [], {colors: xrayColors()});
  }
  state.xray?.setEnabled(state.view3d);
}
/**
 * Ground of a drawn piece on terrain (0 without): `g` at its centroid — where MapLibre lifts a fill-extrusion, so its
 * roof is at height + g — and `low`, the lowest ground under its outline's vertices, where its walls meet the slope.
 * A sample whose DEM tile has not arrived (0 while the other samples are not) is left out; `fallback` stands in for a
 * missing centroid sample.
 */
function pieceGrounds(f, fallback = 0) {
  const map = state.map;
  if (!map?.terrain) return {g: 0, low: 0};
  const g = groundAt(map, centroidOf(f)) || fallback;
  const ring = outerRings(f)[0] || [];
  let low = g;
  for (let i = 0; i < ring.length - 1; i++) { const e = groundAt(map, ring[i]); if (e && e < low) low = e; }
  return {g, low};
}

/** Vertex mean of a feature's first outer ring ([lon, lat]): where MapLibre samples the ground of a fill-extrusion. */
function centroidOf(f) {
  const ring = outerRings(f)[0] || [];
  const n = Math.max(1, ring.length - 1);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += ring[i]?.[0] || 0; y += ring[i]?.[1] || 0; }
  return [x / n, y / n];
}

/**
 * The free part of the map in container pixels: below the toolbar, above whatever covers the bottom (Aha card,
 * legend, chart tray, table, open phone sheet), left of the zoom control.
 */
function visibleBox() {
  const el = $('map'), r = el.getBoundingClientRect();
  const W = el.clientWidth, H = el.clientHeight;
  const shown = x => x && !x.hidden && x.offsetHeight > 0 && getComputedStyle(x).display !== 'none';
  let top = document.querySelector('.map-toolbar').getBoundingClientRect().bottom - r.top + 10;
  let bottom = H - 10;
  for (const x of [$('insights'), $('results'), $('map-legend'), $('map-aha')]) if (shown(x)) bottom = Math.min(bottom, x.getBoundingClientRect().top - r.top - 10);
  if (sheetOpen()) bottom = Math.min(bottom, window.innerHeight - $('panel').offsetHeight - r.top - 10);
  let right = W - 12;
  // The map controls hold the top-right corner only: they bound the box on the right only where they reach into it
  // (a phone keeps the compass alone, beside the toolbar — 0.3.5).
  const nav = el.querySelector('.maplibregl-ctrl-top-right');
  if (nav?.offsetWidth && nav.getBoundingClientRect().bottom - r.top > top) right = Math.min(right, nav.getBoundingClientRect().left - r.left - 8);
  const left = 12;
  if (bottom - top < 140) top = Math.max(4, bottom - 140); // very short screens borrow the toolbar strip
  return {left, top, right: Math.max(left + 120, right), bottom: Math.max(top + 120, bottom)};
}

/**
 * Building camera (owner 2026-10-29 19:47, the CityMETER · Shopping centers venue camera): the eye camera turns
 * corner-on to the building — the diagonal where the drawn focus buildings hide least of it, then the one nearest
 * the current bearing — and every footprint and roof vertex fills the free part of the map. While the building is
 * not known a 90 m box round the point is framed the same way; the camera turns to the building when it arrives
 * (at most twice, never after the user has moved the map). 3D off: the same box, flat. Returns false when the
 * open panel has nothing to frame.
 */
function frameFocus({instant = false} = {}) {
  const map = state.map;
  if (!map || !state.loaded || !twoPoint()) return false;
  const target = focusTarget();
  const shape = focusShape(target);
  if (!target || !shape.points.length) return false;
  const box = visibleBox();
  state.userCamera = false;
  // The ground the frame was computed on (0 off terrain or before its DEM tile arrives): onGroundChange refits when it moves.
  state.framed = {id: target.id, key: shape.key, refits: state.framed?.id === target.id ? state.framed.refits : 0, ground: groundAt(map, target.anchor), box};
  if (!state.view3d) {
    const [q0] = shape.points;
    const b = shape.points.reduce((acc, q) => acc.extend([q[0], q[1]]), new maplibregl.LngLatBounds([q0[0], q0[1]], [q0[0], q0[1]]));
    const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
    fitPitched(map, b, {preset: 'plan', padding: {top: box.top, left: box.left, right: W - box.right, bottom: H - box.bottom}, maxZoom: shape.rings.length ? BUILDING_MAX_ZOOM : 18, minZoom: 14, animate: animate() && !instant});
    return true;
  }
  const known = shape.rings.length > 0;
  const obstacles = known ? state.massing?.obstaclesNear(target.anchor, 400, target.refs) || [] : [];
  const bearing = known ? twoPointBearing(shape.rings.map(t => t.ring), map.getBearing(), obstacles) : map.getBearing();
  // The other corners, opposite first (downhill of a building on a slope), when MapLibre lifts the camera out of the terrain.
  const alternates = known ? [180, 90, -90].map(d => bearing + d) : [];
  fitBuilding(map, shape.points, {box, bearing, alternates, maxZoom: known ? (target.near ? BUILDING_MAX_ZOOM - 1 : BUILDING_MAX_ZOOM) : 18, animate: animate() && !instant});
  return true;
}

/**
 * The ground changed under the building being looked at (terrain on or off, its DEM tiles arrived): the x-ray moves
 * with it, and the building camera frames it again on the ground as drawn — unless the user moved the map (the
 * refits of refitOnNewBuilding count here too).
 */
function onGroundChange() {
  if (!state.loaded) return;
  syncFocusBuilding();
  const target = twoPoint() ? focusTarget() : null;
  if (!target || !state.framed || state.framed.id !== target.id || state.userCamera || state.framed.refits >= MAX_REFITS) return;
  if (Math.abs(groundAt(state.map, target.anchor) - (state.framed.ground || 0)) < 3) return; // the frame still holds
  state.framed.refits++;
  frameFocus();
}

/**
 * The free box changed after the building was framed — the legend re-rendered for the new zoom (an area's ramp gives
 * way to the registration's keys; Hotel 0.3.2), a tray or a sheet: frame
 * it again in the box it now has, unless the user moved the map (the refits count here too).
 */
function refitOnNewBox() {
  const target = twoPoint() ? focusTarget() : null;
  const framed = state.framed;
  if (!target || !framed?.box || framed.id !== target.id || state.userCamera || framed.refits >= MAX_REFITS) return;
  const b = visibleBox(), f = framed.box;
  if (Math.max(Math.abs(b.top - f.top), Math.abs(b.bottom - f.bottom), Math.abs(b.left - f.left), Math.abs(b.right - f.right)) < 8) return;
  framed.refits++;
  frameFocus();
}

/** The building arrived (or changed) after the target was framed: turn to it, unless the user moved the map. */
function refitOnNewBuilding() {
  const target = focusTarget();
  if (!target || !state.framed || state.framed.id !== target.id || state.userCamera || state.framed.refits >= MAX_REFITS) return;
  if (focusShape(target).key === state.framed.key) return;
  state.framed.refits++;
  frameFocus();
}

function applyJoin() {
  refreshJoin();
  const n = state.massing?.setHighlight(highlightIds()) || 0;
  state.blueBuildings = n > 0;
  document.querySelector('.map-panel')?.classList.toggle('has-open-building', state.blueBuildings);
  const label = $('legend-building-label');
  if (label) label.textContent = currentBuilding() ? 'อาคารที่เปิด' : focusTarget()?.near ? 'อาคารใกล้หมุด' : 'อาคารของโรงงาน';
  if (panelSpatialSig() !== state.renderedSig) renderPanel();
  syncFocusBuilding();
  refitOnNewBuilding();
  widenReach();
}

/**
 * Nothing drawn within the first reach of the open registration's pin (a plant among fields, a gap in the building data):
 * look once more, farther (REACH_FAR_M), so the camera still turns to a building — only after a massing result of the
 * registration's own first region, once per registration.
 */
function widenReach() {
  if (state.panel.mode !== 'factory' || state.reach?.id === state.panel.id) return;
  if (state.massingReadFor !== `factory:${state.panel.id}:${REACH_M}`) return; // not yet read round this pin
  const t = focusTarget();
  if (!t || t.key) return;
  state.reach = {id: state.panel.id, m: REACH_FAR_M};
  updateSpatialLayers();
}

/** Focus the top districts of the current scope (auto mode; URL stays clean). */
function exploreTop() { state.autoFocus = true; state.focusAreaIds = []; update({fit: true}); closeMobilePanel(); }
/** Show every district with detail (no quiet context) — ?areas=all. */
function clearFocus() { state.autoFocus = false; state.focusAreaIds = []; update({fit: true}); }

function selectProvince(code) {
  const c = provinceCodeFrom(code);
  if (!c) return;
  $('province').value = c;
  state.selectedArea = '';
  state.focusAreaIds = [];
  state.panel = overviewPanel();
  state.history = [];
  update({fit: true});
  announce(`จังหวัด${provinceByCode(c)?.th || c}`);
}

function resetToOverview({fit = true} = {}) {
  state.focusAreaIds = [];
  state.selectedArea = '';
  state.panel = overviewPanel();
  state.history = [];
  update({fit});
}

function clearFilter(key) {
  if (key === 'all') { $('filters').reset(); resetToOverview(); return; }
  if (FIELDS.includes(key)) $(key).value = '';
  update({fit: key !== 'search'});
}

/** An industry bar or chip: filter to that industry family, staying in the open district. */
function filterGroup(id) {
  if (![...$('group').options].some(o => o.value === id)) return;
  $('group').value = id;
  state.focusAreaIds = [];
  state.history = [];
  const keep = state.panel.mode === 'area';
  if (!keep) state.panel = overviewPanel();
  update({fit: !keep});
}

/**
 * The measure (คนงาน | โรงงาน): the map, legend, labels, Aha, ranks and charts switch together. An explicit focus
 * is kept; the automatic focus follows the new measure and the overview frames it.
 */
function setMetric(value) {
  const next = value === 'count' ? 'count' : 'workers';
  if (next === state.metric) { syncMetricSwitch(); return; }
  state.metric = next;
  update({fit: state.panel.mode === 'overview' && focusMode() !== 'explicit'});
  announce(next === 'count' ? 'วัดด้วยจำนวนโรงงาน (ทะเบียน)' : 'วัดด้วยจำนวนคนงาน (คน)');
}
function syncMetricSwitch() {
  for (const b of document.querySelectorAll('[data-metric]')) {
    const on = b.dataset.metric === state.metric;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function onPanelAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const {action, id, value} = target.dataset;
  switch (action) {
    case 'select-area': selectArea(id); break;
    case 'select-factory': selectFactory(id); break;
    case 'select-building': selectBuilding(id); break;
    case 'select-province': selectProvince(id); break;
    case 'filter-group': filterGroup(value); break;
    case 'set-metric': setMetric(value); break;
    case 'back': goBack(); break;
    case 'explore-top': exploreTop(); break;
    case 'clear-focus': clearFocus(); break;
    // An empty selection under the filters: keep the filters, leave the district, fit to where they match.
    case 'leave-area': resetToOverview(); announce('แสดงทุกพื้นที่ตามตัวกรอง'); break;
    case 'open-charts': if (value) { state.view = value; saveURL(); } openInsights(true); closeMobilePanel(); break;
    case 'open-table': $('results').hidden = false; if (renderTable.stale) renderTable(); closeMobilePanel(); $('toggle-table').focus({preventScroll: true}); break;
    case 'clear-filter': clearFilter(id); break;
    case 'crumb-country': $('province').value = ''; resetToOverview(); break;
    case 'crumb-province': { const c = provinceCodeFrom(id); if (c) $('province').value = c; resetToOverview(); break; }
    case 'crumb-area': selectArea(id); break;
    case 'crumb-expand': { const ol = target.closest('.crumbs'); ol.classList.add('is-expanded'); target.setAttribute('aria-expanded', 'true'); ol.querySelector('.crumb:not(.crumb-more)')?.focus({preventScroll: true}); break; }
    default: break;
  }
}

/* ---------- legend ---------- */
/** Hillshade in the theme's basemap tones (foundation colours, never data colours). */
function terrainColors() {
  const dark = theme() === 'dark';
  return dark
    ? {shadow: cssVar('--basemap-sky') || '#0D1418', highlight: cssVar('--basemap-label-quiet') || '#8D9D99', accent: cssVar('--basemap-sky') || '#0D1418', dark}
    : {shadow: cssVar('--basemap-label') || '#5F635A', highlight: cssVar('--basemap-halo') || '#F6F7F3', accent: cssVar('--basemap-label-quiet') || '#7B877D', dark};
}

/** Size key of the factory symbols (area ∝ workers), drawn at the SIZE_KEY_ZOOM sizes: the proportions are the map's
 *  at every zoom. */
const SIZE_KEY_WORKERS = [200, 1000, 5000], SIZE_KEY_ZOOM = 13;
function sizeKeyHTML() {
  const dot = n => { const d = Math.max(4, Math.round(2 * pinRadius(n, SIZE_KEY_ZOOM))); return `<i class="size-dot" style="--d:${d}px" aria-hidden="true"></i>`; };
  return `${SIZE_KEY_WORKERS.map(n => `<span class="size-step">${dot(n)}<span class="data-number">${num(n)}</span></span>`).join('')}<i class="pictogram pic-workers" aria-hidden="true"></i><span class="sr-only">คน</span>`;
}

/** Map status: pin + number in view (owner 2026-11-01: icons instead of long text); the sentence is the title. */
function renderMapStatus(stats) {
  const el = $('map-status');
  const text = `โรงงานที่มีจุดในจอ ${num(stats.focusInView)} ทะเบียน${stats.contextRows ? ` · นอกโฟกัส ${num(stats.contextRows)} ทะเบียน` : ''}`;
  el.innerHTML = `<i class="pictogram pic-maps" aria-hidden="true"></i><span class="data-number">${num(stats.focusInView)}</span> ในจอ`;
  el.title = text;
  el.setAttribute('aria-label', text);
}
/** Below district zoom (the province frames' window), whether or not a จังหวัด is selected. */
const belowAreaZoom = () => Boolean(state.provinceLayers) && (state.map?.getZoom?.() ?? 12) < PROVINCE_FILL_MAX_ZOOM;
/** The province frames carry the reading: below district zoom with no จังหวัด filter (else: province view). */
const provinceZoom = () => belowAreaZoom() && !$('province').value;
function renderLegend() {
  const u = unit(), atProvince = provinceZoom(), steps = $('legend-steps');
  const m = atProvince ? state.provinceModel : state.areaModel;
  $('legend-title').textContent = atProvince ? `จังหวัด · ${u.label}` : `เขต/อำเภอ · ${u.label}`;
  // All 41 LDS samples with value ticks (owner standing rule), plus the measured-zero swatch when zero occurs.
  // EVID-05 no_data: workers unknown for every registration of an area (the hatch; provinces: outline only).
  const noData = m?.noDataCount > 0 ? `<span class="legend-step" title="ทะเบียนในพื้นที่ไม่มีตัวเลขคนงาน"><i class="legend-nodata" aria-hidden="true"></i>ไม่มีตัวเลขคนงาน</span>` : '';
  steps.innerHTML = m?.ramp?.levels.length
    ? rampLegendHTML(m.ramp, {zero: m.zeroCount > 0, zeroTitle: `0 ${u.one} ในตัวกรองนี้`}) + noData
    : noData || `<span class="hint">ไม่มี${esc(u.subject)}ในตัวกรองนี้</span>`;
  spaceTicks(steps);
  $('legend-areas').title = atProvince
    ? `${u.label}รวมต่อจังหวัด · สีเข้ม = มาก · ซูมเข้าเพื่อดูรายเขต/อำเภอ`
    : `${u.label}รวมต่อเขต/อำเภอ · สีเข้ม = มาก`;
  $('legend-pin-label').innerHTML = sizeKeyHTML();
  const terrainItem = $('legend-terrain');
  if (terrainItem) terrainItem.hidden = !state.terrainActive;
  // Which outlines the focus buildings come from (owner 2026-11-01, point 3): CityMETER Building V4 inside CityMETER units.
  const buildingItem = document.querySelector('.legend-building-item'), src = state.buildingSources || {};
  if (buildingItem) buildingItem.title = `อาคารที่เปิดดูอยู่ · ขอบอาคาร ${src.cm && src.osm ? 'CityMETER Building V4 และ OpenStreetMap' : src.cm ? 'CityMETER Building V4' : 'OpenStreetMap'}`;
  const panel = document.querySelector('.map-panel');
  panel.dataset.metric = state.metric;
  panel.classList.toggle('is-3d', state.view3d);
  panel.classList.toggle('has-open-building', Boolean(state.blueBuildings));
  panel.classList.toggle('is-province-zoom', atProvince);
}

/* ---------- charts ---------- */
let chartDispose = null;
function drawChart() {
  if (!state.data) return;
  chartDispose?.(); chartDispose = null;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  $('chart').setAttribute('aria-labelledby', 'tab-' + state.view);
  const u = unit();
  const narrowed = state.selectedArea || state.focusIds.length;
  $('chart-scope').textContent = `${num(state.scopeRows.length)} ทะเบียนในตัวกรอง${narrowed ? ' · ทุกพื้นที่' : ''}`;
  if ($('insight-content').hidden) return;
  chartDispose = renderInsightChart({elementId: 'chart', view: state.view, rows: state.scopeRows, index: state.index, groups: state.data.families, theme: theme(),
    selectedAreaId: state.selectedArea, selectedFamily: $('group').value, unit: u, national: !$('province').value},
  selection => { if (selection.type === 'area') selectArea(selection.id, {fromMap: true}); else if (selection.type === 'family') filterGroup(selection.id); });
}

function openInsights(open) {
  $('insight-content').hidden = !open;
  $('insights').classList.toggle('is-collapsed', !open);
  $('toggle-insights').setAttribute('aria-expanded', String(open));
  $('toggle-insights').textContent = open ? 'ย่อกราฟ' : 'เปิดกราฟ';
  requestAnimationFrame(() => { syncBottomPanel(); drawChart(); });
}

function syncBottomPanel() {
  const tray = $('insights');
  if (!tray) return;
  document.documentElement.style.setProperty('--bottom-panel-height', `${tray.getBoundingClientRect().height}px`);
  state.pins?.layout();
  state.labels?.layout();
}

/* ---------- table ---------- */
function areaCell(r) {
  const a = r.area ? areaById(r.area) : null;
  const province = provinceByCode(r.province)?.th || '';
  if (a) return `${esc(areaWord(a.province))}${esc(a.name)}<small>${esc(province)}</small>`;
  return province ? esc(province) : '<span class="hint">ไม่ระบุ</span>';
}

function renderTable() {
  if ($('results').hidden && renderTable.done) { renderTable.stale = true; return; }
  renderTable.done = true; renderTable.stale = false;
  const pageSize = 25, start = state.page * pageSize;
  const list = detailRows();
  if (!renderTable.sorted || renderTable.source !== list) { renderTable.sorted = [...list].sort(listOrder); renderTable.source = list; }
  const rs = renderTable.sorted.slice(start, start + pageSize);
  $('result-rows').innerHTML = rs.map(r => `<tr>
      <td><button type="button" class="row-name brand-row" data-id="${esc(r.id)}">${cueMarkup(r.series, {className: 'row-cue'})}<span>${esc(r.title)}</span></button><small>${esc(state.data.families[r.group]?.th || '')}</small></td>
      <td class="num">${r.workers == null ? '<span class="hint" title="ไม่มีตัวเลขคนงาน">—<span class="sr-only">ไม่มีตัวเลขคนงาน</span></span>' : `<span class="data-number">${num(r.workers)}</span>`}</td>
      <td>${esc(r.industry?.th || '')}${r.type?.code ? `<small class="data-number">${esc(r.type.code)}</small>` : ''}</td>
      <td>${areaCell(r)}</td>
      <td>${r.moi ? esc(r.moi) : '<span class="hint">ไม่พบ</span>'}</td></tr>`).join('') ||
    '<tr><td colspan="5">ไม่พบโรงงานตามตัวกรอง</td></tr>';
  $('page-label').textContent = list.length ? `${num(start + 1)}–${num(Math.min(start + pageSize, list.length))} / ${num(list.length)}` : '0 ทะเบียน';
  $('prev-page').disabled = state.page === 0;
  $('next-page').disabled = start + pageSize >= list.length;
  for (const b of $('result-rows').querySelectorAll('[data-id]')) b.onclick = () => { selectFactory(b.dataset.id); $('panel').scrollTop = 0; };
}

/* ---------- map ---------- */
function cameraPadding() {
  const height = $('map').clientHeight, panel = $('insights').getBoundingClientRect().height;
  const edge = Math.min(48, Math.max(12, (height - panel) / 6));
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  const aha = $('map-aha'), legend = $('map-legend');
  const chromeTop = !aha.hidden && aha.offsetHeight ? aha.getBoundingClientRect().top : legend.offsetHeight ? legend.getBoundingClientRect().top : null;
  let bottom = chromeTop != null ? height - (chromeTop - mapTop) + 12 : panel + edge;
  if (mobilePortrait() && $('panel').classList.contains('is-open')) bottom = Math.max(bottom, Math.round($('panel').getBoundingClientRect().height) - (window.innerHeight - height - mapTop) + 8);
  return {top: Math.max(edge, toolbar.bottom - mapTop + 12), left: edge, right: edge, bottom: Math.min(height * 0.7, bottom)};
}

/** Padding for pitched fits: the legend is ignored (foreshortening already lifts the content). */
function pitchedPadding() {
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  return {top: Math.round(toolbar.bottom - mapTop + 12), bottom: Math.round($('insights').getBoundingClientRect().height + 40), left: 24, right: 24};
}

function vertices(features) {
  const out = [];
  const walk = v => { if (typeof v[0] === 'number') out.push(v); else v.forEach(walk); };
  for (const f of features) walk(f.geometry.coordinates);
  return out;
}
/** Containment points of a record: its outline when loaded, else its bbox corners (the index has every bbox). */
function recordPoints(record) {
  if (record?.feature) return vertices([record.feature]);
  const b = recordBounds(record);
  return b ? [[b[0][0], b[0][1]], [b[1][0], b[0][1]], [b[1][0], b[1][1]], [b[0][0], b[1][1]]] : [];
}
/** LngLatBounds around [[w, s], [e, n]] boxes, or null. */
function boundsOf(boxes) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const b of boxes) if (b) { w = Math.min(w, b[0][0]); s = Math.min(s, b[0][1]); e = Math.max(e, b[1][0]); n = Math.max(n, b[1][1]); }
  return Number.isFinite(w) ? new maplibregl.LngLatBounds([w, s], [e, n]) : null;
}
const countryBox = () => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of state.index.provinces) if (p.bbox) { w = Math.min(w, p.bbox[0]); s = Math.min(s, p.bbox[1]); e = Math.max(e, p.bbox[2]); n = Math.max(n, p.bbox[3]); }
  return Number.isFinite(w) ? [[w, s], [e, n]] : [[97.34, 5.61], [105.64, 20.47]];
};

/** Frame one district or province (plan while the mobile sheet covers the map; 3D preset when it closes). */
function fitRecord(record, {maxZoom = 16, instant = false} = {}) {
  const bounds = boundsOf([recordBounds(record)]);
  if (!bounds) return;
  const wide = bounds.getNorth() - bounds.getSouth() > 0.3 || bounds.getEast() - bounds.getWest() > 0.3;
  const preset = sheetOpen() || wide ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan' && !mobilePortrait();
  fitPitched(state.map, bounds, {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom, minZoom: 5, animate: animate() && !instant, points: recordPoints(record), shift: mobilePortrait() ? -0.08 : null});
}

function fitCountry({instant = false} = {}) {
  fitPitched(state.map, boundsOf([countryBox()]), {preset: 'plan', padding: cameraPadding(), maxZoom: 7, minZoom: 4, animate: animate() && !instant});
}

function fitMap({instant = false} = {}) {
  if (!state.loaded) return;
  // A building or a registration with a point: the building camera (two-point, zoomed to fit) — before the district
  // it was opened from. A registration without a point frames its district.
  if (frameFocus({instant})) return;
  if (state.panel.mode === 'factory') {
    const r = rowById(state.panel.id), record = r?.area ? areaById(r.area) : r?.province ? provinceRecord(r.province) : null;
    if (record) { fitRecord(record, {maxZoom: 15, instant}); return; }
  }
  const area = state.selectedArea ? areaById(state.selectedArea) : null;
  if (area) { fitRecord(area, {instant}); return; }
  // A spread Aha (no district stands out) frames the leading province's districts that hold rows.
  const spread = !state.focusIds.length && state.autoFocus && state.insight?.spread ? state.insight.homeAreaIds : [];
  const focus = (state.focusIds.length ? state.focusIds : spread).map(areaById).filter(Boolean);
  const province = $('province').value ? provinceRecord($('province').value) : null;
  if (!focus.length && !province) { fitCountry({instant}); return; }
  const b = boundsOf((focus.length ? focus : [province]).map(recordBounds));
  if (!b) return;
  const wide = b.getNorth() - b.getSouth() > 0.3 || b.getEast() - b.getWest() > 0.3;
  const preset = wide ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan' && !mobilePortrait();
  const target = fitPitched(state.map, b, {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom: 15, minZoom: 4.5, apply: false,
    points: focus.length ? focus.flatMap(recordPoints) : null, shift: mobilePortrait() && !wide ? -0.12 : null});
  if (!target) return;
  // A province is fitted whole: its เขต/อำเภอ are drawn at every zoom (province view), so no zoom floor is needed.
  if (animate() && !instant) state.map.easeTo({...target, duration: 650}); else state.map.jumpTo(target);
}

/**
 * Labels: the selection and the focus first (from AREA_MIN_ZOOM), then — once the map is close enough to read
 * them — the other districts of the scope with the most of the measure as quiet chips (bounded: fewer on a phone).
 * Each chip carries the value and a swatch of its ramp colour (the legend link).
 */
function areaLabelItems() {
  const m = state.areaModel;
  if (!m) return [];
  const u = unit(), zoom = state.map?.getZoom?.() ?? 12;
  // Below district zoom only the province view labels districts (its focus / selection; quiet chips need zoom ≥ 9).
  if (zoom < AREA_MIN_ZOOM && !$('province').value) return [];
  const focus = new Set(state.selectedArea ? [state.selectedArea] : state.focusIds);
  const quietOK = zoom >= 9;
  const pool = m.areas.filter(a => a.value > 0);
  const byRank = (a, b) => b.value - a.value || b.count - a.count;
  // Navigating (a district, building or registration is open): the frames on screen keep their label first,
  // so the neighbouring เขต/อำเภอ is one click away (refreshed on moveend).
  const navigating = Boolean(state.selectedArea) || ['building', 'factory'].includes(state.panel.mode);
  const near = navigating && quietOK ? pool.filter(a => !focus.has(a.id) && state.labelView.has(a.id)).sort(byRank).slice(0, mobilePortrait() ? 4 : 16) : [];
  const nearIds = new Set(near.map(a => a.id));
  const quietLimit = !quietOK ? 0 : focus.size ? (mobilePortrait() ? 0 : 12) : (mobilePortrait() ? 10 : 30);
  const others = quietLimit ? pool.filter(a => !focus.has(a.id) && !nearIds.has(a.id)).sort(byRank).slice(0, quietLimit) : [];
  const ordered = [...pool.filter(a => focus.has(a.id)), ...near, ...others];
  return ordered.map(a => ({id: a.id, name: a.name, value: num(a.value), state: a.state, quiet: focus.size > 0 && !focus.has(a.id),
    selected: a.id === state.selectedArea, center: navigating && state.labelView.has(a.id) ? state.labelView.get(a.id) : a.label, swatch: a.fill || '',
    title: `${areaWord(a.province)}${a.name} · ${num(a.value)} ${u.one} · ${u.id === 'count' ? `${num(a.workers)} คน` : `${num(a.count)} ทะเบียน`}`}));
}

/**
 * Frames on screen and a visible anchor for each (after every camera move): its own label point when that is
 * on screen, else the grid point over the free part of the map that lies in the frame and is nearest its label
 * point. A neighbour whose centre is off screen still gets a label where it is visible.
 */
function refreshLabelView() {
  const map = state.map, m = state.areaModel;
  if (!map || !m || !state.index) return;
  state.locateArea ||= areaLocator(state.index);
  const el = map.getContainer(), w = el.clientWidth, h = el.clientHeight, zoom = map.getZoom();
  const top = 56, bottom = Math.min(h * 0.45, labelBottomSpace() + 8), left = 16, right = w - 16;
  // A label never sits on the building being looked at (its chip is ~140 × 30 px round its anchor).
  const avoid = buildingScreenBox();
  const onBuilding = q => avoid && q.x > avoid.minX - 70 && q.x < avoid.maxX + 70 && q.y > avoid.minY - 18 && q.y < avoid.maxY + 18;
  const free = q => q.x >= left && q.x <= right && q.y >= top && q.y <= h - bottom && !onBuilding(q);
  const best = new Map();
  if (zoom >= AREA_MIN_ZOOM) {
    const vb = map.getBounds(), W = vb.getWest(), E = vb.getEast(), S = vb.getSouth(), N = vb.getNorth();
    for (const a of m.areas) {
      if (!a.count || !Array.isArray(a.label)) continue;
      const [x, y] = a.label;
      if (x < W || x > E || y < S || y > N) continue;
      if (free(map.project(a.label))) best.set(a.id, {center: a.label, d: 0});
    }
    const cols = 9, rows = 6;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const sx = left + ((i + 0.5) / cols) * (right - left), sy = top + ((j + 0.5) / rows) * (h - bottom - top);
      if (onBuilding({x: sx, y: sy})) continue;
      const ll = map.unproject([sx, sy]).toArray();
      const id = state.locateArea(ll);
      const a = id && best.get(id)?.d !== 0 ? areaById(id) : null;
      if (!a) continue;
      const lp = Array.isArray(a.label) ? map.project(a.label) : {x: sx, y: sy};
      const d = Math.hypot(lp.x - sx, lp.y - sy);
      if (!best.has(id) || d < best.get(id).d) best.set(id, {center: ll, d});
    }
  }
  const bucket = `${zoom >= AREA_MIN_ZOOM ? 1 : 0}${zoom >= 9 ? 1 : 0}`;
  const key = `${bucket}|${[...best].map(([id, b]) => `${id}:${b.center.map(v => v.toFixed(5)).join(',')}`).sort().join('|')}`;
  if (key === refreshLabelView.key) return;
  refreshLabelView.key = key;
  state.labelView = new Map([...best].map(([id, b]) => [id, b.center]));
  state.labels?.update(state.showAreas ? areaLabelItems() : [], {visible: state.showAreas});
  state.provinceLabels?.layout();
}
/** Screen box of the building being looked at (null when none is known or no building view is open). */
function buildingScreenBox() {
  if (!state.map || !twoPoint()) return null;
  const shape = focusShape();
  return shape.features.length ? screenBounds(state.map, shape.points) : null;
}
function scheduleLabelView() {
  clearTimeout(scheduleLabelView.timer);
  scheduleLabelView.timer = setTimeout(() => { if (state.loaded) { syncMapFocus(); refreshLabelView(); ensureFramesInView(); renderLegend(); } }, 60);
}

/**
 * National scale: the AUTOMATIC focus quiets the map only while one of its districts is on screen. Panned or
 * zoomed to another part of the country, the map fills every loaded frame (the panel keeps the Aha); a
 * user-chosen focus or a selected district never releases.
 */
function mapFocusIds() {
  if (focusMode() !== 'auto' || !state.map || !state.loaded) return state.focusIds;
  const b = state.map.getBounds(), w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
  const onScreen = state.focusIds.some(id => { const box = areaById(id)?.bbox; return Array.isArray(box) && !(box[2] < w || box[0] > e || box[3] < s || box[1] > n); });
  return onScreen ? state.focusIds : [];
}
/** After a camera move: re-apply the area layers only when the released/kept focus flips. */
function syncMapFocus() {
  const key = mapFocusIds().join(',');
  if (key !== syncMapFocus.key) updateSpatialLayers();
}

/** Provinces whose building units the massing regions need: the selection's, plus the province under each region. */
function massingProvinces(regions) {
  const codes = new Set(wantedProvinces());
  if (state.panel.mode === 'building') for (const r of state.buildingSel?.rows || []) if (r.province) codes.add(r.province);
  if (state.provincesGeo?.features?.length) {
    state.locateProvince ||= provinceLocator(state.provincesGeo);
    for (const ring of regions) {
      let x = 0, y = 0;
      for (const [lon, lat] of ring) { x += lon; y += lat; }
      const code = ring.length ? state.locateProvince([x / ring.length, y / ring.length]) : '';
      if (code) codes.add(code);
    }
  }
  return [...codes].filter(Boolean);
}

/** A small square (lon/lat ring) around a point: the massing region of a registration. */
function squareAround(lon, lat, metres = 250) {
  const dy = metres / 110574, dx = metres / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]];
}

/**
 * Massing focus regions: around the open building, the open registration's point, else the selected district, else
 * the focus. A building view keeps its building (and a ring of neighbours) in the focus tier.
 */
function massingRegions() {
  if (state.panel.mode === 'building' && state.buildingSel?.footprint?.bbox) {
    const [w, s, e, n] = state.buildingSel.footprint.bbox, lat = (s + n) / 2;
    const half = Math.max((e - w) * 111320 * Math.cos((lat * Math.PI) / 180), (n - s) * 110574) / 2;
    return [squareAround((w + e) / 2, lat, Math.max(300, half + 150))];
  }
  if (state.panel.mode === 'factory') {
    const r = rowById(state.panel.id);
    if (hasPoint(r)) return [squareAround(r.longitude, r.latitude, reachOf(r.id))];
    const a = r?.area ? areaById(r.area) : null;
    if (a?.feature) return outerRings(a.feature);
  }
  const records = state.selectedArea ? [areaById(state.selectedArea)] : state.focusIds.map(areaById);
  return records.map(a => a?.feature).filter(Boolean).flatMap(outerRings);
}

function updateSpatialLayers() {
  if (!state.loaded) return;
  // Terrain mode reads the land at hilly sites — also round a building or registration being looked at (Hotel 0.3.0):
  // the building camera and the x-ray stand on the drawn ground (js/shell/camera.js).
  state.terrain?.setEnabled(state.view3d);
  const code = $('province').value, u = unit();
  const pm = state.provinceLayers?.update({rows: provinceScopeRows(), selectedCode: code, visible: true, metric: state.metric}) || null;
  state.provinceModel = pm;
  const focusIds = mapFocusIds();
  syncMapFocus.key = focusIds.join(',');
  state.areaLayers?.update({model: state.areaModel, selectedId: state.selectedArea, focusIds, outlineFocus: true, visible: state.showAreas, provinceCode: code});
  state.labels?.update(state.showAreas ? areaLabelItems() : [], {visible: state.showAreas});
  // Province chips after the district chips: they keep clear of them (installAreaLabels `avoid`), so they lay out second.
  state.provinceLabels?.update(pm ? pm.provinces.filter(p => p.value > 0 || p.code === code).sort((a, b) => (b.code === code) - (a.code === code) || b.value - a.value)
    .map(p => ({id: p.code, name: p.name, value: num(p.value), state: p.state, quiet: Boolean(code) && p.code !== code, selected: p.code === code, center: p.label, swatch: p.fill || '',
      title: `${p.name} · ${num(p.value)} ${u.one} · ${u.id === 'count' ? `${num(p.workers)} คน` : `${num(p.count)} ทะเบียน`}`})) : [], {visible: true});
  renderLegend();
  const target = twoPoint() ? focusTarget() : null;
  const anchorPoints = target ? [target.anchor]
    : (state.selectedArea ? [areaById(state.selectedArea)] : state.focusIds.map(areaById)).filter(Boolean).map(r => r.label).filter(Array.isArray);
  const anchors = anchorPoints.length ? anchorPoints : [state.map.getCenter().toArray()];
  const regions = massingRegions();
  // The buildings of a CityMETER unit replace OSM there; wait for the provinces' unit files (small) so the focus is
  // shaped once, from the right source. A file that fails leaves the area on OSM.
  const codes = massingProvinces(regions);
  state.buildingUnits?.ensureMany(codes);
  if (!state.buildingUnits || codes.every(c => state.buildingUnits.settled(c))) {
    const zones = state.buildingUnits?.zonesFor(regions) || [];
    // Which registration region this request reads (widenReach acts only on a result of its own region).
    const r = state.panel.mode === 'factory' ? rowById(state.panel.id) : null;
    state.massingFor = hasPoint(r) ? `factory:${r.id}:${reachOf(r.id)}` : '';
    state.massing?.update({regions, hosts: [], anchors, zones, enabled: true, city: state.view3d, zoom: state.map.getZoom(), latitude: state.map.getCenter().lat})?.catch(e => console.warn('Massing', e));
  }
  applyJoin();
  state.pins?.layout();
}

/** Below district zoom: the เขต/อำเภอ of the selected จังหวัด under a point ('' outside it or without a filter). */
function provinceViewArea(point) {
  const code = $('province').value;
  if (!code || !state.showAreas) return '';
  const id = state.areaLayers?.hitTest(point) || '';
  return id && areaById(id)?.province === code ? id : '';
}
/** The province frame under a point (its code, or ''). Quiet frames (opacity 0) still answer the query. */
function provinceAt(point) {
  const layers = ['province-fill'].filter(id => state.map.getLayer(id));
  const f = layers.length ? state.map.queryRenderedFeatures(point, {layers})[0] : null;
  return f ? String(f.id ?? f.properties?.id) : '';
}

/** What a building under the pointer would open (null: nothing → the click falls through): its one registration, else the building. */
function buildingTarget(point) {
  const b = state.massing?.hitTest(point);
  if (!b || !state.join) return null;
  const key = state.join.keyOfPiece.get(b.id);
  if (!key) return null;
  const rows = buildingRows(key);
  if (!rows.length) return null;
  return rows.length === 1 ? {kind: 'factory', id: rows[0].id} : {kind: 'building', key};
}

/**
 * One click handler, in priority order: focus pin → the building being looked at (x-ray: frame it again) → a focus
 * building (its one registration or its list; every way in frames the building) → province (country zoom) →
 * district. A click on another เขต/อำเภอ moves there at any zoom from AREA_MIN_ZOOM; a click inside the selected one
 * changes nothing (pan and tilt freely).
 */
function onMapClick(e) {
  const point = e.point;
  const r = state.pins?.hitTest(point);
  if (r) { selectFactory(r.id, {fly: false, showPopup: true, fromPin: true}); return; }
  // The building being looked at is drawn over every other building (x-ray): a tap on it frames it again.
  if (state.xray?.hitTest([point.x, point.y]) && frameFocus()) return;
  const hit = buildingTarget(point);
  if (hit?.kind === 'factory') { selectFactory(hit.id, {fly: false, showPopup: true, fromPin: true}); return; }
  if (hit?.kind === 'building') { selectBuilding(hit.key); return; }
  if (belowAreaZoom()) {
    // Province view: a เขต/อำเภอ of the selected จังหวัด; anywhere else a province frame (another จังหวัด).
    const area = provinceViewArea(point);
    if (area) { if (area !== state.selectedArea) selectArea(area, {fromMap: true}); return; }
    const code = provinceAt(point);
    if (code && code !== $('province').value) selectProvince(code);
    return;
  }
  if (!state.showAreas) return;
  const id = state.areaLayers?.hitTest(point) || '';
  if (id && id !== state.selectedArea) selectArea(id, {fromMap: true});
}

/** Pointer feedback (one query per frame): pointer over anything clickable, outline on another district. */
function onMapMove(e) {
  onMapMove.point = e.point;
  if (onMapMove.frame) return;
  onMapMove.frame = requestAnimationFrame(() => {
    onMapMove.frame = 0;
    const map = state.map, p = onMapMove.point;
    if (!map || !state.loaded || !p) return;
    const pinRow = state.pins?.hitTest(p) || null;
    // A registration under a fine pointer opens its card (icon chips); leaving it closes the card.
    state.siteLabels?.hover(pinRow);
    let over = Boolean(pinRow) || Boolean(state.xray?.hitTest([p.x, p.y])) || Boolean(buildingTarget(p));
    let area = '';
    if (!over && belowAreaZoom()) {
      const inProvince = provinceViewArea(p);
      if (inProvince) area = inProvince === state.selectedArea ? '' : inProvince;
      else { const code = provinceAt(p); over = Boolean(code) && code !== $('province').value; }
    } else if (!over && state.showAreas && map.getZoom() >= AREA_MIN_ZOOM) {
      area = state.areaLayers?.hitTest(p) || '';
      if (area === state.selectedArea) area = '';
    }
    state.areaLayers?.hover(area);
    over = over || Boolean(area);
    map.getCanvas().style.cursor = over ? 'pointer' : '';
  });
}

function installSpatialLayers() {
  const map = state.map;
  state.loaded = true;
  // MapLibre 5.6.2 throws in its tile cover when the pitched building camera zooms out through 13–14 (js/shell/maplibre-guard.js).
  guardRetainedTiles(map, maplibregl.getVersion?.());
  // After a programmatic ease on terrain MapLibre 5.6.2 stops clamping the centre to the ground (js/shell/maplibre-guard.js).
  guardElevationFreeze(map, maplibregl.getVersion?.());
  const palette = basemapPalette(theme());
  state.provinceLayers = state.provincesGeo?.features?.length ? installProvinceLayers(map, state.provincesGeo) : null;
  state.areaLayers = installAreaLayers(map, {areas: state.frames.areas()});
  state.massing = installMassing(map, {
    beforeId: MASSING_BEFORE,
    // The open building is drawn in the data colour (LDS map.activeLayer), read from the theme.
    colors: {quiet: palette.massingQuiet, focus: palette.massingFocus, ground: palette.ground, venue: cssVar('--map-active-layer') || undefined},
    tileUrl: t => (state.tileTemplate ? state.tileTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y) : ''),
    // CityMETER Building V4 inside CityMETER units (js/shell/building-units.js); credited in the attribution while drawn.
    cmTileUrl, cmAttribution: CM_ATTRIBUTION,
    onResult: result => {
      state.massingReadFor = state.massingFor; // a result is always the latest request's (stale ones are dropped)
      const status = $('map-status');
      status.dataset.massing = `${result.features || 0}`;
      status.dataset.cmBuildings = `${result.cm?.kept || 0}`;
      state.buildingSources = {osm: result.osm || 0, cm: result.cm?.kept || 0};
      applyJoin();
      renderLegend();
    },
  });
  // The building being looked at, drawn over every other building and over road names (below place labels and pins).
  try { state.xray = installVenueXray(map, {beforeId: VENUE_XRAY_BEFORE, colors: xrayColors()}); }
  catch (e) { state.xray = null; console.warn('Building x-ray unavailable', e); }
  state.pins = installBranchPins(map, $('map'), {
    reservedBottom: bottomSpace,
    onSelect: r => selectFactory(r.id, {fly: false, showPopup: true, fromPin: true}),
    onHover: (r, el) => state.siteLabels?.hover(r, el),
    // Icon + number (owner 2026-11-01: icons instead of long text); the sentence stays in the title.
    onLayout: stats => renderMapStatus(stats),
  });
  // Terrain mode at hilly sites (js/shell/terrain.js): 3D ground + hillshade; the district fill switches off at site scale.
  try {
    state.terrain = installTerrain(map, {beforeId: 'water', colors: terrainColors(), onChange: active => {
      setFillSwitchZoom(map, active ? TERRAIN.minZoom : FILL_MAX_ZOOM);
      state.terrainActive = active;
      renderLegend();
      state.labels?.layout();
      onGroundChange();
    }, onLoaded: onGroundChange, site: () => (twoPoint() ? focusTarget()?.anchor || null : null)});
    state.terrain.setEnabled(state.view3d);
  } catch (e) { state.terrain = null; console.warn('Terrain unavailable', e); }
  state.siteLabels = installFactoryLabels(map, $('map'), {
    onSelect: r => selectFactory(r.id, {fly: false, showPopup: true, fromPin: true}),
    bounds: () => state.pins?.bounds?.() || {left: 0, top: 0, right: map.getContainer().clientWidth, bottom: map.getContainer().clientHeight, exclusions: []},
    // In the building view a name never sits on the building being looked at (Hotel 0.3.2, as the district chips).
    avoid: () => { const b = buildingScreenBox(); return b ? [{left: b.minX - 4, right: b.maxX + 4, top: b.minY - 4, bottom: b.maxY + 4}] : []; },
    radius: (r, zoom) => (zoom >= DETAIL_MIN_ZOOM ? Math.max(4, Math.min(20, pinRadius(r.workers, zoom))) : pinRadius(r.workers, zoom)),
    isPhone: mobilePortrait,
    finePointer: () => matchMedia('(hover: hover) and (pointer: fine)').matches,
    num,
    groupName: r => state.data.families[r.group]?.th || '',
  });
  updatePins();
  updateSpatialLayers();
  if (!state.initialCameraDone) {
    state.initialCameraDone = true;
    const r = state.panel.mode === 'factory' ? rowById(state.panel.id) : null;
    // A deep link to a registration with a point opens on its building (a 90 m box until the tiles arrive).
    if (twoPoint()) frameFocus({instant: true});
    else if (r && (r.area || r.province)) fitRecord(r.area ? areaById(r.area) : provinceRecord(r.province), {maxZoom: 15, instant: true});
    else fitMap({instant: true});
    state.lastPreset = cameraPreset();
  }
  scheduleLabelView();
}

/**
 * The attribution (OpenStreetMap / OpenMapTiles / CityMETER) must stay readable: its live height — expanded on
 * load, compact after the first drag — becomes --attrib-height, which keeps the phone dock above it while it is open.
 * Folded to its (i) button (`is-attrib-compact`, 0.3.5) the phone dock drops to the tray and leaves the button its corner.
 */
function trackAttribution(map) {
  const panel = map.getContainer().closest('.map-panel');
  const el = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (!panel || !el) return null;
  const set = () => {
    panel.style.setProperty('--attrib-height', `${Math.ceil(el.getBoundingClientRect().height) + 10}px`);
    panel.classList.toggle('is-attrib-compact', el.classList.contains('maplibregl-compact') && !el.classList.contains('maplibregl-compact-show'));
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
  observer?.observe(el);
  if (typeof MutationObserver === 'function') new MutationObserver(set).observe(el, {attributes: true, attributeFilter: ['class']});
  set();
  return observer;
}

/**
 * Ramp tick labels on the ramp's actual width (the phone dock narrows it): a label that would touch the one before it
 * steps aside; the highest value keeps its tick and the one before it steps aside instead (js/scales.js#rampTicks
 * already spaces them for the narrowest ramp; this is the safety net for fonts and widths it cannot know).
 */
function spaceTicks(root) {
  for (const ramp of root?.querySelectorAll('.ramp-ticks') || []) {
    const ticks = [...ramp.querySelectorAll('.ramp-tick')];
    ticks.forEach(t => t.classList.remove('is-crowded'));
    if (ticks.length < 3 || !ramp.offsetWidth) continue;
    const shown = [ticks[0]];
    for (const t of ticks.slice(1)) {
      const last = t === ticks.at(-1);
      while (shown.length > 1 && shown.at(-1).getBoundingClientRect().right + 4 > t.getBoundingClientRect().left) {
        if (!last) break;
        shown.pop().classList.add('is-crowded');
      }
      if (shown.at(-1).getBoundingClientRect().right + 4 > t.getBoundingClientRect().left && !last) { t.classList.add('is-crowded'); continue; }
      shown.push(t);
    }
  }
}

/** The legend's height changes with the measure switch and the ramp (--legend-height); its ticks are spaced again on resize. */
function trackLegend() {
  const panel = document.querySelector('.map-panel'), el = $('map-legend');
  if (!panel || !el) return null;
  const set = () => { panel.style.setProperty('--legend-height', `${Math.ceil(el.offsetParent ? el.getBoundingClientRect().height : 0)}px`); spaceTicks(el); };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
  observer?.observe(el);
  set();
  return observer;
}

/**
 * The parts that bound the free box of the building view (js/app.js#visibleBox) can change size after a frame — the
 * legend re-rendered for the new zoom, the trays, the phone sheet: once the camera is still, frame the building again
 * in the box it now has (refitOnNewBox; never re-entered from a fit's own jumps, never after a user camera move).
 */
function watchFreeBox() {
  if (typeof ResizeObserver !== 'function') return null;
  let timer = 0;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!state.loaded || !state.map) return;
      if (state.map.isMoving()) { state.map.once('moveend', later); return; }
      refitOnNewBox();
    }, 150);
  };
  const observer = new ResizeObserver(later);
  for (const el of [$('map'), $('map-legend'), $('insights'), $('results'), $('map-aha'), $('panel')]) if (el) observer.observe(el);
  return observer;
}

/** Thai labels for the map's own controls. */
const MAP_LOCALE = {
  'Map.Title': 'แผนที่โรงงานและคนงาน', 'NavigationControl.ZoomIn': 'ซูมเข้า', 'NavigationControl.ZoomOut': 'ซูมออก',
  'NavigationControl.ResetBearing': 'หมุนกลับทิศเหนือ (ลากเพื่อหมุนหรือเอียง)', 'Popup.Close': 'ปิด', 'AttributionControl.ToggleAttribution': 'แสดงหรือซ่อนที่มาของแผนที่',
};

function initMap() {
  if (!window.maplibregl) throw new Error('Map library is unavailable');
  try {
    state.mapTheme = theme();
    state.map = new maplibregl.Map({container: 'map', center: BANGKOK.center, zoom: BANGKOK.zoom, pitch: 0, maxPitch: 85, attributionControl: {compact: true}, locale: MAP_LOCALE, style: buildMapStyle(state.mapTheme)});
    state.map.addControl(new maplibregl.NavigationControl({showCompass: true, visualizePitch: true}), 'top-right');
    state.attribObserver = trackAttribution(state.map);
    state.legendObserver ||= trackLegend();
    document.fonts?.ready?.then(() => spaceTicks($('map-legend')));
    state.freeBoxObserver ||= watchFreeBox();
    state.labels = installAreaLabels(state.map, $('map'), {className: 'neighborhood-label', hostId: 'area-labels', hostLabel: 'เขต/อำเภอบนแผนที่', minZoom: PROVINCE_VIEW_MIN_ZOOM, verb: 'กดเพื่อสำรวจพื้นที่', onSelect: id => selectArea(id, {fromMap: true}), reservedBottom: labelBottomSpace, maxLabels: 40});
    state.provinceLabels = installAreaLabels(state.map, $('map'), {className: 'province-label', hostId: 'province-labels', hostLabel: 'จังหวัดบนแผนที่', minZoom: 0, maxZoom: PROVINCE_LABEL_MAX_ZOOM, verb: 'กดเพื่อดูจังหวัด', detailZoomClass: false, onSelect: code => selectProvince(code), reservedBottom: labelBottomSpace, maxLabels: 77, avoid: '.neighborhood-label:not([hidden])'});
    state.map.on('zoomend', () => { if (state.loaded) renderLegend(); });
    // Coalesced: a camera fit jumps the map many times in one task; labels and frame loading follow the last position.
    state.map.on('moveend', scheduleLabelView);
    // The open registration's terrain chips read the basemap tiles round it: read again once the map has settled there.
    state.map.on('idle', () => { if (state.loaded && state.panel.mode === 'factory') fillTerrain(rowById(state.panel.id)); });
    state.map.on('mouseout', () => { state.areaLayers?.hover(''); });
    state.map.on('style.load', installSpatialLayers);
    state.map.on('click', onMapClick);
    state.map.on('mousemove', onMapMove);
    // A camera move started by the user (drag, pinch, wheel, keys): a building found later never moves the camera again.
    state.map.on('movestart', e => { if (e.originalEvent) state.userCamera = true; });
    state.map.on('error', e => console.warn('Map resource', e.error?.message || e));
    fetch(TILEJSON_URL).then(r => r.json()).then(j => { state.tileTemplate = j.tiles?.[0] || ''; if (state.loaded) updateSpatialLayers(); }).catch(e => console.warn('TileJSON', e));
  } catch (e) {
    state.loaded = false; state.initialCameraDone = false;
    for (const cleanup of [() => state.attribObserver?.disconnect(), () => state.labels?.dispose(), () => state.provinceLabels?.dispose(), disposeSpatial, () => state.map?.remove()]) { try { cleanup(); } catch (err) { console.warn('Map cleanup', err); } }
    state.map = null; state.labels = null; state.provinceLabels = null; state.provinceModel = null;
    throw e;
  }
}

async function startMap() {
  const el = $('map-failure');
  try { await loadMapLibrary(); el.hidden = true; initMap(); }
  catch (e) {
    el.hidden = false;
    el.innerHTML = `<p>โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้</p><p class="hint">${esc(e.message || '')}</p><button type="button" class="btn">ลองโหลดแผนที่ใหม่</button>`;
    el.querySelector('button').onclick = event => { event.target.disabled = true; startMap(); };
    console.warn(e);
  }
}

/**
 * The building view is 3D (Hotel 0.3.2 rule: “… ต้องแสดง 2-point perspective ของ 3d building mass ทุกกรณี”): a
 * registration or a building chosen on the flat map turns the map 3D, as the 3D button does (the caller updates the layers and
 * frames the building). Returns true when it switched.
 */
function ensure3d() {
  if (state.view3d) return false;
  state.view3d = true;
  $('toggle-3d').setAttribute('aria-pressed', 'true');
  renderLegend();
  return true;
}

function toggle3d() {
  state.view3d = !state.view3d;
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  renderLegend();
  updateSpatialLayers();
  if (state.map) {
    // A building being looked at is framed again (two-point in 3D, the same box flat in 2D).
    if (!frameFocus()) applyPreset(state.map, cameraPreset(), {animate: animate()});
    state.lastPreset = cameraPreset();
  }
  saveURL();
}

/* ---------- mobile sheet ---------- */
/**
 * Open the phone sheet. A building being looked at is framed again in the strip above it (`frame: false` when the
 * caller frames right after, so the camera moves once).
 */
function openMobilePanel({frame = true} = {}) {
  if (!mobilePortrait()) return;
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.add('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'true');
  $('map-aha').hidden = true;
  if (frame && !wasOpen && state.loaded && twoPoint()) frameFocus();
}
function closeMobilePanel() {
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.remove('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'false');
  if (mobilePortrait()) {
    $('mobile-panel').focus({preventScroll: true});
    if (state.panel.mode === 'overview') renderPanel();
    else if (wasOpen && state.loaded && state.panel.mode === 'area') { const a = areaById(state.panel.id); if (a) fitRecord(a); }
    // The building fills the larger map again.
    else if (wasOpen && state.loaded && twoPoint()) frameFocus();
    updateSpatialLayers();
  }
}

/* ---------- data loading ---------- */
function validFeatureCollection(value) {
  if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)) return false;
  const position = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const ring = r => Array.isArray(r) && r.length >= 4 && r.every(position);
  const polygon = p => Array.isArray(p) && p.length > 0 && p.every(ring);
  return value.features.every(f => {
    const g = f?.geometry, id = f?.id ?? f?.properties?.id;
    return f?.type === 'Feature' && (typeof id === 'string' || typeof id === 'number') && (g?.type === 'Polygon' ? polygon(g.coordinates) : g?.type === 'MultiPolygon' && g.coordinates.every(polygon));
  });
}

async function fetchJSON(resource, {timeout = 20000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(resource, {signal: controller.signal, cache: 'no-cache'});
    if (!r.ok) { const e = new Error('โหลดข้อมูลไม่สำเร็จ'); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) { e.resource = resource; e.phase = 'data'; throw e; }
  finally { clearTimeout(timer); }
}

/** Replace a select's options after its first (empty) one. */
function setOptions(id, items) {
  const s = $(id), keep = s.value;
  while (s.options.length > 1) s.remove(1);
  for (const [value, label] of items) { const o = document.createElement('option'); o.value = value; o.textContent = label; s.append(o); }
  s.value = [...s.options].some(o => o.value === keep) ? keep : '';
}

/** Option labels carry their registration counts (the dataset is one population: counted once at start). */
function refreshOptionCounts() {
  const groups = new Map(), provinces = new Map(), classes = new Map(), sizes = new Map();
  for (const r of state.data.rows) {
    groups.set(r.groupId, (groups.get(r.groupId) || 0) + 1);
    if (r.province) provinces.set(r.province, (provinces.get(r.province) || 0) + 1);
    if (r.cls) classes.set(r.cls.id, (classes.get(r.cls.id) || 0) + 1);
    if (r.size) sizes.set(r.size, (sizes.get(r.size) || 0) + 1);
    if (r.p90) sizes.set('p90', (sizes.get('p90') || 0) + 1);
  }
  setOptions('group', state.data.families.map(g => [g.id, `${g.th} (${num(groups.get(g.id) || 0)})`]));
  setOptions('size', SIZE_FILTERS.filter(b => sizes.get(b.id)).map(b => [b.id, `${b.th} (${num(sizes.get(b.id) || 0)})`]));
  setOptions('province', [...provinceList()].sort((a, b) => COLLATOR.compare(a.th, b.th)).map(p => [p.code, `${p.th} (${num(provinces.get(p.code) || 0)})`]));
  setOptions('cls', state.data.classes.filter(c => classes.get(c.id)).map(c => [c.id, `${c.th} (${num(classes.get(c.id) || 0)})`]));
  $('category-items').innerHTML = state.data.families.map(g => `<span>${cueMarkup(g.series)}${esc(g.th)}</span>`).join('');
  // The closed key shows the shapes themselves (symbols before words).
  $('category-cues').innerHTML = state.data.families.map(g => cueMarkup(g.series)).join('');
}

function restoreFromURL() {
  const p = nav.read();
  for (const f of FIELDS) if (p.has(f)) { const v = f === 'province' ? provinceCodeFrom(p.get(f)) : p.get(f); if (f === 'search' || [...($(f).options || [])].some(o => o.value === v)) $(f).value = v; }
  if (['areas', 'mix', 'industries'].includes(p.get('view'))) state.view = p.get('view');
  if (p.get('metric') === 'count') state.metric = 'count';
  if (p.get('area') && areaById(p.get('area'))) state.selectedArea = p.get('area');
  const areas = p.get('areas') || '';
  if (areas === 'all') { state.autoFocus = false; state.focusAreaIds = []; }
  else state.focusAreaIds = [...new Set(areas.split(','))].filter(id => areaById(id)).slice(0, 3);
  state.view3d = p.get('view3d') !== '0';
  if (state.selectedArea) state.panel = {mode: 'area', id: state.selectedArea};
  const factory = p.get('factory') && rowById(p.get('factory'));
  if (factory) state.panel = {mode: 'factory', id: factory.id};
}

/** Browser back / forward (citymeter-shell): show the level the restored address names. */
function restoreFromHistory() {
  for (const f of FIELDS) $(f).value = '';
  Object.assign(state, {view: 'areas', metric: 'workers', selectedArea: '', focusAreaIds: [], autoFocus: true, panel: overviewPanel(), history: [], buildingSel: null});
  restoreFromURL();
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  update({fit: true});
}

function wireEvents() {
  let timer;
  for (const f of FIELDS) $(f).addEventListener(f === 'search' ? 'input' : 'change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.focusAreaIds = [];
      state.history = [];
      if (f === 'province') state.selectedArea = '';
      state.panel = state.selectedArea ? {mode: 'area', id: state.selectedArea} : overviewPanel();
      update({fit: true});
    }, f === 'search' ? 450 : 0);
  });
  $('filters').addEventListener('reset', () => setTimeout(resetToOverview, 0));
  // Measure switch (radio group): click, or arrow keys between the two options.
  const metrics = [...document.querySelectorAll('[data-metric]')];
  metrics.forEach((b, i) => {
    b.onclick = () => setMetric(b.dataset.metric);
    b.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const next = metrics[(i + 1) % metrics.length];
      next.focus(); setMetric(next.dataset.metric);
    });
  });
  $('panel-view').addEventListener('click', onPanelAction);
  $('filter-chips').addEventListener('click', onPanelAction);
  $('map-aha').addEventListener('click', onPanelAction);
  $('crumbs').addEventListener('click', onPanelAction);

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

  $('fit-map').onclick = () => { if (state.map) fitMap(); };
  // ทั้งประเทศ = the whole country with every district filled: no province filter, no focus (?areas=all).
  $('country-map').onclick = () => {
    $('province').value = '';
    state.autoFocus = false; state.focusAreaIds = []; state.selectedArea = '';
    state.panel = overviewPanel(); state.history = [];
    update({fit: true});
    announce('ทั้งประเทศ · ทุกพื้นที่');
  };
  $('toggle-3d').onclick = toggle3d;
  $('toggle-neighborhoods').onclick = () => { state.showAreas = !state.showAreas; $('toggle-neighborhoods').setAttribute('aria-pressed', String(state.showAreas)); updateSpatialLayers(); };
  $('mobile-panel').onclick = () => { $('panel').classList.contains('is-open') ? closeMobilePanel() : openMobilePanel(); };
  $('close-mobile-panel').onclick = closeMobilePanel;
  document.querySelector('.skip').onclick = () => { openMobilePanel(); $('dataset-title').focus(); };
  $('toggle-insights').onclick = () => openInsights($('insight-content').hidden);
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncBottomPanel).observe($('insights')); else window.addEventListener('resize', syncBottomPanel);
  $('open-table').onclick = () => { $('results').hidden = false; if (renderTable.stale) renderTable(); closeMobilePanel(); $('toggle-table').focus(); };
  $('toggle-table').onclick = () => { $('results').hidden = true; $('open-table').focus(); };
  $('prev-page').onclick = () => { state.page--; renderTable(); };
  $('next-page').onclick = () => { state.page++; renderTable(); };
  $('theme').onchange = applyTheme;
  const colorMedia = matchMedia('(prefers-color-scheme: dark)');
  const onColorChange = () => { if ($('theme').value === 'auto') applyTheme(); };
  if (colorMedia.addEventListener) colorMedia.addEventListener('change', onColorChange); else colorMedia.addListener(onColorChange);
  matchMedia('(max-width: 760px) and (orientation: portrait)').addEventListener?.('change', () => { if (!mobilePortrait()) $('panel').classList.remove('is-open'); renderPanel(); });
}

async function init() {
  try {
    const [rowsJSON, indexJSON, provincesJSON] = await Promise.all([
      // Every registration of the registry (~1.9 MB over the wire, gzip): a slow phone link still gets there.
      fetchJSON('data/factories.json', {timeout: 90000}),
      fetchJSON('data/area-index.json', {timeout: 30000}),
      fetchJSON('data/provinces.geojson', {timeout: 30000}).catch(e => { console.warn('Province frames unavailable', e); return null; }),
    ]);
    if (!Array.isArray(indexJSON?.provinces) || !indexJSON.provinces.length || !Array.isArray(indexJSON?.areas?.id)) {
      const e = new Error('Invalid area index'); e.resource = 'data/area-index.json'; e.phase = 'data-schema'; throw e;
    }
    setProvinces(indexJSON.provinces);
    state.index = buildAreaIndex(indexJSON);
    state.provincesGeo = validFeatureCollection(provincesJSON) ? provincesJSON : {type: 'FeatureCollection', features: []};
    state.data = decodeDataset(rowsJSON, state.index);
    if (state.data.dropped) console.warn('Rows outside the area index', state.data.dropped);
    state.rowById = new Map(state.data.rows.map(r => [r.id, r]));
    state.frames = createFrameStore({index: state.index, fetchJSON, version: RELEASE, onLoad: onFramesLoaded,
      onError: (code, e) => { console.warn('Province outlines unavailable', code, e); $('map-status').dataset.framesError = code; }});
    // Buildings per area (owner 2026-11-01, point 3): which อปท./เขต draw CityMETER Building V4 (js/shell/building-units.js).
    state.buildingUnits = createBuildingUnitStore({fetchJSON, version: RELEASE, onLoad: () => { if (state.loaded) updateSpatialLayers(); },
      onError: (code, e) => { console.warn('Building units unavailable', code, e); if (state.loaded) updateSpatialLayers(); }});
    state.buildingUnits.loadIndex();

    refreshOptionCounts();
    restoreFromURL();
    $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
    try { $('theme').value = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
    applyTheme();
    wireEvents();
    update();
    if (state.panel.mode !== 'overview') openMobilePanel();
    window.dispatchEvent(new CustomEvent('citymeter:ready'));
    startMap();
  } catch (e) {
    window.dispatchEvent(new CustomEvent('citymeter:load-error', {detail: {message: 'โหลดข้อมูลโรงงานไม่สำเร็จ กรุณาลองอีกครั้ง', resource: e.resource, status: e.status, phase: e.phase || 'startup', diagnostic: e.message}}));
    console.error(e);
  }
}

// Developer hook for live tuning in a browser console (not an API; may change without notice).
window.__citymeter = {state, get map() { return state.map; }, update, fitMap, updateSpatialLayers, applyPreset: (name, opts) => state.map && applyPreset(state.map, name, opts), fitPitched: (b, opts) => state.map && fitPitched(state.map, b, opts), cameraPadding, visibleBox, focusTarget: () => focusTarget(), focusShape: () => focusShape(), frameFocus, selectFactory, selectBuilding, buildingRows, setMetric, buildMapStyle};

init();
