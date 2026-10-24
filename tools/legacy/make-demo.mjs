// 由内核几何生成单文件水晶演示页：node spike/make-demo.mjs
import fs from "node:fs";
import path from "node:path";
import { combination } from "./kernel.mjs";

const CELL = { a: 4.9134, b: 4.9134, c: 5.4052, alpha: 90, beta: 90, gamma: 120 };
const CELL_TEXT = "a = b = 4.9134 Å，c = 5.4052 Å，α = β = 90°，γ = 120°";
const FORM_LABELS = ["柱 m {10-10}", "菱面体 r {10-11}", "菱面体 z {01-11}"];

const HABITS = [
  { habit: "长柱状", kp: 0.40, kt: 0.95 },
  { habit: "标准柱状", kp: 0.60, kt: 0.95 },
  { habit: "短柱状", kp: 0.78, kt: 0.95 },
];

function buildHabit({ habit, kp, kt }) {
  const res = combination(CELL, "32", [
    { hkl: [1, 0, 0], k: kp },
    { hkl: [1, 0, 1], k: kt },
    { hkl: [0, 1, 1], k: kt },
  ]);
  const vs = res.poly.verts;
  const zmin = Math.min(...vs.map((v) => v[2]));
  const zmax = Math.max(...vs.map((v) => v[2]));
  const cz = (zmin + zmax) / 2;
  const s = 2 / (zmax - zmin);
  const verts = vs.map((v) => [
    +(v[0] * s).toFixed(5),
    +(v[1] * s).toFixed(5),
    +((v[2] - cz) * s).toFixed(5),
  ]);
  const faces = res.poly.faces.map((f) => f.loop);
  const formOfFace = res.poly.faces.map((f) => res.planes[f.planeIdx].formIdx);
  const rad = Math.max(...verts.map((v) => Math.hypot(v[0], v[1])));
  const ratio = (2 / (2 * rad)).toFixed(2);
  return {
    habit,
    cell: CELL_TEXT,
    ratio: `长 / 宽 = ${ratio} : 1`,
    verts,
    faces,
    formOfFace,
    forms: FORM_LABELS,
    formCounts: res.visible,
    counts: { v: verts.length, e: res.poly.edges.length, f: faces.length },
  };
}

const variants = HABITS.map(buildHabit);
const tpl = fs.readFileSync(path.resolve("demo/quartz_template.html"), "utf8");
const html = tpl.replace("/*__DATA__*/ null", () => JSON.stringify({ variants }, null, 2));
fs.writeFileSync(path.resolve("demo/quartz.html"), html);
console.log(`wrote demo/quartz.html  (${variants.length} habits, ${(html.length / 1024).toFixed(1)} KB)`);
for (const v of variants) {
  console.log(`  ${v.habit}: V=${v.counts.v} E=${v.counts.e} F=${v.counts.f} forms=${v.formCounts.join("/")} ${v.ratio}`);
}
