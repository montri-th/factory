#!/usr/bin/env python3
"""Build data/factories.json from the factory research master, the DIW worker figures and CityMETER production base info.

  python3 -I scripts/build-data.py --csv <dir of tab CSV exports> --workers <DIW worker figures CSV> \
      --estates <dir of estate-master CSVs> --index data/area-index.json --frames data/frames --out data/factories.json \
      [--report data/build-report.json]

Inputs (internal, never committed):
  --csv      CSV exports of tabs of “CityMETER Factory Thailand — Factory, Operator & Company Research Master 2026-11-04”
             (Google Sheets research master, registry id research.TH.factory):
               02_FACTORIES_cols.csv  (02_FACTORIES — the core registry, THE ROWS OF THIS PRODUCT: fid · functional_class ·
                                       province · district · subdistrict · factory_class_code_raw · factory_type_code_raw ·
                                       classification_confidence · moi_location_status_raw · history_2025_listed ·
                                       core_basis · source_duplicate_flag · estate_context · estate_verification_status ·
                                       latitude_observed · longitude_observed · coordinate_quality)
               02_FACTORIES_names.csv (02_FACTORIES: fid · factory_name)
               02_FACTORIES_ops.csv   (02_FACTORIES: fid · operator_display_observed · moi_status_update)
               18_WORKERS_P90.csv     (tab gid 2026110418: the registrations at or above the P90 of DIW-reported workers —
                                       a parity check of the worker figures and the 95+ lens of this product)
               02_TYPES.csv           (02_FACTORIES grouped by factory_type_code_raw · factory_type_definition_raw ·
                                       official_industry_group_raw · functional_subclass)
               99_SOURCE_FILES.csv    (source register)
  --workers  fid · workers · class of the DIW class 2 and class 3 open-data exports (column คนงานรวม of factype2.csv and
             factype3.csv, diw-dataset.diw.go.th; both files read 2026-11-05 with SHA-256 equal to 99_SOURCE_FILES), derived
             with no other field. The build stops when a figure differs from 18_WORKERS_P90.
  --estates  CSV exports of “CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม 106 รายการ — Research Master 2026-10-25”:
             01_ESTATES.csv (names, type, province, IEAT page). NO geometry is read: the master has no selected boundary
             (19_MAP_EXPORT selected 0, rights not cleared), so this product publishes the list only.
  The SHA-256 of every file read is recorded in meta.inputs.
Public inputs: --index data/area-index.json, --frames data/frames/ (CityMETER production district outlines, display geometry).

ONE ROW = one FID of 02_FACTORIES (74,047 core registrations: FIDs of the DIW class 2/3 lists or that the MOI records as
operating, every size). A registration is not a verified physical site, a legal entity or proof of operation today.
Nothing is merged, split, moved or re-labelled.

WORKERS = คนงานรวม of the registration's DIW class 2/3 export row (resource metadata updated 2026-10-01; the observation
date of the figure is not exported): 71,124 FIDs have a figure (391 of them 0, as the source records it); 2 DIW FIDs have a
blank figure and the 2,921 MOI-only FIDs have no DIW row — no figure (null), never 0 and never estimated. The P90 of the
figures (PERCENTILE.INC 0.9) is 95 workers; every FID of 18_WORKERS_P90 has exactly its figure here (checked).

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

Not copied (meta.excludedFields): addresses, operator raw fields (MOI ONAME, the 2025 label), operator context ids, legal or
parent fields, researcher notes, human review fields, evidence and conflict flags, raw coordinates outside the screen, source
record ids, logo URLs, private Drive or Sheet URLs, and every DIW export field except the FID and คนงานรวม.
"""
import argparse, collections, csv, datetime, hashlib, json, math, os, re, sys, unicodedata

P90_TAB = '18_WORKERS_P90'
FACTORY_TAB = '02_FACTORIES_cols'
NAMES_TAB = '02_FACTORIES_names'
OPS_TAB = '02_FACTORIES_ops'
WORKERS_INPUT = 'DIW_workers'
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

# Worker bands (workers of the registration). The ids w1…w6 keep the meaning they had in release 0.1.0 (95+ only).
SIZES = [('s1', '0–9 คน', 0, 9), ('s2', '10–49 คน', 10, 49), ('s3', '50–94 คน', 50, 94),
         ('w1', '95–199 คน', 95, 199), ('w2', '200–499 คน', 200, 499), ('w3', '500–999 คน', 500, 999),
         ('w4', '1,000–1,999 คน', 1000, 1999), ('w5', '2,000–4,999 คน', 2000, 4999), ('w6', '5,000 คนขึ้นไป', 5000, 10 ** 9)]
