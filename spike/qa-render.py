"""QA 渲染器：按 demo 的相机/四元数/光泽模型复刻一帧，用来肉眼核对几何与材质。"""
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

SS = 2
DIST = 7.0
LIGHT = np.array([-0.34, 0.62, 0.72])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def _font(size=16):
    """QA 图要写中文标签，PIL 默认字体不含 CJK，优先挂系统微软雅黑。"""
    from PIL import ImageFont
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf",
              r"C:\Windows\Fonts\msyhn.ttc"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

LUSTERS = {
    "opaque":     dict(amb=0.50, diff=0.60, spec=0.05, shin=4,   alpha=1.00, back=1.00, fres=0.06, ior=1.60, envI=0.10),
    "glass":      dict(amb=0.40, diff=0.55, spec=0.75, shin=14,  alpha=0.78, back=0.55, fres=0.34, ior=1.54, envI=0.52),
    "adamantine": dict(amb=0.22, diff=0.38, spec=1.00, shin=22,  alpha=0.95, back=0.62, fres=0.48, ior=2.42, envI=1.00),
    "metallic":   dict(amb=0.04, diff=0.07, spec=0.85, shin=10,  alpha=1.00, back=1.00, fres=0.34, ior=1.00, envI=0.95, metal=1),
    "waxy":       dict(amb=0.58, diff=0.50, spec=0.22, shin=6,   alpha=0.96, back=0.72, fres=0.14, ior=1.50, envI=0.22),
    "transparent": dict(amb=0.34, diff=0.42, spec=0.55, shin=16, alpha=0.45, back=0.30, fres=0.52, ior=1.54, envI=0.45),
}
TINTS = [(0.55, 0.74, 0.97), (0.97, 0.62, 0.82), (0.55, 0.92, 0.76), (0.97, 0.84, 0.55)]
CLIP_TINT = (0.58, 0.62, 0.68)


def load():
    html = open("demo/crystal.html", encoding="utf-8").read()
    return json.loads(re.search(r"const DATA = (\{.*?\});\n", html, re.S).group(1))


def q_mul(a, b):
    x1, y1, z1, w1 = a
    x2, y2, z2, w2 = b
    return np.array([
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    ])


def q_axis(ax, ay, az, ang):
    s = math.sin(ang / 2)
    return np.array([ax * s, ay * s, az * s, math.cos(ang / 2)])


