"""A SHARP scene (3D Gaussian splat .ply, one photo → ~1.2M Gaussians) made small enough for a phone: the faintest and
smallest Gaussians are dropped down to --keep, and the rest packed as Niantic's .spz (gzip, ~12 bytes a Gaussian),
which Spark (the renderer in src/vendor/spark) reads. Writes:

    <name>.spz       the scene as the photo saw it (looking around and walking in)
    <name>-room.spz  the same scene trimmed for the room miniature: its middle 90% across, cut beyond the nearer 45%
                     of depths (the photos are mostly far sky), --room-keep Gaussians (a soft crop at draw time turned the splats black instead)
    <name>.json      how many, where the scene sits, and the photo's camera

    python scripts/memory-splat.py <scene.ply> <out-dir> <name> [--keep 450000] [--room-keep 250000]

SHARP's .ply is in OpenCV axes (x right, y down, z forward), the photo's camera at the origin; the app turns it to
three.js axes (y up, looking down -z). The scenes come from Apple's SHARP model, licensed for research only.
"""
import argparse, gzip, json, math, os, struct
import numpy as np
from plyfile import PlyData

ap = argparse.ArgumentParser()
ap.add_argument('ply'); ap.add_argument('out'); ap.add_argument('name')
ap.add_argument('--keep', type=int, default=450000)
ap.add_argument('--room-keep', type=int, default=250000)
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
s_sorted = np.sort(np.exp(log_s), 1)
area = s_sorted[:, 2] * s_sorted[:, 1]
dist = np.maximum(np.linalg.norm(xyz, axis=1), 0.1)
score = opacity * area / dist ** 2


def best(mask, keep):
    idx = np.nonzero(mask)[0]
    if len(idx) > keep:
        idx = idx[np.argsort(-score[idx])[:keep]]
    idx.sort()
    return idx


def write_spz(path, idx, frac=12):
    """.spz version 2: header, positions (24-bit fixed point), alphas, colours, scales, rotations; gzipped."""
    n = len(idx)
    pos = np.clip(np.round(xyz[idx] * (1 << frac)), -(1 << 23), (1 << 23) - 1).astype(np.int32)
    pos_b = np.empty((n, 3, 3), np.uint8)
    for k in range(3):
        pos_b[:, :, k] = (pos >> (8 * k)) & 0xFF
    alpha_b = np.clip(np.round(opacity[idx] * 255), 0, 255).astype(np.uint8)
    col_b = np.clip(np.round((dc[idx] * 0.15 + 0.5) * 255), 0, 255).astype(np.uint8)
    scale_b = np.clip(np.round((log_s[idx] + 10) * 16), 0, 255).astype(np.uint8)
    q = rot[idx] / np.linalg.norm(rot[idx], axis=1, keepdims=True)
    q = q * np.where(q[:, :1] < 0, -1, 1)  # w >= 0, so x y z carry the rotation
    rot_b = np.clip(np.round(q[:, 1:] * 127.5 + 127.5), 0, 255).astype(np.uint8)
    header = struct.pack('<IIIBBBB', 0x5053474E, 2, n, 0, frac, 0, 0)
    raw = header + pos_b.tobytes() + alpha_b.tobytes() + col_b.tobytes() + scale_b.tobytes() + rot_b.tobytes()
    with open(path, 'wb') as f:
        f.write(gzip.compress(raw, 9))
    return os.path.getsize(path)


os.makedirs(a.out, exist_ok=True)
main = best(opacity > 0.02, a.keep)
size_main = write_spz(os.path.join(a.out, a.name + '.spz'), main)

# Where the scene is: the middle 90% of the kept Gaussians (so a few strays do not stretch it), in OpenCV axes.
lo = np.percentile(xyz[main], 5, axis=0); hi = np.percentile(xyz[main], 95, axis=0)
median_depth = float(np.median(xyz[main][:, 2]))
far = min(float(hi[2]), float(np.percentile(xyz[main][:, 2], 45)))  # the nearer 45%: the photos are mostly far sky
inside = (opacity > 0.02) & np.all(xyz[:, :2] >= lo[:2], 1) & np.all(xyz[:, :2] <= hi[:2], 1) & (xyz[:, 2] >= lo[2]) & (xyz[:, 2] <= far)
room = best(inside, a.room_keep)
size_room = write_spz(os.path.join(a.out, a.name + '-room.spz'), room)

meta = {'name': a.name, 'gaussians': int(len(main)), 'roomGaussians': int(len(room)), 'from': int(n0),
        'axes': 'opencv (x right, y down, z forward)',
        'box': {'min': [round(float(x), 3) for x in lo], 'max': [round(float(x), 3) for x in hi[:2]] + [round(far, 3)]},
        'medianDepth': round(median_depth, 3), 'camera': camera,
        'source': 'Apple SHARP (Apple Machine Learning Research Model, research use only)'}
json.dump(meta, open(os.path.join(a.out, a.name + '.json'), 'w'), indent=1)
print(a.name, f'{n0} -> {len(main)} ({size_main / 1e6:.1f} MB), room {len(room)} ({size_room / 1e6:.1f} MB)', meta['box'], 'median depth', meta['medianDepth'])
