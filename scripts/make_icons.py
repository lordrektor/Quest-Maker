"""Pixel icons and the hourglass logo: checks src/data/icons.json, writes the favicon / app icons and a preview sheet.

  python -I scripts/make_icons.py [--preview out.png]

Writes public/favicon.svg, public/apple-touch-icon.png (180), public/icon-512.png and public/og-image.png (1200x630).
The site itself draws every icon from icons.json (components/PixelIcon.vue, components/ChronosLogo.vue, and the item
families in components/ItemIcon.vue). Every icon is original pixel art: no game textures.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = json.load(open(os.path.join(ROOT, "src", "data", "icons.json"), encoding="utf-8"))
PUBLIC = os.path.join(ROOT, "public")

INK = (11, 13, 17)          # night-950
PANEL = (23, 27, 34)        # night-850
GOLD_TOP, GOLD_BOTTOM = (255, 211, 110), (217, 154, 28)   # gold-300 .. gold-500
SHADE = (150, 104, 18)
SAND = (126, 226, 176)      # emerald-300
GLOW = (63, 207, 142)       # emerald-400
MAIN = (236, 239, 244)      # night-100
MUTED = (179, 188, 201)     # night-300


def check():
    bad = []
    for name, rows in ICONS.items():
        if name.startswith("_"):
            continue
        w = len(rows[0])
        if any(len(r) != w for r in rows) or len(rows) != w:
            bad.append(f"{name}: rows {[len(r) for r in rows]} x {len(rows)}")
        extra = set("".join(rows)) - set("#+okse=.")
        if extra:
            bad.append(f"{name}: unknown chars {extra}")
    return bad


def logo_pixels():
    rows = ICONS["logo"]
    n = len(rows)
    for y, row in enumerate(rows):
        t = y / (n - 1)
        gold = tuple(round(a + (b - a) * t) for a, b in zip(GOLD_TOP, GOLD_BOTTOM))
        light = tuple(min(255, c + 30) for c in gold)
        for x, ch in enumerate(row):
            col = {"#": gold, "+": light, "=": SHADE, "k": INK, "s": SAND, "e": GLOW}.get(ch)
            if col:
                yield x, y, col, ch


def draw_logo(size, bg=True, radius=0.22):
    """the hourglass on a rounded dark tile (bg) or transparent, with a glow behind the falling sand"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if bg:
        tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(tile).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius), fill=PANEL + (255,))
        img.alpha_composite(tile)
    pad = size * (0.14 if bg else 0.02)
    px = (size - 2 * pad) / 16
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    glass = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(glass)
    for x, y, col, ch in logo_pixels():
        box = [pad + x * px, pad + y * px, pad + (x + 1) * px - 0.01, pad + (y + 1) * px - 0.01]
        sd.rectangle(box, fill=col + (255,))
        if ch == "e":
            gd.rectangle([box[0] - px, box[1] - px, box[2] + px, box[3] + px], fill=GLOW + (150,))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(px * 1.2)))
    img.alpha_composite(glass)
    return img


def favicon_svg():
    rects = []
    for x, y, col, ch in logo_pixels():
        rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="#{col[0]:02x}{col[1]:02x}{col[2]:02x}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">'
            + "".join(rects) + "</svg>\n")


def font(names, size):
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def og_image():
    w, h = 1200, 630
    img = Image.new("RGBA", (w, h), INK + (255,))
    halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([760, -120, 1320, 440], fill=(245, 184, 61, 60))
    ImageDraw.Draw(halo).ellipse([-200, 380, 400, 900], fill=(63, 207, 142, 45))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(90)))
    img.alpha_composite(draw_logo(300, bg=False), (850, 165))
    d = ImageDraw.Draw(img)
    big = font(["georgiab.ttf", "seguisb.ttf", "arialbd.ttf"], 120)
    mid = font(["segoeui.ttf", "arial.ttf"], 38)
    d.text((90, 180), "Chronos", font=big, fill=GOLD_TOP)
    d.text((94, 330), "Quests in stages, chains and pools.", font=mid, fill=MAIN)
    d.text((94, 385), "Built in game, in YAML or on a web canvas.", font=mid, fill=MUTED)
    return img.convert("RGB")


def preview(path):
    names = [n for n in ICONS if not n.startswith("_") and n != "logo"]
    cell, scale = 120, 8
    cols = 7
    rows = (len(names) + cols - 1) // cols + 1
    sheet = Image.new("RGB", (cell * cols, cell * rows), (18, 21, 27))
    sheet.paste(draw_logo(cell - 10).convert("RGB"), (5, 5))
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        cx, cy = (i % cols) * cell, (i // cols + 1) * cell
        grid = ICONS[n]
        item = n.startswith("item_")
        off = (cell - len(grid) * scale) // 2
        for y, row in enumerate(grid):
            for x, ch in enumerate(row):
                col = {"#": (125, 211, 252) if item else GOLD_TOP, "+": (60, 110, 140) if item else (150, 120, 60),
                       "o": (139, 90, 43) if item else GLOW, "k": INK}.get(ch)
                if col:
                    d.rectangle([cx + off + x * scale, cy + off - 8 + y * scale, cx + off + (x + 1) * scale - 1,
                                 cy + off - 8 + (y + 1) * scale - 1], fill=col)
        d.text((cx + 6, cy + cell - 16), n, fill=MUTED)
    sheet.save(path)


def main():
    bad = check()
    if bad:
        print("BAD ICONS:\n  " + "\n  ".join(bad))
        return 1
    if "--preview" in sys.argv:
        preview(sys.argv[sys.argv.index("--preview") + 1])
        if "--only-preview" in sys.argv:
            return 0
    open(os.path.join(PUBLIC, "favicon.svg"), "w", encoding="utf-8").write(favicon_svg())
    draw_logo(180).save(os.path.join(PUBLIC, "apple-touch-icon.png"))
    draw_logo(512).save(os.path.join(PUBLIC, "icon-512.png"))
    og_image().save(os.path.join(PUBLIC, "og-image.png"), optimize=True)
    print("icons ok:", len([n for n in ICONS if not n.startswith("_")]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
