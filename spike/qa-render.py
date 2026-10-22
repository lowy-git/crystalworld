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
    "opaque":      dict(amb=0.50, diff=0.60, spec=0.05, shin=4,  fres=0.06, ior=1.60, envI=0.10),
    "glass":       dict(amb=0.40, diff=0.55, spec=0.75, shin=14, fres=0.34, ior=1.54, envI=0.52),
    "adamantine":  dict(amb=0.09, diff=0.18, spec=1.00, shin=40, fres=0.48, ior=2.42, envI=1.00),
    "metallic":    dict(amb=0.06, diff=0.12, spec=0.85, shin=10, fres=0.34, ior=1.00, envI=0.95, metal=1, opaqueOnly=1),
    "waxy":        dict(amb=0.58, diff=0.50, spec=0.22, shin=6,  fres=0.14, ior=1.50, envI=0.22),
    "transparent": dict(amb=0.34, diff=0.42, spec=0.55, shin=16, fres=0.52, ior=1.54, envI=0.45),
}

# 通透度：与光泽完全独立（金属光泽天然不透明）
TRANSP = {"opaque": 1.00, "transl": 0.55, "clear": 0.26}


def default_transp(m):
    lu = m.get("luster", "glass")
    if lu in ("metallic", "opaque"):
        return "opaque"
    if lu in ("adamantine", "transparent"):
        return "clear"
    return "transl"


# 场景背景：除画面外还带环境光修正（amb 倍率 + 色调）
# table_y = 桌面/地面在画面高度上的位置（0–1）；None 表示该场景没有可放置的表面
BACKGROUNDS = {
    "dark":    dict(dark=True,  amb=0.88, amb_t=np.array([0.80, 0.88, 1.00]), table_y=None),
    "lab":     dict(dark=False, amb=1.14, amb_t=np.array([0.99, 1.00, 1.04]), table_y=0.74),
    "nature":  dict(dark=False, amb=1.18, amb_t=np.array([1.02, 1.00, 0.93]), table_y=0.66),
    "cabinet": dict(dark=True,  amb=0.82, amb_t=np.array([1.00, 0.93, 0.80]), table_y=0.80),
    "paper":   dict(dark=False, amb=1.28, amb_t=np.array([1.03, 1.01, 0.97]), table_y=0.84),
}


def draw_bg(kind, W, H):
    """程序化背景（复刻 demo/crystal_template.html 的 BACKGROUNDS[kind].draw）
       含背景内容物（标尺/试管/标签/草丛/石子/木块）——透过去才看得见，
       这是"透明感"的必要条件：背后一片纯色时再透明也只是一块变色玻璃。"""
    im = Image.new("RGB", (W, H))
    dr = ImageDraw.Draw(im, "RGBA")
    if kind == "dark":
        for y in range(H):
            t = y / H
            r = int(22 + (7 - 22) * t)
            g = int(40 + (12 - 40) * t)
            b = int(63 + (20 - 63) * t)
            dr.line([(0, y), (W, y)], fill=(r, g, b))
    elif kind == "paper":
        for y in range(H):
            t = y / H
            c = tuple(int(250 + (239 - 250) * t) for _ in range(3))
            dr.line([(0, y), (W, y)], fill=c)
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ds = ImageDraw.Draw(sh)
        for i in range(int(H * 0.2)):
            a = int(36 * i / max(1, H * 0.2))
            ds.line([(0, int(H * 0.8) + i), (W, int(H * 0.8) + i)], fill=(120, 105, 80, a))
        im = Image.alpha_composite(im.convert("RGBA"), sh).convert("RGB")
    elif kind == "lab":
        # 墙 + 记录纸网格（只画墙上）+ 实验台面（带前缘厚度）+ 下方压暗
        ty = int(H * 0.74)
        for y in range(ty):
            t = y / max(1, ty)
            dr.line([(0, y), (W, y)], fill=tuple(int(238 + (195 - 238) * t) if t < 0.62 else
                                                 int(219 + (195 - 219) * (t - 0.62) / 0.38) for _ in range(3)))
        st = max(26, W // 26)
        for x in range(0, W, st):
            dr.line([(x, 0), (x, ty)], fill=(90, 120, 150, 26), width=1)
        for y in range(0, ty, st):
            dr.line([(0, y), (W, y)], fill=(90, 120, 150, 26), width=1)
        dr.rectangle([0, ty, W, H], fill=(185, 198, 214))
        dr.rectangle([0, ty, W, ty + int(H * 0.016)], fill=(105, 121, 141))
        dr.line([(0, ty), (W, ty)], fill=(255, 255, 255, 140), width=1)
        for i in range(int(H * 0.1)):
            a = int(56 * i / max(1, H * 0.1)
                    )
            dr.line([(0, int(H * 0.9) + i), (W, int(H * 0.9) + i)], fill=(20, 30, 45, a))
    elif kind == "nature":
        # 天空 + 压低远山 + 草地（地面 + 横向浅纹）
        gy = int(H * 0.66)
        for y in range(gy):
            t = y / max(1, gy)
            if t < 0.7:
                r, g, b = int(94 + (169 - 94) * t / 0.7), int(166 + (207 - 166) * t / 0.7), int(221 + (232 - 221) * t / 0.7)
            else:
                tt = (t - 0.7) / 0.3
                r, g, b = int(169 + (227 - 169) * tt), int(207 + (236 - 207) * tt), int(232 + (223 - 232) * tt)
            dr.line([(0, y), (W, y)], fill=(r, g, b))
        pts = [(int(W * i / 5), int(H * (0.54 + 0.06 * math.sin(i * 1.7) + 0.03 * math.cos(i * 2.9))))
               for i in range(6)]
        dr.polygon(pts + [(W, gy), (0, gy)], fill=(74, 102, 86, 87))
        for y in range(gy, H):
            t = (y - gy) / max(1, H - gy)
            if t < 0.35:
                tt = t / 0.35
                r, g, b = int(125 + (104 - 125) * tt), int(142 + (120 - 142) * tt), int(86 + (74 - 86) * tt)
            else:
                tt = (t - 0.35) / 0.65
                r, g, b = int(104 + (61 - 104) * tt), int(120 + (72 - 120) * tt), int(74 + (47 - 74) * tt)
            dr.line([(0, y), (W, y)], fill=(r, g, b))
        for i in range(7):
            y = gy + (H - gy) * (0.12 + 0.13 * i) + (6 if i % 2 else -6)
            dr.line([(0, int(y)), (W, int(y))], fill=(255, 255, 255, 26), width=1)
    elif kind == "cabinet":
        dr.rectangle([0, 0, W, H], fill=(11, 9, 6))
        dr.ellipse([int(-W * 0.3), int(-H * 0.5), int(W * 1.3), int(H * 0.6)], fill=(58, 46, 30))
        sy = int(H * 0.80)
        dr.rectangle([0, sy, W, H], fill=(31, 25, 18))
        dr.rectangle([0, sy, W, sy + int(H * 0.012)], fill=(36, 26, 18))
        dr.line([(0, sy), (W, sy)], fill=(255, 220, 160, 51), width=1)
        for i in range(9):
            y = sy + (H - sy) * (0.18 + 0.1 * i)
            a = max(0, int(51 - i * 10))
            dr.line([(0, int(y)), (W, int(y))], fill=(255, 220, 170, a), width=1)
        vg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dv = ImageDraw.Draw(vg)
        cx, cy = W // 2, int(H * 0.46)
        r0, r1 = min(W, H) * 0.25, max(W, H) * 0.78
        for rr in range(int(r1), int(r0), -8):
            a = int(140 * (rr - r0) / max(1, r1 - r0))
            dv.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(0, 0, 0, min(140, a)), width=9)
        im = Image.alpha_composite(im.convert("RGBA"), vg).convert("RGB")
    # ---- 背景内容物（透过去才看得见；后面一片纯色时再透明也只是一块变色玻璃）----
    im = _backdrop_props(im, kind, W, H)
    return im


def _rnd(seed):
    """确定性伪随机（复刻 demo 的 backdropRnd）"""
    h = 2166136261
    for ch in seed:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    def f():
        nonlocal h
        h ^= h << 13; h &= 0xFFFFFFFF
        h ^= h >> 17
        h ^= h << 5; h &= 0xFFFFFFFF
        return h / 4294967296.0
    return f


