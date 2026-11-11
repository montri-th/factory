/**
 * This demo's navigation on the shared header code: the titles of its controls and its pictogram subset. The
 * nav-7 glyphs and the help dialog are js/shell/navigation.js, the dataset picker js/shell/header.js
 * (citymeter-shell: edit those in every repository at once, js/shell/manifest.json).
 */
import {installNavigation, NAV_GLYPHS, NAV_ICON_CONTRACT} from './shell/navigation.js';
import {installHeader} from './shell/header.js';

export {NAV_GLYPHS, NAV_ICON_CONTRACT};

/**
 * Metric-tile pictograms (test exception approved by the owner 2026-10-22 for the
 * Luxury Brands demo; this demo builds its own subset from the same source font with
 * scripts/build-pictogram-font.py; to be registered in LDS if it proves itself). Same family and axes as nav-7, a
 * separate subset so the approved nav-7 bytes stay unchanged. Glyph → meaning in Factory:
 * factory = โรงงาน (registrations, ทะเบียน) · workers (groups) = คนงาน · area (map) = เขต/อำเภอ · province
 * (location_city) = จังหวัด · segment (category) = อุตสาหกรรม · estate (warehouse) = นิคม สวน เขตอุตสาหกรรม · status
 * (fact_check) = สถานะตามกระทรวงอุตสาหกรรม · class (badge) = จำพวกโรงงาน · compare (compare_arrows) = โรงงานใกล้เคียง
 * ขนาดใกล้กัน · building (apartment) = อาคาร · sea (waves) = ระยะถึงทะเล · elevation (landscape) = ความสูงพื้นดิน ·
 * relief (height) = ต่างระดับรอบจุด · forest = ต้นไม้รอบจุด · rank · date · distance (straight line) · dataset.
 */
export const PICTOGRAM_CONTRACT = Object.freeze({
  family: 'LDS Material Symbols Rounded Pictogram',
  file: 'assets/icons/material-pictogram-300.woff2', bytes: 3148,
  sha256: '267debecc08b8b278bb7888b15cafd6821bab4019f593104cfac5ece7cdd71ad',
  manifest: 'assets/icons/material-pictogram-300.json',
  axes: Object.freeze({FILL: 0, wght: 300, GRAD: 0, opsz: 24}),
  glyphs: Object.freeze({area: '\uE55B', province: '\uE7F1', segment: '\uE72C', ai: '\uE65F', streetview: '\uE56E', maps: '\uE0C8', building: '\uEA40',
    factory: '\uEBBC', workers: '\uF233', estate: '\uEBB8', status: '\uF0C5', class: '\uEA67', compare: '\uE915',
    sea: '\uE176', elevation: '\uE564', relief: '\uEA16', forest: '\uEA99',
    rank: '\uF20C', date: '\uE878', distance: '\uE41C', dataset: '\uF20E'}),
  status: 'test exception to LDS nav-7 (owner 2026-10-22; action and building glyphs 2026-10-29; terrain glyphs 2026-11-01; rank, date, distance and dataset glyphs 2026-11-01 for short copy; factory, workers, estate, status and class glyphs 2026-11-05 for CityMETER Factory)',
  fallback: 'Text labels carry the meaning; pictograms stay hidden until the font has loaded.',
});
const TITLES = {
  'fit-map': 'ปรับแผนที่ให้เห็นพื้นที่ที่โฟกัสหรือพื้นที่ที่เลือก',
  'country-map': 'ดูทั้งประเทศรายจังหวัด',
  'toggle-3d': 'สลับ 3 มิติ / 2 มิติ',
  'toggle-neighborhoods': 'แสดงหรือซ่อนสีและขอบเขตเขต/อำเภอ',
  'close-mobile-panel': 'กลับไปแผนที่',
  'sheet-back': 'กลับไปหน้าก่อน',
  'mobile-panel': 'เปิดแผงข้อมูลและตัวกรอง',
  'open-help': 'เปิดวิธีใช้',
  'open-help-sheet': 'เปิดวิธีใช้',
  'toggle-insights': 'เปิดหรือย่อกราฟเปรียบเทียบพื้นที่',
  'open-table': 'เปิดตารางโรงงานตามตัวกรอง',
  'toggle-table': 'ปิดตารางและกลับไปแผนที่',
  'search': 'ค้นหาชื่อโรงงาน ผู้ประกอบการ ประเภท อุตสาหกรรม เขต/อำเภอ จังหวัด หรือเลขทะเบียน',
  'group': 'กรองตามอุตสาหกรรม',
  'size': 'กรองตามขนาด (จำนวนคนงาน)',
  'province': 'กรองตามจังหวัด',
  'cls': 'กรองตามหน้าที่ของโรงงาน (ผลิต บริการ อื่น ๆ)',
  'prev-page': 'ดูหน้าก่อนหน้าของตาราง',
  'next-page': 'ดูหน้าถัดไปของตาราง',
  'tab-areas': 'เปรียบเทียบคนงานหรือโรงงานของแต่ละเขต/อำเภอ',
  'tab-mix': 'ดูอุตสาหกรรมในแต่ละเขต/อำเภอ',
  'tab-industries': 'เปรียบเทียบคนงานหรือโรงงานของแต่ละกลุ่มอุตสาหกรรม',
};

if (typeof document !== 'undefined') {
  installNavigation({titles: TITLES, pictogramProbe: PICTOGRAM_CONTRACT.glyphs.factory});
  installHeader();
}
