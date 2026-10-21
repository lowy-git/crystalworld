// 用 vm + 桩 DOM 跑 demo/crystal.html 的脚本，检查初始化、切矿、单形切换、导出
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("demo/crystal.html", "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error("script not found");
const code = m[1];

const counts = { fill: 0, stroke: 0, fillText: 0, save: 0 };
const texts = [];
const pos = [];
const gStub = () => new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === "measureText") return (s) => ({ width: String(s).length * 10 });
    if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
    if (k === "fill") return () => counts.fill++;
    if (k === "stroke") return () => counts.stroke++;
    if (k === "fillText") return (t, x, y) => { counts.fillText++; texts.push(String(t)); pos.push([t, x, y]); };
    if (k === "save") return () => counts.save++;
    if (k === "toBlob") return (cb) => cb({});
    if (k === "toDataURL") return () => "data:image/png;base64,AAAA";
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

function makeEl(tag = "div") {
  const el = {
    tag, children: [], dataset: {}, style: {}, classList: {
      _s: new Set(), add(...a) { a.forEach(x => this._s.add(x)); },
      remove(...a) { a.forEach(x => this._s.delete(x)); },
      contains(x) { return this._s.has(x); },
      toggle(x, on) { on === undefined ? (this._s.has(x) ? this._s.delete(x) : this._s.add(x)) : on ? this._s.add(x) : this._s.delete(x); },
    },
    _html: "", textContent: "", checked: false, width: 0, height: 0,
    clientWidth: 1280, clientHeight: 860,
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    remove() {},
    addEventListener() {},
    setPointerCapture() {},
    querySelector() { return makeEl("input"); },
    closest() { return null; },
  };
  Object.defineProperty(el, "innerHTML", { get() { return this._html; }, set(v) { this._html = v; } });
  el.getContext = () => gStub();
  if (tag === "canvas") {
    el.getContext = () => gStub();
    el.toBlob = (cb) => cb({});
    el.toDataURL = () => "data:image/png;base64,AAAA";
  }
  return el;
}

const ids = {};
// 折叠面板用的极简 querySelectorAll：只认 ".sec[data-sec] > h3 .fold" 与 ".sec[data-sec]"
const foldSecs = ["sys", "min", "hab", "frm", "color", "scene", "luster", "incl", "light", "display", "input", "view", "export", "data"];
const foldEls = {};
const foldEl = (sec) => {
  if (!foldEls[sec]) {
    const btn = { setAttribute() {}, onclick: null, closest: () => foldEls[sec] };
    foldEls[sec] = {
      dataset: { sec },
      classList: { _c: new Set(), toggle(k, on) { on ? this._c.add(k) : this._c.delete(k); return on; }, contains(k) { return this._c.has(k); } },
      closest() { return foldEls[sec]; },
      querySelector() { return btn; },
      _btn: btn,
    };
  }
  return foldEls[sec];
};
const document = {
  getElementById(id) { return ids[id] ||= makeEl(); },
  createElement(tag) { return makeEl(tag); },
  body: makeEl("body"),
  addEventListener() {},
  querySelectorAll(sel) {
    if (sel.indexOf("[data-sec]") >= 0 && sel.indexOf(".fold") >= 0) return foldSecs.map(s => foldEl(s)._btn);
    if (sel.indexOf("[data-sec]") >= 0) return foldSecs.map(s => foldEl(s));
    return [];
  },
};

let rafCount = 0;
const sandbox = {
  document, console,
  window: { devicePixelRatio: 2, addEventListener() {}, __notified: null },
  devicePixelRatio: 2,
  requestAnimationFrame(fn) { if (rafCount++ < 2) fn(); },
  setTimeout, clearTimeout, navigator: {}, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  ClipboardItem: class {}, Image: class {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
sandbox.window.document = document;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "crystal.html" });

const run = (expr) => vm.runInContext(expr, sandbox);

const out = [];
const check = (name, ok, extra = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);

