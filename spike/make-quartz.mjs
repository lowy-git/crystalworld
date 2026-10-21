import { combination } from "./kernel.mjs";
import fs from "node:fs";
const q = { a: 4.9134, b: 4.9134, c: 5.4052, alpha: 90, beta: 90, gamma: 120 };
const r = combination(q, "32", [{hkl:[1,0,0],k:0.40},{hkl:[1,0,1],k:0.95},{hkl:[0,1,1],k:0.95}]);
const vs = r.poly.verts;
const zmin = Math.min(...vs.map(v=>v[2])), zmax = Math.max(...vs.map(v=>v[2]));
const cy = (zmin+zmax)/2;
const scale = 2 / (zmax - zmin);   // 归一化到高 2
const verts = vs.map(v => [(v[0])*scale, (v[1])*scale, (v[2]-cy)*scale]);
const faces = r.poly.faces.map(f => ({ loop: f.loop, form: r.planes[f.planeIdx].formIdx }));
console.log("V", verts.length, "E", r.poly.edges.length, "F", faces.length, "euler", r.poly.euler);
console.log("visible", r.visible.join("/"));
console.log("formOfFace", faces.map(f=>f.form).join(","));
console.log("deg", faces.map(f=>f.loop.length).join(","));
const bb = [0,1,2].map(i => [Math.min(...verts.map(v=>v[i])), Math.max(...verts.map(v=>v[i]))]);
console.log("bbox", JSON.stringify(bb.map(b=>b.map(x=>+x.toFixed(3)))));
fs.writeFileSync("spike/quartz.json", JSON.stringify({ verts, faces: faces.map(f=>f.loop), formOfFace: faces.map(f=>f.form) }));
console.log("wrote spike/quartz.json");
