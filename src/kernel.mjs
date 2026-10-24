// M0 内核验证（零依赖，node spike/kernel.mjs）
// 目标：晶胞 6 参数 → 度规/倒易基 → (hkl) 面法线与 d → 点群铺面族 → 半空间求交 → 多面体
// 只验证三件事：面角、面数、消面。

const DEG = Math.PI / 180;

const cross = (u, v) => [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
const dot = (u, v) => u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
const add = (u, v) => [u[0]+v[0], u[1]+v[1], u[2]+v[2]];
const sub = (u, v) => [u[0]-v[0], u[1]-v[1], u[2]-v[2]];
const mulS = (u, s) => [u[0]*s, u[1]*s, u[2]*s];
const len = (u) => Math.hypot(u[0], u[1], u[2]);
const unit = (u) => mulS(u, 1 / len(u));
const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(unit(u), unit(v))))) / DEG;

// ---------- 1. 晶胞 → 直基 / 倒易基 ----------
export function lattice({ a, b, c, alpha, beta, gamma }) {
  const al = alpha * DEG, be = beta * DEG, ga = gamma * DEG;
  const A = [a, 0, 0];
  const B = [b * Math.cos(ga), b * Math.sin(ga), 0];
  const cx = c * Math.cos(be);
  const cy = c * (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / Math.sin(ga);
  const cz = Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy));
  const C = [cx, cy, cz];
  const vol = dot(A, cross(B, C));
  return {
    A, B, C,
    As: mulS(cross(B, C), 1 / vol),
    Bs: mulS(cross(C, A), 1 / vol),
    Cs: mulS(cross(A, B), 1 / vol),
    vol,
  };
}

// 4 指数 (hkil) → 3 指数：i 由 h,k 决定，丢掉即可
export function hkl3(hkl) {
  if (hkl.length === 4) return [hkl[0], hkl[1], hkl[3]];
  return hkl.slice(0, 3);
}

// 面法线（单位）与面间距 d = 1/|h a* + k b* + l c*|
export function faceNormal(hkl, L) {
  const [h, k, l] = hkl3(hkl);
  const n = add(add(mulS(L.As, h), mulS(L.Bs, k)), mulS(L.Cs, l));
  const l2 = len(n);
  return { n: mulS(n, 1 / l2), d: 1 / l2, raw: n };
}

// 两晶面夹角（面角 = 法线夹角）
export function interfacialAngle(h1, h2, L) {
  return ang(faceNormal(h1, L).n, faceNormal(h2, L).n);
}

// ---------- 2. 点群（3×3 正交矩阵，作用于笛卡尔坐标） ----------
const I3 = [[1,0,0],[0,1,0],[0,0,1]];
const mul = (M, N) => M.map(r => [0,1,2].map(j => r[0]*N[0][j] + r[1]*N[1][j] + r[2]*N[2][j]));
const apply = (M, v) => M.map(r => r[0]*v[0] + r[1]*v[1] + r[2]*v[2]);
const mkey = (M) => M.map(r => r.map(x => Math.round(x * 1e6)).join(',')).join(';');

function closure(gens, maxOrder = 96) {
  const seen = new Map([[mkey(I3), I3]]);
  const queue = [I3];
  while (queue.length) {
    const M = queue.pop();
    for (const G of gens) {
      for (const P of [mul(G, M), mul(M, G)]) {
        const k = mkey(P);
        if (!seen.has(k)) { seen.set(k, P); queue.push(P); }
        if (seen.size > maxOrder) throw new Error('group order overflow');
      }
    }
  }
  return [...seen.values()];
}

const inv3 = (M) => {
  // 注意：行向量叉乘得到的是列，求逆必须取 M 的列
  const c0 = [M[0][0], M[1][0], M[2][0]];
  const c1 = [M[0][1], M[1][1], M[2][1]];
  const c2 = [M[0][2], M[1][2], M[2][2]];
  const det = dot(c0, cross(c1, c2));
  return [mulS(cross(c1, c2), 1 / det), mulS(cross(c2, c0), 1 / det), mulS(cross(c0, c1), 1 / det)];
};