def q_mat(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


Q_VIEW = q_mul(q_axis(0, 1, 0, 0.52), q_axis(1, 0, 0, -math.pi / 2 + 0.16))
Q_VIEW = Q_VIEW / np.linalg.norm(Q_VIEW)


def _u(v):
    v = np.array(v, dtype=float)
    return v / np.linalg.norm(v)


# 与 demo/crystal_template.html 的 ENV_LIGHTS 保持一致
ENV_LIGHTS = [
    dict(dir=_u([-0.34, 0.62, 0.72]), col=np.array([1.00, 0.98, 0.93]), sharp=3.5, inten=0.75),
    dict(dir=_u([0.72, 0.28, 0.62]),  col=np.array([0.60, 0.72, 1.00]), sharp=26, inten=0.50),
    dict(dir=_u([0.10, -0.85, 0.50]), col=np.array([0.95, 0.78, 0.58]), sharp=2,  inten=0.26),
]


def env_sample(r):
    out = np.zeros(3)
    for L in ENV_LIGHTS:
        k = (max(0.0, float(np.dot(r, L["dir"]))) ** L["sharp"]) * L["inten"]
        out = out + k * L["col"]
    t = max(-1.0, min(1.0, float(r[1])))
    g = 0.16 * max(0.0, t) ** 0.65 + 0.05 * max(0.0, -t) ** 0.5
    return out + g * np.array([0.72, 0.80, 0.95])


def shade(base, n, c, eye, mat, tint_spec=False):
    lam = max(0.0, float(np.dot(n, LIGHT)))
    v = eye - c
    v = v / (np.linalg.norm(v) + 1e-9)
    h = LIGHT + v
    h = h / (np.linalg.norm(h) + 1e-9)
    sp = (max(0.0, float(np.dot(n, h))) ** mat["shin"]) * mat["spec"]
    b = np.array(base, dtype=float)
    col = b * (mat["amb"] + mat["diff"] * lam)
    spec_col = b * 0.65 + 0.35 if tint_spec else np.array([1.0, 1.0, 1.0])
    col = col + spec_col * sp
    d = float(np.dot(n, v))
    env = env_sample(2 * d * n - v)
    R0 = 1.0 if mat.get("metal") else ((mat["ior"] - 1) / (mat["ior"] + 1)) ** 2
    F = R0 + (1 - R0) * (1 - abs(d)) ** 5
    refl = F * mat["envI"]
    tint_ref = b if mat.get("metal") else np.ones(3)
    col = col + tint_ref * refl * env
    fres = (1 - abs(d)) ** 3 * mat.get("fres", 0) * 0.45
    col = col + fres * (0.55 + 0.45 * b)
    return np.clip(col, 0, 1)


STRIPE = {"quartz": ("c", 4.0), "fluorite": ("diag", 5.0)}


def render(mineral_id, habit_id, mask_key, w, h, luster=None, bg=(0.07, 0.085, 0.11), striations=True):
    D = load()
    m = next(x for x in D["minerals"] if x["id"] == mineral_id)
    hab = next(x for x in m["habits"] if x["id"] == habit_id)
    v = hab["variants"][mask_key] if mask_key in hab["variants"] else hab["variants"][sorted(hab["variants"])[-1]]
    P = np.array(v["v"], dtype=float).reshape(-1, 3)
    faces = []
    for fi, loop in enumerate(v["f"]):
        pts = P[loop]
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        n = n / (np.linalg.norm(n) + 1e-12)
        faces.append(dict(pts=pts, n=n, c=pts.mean(0), form=v["form"][fi],
                          indiv=v["indiv"][fi], clip=v["clip"][fi], loop=loop))

    # 真棱：两面共用且不共面（>5°）
    emap = {}
    for fi, f in enumerate(faces):
        L = f["loop"]
        for i in range(len(L)):
            a, b = L[i], L[(i + 1) % len(L)]
            emap.setdefault((a, b) if a < b else (b, a), []).append(fi)
    real = set()
    for k, lst in emap.items():
        if len(lst) == 2 and float(np.dot(faces[lst[0]]["n"], faces[lst[1]]["n"])) < 0.9962:
            real.add(k)

    q = Q_VIEW
    if hab.get("view") and hab["view"].get("yaw") is not None:
        q = q_mul(Q_VIEW, q_axis(0, 0, 1, math.radians(hab["view"]["yaw"])))
        q = q / np.linalg.norm(q)
    R = q_mat(q)

    mat = LUSTERS[luster or m.get("luster", "glass")]
    show_edges = True
    W, H = w * SS, h * SS
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img, "RGBA")
    cx, cy = W / 2, H / 2
    FOC = 3.05 * min(W, H) * 0.5
    eye = np.array([0.0, 0.0, DIST])

    items = []
    two_sided = any(f["clip"] for f in faces) or not v["closed"]
    # 双晶：先按个体（质心深度，远→近），个体内部再按最远顶点深度降序
    groups = {0: [], 1: []}
    for f in faces:
        wn = R @ f["n"]
        cw = R @ f["c"]
        front = float(np.dot(wn, eye - cw)) > 0
        if not front and not two_sided:
            continue
        depth = max(float((R @ p)[2]) for p in f["pts"])
        groups.setdefault(f["indiv"], []).append((depth, f, wn, cw, front))
    order = sorted(groups, key=lambda k: -max((t[3][2] for t in groups[k]), default=-1e9))
    for k in order:
        groups[k].sort(key=lambda t: -t[0])
        items.extend(groups[k])

    for depth, f, wn, cw, front in items:
        base = CLIP_TINT if f["form"] < 0 else TINTS[f["form"] % len(TINTS)]
        col = shade(base, wn, cw, eye, mat, tint_spec=(mat is LUSTERS["metallic"]))
        alpha = 0.92 if not front else 1.0
        if not front:
            col = col * 0.5
        pts = []
        for p in f["pts"]:
            wp = R @ p
            z = DIST - wp[2]
            k = FOC / max(z, 0.4)
            pts.append((cx + wp[0] * k, cy - wp[1] * k))
        fill = tuple(int(c * 255) for c in col) + (int(alpha * 255),)
        dr.polygon(pts, fill=fill, outline=fill, width=SS)
        if striations and front and f["form"] == 0 and mineral_id in STRIPE:
            axv, step = STRIPE[mineral_id]
            ax = R @ (np.array([0.0, 0.0, 1.0]) if axv == "c" else np.array([1.0, 1.0, 1.0]))
            dv = np.cross(ax, wn)
            nl = float(np.linalg.norm(dv))
            if nl > 1e-6:
                dv = dv / nl
                cp = R @ f["c"]
                zc = DIST - cp[2]
                kc = FOC / max(zc, 0.4)
                ox0, oy0 = cx + cp[0] * kc, cy - cp[1] * kc
                wp2 = R @ (f["c"] + dv * 0.3)
                z2 = DIST - wp2[2]
                k2 = FOC / max(z2, 0.4)
                ox1, oy1 = cx + wp2[0] * k2, cy - wp2[1] * k2
                dx, dy = ox1 - ox0, oy1 - oy0
                ln = math.hypot(dx, dy) or 1.0
                dx, dy = dx / ln, dy / ln
                xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
                mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
                rad = math.hypot(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 2
                mask = Image.new("L", (W, H), 0)
                ImageDraw.Draw(mask).polygon(pts, fill=255)
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                dl = ImageDraw.Draw(lay, "RGBA")
                t = -rad
                while t <= rad:
                    px, py = mx - dy * t, my + dx * t
                    dl.line([(px - dx * rad, py - dy * rad), (px + dx * rad, py + dy * rad)],
                            fill=(255, 255, 255, 26), width=2)
                    dl.line([(px - dx * rad + dx, py - dy * rad + dy), (px + dx * rad + dx, py + dy * rad + dy)],
                            fill=(0, 0, 0, 18), width=2)
                    t += step
                img.paste(lay, (0, 0), Image.composite(lay.split()[3], Image.new("L", (W, H), 0), mask))
        if show_edges:
            for i, lp in enumerate(f["loop"]):
                a, b = lp, f["loop"][(i + 1) % len(f["loop"])]
                key = (a, b) if a < b else (b, a)
                if key not in real:
                    continue
                dr.line([pts[i], pts[(i + 1) % len(f["loop"])]],
                        fill=(12, 22, 34, 150 if front else 55), width=SS)
    bgim = Image.new("RGB", (W, H), tuple(int(c * 255) for c in bg))
    layer = img if mat["alpha"] >= 0.995 else Image.eval(img, lambda v: v)
    if mat["alpha"] < 0.995:
        a = img.split()[3].point(lambda v: int(v * mat["alpha"]))
        img.putalpha(a)
    bgim.paste(img, (0, 0), img)
    return bgim.resize((w, h), Image.LANCZOS)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "lustre":
        # 用多面习惯（36 面聚形 / 24 面双晶）才看得出光泽差异——面太少时高光只落在一两个面上
        tiles = [
            ("garnet", "combined", "111", "glass",       "石榴石聚形 · 玻璃光泽"),
            ("garnet", "combined", "111", "adamantine",  "石榴石聚形 · 金刚光泽"),
            ("garnet", "combined", "111", "metallic",    "石榴石聚形 · 金属光泽"),
            ("quartz", "japan-twin", "111", "glass",     "石英日本律 · 玻璃光泽"),
            ("quartz", "japan-twin", "111", "transparent", "石英日本律 · 透明"),
            ("fluorite", "cube", "1", "opaque",          "萤石立方体 · 不透明"),
        ]
        T = 400
        out = Image.new("RGB", (3 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, (mi, hi, mk, lu, label) in enumerate(tiles):
            im = render(mi, hi, mk, T, T, luster=lu)
            out.paste(im, ((i % 3) * T, (i // 3) * T))
            dr.text(((i % 3) * T + 12, (i // 3) * T + 8), label, fill=(205, 214, 228), font=fnt)
        out.save("render/qa-lustre.png")
        print("saved render/qa-lustre.png")
if __name__ == "__main__":
    sheet = len(sys.argv) > 1 and sys.argv[1] == "sheet"
    if sheet:
        tiles = [
            ("fluorite", "spinel-twin", "1", "glass"),
            ("quartz", "japan-twin", "111", "glass"),
            ("quartz", "prismatic", "111", "glass"),
            ("calcite", "scalenohedron", "111", "adamantine"),
            ("garnet", "combined", "111", "glass"),
            ("fluorite", "cube", "1", "opaque"),
        ]
        out = Image.new("RGB", (3 * 420, 2 * 420), (7, 9, 13))
        for i, (mi, hi, mk, lu) in enumerate(tiles):
            im = render(mi, hi, mk, 420, 420, luster=lu)
            out.paste(im, ((i % 3) * 420, (i // 3) * 420))
        out.save("render/qa-sheet.png")
        print("saved render/qa-sheet.png")
    else:
        im = render("quartz", "japan-twin", "111", 760, 760, luster="glass")
        im.save("render/qa-twin.png")
        im2 = render("fluorite", "spinel-twin", "1", 760, 760, luster="glass")
        im2.save("render/qa-spinel.png")
        print("saved twin previews")
