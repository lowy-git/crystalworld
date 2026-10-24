import { lattice, pointGroup, formPlanes, combination } from "./kernel.mjs";
const q = { a: 4.9134, b: 4.9134, c: 5.4052, alpha: 90, beta: 90, gamma: 120 };
for (let kp = 0.60; kp <= 1.401; kp += 0.05) {
  const res = combination(q, "32", [{hkl:[1,0,-1],k:kp},{hkl:[1,0,1],k:1.0},{hkl:[0,1,1],k:1.0}]);
  console.log(`kp=${kp.toFixed(2)} prism/z/r=${res.visible.join("/")} V=${res.poly.verts.length} E=${res.poly.edges.length} F=${res.poly.faces.length} euler=${res.poly.euler}`);
}