// 由"基矢的像"构造操作矩阵：M·A = A' 等
function opFromImages(images, L) {
  const Lm = [[L.A[0], L.B[0], L.C[0]], [L.A[1], L.B[1], L.C[1]], [L.A[2], L.B[2], L.C[2]]];
  const Im = [[images[0][0], images[1][0], images[2][0]],
              [images[0][1], images[1][1], images[2][1]],
              [images[0][2], images[1][2], images[2][2]]];
  return mul(Im, inv3(Lm));
}

export function pointGroup(name, L) {
  switch (name) {
    case 'm-3m': {           // 等轴 holohedral：48 个带符号置换矩阵
      const out = [];
      const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
      for (const p of perms) for (const s0 of [1,-1]) for (const s1 of [1,-1]) for (const s2 of [1,-1]) {
        const M = [[0,0,0],[0,0,0],[0,0,0]];
        const signs = [s0, s1, s2];
        for (let i = 0; i < 3; i++) M[i][p[i]] = signs[i];
        out.push(M);
      }
      return out;
    }
    case 'm-3': {            // 等轴偏形（黄铁矿）：T + 反演，24 阶
      // 关键：**没有** 4 重轴。所以 {210} 在这里是 12 个五边形的「五角十二面体」，
      // 而在 m-3m 里同一个 {210} 会给出 24 个面。黄铁矿的立方体面带垂直条纹，
      // 正是偏形（pyritohedral）对称的标志。
      const C3 = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];   // 绕 [111] 转 120°
      const C2x = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
      const inv = [[-1, 0, 0], [0, -1, 0], [0, 0, -1]];
      return closure([C3, C2x, inv]);
    }
    case 'mmm': {            // 斜方 holohedral：8（三个互相垂直的镜面，两个只能生成 4 阶）
      return closure([
        [[1,0,0],[0,1,0],[0,0,-1]],
        [[1,0,0],[0,-1,0],[0,0,1]],
        [[-1,0,0],[0,1,0],[0,0,1]],
      ]);
    }
    case '32': {             // 三方偏形（石英）：D3，阶 6 = E + 2C3 + 3C2
      const C3 = opFromImages([L.B, mulS(add(L.A, L.B), -1), L.C], L);
      const C2x = opFromImages([L.A, mulS(add(L.A, L.B), -1), mulS(L.C, -1)], L);
      return closure([C3, C2x]);
    }
    case '-3m': {            // 三方 holohedral：12
      const C3 = opFromImages([L.B, mulS(add(L.A, L.B), -1), L.C], L);   // A→B, B→-(A+B), C→C
      // 六方格子里的二次轴不能用 diag(1,-1,-1)：那会把 A·B 从 -a²/2 变成 +a²/2，不是等距。
      // 绕 A 轴转 180° 必须是 A→A, B→-(A+B), C→-C。
      const C2x = opFromImages([L.A, mulS(add(L.A, L.B), -1), mulS(L.C, -1)], L);
      const inv = [[-1,0,0],[0,-1,0],[0,0,-1]];
      return closure([C3, C2x, inv]);
    }
    case '4/m': {
      // 四方：C4（A→B、B→−A、C→C）＋对称中心 = 8 阶
      const C4 = opFromImages([L.B, mulS(L.A, -1), L.C], L);
      const inv = [[-1,0,0],[0,-1,0],[0,0,-1]];
      return closure([C4, inv]);
    }
    case '2/m': {
      // 单斜（b 为唯一轴）：C2 ∥ b ＋ m ⊥ b，4 阶
      const C2y = [[-1,0,0],[0,1,0],[0,0,-1]];
      const my  = [[1,0,0],[0,-1,0],[0,0,1]];
      return closure([C2y, my]);
    }
    case '-1': {
      // 三斜：只有对称中心
      return closure([[[-1,0,0],[0,-1,0],[0,0,-1]]]);
    }
    case '6/mmm': {
      // D6h：C6 ＋ 水平二次轴 ＋ 对称中心 = 24 阶
      const C6  = opFromImages([add(L.A, L.B), mulS(L.A, -1), L.C], L);            // A→A+B, B→−A
      const C2x = opFromImages([L.A, mulS(add(L.A, L.B), -1), mulS(L.C, -1)], L); // A→A, B→−A−B, C→−C
      const inv = [[-1,0,0],[0,-1,0],[0,0,-1]];
      return closure([C6, C2x, inv]);
    }
    default:
      throw new Error('point group not implemented in spike: ' + name);
  }
}

