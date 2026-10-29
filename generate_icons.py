import os
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
fig.savefig('emblem_highres.png', transparent=True, dpi=128)
plt.close(fig)

raw_emblem = Image.open('emblem_highres.png').convert('RGBA')

# Crop to tight bounding box
bbox = raw_emblem.getbbox()
cropped_emblem = raw_emblem.crop(bbox)

# Target densities
densities = {
    'mipmap-mdpi': (48, 108),
    'mipmap-hdpi': (72, 162),
    'mipmap-xhdpi': (96, 216),
    'mipmap-xxhdpi': (144, 324),
    'mipmap-xxxhdpi': (192, 432),
}

base_res_dir = 'android/app/src/main/res'

for folder, (size, fg_size) in densities.items():
    out_dir = os.path.join(base_res_dir, folder)
    os.makedirs(out_dir, exist_ok=True)
    
    # --- 1. ic_launcher.png (Rounded Rectangle / Squircle) ---
    sq_im = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    sq_draw = ImageDraw.Draw(sq_im)
    
    pad = int(size * 4 * 0.05)
    radius = int(size * 4 * 0.22)
    # White rounded background with subtle border
    sq_draw.rounded_rectangle([pad, pad, size * 4 - pad, size * 4 - pad], radius=radius, fill=(255, 255, 255, 255), outline=(230, 230, 230, 255), width=int(size * 4 * 0.015))
    
    # Scale emblem to fit inside
    inner_size = int((size * 4 - 2 * pad) * 0.82)
    emb_scaled = cropped_emblem.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    
    # Center emblem
    ox = (size * 4 - inner_size) // 2
    oy = (size * 4 - inner_size) // 2
    sq_im.paste(emb_scaled, (ox, oy), emb_scaled)
    
    final_sq = sq_im.resize((size, size), Image.Resampling.LANCZOS)
    final_sq.save(os.path.join(out_dir, 'ic_launcher.png'), 'PNG')
    
    # --- 2. ic_launcher_round.png (Circular) ---
    rd_im = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    rd_draw = ImageDraw.Draw(rd_im)
    
    pad_rd = int(size * 4 * 0.04)
    rd_draw.ellipse([pad_rd, pad_rd, size * 4 - pad_rd, size * 4 - pad_rd], fill=(255, 255, 255, 255), outline=(230, 230, 230, 255), width=int(size * 4 * 0.015))
    
    inner_rd_size = int((size * 4 - 2 * pad_rd) * 0.80)
    emb_rd_scaled = cropped_emblem.resize((inner_rd_size, inner_rd_size), Image.Resampling.LANCZOS)
    
    ox_rd = (size * 4 - inner_rd_size) // 2
    oy_rd = (size * 4 - inner_rd_size) // 2
    rd_im.paste(emb_rd_scaled, (ox_rd, oy_rd), emb_rd_scaled)
    
    final_rd = rd_im.resize((size, size), Image.Resampling.LANCZOS)
    final_rd.save(os.path.join(out_dir, 'ic_launcher_round.png'), 'PNG')
    
    # --- 3. ic_launcher_foreground.png (Adaptive Icon Foreground) ---
    fg_im = Image.new('RGBA', (fg_size * 2, fg_size * 2), (0, 0, 0, 0))
    # Safe zone for adaptive icons is center 66%
    fg_emb_size = int(fg_size * 2 * 0.58)
    emb_fg_scaled = cropped_emblem.resize((fg_emb_size, fg_emb_size), Image.Resampling.LANCZOS)
    
    ox_fg = (fg_size * 2 - fg_emb_size) // 2
    oy_fg = (fg_size * 2 - fg_emb_size) // 2
    fg_im.paste(emb_fg_scaled, (ox_fg, oy_fg), emb_fg_scaled)
    
    final_fg = fg_im.resize((fg_size, fg_size), Image.Resampling.LANCZOS)
    final_fg.save(os.path.join(out_dir, 'ic_launcher_foreground.png'), 'PNG')

print("All Android launcher icons generated successfully!")