def _backdrop_props(im, kind, W, H):
    dr = ImageDraw.Draw(im, "RGBA")
    R = _rnd("prop-" + kind)
    ty = int(H * 0.74) if kind == "lab" else (int(H * 0.66) if kind == "nature"
          else (int(H * 0.80) if kind == "cabinet" else None))
    if kind == "lab":
        # 直立标尺（左侧）+ 刻度
        x = int(W * 0.10); rw = max(14, W * 0.018)
        dr.rectangle([x, int(H * 0.16), x + rw, int(H * 0.60)], fill=(242, 238, 226), outline=(120, 126, 132))
        for i in range(1, 7):
            y = int(H * 0.16) + (H * 0.44) * i / 7
            dr.line([x, y, x + rw * (0.55 if i % 2 else 1.0), y], fill=(70, 76, 84), width=1)
        # 试管（斜靠右侧）
        tx, tw = int(W * 0.845), int(W * 0.055)
        dr.polygon([(tx, int(H * 0.34)), (tx + tw, int(H * 0.34)),
                    (tx + tw * 0.55, ty), (tx + tw * 0.45, ty)],
                   fill=(228, 240, 244, 210), outline=(150, 168, 176))
        dr.rectangle([tx + tw * 0.45, ty, tx + tw * 0.55, ty + int(H * 0.035)],
                     fill=(200, 214, 222))
        # 液体（下半截，浮在液面以上）
        dr.polygon([(tx + tw * 0.16, int(H * 0.50)), (tx + tw * 0.84, int(H * 0.50)),
                    (tx + tw * 0.55, ty), (tx + tw * 0.45, ty)], fill=(150, 198, 206, 190))
        # 手写标签（白底 + 灰线）
        lx, ly = int(W * 0.755), int(H * 0.27)
        dr.rectangle([lx, ly, lx + int(W * 0.15), ly + int(H * 0.10)],
                     fill=(250, 248, 240), outline=(120, 126, 132))
        for i in range(4):
            dr.line([lx + 8, ly + 12 + i * 9, lx + int(W * 0.15) * (0.55 + 0.12 * R()), ly + 12 + i * 9],
                    fill=(120, 128, 138), width=2)
    elif kind == "nature":
        gy = int(H * 0.66)
        # 草丛（底部、晶体两侧）
        for gx, gh, n in ((int(W * 0.13), int(H * 0.16), 7), (int(W * 0.87), int(H * 0.12), 6)):
            for i in range(n):
                a = -1 + i * 2.0 / (n - 1)
                dr.line([gx, gy + int(H * 0.02), gx + int(a * gh * 0.5), gy + int(H * 0.02) - gh * (0.55 + 0.45 * (1 - abs(a)))],
                        fill=(78, 108, 56, 205), width=max(2, W // 320))
        # 石子（右下）
        for i in range(3):
            px = int(W * (0.66 + 0.10 * i)); py = int(H * (0.86 + 0.02 * (i % 2)))
            rr = int(W * (0.014 + 0.010 * R()))
            dr.ellipse([px - rr, py - rr * 0.72, px + rr, py + rr * 0.72], fill=(118, 114, 106), outline=(92, 88, 82))
        # 碎草点
        for i in range(14):
            px = int(W * R()); py = gy + int((H - gy) * (0.35 + 0.6 * R()))
            dr.line([px, py, px + int(W * 0.006), py - int(H * 0.01)], fill=(150, 170, 110, 150), width=1)
    elif kind == "cabinet":
        sy = int(H * 0.80)
        # 小木块 + 手写标签（展台左右两侧）
        for i, (fx, fw) in enumerate(((int(W * 0.16), int(W * 0.10)), (int(W * 0.72), int(W * 0.13)))):
            dr.rectangle([fx, sy - int(H * 0.075), fx + fw, sy],
                         fill=(96 + int(24 * R()), 68 + int(20 * R()), 44), outline=(58, 40, 26))
            dr.line([fx, sy - int(H * 0.075), fx + fw, sy - int(H * 0.075)], fill=(140, 110, 76), width=1)
            lx, ly = fx + fw - int(W * 0.01), sy - int(H * 0.30)
            dr.rectangle([lx, ly, lx + int(W * 0.10), ly + int(H * 0.055)],
                         fill=(238, 230, 210, 235), outline=(150, 132, 104))
            for j in range(3):
                dr.line([lx + 7, ly + 11 + j * 8, lx + int(W * 0.10) * (0.5 + 0.15 * R()), ly + 11 + j * 8],
                        fill=(120, 100, 70), width=2)
    elif kind == "paper":
        # 印刷字行 + 参考圆（左上）+ 比例尺（右下）
        for i in range(4):
            y = int(H * 0.14) + i * int(H * 0.055)
            dr.line([int(W * 0.08), y, int(W * 0.38), y], fill=(150, 145, 132), width=max(2, H // 240))
        dr.ellipse([int(W * 0.66), int(H * 0.14), int(W * 0.66) + int(H * 0.20), int(H * 0.14) + int(H * 0.20)],
                   outline=(150, 145, 132), width=2)
        dr.line([int(W * 0.66) + int(H * 0.10), int(H * 0.14),
                 int(W * 0.66) + int(H * 0.10), int(H * 0.14) + int(H * 0.20)], fill=(150, 145, 132), width=1)
        rx, ry, rl = int(W * 0.70), int(H * 0.88), int(W * 0.20)
        for i in range(11):
            x = rx + rl * i / 10
            dr.line([x, ry, x, ry - int(H * (0.022 if i % 5 == 0 else 0.011))],
                    fill=(120, 115, 104), width=max(1, W // 700))
        dr.line([rx, ry, rx + rl, ry], fill=(120, 115, 104), width=1)
    return im


def draw_contact_shadow(dr, cx, floor_y, rx):
    """接触阴影：几圈同心椭圆由宽淡到窄浓叠出来（复刻 demo 的 drawContactShadow）"""
    ry = max(3, rx * 0.20)
    for i in range(1, 7):
        k = i / 6
        sc = 1.10 - 0.16 * k
        a = int(255 * (0.020 + 0.030 * k))
        dr.ellipse([cx - rx * sc, floor_y - ry * sc + ry * 0.16,
                    cx + rx * sc, floor_y + ry * sc + ry * 0.16], fill=(0, 0, 0, a))


INCL_MAT = {
    "solid":  dict(amb=0.30, diff=0.55, spec=0.55, shin=18, fres=0.30, ior=1.60, envI=0.45),
    "metal":  dict(amb=0.05, diff=0.10, spec=0.80, shin=10, fres=0.34, ior=1.00, envI=0.90, metal=1),
    "bubble": dict(amb=0.58, diff=0.28, spec=0.95, shin=42, fres=0.62, ior=1.34, envI=0.72),
}

PHI = (1 + math.sqrt(5)) / 2
INCL_SHAPES = {
    "octa": (np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], dtype=float),
             [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]),
    "cube": (np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], dtype=float),
             [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]),
    "ico":  (np.array([[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
                       [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]], dtype=float),
             [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
              (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5),
              (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]),
}

INCLUSIONS = {
    "none":     dict(zh="无", note="当前无内含物。"),
    "rutile":   dict(zh="金红石针", note="金黄针状金红石，石英中最常见的包体。", parts=[dict(shape="needle", n=10, col=(0.87, 0.69, 0.27), mat="solid", alpha=0.96, orient="c", ln=(0.60, 1.30), thk=0.030)]),
    "tourm":    dict(zh="电气石微晶", note="黑色电气石小晶体。", parts=[dict(shape="octa", n=4, col=(0.62, 0.68, 0.76), mat="solid", alpha=0.97, size=(0.16, 0.30))]),
    "pyrite":   dict(zh="黄铁矿微晶", note="立方体黄铁矿小晶，萤石里的经典包体。", parts=[dict(shape="cube", n=5, col=(0.88, 0.79, 0.45), mat="metal", alpha=0.97, size=(0.14, 0.26))]),
    "bubble":   dict(zh="气泡", note="球形气包体：亮斑小而集中。", parts=[dict(shape="ico", n=12, col=(0.93, 0.97, 1.00), mat="bubble", alpha=0.92, size=(0.075, 0.150))]),
    "fluid":    dict(zh="多相包体", note="气 + 液 + 微晶同处一个愈合空腔。", parts=[
        dict(shape="ico", n=5, col=(0.93, 0.97, 1.00), mat="bubble", alpha=0.92, size=(0.085, 0.135)),
        dict(shape="octa", n=2, col=(0.58, 0.66, 0.74), mat="solid", alpha=0.96, size=(0.07, 0.12)),
        dict(shape="needle", n=3, col=(0.86, 0.70, 0.30), mat="solid", alpha=0.94, ln=(0.18, 0.38), thk=0.014)]),
    "fracture": dict(zh="愈合裂隙", note="薄片状愈合裂隙：银白、反光强。", parts=[dict(shape="plate", n=3, col=(0.88, 0.92, 0.96), mat="solid", alpha=0.72, size=(0.24, 0.44))]),
}


def _perp(u):
    a = np.array([1.0, 0, 0]) if abs(u[0]) < 0.9 else np.array([0.0, 0, 1])
    return _u(np.cross(u, a))


def _solid_faces(loops, col, matname, alpha, center):
    out = []
    for pts in loops:
        pts = np.array(pts, dtype=float)
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        n = n / (np.linalg.norm(n) + 1e-12)
        c = pts.mean(0)
        if center is not None and float(np.dot(n, c - center)) < 0:
            pts = pts[::-1]
            n = -n
        out.append(dict(pts=pts, n=n, c=c, col=col, mat=matname, alpha=alpha))
    return out


def _ring(c, u, p1, p2, t, rr, N=6):
    return [c + u * (t) + rr * (p1 * math.cos(i * 2 * math.pi / N) + p2 * math.sin(i * 2 * math.pi / N))
            for i in range(N)]


def build_inclusions(m, planes, extent, inc, dens=0.6, seed=0):
    """与 demo 的 buildInclusions 同规则：随机位置 → 缩到能完全放进晶体内部为止"""
    if not inc or inc == "none":
        return []
    spec = INCLUSIONS[inc]
    rng = np.random.default_rng(seed)
    R0 = extent * 0.5
    cax = np.array([0.0, 0.0, 1.0])
    out = []

    def inside(p):
        for group in planes:
            if all(float(np.dot(pl_n, p)) - pl_d <= 1e-6 for (pl_n, pl_d) in group):
                return True
        return False

    for part in spec["parts"]:
        for _ in range(max(0, round(part["n"] * dens))):
            made = None
            for _try in range(24):
                c = _u([rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)]) * R0 * (0.04 + rng.uniform(0, 0.16))
                d = _u([rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)])
                if part.get("orient") == "c":
                    u = _u(d * 0.45 + cax * 0.55)
                else:
                    u = d
                for s in (1, 0.82, 0.66, 0.52, 0.4):
                    f = _build_part(part, R0 * s, c, u, inside)
                    if f:
                        made = f
                        break
                if made:
                    break
            if made:
                out.extend(made)
            else:
                # 兜底：贴着中心放一个最小的（与 demo 的 buildInclusions 行为一致）
                for s in (0.4, 0.3, 0.22, 0.16):
                    f = _build_part(part, R0 * s, np.zeros(3), cax if part.get("orient") == "c" else d, inside)
                    if f:
                        out.extend(f)
                        break
    return out


def _build_part(part, R0, c, u, inside):
    shape = part["shape"]
    if shape == "needle":
        L = R0 * (part["ln"][0] + np.random.uniform(0, 1) * (part["ln"][1] - part["ln"][0]))
        r = R0 * part["thk"]
        p1, p2 = _perp(u), np.cross(u, _perp(u))
        b, t2 = _ring(c, u, p1, p2, -0.5 * L, r), _ring(c, u, p1, p2, 0.5 * L, r * 0.34)
        loops = [[b[i], b[(i + 1) % 6], t2[(i + 1) % 6], t2[i]] for i in range(6)]
        loops += [[b[0], b[i + 1], b[i]] for i in range(1, 5)]
        loops += [[t2[0], t2[i], t2[i + 1]] for i in range(1, 5)]
    elif shape == "plate":
        s = R0 * (part["size"][0] + np.random.uniform(0, 1) * (part["size"][1] - part["size"][0]))
        p1, p2 = _perp(u), np.cross(u, _perp(u))
        th = s * 0.05
        a0 = _ring(c, u, p1, p2, -0.5 * th, s * (1 + 0 * 0), 6)
        a1 = _ring(c, u, p1, p2, 0.5 * th, s * (1 + 0 * 0), 6)
        loops = [[a0[i], a0[(i + 1) % 6], a1[(i + 1) % 6], a1[i]] for i in range(6)]
        loops += [[a0[0], a0[i + 1], a0[i]] for i in range(1, 5)]
        loops += [[a1[0], a1[i], a1[i + 1]] for i in range(1, 5)]
    else:
        s = R0 * (part["size"][0] + np.random.uniform(0, 1) * (part["size"][1] - part["size"][0]))
        V, F = INCL_SHAPES[shape]
        sc = s * (0.72 if shape == "ico" else 1.0)
        loops = [[c + sc * V[i] for i in f] for f in F]
    faces = _solid_faces(loops, part["col"], part["mat"], part["alpha"], c)
    if not all(inside(p) for f in faces for p in f["pts"]):
        return None
    return faces


TINTS = [(0.55, 0.74, 0.97), (0.97, 0.62, 0.82), (0.55, 0.92, 0.76), (0.97, 0.84, 0.55)]
CLIP_TINT = (0.58, 0.62, 0.68)


def load():
    html = open("demo/crystal.html", encoding="utf-8").read()
    return json.loads(re.search(r"const DATA = (\{.*?\});\n", html, re.S).group(1))


def load_kernel():
    """占位：内核面由 variant 几何直接导出（见 build_inclusions 调用处）"""
    return None


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


# 与 demo/crystal_template.html 的 ENV_LIGHTS / LIGHTS 保持一致
ENV_LIGHTS = [
    dict(dir=_u([-0.34, 0.62, 0.72]), col=np.array([1.00, 0.98, 0.93]), sharp=3.5, inten=0.75),
    dict(dir=_u([0.72, 0.28, 0.62]),  col=np.array([0.60, 0.72, 1.00]), sharp=26, inten=0.50),
    dict(dir=_u([0.10, -0.85, 0.50]), col=np.array([0.95, 0.78, 0.58]), sharp=2,  inten=0.26),
]
# 三盏方向光：主光 / 轮廓光（后方）/ 补光（前下）
LIGHTS = [
    dict(dir=_u([-0.34, 0.62, 0.72]),   inten=1.00, spec=1.0),
    dict(dir=_u([0.62, 0.46, -0.64]),   inten=0.60, spec=1.1),
    dict(dir=_u([-0.78, -0.32, 0.54]),  inten=0.34, spec=0.5),
]
LIGHT_SUM = sum(L["inten"] for L in LIGHTS)
LIGHT_SPEC_SUM = sum(L["inten"] * L["spec"] for L in LIGHTS)


def set_light(az, el):
    global LIGHT, LIGHTS
    ce = math.cos(el)
    LIGHT = _u([ce * math.sin(az), math.sin(el), ce * math.cos(az)])
    ENV_LIGHTS[0]["dir"] = LIGHT.copy()
    LIGHTS[0]["dir"] = LIGHT.copy()


def env_sample(r):
    out = np.zeros(3)
    for L in ENV_LIGHTS:
        k = (max(0.0, float(np.dot(r, L["dir"]))) ** L["sharp"]) * L["inten"]
        out = out + k * L["col"]
    t = max(-1.0, min(1.0, float(r[1])))
    g = 0.16 * max(0.0, t) ** 0.65 + 0.05 * max(0.0, -t) ** 0.5
    # 地平线亮带：影棚围灯在晶体边缘映出的亮环
    band = 0.17 * math.exp(-abs(t) * 5.0)
    return out + g * np.array([0.72, 0.80, 0.95]) + band * np.array([0.86, 0.91, 1.00])


def shade(base, n, c, eye, mat, tint_spec=False):
    v = eye - c
    v = v / (np.linalg.norm(v) + 1e-9)
    lam = 0.0
    sp = 0.0
    for L in LIGHTS:
        l = L["dir"]
        lam += L["inten"] * max(0.0, float(np.dot(n, l)))
        h = l + v
        h = h / (np.linalg.norm(h) + 1e-9)
        sp += L["inten"] * L["spec"] * max(0.0, float(np.dot(n, h))) ** mat["shin"]
    lam /= LIGHT_SUM
    sp = sp / LIGHT_SPEC_SUM * mat["spec"]
    b = np.array(base, dtype=float)
    amb = mat["amb"] * mat.get("ambK", 1.0)
    amb_t = mat.get("ambT", np.ones(3))
    # 与 JS shadeFace 逐字一致：环境光乘 ambT，漫反射不乘（amb_t 只调制环境光）
    col = b * (amb * amb_t + mat["diff"] * lam)
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


STRIPE = {"quartz": ("c", 4.0), "fluorite": ("diag", 5.0), "pyrite": ("edge", 3.2)}


def render(mineral_id, habit_id, mask_key, w, h, luster=None, bg="dark", striations=True,
           alpha=None, inclusion=None, dens=0.6, light=(-25, 38), yaw=0.0, pitch=0.0,
           indiv=None, on_table=False, split=0.0, split_dir=None, tint=True):
    D = load()
    m = next(x for x in D["minerals"] if x["id"] == mineral_id)
    hab = next(x for x in m["habits"] if x["id"] == habit_id)
    v = hab["variants"][mask_key] if mask_key in hab["variants"] else hab["variants"][sorted(hab["variants"])[-1]]
    P = np.array(v["v"], dtype=float).reshape(-1, 3)
    # 拆解：个体 B 沿 splitDir 平移（复刻 demo 的 twinSplit；接触型双晶两边等长）
    # 必须按「面」平移：双晶（尤其穿插型）的顶点会被两个个体共用，改顶点会把个体 A
    # 的同一个角也拽走，接缝立刻被撕成碎片（试过：萤石尖晶石律拉出满天细刺）。
    if split > 0.001 and split_dir is not None:
        sd = np.array(split_dir, dtype=float)
        sd = sd / (np.linalg.norm(sd) + 1e-12)
        off = sd * split * 1.5
    else:
        off = None
    hid = v.get("hid") or [0] * len(v["f"])
    use_whole = bool(any(hid)) and (off is not None or indiv is not None)
    faces = []
    for fi, loop in enumerate(v["f"]):
        if bool(hid[fi]) != use_whole:
            continue
        if indiv is not None and v["indiv"][fi] != indiv:
            continue
        pts = P[loop]
        if off is not None and v["indiv"][fi] == 1:
            pts = pts + off
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        n = n / (np.linalg.norm(n) + 1e-12)
        faces.append(dict(pts=pts, n=n, c=pts.mean(0), form=v["form"][fi],
                          indiv=v["indiv"][fi], clip=v["clip"][fi], loop=loop))
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
    if yaw or pitch:
        q = q_mul(q, q_axis(0, 0, 1, math.radians(yaw)))
        q = q_mul(q, q_axis(1, 0, 0, math.radians(pitch)))
        q = q / np.linalg.norm(q)
    R = q_mat(q)

    set_light(light[0], light[1])
    BG = BACKGROUNDS[bg]
    mat = dict(LUSTERS[luster or m.get("luster", "glass")])
    if alpha is None:
        alpha = 1.0 if mat.get("opaqueOnly") else TRANSP[default_transp(m)]
    mat["alpha"] = alpha
    mat["ambK"] = BG["amb"]
    mat["ambT"] = BG["amb_t"]
    # 每个个体（indiv）一组半空间 → 与 demo 的 inside() 同规则（双晶是并集）
    plane_groups = {}
    for f in faces:
        if f["form"] < 0:
            continue
        plane_groups.setdefault(f["indiv"], []).append(
            (f["n"], float(np.dot(f["n"], f["pts"][0]))))
    inc = build_inclusions(m, list(plane_groups.values()), float(np.abs(P).max()),
                           inclusion if inclusion is not None else m.get("inclusion"), dens)
    show_edges = True
    W, H = w * SS, h * SS
    bgim = draw_bg(bg, W, H).convert("RGBA")
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img, "RGBA")
    cx, cy = W / 2, H / 2
    FOC = 3.05 * min(W, H) * 0.5
    eye = np.array([0.0, 0.0, DIST])

    def proj(p):
        wp = R @ p
        z = DIST - wp[2]
        k = FOC / max(z, 0.4)
        return (cx + wp[0] * k, cy - wp[1] * k)

    # ── 放在桌面上：底边贴到桌面线 + 接触阴影（先量外框，太高就整体缩小）──
    table_y = BACKGROUNDS[bg]["table_y"] if on_table else None
    if table_y is not None:
        allwp = [R @ p for p in P]

        def _xy(wp, sc=1.0):
            k = FOC / max(DIST - wp[2], 0.4) * sc
            return (cx + wp[0] * k, cy - wp[1] * k)
        floor_y = table_y * H
        ys = [_xy(wp)[1] for wp in allwp]
        half = (max(ys) - min(ys)) / 2
        room = (floor_y - H * 0.05) / 2                  # 顶部留 5% 余量
        sc = min(1.0, room / half) if half > 0 else 1.0
        xys = [_xy(wp, sc) for wp in allwp]
        cy = floor_y - max(y for _, y in xys)            # 最低顶点贴到桌面线
        draw_contact_shadow(dr, (min(x for x, _ in xys) + max(x for x, _ in xys)) / 2,
                            floor_y, max(6.0, (max(x for x, _ in xys) - min(x for x, _ in xys)) * 0.52))
        # 缩小/平移后 proj 也要跟着变
        _proj0 = proj

        def proj(p, _sc=sc, _f=_proj0):                 # noqa: F811
            wp = R @ p
            k = FOC / max(DIST - wp[2], 0.4) * _sc
            return (cx + wp[0] * k, cy - wp[1] * k)

    # ── 本体染色层：屏幕轮廓填一层本体色，alpha 固定 0.40、不随通透度淡掉 ──
    # （少了这层，"透明度拉高"就只剩背景色，晶体直接掉色——用户反馈"颜色消失了"）
    body_hex = None
    for c in m.get("colors", []):
        if c.get("zh") != "无色":
            body_hex = c.get("hex")
            break
    if body_hex is None:
        bc = (0.55, 0.68, 0.82)
    else:
        hx = body_hex.lstrip("#")
        bc = (int(hx[0:2], 16) / 255.0, int(hx[2:4], 16) / 255.0, int(hx[4:6], 16) / 255.0)
    if tint and mat["alpha"] < 0.995 and faces:
        # 先画 L 掩膜（并集轮廓），再把颜色一次性按掩膜盖上——
        # 逐面直接填 alpha 会在重叠处叠加深色，与 JS 的 fill("nonzero") 不等价
        mask = Image.new("L", (W, H), 0)
        dm = ImageDraw.Draw(mask)
        for f in faces:
            if indiv is not None and f["indiv"] != indiv:
                continue
            pts = [proj(p) for p in f["pts"]]
            dm.polygon(pts, fill=255)
        lay = Image.new("RGBA", (W, H), tuple(int(c * 255) for c in bc) + (102,))
        bgim.paste(lay, (0, 0), mask)

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
        col = shade(base, wn, cw, eye, mat, tint_spec=(mat.get("metal", 0) == 1))
        alpha = 0.92 if not front else 1.0
        if not front:
            col = col * 0.5
        pts = [proj(p) for p in f["pts"]]
        fill = tuple(int(c * 255) for c in col) + (int(alpha * 255),)
        dr.polygon(pts, fill=fill, outline=fill, width=SS)
        if striations and front and f["form"] == 0 and mineral_id in STRIPE:
            axv, step = STRIPE[mineral_id]
            if axv == "c":
                ax = R @ np.array([0.0, 0.0, 1.0])
            elif axv == "edge":
                # 与 demo 的 inPlaneDir 同规则：把世界轴投到面内，取第一条不塌陷的
                ax = None
                for a in (np.array([1.0, 0, 0]), np.array([0.0, 1.0, 0]), np.array([0.0, 0, 1.0])):
                    d = a - wn * float(np.dot(a, wn))
                    nl0 = float(np.linalg.norm(d))
                    if nl0 > 1e-3:
                        ax = d / nl0
                        break
                if ax is None:
                    continue
            else:
                ax = R @ np.array([1.0, 1.0, 1.0])
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
    # 晶面画在透明层上，再按 mat.alpha 整体盖到「背景+阴影」之上
    # （JS 里是逐面 globalAlpha，等效于整块半透明）
    if mat["alpha"] < 0.995:
        a = img.split()[3].point(lambda v: int(v * mat["alpha"]))
        img.putalpha(a)
    bgim.paste(img, (0, 0), img)
    # 内含物最后画：在晶体之上，可见度系数 k = 0.30 + 0.70*(1 - alpha)
    # （旧版把包体画在背景层，会被半透明晶体整体吃掉 45%，这就是"内含物看不见"的根因）
    if inc and mat["alpha"] < 0.995:
        inc_items = []
        for f in inc:
            wn = R @ f["n"]
            cw = R @ f["c"]
            if float(np.dot(wn, eye - cw)) <= 0:
                continue
            inc_items.append((cw[2], f, wn, cw))
        inc_items.sort(key=lambda t: -t[0])
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        do = ImageDraw.Draw(ov, "RGBA")
        k = 0.30 + 0.70 * (1 - mat["alpha"])
        for _, f, wn, cw in inc_items:
            col = shade(f["col"], wn, cw, eye, INCL_MAT[f["mat"]])
            pts = [proj(p) for p in f["pts"]]
            fill = tuple(int(c * 255) for c in col) + (int(min(1.0, f["alpha"] * k) * 255),)
            do.polygon(pts, fill=fill, outline=fill, width=1)
        bgim.paste(ov, (0, 0), ov)
    # 转变双晶（道芬/巴西律）的域界：只画在内部，淡色 + 虚线
    dom = v.get("domain")
    if dom and len(dom) >= 3:
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        do = ImageDraw.Draw(ov, "RGBA")
        pts = [proj(np.array(p, dtype=float)) for p in dom]
        do.polygon(pts, fill=(255, 246, 214, 22))
        for i in range(len(pts)):
            a, b2 = pts[i], pts[(i + 1) % len(pts)]
            n_seg = 9
            for s in range(0, n_seg, 2):
                t0, t1 = s / n_seg, (s + 1) / n_seg
                do.line([(a[0] + (b2[0] - a[0]) * t0, a[1] + (b2[1] - a[1]) * t0),
                         (a[0] + (b2[0] - a[0]) * t1, a[1] + (b2[1] - a[1]) * t1)],
                        fill=(255, 238, 190, 150), width=2 * SS)
        bgim.paste(ov, (0, 0), ov)
    return bgim.resize((w, h), Image.LANCZOS)


# ══════════════════════════════════════════════════════════════════════════
# WebGL 阶段 A 的软件复刻：把 demo 的 GL 路径（顶点缓冲 → 顶点着色器 →
# z-buffer 光栅化 → 片元着色器 → 离屏合成）用 numpy 老老实实跑一遍。
#
# 为什么需要它：本机跑不了无头浏览器（Edge headless 退出码 13 / Chrome
# crashpad 被沙箱拦），app-check 的桩只能证明"GL 调用序列没死"，证明不了
# "画面对不对"。这个函数是唯一能让我目检 GL 路径的手段。
#
# 与 2D 画家算法的差别（也就是换 GL 的收益）：
#   ① 深度用 z-buffer，不是按面心排序——互相穿插的双晶不会再画错前后；
#   ② 高光按像素算（v 逐像素），面内是连续渐变，不是一块常数色；
#   ③ MSAA 由超采样 SS 代替（glBuild 不变，只是光栅化时多采样）。
# ══════════════════════════════════════════════════════════════════════════
TINTS = [[0.55, 0.74, 0.97], [0.97, 0.62, 0.82], [0.55, 0.92, 0.76], [0.97, 0.84, 0.55]]
CLIP_TINT = (0.58, 0.62, 0.68)


def face_color_py(f, color_mode="form", uniform=None, twin_tint=False):
    """复刻 demo 的 faceColor()"""
    if f["form"] < 0:
        return CLIP_TINT
    if color_mode == "mineral" and uniform:
        hx = uniform.lstrip("#")
        base = (int(hx[0:2], 16) / 255.0, int(hx[2:4], 16) / 255.0, int(hx[4:6], 16) / 255.0)
    else:
        base = TINTS[f["form"] % len(TINTS)]
    if f["indiv"] == 1 and twin_tint:
        base = (base[2] * 0.96, base[0] * 0.96, base[1] * 0.96)
    return base


def gl_raster(faces, R, W, H, cx, cy, FOC, mat, color_mode="form", uniform=None,
              twin_tint=False, tint_spec=False, two_sided=False, out=None, zbuf=None):
    """z-buffer 光栅化 + 片元着色器。out/zbuf 可外部传入（多面共享一个深度缓冲）。
    返回 (out, zbuf, 覆盖率)。"""
    DIST = 7.0
    eye = np.array([0.0, 0.0, DIST])
    if out is None:
        out = np.zeros((H, W, 4), dtype=float)
    if zbuf is None:
        zbuf = np.full((H, W), 1e9, dtype=float)
    # ── glBuild：扇形三角化「全部」面，不按正反面过滤（那件事在顶点着色器里做）──
    tris = []
    for f in faces:
        col = np.array(face_color_py(f, color_mode, uniform, twin_tint), dtype=float)
        L = f["pts"]
        for i in range(1, len(L) - 1):
            tris.append((L[0], L[i], L[i + 1], f["n"], col))
    # ── 顶点着色器：与 GL_VS 逐字对应 ──
    amb_t = mat.get("ambT", np.ones(3))
    for (p0, p1, p2, n, col) in tris:
        vs = []
        for p in (p0, p1, p2):
            wp = R @ p
            wn = R @ n
            front = 1.0 if float(np.dot(wn, eye - wp)) >= 0.0 else 0.0
            z = max(DIST - wp[2], 0.4)
            vs.append(dict(wp=wp, wn=wn, col=col, front=front,
                           s=(cx + wp[0] * FOC / z, cy - wp[1] * FOC / z), z=z))
        if vs[0]["front"] < 0.5 and not two_sided:
            continue                                          # 背面剔除（与 GL discard 同效）
        b = vs[0]["col"] * (0.5 if vs[0]["front"] < 0.5 else 1.0)
        alpha = 0.92 if vs[0]["front"] < 0.5 else 1.0
        nrm = vs[0]["wn"]
        (x0, y0), (x1, y1), (x2, y2) = vs[0]["s"], vs[1]["s"], vs[2]["s"]
        xmin = int(max(0, math.floor(min(x0, x1, x2))))
        xmax = int(min(W - 1, math.ceil(max(x0, x1, x2))))
        ymin = int(max(0, math.floor(min(y0, y1, y2))))
        ymax = int(min(H - 1, math.ceil(max(y0, y1, y2))))
        if xmin > xmax or ymin > ymax:
            continue
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-12:
            continue
        xs = np.arange(xmin, xmax + 1, dtype=float) + 0.5
        ys = np.arange(ymin, ymax + 1, dtype=float) + 0.5
        gx, gy = np.meshgrid(xs, ys)
        l0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / den
        l1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / den
        l2 = 1.0 - l0 - l1
        inside = (l0 >= -1e-9) & (l1 >= -1e-9) & (l2 >= -1e-9)
        if not inside.any():
            continue
        # 透视校正插值：世界坐标 / z 线性 → 除回来
        iz = np.array([1.0 / vs[0]["z"], 1.0 / vs[1]["z"], 1.0 / vs[2]["z"]])
        S = l0 * iz[0] + l1 * iz[1] + l2 * iz[2]
        wp = ((l0[..., None] * vs[0]["wp"] * iz[0] + l1[..., None] * vs[1]["wp"] * iz[1]
               + l2[..., None] * vs[2]["wp"] * iz[2]) / S[..., None])
        zpix = DIST - wp[..., 2]
        sub = zbuf[ymin:ymax + 1, xmin:xmax + 1]
        win = inside & (zpix < sub)
        if not win.any():
            continue
        zbuf[ymin:ymax + 1, xmin:xmax + 1] = np.where(win, zpix, sub)
        # ── 片元着色器：与 GL_FS 逐字对应（v 按像素，三盏灯各算一遍）──
        A = eye[None, None, :] - wp
        v = A / (np.linalg.norm(A, axis=-1, keepdims=True) + 1e-12)
        npx = nrm[None, None, :]
        lam_p = np.zeros(v.shape[:2])
        sp = np.zeros(v.shape[:2])
        for L in LIGHTS:
            l = L["dir"][None, None, :]
            lam_p = lam_p + L["inten"] * np.maximum(0.0, np.sum(npx * l, axis=-1))
            hv = l + v
            hv = hv / (np.linalg.norm(hv, axis=-1, keepdims=True) + 1e-12)
            sp = sp + L["inten"] * L["spec"] * np.maximum(0.0, np.sum(npx * hv, axis=-1)) ** mat["shin"]
        lam_p = lam_p / LIGHT_SUM
        sp = sp / LIGHT_SPEC_SUM * mat["spec"]
        d = np.sum(npx * v, axis=-1)
        r = 2.0 * d[..., None] * npx - v
        env = env_sample_vec(r)
        R0 = 1.0 if mat.get("metal") else ((mat["ior"] - 1) / (mat["ior"] + 1)) ** 2
        F = R0 + (1 - R0) * (1 - np.abs(d)) ** 5
        refl = (F * mat["envI"])[..., None]
        tint = (0.35 + 0.65 * b) if tint_spec else np.ones(3)
        fres = ((1 - np.abs(d)) ** 3 * mat.get("fres", 0) * 0.45)[..., None]
        c = (b[None, None, :] * (mat["amb"] * mat.get("ambK", 1.0) * amb_t[None, None, :]
                                 + (mat["diff"] * lam_p)[..., None])
             + tint[None, None, :] * sp[..., None]
             + (b if mat.get("metal") else np.ones(3))[None, None, :] * refl * env
             + fres * (0.55 + 0.45 * b[None, None, :]))
        c = np.clip(c, 0.0, 1.0)
        # 逐像素 alpha：高光/掠射反射是表面反射，不随透射淡掉（与 GL_FS 的 pa 同式）
        ua = mat.get("alpha", 1.0)
        surf = np.clip(sp + refl[..., 0] * 0.90 + fres[..., 0] * 1.6, 0.0, 1.0)
        pa = np.clip(ua + (1.0 - ua) * surf, 0.0, 1.0) * alpha
        o = out[ymin:ymax + 1, xmin:xmax + 1]
        o[win] = np.concatenate([c[win], pa[win][..., None]], axis=1)
    cov = float((out[..., 3] > 0).mean())
    return out, zbuf, cov


def env_sample_vec(r):
    """env_sample 的向量版：r 为 (...,3)"""
    out = np.zeros_like(r)
    for L in ENV_LIGHTS:
        k = (np.maximum(0.0, np.sum(r * L["dir"][None, None, :], axis=-1)) ** L["sharp"]) * L["inten"]
        out = out + k[..., None] * L["col"][None, None, :]
    t = np.clip(r[..., 1], -1.0, 1.0)
    g = 0.16 * np.maximum(0.0, t) ** 0.65 + 0.05 * np.maximum(0.0, -t) ** 0.5
    band = 0.17 * np.exp(-np.abs(t) * 5.0)
    return (out + g[..., None] * np.array([0.72, 0.80, 0.95])[None, None, :]
            + band[..., None] * np.array([0.86, 0.91, 1.00])[None, None, :])


def render_gl(mineral_id, habit_id, mask_key=None, w=900, h=700, luster=None, bg="dark",
              light=(-25, 38), yaw=0.0, pitch=0.0, on_table=False, alpha=None,
              color_mode="form", uniform=None, twin_tint=False, tint_spec=False,
              split=0.0, split_dir=None, indiv=None, inclusion=None, dens=0.6):
    """GL 路径的完整复刻：背景 → z-buffer 光栅化（多面共享一个 zbuf）→ 按 alpha 合成。
    不含内含物/晶纹/棱线（那些留在 Canvas 2D，见 demo 的 paintOverlay）。"""
    D = load()
    m = next(x for x in D["minerals"] if x["id"] == mineral_id)
    hab = next(x for x in m["habits"] if x["id"] == habit_id)
    if mask_key is None:
        mask_key = sorted(hab["variants"])[-1]
    v = hab["variants"][mask_key] if mask_key in hab["variants"] else hab["variants"][sorted(hab["variants"])[-1]]
    P = np.array(v["v"], dtype=float).reshape(-1, 3)
    if split > 0.001 and split_dir is not None:
        sd = np.array(split_dir, dtype=float)
        sd = sd / (np.linalg.norm(sd) + 1e-12)
        off = sd * split * 1.5
    else:
        off = None
    faces = []
    for fi, loop in enumerate(v["f"]):
        if indiv is not None and v["indiv"][fi] != indiv:
            continue
        pts = P[loop]
        if off is not None and v["indiv"][fi] == 1:
            pts = pts + off
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        n = n / (np.linalg.norm(n) + 1e-12)
        faces.append(dict(pts=pts, n=n, c=pts.mean(0), form=v["form"][fi],
                          indiv=v["indiv"][fi], clip=v["clip"][fi], loop=loop))

    q = Q_VIEW
    if hab.get("view") and hab["view"].get("yaw") is not None:
        q = q_mul(Q_VIEW, q_axis(0, 0, 1, math.radians(hab["view"]["yaw"])))
        q = q / np.linalg.norm(q)
    if yaw or pitch:
        q = q_mul(q, q_axis(0, 0, 1, math.radians(yaw)))
        q = q_mul(q, q_axis(1, 0, 0, math.radians(pitch)))
        q = q / np.linalg.norm(q)
    R = q_mat(q)

    set_light(light[0], light[1])
    BG = BACKGROUNDS[bg]
    mat = dict(LUSTERS[luster or m.get("luster", "glass")])
    if alpha is None:
        alpha = 1.0 if mat.get("opaqueOnly") else TRANSP[default_transp(m)]
    mat["alpha"] = alpha                      # gl_raster 逐像素 alpha 要用
    mat["ambK"] = BG["amb"]
    mat["ambT"] = BG["amb_t"]
    W, H = w * SS, h * SS
    bgim = draw_bg(bg, W, H).convert("RGBA")
    cx, cy = W / 2, H / 2
    FOC = 3.05 * min(W, H) * 0.5
    table_y = BG["table_y"] if on_table else None
    if table_y is not None:
        allwp = [R @ p for p in P]

        def _xy(wp, sc=1.0):
            k = FOC / max(DIST - wp[2], 0.4) * sc
            return (cx + wp[0] * k, cy - wp[1] * k)
        floor_y = table_y * H
        ys = [_xy(wp)[1] for wp in allwp]
        half = (max(ys) - min(ys)) / 2
        room = (floor_y - H * 0.05) / 2
        sc = min(1.0, room / half) if half > 0 else 1.0
        xys = [_xy(wp, sc) for wp in allwp]
        cy = floor_y - max(y for _, y in xys)
        FOC = FOC * sc
    # twoSided：有补盖面或开形（与 demo 的 uTwoSided 同条件）
    two_sided = any(f["clip"] == 1 for f in faces) or not v.get("closed", True)
    layer = np.zeros((H, W, 4), dtype=float)
    zbuf = np.full((H, W), 1e9, dtype=float)
    layer, zbuf, cov = gl_raster(faces, R, W, H, cx, cy, FOC, mat,
                                 color_mode=color_mode, uniform=uniform, twin_tint=twin_tint,
                                 tint_spec=tint_spec, two_sided=two_sided,
                                 out=layer, zbuf=zbuf)
    lay = Image.fromarray((np.clip(layer, 0, 1) * 255).astype(np.uint8), "RGBA")
    if alpha < 0.995:
        a = lay.split()[3].point(lambda val: int(val * alpha))
        lay.putalpha(a)
    bgim.paste(lay, (0, 0), lay)
    return bgim.resize((w, h), Image.LANCZOS)


def _diff_ratio(a, b):
    """两张图的平均相对差异（0..1），用于并排对照 2D 与 GL 两条路径"""
    x = np.asarray(a.convert("RGB"), dtype=float) / 255.0
    y = np.asarray(b.convert("RGB"), dtype=float) / 255.0
    if x.shape != y.shape:
        y = np.asarray(b.convert("RGB").resize((x.shape[1], x.shape[0])), dtype=float) / 255.0
    return float(np.abs(x - y).mean())


def _debug_inc(mineral_id="quartz", habit_id="prismatic", inclusion="rutile", dens=1.0):
    """打印 inc 生成/绘制链路各环节计数（排查包体不显示时用）"""
    D = load()
    m = next(x for x in D["minerals"] if x["id"] == mineral_id)
    hab = next(x for x in m["habits"] if x["id"] == habit_id)
    v = hab["variants"][sorted(hab["variants"])[-1]]
    P = np.array(v["v"], dtype=float).reshape(-1, 3)
    pg = {}
    for fi, loop in enumerate(v["f"]):
        if v["form"][fi] < 0:
            continue
        pts = P[loop]
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0]); n = n / np.linalg.norm(n)
        pg.setdefault(v["indiv"][fi], []).append((n, float(np.dot(n, pts[0]))))
    inc = build_inclusions(m, list(pg.values()), float(np.abs(P).max()), inclusion, dens)
    R = q_mat(Q_VIEW)
    eye = np.array([0.0, 0.0, DIST])
    front = [f for f in inc if float(np.dot(R @ f["n"], eye - R @ f["c"])) > 0]
    print(f"inc total={len(inc)} front={len(front)} alpha_gate={TRANSP[default_transp(m)]}")
    return inc


