#!/usr/bin/env python3
"""Building source per area (owner 2026-11-01, point 3): which buildings the map draws in each อปท. (Bangkok: เขต).

  python3 -I scripts/build-building-units.py --api <base info cache> --geom <LAO geometry cache> \
      --counts <building-source counts JSON> --out <repo root> [--frames <repo>/data/frames]

Rule (owner decision 2026-11-01, “ใช้เกณฑ์ 15% … ได้”, “กรุงเทพฯ ใช้เขตเป็นหน่วย … ได้”):
  - unit = a CityMETER local administration (อปท., production base info `municipalityInfos`) that holds at least one
    stay with a point; in Bangkok, a เขต (`districtInfos`) — its buildings are read per แขวง (the production tile API
    clips Bangkok by แขวง), the source is decided per เขต;
  - CityMETER Building V4 when its building count is at least 1.15 × the OpenStreetMap count of the same unit,
    otherwise OpenStreetMap; a unit where both hold fewer than THIN buildings is flagged `gap` (a building-data gap,
    reported) and still drawn from the larger one by the same rule;
  - counts: CityMETER V4 = production `building/info/lv1/{province}?version=V4` (whole unit); OpenStreetMap = ways
    tagged building=* inside the unit polygon (Overpass `out count`, holes subtracted). A unit whose bounding-box OSM
    count × 1.15 is already ≤ its CityMETER count is decided without a polygon count (the box is an upper bound).
Inside a CityMETER unit the page keeps the OpenStreetMap building parts where OSM maps a building in parts.

Output: data/building-units/index.json (meta, rule, per-province summary) and data/building-units/{PROV}.json (units
of that province with id, code, name, source, counts and bounding box; a CityMETER unit also carries its simplified
outline and the production tile units it is read by — itself, or in Bangkok its แขวง with their boxes). An OSM unit
needs no outline: the page draws OpenStreetMap wherever no CityMETER unit says otherwise. Bangkok เขต outlines are the
page's own district frames (data/frames/BKK.json), so a เขต is the same shape on the map and in the rule.
"""
import argparse, collections, hashlib, json, math, os, sys

RATIO = 1.15
THIN = 10
SIMPLIFY_DEG = 0.0001   # ≈ 11 m
MAX_VERTICES = 240


