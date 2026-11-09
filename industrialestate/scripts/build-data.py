#!/usr/bin/env python3
"""Build CityMETER · Industrial Estate data from the industrial-estate research master.

Inputs (never committed: the research sheet export and the boundary bundle stay outside the repository):
  --sheet    the Research Master exported as .xlsx ("CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม
             106 รายการ — Research Master 2026-10-25"), tabs DEMO_CATALOG, DEMO_BOUNDARIES, DEMO_FACTORY_LINKS,
             DEMO_FID_CANDIDATES, DEMO_LINK_SUMMARY, LOGO_LIBRARY, 01_ESTATES, 12_ALIASES
  --r7       industrial-boundary-research-r7-20261026.geojson (the boundary bundle DEMO_BOUNDARIES names in
             source_bundle_sha256); only the 46 features DEMO_BOUNDARIES selects for the demo are read
  --logos    folder of display copies made by scripts/build-logos.py (logo manifest included)
  --factory  ../data/factories.json of CityMETER Factory (rows with a published point, for the around-estate set)
  --index    ../data/area-index.json (production province codes and names)

Outputs:
  data/estates.json          the 106 catalogue records (one row = one approved catalogue record, not one legal estate)
  data/boundaries.geojson    the 46 OpenStreetMap source snapshots the master selected for the demo (ODbL)
  data/directory.json        IEAT directory names by estate (loaded when a panel needs them) and FID candidates
  ../data/estate-context.json  what CityMETER Factory reads: estates, outlines and the FID → estate name candidates

Meaning (registry P01/P03 contracts, industrial-estate-demo/1.0.0):
  - estate_record_count: distinct estate_id; 106 records are catalogue records, not legal estates or sites.
  - source_directory_record_count: distinct directory_id with default_estate_directory_eligible = true per estate
    (6,811 across 56 estates); 48 ambiguous and 78 unaffiliated records are kept apart, never added to an estate.
    An estate with no linked record in this snapshot is `none` — never a measured zero.
  - candidate_fid_count: distinct target_fid per estate from DEMO_FID_CANDIDATES (name candidates only); never a
    factory count, never summed across estates.
  - verified_factory_count: null / no_data for every record.
  - Province is the source label; no point-in-polygon assignment of anything.
"""
import argparse
import hashlib
import json
import math
import re
from datetime import date, datetime
from pathlib import Path

import openpyxl

TYPES = [
    {'id': 'estate', 'th': 'นิคมอุตสาหกรรม', 'en': 'Industrial estate'},
    {'id': 'park', 'th': 'สวนอุตสาหกรรม', 'en': 'Industrial park'},
    {'id': 'zone', 'th': 'เขตอุตสาหกรรม', 'en': 'Industrial zone'},
]
TYPE_INDEX = {t['th']: i for i, t in enumerate(TYPES)}
# DEMO_BOUNDARIES.demo_boundary_status → what the page says when no outline is drawn (DATA_METHOD.md §3).
BOUNDARY_STATES = {
    'demo_source_snapshot_ready': 'shown',
    'hold_existing_scope_or_identity_conflict': 'hold',
    'hold_specific_scope_or_identity': 'scope',
    'missing_whole_candidate': 'missing',
    'hold_no_eligible_licensed_whole_source': 'license',
}
AROUND_KM = 3.0
PERSON = re.compile(r'^\s*(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?\s|mrs\.?\s|ms\.?\s|miss\s)', re.I)
EXCLUDED_FIELDS = [
    'directory names written as a natural person\'s (shown as ผู้ประกอบการบุคคลธรรมดา, never sent to Google)',
    'source_record_id and IEAT directory detail URLs per company',
    'review notes, hold reasons by review id, candidate geometry ids other than the demo selection',
    'geometry area (QA only in the master, not an official area)',
    'parcel or contact data of any source',
    'internal Drive / Sheet URLs',
]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def tab(wb, name):
    rows = [r for r in wb[name].iter_rows(values_only=True) if any(c not in (None, '') for c in r)]
    head = rows[0]
    return [dict(zip(head, r)) for r in rows[1:]]


def iso(value):
    if value is None or value == '':
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime('%Y-%m-%d')
    text = str(value).strip()
    m = re.match(r'(\d{4}-\d{2}-\d{2})', text)
    return m.group(1) if m else text


def num(value):
    if value is None or value == '':
        return None
    return int(round(float(value)))


def clean(text):
    return re.sub(r'\s+', ' ', str(text or '')).strip()