check("启动即绘制", counts.fill > 0, `fill=${counts.fill}`);
check("初始矿物 = 萤石·立方体", run(`mineral().id + "/" + habit().id`) === "fluorite/cube", run(`mineral().id + "/" + habit().id`));

// 切到石英·标准柱状
run(`selectMineral("quartz"); state.habitId = "prismatic"; state.mask = 7; rebuildGeometry(); draw();`);
check("石英标准柱状 18 面", run(`GEO.faces.length`) === 18, String(run(`GEO.faces.length`)));
check("r 与 z 是不同单形", run(`new Set(GEO.faces.map(f=>f.form)).size`) === 3);

// 隐藏两个单形 → 只剩六方柱。柱是开形（没有上下底面），必须靠补盖面才能画出来
run(`state.mask = 1; rebuildGeometry(); draw();`);
const nf = run(`GEO.faces.length`);
const quads = run(`GEO.faces.filter(f=>f.pts.length===4).length`);
const caps = run(`GEO.faces.filter(f=>f.clip===1).length`);
const onlyPrism = run(`new Set(GEO.faces.filter(f=>f.clip!==1).map(f=>f.form)).size`) === 1;
check("只看柱面 = 六棱柱 6 个侧面 + 2 个补盖（开形）", nf === 8 && quads === 6 && caps === 2 && onlyPrism, `faces=${nf} quads=${quads} caps=${caps}`);
check("柱面单独存在时是不闭合开形", run(`!variant().closed`) === true);

// 柱 + 一个菱面体
run(`state.mask = 3; rebuildGeometry(); draw();`);
check("柱 + r = 12 面", run(`GEO.faces.length`) === 12, String(run(`GEO.faces.length`)));

// 双晶
run(`selectMineral("quartz"); state.habitId = "japan-twin"; state.mask = 7; rebuildGeometry(); draw();`);
check("日本律双晶面数与数据一致（并集，≥36 面）", run(`GEO.faces.length`) === run(`variant().counts.f`) && run(`variant().counts.f`) >= 36, String(run(`GEO.faces.length`)));
check("两个个体都存在", run(`new Set(GEO.faces.map(f=>f.indiv)).size`) === 2);
check("日本律双晶夹角 = 84°33′（84.55°，文献值）", Math.abs(run(`habit().twin.angle`) - 84.55) < 1e-9, String(run(`habit().twin.angle`)));

// 萤石尖晶石律：两个立方体沿 [111] 互相穿插（贯穿双晶，不是接触双晶）
run(`selectMineral("fluorite"); state.habitId = "spinel-twin"; state.mask = 1; rebuildGeometry(); draw();`);
check("萤石尖晶石律是贯穿双晶（mode=axis, axis=[111]）",
  run(`habit().twin.mode`) === "axis" && JSON.stringify(run(`habit().twin.axis`)) === "[1,1,1]",
  JSON.stringify(run(`habit().twin`)));
check("萤石尖晶石律双晶面数 ≥ 24（两块穿插后表面被切碎）", run(`GEO.faces.length`) >= 24, String(run(`GEO.faces.length`)));
check("萤石尖晶石律 <100> 夹角 109°28′（arccos(−1/3)）", Math.abs(run(`habit().twin.angle`) - 109.4712) < 0.01, String(run(`habit().twin.angle`)));

