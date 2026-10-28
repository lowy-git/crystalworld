# SMORF（www.smorf.nl，Goldschmidt《晶体形态图谱》数字化库）晶型数据抓取与解析
# 用法：python tools/smorf.py <MineralName> <a> <b> <c> <alpha> <beta> <gamma> [hex4]
#   hex4 = 1 时按六方/三方 4 指数惯例输出 (hkil)
# 输出：每个晶型的 单形组（hkl, k=面距/d_hkl, 面数）——直接可写进 minerals.data.mjs
import struct, math, re, sys, json, urllib.request

BASE = "https://www.smorf.nl"

def http(url, tries=4):
    import time
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Chrome/120"})
            return urllib.request.urlopen(req, timeout=30).read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and k < tries - 1:
                time.sleep(6 * (k + 1)); continue
            raise
    raise RuntimeError("unreachable")

def crystal_names(mineral):
    html = http(BASE + "/index.php").decode("utf-8", "ignore")
    # 首页源码里有全站 leesFile('Name_N') 清单
    names = re.findall(r"leesFile\('([^']+)'\)", html)
    pre = mineral.lower() + "_"
    return sorted({n for n in names if n.lower().startswith(pre)})

def parse_bin(d):
    n4 = len(d) // 4
    ints = struct.unpack(">" + "i" * n4, d[:4 * n4])
    # 顶点流：f32 三元组，模 ∈ [0.05, 3.0]；遇到 NaN/0/超界即止
    vts, i = [], 6
    while i + 2 < n4:
        f = [struct.unpack(">f", struct.pack(">i", ints[i + k]))[0] for k in range(3)]
        if any(math.isnan(t) for t in f): break
        m = math.sqrt(sum(t * t for t in f))
        if m < 0.05 or m > 3.0: break
        if max(abs(t) for t in f) > 2.5: break
        vts.append((f[0], f[2], f[1])); i += 3   # SMORF 坐标系 y=晶轴 c，换到我们的 z-up
    # 索引流：从顶点流结束后扫到第一个"像索引"的 int（hi16 < 4096），并含 0xFFFF 分面符
    start = None
    for j in range(i, min(i + 6, n4)):
        w = ints[j]
        if ((w >> 16) & 0xFFFF) == 0xFFFF or (w & 0xFFFF) == 0xFFFF: start = j; break
        hi = (w >> 16) & 0xFFFF
        if hi < 4096 and (ints[min(j + 3, n4 - 1)] >> 16 & 0xFFFF) == 0xFFFF: start = j; break
    if start is None:
        for j in range(i, n4):
            w = ints[j]
            if ((w >> 16) & 0xFFFF) == 0xFFFF or (w & 0xFFFF) == 0xFFFF: start = j; break
    if start is None: raise ValueError("no index stream")
    u16 = []
    for j in range(start, n4):
        w = ints[j]
        u16 += [(w >> 16) & 0xFFFF, w & 0xFFFF]
    # 三角带（strip）解码：FFFF = 断带符；带内连续三元组 = 三角形
    tris = []
    for seg in [ ]: pass
    strips, cur = [], []
    for x in u16:
        if x == 0xFFFF:
            if cur: strips.append(cur); cur = []
        else: cur.append(x)
    if cur: strips.append(cur)
    for st in strips:
        for k in range(len(st) - 2):
            a, b, c = st[k], st[k + 1], st[k + 2]
            if a == b or b == c or a == c: continue
            if max(a, b, c) >= len(vts): continue
            tris.append((a, b, c))
    def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
    def faces_of():
        # 每三角形求法线+面距，按 |法线| 族归并；同一晶面（同族同距）去重后计平面数
        planes = {}
        for a, b, c in tris:
            e1 = sub(vts[b], vts[a]); e2 = sub(vts[c], vts[a])
            nx = e1[1] * e2[2] - e1[2] * e2[1]
            ny = e1[2] * e2[0] - e1[0] * e2[2]
            nz = e1[0] * e2[1] - e1[1] * e2[0]
            m = math.sqrt(nx * nx + ny * ny + nz * nz)
            if m == 0: continue
            n = (nx / m, ny / m, nz / m)
            dist = abs(n[0] * vts[a][0] + n[1] * vts[a][1] + n[2] * vts[a][2])
            sig = tuple(sorted((round(abs(n[0]), 3), round(abs(n[1]), 3), round(abs(n[2]), 3)), reverse=True))
            planes.setdefault(sig, set()).add(round(dist, 4))
        return [(sig, dist) for sig, ds in planes.items() for dist in sorted(ds)]
    return vts, faces_of()

