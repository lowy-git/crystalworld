# 绿柱石 SMORF 晶体面归属：角度指纹法（六方 6/mmm 版）
# 锚 = {0001}（描述字段给出 Tabular {001} / {001} 组合），其余方向用
# "到锚的夹角 + 同族等距" 定族。六方族轨道 = (h,k) 六旋转 × l=±l。
import sys, math, struct, itertools, json
sys.path.insert(0, "tools")
import smorf

CELL = dict(a=1, b=1, c=0.999, alpha=90, beta=90, gamma=120)   # SMORF 官方比

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

# 六方 6/mmm 候选族（3 指数）与轨道（(h,k) 六旋转 × ±l）
CANDS = [(0, 0, 1), (1, 0, 0), (1, 1, 0), (1, 0, 1), (1, 0, -1), (1, 1, 1), (2, 0, 1), (2, 1, 0)]
def hex_orbit(hkl):
    h, k, l = hkl
    rots = [(h, k), (k, -h - k), (-h - k, h), (-h, -k), (-k, h + k), (h + k, -k)]
    return {(a, b, l) for a, b in rots} | {(a, b, -l) for a, b in rots}

UNIQ, DH = {}, {}
for h in CANDS:
    ds = []
    for m in hex_orbit(h):
        n = smorf.unit_normal(m, CELL)
        if not any(abs(sum(x * y for x, y in zip(n, e))) > 0.999 for e in ds):
            ds.append(n)
    UNIQ[h] = ds
    DH[h] = smorf.d_hkl(h, CELL)
ANCHOR = (0, 0, 1)   # {0001}
ADIR = UNIQ[ANCHOR][0]

def identify(fname):
    dirs = faces_dirs(fname)
    out = []
    for n, dists in dirs:
        theta = ang(n, ADIR)
        got = []
        for hc in CANDS:
            for dc in UNIQ[hc]:
                if abs(theta - ang(dc, ADIR)) < 2.0:
                    got.append(hc); break
        kc = dists[0]
        got2 = [hc for hc in got if 0.05 < kc / DH[hc] < 12]
        out.append({"n": [round(x, 3) for x in n], "theta": round(theta, 2),
                    "d": round(sum(dists) / len(dists), 4),
                    "fam": got2[0] if len(got2) == 1 else got2})
    # 同族合并取 k 均值
    fams = {}
    for e in out:
        if isinstance(e["fam"], list): continue
        fams.setdefault(e["fam"], []).append(e["d"] / DH[e["fam"]])
    merged = {h: round(sum(ks) / len(ks), 4) for h, ks in fams.items()}
    return out, merged

results = {}
for fname in ["Beryl_MH217", "Beryl_023", "Beryl_024", "Beryl_032", "Beryl_098", "Beryl_012"]:
    ents, merged = identify(fname)
    print("=====", fname)
    for e in ents:
        print("    dir", e["n"], "theta", e["theta"], "d", e["d"], "->", e["fam"])
    print("    合并 k:", {str(h): v for h, v in sorted(merged.items(), key=lambda kv: kv[1])})
    results[fname] = {"entries": ents, "merged": {str(h): v for h, v in merged.items()}}
json.dump(results, open("tools/_beryl_id.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved tools/_beryl_id.json")
