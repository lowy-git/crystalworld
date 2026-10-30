// 交叉验证（我方内核侧）：对 tools/xcheck_cases.json 的每个用例，
// 用 kernel.mjs 的 lattice/formPlanes/intersect 算多面体，输出面数 + 法线族 + 面距比。
// 石英等三方系用 4 指数 (hkil) → hkl3 取 (h,k,l)。
import { lattice, formPlanes, buildPolyhedron, pointGroup } from "../src/kernel.mjs";
import { MINERALS } from "../src/minerals.data.mjs";
import fs from "node:fs";

const cases = JSON.parse(fs.readFileSync("tools/xcheck_cases.json", "utf8"));
const out = [];
for (const c of cases) {
  console.error("case:", c.id);
  // 从矿物库找同晶系晶胞（按 id 前缀映射）
  const mid = { "quartz-prismatic": "quartz", "calcite-rhomb": "calcite", "calcite-dogtooth": "calcite",
    "calcite-nailhead": "calcite", "fluorite-cuboct": "fluorite", "pyrite-triform": "pyrite",
    "garnet-smorf": "garnet", "diamond-smorf": "diamond", "beryl-emerald": "beryl",
    "beryl-aquamarine": "beryl", "beryl-morganite": "beryl", "apatite-prismatic": "apatite",
    "scheelite-modified": "scheelite", "tourmaline-prismatic": "tourmaline",
    "rhodochrosite-rhomb": "rhodochrosite", "topaz-miask": "topaz" }[c.id];
  const m = MINERALS.find(x => x.id === mid);
  if (!m) { out.push({ id: c.id, error: "no mineral " + mid }); continue; }
  const L = lattice(m.cell);
  const ops = pointGroup(m.pointGroup, L);
  const allPlanes = [];
  for (const [h, k, i4, l, kdist] of c.forms) {
    const h3 = (i4 !== undefined) ? [h, k, l] : [h, k, l];
    for (const p of formPlanes(h3, ops, L, kdist)) allPlanes.push({ n: p.n, D: p.D });
  }
  const poly = buildPolyhedron(allPlanes);
  // 每面的 (法线族签名, 面距)
  const fams = {};
  for (const f of poly.faces) {
    const sig = JSON.stringify([...f.n.map(x => Math.abs(Math.round(x * 1e4) / 1e4))].sort((a, b) => b - a));
    (fams[sig] ||= new Set()).add(Math.round(f.D * 1e4) / 1e4);
  }
  out.push({
    id: c.id, verts: poly.verts.length, faces: poly.faces.length,
    families: Object.entries(fams).map(([sig, ds]) => ({ sig: JSON.parse(sig), dists: [...ds].sort((a, b) => a - b) })),
  });
}
fs.writeFileSync("tools/_xcheck_kernel.json", JSON.stringify(out, null, 1));
console.log("kernel side done:", out.length, "cases");
