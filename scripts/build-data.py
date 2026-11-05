#!/usr/bin/env python3
"""Build data/factories.json from the factory research master and CityMETER production base info.

  python3 -I scripts/build-data.py --csv <dir of tab CSV exports> --estates <dir of estate-master CSVs> \
      --index data/area-index.json --frames data/frames --out data/factories.json [--report data/build-report.json]

Inputs (internal, never committed):
  --csv      CSV exports of tabs of “CityMETER Factory Thailand — Factory, Operator & Company Research Master 2026-11-04”
             (Google Sheets research master, registry id research.TH.factory): 18_WORKERS_P90.csv (tab gid 2026110418, the
             rows of this product), 02_FACTORIES_cols.csv (02_FACTORIES, columns fid · functional_class · province · district ·
             subdistrict · factory_class_code_raw · factory_type_code_raw · classification_confidence ·
             moi_location_status_raw · history_2025_listed · core_basis · source_duplicate_flag · estate_context ·
             estate_verification_status · latitude_observed · longitude_observed · coordinate_quality), 02_TYPES.csv (02_FACTORIES
             grouped by factory_type_code_raw · factory_type_definition_raw · official_industry_group_raw · functional_subclass),
             99_SOURCE_FILES.csv (source register). The SHA-256 of every file read is recorded in meta.inputs.
  --estates  CSV exports of “CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม 106 รายการ — Research Master 2026-10-25”:
             01_ESTATES.csv (names, type, province, IEAT page). NO geometry is read: the master has no selected boundary
             (19_MAP_EXPORT selected 0, rights not cleared), so this product publishes the list only.
Public inputs: --index data/area-index.json, --frames data/frames/ (CityMETER production district outlines, display geometry).

ONE ROW = one FID of 18_WORKERS_P90: a factory registration whose DIW-reported workers are at or above the sheet's P90
threshold (PERCENTILE.INC 0.9 = 95 workers of the 71,124 FIDs with a worker figure among the 74,047 core FIDs; every tie at
95 included). A registration is not a verified physical site, a legal entity or proof of operation today. Nothing is merged,
split, moved or re-labelled.

WORKERS = `workers` of 18_WORKERS_P90 (DIW class 2/3 exports, resource metadata updated 2026-10-01; the observation date of the
figure is not exported). Workers of registrations below the threshold are not in this file and are never estimated.

DISTRICT (ADMIN METHODS, the first that applies)
  name      the registration's own district label (02_FACTORIES.district: DIW2026 first, otherwise MOI) is a production
            district of its own province (02_FACTORIES.province), matched by name
  province  province only (the label names no district of that province)
A source point is never used to move a registration: a point that falls in another district or province is withheld (see
POINTS) and the registration stays where its source places it.

POINTS = latitude_observed / longitude_observed only where coordinate_quality is `within_TH_bbox_unverified` (a source point
inside Thailand's bounding box, not a verified plant location); rounded to 5 decimals. Points of a natural-person operator are
not published. A point that falls outside the registration's own district (or province, or every production outline) is
withheld (`off` = 1, counted in meta.checks.pointWithheld): it contradicts the registry's own place and is never used to move it.

NAMES = factory_name (the sheet's selected display name); operator_display_observed is published beside it when it differs
(beyond spacing and legal-form words, same_name).
A name written as a natural person (นาย, นาง, นางสาว, Mr …) is withheld for privacy (`person` = 1) together with its point.

INDUSTRY = factory_type_code_raw → official_industry_group_raw (02_FACTORIES; one group per code) → one of ten industry
families for the map's category cue (FAMILIES, a fixed presentation table; the official DIW group stays on every row).

REGISTRY CONTEXT = every core FID of 02_FACTORIES (74,047, all sizes) counted per district and province by functional_class —
context for the area panels, never mixed into the worker or registration measures of this product.

Not copied (meta.excludedFields): addresses, operator raw fields (MOI ONAME, the 2025 label), operator context ids, legal or
parent fields, researcher notes, human review fields, evidence and conflict flags, raw coordinates outside the screen, source
record ids, logo URLs, private Drive or Sheet URLs.
"""
import argparse, collections, csv, datetime, hashlib, json, math, os, re, sys, unicodedata

