"""Writes src/data/item-icons.json: a 12x12 picture per item (the materials of the quest type icons), original art.

Usage (from the project folder): python scripts/item_icons/make_item_icons.py [preview.html]

Checks every grid (12 rows of 12, known characters) and that no two items draw the same picture (grid and tint), then
writes the palette and the pictures. With a path, it also writes an HTML sheet of every picture to look at.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from art_blocks import BLOCKS  # noqa: E402
from art_gear import GEAR  # noqa: E402
from art_items import ITEMS  # noqa: E402

# Accents shared by every item picture, beside '#' (the item's tint), '+' (the tint at 55 %), 'o' (wood) and 'k' (dark)
PALETTE = {
    'w': '#f5f5f4',
    's': '#a8a29e',
    'd': '#57534e',
    'r': '#ef4444',
    'e': '#fb923c',
    'y': '#facc15',
    'g': '#4ade80',
    'G': '#15803d',
    'c': '#67e8f9',
    'b': '#60a5fa',
    'p': '#a855f7',
    'm': '#f472b6',
    'n': '#d6b77e',
}
BASE = set('.#+ok')


def main():
    root = pathlib.Path(__file__).resolve().parents[2]
    pictures = {}
    for group in (GEAR, BLOCKS, ITEMS):
        for name, (tint, grid) in group.items():
            if name in pictures:
                raise SystemExit(f'{name} is drawn twice')
            pictures[name] = {'tint': tint, 'grid': grid}

    problems = []
    seen = {}
    for name, picture in pictures.items():
        grid = picture['grid']
        if len(grid) != 12:
            problems.append(f'{name}: {len(grid)} rows')
        for y, row in enumerate(grid):
            if len(row) != 12:
                problems.append(f'{name} row {y}: {len(row)} wide: {row!r}')
            unknown = set(row) - BASE - set(PALETTE)
            if unknown:
                problems.append(f'{name} row {y}: unknown {sorted(unknown)}')
        key = (picture['tint'], tuple(grid))
        if key in seen:
            problems.append(f'{name} draws the same picture as {seen[key]}')
        seen[key] = name
    if problems:
        raise SystemExit('\n'.join(problems))

    out = root / 'src/data/item-icons.json'
    data = {'palette': PALETTE, 'items': {name: pictures[name] for name in sorted(pictures)}}
    out.write_text(json.dumps(data, indent=1) + '\n', encoding='utf-8')
    print(f'{len(pictures)} pictures -> {out.relative_to(root)}')

    if len(sys.argv) > 1:
        sheet(pathlib.Path(sys.argv[1]), pictures)


def sheet(path: pathlib.Path, pictures: dict):
    """An HTML page with every picture, at the size of the small tile and larger."""
    def svg(picture, size):
        rects = []
        for y, row in enumerate(picture['grid']):
            for x, c in enumerate(row):
                if c == '.':
                    continue
                fill = picture['tint'] if c in '#+' else '#8b5a2b' if c == 'o' else '#0b0d11' if c == 'k' else PALETTE[c]
                opacity = ' fill-opacity="0.55"' if c == '+' else ''
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{fill}"{opacity}/>')
        return f'<svg viewBox="0 0 12 12" width="{size}" height="{size}" shape-rendering="crispEdges">{"".join(rects)}</svg>'

    cells = ''.join(
        f'<figure><div class="tile">{svg(p, 25)}</div><div class="big">{svg(p, 72)}</div><figcaption>{n}</figcaption></figure>'
        for n, p in sorted(pictures.items()))
    path.write_text(f'''<!doctype html><meta charset="utf-8"><title>Item icons</title>
<style>body{{background:#0b0d11;color:#d1d5db;font:12px sans-serif;display:flex;flex-wrap:wrap;gap:8px;padding:12px}}
figure{{margin:0;width:110px;display:flex;flex-direction:column;align-items:center;gap:4px}}
.tile{{width:40px;height:40px;display:grid;place-items:center;background:#161a21;border:1px solid #2a313c;border-radius:8px}}
.big{{background:#161a21;border-radius:8px;padding:4px}}figcaption{{text-align:center;word-break:break-all}}</style>
{cells}''', encoding='utf-8')
    print('sheet ->', path)


if __name__ == '__main__':
    main()