// 「放在桌面上」：贴合桌面线 + 接触阴影（fitToTable 是纯函数，可直接单测）
{
  const base = `{ cx: 640, cy: 430, scale: 1, vw: 1280, vh: 860, pan: [0,0] }`;
  const boxOf = (expr) => run(`(() => { const o = ${expr}; return projectedBox(makeProject(o)); })()`);
  run(`selectMineral("quartz"); state.habitId = "prismatic"; state.mask = 7; rebuildGeometry(); draw();`);
  const tblY = run(`BACKGROUNDS.lab.table.y`) * 860;
  const fitted = boxOf(`fitToTable(${base}, BACKGROUNDS.lab.table)`);
  check("放在桌面上：晶体底边贴在实验台桌面线上", Math.abs(fitted.ymax - tblY) < 2, `ymax=${fitted.ymax.toFixed(1)} table=${tblY.toFixed(1)}`);
  check("放在桌面上：不高出画面上沿 5%", fitted.ymin > 860 * 0.04, `ymin=${fitted.ymin.toFixed(1)}`);
  check("深空背景没有桌面（table = undefined）", run(`BACKGROUNDS.dark.table`) === undefined);
  const cabY = run(`BACKGROUNDS.cabinet.table.y`) * 860;
  const cab = boxOf(`fitToTable(${base}, BACKGROUNDS.cabinet.table)`);
  check("藏品柜展台也能贴合", Math.abs(cab.ymax - cabY) < 2, `ymax=${cab.ymax.toFixed(1)} table=${cabY.toFixed(1)}`);
  // 勾选状态由 UI 开关驱动：面板同步 + 场景禁用判断
  run(`state.bg = "dark"; renderBackgrounds();`);
  check("深空场景下勾选框被禁用", run(`document.getElementById("onTable").disabled`) === true);
  run(`state.bg = "lab"; renderBackgrounds();`);
  check("实验台场景下勾选框可用", run(`document.getElementById("onTable").disabled`) === false);
  run(`state.onTable = true; state.bg = "lab"; draw();`);
  check("画布仍能绘制（贴合路径不报错）", counts.fill > 0, `fill=${counts.fill}`);
}

// 逐矿检查：任何外形在"全部显示"下都必须是闭合体（欧拉 = 2）
const report = run(`
  (() => {
    const rows = [];
    for (const mm of DATA.minerals) {
      for (const hh of mm.habits) {
        const key = hh.forms.map(()=>"1").join("");
        const v = hh.variants[key];
        rows.push({ m: mm.zh, h: hh.zh, v: v.counts.v, e: v.counts.e, f: v.counts.f, chi: v.counts.v - v.counts.e + v.counts.f, closed: v.closed, tw: !!hh.twin });
      }
    }
    return rows;
  })()
`);
let eulerOK = true;
for (const r of report) {
  // 双晶：两个个体各一个欧拉特征，合并后 V-E+F 不再等于 2
  const ok = r.tw ? true : r.chi === 2;
  if (!ok) { eulerOK = false; out.push(`FAIL  ${r.m}·${r.h} 欧拉=${r.chi} (V${r.v}/E${r.e}/F${r.f})`); }
}
check(`全部 ${report.length} 个外形闭合（双晶除外）`, eulerOK);

