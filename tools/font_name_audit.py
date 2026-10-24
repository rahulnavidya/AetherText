#!/usr/bin/env python3
"""Extract actual font family/style names from a folder tree of font files.

Requires fontTools:  py -m pip install --user fonttools
Example:
  py font_name_audit.py "D:\\Downloads\\Fonts" --output-dir "D:\\Downloads\\FontNameReport"
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Iterable

FONT_EXTENSIONS = {'.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2'}


def name_value(font, name_ids: Iterable[int]) -> str:
    """Get the first useful name-table value, preferring typographic IDs and English records."""
    table = font.get('name')
    if table is None:
        return ''
    for wanted_id in name_ids:
        candidates: list[tuple[int, str]] = []
        for record in table.names:
            if record.nameID != wanted_id:
                continue
            try:
                value = record.toUnicode().strip()
            except Exception:
                continue
            if not value:
                continue
            # English Windows records are usually the most useful for a family list.
            language_priority = 0 if getattr(record, 'langID', None) in (0x0409, 0x0809) else 1
            platform_priority = 0 if getattr(record, 'platformID', None) in (0, 3) else 1
            candidates.append((language_priority * 2 + platform_priority, value))
        if candidates:
            candidates.sort(key=lambda item: (item[0], item[1].casefold()))
            return candidates[0][1]
    return ''


def open_fonts(path: Path):
    from fontTools.ttLib import TTCollection, TTFont
    suffix = path.suffix.lower()
    if suffix in {'.ttc', '.otc'}:
        collection = TTCollection(str(path), lazy=True)
        return collection.fonts, collection
    font = TTFont(str(path), lazy=True)
    return [font], font


def main() -> int:
    parser = argparse.ArgumentParser(description='Extract internal font family names, not just filenames.')
    parser.add_argument('folders', nargs='+', help='One or more folders to scan recursively')
    parser.add_argument('--output-dir', default='font-name-report', help='Where to write the TXT and CSV reports (default: ./font-name-report)')
    args = parser.parse_args()

    try:
        from fontTools.ttLib import TTFont  # noqa: F401
    except ImportError:
        print('Missing dependency. Install it with: py -m pip install --user fonttools', file=sys.stderr)
        return 2

    roots = [Path(folder).expanduser() for folder in args.folders]
    missing = [str(root) for root in roots if not root.exists()]
    if missing:
        print('Folder not found: ' + ', '.join(missing), file=sys.stderr)
        return 2

    files: set[Path] = set()
    for root in roots:
        if root.is_file() and root.suffix.lower() in FONT_EXTENSIONS:
            files.add(root.resolve())
        elif root.is_dir():
            files.update(path.resolve() for path in root.rglob('*') if path.is_file() and path.suffix.lower() in FONT_EXTENSIONS)

    if not files:
        print('No supported font files found. Supported: ' + ', '.join(sorted(FONT_EXTENSIONS)), file=sys.stderr)
        return 1

    rows: list[dict[str, str]] = []
    errors: list[tuple[str, str]] = []
    for number, path in enumerate(sorted(files), start=1):
        try:
            fonts, owner = open_fonts(path)
            try:
                for face_index, font in enumerate(fonts):
                    family = name_value(font, (16, 1))
                    subfamily = name_value(font, (17, 2))
                    full_name = name_value(font, (4,))
                    if family or full_name:
                        rows.append({
                            'Family': family or full_name,
                            'Style': subfamily,
                            'Full name': full_name,
                            'File': str(path),
                            'Collection face': str(face_index + 1) if len(fonts) > 1 else '',
                        })
            finally:
                close = getattr(owner, 'close', None)
                if callable(close):
                    close()
        except Exception as exc:
            errors.append((str(path), str(exc)))
        if number % 250 == 0:
            print(f'Scanned {number:,}/{len(files):,} font files...')

    out_dir = Path(args.output_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    family_names = sorted({row['Family'].strip() for row in rows if row['Family'].strip()}, key=str.casefold)
    txt_path = out_dir / 'font-families.txt'
    csv_path = out_dir / 'font-details.csv'
    error_path = out_dir / 'font-scan-errors.txt'

    txt_path.write_text('\n'.join(family_names) + ('\n' if family_names else ''), encoding='utf-8')
    with csv_path.open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=['Family', 'Style', 'Full name', 'File', 'Collection face'])
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda row: (row['Family'].casefold(), row['Style'].casefold(), row['File'].casefold())))
    if errors:
        error_path.write_text('\n'.join(f'{path}\n  {error}' for path, error in errors) + '\n', encoding='utf-8')

    print(f'Scanned font files: {len(files):,}')
    print(f'Font faces recorded: {len(rows):,}')
    print(f'Unique family names: {len(family_names):,}')
    print(f'Family list: {txt_path.resolve()}')
    print(f'Detailed report: {csv_path.resolve()}')
    if errors:
        print(f'Files skipped due to errors: {len(errors):,}; details: {error_path.resolve()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
