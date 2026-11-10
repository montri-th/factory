#!/usr/bin/env python3
"""Factory sites for the map (release 0.7.0): data/factory-sites.json from the research site rows.

Owner 2026-11-10 07:37 “ของเรา join ได้อาคารเล็กๆมานิดเดียวไม่ได้ทั้งกลุ่มอาคารทั้งหมดของโรงงาน ทำไงดี” and 08:17
“อนุมัติครับ” to boundary_source `osm_polygon_auto`: a registration whose published point lies in an OpenStreetMap
factory area (man_made=works, landuse=industrial or industrial=*; not estate-wide; 1,000 m² – 5 km²; no other
published point of this dataset inside; not named for another company) is joined with the CityMETER Building V4
buildings whose interior point lies in that area (a building mostly outside it dropped, one mostly inside added; two
buildings or more). The rows are checked by rule, not against a factory layout or imagery (`checked_by` Claude
(ตรวจอัตโนมัติ)); a layout check later turns a row into `osm_polygon+site_layout`.

The rows (one per registration: fid, boundary_status, boundary_source, boundary_evidence_url, buildings_in_boundary,
building_count, checked_on, osm_base …) are read from a CSV (--sites): the research site tab's export, or the run's
rows while the tab is written. Only `checked` rows of an approved source are published, as the interior points of the
site's buildings; the area itself, the OSM names and the notes stay in the research files (ODbL derivative data:
© OpenStreetMap contributors, credited on the page).

usage: python3 -I scripts/build-sites.py --sites <rows.csv> [--out data/factory-sites.json]
"""
import csv
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = 'factory-sites/1.0.0'
SITE_MAX_M = 1000   # a site building this far from the registration's own point is a row error, not a site
SITE_SOURCES = {    # boundary_source codes the owner approved → the words the panel and the provenance line use
    'osm_polygon_auto': 'กรอบ OpenStreetMap (ตรวจอัตโนมัติ)',
}
CREDITS = {
    'osm_polygon_auto': {'text': '© OpenStreetMap contributors', 'url': 'https://www.openstreetmap.org/copyright', 'licence': 'ODbL 1.0'},
}
EVIDENCE = re.compile(r'^https://www\.openstreetmap\.org/(way|relation)/\d+$')
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
BASE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')


def fail(msg):
    sys.exit(f'STOP: {msg}')


def points_of(fid, text):
    pts = []
    for part in (text or '').split(';'):
        part = part.strip()
        if not part:
            continue
        try:
            lon, lat = (float(x) for x in part.split(','))
        except ValueError:
            fail(f'{fid}: buildings_in_boundary entry {part!r} is not "lon,lat"')
        if not (97 <= lon <= 106 and 5 <= lat <= 21):
            fail(f'{fid}: buildings_in_boundary entry {part!r} lies outside Thailand')
        pts.append([round(lon, 6), round(lat, 6)])
    return pts


def main(argv):
    opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    sites_path = opt('--sites')
    out_path = Path(opt('--out', str(ROOT / 'data' / 'factory-sites.json')))
    if not sites_path:
        sys.exit(__doc__)
    cols = json.load(open(ROOT / 'data' / 'factories.json', encoding='utf-8'))['cols']
    at = {k: i for i, k in enumerate(cols['key'])}
    csv.field_size_limit(10 ** 9)
    rows = list(csv.DictReader(open(sites_path, encoding='utf-8')))
    sites, bases, checked = {}, set(), set()
    for r in rows:
        fid = (r.get('fid') or '').strip()
        if r.get('boundary_status') != 'checked':
            continue
        src = r.get('boundary_source', '')
        if src not in SITE_SOURCES:
            fail(f'{fid}: boundary_source {src!r} is not approved for this dataset ({", ".join(SITE_SOURCES)})')
        if fid not in at:
            fail(f'{fid}: not a registration of data/factories.json')
        i = at[fid]
        lon0, lat0 = cols['lon'][i], cols['lat'][i]
        if cols['person'][i] or not isinstance(lon0, (int, float)) or not isinstance(lat0, (int, float)):
            fail(f'{fid}: the registration has no published point (a site is drawn round its point)')
        if fid in sites:
            fail(f'{fid}: two checked rows')
        url = (r.get('boundary_evidence_url') or '').strip()
        if src.startswith('osm_') and not EVIDENCE.match(url):
            fail(f'{fid}: boundary_evidence_url {url!r} is not an OpenStreetMap way or relation page')
        pts = points_of(fid, r.get('buildings_in_boundary'))
        if len(pts) < 2:
            fail(f'{fid}: {len(pts)} building (one building is not a site)')
        kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
        far = max(math.hypot((x - lon0) * kx, (y - lat0) * ky) for x, y in pts)
        if far > SITE_MAX_M:
            fail(f'{fid}: a site building lies {far:.0f} m from the registration point (more than {SITE_MAX_M} m)')
        try:
            n = int(r.get('building_count') or len(pts))
        except ValueError:
            fail(f'{fid}: building_count {r.get("building_count")!r} is not a number')
        if n < len(pts):
            fail(f'{fid}: building_count {n} is under the {len(pts)} points listed')
        on = (r.get('checked_on') or '').strip()
        if not DATE.match(on):
            fail(f'{fid}: checked_on {on!r} is not YYYY-MM-DD')
        base = (r.get('osm_base') or '').strip()
        if src.startswith('osm_'):
            if not BASE.match(base):
                fail(f'{fid}: osm_base {base!r} is not the OpenStreetMap data time (YYYY-MM-DDTHH:MM:SSZ)')
            bases.add(base)
        checked.add(on)
        sites[fid] = {'src': src, 'n': n, 'on': on, 'url': url, 'pts': pts}
    if len(bases) > 1:
        fail(f'rows of more than one OpenStreetMap read ({sorted(bases)}): publish one read at a time')
    base = next(iter(bases), '')
    doc = {'meta': {
        'contract': CONTRACT,
        'what': 'Factory sites: the interior points of the CityMETER Building V4 buildings inside the OpenStreetMap '
                'factory area that holds a registration\'s published point (research site rows, checked by rule)',
        'rule': 'boundary_source osm_polygon_auto (owner 2026-11-10 08:17): the smallest man_made=works, landuse=industrial '
                'or industrial=* area holding the pin, not a building, not estate-wide, 1,000 m² – 5 km², no other published '
                'point of this dataset inside, unnamed or named for the registration; buildings whose interior point lies in '
                'it (mostly outside dropped, mostly inside added), two or more',
        'sources': {k: v for k, v in SITE_SOURCES.items() if any(s['src'] == k for s in sites.values())},
        'credits': {k: v for k, v in CREDITS.items() if any(s['src'] == k for s in sites.values())},
        'osmBase': base, 'osmOn': base[:10], 'checkedOn': max(checked) if checked else '',
        'siteMaxM': SITE_MAX_M, 'count': len(sites), 'buildings': sum(s['n'] for s in sites.values()),
    }, 'sites': {k: sites[k] for k in sorted(sites)}}
    out_path.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'out': str(out_path), 'sites': len(sites), 'buildings': doc['meta']['buildings'], 'osmBase': base,
                      'bytes': out_path.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1:])