P90_TAB = '18_WORKERS_P90'
FACTORY_TAB = '02_FACTORIES_cols'
TYPE_TAB = '02_TYPES'
SOURCE_TAB = '99_SOURCE_FILES'
ESTATE_TAB = '01_ESTATES'

# Functional classes of 02_FACTORIES (functional-factory-classification-v2-2026-11-04; all stay in the legal-factory scope).
CLASSES = [
    ('manufacturing', 'ผลิต', 'Manufacturing'),
    ('service', 'บริการ', 'Service'),
    ('other', 'อื่น ๆ', 'Other'),
    ('review', 'รอตรวจหน้าที่', 'Classification under review'),
]
CLASS_INDEX = {c[0]: i for i, c in enumerate(CLASSES)}

# Ten industry families for the map's category cue. Every official DIW industry group (02_FACTORIES.official_industry_group_raw)
# belongs to exactly one family; the group itself is published on every row and in every list.
FAMILIES = [
    ('food', 'อาหารและเครื่องดื่ม', 'Food & beverages', ['อุตสาหกรรมอาหาร', 'อุตสาหกรรมเครื่องดื่ม']),
    ('electrical', 'เครื่องใช้ไฟฟ้าและอุปกรณ์', 'Electrical appliances & equipment', ['ผลิตเครื่องใช้ไฟฟ้าและอุปกรณ์']),
    ('vehicle', 'ยานพาหนะและเครื่องจักร', 'Vehicles & machinery',
     ['ผลิตยานพาหนะและอุปกรณ์รวมทั้งการซ่อมยานพาหนะและอุปกรณ์', 'ผลิตเครื่องจักรและเครื่องกล']),
    ('textile', 'สิ่งทอ เครื่องแต่งกาย หนัง', 'Textiles, apparel & leather',
     ['สิ่งทอ', 'อุตสาหกรรมเครื่องแต่งกายยกเว้นรองเท้า', 'ผลิตหนังสัตว์และผลิตภัณฑ์จากหนังสัตว์']),
    ('metal', 'โลหะ', 'Metals', ['ผลิตภัณฑ์โลหะ', 'ผลิตโลหะขั้นมูลฐาน']),
    ('polymer', 'พลาสติก ยาง เคมี', 'Plastics, rubber & chemicals',
     ['ผลิตภัณฑ์พลาสติก', 'ยางและผลิตภัณฑ์ยาง', 'เคมีภัณฑ์และผลิตภัณฑ์เคมี', 'ผลิตภัณฑ์จากปิโตรเลียม']),
    ('wood', 'ไม้ กระดาษ การพิมพ์', 'Wood, paper & printing',
     ['แปรรูปไม้และผลิตภัณฑ์จากไม้', 'เครื่องเรือนหรือเครื่องตบแต่งในอาคารจากไม้ แก้ว ยาง หรือโลหะอื่นๆ',
      'ผลิตกระดาษและผลิตภัณฑ์กระดาษ', 'การพิมพ์ การเย็บเล่ม ทำปกหรือการทำแม่พิมพ์']),
    ('mineral', 'ผลิตภัณฑ์อโลหะ', 'Non-metallic mineral products', ['ผลิตภัณฑ์อโลหะ']),
    ('plant', 'ผลิตภัณฑ์จากพืช', 'Plant products', ['ผลิตภัณฑ์จากพืช']),
    ('other', 'การผลิตอื่น ๆ', 'Other manufacturing', ['การผลิตอื่นๆ', '']),
]
GROUP_FAMILY = {g: i for i, f in enumerate(FAMILIES) for g in f[3]}

# Worker bands (workers of the registration). Every row of this product has at least 95 workers.
SIZES = [('w1', '95–199 คน', 95, 199), ('w2', '200–499 คน', 200, 499), ('w3', '500–999 คน', 500, 999),
         ('w4', '1,000–1,999 คน', 1000, 1999), ('w5', '2,000–4,999 คน', 2000, 4999), ('w6', '5,000 คนขึ้นไป', 5000, 10 ** 9)]