// 导出
const before = counts.fillText;
run(`state.exp.fields = {}; initExportFields(); buildExportCanvas();`);
const expTexts = texts.slice(before);
check("导出画布有文字", counts.fillText - before >= 6, `fillText+=${counts.fillText - before}`);
const joined = expTexts.join(" | ");
check("导出含矿物名与化学式", /石英/.test(joined) && /SiO/.test(joined), joined.slice(0, 160));
run(`document.getElementById("openExport").onclick();`);
{
  const last = pos.length;
  run(`state.exp.fields = { title: 1, formula: 1, system: 1, forms: 1, cell: 1, angles: 1, intro: 1, source: 1 }; state.exp.w = 1400;`);
  const before = pos.length;
  run(`buildExportCanvas();`);
  const axis = new Set(["a₁", "a₂", "a₃", "c"]);
  const mine = pos.slice(before).filter(p => !axis.has(p[0]));
  const ys = mine.map(p => p[2]);
  const h = 1400 * 0.75;
  const inBounds = ys.every(y => y >= 0 && y <= h);
  const belowCrystal = Math.min(...ys) > h * 0.28;
  check("导出文字全部落在画布内", inBounds, `y∈[${Math.min(...ys).toFixed(0)}, ${Math.max(...ys).toFixed(0)}] / h=${h}`);
  check("导出文字不压到晶体区域", belowCrystal, `min y=${Math.min(...ys).toFixed(0)}`);
}
for (const lu of ["opaque", "glass", "adamantine", "metallic", "waxy", "transparent"]) {
  const ok = (() => { try { run(`state.luster = "${lu}"; draw();`); return true; } catch (e) { return false; } })();
  check(`光泽可切换：${lu}`, ok);
}
run(`state.luster = null; draw();`);
// —— 本轮新增：背景 / 光照 / 通透度与光泽解耦 / 内含物 ——
const bgKeys = run(`Object.keys(BACKGROUNDS)`);
for (const b of bgKeys) {
  const ok = (() => { try { run(`state.bg = "${b}"; draw();`); return true; } catch (e) { return false; } })();
  check(`背景可切换：${b}`, ok);
}
run(`state.bg = "paper"; document.getElementById("openExport").onclick();`);
check("导出背景跟随当前场景背景", run(`state.exp.bg`) === "paper", run(`state.exp.bg`));
for (const b of [...bgKeys, "none"]) {
  const ok = (() => { try { run(`state.exp.bg = "${b}"; buildExportCanvas();`); return true; } catch (e) { return false; } })();
  check(`导出背景可用：${b}`, ok);
}
check("光照方位/高度 → 主光方向", (() => {
  run(`setLight(90, 0);`);
  const v = run(`LIGHT_V`);
  run(`setLight(-25, 38);`);
  return Math.abs(v[0] - 1) < 1e-6 && Math.abs(v[1]) < 1e-6 && Math.abs(v[2]) < 1e-6;
})());
check("主柔光箱与主光同向（高光与环境反射不错位）", (() => {
  run(`setLight(37, 12);`);
  const same = run(`JSON.stringify(ENV_LIGHTS[0].dir) === JSON.stringify(LIGHT_V)`);
  run(`setLight(-25, 38);`);
  return same === true || same === "true";
})());
// 光泽与通透度是两件事：金属光泽强制不透明并禁用滑杆，其余可自由组合
run(`state.luster = "metallic"; state.alpha = 0.3; state.transp = "clear"; renderTransp();`);
check("金属光泽天然不透明（滑杆禁用）",
  run(`mat().alpha`) === 1 && run(`document.getElementById("transp").disabled`) === true,
  `alpha=${run(`mat().alpha`)}`);
run(`state.luster = "glass"; renderTransp();`);
check("玻璃光泽可全透明（与光泽解耦）", run(`mat().alpha`) === 0.3, `alpha=${run(`mat().alpha`)}`);
run(`state.alpha = null; state.transp = null; renderTransp(); draw();`);
// 内含物：默认矿物带包体；密度可调；必须在晶体内部；不透明时不绘制
run(`selectMineral("quartz");`);
check("石英默认含金红石针", run(`INC.length`) > 0
  && run(`(state.inclusion == null ? mineral().inclusion : state.inclusion)`) === "rutile",
  `INC=${run(`INC.length`)}`);
check("包体密度可调（0 = 清空）", (() => {
  run(`state.incDensity = 0; buildInclusions();`);
  const a = run(`INC.length`);
  run(`state.incDensity = 1; buildInclusions();`);
  const b = run(`INC.length`);
  return a === 0 && b > 0;
})());
check("包体全部落在晶体内部", run(`INC.every(f => f.pts.every(p => inside(p)))`) === true);
{
  let painted = 0;
  const cg = new Proxy({}, { get: (t, k) => (k === "fill" ? () => { painted++; } : () => {}), set: () => true });
  sandbox.__cg = cg;
  const P = `makeProject({ cx: 400, cy: 300, scale: 1, vw: 800, vh: 600 })`;
  run(`state.alpha = 1; paintInclusions(__cg, { vw: 800, vh: 600 }, ${P}, mat());`);
  const opaque = painted === 0;
  run(`state.alpha = 0.5; paintInclusions(__cg, { vw: 800, vh: 600 }, ${P}, mat());`);
  const see = painted > 0;
  check("不透明时内含物不绘制、半透明时可见", opaque && see, `fill=${painted}`);
}
run(`state.alpha = null; state.transp = null; state.luster = null; state.incDensity = 0.6; buildInclusions(); renderTransp(); draw();`);

