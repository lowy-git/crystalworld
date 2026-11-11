# 正长石 SMORF 晶体面归属：双锚定角度指纹法
# 图谱帧 = 任意固定旋转的晶体帧 → 面间夹角旋转不变 →
#   两块"锚面"的夹角对上某对单形后，其余面用"到两锚的夹角对"唯一确定族。
# 锚候选限定在正长石已知单形（描述字段 + 经典文献），未识别面 = "modified" 附加面。
import sys, math, struct, itertools, json
sys.path.insert(0, "tools")
import smorf

CELL = dict(a=0.661, b=1, c=0.556, alpha=90, beta=116.07, gamma=90)

def faces_dirs(fname):
    d = open("tools/smorf_cache/" + fname + ".smorf.bin", "rb").read()
    n4 = len(d) // 4
    ints = struct.unpack(">" + "i" * n4, d[:4 * n4])
    vts, i = [], 6
    while i + 2 < n4:
        f = [struct.unpack(">f", struct.pack(">i", ints[i + kk]))[0] for kk in range(3)]
        if any(math.isnan(t) for t in f): break
        m = math.sqrt(sum(t * t for t in f))
        if m < 0.05 or m > 3.0: break
        if max(abs(t) for t in f) > 2.5: break
        vts.append((f[0], f[2], f[1])); i += 3
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
    u16 = []
    for j in range(start, n4):
        w = ints[j]
        u16 += [(w >> 16) & 0xFFFF, w & 0xFFFF]
    strips, cur = [], []
    for x in u16:
        if x == 0xFFFF:
            if cur: strips.append(cur); cur = []
        else: cur.append(x)
    if cur: strips.append(cur)
    tris = []
    for st in strips:
        for k in range(len(st) - 2):
            a, b, c = st[k], st[k + 1], st[k + 2]
            if a == b or b == c or a == c: continue
            if max(a, b, c) >= len(vts): continue
            tris.append((a, b, c))
    def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
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
        sig = (round(n[0], 3), round(n[1], 3), round(n[2], 3), round(dist, 4))
        planes[sig] = 1
    dirs = []
    for s in planes:
        n, dist = s[:3], s[3]
        hit = False
        for e in dirs:
            if abs(abs(n[0] * e[0][0] + n[1] * e[0][1] + n[2] * e[0][2]) - 1) < 0.02:
                e[1].append(dist); hit = True; break
        if not hit: dirs.append([n, [dist]])
    return dirs

def ang(a, b):
    c = max(-1, min(1, abs(sum(x * y for x, y in zip(a, b)))))
    return math.acos(c) * 180 / math.pi

# 正长石已知单形候选（描述字段 + Dana/Goldschmidt 经典清单）
CANDS = [(0, 1, 0), (0, 0, 1), (1, 0, 0), (1, 1, 0), (1, 0, 1), (2, 0, 1),
         (0, 2, 1), (1, 1, 1), (1, 3, 0), (0, 1, 1), (0, 3, 1), (2, 0, 3)]
OPS = [(1, 1, 1), (-1, 1, -1), (-1, -1, -1), (1, -1, 1)]

UNIQ, DH = {}, {}
for h in CANDS:
    ds = []
    for o in OPS:
        n = smorf.unit_normal((h[0] * o[0], h[1] * o[1], h[2] * o[2]), CELL)
        if not any(abs(sum(x * y for x, y in zip(n, e))) > 0.999 for e in ds):
            ds.append(n)
    UNIQ[h] = ds
    DH[h] = smorf.d_hkl(h, CELL)

def identify(fname):
    dirs = faces_dirs(fname)
    n = len(dirs)
    A = [[ang(dirs[i][0], dirs[j][0]) for j in range(n)] for i in range(n)]
    best = None
    for i, j in itertools.combinations(range(n), 2):
        for ha in CANDS:
            for da in UNIQ[ha]:
                for hb in CANDS:
                    if hb == ha: continue
                    for db in UNIQ[hb]:
                        if abs(A[i][j] - ang(da, db)) > 1.2: continue
                        assign = {i: ha, j: hb}
                        score = 2
                        for m in range(n):
                            if m in (i, j): continue
                            got = []
                            for hc in CANDS:
                                for dc in UNIQ[hc]:
                                    if (abs(ang(dirs[m][0], da) - ang(dc, da)) < 1.5
                                            and abs(ang(dirs[m][0], db) - ang(dc, db)) < 1.5):
                                        got.append(hc); break
                            if not got: continue
                            kc = dirs[m][1][0]
                            got2 = [hc for hc in got if 0.2 < kc / DH[hc] < 9]
                            if not got2: continue
                            assign[m] = got2[0] if len(got2) == 1 else got2
                            score += 1
                        if best is None or score > best[0]:
                            best = (score, dict(assign))
    return dirs, best

results = {}
for fname in ["Orthoclase_410", "Orthoclase_058", "Orthoclase_050", "Orthoclase_064",
              "Orthoclase_174", "Orthoclase_165", "Orthoclase_166"]:
    dirs, best = identify(fname)
    print("=====", fname, len(dirs), "方向, 识别数", best[0] if best else 0)
    if not best: continue
    fams = {}
    for i, h in best[1].items():
        if isinstance(h, list): continue
        kk = round(sum(d / DH[h] for d in dirs[i][1]) / len(dirs[i][1]), 3)
        fams.setdefault(h, {"k": [], "d": round(sum(dirs[i][1]) / len(dirs[i][1]), 3), "n": 0})
        fams[h]["k"].append(kk)
        fams[h]["n"] += 1
    out = {}
    for h, info in sorted(fams.items(), key=lambda kv: min(kv[1]["k"])):
        kmid = round(sum(info["k"]) / len(info["k"]), 3)
        print("    (%d,%d,%d) k=%s d=%s 面向数=%d" % (h[0], h[1], h[2], kmid, info["d"], info["n"]))
        out["%d,%d,%d" % h] = {"k": kmid, "d": info["d"], "n": info["n"]}
    results[fname] = out
json.dump(results, open("tools/_feldspar_id.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved tools/_feldspar_id.json")