// ---------- 3. 面族：(hkl) × 点群 ----------
export function formPlanes(hkl, ops, L, k = 1) {
  const { n, d } = faceNormal(hkl, L);
  const seen = new Map();
  for (const M of ops) {
    const v = unit(apply(M, n));
    const key = v.map(x => Math.round(x * 1e7) / 1e7).join(',');
    if (!seen.has(key)) seen.set(key, { n: v, D: k * d });
  }
  return [...seen.values()];
}

// ---------- 3.5 闭合性判断 + 双晶操作 ----------
// 每条棱恰好被两个面共用 → 闭合；开形（柱、底轴面等）会有只出现一次的棱
export function isClosedPoly(poly) {
  const cnt = new Map();
  for (const f of poly.faces) {
    for (let i = 0; i < f.loop.length; i++) {
      const a = f.loop[i], b = f.loop[(i + 1) % f.loop.length];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
  }
  return [...cnt.values()].every(c => c === 2);
}

// 双晶操作（都在笛卡尔坐标里，返回 3×3 矩阵）
// 反射双晶：T = I − 2 u uᵀ，u 为双晶面法线
export function twinMatrix(hkl, L) {
  const u = unit(faceNormal(hkl, L).n);
  return [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) - 2 * u[i] * u[j]));
}

// 二次轴双晶：T = 2 u uᵀ − I，u 为双晶轴方向（晶格方向 [uvw]）
export function twinAxisMatrix(uvw, L) {
  const v = add(add(mulS(L.A, uvw[0]), mulS(L.B, uvw[1])), mulS(L.C, uvw[2]));
  const u = unit(v);
  return [0, 1, 2].map(i => [0, 1, 2].map(j => 2 * u[i] * u[j] - (i === j ? 1 : 0)));
}

// 双晶后两晶体的 c 轴夹角（度）——用来核对"著名晶轴夹角"
export function twinCAngle(T) {
  const cA = [0, 0, 1];
  const cB = apply(T, cA);
  const a = ang(cA, cB);
  return { raw: a, acute: Math.min(a, 180 - a) };
}

// ---------- 4. 半空间求交 ----------
export function buildPolyhedron(planes) {
  const Dmax = Math.max(...planes.map(p => Math.abs(p.D)));
  const tol = 1e-7 * Dmax;

  // 候选顶点：所有三元组
  const verts = [];
  const pushVert = (x) => {
    for (let i = 0; i < verts.length; i++) if (len(sub(verts[i], x)) < 1e-6 * Dmax) return i;
    verts.push(x);
    return verts.length - 1;
  };
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const det = dot(planes[i].n, cross(planes[j].n, planes[k].n));
        if (Math.abs(det) < 1e-9) continue;
        const x = mulS(add(add(
          mulS(cross(planes[j].n, planes[k].n), planes[i].D),
          mulS(cross(planes[k].n, planes[i].n), planes[j].D)),
          mulS(cross(planes[i].n, planes[j].n), planes[k].D)), 1 / det);
        let ok = true;
        for (const p of planes) if (dot(p.n, x) > p.D + tol) { ok = false; break; }
        if (ok) pushVert(x);
      }
    }
  }

  // 面：落在同一平面上的顶点，按绕法线角度排序
  const faces = [];
  planes.forEach((p, pi) => {
    const idx = [];
    verts.forEach((v, vi) => { if (Math.abs(dot(p.n, v) - p.D) < 1e-6 * Dmax) idx.push(vi); });
    if (idx.length < 3) return;
    const c = mulS(idx.reduce((s, vi) => add(s, verts[vi]), [0,0,0]), 1 / idx.length);
    let u = sub(verts[idx[0]], c);
    u = unit(sub(u, mulS(p.n, dot(u, p.n))));
    const w = cross(p.n, u);
    const sorted = idx.slice().sort((x, y) => {
      const dx = sub(verts[x], c), dy = sub(verts[y], c);
      return Math.atan2(dot(dx, w), dot(dx, u)) - Math.atan2(dot(dy, w), dot(dy, u));
    });
    // 朝向：多边形法线应与 p.n 同向
    const v0 = verts[sorted[0]], v1 = verts[sorted[1]], v2 = verts[sorted[2]];
    if (dot(cross(sub(v1, v0), sub(v2, v0)), p.n) < 0) sorted.reverse();
    faces.push({ planeIdx: pi, n: p.n, D: p.D, loop: sorted });
  });

  // 棱
  const edgeSet = new Set();
  for (const f of faces) {
    for (let i = 0; i < f.loop.length; i++) {
      const a = f.loop[i], b = f.loop[(i + 1) % f.loop.length];
      edgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    }
  }

  return { verts, faces, edges: [...edgeSet], euler: verts.length - edgeSet.size + faces.length };
}

