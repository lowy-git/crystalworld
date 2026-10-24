// 生成单文件晶体库应用：node spike/make-app.mjs
import fs from "node:fs";
import { combination, twinMatrix, twinAxisMatrix, faceNormal, formPlanes, lattice, pointGroup } from "./kernel.mjs";
import { SYSTEMS, MINERALS } from "./minerals.data.mjs";

const applyM = (M, v) => M.map(r => r[0]*v[0] + r[1]*v[1] + r[2]*v[2]);
const dot = (u, v) => u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (u, v) => [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
const norm = (u) => { const l = Math.hypot(...u); return [u[0]/l, u[1]/l, u[2]/l]; };

function faceNormalOf(verts, loop) {
  const a = verts[loop[0]], b = verts[loop[1]], c = verts[loop[2]];
  return norm(cross(sub(b, a), sub(c, a)));
}

function anglesOf(verts, faces) {
  // 双晶只看第一个个体：两个个体之间的面角不属于该矿物的"特征面角"
  const ns = faces.filter(f => (f.indiv ?? 0) === 0).map(f => faceNormalOf(verts, f.loop));
  const set = new Set();
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const c = Math.max(-1, Math.min(1, dot(ns[i], ns[j])));
      const a = Math.acos(c) * 180 / Math.PI;
      if (a > 0.5 && a < 179.5) set.add(Math.round(Math.min(a, 180 - a) * 100) / 100);
    }
  return [...set].sort((x, y) => x - y).slice(0, 4);
}

