# 交叉验证（参照引擎侧）：同一组用例喂 crystal_geometry，输出同格式报告
import sys, json, math
sys.path.insert(0, "tools/ref/crystal-geometry/src")
from crystal_geometry import cdl_string_to_geometry

cases = json.load(open("tools/xcheck_cases.json", encoding="utf-8"))
out = []
for c in cases:
    # CDL 组装：系统[点群]:{h k i l}@k ...（4 指数）或 {h k l}@k
    parts = []
    def fmt4(h, k, i, l):
        # 紧凑 4 指数：{10-14} 风格（负数带负号，0 也写出）
        s = str(h) + str(k if k >= 0 else "-%d" % -k) + str(i if i >= 0 else "-%d" % -i) + str(l if l >= 0 else "-%d" % -l)
        return s
    for h, k, i, l, kd in c["forms_ref"]:
        if i is not None:
            parts.append("{%s}@%.4f" % (fmt4(h, k, i, l), kd))
        else:
            s3 = ("%d%d%d" % (h, k, l)).replace("-", "-")
            s3 = "".join(("-" + str(abs(x)) if x < 0 else str(x)) for x in (h, k, l))
            parts.append("{%s}@%.4f" % (s3, kd))
    cdl = "%s[%s]:%s" % (c["system"].split("[")[0], c["system"].split("[")[1].rstrip("]"), " + ".join(parts))
    try:
        g = cdl_string_to_geometry(cdl, c_ratio=c["c_ratio"])
    except Exception as e:
        out.append({"id": c["id"], "error": str(e)[:60], "cdl": cdl}); continue
    # 面：geometry.faces 的法线与面距
    fams = {}
    for fi, loop in enumerate(g.faces):
        n = g.face_normals[fi]
        dist = abs(sum(n[i] * g.vertices[loop[0]][i] for i in range(3)))
        sig = tuple(sorted((round(abs(n[0]), 3), round(abs(n[1]), 3), round(abs(n[2]), 3)), reverse=True))
        fams.setdefault(sig, set()).add(round(dist, 4))
    out.append({
        "id": c["id"], "verts": len(g.vertices), "faces": len(g.faces),
        "families": [{"sig": list(sig), "dists": sorted(ds)} for sig, ds in fams.items()],
        "cdl": cdl,
    })
json.dump(out, open("tools/_xcheck_ref.json", "w", encoding="utf-8"), indent=1)
print("ref side done:", len(out))