ADMIN = ['name', 'province']
# Raw MOI location status of 02_FACTORIES; blank = no MOI record for this FID in the MOI exports read by the sheet.
MOI = ['ดำเนินการ', 'ได้รับใบอนุญาต', 'หยุดดำเนินการ', 'จำหน่าย', '']
BASIS = {  # core_basis → the words of the source details (กรอ. = กรมโรงงานอุตสาหกรรม, อก. = กระทรวงอุตสาหกรรม)
    'DIW2026_listed': 'อยู่ในทะเบียน กรอ. ชุด 1 ต.ค. 2569',
    'DIW2026_listed_and_MOI_operating': 'อยู่ในทะเบียน กรอ. ชุด 1 ต.ค. 2569 และ อก. ระบุดำเนินการ',
    'MOI_operating_only': 'อก. ระบุดำเนินการ (ไม่อยู่ในทะเบียน กรอ. ชุด 1 ต.ค. 2569)',
}
BASIS_KEYS = list(BASIS)
POINT_OK = 'within_TH_bbox_unverified'
# Private document hosts (spelled in parts so the tree carries no such link): never published as a source link.
PRIVATE_HOSTS = tuple(f'{h}.{"google"}.com' for h in ('docs', 'drive'))
# A natural person: a Thai title written straight onto the given name (นายสมชาย …), or an English title and a space.
PERSON = re.compile(r'^\s*(?:(?:นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|ว่าที่\s*ร\.ต\.)\s*(?=[ก-ฮ])|(?:Mr|Mrs|Miss|Ms)\.?\s)', re.I)
SOURCES = [  # the public pages of the sources this product reads (99_SOURCE_FILES.source_url, public https only)
    ('DIW_factype2', 'ทะเบียนโรงงานจำพวก 2 ของกรมโรงงานอุตสาหกรรม (DIW Open Data)'),
    ('DIW_factype3', 'ทะเบียนโรงงานจำพวก 3 ของกรมโรงงานอุตสาหกรรม (DIW Open Data)'),
    ('MOI_location', 'ที่ตั้งประกอบกิจการโรงงาน — กระทรวงอุตสาหกรรม (GD Catalog)'),
    ('MOI_permit', 'การอนุญาตประกอบกิจการโรงงาน — กระทรวงอุตสาหกรรม (GD Catalog)'),
]
EXCLUDED = ['address', 'operator_name_moi_raw', 'historical_operator_name_2025', 'operator_context_id', 'operator_context_basis',
            'legal_operator_id', 'immediate_parent', 'ultimate_parent', 'human_review_status', 'human_decision', 'human_notes',
            'evidence_conflict_flags', 'status_evidence_conflict_flags', 'source_ids', 'record_id', 'logo_use_id', 'logo_url',
            'workers_CDF_at_or_below', 'raw coordinates of rows whose coordinate_quality is not within_TH_bbox_unverified',
            'names and points of natural-person operators', 'internal Drive / Sheet URLs']


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_csv(path):
    with open(path, encoding='utf-8', newline='') as fh:
        return list(csv.DictReader(fh))


def th_norm(s):
    s = unicodedata.normalize('NFC', str(s or '')).replace('​', '').replace('\xa0', ' ').replace('ํา', 'ำ').strip()
    s = re.sub(r'^(?:กิ่งอำเภอ|อำเภอ|เขต|อ\.)\s*', '', s)
    return re.sub(r'\s+', '', s)


def fnum(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def us_date(v):
    """The sheet's DATE cells export as month/day/year (11/4/2026 = 4 Nov 2026) → ISO date, else ''."""
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', (v or '').strip())
    return f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}' if m else ''


def ring_contains(ring, x, y):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