// ── 第八轮：石英道芬律 / 巴西律 ──
run(`selectMineral("quartz"); state.habitId = "dauphine-twin"; rebuildGeometry(); syncPanels();`);
check("石英道芬律存在：绕 c 轴 180°（mode=axis, axis=[001]）", (() => {
  const t = run(`JSON.stringify(habit().twin)`);
  return /"mode":"axis"/.test(t) && /"axis":\[0,0,1\]/.test(t) && run(`habit().twin.angle`) === 180;
})(), run(`JSON.stringify(habit().twin)`));
check("道芬律面数合理（两块同心，24 面）", run(`variant().counts.f`) === 24, `f=${run(`variant().counts.f`)}`);
run(`state.habitId = "brazil-twin"; rebuildGeometry(); syncPanels();;`);
check("石英巴西律存在：{11-20} 镜面（mode=mirror, plane=[11-20]）", (() => {
  const t = run(`JSON.stringify(habit().twin)`);
  return /"mode":"mirror"/.test(t) && /"plane":\[1,1,-2,0\]/.test(t);
})(), run(`JSON.stringify(habit().twin)`));
check("巴西律 c 轴平行（夹角 0°，手性相反）", run(`habit().twin.angle`) === 0);
run(`state.habitId = "japan-twin"; rebuildGeometry(); syncPanels();;`);

// ── 第八轮：双晶拆解 ──
check("拆解控件只在双晶习惯出现", (() => {
  run(`state.habitId = "prismatic"; rebuildGeometry(); syncPanels();; syncPanels();`);
  const hid = run(`document.getElementById("splitBox").style.display`);
  run(`state.habitId = "japan-twin"; rebuildGeometry(); syncPanels();; syncPanels();`);
  const shown = run(`document.getElementById("splitBox").style.display`);
  return hid === "none" && shown === "";
})());
check("拆解会把个体 B 平移（两体不再重合）", (() => {
  run(`state.twinSplit = 0; rebuildGeometry();`);
  const a0 = run(`JSON.stringify(GEO.faces.filter(f => f.indiv === 1).map(f => f.c[0]))`);
  run(`state.twinSplit = 1; rebuildGeometry();`);
  const a1 = run(`JSON.stringify(GEO.faces.filter(f => f.indiv === 1).map(f => f.c[0]))`);
  run(`state.twinSplit = 0; rebuildGeometry();`);
  return a0 !== a1;
})());
check("拆解后两个体各自仍是闭合体（欧拉数 1 + 1）", (() => {
  run(`state.twinSplit = 1; rebuildGeometry();`);
  const chi = run(`(() => {
    const vs = new Set(); let E = 0;
    for (const f of GEO.faces) { for (const i of f.loop) vs.add(i); E += f.loop.length; }
    return vs.size - E / 2 + GEO.faces.length;
  })()`);
  run(`state.twinSplit = 0; rebuildGeometry();`);
  return chi === 2;
})(), `χ=${run(`(() => { const vs = new Set(); let E = 0; for (const f of GEO.faces) { for (const i of f.loop) vs.add(i); E += f.loop.length; } return vs.size - E/2 + GEO.faces.length; })()`)}`);
check("只看 A / 只看 B 会过滤个体", (() => {
  run(`state.twinShow = "A"; rebuildGeometry();`);
  const nA = run(`GEO.faces.filter(f => f.indiv === 0).length`);
  const only = run(`(() => { let s = new Set(); for (const f of GEO.faces) s.add(f.indiv); return s.size; })()`);
  run(`state.twinShow = "B"; rebuildGeometry();`);
  const nB = run(`GEO.faces.filter(f => f.indiv === 1).length`);
  run(`state.twinShow = "both"; rebuildGeometry();`);
  return nA > 0 && only === 1 && nB > 0;
})());
check("切到非双晶时自动复位拆解状态", (() => {
  run(`state.twinSplit = 0.5; state.habitId = "prismatic"; rebuildGeometry(); syncPanels();; syncPanels();`);
  const r = run(`state.twinSplit === 0 && state.twinShow === "both"`);
  run(`state.habitId = "japan-twin"; rebuildGeometry(); syncPanels();; syncPanels();`);
  return r === true;
})());

