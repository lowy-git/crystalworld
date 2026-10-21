import { lattice, pointGroup, formPlanes } from "./kernel.mjs";
const cell = { a: 4.99, b: 4.99, c: 17.06, alpha: 90, beta: 90, gamma: 120 };
const L = lattice(cell);
const ops = pointGroup("-3m", L);
const f = formPlanes([1,0,4], ops, L);
console.log("faces:", f.length);
for (let i=0;i<f.length;i++) for (let j=i+1;j<f.length;j++) {
  const a = Math.acos(Math.max(-1,Math.min(1, f[i].n[0]*f[j].n[0]+f[i].n[1]*f[j].n[1]+f[i].n[2]*f[j].n[2])))*180/Math.PI;
  if (Math.abs(a-74.9167)<0.2) console.log("pair", i, j, "theta=", a.toFixed(4), "| n1=", f[i].n.map(x=>x.toFixed(4)).join(","), "| n2=", f[j].n.map(x=>x.toFixed(4)).join(","));
}
const target = 74 + 55/60;
for (const l of [1,2,4,5]) {
  let best=null;
  for (let c=10; c<25; c+=0.002) {
    const Lc = lattice({ ...cell, c });
    const fc = formPlanes([1,0,l], pointGroup("-3m", Lc), Lc);
    let hit=null;
    for (let i=0;i<fc.length && !hit;i++) for (let j=i+1;j<fc.length;j++) {
      const a = Math.acos(Math.max(-1,Math.min(1, fc[i].n[0]*fc[j].n[0]+fc[i].n[1]*fc[j].n[1]+fc[i].n[2]*fc[j].n[2])))*180/Math.PI;
      if (Math.abs(a-target)<0.002) hit={a,c};
    }
    if (hit) best=hit;
  }
  console.log(`{10${l}}: 需 c ≈ ${best ? best.c.toFixed(3) : "无解"} (a=4.99)`);
}