def lattice_recip(cell):
    a, b, c = cell["a"], cell["b"], cell["c"]
    al, be, ga = (math.radians(cell[k]) for k in ("alpha", "beta", "gamma"))
    A = (a, 0, 0)
    B = (b * math.cos(ga), b * math.sin(ga), 0)
    cx = c * math.cos(be)
    cy = c * (math.cos(al) - math.cos(be) * math.cos(ga)) / math.sin(ga)
    cz = math.sqrt(max(0, c * c - cx * cx - cy * cy))
    C = (cx, cy, cz)
    def cross(u, v): return (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
    def dot(u, v): return sum(x*y for x, y in zip(u, v))
    vol = dot(A, cross(B, C))
    Ar = tuple(x / vol for x in cross(B, C))
    Br = tuple(x / vol for x in cross(C, A))
    Cr = tuple(x / vol for x in cross(A, B))
    return (Ar, Br, Cr)

def unit_normal(hkl, cell):
    ar, br, cr = lattice_recip(cell)
    h, k, l = hkl
    v = tuple(h * ar[i] + k * br[i] + l * cr[i] for i in range(3))
    m = math.sqrt(sum(x * x for x in v))
    return tuple(x / m for x in v)

def d_hkl(hkl, cell):
    ar, br, cr = lattice_recip(cell)
    h, k, l = hkl
    v = tuple(h * ar[i] + k * br[i] + l * cr[i] for i in range(3))
    return 1 / math.sqrt(sum(x * x for x in v))

def enumerate_hkl(system, lim=5):
    out = []
    R = range(-lim, lim + 1)
    for h in R:
        for k in R:
            for l in R:
                if (h, k, l) == (0, 0, 0): continue
                if system in ("trigonal", "hexagonal") and (h + k + l) % 3 != 0 and lim <= 5:
                    pass  # 允许非整指数约束的近似面，交给误差筛选
                out.append((h, k, l))
    return out

HIL = False
def analyze(name, cell, system, hex4=False, lim=5):
    global HIL
    HIL = hex4
    cands = enumerate_hkl(system, lim)
    normals = {h: unit_normal(h, cell) for h in cands}
    dh = {h: d_hkl(h, cell) for h in cands}
    report = {"name": name, "crystals": []}
    for cname in crystal_names(name):
        try:
            d = http(f"{BASE}/__crystals/{cname}.smorf.bin")
            vts, faces = parse_bin(d)
        except Exception as e:
            report["crystals"].append({"name": cname, "error": str(e)}); continue
        forms = []
        for sig, dist in faces:
            m = math.sqrt(sum(x * x for x in sig))
            nn = tuple(x / m for x in sig)
            best, bd = None, 9
            for h in cands:
                if max(abs(x) for x in h) > 3: continue          # 低指数优先
                dd = sum((a - b) ** 2 for a, b in zip(nn, normals[h]))
                dd += 0.0012 * (abs(h[0]) + abs(h[1]) + abs(h[2]))  # 指数惩罚
                if dd < bd: bd, best = dd, h
            if bd > 0.015: continue          # 只收高置信匹配
            forms.append({"hkl": best, "k": round(dist / dh[best], 4), "faces": 1,
                          "d": round(dist, 4), "err": round(bd, 4)})
        # 同 hkl 多晶面 → 合并取平均 k
        merged = {}
        for f in forms:
            key = f["hkl"]
            merged.setdefault(key, []).append(f["k"])
        def canon_hex(h, k):
            eqs = [(h, k), (k, -h - k), (-h - k, h), (-h, -k), (-k, h + k), (h + k, -k)]
            good = [e for e in eqs if e[0] >= 0 and e[1] >= 0 and e[0] >= e[1]]
            if good: return max(good, key=lambda e: (e[1], e[0]))
            good = [e for e in eqs if e[0] > 0 and e[1] < 0 and e[0] + e[1] >= 0]
            if good: return good[0]
            return (h, k)
        forms = [{"hkl": (canon_hex(h[0], h[1]) + (h[2],) if HIL else h),
                  "k": round(sum(ks) / len(ks), 4), "faces": len(ks)} for h, ks in merged.items()]
        forms.sort(key=lambda f: -f["faces"])
        report["crystals"].append({"name": cname, "verts": len(vts), "faces": len(faces), "forms": forms})
    return report

MINERALS = {
    "Quartz":       {"cell": dict(a=4.9130, b=4.9130, c=5.4052, alpha=90, beta=90, gamma=120), "system": "trigonal", "hex4": True},
    "Calcite":      {"cell": dict(a=4.9896, b=4.9896, c=17.061, alpha=90, beta=90, gamma=120), "system": "trigonal", "hex4": True},
    "Fluorite":     {"cell": dict(a=5.4626, b=5.4626, c=5.4626, alpha=90, beta=90, gamma=90), "system": "cubic", "hex4": False},
    "Pyrite":       {"cell": dict(a=5.417, b=5.417, c=5.417, alpha=90, beta=90, gamma=90), "system": "cubic", "hex4": False},
    "Garnet":       {"cell": dict(a=8.311, b=8.311, c=8.311, alpha=90, beta=90, gamma=90), "system": "cubic", "hex4": False},
    "Rhodochrosite":{"cell": dict(a=4.7774, b=4.7774, c=15.6694, alpha=90, beta=90, gamma=120), "system": "trigonal", "hex4": True},
    "Tourmaline":   {"cell": dict(a=15.849, b=15.849, c=7.103, alpha=90, beta=90, gamma=120), "system": "trigonal", "hex4": True},
    "Beryl":        {"cell": dict(a=9.215, b=9.215, c=9.192, alpha=90, beta=90, gamma=120), "system": "hexagonal", "hex4": True},
    "Scheelite":    {"cell": dict(a=5.243, b=5.243, c=11.374, alpha=90, beta=90, gamma=90), "system": "tetragonal", "hex4": False},
    "Apophyllite":  {"cell": dict(a=8.988, b=8.988, c=15.796, alpha=90, beta=90, gamma=90), "system": "tetragonal", "hex4": False},
    "Diamond":      {"cell": dict(a=3.567, b=3.567, c=3.567, alpha=90, beta=90, gamma=90), "system": "cubic", "hex4": False},
    "Apatite":      {"cell": dict(a=9.367, b=9.367, c=6.884, alpha=90, beta=90, gamma=120), "system": "hexagonal", "hex4": True},
}

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    out = {}
    names = list(MINERALS) if which == "all" else [which]
    for m in names:
        cfg = MINERALS[m]
        try:
            rep = analyze(m, cfg["cell"], cfg["system"], cfg["hex4"])
            out[m] = rep
            print(json.dumps({m: rep}, ensure_ascii=False, indent=1))
        except Exception as e:
            print(json.dumps({m: {"error": str(e)}}))
