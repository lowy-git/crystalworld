import { lattice, faceNormal, hkl3 } from "./kernel.mjs";
const L = lattice({ a: 4.9134, b: 4.9134, c: 5.4052, alpha: 90, beta: 90, gamma: 120 });
const ang = (u, v) => Math.acos(Math.min(1, Math.max(-1, u[0]*v[0]+u[1]*v[1]+u[2]*v[2]))) * 180 / Math.PI;
const cAxis = [0, 0, 1];
for (const hkl4 of [[1,1,-2,2],[1,1,-2,1],[1,0,-1,1],[2,1,-3,1],[1,1,-2,0],[0,1,-1,2]]) {
  const h3 = hkl3(hkl4);
  const { n } = faceNormal(h3, L);
  const theta = ang(n, cAxis);
  console.log(`{${hkl4.join("")}} → 3 指数 (${h3.join(",")})  法线与 c 夹角 ${theta.toFixed(3)}°  ⇒ 双晶两 c 轴夹角 ${(2*theta).toFixed(3)}°`);
}
