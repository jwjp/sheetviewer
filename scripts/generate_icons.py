"""Regenerate the committed desktop icons (requires Pillow)."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

size = 512
scale = 4
canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

def box(coords):
    return tuple(round(value * scale) for value in coords)


draw.rounded_rectangle(box((8, 8, 504, 504)), radius=112 * scale, fill="#101c29")
draw.rounded_rectangle(
    box((90, 92, 422, 420)),
    radius=36 * scale,
    outline="#52d6be",
    width=27 * scale,
)
draw.line(box((90, 196, 422, 196)), fill="#52d6be", width=25 * scale)
draw.line(box((202, 196, 202, 420)), fill="#52d6be", width=25 * scale)

icon = canvas.resize((size, size), Image.Resampling.LANCZOS)
for px, name in ((32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png")):
    icon.resize((px, px), Image.Resampling.LANCZOS).save(OUT / name)
icon.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
