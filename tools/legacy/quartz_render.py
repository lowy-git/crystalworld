"""极简光线追踪渲染器：给内核算出的石英多面体出图。

用法：
  python render/quartz_render.py                 # 写实版（淡色偏）
  python render/quartz_render.py --tint          # 教学版（柱面/ r / z 三色分明）
  python render/quartz_render.py --out render/quartz_teach.png --tint
依赖：numpy + pillow。
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "spike", "quartz.json")

W = H = 900
SS = 2  # 超采样倍数


def load_mesh(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    verts = np.array(data["verts"], dtype=np.float64)
    tris, tri_form, tri_face = [], [], []
    for fi, (loop, form) in enumerate(zip(data["faces"], data["formOfFace"])):
        for i in range(1, len(loop) - 1):
            tris.append([loop[0], loop[i], loop[i + 1]])
            tri_form.append(form)
            tri_face.append(fi)
    return (verts, np.array(tris, dtype=np.int64), np.array(tri_form, dtype=np.int64),
            np.array(tri_face, dtype=np.int64))


def normalize(v):
    return v / np.linalg.norm(v)


def render(mesh_path, out_path, tint=False):
    verts, tris, tri_form, tri_face = load_mesh(mesh_path)
    v0, v1, v2 = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    e1, e2 = v1 - v0, v2 - v0
    nrm = np.cross(e1, e2)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    flip = np.sum(nrm * ((v0 + v1 + v2) / 3.0), axis=1) < 0
    nrm[flip] *= -1.0
    centroid = (v0 + v1 + v2) / 3.0

    eye = normalize(np.array([0.62, -1.00, 0.42])) * 5.4
    target = np.array([0.0, 0.0, -0.02])
    fwd = normalize(target - eye)
    right = normalize(np.cross(fwd, np.array([0.0, 0.0, 1.0])))
    upv = np.cross(right, fwd)
    half = 36.0 / 2.0 / 85.0

    # 相机在 −y 侧，所以轮廓光必须从 +y 打过来
    key = normalize(np.array([-1.00, 0.50, 1.05]))
    fill = normalize(np.array([1.05, 0.35, -0.15]))
    rim = normalize(np.array([-0.25, 1.00, 0.55]))
    lights = [
        (key, np.array([0.95, 0.93, 0.88])),
        (fill, np.array([0.26, 0.32, 0.42])),
        (rim, np.array([0.55, 0.68, 0.85])),
    ]

    if tint:
        palette = np.array([
            [0.55, 0.72, 0.95],  # 柱 {10-10}
            [0.95, 0.62, 0.80],  # r {10-11}
            [0.55, 0.90, 0.74],  # z {01-11}
        ])
    else:
        palette = np.array([
            [0.86, 0.91, 0.97],
            [0.97, 0.90, 0.94],
            [0.88, 0.96, 0.95],
        ])
    rim_color = np.array([0.45, 0.60, 0.80])

    pw, ph = W * SS, H * SS
    xs = (np.arange(pw) + 0.5) / pw * 2.0 - 1.0
    ys = 1.0 - (np.arange(ph) + 0.5) / ph * 2.0
    aspect = pw / ph
    dirs = (fwd[None, None, :]
            + right[None, None, :] * (xs[None, :, None] * half * aspect)
            + upv[None, None, :] * (ys[:, None, None] * half))
    dirs /= np.linalg.norm(dirs, axis=2, keepdims=True)

    best_t = np.full((ph, pw), np.inf)
    best_tri = np.full((ph, pw), -1, dtype=np.int32)

    for i in range(len(tris)):
        h = np.cross(dirs, e2[i])
        a = h @ e1[i]
        ok = np.abs(a) > 1e-12
        f = np.where(ok, 1.0 / np.where(ok, a, 1.0), 0.0)
        s = eye - v0[i]
        u = f * (h @ s)
        q = np.cross(s, e1[i])
        v = f * (dirs @ q)
        t = f * float(np.dot(e2[i], q))
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6) & (t < best_t)
        best_t = np.where(hit, t, best_t)
        best_tri = np.where(hit, i, best_tri)

    # 背景：竖向渐变 + 中心微光
    g = np.linspace(0.0, 1.0, ph)[:, None, None]
    bg = np.array([0.060, 0.082, 0.105]) * (1 - g) + np.array([0.012, 0.017, 0.024]) * g
    img = np.repeat(bg, pw, axis=1)
    rad = np.sqrt(((np.arange(pw)[None, :] - pw / 2) / pw) ** 2
                  + ((np.arange(ph)[:, None] - ph / 2) / ph) ** 2)
    glow = np.clip(1.0 - rad / 0.62, 0.0, 1.0) ** 2
    img += glow[:, :, None] * np.array([0.06, 0.085, 0.11])

    mask = best_tri >= 0
    tri = best_tri[mask]
    n = nrm[tri]
    vd = -dirs[mask]
    base = palette[tri_form[tri]]
    # 用真实交点算高度，别用三角形重心（否则同一块平面会被切成两半明暗不同）
    pos = eye[None, :] + best_t[mask][:, None] * dirs[mask]
    c = pos

    col = np.tile(np.array([0.30, 0.36, 0.46]), (n.shape[0], 1))
    for ldir, lcol in lights:
        lam = np.clip(n @ ldir, 0.0, None)[:, None]
        col += lam * lcol[None, :]
    # 镜面高光（Blinn-Phong）
    hv = normalize_vectors(lights[0][0][None, :] + vd)
    spec = np.clip(np.sum(n * hv, axis=1), 0.0, None) ** 48.0
    col += spec[:, None] * np.array([1.0, 0.98, 0.95]) * 0.9
    # 边缘光
    fres = (1.0 - np.abs(np.sum(n * vd, axis=1))) ** 2.5
    col += fres[:, None] * rim_color[None, :] * 1.1
    # 上亮下暗的一点体积感
    depth = np.clip((c[:, 2] + 1.0) / 2.0, 0.0, 1.0)[:, None]
    col *= 0.86 + 0.28 * depth

    img[mask] = np.clip(base * col, 0.0, 1.0)

    # 棱线：三角形编号在邻域发生变化处压暗
    fid = np.where(mask, tri_face[np.maximum(best_tri, 0)], -2)
    edge = np.zeros((ph, pw), dtype=bool)
    edge[:, :-1] |= (fid[:, :-1] != fid[:, 1:]) & (mask[:, :-1] | mask[:, 1:])
    edge[:-1, :] |= (fid[:-1, :] != fid[1:, :]) & (mask[:-1, :] | mask[1:, :])
    img[edge] *= 0.45

    img = np.clip(img, 0.0, 1.0) ** (1 / 2.2)
    out = Image.fromarray((img * 255.0).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save(out_path)
    print(f"wrote {out_path}  ({W}x{H}, tris={len(tris)}, covered={mask.sum()} px)")


def normalize_vectors(v):
    return v / np.linalg.norm(v, axis=1, keepdims=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mesh", default=SRC)
    ap.add_argument("--out", default=os.path.join(ROOT, "render", "quartz.png"))
    ap.add_argument("--tint", action="store_true")
    args = ap.parse_args()
    render(args.mesh, args.out, args.tint)