THRESHOLD = 95  # the P90 of the worker figures (PERCENTILE.INC 0.9), recomputed and checked below
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
            'names and points of natural-person operators', 'internal Drive / Sheet URLs',
            'every DIW export field except fid and คนงานรวม (addresses, capital, horsepower, permit year, activity)']


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


def percentile_inc(values, q):
    """Spreadsheet PERCENTILE.INC of a sorted list."""
    n = len(values)
    h = (n - 1) * q
    lo = int(math.floor(h))
    hi = min(lo + 1, n - 1)
    return values[lo] + (h - lo) * (values[hi] - values[lo])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--csv', required=True)
    ap.add_argument('--workers', required=True)
    ap.add_argument('--estates', required=True)
    ap.add_argument('--index', required=True)
    ap.add_argument('--frames', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', default='')
    ap.add_argument('--built-on', default=datetime.date.today().isoformat())
    a = ap.parse_args()

    paths = {t: os.path.join(a.csv, t + '.csv') for t in (FACTORY_TAB, NAMES_TAB, OPS_TAB, P90_TAB, TYPE_TAB, SOURCE_TAB)}
    paths[WORKERS_INPUT] = a.workers
    paths[ESTATE_TAB] = os.path.join(a.estates, ESTATE_TAB + '.csv')
    inputs = {t: {'file': os.path.basename(p), 'sha256': sha256_file(p)} for t, p in paths.items()}
    reg = read_csv(paths[FACTORY_TAB])
    names = {r['fid']: r for r in read_csv(paths[NAMES_TAB])}
    ops = {r['fid']: r for r in read_csv(paths[OPS_TAB])}
    p90 = {r['fid']: r for r in read_csv(paths[P90_TAB])}
    types_raw = read_csv(paths[TYPE_TAB])
    source_rows = {r['source_id']: r for r in read_csv(paths[SOURCE_TAB])}
    estates_raw = read_csv(paths[ESTATE_TAB])
    inputs[WORKERS_INPUT]['derivedFrom'] = [{'source': sid, 'sha256': source_rows.get(sid, {}).get('sha256', ''), 'field': 'คนงานรวม'}
                                            for sid in ('DIW_factype2', 'DIW_factype3')]

    # DIW worker figures: one figure per FID (a FID listed twice must carry one figure).
    figures = {}
    for r in read_csv(paths[WORKERS_INPUT]):
        fid, w = r['fid'].strip(), r['workers'].strip()
        v = int(float(w)) if w != '' else None
        if fid in figures and figures[fid] != v:
            sys.exit(f'two worker figures for {fid}: {figures[fid]} / {v}')
        figures[fid] = v

    idx = json.load(open(a.index, encoding='utf-8'))
    prov_by_name = {p['name']: p['id'] for p in idx['provinces']}
    prov_ids = [p['id'] for p in idx['provinces']]
    A = idx['areas']
    area_by = collections.defaultdict(dict)
    for i, aid in enumerate(A['id']):
        area_by[A['province'][i]][th_norm(A['name'][i])] = aid

    # Type code → definition, official group (02_FACTORIES grouped; one group per code — checked).
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

    def place(r):
        pc = prov_by_name.get((r['province'] or '').strip())
        if not pc:
            return '', '', 'province'
        d = area_by[pc].get(th_norm(r['district']))
        return pc, d or '', 'name' if d else 'province'

    # Product rows: every core FID.
    locator = Locator(a.frames, prov_ids)
    rows, seen, mismatch = [], set(), collections.Counter()
    for f in reg:
        fid = f['fid']
        if fid in seen:
            sys.exit(f'duplicate fid in 02_FACTORIES: {fid}')
        seen.add(fid)
        if fid not in names or fid not in ops:
            sys.exit(f'{fid} missing from the name or operator export of 02_FACTORIES')
        pc, d, method = place(f)
        workers = figures.get(fid)
        if f['core_basis'].startswith('DIW') != (fid in figures):
            sys.exit(f'{fid}: core_basis {f["core_basis"]} disagrees with the DIW exports')
        q = p90.get(fid)
        if q is not None:
            if workers is None or int(float(q['workers'])) != workers:
                sys.exit(f'{fid}: worker figure {workers} differs from 18_WORKERS_P90 ({q["workers"]})')
            if (q['province'] or '').strip() != (f['province'] or '').strip():
                sys.exit(f'province differs between 18_WORKERS_P90 and 02_FACTORIES for {fid}')
            if (q['factory_name'] or '').strip() != (names[fid]['factory_name'] or '').strip():
                mismatch['name'] += 1
            if (q['moi_status_raw'] or '').strip() != (f['moi_location_status_raw'] or '').strip():
                mismatch['moi'] += 1
        name = (names[fid]['factory_name'] or '').strip()
        op = (ops[fid]['operator_display_observed'] or '').strip()
        blank = name in ('', '-')
        name_person, op_person = bool(PERSON.match(name)), bool(PERSON.match(op))
        # A natural person's name is never published; a registration known only by a person's name (its own name, or no
        # name and a person as operator) is published without a name and without its point.
        person = name_person or (blank and op_person)
        lat, lon = fnum(f['latitude_observed']), fnum(f['longitude_observed'])
        point = f['coordinate_quality'] == POINT_OK and lat is not None and lon is not None and not person
        rows.append({
            'fid': fid, 'name': '' if name_person or blank else name,
            'op': '' if op_person or op in ('', '-') or same_name(op, name) else op, 'person': person,
            'workers': workers, 'p90': q is not None, 'type': f['factory_type_code_raw'], 'group': type_group.get(f['factory_type_code_raw'], ''),
            'cls': CLASS_INDEX[f['functional_class']], 'fcls': f['factory_class_code_raw'], 'conf': f['classification_confidence'],
            'province': pc, 'district': d, 'admin': method, 'sub': (f['subdistrict'] or '').strip(),
            'lat': round(lat, 5) if point else None, 'lon': round(lon, 5) if point else None,
            'moi': (f['moi_location_status_raw'] or '').strip(), 'moiOn': us_date(ops[fid]['moi_status_update']),
            'basis': f['core_basis'], 'dup': f['source_duplicate_flag'] == 'possible_same_site_exact_name_address',
            'hist': f['history_2025_listed'] == 'TRUE', 'estate': (f.get('estate_context') or '').strip(),
        })
    missing = sorted(set(p90) - seen)
    if missing:
        sys.exit(f'{len(missing)} P90 FIDs missing from 02_FACTORIES')
    extra = sorted(set(figures) - seen)
    if extra:
        sys.exit(f'{len(extra)} DIW FIDs missing from 02_FACTORIES')

    # The 95+ lens: the P90 of the figures must be the sheet's threshold, and 18_WORKERS_P90 exactly the FIDs at or above it.
    figured = sorted(x['workers'] for x in rows if x['workers'] is not None)
    p90_value = percentile_inc(figured, 0.9)
    if p90_value != THRESHOLD:
        sys.exit(f'P90 of the worker figures is {p90_value}, not {THRESHOLD}')
    lens = {x['fid'] for x in rows if x['workers'] is not None and x['workers'] >= THRESHOLD}
    if lens != set(p90):
        sys.exit(f'18_WORKERS_P90 differs from the FIDs with {THRESHOLD}+ workers ({len(lens)} / {len(p90)})')

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

    # Most workers first; registrations without a figure last (by FID). The page ranks them (competition rank by workers)
    # and builds the short label names itself (js/model.js), so neither is stored.
    rows.sort(key=lambda x: (x['workers'] is None, -(x['workers'] or 0), x['fid']))

    # Dictionaries.
    groups_used = sorted({x['group'] for x in rows}, key=lambda g: (GROUP_FAMILY[g], g))
    group_index = {g: i for i, g in enumerate(groups_used)}
    types_used = sorted({x['type'] for x in rows})
    type_index = {t: i for i, t in enumerate(types_used)}
    provinces = sorted({x['province'] for x in rows if x['province']})
    province_index = {p: i for i, p in enumerate(provinces)}
    districts = sorted({x['district'] for x in rows if x['district']})
    district_index = {d: i for i, d in enumerate(districts)}
    subs = sorted({x['sub'] for x in rows if x['sub']})
    sub_index = {v: i for i, v in enumerate(subs)}
    dates = sorted({x['moiOn'] for x in rows if x['moiOn']})
    date_index = {v: i for i, v in enumerate(dates)}

    def col(fn):
        return [fn(x) for x in rows]

    cols = {
        'key': col(lambda x: x['fid']),
        'name': col(lambda x: x['name']),
        'op': col(lambda x: x['op']),
        'person': col(lambda x: 1 if x['person'] else 0),
        'workers': col(lambda x: x['workers']),
        'type': col(lambda x: type_index[x['type']]),
        'group': col(lambda x: group_index[x['group']]),
        'cls': col(lambda x: x['cls']),
        'fcls': col(lambda x: int(x['fcls']) if x['fcls'].isdigit() else 0),
        'province': col(lambda x: province_index.get(x['province'], -1)),
        'district': col(lambda x: district_index.get(x['district'], -1)),
        'admin': col(lambda x: ADMIN.index(x['admin'])),
        'sub': col(lambda x: sub_index[x['sub']] if x['sub'] else -1),
        'lat': col(lambda x: x['lat']),
        'lon': col(lambda x: x['lon']),
        'moi': col(lambda x: MOI.index(x['moi']) if x['moi'] in MOI else len(MOI) - 1),
        'moiOn': col(lambda x: date_index[x['moiOn']] if x['moiOn'] else -1),
        'basis': col(lambda x: BASIS_KEYS.index(x['basis'])),
        'dup': col(lambda x: 1 if x['dup'] else 0),
        'off': col(lambda x: 1 if x['off'] else 0),
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

    def band(w):
        return next((s_[0] for s_ in SIZES if s_[2] <= w <= s_[3]), '') if w is not None else 'none'

    total_workers = sum(x['workers'] for x in rows if x['workers'] is not None)
    counts = {
        'rows': len(rows), 'withWorkers': len(figured), 'workers': total_workers, 'zeroWorkers': sum(1 for v in figured if v == 0),
        'p90': len(lens), 'p90Workers': sum(x['workers'] for x in rows if x['p90']),
        'points': sum(1 for x in rows if x['lat'] is not None),
        'persons': sum(1 for x in rows if x['person']), 'admin': dict(collections.Counter(x['admin'] for x in rows)),
        'moi': dict(collections.Counter(x['moi'] or 'none' for x in rows)), 'basis': dict(collections.Counter(x['basis'] for x in rows)),
        'classes': dict(collections.Counter(CLASSES[x['cls']][0] for x in rows)),
        'possibleSameSite': sum(1 for x in rows if x['dup']), 'ties': sum(1 for x in rows if x['workers'] == THRESHOLD),
        'estates': len(estates),
        'sizes': dict(collections.Counter(band(x['workers']) for x in rows)),
        'estateContext': dict(collections.Counter(x['estate'] or 'blank' for x in rows)),
        'p90Parity': {'workers': len(p90), 'nameDiffers': mismatch['name'], 'moiDiffers': mismatch['moi']},
    }
    checked = sorted({us_date(source_rows[sid].get('checked_date', '')) for sid in ('DIW_factype2', 'DIW_factype3', 'MOI_location')
                      if sid in source_rows} - {''})
    meta = {
        'dataset': 'CityMETER Factory', 'datasetTh': 'ทะเบียนโรงงานทุกขนาด ทะเบียน กรอ. (นอกนิคมอุตสาหกรรม) และ อก.',
        'registryId': 'research.TH.factory', 'productionCode': 'factory',
        'sheetTitle': 'CityMETER Factory Thailand — Factory, Operator & Company Research Master 2026-11-04',
        'tab': {'name': '02_FACTORIES'}, 'lensTab': {'name': P90_TAB, 'gid': 2026110418},
        'estateSheetTitle': 'CityMETER Industrial Estates — นิคม สวน และเขตอุตสาหกรรม 106 รายการ — Research Master 2026-10-25',
        'checkedOn': checked[-1] if checked else '', 'builtOn': a.built_on,
        'scope': {'threshold': THRESHOLD, 'percentile': 'PERCENTILE.INC 0.9', 'withWorkers': len(figured), 'core': len(rows),
                  'workersPeriod': 'DIW class 2/3 exports (คนงานรวม), resource metadata updated 2026-10-01; observation date of the figure not exported',
                  'estates': 'estate_context of 02_FACTORIES (counts.estateContext): outside_estate_source_scope_DIW_catalog for the DIW-listed FIDs — the DIW class 2/3 open-data exports cover registrations outside IEAT industrial estates; unknown_estate_context for the MOI-only FIDs',
                  'note': 'Core registrations (FID) of the research master, every size; not a census of operating plants.'},
        'rows': len(rows), 'counts': counts, 'inputs': inputs,
        'unit': {'workers': 'คน (Σ คนงานรวม of the DIW class 2/3 exports; registrations without a figure add nothing)', 'count': 'ทะเบียน (FID)'},
        'adminMethods': ADMIN, 'checks': {'pointWithheld': dict(elsewhere)},
        'excludedFields': EXCLUDED,
        'context': {
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
        'sizes': [{'id': s_[0], 'th': s_[1], 'min': s_[2], 'max': s_[3] if s_[3] < 10 ** 9 else None} for s_ in SIZES],
        'moi': MOI, 'basis': [BASIS[k] for k in BASIS_KEYS],
        'sources': sources, 'provinces': provinces, 'districts': districts, 'subs': subs, 'dates': dates,
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
