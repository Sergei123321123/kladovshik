import os
import numpy as np
from PIL import Image, ImageDraw
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, PathPatch
from matplotlib.path import Path

# 1. Render high-resolution emblem using matplotlib
fig, ax = plt.subplots(figsize=(8, 8), dpi=128) # 1024x1024
ax.set_xlim(0, 64)
ax.set_ylim(64, 0)
ax.axis('off')
fig.patch.set_alpha(0)
ax.patch.set_alpha(0)

# Cube faces
p1 = Polygon([(32,3), (61,18), (32,33), (3,18)], closed=True, facecolor='#4caf50', edgecolor='none')
p2 = Polygon([(3,18), (32,33), (32,61), (3,46)], closed=True, facecolor='#2e7d32', edgecolor='none')
p3 = Polygon([(32,33), (61,18), (61,46), (32,61)], closed=True, facecolor='#1b5e20', edgecolor='none')
ax.add_patch(p1)
ax.add_patch(p2)
ax.add_patch(p3)

# Van body
van_verts = [
    (7, 16),
    (7, 14.5), (8, 13.5), (9.5, 13.5),
    (40, 13.5),
    (41.5, 13.5), (42.5, 14.5), (43, 16),
    (44, 20),
    (52, 21),
    (54, 21.5), (55.5, 23), (56.5, 25),
    (59, 30),
    (59.7, 31.5), (60, 33), (60, 35),
    (60, 41),
    (60, 42.5), (58.5, 43.5), (57, 43.5),
    (55, 43.5),
    (55, 40), (52, 37.5), (48, 37.5),
    (44, 37.5), (41, 40), (41, 43.5),
    (24, 43.5),
    (24, 40), (21, 37.5), (17, 37.5),
    (13, 37.5), (10, 40), (10, 43.5),
    (8.5, 43.5),
    (7, 43.5), (7, 42.5), (7, 41),
    (7, 16)
]
van_codes = [
    Path.MOVETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.CLOSEPOLY
]
ax.add_patch(PathPatch(Path(van_verts, van_codes), facecolor='#ffffff', edgecolor='none'))

# Window
win_verts = [
    (44, 22),
    (50.5, 23),
    (52, 23.5), (53, 24.5), (53.8, 26),
    (55.5, 30),
    (44, 30),
    (44, 22)
]
win_codes = [
    Path.MOVETO,
    Path.LINETO,
    Path.CURVE4, Path.CURVE4, Path.CURVE4,
    Path.LINETO,
    Path.LINETO,
    Path.CLOSEPOLY
]
ax.add_patch(PathPatch(Path(win_verts, win_codes), facecolor='#263238', edgecolor='none'))

# Wheels
ax.add_patch(Circle((17, 43.5), 5.5, facecolor='#212121', edgecolor='none'))
ax.add_patch(Circle((17, 43.5), 2.2, facecolor='#eceff1', edgecolor='none'))
ax.add_patch(Circle((48, 43.5), 5.5, facecolor='#212121', edgecolor='none'))
ax.add_patch(Circle((48, 43.5), 2.2, facecolor='#eceff1', edgecolor='none'))

plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
fig.savefig('temp_emblem_rustore.png', transparent=True, dpi=128)
plt.close(fig)

raw_emblem = Image.open('temp_emblem_rustore.png').convert('RGBA')
bbox = raw_emblem.getbbox()
cropped_emblem = raw_emblem.crop(bbox)

# Target icon size: 512x512, RGB (no alpha)
icon_size = 512

# Create premium dark green/graphite background with subtle radial highlight
bg = Image.new('RGB', (icon_size, icon_size), color=(18, 24, 27))
draw = ImageDraw.Draw(bg)

# Radial gradient from center
cx, cy = icon_size / 2, icon_size / 2
max_r = icon_size * 0.75
for r in range(int(max_r), 0, -2):
    t = 1.0 - (r / max_r)
    # Lerp from outer #11181c to inner #183324
    red = int(17 + t * (24 - 17))
    green = int(24 + t * (54 - 24))
    blue = int(28 + t * (38 - 28))
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(red, green, blue))

# Subtle elegant squircle card in center
card_margin = 24
card_radius = 80
card_im = Image.new('RGBA', (icon_size, icon_size), (0, 0, 0, 0))
card_draw = ImageDraw.Draw(card_im)
card_draw.rounded_rectangle(
    [card_margin, card_margin, icon_size - card_margin, icon_size - card_margin],
    radius=card_radius,
    fill=(22, 34, 30, 220),
    outline=(46, 125, 50, 180),
    width=3
)
bg.paste(card_im, (0, 0), card_im)

# Emblem scale: 350x350
emb_size = 350
emb_scaled = cropped_emblem.resize((emb_size, emb_size), Image.Resampling.LANCZOS)

ox = (icon_size - emb_size) // 2
oy = (icon_size - emb_size) // 2
bg.paste(emb_scaled, (ox, oy), emb_scaled)

# Ensure strictly RGB mode (no alpha)
final_icon = bg.convert('RGB')
os.makedirs('rustore_kit', exist_ok=True)
out_path = 'rustore_kit/icon_512.png'
final_icon.save(out_path, format='PNG')

if os.path.exists('temp_emblem_rustore.png'):
    os.remove('temp_emblem_rustore.png')

print(f"Generated {out_path}: {final_icon.size}, Mode: {final_icon.mode}")