// ---------- 多边形布尔：从多边形里减掉一个凸体 ----------
const clipPoly = (pts, n, D, eps = 1e-9) => {
  // 保留 n·p <= D 的部分
  const res = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const da = dot(n, a) - D, db = dot(n, b) - D;
    if (da <= eps) res.push(a);
    if ((da > eps && db < -eps) || (da < -eps && db > eps)) {
      const t = da / (da - db);
      res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return res;
};

const polyArea = (pts) => {
  // Newell 法向量的模长 / 2
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return Math.hypot(nx, ny, nz) / 2;
};

// 多边形减去凸体：按"第一个越界的半空间"切分，每块只保留一次
function subtractConvex(pts, planes, eps = 1e-9) {
  let pieces = [pts];
  const out = [];
  for (const pl of planes) {
    const next = [];
    for (const p of pieces) {
      const outside = clipPoly(p, [-pl.n[0], -pl.n[1], -pl.n[2]], -pl.D, eps);
      if (outside.length >= 3 && polyArea(outside) > 1e-7) out.push(outside);
      const inside = clipPoly(p, pl.n, pl.D, eps);
      if (inside.length >= 3) next.push(inside);
    }
    pieces = next;
    if (!pieces.length) break;
  }
  return out;
}

const orient = (pts, nRef) => {
  // 保证多边形绕序的法向与 nRef 同向（反射后绕序会反）
  const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  return dot(n, nRef) >= 0 ? pts : pts.slice().reverse();
};

// ---------- 截面 / 凸包 / 半空间切割 ----------
// 2D 凸包（Andrew 单调链）。截面用来补平底、也用来画双晶域界。
function hull2D(pts) {
  const p = pts.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

// 平面 n·x = d 与一组多边形（可非凸、可多体）的截面轮廓，返回 3D 凸包顶点
// 做法：收集所有"跨过该平面"的边与平面的交点，投影到平面内求凸包。
// 用于补平底（日本律被基质截断的底部）与画双晶域界。
function sectionFromPolys(polys, n, d) {
  const u = Math.abs(n[0]) < 0.9 ? norm(cross(n, [1, 0, 0])) : norm(cross(n, [0, 1, 0]));
  const v = cross(n, u);
  const o = [n[0] * d, n[1] * d, n[2] * d];
  const flat = [];
  const push = (p) => flat.push([dot(sub(p, o), u), dot(sub(p, o), v)]);
  for (const f of polys) {
    const pts = f.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const da = dot(n, a) - d, db = dot(n, b) - d;
      if (Math.abs(da) < 1e-9) push(a);
      if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) {
        const t = da / (da - db);
        push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
  }
  if (flat.length < 3) return [];
  const h = hull2D(flat);
  if (h.length < 3) return [];
  return h.map(([x, y]) => [o[0] + u[0] * x + v[0] * y, o[1] + u[1] * x + v[1] * y, o[2] + u[2] * x + v[2] * y]);
}

// 用半空间 n·x ≥ d 切掉底部，并补上被切出来的截面（补面必须精确贴着切口）
// 不能只用凸包：双晶并集是凹的（肘形），凸包会盖过头，留下没缝合的边 → 网格破洞。
// 正确做法：切完之后，落在切平面上的"只用过一次的边"就是洞口的边界，把它们串成环再扇形补面。
function cutWithCap(polys, n, d) {
  const kept = [];
  for (const f of polys) {
    const pts = clipPoly(f.pts, [-n[0], -n[1], -n[2]], -d);
    if (pts.length >= 3 && polyArea(pts) > 1e-7) kept.push({ ...f, pts: orient(pts, f.n) });
  }
  const onCut = (p) => Math.abs(dot(n, p) - d) < 1e-6;
  const key = (p) => `${(p[0] * 1e6).toFixed(0)},${(p[1] * 1e6).toFixed(0)},${(p[2] * 1e6).toFixed(0)}`;
  // 统计无向边的使用次数，只留下恰好用一次、且两端都在切平面上的边
  const use = new Map();
  for (const f of kept) {
    const pts = f.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ka = key(a), kb = key(b);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const rec = use.get(k);
      if (rec) rec.c++; else use.set(k, { a, b, c: 1 });
    }
  }
  const adj = new Map();
  const ptOf = new Map();
  for (const rec of use.values()) {
    if (rec.c !== 1 || !onCut(rec.a) || !onCut(rec.b)) continue;
    const ka = key(rec.a), kb = key(rec.b);
    ptOf.set(ka, rec.a); ptOf.set(kb, rec.b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push(kb); adj.get(kb).push(ka);
  }
  const seen = new Set();
  let added = 0;
  const nn = [-n[0], -n[1], -n[2]];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let cur = start, prev = null;
    while (cur && !seen.has(cur)) {
      seen.add(cur); loop.push(ptOf.get(cur));
      const nb = (adj.get(cur) || []).filter(x => x !== prev && !seen.has(x));
      prev = cur; cur = nb[0];
    }
    if (loop.length < 3) continue;
    let cx = 0, cy = 0, cz = 0;
    for (const p of loop) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const c = [cx / loop.length, cy / loop.length, cz / loop.length];
    // 必须发成三角形而不是一块扇形多边形：扇形多边形的两条"辐条边"(c→p0、pk→c)
    // 在别处没有配对，会各留一条只用一次的边 → 网格不闭合。三角形之间辐条边成对共享。
    for (let i = 0; i < loop.length; i++) {
      const tri = [c, loop[i], loop[(i + 1) % loop.length]];
      if (polyArea(tri) < 1e-9) continue;
      kept.push({ pts: orient(tri, nn), n: nn, form: -2, indiv: 0, clip: 1, cut: 1 });
      added++;
    }
  }
  // 兜底：一个洞口都没缝上时（理论上不该发生）退回凸包
  if (!added) {
    const cap = sectionFromPolys(polys, n, d);
    if (cap.length >= 3) kept.push({ pts: orient(cap, nn), n: nn, form: -2, indiv: 0, clip: 1, cut: 1 });
  }
  return kept;
}

// 一个外形在给定"可见单形掩码"下的几何
function buildGeometry(mineral, habit, mask, boxHalf) {
  const idxMap = [];
  const sub_forms = [];
  habit.forms.forEach((f, i) => {
    if ((mask >> i) & 1) { idxMap.push(i); sub_forms.push(f); }
  });
  if (!sub_forms.length) return null;

  const res = combination(mineral.cell, mineral.pointGroup, sub_forms, boxHalf ? { boxHalf } : {});
  const P = res.poly.verts;
  let domainPts = null;         // 转变双晶的域界截面（只画不参与几何）
  let wholeFaces = null;        // 贯穿双晶的"完整个体"（只在拆解/只看一个体时画）

  // 个体 A 的面（多边形点列 + 归属）
  let polys = res.poly.faces.map(f => ({
    pts: f.loop.map(i => P[i]),
    n: res.planes[f.planeIdx].n,
    form: idxMap[res.planes[f.planeIdx].formIdx],
    indiv: 0,
    clip: !!res.planes[f.planeIdx].clip,
  }));
  const planesA = res.planes.map(pl => ({ n: pl.n, D: pl.D }));

  // 双晶：整体做双晶操作得到个体 B，然后求并集（共享部分只留外表面）
  if (habit.twin && habit.twin.mode === "contact") {
    // ── 接触双晶：两个完整个体沿双晶面贴合，各在一侧 ──
    // 关键 1：镜面必须取"该晶面所在平面"（距中心 d），不能取过中心的平面——
    //         过中心平面对立方体/八面体会自映射，得到恒等变换（等于没孪晶）。
    // 关键 2：双晶面必须是该晶形的真实晶面（支撑平面上有 ≥3 个互异顶点）。
    //         · 是真实晶面 → δ=0，两块在面上严格贴合，两片重合的结合面是并集内部面，删掉；
    //         · 不是真实晶面 → δ>0，让两块重叠一片厚 δ 的板再求并集，
    //           否则两块只在一个顶点/棱上相接，旋转时看起来是两块分开的晶体。
    //         δ 平移不改变两块的长度：A 占 n·x∈[−e,d]，B 占 [d−δ, 2d+e−δ]，都是 d+e。
    const hkl = habit.twin.plane;
    const h3 = hkl.length === 4 ? [hkl[0], hkl[1], hkl[3]] : hkl;
    const n = faceNormal(h3, res.L).n;
    const allA = polys.flatMap(f => f.pts);
    const d = Math.max(...allA.map(p => dot(n, p)));            // 支撑距离
    const uniq = new Map();
    for (const p of allA) if (Math.abs(dot(n, p) - d) < 1e-4) uniq.set(p.map(x => x.toFixed(6)).join(","), 1);
    const isFacet = uniq.size >= 3;
    const delta = isFacet ? 0 : (habit.twin.delta ?? 0.06);
    const T = (p) => {                                          // 以 n·x = d 镜像，再沿 −n 平移 delta
      const s2 = 2 * (dot(n, p) - d);
      return [p[0] - n[0] * (s2 + delta), p[1] - n[1] * (s2 + delta), p[2] - n[2] * (s2 + delta)];
    };
    const nR = (v) => { const s2 = 2 * dot(n, v); return [v[0] - n[0] * s2, v[1] - n[1] * s2, v[2] - n[2] * s2]; };
    const sideB0 = polys.map(f => ({
      // 反射是反向变换：点的绕序会跟着反，必须用 orient 纠正，否则渲染端按绕序算法向，
      // 个体 B 的每个面法向都朝内 → 背面剔除把 B 的正面全砍掉，只剩发暗的"远侧面"，
      // 看起来就是两个体互相穿插/分离，且随旋转剧烈变化。
      pts: orient(f.pts.map(T), nR(f.n)),
      n: nR(f.n), form: f.form, indiv: 1, clip: f.clip,
    }));
    const tol = 1e-6;
    const onPlaneA = (f) => f.pts.every(p => Math.abs(dot(n, p) - d) < tol);
    const onPlaneB = (f) => f.pts.every(p => Math.abs(dot(n, p) - (d - delta)) < tol);
    let A = polys, B = sideB0;
    if (delta === 0) {
      // 两块严格贴合：结合面上的两片晶面都在并集内部，必须删掉，否则会盖在另一个个体上
      A = polys.filter(f => !onPlaneA(f));
      B = sideB0.filter(f => !onPlaneB(f));
      polys = [...A, ...B];
    } else {
      // 重叠并集：(∂A − B内部) ∪ (∂B − A内部)
      const planesB = planesA.map(pl => {
        const nB = nR(pl.n);
        return { n: nB, D: pl.D - delta * dot(nB, n) };
      });
      const eps2 = 1e-7;
      const inB = (p) => planesB.every(pl => dot(pl.n, p) - pl.D < -eps2);
      const inA = (p) => planesA.every(pl => dot(pl.n, p) - pl.D < -eps2);
      const out = [];
      for (const f of polys) {
        if (f.pts.every(inB)) continue;                    // 整片埋进 B 内部
        for (const pts of subtractConvex(f.pts, planesB)) out.push({ ...f, pts: orient(pts, f.n) });
      }
      for (const f of sideB0) {
        if (f.pts.every(inA)) continue;                    // 整片埋进 A 内部
        for (const pts of subtractConvex(f.pts, planesA)) out.push({ ...f, pts: orient(pts, f.n) });
      }
      polys = out;
    }
    // 日本律在自然界多半长在基质上，下方的晶头（−c 端的锥面）根本不发育。
    // 正确形态是「两支晶臂 + 底部被基质截掉的平底」，不是两个完整体晶头朝下叉开。
    // 截断面取双晶整体的"下方"（两体 c 轴的平分线反向），只削掉很低的一段：
    // 个体 A 的 c 轴与该面约成 56°，切得太深会把它沿长轴削成薄片。
    if (habit.twin.cutBottom) {
      const ax0 = [0, 0, 1], ax1 = nR(ax0);
      const s = [ax0[0] + ax1[0], ax0[1] + ax1[1], ax0[2] + ax1[2]];
      const nc = norm([-s[0], -s[1], -s[2]]);
      const ts = polys.flatMap(f => f.pts.map(p => dot(nc, p)));
      const lo = Math.min(...ts), hi = Math.max(...ts);
      polys = cutWithCap(polys, nc, lo + (hi - lo) * habit.twin.cutBottom);
    }
  } else if (habit.twin && habit.twin.mode === "domain") {
    // ── 转变双晶 / 反射双晶：外部形态与单晶完全一致 ──
    // 石英的道芬律（绕 c [0001] 180°）与巴西律（{11-20} 反射）都不改变外部晶形：
    // 双晶域界整片包在晶体内部，肉眼与普通放大镜都看不出，只能靠刻蚀或正交偏光。
    // 所以这里不复制个体、不做并集，只记下"域界截面"让渲染层画一条虚线。
    const hkl2 = habit.twin.plane;
    const h32 = hkl2.length === 4 ? [hkl2[0], hkl2[1], hkl2[3]] : hkl2;
    const nd = faceNormal(h32, res.L).n;
    const allP2 = polys.flatMap(f => f.pts);
    const dmax2 = Math.max(...allP2.map(p => dot(nd, p)));
    domainPts = sectionFromPolys(polys, nd, dmax2 * (habit.twin.domainAt ?? 0));
  } else if (habit.twin) {
    // ── 贯穿双晶：两个完整个体互相穿插，边界取并集 ──
    // mirror = 双晶面反射；axis = 绕双晶轴转 180°（二次轴）
    const T = habit.twin.mode === "mirror"
      ? (() => { const hkl = habit.twin.plane; const h3 = hkl.length === 4 ? [hkl[0], hkl[1], hkl[3]] : hkl; return twinMatrix(h3, res.L); })()
      : twinAxisMatrix(habit.twin.axis, res.L);
    const shift = [0, 0, 0];            // 贯穿双晶两个体同心，靠并集露出对方

    const polysB = polys.map(f => {
      const nB = applyM(T, f.n);
      return {
        pts: f.pts.map(v => { const w = applyM(T, v); return [w[0] + shift[0], w[1] + shift[1], w[2] + shift[2]]; }),
        n: nB,
        form: f.form,
        indiv: 1,
        clip: f.clip,
      };
    });
    const planesB = planesA.map(pl => {
      const nB = applyM(T, pl.n);
      return { n: nB, D: pl.D + dot(nB, shift) };
    });

    // 并集边界 = (∂A 去掉 B 内部) ∪ (∂B 去掉 A 内部)
    // 但"拆开 / 只看一个个体"要的是**完整个体**：并集把对方内部的那几片面删掉了，
    // 单独看就是一个开壳（萤石尖晶石律会露出满天碎三角）。所以把完整个体也带上，
    // 打 hid 标记——合在一起时不画，拆解时才画。
    const whole = [...polys.map(f => ({ ...f, indiv: 0 })), ...polysB];
    const out = [];
    for (const f of polys) {
      for (const pts of subtractConvex(f.pts, planesB)) {
        out.push({ ...f, pts: orient(pts, f.n) });
      }
    }
    for (const f of polysB) {
      for (const pts of subtractConvex(f.pts, planesA)) {
        out.push({ ...f, pts: orient(pts, f.n) });
      }
    }
    polys = out;
    wholeFaces = whole;
  }

  // 顶点去重 + 归一化：包围盒居中，最长边缩到 2
  const all = polys.flatMap(f => f.pts);
  const zs = all.map(v => v[2]), xs = all.map(v => v[0]), ys = all.map(v => v[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
  );
  const s = 2 / span;
  // 暴力焊接：容差内的点视为同一顶点（直接按网格取整会在格边界处裂开）
  const verts = [];
  const idxOf = (v) => {
    const q = [(v[0] - cx) * s, (v[1] - cy) * s, (v[2] - cz) * s];
    for (let i = 0; i < verts.length; i++) {
      const w = verts[i];
      if (Math.abs(w[0] - q[0]) < 1.5e-5 && Math.abs(w[1] - q[1]) < 1.5e-5 && Math.abs(w[2] - q[2]) < 1.5e-5) return i;
    }
    verts.push([+q[0].toFixed(5), +q[1].toFixed(5), +q[2].toFixed(5)]);
    return verts.length - 1;
  };
  const faces = polys.map(f => ({ loop: f.pts.map(idxOf), form: f.form, indiv: f.indiv, clip: f.clip, hid: 0 }));
  // 完整个体（只有贯穿双晶有）：合在一起时不画，拆开/只看个体时才画
  if (wholeFaces) {
    for (const f of wholeFaces) {
      faces.push({ loop: f.pts.map(idxOf), form: f.form, indiv: f.indiv, clip: f.clip, hid: 1 });
    }
  }
  const shownFaces = faces.filter(f => !f.hid);
  const domain = domainPts && domainPts.length >= 3
    ? domainPts.map(v => [+((v[0] - cx) * s).toFixed(5), +((v[1] - cy) * s).toFixed(5), +((v[2] - cz) * s).toFixed(5)])
    : null;
  const edges = new Set();
  for (const f of shownFaces) {
    for (let i = 0; i < f.loop.length; i++) {
      const a = f.loop[i], b = f.loop[(i + 1) % f.loop.length];
      edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    }
  }

  return {
    v: verts.flat(),
    f: faces.map(f => f.loop),
    form: faces.map(f => f.form),
    indiv: faces.map(f => f.indiv),
    clip: faces.map(f => (f.clip ? 1 : 0)),
    hid: faces.map(f => f.hid),
    closed: !res.clipped,
    domain,
    angles: anglesOf(verts, faces),
    counts: { v: verts.length, e: edges.size, f: shownFaces.length },
  };
}

const out = {
  systems: SYSTEMS.map(s => ({ ...s })),
  minerals: [],
};

for (const m of MINERALS) {
  const mg = {
    id: m.id, zh: m.zh, en: m.en, formula: m.formula,
    system: m.system, pointGroup: m.pointGroup,
    cell: m.cell, cellText: m.cellText, intro: m.intro, colors: m.colors,
    about: m.about ?? null,
    luster: m.luster ?? "glass",
    defColor: m.defColor ?? null,   // 最具代表性的颜色：换矿物时的默认染色
    transp: m.transp ?? null,
    inclusion: m.inclusion ?? null,
    confidence: m.confidence, source: m.source,
    habits: [],
  };
  for (const h of m.habits) {
    const Lh = lattice(m.cell);
    const opsh = pointGroup(m.pointGroup, Lh);
    const variants = {};
    const n = h.forms.length;
    // 接触双晶的双晶面必须是该晶形的真实晶面，否则两个体只在一个顶点/棱上相接。
    // 所以把"双晶面对应的那个单形"强制纳入每个变体。
    let forceMask = 0;
    if (h.twin && h.twin.mode === "contact" && h.twin.plane) {
      const tp = h.twin.plane.length === 4 ? [h.twin.plane[0], h.twin.plane[1], h.twin.plane[3]] : h.twin.plane;
      h.forms.forEach((f, i) => {
        const fh = f.hkl.length === 4 ? [f.hkl[0], f.hkl[1], f.hkl[3]] : f.hkl;
        let r = null, ok = true;
        for (let j = 0; j < 3; j++) {
          if (Math.abs(tp[j]) < 1e-12 && Math.abs(fh[j]) < 1e-12) continue;
          if (Math.abs(tp[j]) < 1e-12 || Math.abs(fh[j]) < 1e-12) { ok = false; break; }
          const t = fh[j] / tp[j];
          if (r === null) r = t; else if (Math.abs(t - r) > 1e-9) { ok = false; break; }
        }
        if (ok && r !== null) forceMask |= (1 << i);
      });
    }
    const masks = [];
    for (let mask = 1; mask < (1 << n); mask++) masks.push(mask | forceMask);
    // 单形多于 4 个时只算"全部"与"去掉一个"，避免体积爆炸
    const use = n <= 4 ? masks : [masks[masks.length - 1], ...masks.filter(x => x !== (1 << n) - 1)];
    // ── 参考尺寸：完整聚形的三轴半宽 ──
    // 只选部分单形时往往是开形（六方柱、菱面体单独存在都不闭合），原来按固定系数
    // 1.45×Dmax 截断，于是"只看六方柱"得到一个短粗六棱柱，而聚形里它被 r/z 面拉得
    // 很长——完全看不出聚形是怎么拼出来的（用户反馈：六方柱巨粗）。
    // 现在按完整聚形的实际尺寸截断：同一外形下不管勾选哪些单形，占的空间都一样大。
    let boxHalf = null;
    if (n > 1) {
      const allRes = combination(m.cell, m.pointGroup, h.forms);
      if (allRes.poly.verts.length) {
        boxHalf = [0, 1, 2].map(i => Math.max(...allRes.poly.verts.map(p => Math.abs(p[i]))) * 1.02);
      }
    }
    for (const mask of use) {
      const g = buildGeometry(m, h, mask, boxHalf);
      if (g) variants[mask.toString(2).padStart(n, "0")] = g;
    }
    const allKey = ((1 << n) - 1).toString(2).padStart(n, "0");
    const full = variants[allKey];

    // 双晶默认视角：让第二个个体的 c 轴落在屏幕横向，否则容易正好指向镜头
    let view = null;
    let splitDir = null;
    if (h.twin) {
      const L0 = lattice(m.cell);
      const pl = h.twin.plane;
      const h3 = pl ? (pl.length === 4 ? [pl[0], pl[1], pl[3]] : pl) : null;
      const T0 = h.twin.mode === "mirror" ? twinMatrix(h3, L0)
        : h.twin.mode === "contact" ? twinMatrix(h3, L0)
        : h.twin.mode === "domain" ? twinMatrix(h3, L0)
      : twinAxisMatrix(h.twin.axis, L0);
      const cB0 = applyM(T0, [0, 0, 1]);
      view = { yaw: +(Math.atan2(cB0[1], cB0[0]) * 180 / Math.PI).toFixed(2) };
      // 拆解方向（晶体坐标）：接触双晶沿结合面法向分开；贯穿双晶沿双晶轴分开
      splitDir = h.twin.mode === "axis"
        ? h.twin.axis.slice()
        : (h3 ? faceNormal(h3, L0).n : [0, 0, 1]);
    }
    mg.habits.push({
      id: h.id, zh: h.zh, en: h.en,
      note: h.note ?? null,
      twin: h.twin ? {
        angle: h.twin.angle, mode: h.twin.mode,
        axis: h.twin.axis ?? null,     // 贯穿双晶：二次轴方向（萤石尖晶石律 [111]）
        plane: h.twin.plane ?? null,   // 接触双晶：结合面（石英日本律 {11-22}）
        delta: h.twin.delta ?? null,
        splitDir,   // 拆解方向（晶体坐标）：接触型沿结合面法向，贯穿型沿双晶轴
        // 转变双晶（道芬/巴西律）：两个体同名、只是内部域反向，外部形态与单晶一致，
        // 所以不可拆解、也不能靠外形看出——渲染层用域界截面画一条虚线。
        noSplit: h.twin.mode === "domain",
      } : null,
      forms: h.forms.map((f, i) => ({
        idx: f.idx, zh: f.zh, en: f.en,
        // 单形的“面数”取该单形本身的晶面数（并集会把一片晶面切成多块多边形，不能直接数）
        faces: formPlanes(f.hkl, opsh, Lh, f.k ?? 1).length,
      })),
      angles: full.angles,
      view,
      counts: full.counts,
      closed: full.closed,
      variants,
    });
  }
  out.minerals.push(mg);
}

const raw = JSON.stringify(out);
const tpl = fs.readFileSync("demo/crystal_template.html", "utf8");
if (!tpl.includes("/*__DATA__*/ null")) throw new Error("template placeholder missing");
if (!tpl.includes("/*__BGIMGS__*/ null")) throw new Error("template bg placeholder missing");
// 五套场景照片：demo/bg/*.jpg → data URL 内联（仍然单文件、离线、双击即开）。
// 换图 = 替换 demo/bg/ 下同名 jpg 再跑本脚本（spike/fetch-bg.py 可重新生图）。
let bgImgs = null;
try {
  const dir = fs.readdirSync("demo/bg").filter(f => /\.jpe?g$/i.test(f)).sort();
  if (dir.length) {
    bgImgs = {};
    for (const f of dir) bgImgs[f.replace(/\.jpe?g$/i, "")] = "data:image/jpeg;base64," + fs.readFileSync(`demo/bg/${f}`).toString("base64");
  }
} catch { bgImgs = null; }
const html = tpl
  .replace("/*__DATA__*/ null", () => raw)
  .replace("/*__BGIMGS__*/ null", () => JSON.stringify(bgImgs));
fs.writeFileSync("demo/crystal.html", html);

const kb = (html.length / 1024).toFixed(1);
console.log(`wrote demo/crystal.html  ${kb} KB  (data ${(raw.length / 1024).toFixed(1)} KB)`);
for (const m of out.minerals) {
  const habits = m.habits.map(h => `${h.zh}:${h.counts.f}面/${Object.keys(h.variants).length}态`).join("  ");
  console.log(`  ${m.zh.padEnd(8, " ")} ${habits}`);
}
