// 逐条探针：每种矿物的每个外形能不能算出来、是不是闭合、面数多少
import { combination, twinMatrix, twinAxisMatrix, twinCAngle } from "./kernel.mjs";
import { MINERALS } from "./minerals.data.mjs";

const applyM = (M, v) => M.map(r => r[0]*v[0] + r[1]*v[1] + r[2]*v[2]);
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (u, v) => [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
const dot = (u, v) => u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
const len = (u) => Math.hypot(...u);

function merge(polyA, polyB) {
  const verts = [...polyA.verts, ...polyB.verts];
  const off = polyA.verts.length;
  const faces = [
    ...polyA.faces.map(f => ({ loop: f.loop.slice(), indiv: 0, planeIdx: f.planeIdx })),
    ...polyB.faces.map(f => ({ loop: f.loop.map(i => i + off), indiv: 1, planeIdx: f.planeIdx })),
  ];
  return { verts, faces };
}

for (const m of MINERALS) {
  console.log(`\n=== ${m.zh} ${m.en}（${m.system} / ${m.pointGroup}）`);
  for (const h of m.habits) {
    const res = combination(m.cell, m.pointGroup, h.forms);
    let tag = `V=${res.poly.verts.length} E=${res.poly.edges.length} F=${res.poly.faces.length} 欧拉=${res.poly.euler}`;
    if (res.clipped) tag += `  【开形→方盒截断，辅助面 ${res.clipFaces}】`;
    if (h.twin) {
      const T = h.twin.mode === "mirror" ? twinMatrix(h.twin.plane, res.L) : twinAxisMatrix(h.twin.axis, res.L);
      const B = { verts: res.poly.verts.map(v => applyM(T, v)), faces: res.poly.faces };
      const merged = merge(res.poly, B);
      const ang = twinCAngle(T);
      tag += `  |  双晶 ${h.twin.mode}${JSON.stringify(h.twin.plane ?? h.twin.axis)}：单晶 ${tag.split("  ")[0]}，合并后 V=${merged.verts.length} F=${merged.faces.length}，c 轴夹角 ${ang.raw.toFixed(3)}°（锐角 ${ang.acute.toFixed(3)}°）`;
    }
    // 面数按单形
    const counts = h.forms.map((_, i) => res.poly.faces.filter(f => res.planes[f.planeIdx].formIdx === i).length);
    const bbox = [0, 1, 2].map(k => {
      const vals = res.poly.verts.map(v => v[k]);
      return `[${Math.min(...vals).toFixed(2)}, ${Math.max(...vals).toFixed(2)}]`;
    }).join("×");
    console.log(`  ${h.zh.padEnd(12, " ")} ${tag}`);
    console.log(`    单形面数 ${counts.join(" / ")}   bbox ${bbox}   ${h.forms.map(f => f.idx).join(" + ")}`);
  }
}
