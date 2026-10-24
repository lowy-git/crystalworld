import { lattice, pointGroup, formPlanes, combination } from "./kernel.mjs";
const q = { a: 4.9134, b: 4.9134, c: 5.4052, alpha: 90, beta: 90, gamma: 120 };
const L = lattice(q);
const ops = pointGroup("32", L);
console.log("quartz 32 group order =", ops.length);
for (const hkl of [[1,0,0],[1,0,-1],[1,0,1],[0,1,1],[1,1,-2],[1,1,2]]) {
  const p = formPlanes(hkl, ops, L);
  console.log(`{${hkl.join("")}} -> ${p.length} faces, d=${(1/Math.hypot(...(p[0].n.map((_,i)=>0)))).toFixed(3)}`);
}
// r 与 z 是否同一套面？
const r = formPlanes([1,0,1], ops, L).map(p=>p.n.map(x=>x.toFixed(5)).join(",")).sort();
const z = formPlanes([0,1,1], ops, L).map(p=>p.n.map(x=>x.toFixed(5)).join(",")).sort();
console.log("r == z ?", JSON.stringify(r)===JSON.stringify(z));
for (const [kp, kr, kz] of [[1,1,1],[1.6,1,1],[2.0,1,1],[1.6,1.0,1.0],[1.9,1,1]]) {
  const res = combination(q, "32", [{hkl:[1,0,-1],k:kp},{hkl:[1,0,1],k:kr},{hkl:[0,1,1],k:kz}]);
  console.log(`k(${kp},${kr},${kz}) visible=${res.visible.join("/")} V=${res.poly.verts.length} E=${res.poly.edges.length} F=${res.poly.faces.length} euler=${res.poly.euler}`);
}
