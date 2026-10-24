// M0 验收门：跑 `node spike/check.mjs`，全 PASS 才允许进入 M1
import {
  lattice, pointGroup, formPlanes, buildPolyhedron, combination,
  faceNormal, interfacialAngle, uniqueAngles,
} from './kernel.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const cubic = { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 };
const hex = { a: 4.99, b: 4.99, c: 17.06, alpha: 90, beta: 90, gamma: 120 };
const ortho = { a: 4.6, b: 5.0, c: 6.2, alpha: 90, beta: 90, gamma: 90 };

console.log('\n[1] 点群阶');
{
  const L = lattice(cubic);
  ok('m-3m = 48', pointGroup('m-3m', L).length === 48);
  ok('mmm = 8', pointGroup('mmm', lattice(ortho)).length === 8);
  ok('-3m = 12', pointGroup('-3m', lattice(hex)).length === 12);
}

console.log('\n[2] 面数 = 点群阶 / 稳定化子阶');
{
  const L = lattice(cubic), ops = pointGroup('m-3m', L);
  for (const [hkl, n] of [[[1,0,0], 6], [[1,1,0], 12], [[1,1,1], 8], [[2,1,0], 24], [[3,2,1], 48]])
    ok(`{${hkl.join('')}} = ${n}`, formPlanes(hkl, ops, L).length === n);

  const Lh = lattice(hex), opsh = pointGroup('-3m', Lh);
  for (const [hkl, n] of [[[0,0,1], 2], [[1,0,0], 6], [[1,0,1], 6], [[1,0,4], 6]])
    ok(`-3m {${hkl.join('')}} = ${n}`, formPlanes(hkl, opsh, Lh).length === n);

  const Lo = lattice(ortho);
  ok('mmm {111} = 8', formPlanes([1,1,1], pointGroup('mmm', Lo), Lo).length === 8);
}

console.log('\n[3] 面角（等轴，正交坐标系下可手算校验）');
{
  const L = lattice(cubic);
  ok('∠{111}:{100} = 54.74°', near(interfacialAngle([1,1,1], [1,0,0], L), 54.7356, 0.01));
  ok('∠{111}:{1-11} = 70.53°', near(interfacialAngle([1,1,1], [1,-1,1], L), 70.5288, 0.01));
}

console.log('\n[4] 方解石菱面体面角（教材 74°55′，六方轴 {104}）');
{
  const L = lattice(hex), ops = pointGroup('-3m', L);
  const a104 = uniqueAngles(formPlanes([1,0,4], ops, L));
  const a102 = uniqueAngles(formPlanes([1,0,2], ops, L));
  ok('{104} 相邻面角 ≈ 74.94°（= 教材 74°55′，晶胞取整差 0.02°）', a104.some(a => near(a, 74.94, 0.02)), a104.join(' / '));
  ok('{104} 补角 ≈ 105.06°', a104.some(a => near(a, 105.06, 0.02)));
  ok('{102} = 78.83°（用于确认不是差一档的菱面体）', a102.some(a => near(a, 78.83, 0.02)), a102.join(' / '));
}

console.log('\n[5] 半空间求交：闭合性与欧拉公式');
{
  const r = combination(hex, '-3m', [{ hkl: [1,0,4], k: 1 }]);
  ok('{104} 菱面体 V=8 E=12 F=6', r.poly.verts.length === 8 && r.poly.edges.length === 12 && r.poly.faces.length === 6);
  ok('{104} 欧拉 = 2', r.poly.euler === 2);
}

console.log('\n[6] 消面：立方 + 八面体');
{
  const run = (k) => combination(cubic, 'm-3m', [{ hkl: [1,0,0], k: 1 }, { hkl: [1,1,1], k }]);
  // 立方八面体：八面体面过立方体棱中点 (1,1,0) → D = 2/√3 → k = 2
  const cubocta = run(2);
  ok('k=2 → 立方八面体 6+8 面 / 24 棱 / 12 顶点',
    cubocta.poly.faces.length === 14 && cubocta.poly.edges.length === 24 && cubocta.poly.verts.length === 12,
    `可见面 ${cubocta.visible.join('/')}`);
  ok('k=2 欧拉 = 2', cubocta.poly.euler === 2);

  const bigOcta = run(10);
  ok('k=10 → 只剩立方 6 面（八面体被完全吞掉）',
    bigOcta.poly.faces.length === 6 && bigOcta.visible[1] === 0, `可见面 ${bigOcta.visible.join('/')}`);

  const smallOcta = run(0.1);
  ok('k=0.1 → 只剩八面体 8 面（立方被完全包住）',
    smallOcta.poly.faces.length === 8 && smallOcta.visible[0] === 0, `可见面 ${smallOcta.visible.join('/')}`);
}

console.log(`\n结果：${pass} PASS / ${fail} FAIL\n`);
process.exit(fail === 0 ? 0 : 1);