# ---------- geometry (planar, metres in a local equirectangular frame) ----------
def to_xy(lon, lat, lat0):
    return (lon * 111320.0 * math.cos(math.radians(lat0)), lat * 110574.0)


def dp(points, tol):
    """Douglas–Peucker on a ring of (x, y, lon, lat); keeps the first and last point."""
    if len(points) < 3:
        return points
    stack, keep = [(0, len(points) - 1)], {0, len(points) - 1}
    while stack:
        a, b = stack.pop()
        ax, ay = points[a][0], points[a][1]
        bx, by = points[b][0], points[b][1]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        best, index = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i][0], points[i][1]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm if norm > 1e-9 else math.hypot(px - ax, py - ay)
            if d > best:
                best, index = d, i
        if best > tol and index > 0:
            keep.add(index)
            stack += [(a, index), (index, b)]
    return [points[i] for i in sorted(keep)]


def simplify_ring(ring, lat0, tol):
    pts = [(*to_xy(lon, lat, lat0), lon, lat) for lon, lat in ring]
    if pts[0][2:] != pts[-1][2:]:
        pts.append(pts[0])
    out = dp(pts, tol)
    if len(out) < 4:
        out = pts if len(pts) >= 4 else out
    coords = [[round(p[2], 6), round(p[3], 6)] for p in out]
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    return coords


def polygons_of(geometry):
    if geometry['type'] == 'Polygon':
        return [geometry['coordinates']]
    if geometry['type'] == 'MultiPolygon':
        return geometry['coordinates']
    raise ValueError(f"unexpected geometry {geometry['type']}")


def simplify(geometry, tol):
    polys = polygons_of(geometry)
    lat0 = sum(c[1] for c in polys[0][0]) / len(polys[0][0])
    out = []
    for poly in polys:
        rings = [simplify_ring(r, lat0, tol) for r in poly]
        rings = [r for r in rings if len(r) >= 4]
        if rings:
            out.append(rings)
    if len(out) == 1:
        return {'type': 'Polygon', 'coordinates': out[0]}
    return {'type': 'MultiPolygon', 'coordinates': out}


def bbox(geometry):
    xs, ys = [], []
    for poly in polygons_of(geometry):
        for ring in poly:
            for lon, lat in ring:
                xs.append(lon)
                ys.append(lat)
    return [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)]


def ring_area_xy(ring):
    return sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1)) / 2


def label_point(geometry):
    """A point inside the largest outer ring (area centroid when it falls inside, else the best interior sample)."""
    polys = polygons_of(geometry)
    lat0 = sum(c[1] for c in polys[0][0]) / len(polys[0][0])
    best = max(polys, key=lambda p: abs(ring_area_xy([to_xy(x, y, lat0) for x, y in p[0]])))
    ring = best[0]
    xy = [to_xy(x, y, lat0) for x, y in ring]
    a = ring_area_xy(xy) or 1e-9
    cx = sum((xy[i][0] + xy[i + 1][0]) * (xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1]) for i in range(len(xy) - 1)) / (6 * a)
    cy = sum((xy[i][1] + xy[i + 1][1]) * (xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1]) for i in range(len(xy) - 1)) / (6 * a)
    lon, lat = cx / (111320.0 * math.cos(math.radians(lat0))), cy / 110574.0
    if inside(lon, lat, best):
        return [round(lon, 6), round(lat, 6)]
    # Fallback: the midpoint of the longest horizontal chord through the bbox middle.
    b = bbox({'type': 'Polygon', 'coordinates': best})
    y = (b[1] + b[3]) / 2
    xs = sorted(x for x in _crossings(ring, y))
    best_mid, best_len = None, -1
    for i in range(0, len(xs) - 1, 2):
        if xs[i + 1] - xs[i] > best_len:
            best_len, best_mid = xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) / 2
    return [round(best_mid if best_mid is not None else (b[0] + b[2]) / 2, 6), round(y, 6)]


def _crossings(ring, y):
    for i in range(len(ring) - 1):
        (x1, y1), (x2, y2) = ring[i], ring[i + 1]
        if (y1 > y) != (y2 > y):
            yield x1 + (y - y1) * (x2 - x1) / (y2 - y1)


def in_ring(lon, lat, ring):
    hit = False
    for i in range(len(ring) - 1):
        (x1, y1), (x2, y2) = ring[i], ring[i + 1]
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def inside(lon, lat, poly):
    return in_ring(lon, lat, poly[0]) and not any(in_ring(lon, lat, h) for h in poly[1:])