if __name__ == "__main__":
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "lustre":
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
    elif mode == "scene":
        # 五套背景 × 同一晶体：核对环境光/色调是否影响晶体观感
        bgs = ["dark", "lab", "nature", "cabinet", "paper"]
        T = 420
        out = Image.new("RGB", (3 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, bgk in enumerate(bgs):
            im = render("quartz", "prismatic", "111", T, T, luster="glass", bg=bgk)
            out.paste(im, ((i % 3) * T, (i // 3) * T))
            dr.text(((i % 3) * T + 12, (i // 3) * T + 8), f"石英 · 背景 {bgk}",
                    fill=(205, 214, 228), font=fnt)
        for i, bgk in enumerate(bgs):
            im = render("fluorite", "cube", "1", T, T, luster="glass", bg=bgk)
            out.paste(im, ((i % 3) * T, (i // 3 + 1) * T))
            dr.text(((i % 3) * T + 12, (i // 3 + 1) * T + 8), f"萤石 · 背景 {bgk}",
                    fill=(205, 214, 228), font=fnt)
        out.save("render/qa-scene.png")
        print("saved render/qa-scene.png")
    elif mode == "incl":
        # 六种内含物（玻璃光泽半透明，否则看不见）
        kinds = ["rutile", "tourm", "pyrite", "bubble", "fluid", "fracture"]
        T = 400
        out = Image.new("RGB", (3 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, k in enumerate(kinds):
            im = render("quartz", "prismatic", "111", T, T, luster="glass", inclusion=k)
            out.paste(im, ((i % 3) * T, (i // 3) * T))
            dr.text(((i % 3) * T + 12, (i // 3) * T + 8), f"石英 · {INCLUSIONS[k]['zh']}",
                    fill=(205, 214, 228), font=fnt)
        out.save("render/qa-incl.png")
        print("saved render/qa-incl.png")
    elif mode == "transp":
        # 通透度滑杆 0.26→1.0 阶梯（含金红石针）
        T = 360
        steps = [("全透明", 0.26), ("半透明", 0.55), ("近实", 0.80), ("不透明", 1.00)]
        out = Image.new("RGB", (2 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, (lab, a) in enumerate(steps):
            im = render("quartz", "prismatic", "111", T, T, luster="glass", alpha=a,
                        inclusion="rutile")
            out.paste(im, ((i % 2) * T, (i // 2) * T))
            dr.text(((i % 2) * T + 12, (i // 2) * T + 8), f"alpha={a:.2f} {lab}",
                    fill=(205, 214, 228), font=fnt)
        out.save("render/qa-transp.png")
        print("saved render/qa-transp.png")
    elif mode == "light":
        # 光照方位/高度：同一晶体四组角度
        T = 400
        combos = [(-25, 38, "默认 右上前"), (150, 20, "左后下"), (-90, 70, "正面高"), (60, 8, "侧下方")]
        out = Image.new("RGB", (2 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, (az, el, lab) in enumerate(combos):
            im = render("quartz", "prismatic", "111", T, T, luster="glass", light=(az, el))
            out.paste(im, ((i % 2) * T, (i // 2) * T))
            dr.text(((i % 2) * T + 12, (i // 2) * T + 8), f"az={az} el={el} {lab}",
                    fill=(205, 214, 228), font=fnt)
        out.save("render/qa-light.png")
        print("saved render/qa-light.png")
    elif mode == "twin":
        # 双晶在多个旋转角度下的外形：检查两个个体是否始终连成一体
        tiles = [
            ("quartz", "japan-twin", "1111", None),
            ("quartz", "japan-twin", "1111", 0),
            ("fluorite", "spinel-twin", "1", None),
            ("fluorite", "spinel-twin", "1", 0),
        ]
        T = 360
        yaws = [0, 45, 90, 135]
        out = Image.new("RGB", (len(yaws) * T, len(tiles) * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for r, (mi, hi, mk, iv) in enumerate(tiles):
            for c, yw in enumerate(yaws):
                im = render(mi, hi, mk, T, T, luster="glass", yaw=yw, indiv=iv)
                out.paste(im, (c * T, r * T))
                lab = f"{mi} {hi}" + (f" 仅个体{'A' if iv == 0 else 'B'}" if iv is not None else " 双晶")
                dr.text((c * T + 12, r * T + 8), f"{lab} yaw={yw}",
                        fill=(205, 214, 228), font=fnt)
        out.save("render/qa-twin.png")
        print("saved render/qa-twin.png")
    elif mode == "table":
        # 「放在桌面上」：五套场景 × 贴合 + 接触阴影，检查是否浮空/是否被切顶
        T = 380
        tiles = [
            ("fluorite", "cube", "1", "lab", "萤石 · 实验台"),
            ("quartz", "prismatic", "111", "nature", "石英 · 草地"),
            ("fluorite", "spinel-twin", "1", "cabinet", "萤石尖晶石律 · 藏品柜"),
            ("quartz", "japan-twin", "1111", "paper", "石英日本律 · 纸面"),
        ]
        out = Image.new("RGB", (2 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, (mi, hi, mk, bgk, lab) in enumerate(tiles):
            im = render(mi, hi, mk, T, T, luster="glass", bg=bgk, on_table=True)
            out.paste(im, ((i % 2) * T, (i // 2) * T))
            dr.text(((i % 2) * T + 12, (i // 2) * T + 8), lab, fill=(205, 214, 228), font=fnt)
        out.save("render/qa-table.png")
        print("saved render/qa-table.png")
    elif mode == "sweep":
        # 细粒度旋转扫描：日本律双晶 12 个方位角 + 3 个俯仰角，找"旋转出错"的角度
        T = 300
        yaws = [i * 30 for i in range(12)]
        pits = [0, 25, -25]
        rows = [("quartz", "japan-twin", "1111", None, "日本律双晶"),
                ("fluorite", "spinel-twin", "1", None, "萤石尖晶石律")]
        out = Image.new("RGB", (len(yaws) * T, len(rows) * len(pits) * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(16)
        for ri, (mi, hi, mk, iv, lab) in enumerate(rows):
            for pi, pt in enumerate(pits):
                for ci, yw in enumerate(yaws):
                    im = render(mi, hi, mk, T, T, luster="glass", yaw=yw, pitch=pt, indiv=iv)
                    out.paste(im, (ci * T, (ri * len(pits) + pi) * T))
                    dr.text((ci * T + 10, (ri * len(pits) + pi) * T + 8),
                            f"{lab} yaw={yw} pitch={pt}", fill=(205, 214, 228), font=fnt)
        out.save("render/qa-sweep.png")
        print("saved render/qa-sweep.png")
    elif mode == "twins":
        # 四种双晶并排：萤石尖晶石律 / 石英日本律 / 石英道芬律 / 石英巴西律
        tiles = [
            ("fluorite", "spinel-twin", "1", "萤石 · 尖晶石律（贯穿 [111]）"),
            ("quartz", "japan-twin", "1111", "石英 · 日本律（{11-22} 接触）"),
            ("quartz", "dauphine-twin", "111", "石英 · 道芬律（绕 c 180°）"),
            ("quartz", "brazil-twin", "111", "石英 · 巴西律（{11-20} 镜面）"),
        ]
        T = 460
        out = Image.new("RGB", (2 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(18)
        for i, (mi, hi, mk, label) in enumerate(tiles):
            im = render(mi, hi, mk, T, T, luster="glass")
            out.paste(im, ((i % 2) * T, (i // 2) * T))
            dr.text(((i % 2) * T + 14, (i // 2) * T + 10), label, fill=(205, 214, 228), font=fnt)
        out.save("render/qa-twins.png")
        print("saved render/qa-twins.png")
    elif mode == "sheet":
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
    elif mode == "domain":
        # 转变双晶：道芬律（域界 ⟂c）与巴西律（域界 ∥{11-20}）。
        # 外部晶形与单晶完全一样——这正是重点：两个律都看不出双晶，
        # 域界是"切开才看得见"的示意，所以图里只有晶体内部一条虚线。
        T = 480
        out = Image.new("RGB", (4 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        tiles = [
            ("quartz", "dauphine-twin", "111", 0, "道芬律 yaw=0（域界 ⟂c）"),
            ("quartz", "dauphine-twin", "111", 55, "道芬律 yaw=55"),
            ("quartz", "brazil-twin", "111", 0, "巴西律 yaw=0（域界 ∥{11-20}）"),
            ("quartz", "brazil-twin", "111", 55, "巴西律 yaw=55"),
        ]
        for i, (mi, hi, mk, yw, lab) in enumerate(tiles):
            im = render(mi, hi, mk, T, T, luster="glass", yaw=yw)
            out.paste(im, (i * T, 0))
            dr.text((i * T + 12, 8), lab, fill=(140, 200, 255), font=fnt)
        # 下排：同一习惯但不画域界（肉眼所见），用 quartz 单晶习惯对照
        for i, (mi, hi, mk, yw, lab) in enumerate([
            ("quartz", "prismatic", "111", 0, "对照：石英单晶（无域界）"),
            ("quartz", "prismatic", "111", 55, "对照：石英单晶 yaw=55"),
        ]):
            im = render(mi, hi, mk, T, T, luster="glass", yaw=yw)
            out.paste(im, (i * T, T))
            dr.text((i * T + 12, T + 8), lab, fill=(205, 214, 228), font=fnt)
        out.save("render/qa-domain.png")
        print("saved render/qa-domain.png")
    elif mode == "split":
        # 双晶拆解：滑杆 0 / 0.5 / 1.0 + 只看 A / 只看 B
        T = 400
        rows = [
            [("石英日本律 · 合在一起", dict(split=0.0)),
             ("石英日本律 · 拆开一半", dict(split=0.5)),
             ("石英日本律 · 完全拆开", dict(split=1.0))],
            [("只看个体 A", dict(indiv=0)),
             ("只看个体 B", dict(indiv=1)),
             ("萤石尖晶石律 · 拆开", dict(mi="fluorite", hi="spinel-twin", mk="1", split=1.0,
                                       split_dir=[1, 1, 1]))],
        ]
        out = Image.new("RGB", (3 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(18)
        for r, row in enumerate(rows):
            for c, (label, kw) in enumerate(row):
                mi = kw.pop("mi", "quartz"); hi = kw.pop("hi", "japan-twin")
                mk = kw.pop("mk", "1111")
                kw.setdefault("split_dir", [0.5, 0.866, 0.0])
                im = render(mi, hi, mk, T, T, luster="glass", **kw)
                out.paste(im, (c * T, r * T))
                dr.text((c * T + 14, r * T + 10), label, fill=(205, 214, 228), font=fnt)
        out.save("render/qa-split.png")
        print("saved render/qa-split.png")
    elif mode == "transp2":
        # 通透度 vs 本体色层：上排带 tint（颜色不淡掉），下排不带 tint（对照）
        T = 400
        alphas = [0.26, 0.45, 0.70]
        out = Image.new("RGB", (len(alphas) * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(18)
        for i, a in enumerate(alphas):
            for r, tn in enumerate((True, False)):
                im = render("quartz", "prismatic", "111", T, T, luster="glass",
                            bg="lab", on_table=True, alpha=a, tint=tn)
                out.paste(im, (i * T, r * T))
                lab = ("带本体色层" if tn else "无本体色层（旧行为）") + f" alpha={a:.2f}"
                dr.text((i * T + 14, r * T + 10), lab, fill=(205, 214, 228), font=fnt)
        out.save("render/qa-transp2.png")
        print("saved render/qa-transp2.png")
    elif mode == "gl":
        # WebGL 阶段 A 的复刻层：上排 GL（z-buffer + 逐像素），下排 2D（画家算法）
        # 两排必须"看起来几乎一样"——GL 路径是替换渲染，不是改内容；
        # 差异只该出现在面内渐变（逐像素 vs 常数色）与深度判据（z-buffer vs 排序）。
        T = 400
        tiles = [
            ("fluorite", "cube", "1", "glass", None, "fluorite cube / glass"),
            ("garnet", "combined", "111", "adamantine", None, "garnet combo / adamantine"),
            ("garnet", "combined", "111", "metallic", None, "garnet combo / metallic"),
            ("quartz", "japan-twin", "1111", "glass", None, "quartz Japan twin"),
            ("fluorite", "spinel-twin", "1", "glass", None, "fluorite spinel twin"),
            ("calcite", "scalenohedron", "11", "transparent", None, "calcite / transparent"),
        ]
        out = Image.new("RGB", (3 * T, 4 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, (mi, hi, mk, lu, iv, lab) in enumerate(tiles):
            kw = dict(luster=lu, indiv=iv)
            a = render_gl(mi, hi, mk, T, T, **kw)
            b = render(mi, hi, mk, T, T, **kw)
            out.paste(a, ((i % 3) * T, (i // 3) * T))
            out.paste(b, ((i % 3) * T, (i // 3 + 2) * T))
            d = _diff_ratio(a, b)
            dr.text(((i % 3) * T + 12, (i // 3) * T + 8),
                    f"GL  {lab}  差异 {d * 100:.1f}%", fill=(140, 200, 255), font=fnt)
            dr.text(((i % 3) * T + 12, (i // 3 + 2) * T + 8),
                    f"2D  {lab}", fill=(205, 214, 228), font=fnt)
            print(f"{mi}/{hi}: GL vs 2D 平均差异 {d * 100:.2f}%")
        out.save("render/qa-gl.png")
        print("saved render/qa-gl.png")
    elif mode == "newmin":
        # 第十二轮新矿物：黄铁矿（m-3 偏形）/ 钻石（adamantine）/ 黄玉（斜方柱）
        tiles = [
            ("pyrite", "cube", "1", None, "黄铁矿 · 带条纹立方体（金属光泽）"),
            ("pyrite", "pyritohedron", "1", None, "黄铁矿 · 五角十二面体（m-3 给 12 面）"),
            ("pyrite", "combo", "111", None, "黄铁矿 · 立方体+五角十二面体聚形"),
            ("diamond", "octahedron", "1", None, "钻石 · 八面体（金刚光泽）"),
            ("diamond", "combo", "111", None, "钻石 · 八面体+菱形十二面体"),
            ("topaz", "prismatic", "1111", None, "黄玉 · 斜方柱（斜方晶系）"),
        ]
        T = 400
        out = Image.new("RGB", (3 * T, 2 * T), (7, 9, 13))
        dr = ImageDraw.Draw(out)
        fnt = _font(17)
        for i, (mi, hi, mk, lu, label) in enumerate(tiles):
            im = render(mi, hi, mk, T, T, luster=lu)
            out.paste(im, ((i % 3) * T, (i // 3) * T))
            dr.text(((i % 3) * T + 12, (i // 3) * T + 8), label, fill=(205, 214, 228), font=fnt)
        out.save("render/qa-newmin.png")
        print("saved render/qa-newmin.png")
    elif mode == "":
        im = render("quartz", "japan-twin", "111", 760, 760, luster="glass")
        im.save("render/qa-twin.png")
        im2 = render("fluorite", "spinel-twin", "1", 760, 760, luster="glass")
        im2.save("render/qa-spinel.png")
        print("saved twin previews")