// ---------- 5. 组合：多组晶形叠成一个多面体 ----------
export function combination(cell, groupName, forms, opts = {}) {
  const L = lattice(cell);
  const ops = pointGroup(groupName, L);
  const planes = [];
  forms.forEach((f, fi) => {
    for (const p of formPlanes(f.hkl, ops, L, f.k ?? 1)) planes.push({ ...p, formIdx: fi, clip: false });
  });
  let poly = buildPolyhedron(planes);
  let clipped = false;
  if ((poly.faces.length === 0 || !isClosedPoly(poly)) && opts.box !== false) {
    // 开形：半空间交集无界。用辅助方盒截断，截出来的面标 clip，渲染时区别对待。
    // boxHalf 给了就按它取（各轴可以不同）：只选部分单形时，必须按**完整聚形**的
    // 尺寸去截断，否则"只看六方柱"会得到一个短粗六棱柱，而聚形里它被菱面体面
    // 拉得很长——用户就看不到"聚形是怎么拼出来的"。
    const H = (opts.boxScale ?? 1.45) * Math.max(...planes.map(p => p.D));
    const BH = opts.boxHalf && opts.boxHalf.length === 3 ? opts.boxHalf : [H, H, H];
    const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    AX.forEach((n, i) => planes.push({ n, D: BH[i >> 1], formIdx: -1, clip: true }));
    poly = buildPolyhedron(planes);
    clipped = true;
  }
  const visible = forms.map((_, fi) => poly.faces.filter(f => planes[f.planeIdx].formIdx === fi).length);
  const clipFaces = poly.faces.filter(f => planes[f.planeIdx].clip).length;
  return { L, ops, planes, poly, visible, clipped, clipFaces };
}