def distance_m(lon, lat, geometry, lat0):
    """Straight-line distance from a point to the outline (0 when the point falls inside it)."""
    polys = polygons_of(geometry)
    if any(inside(lon, lat, p) for p in polys):
        return 0.0
    px, py = to_xy(lon, lat, lat0)
    best = float('inf')
    for poly in polys:
        for ring in poly:
            xy = [to_xy(x, y, lat0) for x, y in ring]
            for i in range(len(xy) - 1):
                (ax, ay), (bx, by) = xy[i], xy[i + 1]
                dx, dy = bx - ax, by - ay
                t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
                best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--r7', required=True)
    ap.add_argument('--logos', required=True)
    ap.add_argument('--factory', default=str(Path(__file__).resolve().parents[2] / 'data/factories.json'))
    ap.add_argument('--index', default=str(Path(__file__).resolve().parents[2] / 'data/area-index.json'))
    ap.add_argument('--out', default=str(Path(__file__).resolve().parents[1] / 'data'))
    ap.add_argument('--factory-out', default=str(Path(__file__).resolve().parents[2] / 'data/estate-context.json'))
    ap.add_argument('--built-on', default=date.today().isoformat())
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.sheet, read_only=True, data_only=True)
    catalog = tab(wb, 'DEMO_CATALOG')
    boundaries = {r['estate_id']: r for r in tab(wb, 'DEMO_BOUNDARIES')}
    links = tab(wb, 'DEMO_FACTORY_LINKS')
    candidates = tab(wb, 'DEMO_FID_CANDIDATES')
    summary = {r['estate_id']: r for r in tab(wb, 'DEMO_LINK_SUMMARY')}
    logos = {r['entity_id']: r for r in tab(wb, 'LOGO_LIBRARY')}
    master = {r['estate_id']: r for r in tab(wb, '01_ESTATES')}
    aliases = {}
    for r in tab(wb, '12_ALIASES'):
        if r['alias'] and r.get('alias_status') in ('source_supported', None, 'reviewed', 'accepted'):
            aliases.setdefault(r['estate_id'], []).append(clean(r['alias']))
    readme = {r['หัวข้อ']: r['รายละเอียด'] for r in tab(wb, 'DEMO_README')}

    index = json.loads(Path(args.index).read_text())
    prov_by_name = {p['name']: p for p in index['provinces']}
    r7 = json.loads(Path(args.r7).read_text())
    r7_by_version = {f['properties']['geometry_version_id']: f for f in r7['features']}
    logo_manifest = json.loads((Path(args.logos) / 'manifest.json').read_text())
    logo_by_sha = {x['sourceSha256']: x for x in logo_manifest['logos']}

    # ---------- factory rows with a published point (CityMETER Factory, same repository) ----------
    fdata = json.loads(Path(args.factory).read_text())
    cols = fdata['cols']
    fids = cols['key']
    fid_index = {k: i for i, k in enumerate(fids)}
    family_of_group = [g['family'] for g in fdata['groups']]
    points = [(i, cols['lon'][i], cols['lat'][i]) for i in range(len(fids)) if cols['lat'][i] is not None and cols['lon'][i] is not None]

    # ---------- estates ----------
    assert len(catalog) == 106, len(catalog)
    estates, features, factory_outlines = [], [], []
    around_points = {}
    shown = 0
    for c in catalog:
        eid = c['estate_id']
        pname = clean(c['province'])
        prov = prov_by_name.get(pname)
        assert prov, f'{eid}: province label {pname!r} has no production code'
        b = boundaries[eid]
        state = BOUNDARY_STATES[b['demo_boundary_status']]
        assert (state == 'shown') == bool(b['demo_selected']) == bool(c['demo_selected']), eid
        rec = {
            'id': eid,
            'name': clean(c['name_th']),
            'nameEn': clean(c['name_en']) or None,
            'type': TYPE_INDEX[clean(c['industrial_area_type'])],
            'province': prov['id'],
            'grain': 'campus' if 'campus' in (c['entity_grain'] or '') else 'listed',
            'ieat': (master.get(eid, {}).get('ieat_catalogue_membership') or '').startswith('พบ'),
            'url': c['source_url'] if str(c['source_url'] or '').startswith('https://') else None,
            'checkedOn': iso(c['source_checked_on']),
            'aliases': sorted(set(a for a in aliases.get(eid, []) if a and a != clean(c['name_th'])))[:6],
        }
        # Boundary: the master's demo selection only (current/legal boundary accepted: none).
        boundary = {'state': state}
        if state == 'shown':
            f = r7_by_version[b['demo_geometry_version_id']]
            p = f['properties']
            assert p['estate_id'] == eid and p.get('source_provider') == 'OpenStreetMap', eid
            geometry = simplify(f['geometry'], 1.5)
            light = simplify(f['geometry'], 6.0)
            boundary.update({
                'version': b['demo_geometry_version_id'],
                'osm': b['source_feature_id'],
                'osmVersion': num(b['source_version']),
                'snapshot': iso(b['source_snapshot_date']),
                'lastEdit': iso(b['source_last_edit_at']),
                'bbox': bbox(geometry),
                'label': label_point(geometry),
            })
            features.append({'type': 'Feature', 'id': len(features), 'properties': {'id': eid}, 'geometry': geometry})
            factory_outlines.append({'type': 'Feature', 'id': len(factory_outlines), 'properties': {'id': eid}, 'geometry': light})
            # Around-estate set: Factory registrations with a published point within AROUND_KM of the outline
            # (0 inside it). A distance set for context, never membership or tenancy.
            lat0 = boundary['label'][1]
            bx = boundary['bbox']
            pad_lat, pad_lon = AROUND_KM * 1000 / 110574.0, AROUND_KM * 1000 / (111320.0 * math.cos(math.radians(lat0)))
            near = [i for i, lon, lat in points if bx[0] - pad_lon <= lon <= bx[2] + pad_lon and bx[1] - pad_lat <= lat <= bx[3] + pad_lat
                    and distance_m(lon, lat, f['geometry'], lat0) <= AROUND_KM * 1000]
            workers = [cols['workers'][i] for i in near if cols['workers'][i] is not None]
            fam = {}
            for i in near:
                w = cols['workers'][i]
                fi = family_of_group[cols['group'][i]] if cols['group'][i] is not None else None
                if fi is None:
                    continue
                e = fam.setdefault(fi, [fi, 0, 0])
                e[1] += w or 0
                e[2] += 1
            rec['around'] = {
                'km': AROUND_KM, 'n': len(near), 'withWorkers': len(workers), 'workers': sum(workers),
                'families': sorted(fam.values(), key=lambda x: (-x[1], -x[2], x[0]))[:5],
            }
            around_points[eid] = sorted(near, key=lambda i: (-(cols['workers'][i] or 0), fids[i]))
            shown += 1
        rec['boundary'] = boundary

        # IEAT directory (snapshot of the listing; not a verified factory, tenant, company or operation count).
        s = summary[eid]
        n = num(c['source_directory_records'])
        rec['dir'] = {
            'state': 'measured' if c['directory_count_state'] == 'measured' and n else 'none',
            'n': n if c['directory_count_state'] == 'measured' and n else None,
            'cand': num(c['candidate_fid_count']) if num(c['candidate_fid_count']) else None,
            'withCand': num(c['with_current_candidate_records']) if num(c['with_current_candidate_records']) else None,
        }
        assert num(s['source_directory_records']) == (n or 0), eid
        assert c['accepted_count_state'] == 'no_data' and c['accepted_factory_count'] is None, eid

        # Logo: the master's role and label; a company or parent mark is labelled as such (owner 2026-11-10).
        lg = logos.get(eid)
        rec['logo'] = None
        if lg and lg['logo_sha256'] and lg['logo_sha256'] in logo_by_sha:
            asset = logo_by_sha[lg['logo_sha256']]
            rec['logo'] = {
                'file': asset['file'], 'w': asset['width'], 'h': asset['height'],
                'label': clean(lg['logo_label']), 'role': lg['fallback_status'], 'surface': lg['recommended_surface'] or 'any',
            }
        rec['logoLabel'] = clean(lg['logo_label']) if lg and lg['logo_label'] else None
        rec['logoRole'] = lg['fallback_status'] if lg else None
        rec['developer'] = clean(c['related_company_name']) or None
        rec['relation'] = c['company_relation_role'] or None
        estates.append(rec)
    assert shown == 46, shown

    # ---------- directory (default view: eligible records by estate; ambiguous and unaffiliated apart) ----------
    by_dir = {}
    for r in candidates:
        fid = str(r['target_fid'] or '').strip()
        if fid and fid in fid_index:
            by_dir.setdefault(r['source_record_key'], set()).add(fid)
    directory, apart = {}, {'ambiguous': 0, 'unaffiliated': 0}
    persons = 0
    for r in links:
        key = r['directory_id']
        name = clean(r['source_name_raw'])
        person = bool(PERSON.search(name))
        persons += person
        cand = sorted(by_dir.get(key, ()))
        if not r['default_estate_directory_eligible']:
            apart['ambiguous' if r['estate_label_status'] == 'scope_ambiguous' else 'unaffiliated'] += 1
            continue
        directory.setdefault(r['estate_display_id'], []).append([key.split(':', 1)[1], '' if person else name, [fid_index[f] for f in cand] if not person else []])
    for eid, rows in directory.items():
        rows.sort(key=lambda x: (x[1] == '', x[1]))
    counts = {eid: len(v) for eid, v in directory.items()}
    for rec in estates:
        if rec['dir']['state'] == 'measured':
            assert counts.get(rec['id']) == rec['dir']['n'], (rec['id'], counts.get(rec['id']), rec['dir']['n'])
        else:
            assert rec['id'] not in counts, rec['id']

    # FID → estates (default-estate candidate subset), for Factory.
    fid_estates = {}
    for r in candidates:
        fid, eid = str(r['target_fid'] or '').strip(), r['estate_display_id']
        if fid in fid_index and eid:
            fid_estates.setdefault(fid, set()).add(eid)
    est_index = {e['id']: i for i, e in enumerate(estates)}

    built = args.built_on
    meta = {
        'dataset': 'CityMETER Industrial Estate',
        'datasetTh': 'นิคม สวน และเขตอุตสาหกรรม',
        'registryId': 'research.TH.industrial_estates',
        'productId': 'industrialEstate',
        'contract': 'industrial-estate-demo/1.0.0',
        'sheetTitle': 'CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม 106 รายการ — Research Master 2026-10-25',
        'catalogCheckedOn': max(e['checkedOn'] for e in estates if e['checkedOn']),
        'directorySnapshotOn': '2026-11-04',
        'osmSnapshotOn': '2026-10-25',
        'candidatePeriod': '2025-12-31',
        'preparedOn': '2026-11-10',
        'builtOn': built,
        'counts': {
            'records': len(estates),
            'types': {t['id']: sum(e['type'] == i for e in estates) for i, t in enumerate(TYPES)},
            'provinces': len({e['province'] for e in estates}),
            'ieat': sum(e['ieat'] for e in estates),
            'outlines': shown,
            'boundaryStates': {s: sum(e['boundary']['state'] == s for e in estates) for s in BOUNDARY_STATES.values()},
            'directory': sum(counts.values()),
            'directoryEstates': len(counts),
            'directoryAll': len(links),
            'directoryApart': apart,
            'directoryPersons': persons,
            'candidateEdges': sum(1 for r in candidates if r['estate_display_id']),
            'candidateFids': len(fid_estates),
            'candidateFidsAll': len({str(r['target_fid']) for r in candidates}),
            'logos': sum(1 for e in estates if e['logo']),
            'logoFallback': sum(1 for e in estates if not e['logo']),
            'verifiedFactories': None,
        },
        'around': {'km': AROUND_KM, 'source': 'CityMETER Factory rows with a published point (data/factories.json of this repository)',
                   'rule': 'straight-line distance from the point to the OpenStreetMap outline ≤ 3 km (0 inside it); a context set, never membership'},
        'inputs': {
            'sheet': {'file': Path(args.sheet).name, 'sha256': sha256(args.sheet), 'tabs': ['DEMO_CATALOG', 'DEMO_BOUNDARIES', 'DEMO_FACTORY_LINKS', 'DEMO_FID_CANDIDATES', 'DEMO_LINK_SUMMARY', 'LOGO_LIBRARY', '01_ESTATES', '12_ALIASES', 'DEMO_README']},
            'r7': {'file': Path(args.r7).name, 'sha256': sha256(args.r7)},
            'factory': {'file': 'data/factories.json', 'sha256': sha256(args.factory)},
            'logos': {'manifest': 'assets/logos/manifest.json'},
            'demoPackage': {'file': 'industrial-estate-demo-prep-2026-11-10.zip', 'sha256': clean(readme.get('SHA-256 ของ ZIP', '')),
                            'note': 'Prepared bundle named in DEMO_README; read through the sheet tabs it was built from (the archive itself is larger than the Drive connector returns)'},
        },
        'excludedFields': EXCLUDED_FIELDS,
        'attribution': {'boundaries': '© OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright'},
    }
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'estates.json').write_text(json.dumps({'meta': meta, 'types': TYPES, 'estates': estates}, ensure_ascii=False, separators=(',', ':')) + '\n')
    (out / 'boundaries.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'attribution': meta['attribution']['boundaries'], 'features': features}, ensure_ascii=False, separators=(',', ':')) + '\n')
    (out / 'directory.json').write_text(json.dumps({
        'meta': {'snapshotOn': '2026-11-04', 'source': 'IEAT factory directory (ทำเนียบโรงงานในนิคมอุตสาหกรรม, ieat.go.th) as linked in DEMO_FACTORY_LINKS',
                 'candidatePeriod': '2025-12-31', 'fids': 'candidate FIDs are indexes into fids[] (CityMETER Factory keys)',
                 'person': 'an empty name is a natural person\'s, withheld', 'apart': apart},
        'fids': fids_used(directory, fids),
        'estates': remap(directory, fids),
    }, ensure_ascii=False, separators=(',', ':')) + '\n')

    # Around-estate points (lazy file): CityMETER Factory rows with a published point within AROUND_KM of an outline.
    used = sorted({i for v in around_points.values() for i in v})
    slot = {i: k for k, i in enumerate(used)}
    (out / 'around.json').write_text(json.dumps({
        'meta': {'source': 'CityMETER Factory data/factories.json (same repository)', 'km': AROUND_KM, 'rule': meta['around']['rule'],
                 'row': '[slot, workers|null, family index|null] per estate, heaviest first; slot indexes rows[]',
                 'families': [f['th'] for f in fdata['families']], 'familiesEn': [f['en'] for f in fdata['families']]},
        'rows': [[fids[i], cols['name'][i], round(cols['lon'][i], 6), round(cols['lat'][i], 6)] for i in used],
        'estates': {eid: [[slot[i], cols['workers'][i], family_of_group[cols['group'][i]] if cols['group'][i] is not None else None] for i in v]
                    for eid, v in sorted(around_points.items())},
    }, ensure_ascii=False, separators=(',', ':')) + '\n')

    # ---------- Factory context ----------
    context = {
        'meta': {'dataset': meta['dataset'], 'registryId': meta['registryId'], 'contract': meta['contract'], 'builtOn': built,
                 'directorySnapshotOn': meta['directorySnapshotOn'], 'osmSnapshotOn': meta['osmSnapshotOn'], 'candidatePeriod': meta['candidatePeriod'],
                 'around': meta['around'], 'attribution': meta['attribution'], 'counts': {'records': len(estates), 'outlines': shown, 'candidateFids': len(fid_estates)}},
        'types': TYPES,
        'estates': [{k: e[k] for k in ('id', 'name', 'nameEn', 'type', 'province', 'url', 'logoLabel')} | {
            'outline': e['boundary']['state'] == 'shown', 'bbox': e['boundary'].get('bbox'), 'label': e['boundary'].get('label'),
            'dir': e['dir']['n'], 'logo': {k: e['logo'][k] for k in ('file', 'w', 'h', 'surface')} if e['logo'] else None,
            'logoRole': e['logoRole']} for e in estates],
        'outlines': {'type': 'FeatureCollection', 'features': [{**f, 'properties': {'i': est_index[f['properties']['id']]}} for f in factory_outlines]},
        'fid': {fid: sorted(est_index[e] for e in eids) for fid, eids in sorted(fid_estates.items())},
        # Around-estate set per outlined estate (the same set the estate demo lists): Factory keys, heaviest first.
        'around': {eid: [fids[i] for i in v] for eid, v in sorted(around_points.items())},
    }
    Path(args.factory_out).write_text(json.dumps(context, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(meta['counts'], ensure_ascii=False))
    for name in ['estates.json', 'boundaries.geojson', 'directory.json', 'around.json']:
        print(name, (out / name).stat().st_size)
    print('estate-context.json', Path(args.factory_out).stat().st_size)


def fids_used(directory, fids):
    used = sorted({i for rows in directory.values() for r in rows for i in r[2]})
    fids_used.map = {old: new for new, old in enumerate(used)}
    return [fids[i] for i in used]


def remap(directory, fids):
    m = fids_used.map
    return {eid: [[r[0], r[1], [m[i] for i in r[2]]] for r in rows] for eid, rows in sorted(directory.items())}


if __name__ == '__main__':
    main()
