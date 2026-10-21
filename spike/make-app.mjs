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

// 一个外形在给定"可见单形掩码"下的几何
function buildGeometry(mineral, habit, mask) {
  const idxMap = [];
  const sub_forms = [];
  habit.forms.forEach((f, i) => {
    if ((mask >> i) & 1) { idxMap.push(i); sub_forms.push(f); }
  });
  if (!sub_forms.length) return null;

  const res = combination(mineral.cell, mineral.pointGroup, sub_forms);
  const P = res.poly.verts;

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
    // ── 接触双晶：两个完整个体沿双晶面（真实晶面）贴合，各在一侧 ──
    // 关键：双晶面取"该晶面所在平面"（距中心 d），不是过中心的平面；
    // 这样 A 整体在 n·x ≤ d，B = 以该面镜像后落在 n·x ≥ d，两块都完整、等长。
    const hkl = habit.twin.plane;
    const h3 = hkl.length === 4 ? [hkl[0], hkl[1], hkl[3]] : hkl;
    const n = faceNormal(h3, res.L).n;
    const d = Math.max(...polys.flatMap(f => f.pts.map(p => dot(n, p))));  // 支撑距离
    const T = (p) => {                                  // 以 n·x = d 为镜面反射
      const s2 = 2 * (dot(n, p) - d);
      return [p[0] - n[0] * s2, p[1] - n[1] * s2, p[2] - n[2] * s2];
    };
    const nR = (v) => { const s2 = 2 * dot(n, v); return [v[0] - n[0] * s2, v[1] - n[1] * s2, v[2] - n[2] * s2]; };
    const eps = 2e-4;
    const sideB = polys.map(f => ({
      pts: f.pts.map(p => { const q = T(p); return [q[0] + n[0] * eps, q[1] + n[1] * eps, q[2] + n[2] * eps]; }),
      n: nR(f.n), form: f.form, indiv: 1, clip: f.clip,
    }));
    polys = [...polys, ...sideB];
  } else if (habit.twin) {
    // ── 贯穿双晶：两个完整个体互相穿插，边界取并集 ──
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
  const faces = polys.map(f => ({ loop: f.pts.map(idxOf), form: f.form, indiv: f.indiv, clip: f.clip }));
  const edges = new Set();
  for (const f of faces) {
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
    closed: !res.clipped,
    angles: anglesOf(verts, faces),
    counts: { v: verts.length, e: edges.size, f: faces.length },
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
    luster: m.luster ?? "glass",
    inclusion: m.inclusion ?? null,
    confidence: m.confidence, source: m.source,
    habits: [],
  };
  for (const h of m.habits) {
    const Lh = lattice(m.cell);
    const opsh = pointGroup(m.pointGroup, Lh);
    const variants = {};
    const n = h.forms.length;
    const masks = [];
    for (let mask = 1; mask < (1 << n); mask++) masks.push(mask);
    // 单形多于 4 个时只算"全部"与"去掉一个"，避免体积爆炸
    const use = n <= 4 ? masks : [masks[masks.length - 1], ...masks.filter(x => x !== (1 << n) - 1)];
    for (const mask of use) {
      const g = buildGeometry(m, h, mask);
      if (g) variants[mask.toString(2).padStart(n, "0")] = g;
    }
    const allKey = ((1 << n) - 1).toString(2).padStart(n, "0");
    const full = variants[allKey];

    // 双晶默认视角：让第二个个体的 c 轴落在屏幕横向，否则容易正好指向镜头
    let view = null;
    if (h.twin) {
      const L0 = lattice(m.cell);
      const pl = h.twin.plane;
      const h3 = pl ? (pl.length === 4 ? [pl[0], pl[1], pl[3]] : pl) : null;
      const T0 = h.twin.mode === "mirror" ? twinMatrix(h3, L0)
        : h.twin.mode === "contact" ? twinMatrix(h3, L0)
        : twinAxisMatrix(h.twin.axis, L0);
      const cB0 = applyM(T0, [0, 0, 1]);
      view = { yaw: +(Math.atan2(cB0[1], cB0[0]) * 180 / Math.PI).toFixed(2) };
    }
    mg.habits.push({
      id: h.id, zh: h.zh, en: h.en,
      note: h.note ?? null,
      twin: h.twin ? { angle: h.twin.angle, mode: h.twin.mode } : null,
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
const html = tpl.replace("/*__DATA__*/ null", () => raw);
fs.writeFileSync("demo/crystal.html", html);

const kb = (html.length / 1024).toFixed(1);
console.log(`wrote demo/crystal.html  ${kb} KB  (data ${(raw.length / 1024).toFixed(1)} KB)`);
for (const m of out.minerals) {
  const habits = m.habits.map(h => `${h.zh}:${h.counts.f}面/${Object.keys(h.variants).length}态`).join("  ");
  console.log(`  ${m.zh.padEnd(8, " ")} ${habits}`);
}