// ── 第八轮：面板折叠 ──
check("点击标题栏可折叠/展开面板", (() => {
  run(`document.querySelectorAll(".sec[data-sec] > h3 .fold")[0].onclick();`);
  const closed = run(`document.querySelectorAll(".sec[data-sec]")[0].classList.contains("closed")`);
  run(`document.querySelectorAll(".sec[data-sec] > h3 .fold")[0].onclick();`);
  const open = run(`document.querySelectorAll(".sec[data-sec]")[0].classList.contains("closed")`);
  return closed === true && open === false;
})());

// ── 第八轮：本体染色层（透明度高时颜色不消失） ──
check("半透明时先罩一层本体色（颜色不随 alpha 淡掉）", (() => {
  let tinted = 0;
  const cg = new Proxy({}, {
    get: (t, k) => (k === "fill" ? (rule) => { if (rule === "nonzero") tinted++; } : () => {}),
    set: () => true,
  });
  sandbox.__cg = cg;
  const P = `makeProject({ cx: 400, cy: 300, scale: 1, vw: 800, vh: 600 })`;
  run(`state.alpha = 0.3; paintTint(__cg, ${P}, mat());`);
  const n1 = tinted;
  run(`state.alpha = 1; paintTint(__cg, ${P}, mat());`);
  const n2 = tinted;
  run(`state.alpha = null; state.transp = null; renderTransp();`);
  return n1 > 0 && n2 === n1;   // 半透明时画了；不透明时跳过（画了也被完全盖住，无意义）
})(), `tint=${(() => { let t = 0; const cg = new Proxy({}, { get: (tt, k) => (k === "fill" ? (r) => { if (r === "nonzero") t++; } : () => {}), set: () => true }); return t; })()}`);
check("本体色跟随矿物（石英取有色项）", (() => {
  const c = run(`JSON.stringify(bodyColor())`);
  return /0\.\d/.test(c);
})());
check("背景内容物可绘制（四种带桌面的场景都不报错）", (() => {
  const bg = new Proxy({}, { get: (t, k) => (k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  sandbox.__bg = bg;
  for (const b of ["lab", "nature", "cabinet", "paper"]) {
    run(`BACKGROUNDS["${b}"].draw(__bg, 800, 600);`);
  }
  return true;
})());

for (const a of ["4:3", "9:16", "16:9"]) {
  const r = run(`state.exp.aspect = "${a}"; (() => { const q = buildExportCanvas(); return q.width + "x" + q.height; })();`);
  const inside = (() => {
    pos.length = 0;
    run(`state.exp.aspect = "${a}"; buildExportCanvas();`);
    const [w, h] = run(`JSON.stringify(exportSize())`, true) ? JSON.parse(run(`JSON.stringify(exportSize())`)) : [0, 0];
    const bad = pos.filter(p => p[1] < 0 || p[1] > w || p[2] < 0 || p[2] > h);   // p[1]=x, p[2]=y
    if (bad.length) console.log("   OUT", a, bad.slice(0, 4).map(p => JSON.stringify(p)).join(" "), "n=", bad.length, "of", pos.length, "h=", h, "w=", w);
    return bad.length === 0;
  })();
  check(`导出画幅 ${a}`, /^\d+x\d+$/.test(r) && (inside === true || inside === "true"), `${r} · 文字在界内=${inside}`);
}
run(`state.exp.aspect = "4:3"; buildExportCanvas();`);
check("导出预览已生成", /\d+ × \d+ px/.test(run(`document.getElementById("expPrevInfo").textContent`)), run(`document.getElementById("expPrevInfo").textContent`));

check("导出含晶系与单形", /三方/.test(joined) && /菱面体/.test(joined));

console.log(out.join("\n"));
console.log("\n规模：矿物", run(`DATA.minerals.length`), "种；外形", report.length, "种；变体总数",
  run(`DATA.minerals.reduce((a,m)=>a+m.habits.reduce((b,h)=>b+Object.keys(h.variants).length,0),0)`));

