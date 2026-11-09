#!/usr/bin/env python3
"""Display copies of the logos LOGO_LIBRARY assigns to the estate records.

Reads the library rows (sheet export), the source files (the Drive logo archive industrial_estates-web-logos-2026-11-09
and any further originals), keeps a file only when its SHA-256 equals the library's `logo_sha256`, and writes:
  assets/logos/<asset_id>.svg   an SVG original, byte for byte
  assets/logos/<asset_id>.webp  a raster original scaled down to fit 448 × 112 px (WebP, alpha kept)
  assets/logos/manifest.json    source SHA-256, display file, size and the library rows still waiting for a file

The mark, its colours and proportions are never redrawn; a missing file leaves the record on its text label.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path

import openpyxl
from PIL import Image

MAX_W, MAX_H = 448, 112


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--sources', nargs='+', required=True, help='folders holding original logo files (any names)')
    ap.add_argument('--out', default=str(Path(__file__).resolve().parents[1] / 'assets/logos'))
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.sheet, read_only=True, data_only=True)
    rows = [r for r in wb['LOGO_LIBRARY'].iter_rows(values_only=True) if any(c not in (None, '') for c in r)]
    head = rows[0]
    lib = [dict(zip(head, r)) for r in rows[1:]]
    wanted = {}
    for r in lib:
        if r['logo_sha256']:
            wanted.setdefault(r['logo_sha256'], r)

    found = {}
    for folder in args.sources:
        for path in sorted(Path(folder).rglob('*')):
            if path.is_file():
                b = path.read_bytes()
                h = sha(b)
                if h in wanted and h not in found:
                    found[h] = (path, b)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('logo-*'):
        old.unlink()
    logos, missing = [], []
    for h, r in wanted.items():
        asset = r['asset_id'] or f'logo-{h[:16]}'
        if h not in found:
            missing.append({'sourceSha256': h, 'assetId': asset, 'label': r['logo_label'], 'mime': r['mime_type']})
            continue
        path, b = found[h]
        if (r['mime_type'] or '').startswith('image/svg') or path.suffix.lower() == '.svg':
            name = f'{asset}.svg'
            (out / name).write_bytes(b)
            w, hgt = int(r['width'] or 0), int(r['height'] or 0)
            derived = 'original bytes'
        else:
            im = Image.open(io.BytesIO(b))
            im.load()
            if im.mode not in ('RGBA', 'RGB'):
                im = im.convert('RGBA')
            scale = min(1.0, MAX_W / im.width, MAX_H / im.height)
            if scale < 1.0:
                im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
            name = f'{asset}.webp'
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=92, method=6)
            (out / name).write_bytes(buf.getvalue())
            w, hgt = im.width, im.height
            derived = f'scaled to fit {MAX_W}×{MAX_H} px, WebP q92 (source SHA-256 verified)'
        data = (out / name).read_bytes()
        logos.append({'sourceSha256': h, 'assetId': asset, 'file': name, 'width': w, 'height': hgt, 'bytes': len(data), 'sha256': sha(data),
                      'label': r['logo_label'], 'surface': r['recommended_surface'] or 'any',
                      'sourceBytes': len(b), 'derived': derived, 'rights': r['rights_notice']})
    logos.sort(key=lambda x: x['assetId'])
    manifest = {'library': 'LOGO_LIBRARY of the industrial-estate research master', 'rule': 'a file is used only when its SHA-256 equals logo_sha256',
                'max': [MAX_W, MAX_H], 'logos': logos, 'missing': missing}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(logos)} display copies, {len(missing)} waiting for a file')


if __name__ == '__main__':
    main()