def dp(points, eps):
    """Douglas–Peucker on an OPEN polyline (first and last points kept)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        (x1, y1), (x2, y2) = points[s], points[e]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        idx, dmax = -1, eps
        for i in range(s + 1, e):
            px, py = points[i]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / length if length else math.hypot(px - x1, py - y1)
            if d > dmax:
                idx, dmax = i, d
        if idx > 0:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, k in zip(points, keep) if k]


def simplify(ring):
    """A closed ring simplified to at most MAX_VERTICES: split at the vertex farthest from the first (a closed ring's
    first and last points coincide, so Douglas–Peucker over the whole ring would have a zero-length base line)."""
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else list(ring)
    if len(pts) < 3:
        return None
    k = max(range(1, len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    eps = SIMPLIFY_DEG
    while True:
        a = dp(pts[:k + 1], eps)
        b = dp(pts[k:] + [pts[0]], eps)
        out = a + b[1:-1]
        if len(out) <= MAX_VERTICES or eps > 0.05:
            break
        eps *= 1.4
    out = [[round(x, 5), round(y, 5)] for x, y in out]
    dedup = [p for i, p in enumerate(out) if i == 0 or p != out[i - 1]]
    dedup.append(dedup[0])
    return dedup if len(dedup) >= 4 else None


def ring_area(r):
    return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2


def outline(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates'] if geom['type'] == 'MultiPolygon' else []
    out = []
    for p in polys:
        if not p or ring_area(p[0]) < 1e-9:
            continue
        outer = simplify(p[0])
        if not outer:
            continue
        holes = [h for h in (simplify(h) for h in p[1:] if ring_area(h) >= 1e-9) if h]
        out.append([outer] + holes)
    return out


def lonlat_bbox(extent):
    """EPSG:3857 [minx, miny, maxx, maxy] → lon/lat [w, s, e, n] (5 decimals)."""
    lon = lambda x: x * 180 / 20037508.34
    lat = lambda y: math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2)
    return [round(lon(extent[0]), 5), round(lat(extent[1]), 5), round(lon(extent[2]), 5), round(lat(extent[3]), 5)]


def decide(cm, osm, osm_upper, method):
    """Returns (source, basis): 'cm' or 'osm' by the 1.15 rule (owner 2026-11-01), with the evidence it rests on."""
    if method == 'bbox_upper_bound' and cm and osm_upper is not None and osm_upper * RATIO <= cm:
        return 'cm', 'cm_at_least_1.15x_osm_bbox_upper_bound'
    if osm is None:
        return 'osm', 'osm_count_unavailable_status_quo'
    if cm and cm >= RATIO * osm:
        return 'cm', 'cm_at_least_1.15x_osm'
    return 'osm', 'cm_below_1.15x_osm' if cm else 'cm_count_unavailable'


def is_gap(cm, osm, osm_upper):
    """Both sources hold fewer than THIN buildings in the unit (an upper bound counts for OSM)."""
    o = osm if osm is not None else osm_upper
    return (cm or 0) < THIN and o is not None and o < THIN


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--api', required=True)
    ap.add_argument('--geom', required=True)
    ap.add_argument('--counts', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--frames', default='')
    a = ap.parse_args()
    frames_dir = a.frames or os.path.join(a.out, 'data', 'frames')

    lv0 = json.load(open(os.path.join(a.api, 'base-lv0.json'), encoding='utf-8'))['value']['provinceInfos']
    counts_doc = json.load(open(a.counts, encoding='utf-8'))
    rows = {r['id']: r for r in counts_doc['rows']}
    osm_bases = sorted(set(counts_doc.get('osmBases') or []) | {r['osmBase'] for r in rows.values() if r.get('osmBase')})
    out_dir = os.path.join(a.out, 'data', 'building-units')
    os.makedirs(out_dir, exist_ok=True)
    summary, totals, missing_geom, prepared = [], collections.Counter(), [], []
    for p in lv0:
        base = json.load(open(os.path.join(a.api, f"base-{p['id']}.json"), encoding='utf-8'))['value']
        units = []
        if p['abbrEn'] == 'BKK':
            frames = {str(f['id']): f['geometry'] for f in json.load(open(os.path.join(frames_dir, 'BKK.json'), encoding='utf-8'))['areas']['features']}
            subs = collections.defaultdict(list)
            for sd in base['subdistrictInfos']:
                subs[str(sd['code'])[:4]].append({'id': sd['id'], 'bbox': lonlat_bbox(sd['extent'])})
            for d in base['districtInfos']:
                r = rows.get(d['id'])
                if not r:
                    continue
                src, basis = decide(r.get('cm'), r.get('osm'), r.get('osmUpper'), r.get('osmMethod'))
                u = {'id': d['id'], 'code': str(d['code']), 'name': d['nameTh'], 'kind': 'district', 'source': src, 'basis': basis, 'hotels': r.get('hotels', 0),
                     'cm': r.get('cm'), 'osm': r.get('osm'), 'osmUpper': r.get('osmUpper'), 'osmMethod': r.get('osmMethod'), 'gap': is_gap(r.get('cm'), r.get('osm'), r.get('osmUpper')),
                     'bbox': lonlat_bbox(d['extent']), 'area': str(d['code']), 'osmBaseDay': r.get('osmBaseDay')}
                if src == 'cm':
                    geom = frames.get(str(d['code']))
                    if not geom:
                        missing_geom.append(str(d['code']))
                    u.update({'tileType': 'SUBDISTRICT', 'tileUnits': sorted(subs.get(str(d['code']), []), key=lambda t: t['id']), 'outline': outline(geom) if geom else []})
                units.append(u)
        else:
            for m in base['municipalityInfos']:
                r = rows.get(m['id'])
                if not r:
                    continue
                src, basis = decide(r.get('cm'), r.get('osm'), r.get('osmUpper'), r.get('osmMethod'))
                u = {'id': m['id'], 'code': str(m['code']), 'name': m['nameTh'], 'kind': 'municipality', 'source': src, 'basis': basis, 'hotels': r.get('hotels', 0),
                     'cm': r.get('cm'), 'osm': r.get('osm'), 'osmUpper': r.get('osmUpper'), 'osmMethod': r.get('osmMethod'), 'gap': is_gap(r.get('cm'), r.get('osm'), r.get('osmUpper')),
                     'bbox': lonlat_bbox(m['extent']), 'osmBaseDay': r.get('osmBaseDay')}
                if src == 'cm':
                    gpath = os.path.join(a.geom, m['id'] + '.json')
                    geom = None
                    if os.path.exists(gpath):
                        v = json.load(open(gpath, encoding='utf-8'))['value']
                        geom = json.loads(v) if isinstance(v, str) else v
                    else:
                        missing_geom.append(str(m['code']))
                    u.update({'tileType': 'MUNICIPALITY', 'tileUnits': [{'id': m['id'], 'bbox': u['bbox']}], 'outline': outline(geom) if geom else []})
                units.append(u)
        if not units:
            continue
        units.sort(key=lambda u: (-u['hotels'], u['code']))
        prepared.append((p, units))
    # Every CityMETER tile unit gets one national index (`slot`): with the z14 tile and the ordinal in its response it
    # makes a building id that stays the same whatever the focus (js/massing.js#cmFeatureId).
    all_tile_units = sorted({t['id'] for _, units in prepared for u in units if u['source'] == 'cm' for t in u['tileUnits']})
    slot_of = {tid: i for i, tid in enumerate(all_tile_units)}
    assert len(slot_of) < 8192, 'tile-unit index exceeds the id space'
    for p, units in prepared:
        for u in units:
            for t in u.get('tileUnits', []):
                t['slot'] = slot_of[t['id']]
    for p, units in prepared:
        doc = {'province': p['abbrEn'], 'units': units}
        body = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(out_dir, f"{p['abbrEn']}.json"), 'w', encoding='utf-8') as fh:
            fh.write(body)
        c = collections.Counter(u['source'] for u in units)
        gaps = sum(1 for u in units if u['gap'])
        totals.update(c); totals['gap'] += gaps
        summary.append({'province': p['abbrEn'], 'units': len(units), 'cm': c['cm'], 'osm': c['osm'], 'gap': gaps,
                        'hotels': {s: sum(u['hotels'] for u in units if u['source'] == s) for s in ('cm', 'osm')},
                        'bytes': len(body.encode('utf-8')), 'sha256': hashlib.sha256(body.encode('utf-8')).hexdigest()})
    index = {
        'meta': {
            'rule': f'CityMETER Building V4 when its count ≥ {RATIO} × the OpenStreetMap count of the same unit, else OpenStreetMap (owner 2026-11-01); both under {THIN} buildings → flagged gap',
            'partsOverride': 'inside a CityMETER unit the page keeps OpenStreetMap buildings mapped in parts (building:part, OpenMapTiles hide_3d outlines) and leaves out the CityMETER buildings standing in their outline',
            'unit': 'อปท. (CityMETER production municipalityInfos) holding at least one stay with a point; Bangkok: เขต (tiles per แขวง)',
            'cm': {'dataset': 'CityMETER Building V4', 'counts': 'production building/info/lv1/{province}?version=V4', 'tiles': 'production building/detailMvt/{z}/{x}/{y}?inTileType&inTileId&version=V4', 'heights': 'height_m, model estimate'},
            'osm': {'dataset': 'OpenStreetMap', 'counts': 'Overpass API: ways tagged building=* inside the unit polygon (holes subtracted); bounding-box count as an upper bound where it already decides', 'osmBase': osm_bases,
                    'osmBaseDays': dict(sorted(collections.Counter(r.get('osmBaseDay') or 'unknown' for r in rows.values()).items()))},
            'ids': 'a CityMETER tile unit carries a national slot; building id = 2^52 + (z14 tile, slot, ordinal) (js/massing.js#cmFeatureId)',
            'countsBuiltAt': counts_doc.get('builtAt', ''), 'countsSha256': hashlib.sha256(open(a.counts, 'rb').read()).hexdigest(),
            'missingGeometry': missing_geom, 'totals': dict(totals),
        },
        'provinces': summary,
    }
    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({'totals': dict(totals), 'provinces': len(summary), 'missingGeometry': len(missing_geom),
                      'bytes': sum(s['bytes'] for s in summary)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