// ---------- 6. 报告 ----------
const f2 = (x) => x.toFixed(2);
const dms = (x) => {
  const d = Math.floor(x), m = Math.round((x - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′`;
};

function uniqueAngles(planes) {
  const out = new Set();
  for (let i = 0; i < planes.length; i++)
    for (let j = i + 1; j < planes.length; j++) {
      const a = ang(planes[i].n, planes[j].n);
      out.add(Math.round(a * 100) / 100);
    }
  return [...out].sort((a, b) => a - b);
}

// 直接被 node 执行时才打印报告；被 import 时保持安静
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/spike/kernel.mjs');
if (isMain) {
console.log('=== M0 内核验证 ===\n');

// A. 等轴：面数锚点
{
  const cell = { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 };
  const L = lattice(cell);
  const ops = pointGroup('m-3m', L);
  console.log(`[A] 等轴 m-3m 群阶 = ${ops.length}（期望 48）`);
  for (const hkl of [[1,0,0], [1,1,0], [1,1,1], [3,2,1], [2,1,0]]) {
    const planes = formPlanes(hkl, ops, L);
    console.log(`    {${hkl.join('')}} → ${planes.length} 面  d = ${faceNormal(hkl, L).d.toFixed(4)}`);
  }
  // 面角锚点：{111} 与 {100}
  console.log(`    ∠{111}:{100} = ${f2(interfacialAngle([1,1,1], [1,0,0], L))}°（期望 54.74°）`);
  console.log(`    ∠{111}:{1-11} = ${f2(interfacialAngle([1,1,1], [1,-1,1], L))}°（期望 70.53°）`);
}

// B. 斜方 mmm：{111} = 8 面
{
  const cell = { a: 4.6, b: 5.0, c: 6.2, alpha: 90, beta: 90, gamma: 90 };
  const L = lattice(cell);
  const ops = pointGroup('mmm', L);
  console.log(`\n[B] 斜方 mmm 群阶 = ${ops.length}（期望 8），{111} → ${formPlanes([1,1,1], ops, L).length} 面`);
}

// C. 三方 -3m（六方轴）+ 方解石面角
{
  const cell = { a: 4.99, b: 4.99, c: 17.06, alpha: 90, beta: 90, gamma: 120 };
  const L = lattice(cell);
  const ops = pointGroup('-3m', L);
  console.log(`\n[C] 三方 -3m 群阶 = ${ops.length}（期望 12）`);
  for (const hkl of [[0,0,1], [1,0,0], [1,0,1], [1,0,2], [1,0,4]]) {
    const p = formPlanes(hkl, ops, L);
    const a = uniqueAngles(p);
    console.log(`    {${hkl.join('')}} → ${p.length} 面，面角集合: ${a.map(f2).join(' / ')}`);
  }
  const poly = combination(cell, '-3m', [{ hkl: [1,0,1], k: 1 }]);
  console.log(`    {10-11} 多面体：V=${poly.poly.verts.length} E=${poly.poly.edges.length} F=${poly.poly.faces.length} 欧拉=${poly.poly.euler}`);
}

// D. 消面：立方 + 八面体（k 是"该晶形到中心的距离倍率"，不是面大小）
{
  const cell = { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 };
  const run = (k2, note) => {
    const r = combination(cell, 'm-3m', [{ hkl: [1,0,0], k: 1 }, { hkl: [1,1,1], k: k2 }]);
    return `k={111}:${k2} (${note}) → 可见面 ${r.visible.join('/')}，V=${r.poly.verts.length} E=${r.poly.edges.length} F=${r.poly.faces.length} 欧拉=${r.poly.euler}`;
  };
  console.log('\n[D] 消面（立方 k=1 + 八面体；k=2 时八面体面过立方体棱中点 → 立方八面体）：');
  console.log('    ' + run(2, '等棱截角'));
  console.log('    ' + run(10, '立方吞掉八面体'));
  console.log('    ' + run(0.1, '八面体缩到立方体内'));
}

// E. 反查：哪个 (hkl) 面角能到 74°55′
{
  const cell = { a: 4.99, b: 4.99, c: 17.06, alpha: 90, beta: 90, gamma: 120 };
  const L = lattice(cell);
  const ops = pointGroup('-3m', L);
  const target = 74 + 55 / 60;
  const hits = [];
  for (let h = -4; h <= 4; h++) for (let k = -4; k <= 4; k++) for (let l = -12; l <= 12; l++) {
    if (h === 0 && k === 0 && l === 0) continue;
    if (k < 0 || (k === 0 && h < 0)) continue;   // 只取代表
    const p = formPlanes([h,k,l], ops, L);
    for (const a of uniqueAngles(p)) if (Math.abs(a - target) < 0.15) hits.push(`{${h}${k}${l}} → ${f2(a)}°`);
  }
  console.log(`\n[E] 反查面角 ≈ ${f2(target)}° 的单形：${hits.length ? hits.slice(0, 12).join(' | ') : '（无）'}`);
}
} // end isMain

export { f2, dms, uniqueAngles };
