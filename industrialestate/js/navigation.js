/**
 * This demo's navigation on the shared header code: the titles of its controls and its pictogram subset. The nav-7
 * glyphs and the help dialog are js/shell/navigation.js, the dataset picker js/shell/header.js (citymeter-shell: edit
 * those in every repository at once, js/shell/manifest.json).
 */
import {installNavigation, NAV_GLYPHS, NAV_ICON_CONTRACT} from './shell/navigation.js';
import {installHeader} from './shell/header.js';

export {NAV_GLYPHS, NAV_ICON_CONTRACT};

/**
 * Metric-tile pictograms: the same subset font as CityMETER Factory (assets/icons/material-pictogram-300.woff2, built by
 * Factory's scripts/build-pictogram-font.py from Material Symbols Rounded; a test exception to LDS nav-7 approved by the
 * owner 2026-10-22). Glyph → meaning here: estate (warehouse) = นิคม สวน เขตอุตสาหกรรม · factory = รายชื่อในทำเนียบ /
 * ทะเบียนโรงงาน · compare = ชื่อตรงกับทะเบียนโรงงาน · distance = รอบนิคม 3 กม. (straight line) · province = จังหวัด ·
 * area (map) = ขอบเขต · segment = ประเภท · building = ผู้พัฒนา · date · dataset · ai · maps.
 */
export const PICTOGRAM_CONTRACT = Object.freeze({
  family: 'LDS Material Symbols Rounded Pictogram',
  file: 'assets/icons/material-pictogram-300.woff2', bytes: 3148,
  sha256: '267debecc08b8b278bb7888b15cafd6821bab4019f593104cfac5ece7cdd71ad',
  manifest: 'assets/icons/material-pictogram-300.json',
  axes: Object.freeze({FILL: 0, wght: 300, GRAD: 0, opsz: 24}),
  glyphs: Object.freeze({area: '', province: '', segment: '', ai: '', streetview: '', maps: '', building: '',
    factory: '', workers: '', estate: '', status: '', class: '', compare: '',
    sea: '', elevation: '', relief: '', forest: '',
    rank: '', date: '', distance: '', dataset: ''}),
  status: 'the CityMETER Factory subset, unchanged (same bytes)',
  fallback: 'Text labels carry the meaning; pictograms stay hidden until the font has loaded.',
});
const TITLES = {
  'fit-map': 'ปรับแผนที่ให้เห็นนิคมที่โฟกัสหรือที่เลือก',
  'country-map': 'ดูนิคมทั้งประเทศ',
  'toggle-around': 'แสดงหรือซ่อนโรงงานรอบนิคม (CityMETER Factory)',
  'toggle-3d': 'สลับ 3 มิติ / 2 มิติ',
  'mobile-panel': 'เปิดแผงข้อมูลและตัวกรอง',
  'open-help': 'เปิดวิธีใช้',
  'open-help-sheet': 'เปิดวิธีใช้',
  'toggle-insights': 'เปิดหรือย่อกราฟเปรียบเทียบจังหวัด',
  'open-table': 'เปิดตารางนิคมตามตัวกรอง',
  'toggle-table': 'ปิดตารางและกลับไปแผนที่',
  'search': 'ค้นหาชื่อนิคม ชื่ออื่น ผู้พัฒนา หรือจังหวัด',
  'type': 'กรองตามประเภท',
  'province': 'กรองตามจังหวัด',
  'outline': 'กรองตามขอบเขตบนแผนที่',
  'listed': 'กรองตามรายชื่อในทำเนียบ กนอ.',
  'prev-page': 'ดูหน้าก่อนหน้าของตาราง',
  'next-page': 'ดูหน้าถัดไปของตาราง',
  'tab-provinces': 'เปรียบเทียบจำนวนรายการของแต่ละจังหวัด',
  'tab-developers': 'เปรียบเทียบผู้พัฒนาและเครือ',
};

if (typeof document !== 'undefined') {
  installNavigation({titles: TITLES, pictogramProbe: PICTOGRAM_CONTRACT.glyphs.estate});
  installHeader();
}
