"""A SHARP scene (3D Gaussian splat .ply, one photo → ~1.2M Gaussians) made small enough for a phone: the faintest and
smallest Gaussians are dropped down to --keep, and the rest packed as Niantic's .spz (gzip, ~12 bytes a Gaussian),
which Spark (the renderer in src/vendor/spark) reads. Also writes <name>.json: how many, and where the scene sits.

    python scripts/memory-splat.py <scene.ply> <out-dir> <name> [--keep 450000]

SHARP's .ply is in OpenCV axes (x right, y down, z forward), the photo's camera at the origin; the app turns it to
three.js axes (y up, looking down -z). The scenes come from Apple's SHARP model, licensed for research only.
"""
import argparse, gzip, json, math, os, struct
import numpy as np
from plyfile import PlyData

ap = argparse.ArgumentParser()
ap.add_argument('ply'); ap.add_argument('out'); ap.add_argument('name')
ap.add_argument('--keep', type=int, default=450000)
a = ap.parse_args()

ply = PlyData.read(a.ply)
v = ply['vertex'].data
n0 = len(v)
# The photo's camera (SHARP stores it beside the Gaussians): focal lengths and image size give the field of view the
# app opens with, so the first frame matches the photo.
camera = None
try:
    K = np.array([float(x[0]) for x in ply['intrinsic'].data])
    W, H = [int(x[0]) for x in ply['image_size'].data]
    camera = {'width': W, 'height': H, 'fx': round(K[0], 2), 'fy': round(K[4], 2), 'cx': round(K[2], 2), 'cy': round(K[5], 2),
              'vfov': round(math.degrees(2 * math.atan(H / 2 / K[4])), 3), 'colorSpace': int(ply['color_space'].data[0][0])}
except Exception as e:  # older files without them
    print('no camera in file:', e)
xyz = np.stack([v['x'], v['y'], v['z']], 1).astype(np.float32)
opacity = 1 / (1 + np.exp(-v['opacity'].astype(np.float64)))
log_s = np.stack([v['scale_0'], v['scale_1'], v['scale_2']], 1).astype(np.float32)
rot = np.stack([v['rot_0'], v['rot_1'], v['rot_2'], v['rot_3']], 1).astype(np.float32)  # w, x, y, z
dc = np.stack([v['f_dc_0'], v['f_dc_1'], v['f_dc_2']], 1).astype(np.float32)

# What a Gaussian adds to the picture: how opaque it is times how much it covers (its two largest axes), seen from
# the photo's camera, so far-away Gaussians are not favoured just for being big.
s = np.exp(log_s)
s_sorted = np.sort(s, 1)
area = s_sorted[:, 2] * s_sorted[:, 1]
dist = np.maximum(np.linalg.norm(xyz, axis=1), 0.1)
score = opacity * area / dist ** 2
keep = opacity > 0.02
idx = np.nonzero(keep)[0]
if len(idx) > a.keep:
    idx = idx[np.argsort(-score[idx])[: a.keep]]
idx.sort()
xyz, opacity, log_s, rot, dc = xyz[idx], opacity[idx], log_s[idx], rot[idx], dc[idx]
n = len(idx)

# .spz version 2: header, then positions (24-bit fixed point), alphas, colours, scales, rotations; all gzipped.
FRAC = 12
pos = np.clip(np.round(xyz * (1 << FRAC)), -(1 << 23), (1 << 23) - 1).astype(np.int32)
pos_b = np.empty((n, 3, 3), np.uint8)
for k in range(3):
    pos_b[:, :, k] = (pos >> (8 * k)) & 0xFF
alpha_b = np.clip(np.round(opacity * 255), 0, 255).astype(np.uint8)
col_b = np.clip(np.round((dc * 0.15 + 0.5) * 255), 0, 255).astype(np.uint8)
scale_b = np.clip(np.round((log_s + 10) * 16), 0, 255).astype(np.uint8)
q = rot / np.linalg.norm(rot, axis=1, keepdims=True)
q = q * np.where(q[:, :1] < 0, -1, 1)  # w >= 0, so x y z carry the rotation
rot_b = np.clip(np.round(q[:, 1:] * 127.5 + 127.5), 0, 255).astype(np.uint8)
header = struct.pack('<IIIBBBB', 0x5053474E, 2, n, 0, FRAC, 0, 0)
raw = header + pos_b.tobytes() + alpha_b.tobytes() + col_b.tobytes() + scale_b.tobytes() + rot_b.tobytes()
os.makedirs(a.out, exist_ok=True)
spz = os.path.join(a.out, a.name + '.spz')
with open(spz, 'wb') as f:
    f.write(gzip.compress(raw, 9))

# Where the scene is: the middle 90% of the Gaussians (so a few strays do not stretch it), in OpenCV axes.
lo = np.percentile(xyz, 5, axis=0); hi = np.percentile(xyz, 95, axis=0)
meta = {'name': a.name, 'gaussians': int(n), 'from': int(n0), 'axes': 'opencv (x right, y down, z forward)',
        'box': {'min': [round(float(x), 3) for x in lo], 'max': [round(float(x), 3) for x in hi]},
        'medianDepth': round(float(np.median(xyz[:, 2])), 3), 'camera': camera,
        'source': 'Apple SHARP (Apple Machine Learning Research Model, research use only)'}
json.dump(meta, open(os.path.join(a.out, a.name + '.json'), 'w'), indent=1)
print(a.name, f'{n0} -> {n} Gaussians, {os.path.getsize(spz) / 1e6:.1f} MB', meta['box'], 'median depth', meta['medianDepth'])