class Locator:
    """District outlines of data/frames (display geometry) — used for the point check only, never for membership."""
    def __init__(self, frames_dir, provinces):
        self.items = []
        for code in provinces:
            frame = json.load(open(os.path.join(frames_dir, f'{code}.json'), encoding='utf-8'))
            for f in frame['areas']['features']:
                g = f['geometry']
                polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
                xs = [p[0] for poly in polys for p in poly[0]]
                ys = [p[1] for poly in polys for p in poly[0]]
                self.items.append((code, str(f['id']), polys, min(xs), min(ys), max(xs), max(ys)))

    def find(self, lon, lat):
        for code, did, polys, w, s, e, n in self.items:
            if lon < w or lon > e or lat < s or lat > n:
                continue
            for poly in polys:
                if ring_contains(poly[0], lon, lat) and not any(ring_contains(h, lon, lat) for h in poly[1:]):
                    return code, did
        return None, None


def short_name(name):
    """Name without the legal-form words, for map labels only (the full name stays the accessible name)."""
    s = re.sub(r'\s+', ' ', name or '').strip()
    s = re.sub(r'^(บริษัท|บจก\.?|บมจ\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|หจก\.?)\s*', '', s)
    for _ in range(3):  # “(มหาชน) จำกัด”, “จำกัด จำกัด”: strip the trailing form words until none is left
        s = re.sub(r'\s*(จำกัด\s*\(มหาชน\)|\(มหาชน\)|จำกัด\s*มหาชน|จำกัด|มหาชน)\s*$', '', s)
    s = re.sub(r'\s*\((ประเทศไทย|ประทศไทย|ไทยแลนด์|Thailand)\)\s*', ' ', s, flags=re.I).strip()
    s = re.sub(r'\s*(co\.?,?\s*ltd\.?|company limited|limited|public company limited)\s*$', '', s, flags=re.I).strip()
    return s or (name or '').strip()


def same_name(a, b):
    """Two labels of one registration that differ only in spacing or legal-form words are the same name (one is shown)."""
    key = lambda s: re.sub(r'\s+', '', short_name(s)).lower()
    return key(a) == key(b)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--csv', required=True)
    ap.add_argument('--estates', required=True)
    ap.add_argument('--index', required=True)
    ap.add_argument('--frames', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', default='')
    ap.add_argument('--built-on', default=datetime.date.today().isoformat())
    a = ap.parse_args()

    paths = {t: os.path.join(a.csv, t + '.csv') for t in (P90_TAB, FACTORY_TAB, TYPE_TAB, SOURCE_TAB)}
    paths[ESTATE_TAB] = os.path.join(a.estates, ESTATE_TAB + '.csv')
    inputs = {t: {'file': os.path.basename(p), 'sha256': sha256_file(p)} for t, p in paths.items()}
    p90 = read_csv(paths[P90_TAB])
    reg = read_csv(paths[FACTORY_TAB])
    types_raw = read_csv(paths[TYPE_TAB])
    source_rows = {r['source_id']: r for r in read_csv(paths[SOURCE_TAB])}
    estates_raw = read_csv(paths[ESTATE_TAB])

    idx = json.load(open(a.index, encoding='utf-8'))
    prov_by_name = {p['name']: p['id'] for p in idx['provinces']}
    prov_ids = [p['id'] for p in idx['provinces']]
    A = idx['areas']
    area_by = collections.defaultdict(dict)
    for i, aid in enumerate(A['id']):
        area_by[A['province'][i]][th_norm(A['name'][i])] = aid
    area_province = dict(zip(A['id'], A['province']))

    # Type code → definition, official group, subclass (02_FACTORIES grouped; one group per code — checked).
    type_def, type_group = {}, {}
    for r in types_raw:
        code = r['factory_type_code_raw']
        g = r['official_industry_group_raw']
        if code in type_group and type_group[code] != g:
            sys.exit(f'type code {code} has two industry groups: {type_group[code]!r} / {g!r}')
        type_group[code] = g
        if r['factory_type_definition_raw']:
            type_def.setdefault(code, r['factory_type_definition_raw'])
    unknown_groups = sorted({g for g in type_group.values() if g not in GROUP_FAMILY})
    if unknown_groups:
        sys.exit(f'industry groups without a family: {unknown_groups}')

    # Registration → district (name method) for every core FID.
    def place(r):
        pc = prov_by_name.get((r['province'] or '').strip())
        if not pc:
            return '', '', 'province'
        d = area_by[pc].get(th_norm(r['district']))
        return pc, d or '', 'name' if d else 'province'

    by_fid = {}
    registry_area = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    registry_province = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    registry_unplaced = collections.Counter()
    for r in reg:
        if r['fid'] in by_fid:
            sys.exit(f'duplicate fid in 02_FACTORIES: {r["fid"]}')
        pc, d, method = place(r)
        by_fid[r['fid']] = (r, pc, d, method)
        ci = CLASS_INDEX[r['functional_class']]
        if pc:
            registry_province[pc][0] += 1
            registry_province[pc][1 + ci] += 1
        if d:
            registry_area[d][0] += 1
            registry_area[d][1 + ci] += 1
        else:
            registry_unplaced[pc or '?'] += 1

    # Product rows.
    locator = Locator(a.frames, prov_ids)
    rows, missing = [], []
    for r in p90:
        hit = by_fid.get(r['fid'])
        if not hit:
            missing.append(r['fid'])
            continue
        f, pc, d, method = hit
        if (r['province'] or '').strip() != (f['province'] or '').strip():
            sys.exit(f'province differs between 18_WORKERS_P90 and 02_FACTORIES for {r["fid"]}')
        workers = int(float(r['workers']))
        if workers < int(r['workers_P90_threshold'] or 95):
            sys.exit(f'{r["fid"]} below the threshold')
        name = (r['factory_name'] or '').strip()
        op = (r['operator_display_observed'] or '').strip()
        blank = name in ('', '-')
        name_person, op_person = bool(PERSON.match(name)), bool(PERSON.match(op))
        # A natural person's name is never published; a registration known only by a person's name (its own name, or no
        # name and a person as operator) is published without a name and without its point.
        person = name_person or (blank and op_person)
        lat, lon = fnum(f['latitude_observed']), fnum(f['longitude_observed'])
        point = f['coordinate_quality'] == POINT_OK and lat is not None and lon is not None and not person
        rows.append({
            'fid': r['fid'], 'name': '' if name_person or blank else name,
            'op': '' if op_person or op in ('', '-') or same_name(op, name) else op, 'person': person,
            'workers': workers, 'type': f['factory_type_code_raw'], 'group': type_group.get(f['factory_type_code_raw'], ''),
            'cls': CLASS_INDEX[f['functional_class']], 'fcls': f['factory_class_code_raw'], 'conf': f['classification_confidence'],
            'province': pc, 'district': d, 'admin': method, 'sub': (f['subdistrict'] or '').strip(),
            'lat': round(lat, 5) if point else None, 'lon': round(lon, 5) if point else None,
            'moi': (r['moi_status_raw'] or '').strip(), 'moiOn': us_date(r['moi_status_update']),
            'basis': f['core_basis'], 'dup': f['source_duplicate_flag'] == 'possible_same_site_exact_name_address',
            'tie': r['threshold_tie'] == 'TRUE', 'checked': us_date(r['source_checked_date']),
            'hist': f['history_2025_listed'] == 'TRUE', 'estate': (f.get('estate_context') or '').strip(),
        })
    if missing:
        sys.exit(f'{len(missing)} P90 FIDs missing from 02_FACTORIES')

    # Point check (never changes membership): a source point outside the registration's own district (or province, or
    # every district outline) contradicts the registry's own place, so it is withheld (`off`), never used to move the row.
    elsewhere = collections.Counter()
    for x in rows:
        x['off'] = False
        if x['lat'] is None:
            continue
        pc, did = locator.find(x['lon'], x['lat'])
        reason = 'outsideFrames' if not pc else 'otherProvince' if pc != x['province'] else 'otherDistrict' if x['district'] and did != x['district'] else ''
        if reason:
            elsewhere[reason] += 1
            x['lat'] = x['lon'] = None
            x['off'] = True

    rows.sort(key=lambda x: (-x['workers'], x['fid']))
    # Rank among all rows by workers (competition rank: equal workers share a rank).
    rank, prev = 0, None
    for i, x in enumerate(rows):
        if x['workers'] != prev:
            rank, prev = i + 1, x['workers']
        x['rank'] = rank

    # Dictionaries.
    groups_used = sorted({x['group'] for x in rows}, key=lambda g: (GROUP_FAMILY[g], g))
    group_index = {g: i for i, g in enumerate(groups_used)}
    types_used = sorted({x['type'] for x in rows})
    type_index = {t: i for i, t in enumerate(types_used)}
    provinces = sorted({x['province'] for x in rows if x['province']})
    province_index = {p: i for i, p in enumerate(provinces)}
    districts = sorted({x['district'] for x in rows if x['district']})
    district_index = {d: i for i, d in enumerate(districts)}

    def col(key, fn):
        return [fn(x) for x in rows]

    cols = {
        'key': col('fid', lambda x: x['fid']),
        'name': col('name', lambda x: x['name']),
        'op': col('op', lambda x: x['op']),
        'person': col('person', lambda x: 1 if x['person'] else 0),
        'workers': col('workers', lambda x: x['workers']),
        'rank': col('rank', lambda x: x['rank']),
        'type': col('type', lambda x: type_index[x['type']]),
        'group': col('group', lambda x: group_index[x['group']]),
        'cls': col('cls', lambda x: x['cls']),
        'fcls': col('fcls', lambda x: int(x['fcls']) if x['fcls'].isdigit() else 0),
        'province': col('province', lambda x: province_index.get(x['province'], -1)),
        'district': col('district', lambda x: district_index.get(x['district'], -1)),
        'admin': col('admin', lambda x: ADMIN.index(x['admin'])),
        'sub': col('sub', lambda x: x['sub']),
        'lat': col('lat', lambda x: x['lat']),
        'lon': col('lon', lambda x: x['lon']),
        'moi': col('moi', lambda x: MOI.index(x['moi']) if x['moi'] in MOI else len(MOI) - 1),
        'moiOn': col('moiOn', lambda x: x['moiOn']),
        'basis': col('basis', lambda x: BASIS_KEYS.index(x['basis'])),
        'dup': col('dup', lambda x: 1 if x['dup'] else 0),
        'off': col('off', lambda x: 1 if x['off'] else 0),
        'tie': col('tie', lambda x: 1 if x['tie'] else 0),
        'short': col('short', lambda x: short_name(x['name']) if x['name'] else ''),
    }

    # Sources (public pages only).
    sources = []
    for sid, th in SOURCES:
        s = source_rows.get(sid, {})
        url = s.get('source_url', '')
        if not url.startswith('https://') or any(h in url for h in PRIVATE_HOSTS):
            url = ''
        sources.append({'id': sid, 'th': th, 'url': url, 'rows': int(s['row_count']) if (s.get('row_count') or '').isdigit() else None,
                        'checkedOn': us_date(s.get('checked_date', ''))})

    # Industrial-area register (list only; no geometry).
    estates = []
    for e in estates_raw:
        pc = prov_by_name.get((e['province'] or '').strip(), '')
        url = e.get('primary_source_url', '')
        estates.append({'id': e['estate_id'], 'name': e['name_th'], 'nameEn': e.get('name_en', ''), 'type': e['industrial_area_type'],
                        'province': pc, 'ieat': e['ieat_catalogue_membership'].startswith('พบ'),
                        'url': url if url.startswith('https://') and not any(h in url for h in PRIVATE_HOSTS) else '',
                        'checkedOn': us_date(e.get('checked_on', ''))})
    estates.sort(key=lambda e: (e['province'], e['type'], e['name']))

    total_workers = sum(x['workers'] for x in rows)
    counts = {
        'rows': len(rows), 'workers': total_workers, 'points': sum(1 for x in rows if x['lat'] is not None),
        'persons': sum(1 for x in rows if x['person']), 'admin': dict(collections.Counter(x['admin'] for x in rows)),
        'moi': dict(collections.Counter(x['moi'] or 'none' for x in rows)), 'basis': dict(collections.Counter(x['basis'] for x in rows)),
        'possibleSameSite': sum(1 for x in rows if x['dup']), 'ties': sum(1 for x in rows if x['tie']),
        'registry': len(reg), 'registryPlaced': sum(v[0] for v in registry_area.values()),
        'registryUnplaced': sum(registry_unplaced.values()), 'estates': len(estates),
        'sizes': {s[0]: sum(1 for x in rows if s[2] <= x['workers'] <= s[3]) for s in SIZES},
        'estateContext': dict(collections.Counter(x['estate'] or 'blank' for x in rows)),
    }
    checked = sorted({x['checked'] for x in rows if x['checked']})
    meta = {
        'dataset': 'CityMETER Factory', 'datasetTh': 'โรงงานคนงาน 95 คนขึ้นไป ในทะเบียน กรอ. (นอกนิคมอุตสาหกรรม)', 'registryId': 'research.TH.factory',
        'productionCode': 'factory',
        'sheetTitle': 'CityMETER Factory Thailand — Factory, Operator & Company Research Master 2026-11-04',
        'tab': {'name': P90_TAB, 'gid': 2026110418},
        'estateSheetTitle': 'CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม 106 รายการ — Research Master 2026-10-25',
        'checkedOn': checked[-1] if checked else '', 'builtOn': a.built_on,
        'scope': {'threshold': 95, 'percentile': 'PERCENTILE.INC 0.9', 'withWorkers': 71124, 'core': len(reg),
                  'workersPeriod': 'DIW class 2/3 exports, resource metadata updated 2026-10-01; observation date of the figure not exported',
                  'estates': 'estate_context of 02_FACTORIES (counts.estateContext): outside_estate_source_scope_DIW_catalog — the DIW class 2/3 open-data exports cover registrations outside IEAT industrial estates; plants registered with IEAT are not in these exports',
                  'note': 'Registrations (FID) at or above the P90 of DIW-reported workers; not a census of operating plants.'},
        'rows': len(rows), 'counts': counts, 'inputs': inputs,
        'unit': {'workers': 'คน (Σ workers of 18_WORKERS_P90)', 'count': 'ทะเบียน (FID)'},
        'adminMethods': ADMIN, 'checks': {'pointWithheld': dict(elsewhere)},
        'excludedFields': EXCLUDED,
        'context': {
            'registry': {'tab': '02_FACTORIES', 'rows': len(reg), 'classes': [c[0] for c in CLASSES],
                         'note': 'Every core FID (all sizes) per district by functional_class; context only.'},
            'estates': {'tab': '01_ESTATES', 'rows': len(estates), 'checkedOn': max((e['checkedOn'] for e in estates if e['checkedOn']), default=''),
                        'geometry': 'not published (19_MAP_EXPORT selected 0; rights not cleared)'},
        },
    }
    out = {
        'meta': meta,
        'classes': [{'id': c[0], 'th': c[1], 'en': c[2]} for c in CLASSES],
        'families': [{'id': f[0], 'th': f[1], 'en': f[2]} for f in FAMILIES],
        'groups': [{'th': g or 'ไม่ระบุกลุ่มอุตสาหกรรม', 'raw': g, 'family': GROUP_FAMILY[g]} for g in groups_used],
        'types': [{'code': t, 'th': type_def.get(t, '')} for t in types_used],
        'sizes': [{'id': s[0], 'th': s[1], 'min': s[2], 'max': s[3] if s[3] < 10 ** 9 else None} for s in SIZES],
        'moi': MOI, 'basis': [BASIS[k] for k in BASIS_KEYS],
        'sources': sources, 'provinces': provinces, 'districts': districts,
        'registry': {
            'classes': [c[0] for c in CLASSES],
            'areas': {k: v for k, v in sorted(registry_area.items())},
            'provinces': {k: v for k, v in sorted(registry_province.items())},
            'unplaced': dict(registry_unplaced),
        },
        'estates': estates,
        'cols': cols,
    }
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    report = {'builtOn': a.built_on, 'output': os.path.basename(a.out), 'outputSha256': sha256_file(a.out), 'counts': counts,
              'checks': meta['checks'], 'inputs': inputs}
    if a.report:
        with open(a.report, 'w', encoding='utf-8') as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
