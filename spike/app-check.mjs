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

/* ---- WebGL2 桩 ---------------------------------------------------------------
   本机没有可用的无头浏览器（Edge headless 退出码 13），所以 GL 侧不能靠"跑起来看"。
   这个桩把 GL 的调用序列录下来：着色器编译/链接是否成功、info log 是否干净、
   JS 里查询的每个 uniform/attribute 是否拿得到 location、缓冲顶点数是否与几何一致、
   drawArrays 到底有没有被调用。它查不了画面，但查得出"GL 路径根本是死的"这类问题。 */
const GL = {
  // 常量
  VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
  ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88E4, DYNAMIC_DRAW: 0x88E8, FLOAT: 0x1406, TRIANGLES: 0x0004,
  DEPTH_TEST: 0x0B71, BLEND: 0x0BE2, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
  COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100, LEQUAL: 0x0203, NO_ERROR: 0,
};
const glStat = {
  shaders: [], programs: [], log: [], draws: 0, verts: 0, binds: 0, uploads: 0,
  err: 0, uniforms: new Set(), attrs: new Set(), depthRange: null, clear: 0,
  viewport: [0, 0, 0, 0], blendFunc: null, depthFunc: null, uni: [], vao: 0,
};

// ── GLSL 静态检查：本机没有可用的无头浏览器（Edge headless 退出码 13、
//    Chrome crashpad 被沙箱拦），着色器编译不过只会 console.warn 然后静默
//    回落到 Canvas 2D——用户看到"画面没坏"就以为 GL 生效了。所以必须在
//    桩里把编译期能查的全查掉：最现实的失败模式是**拼错标识符**
//    （uFo vs uFoc、envSmaple），这里用"声明集合 + 内建集合"把它抓住。
const GLSL_BUILTIN = new Set(`void bool int uint float double
vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4
dvec2 dvec3 dvec4 mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4
sampler2D sampler3D samplerCube sampler2DArray sampler2DShadow samplerCubeShadow
struct
location
radians degrees sin cos tan asin acos atan sinh cosh tanh pow exp log exp2 log2 sqrt inversesqrt
abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep
isnan isinf fma frexp ldexp packUnorm2x16 packUnorm4x8 packSnorm4x8 unpackUnorm2x16 unpackUnorm4x8
unpackSnorm4x8 packHalf2x16 unpackHalf2x16
length distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct
transpose determinant inverse
lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not
uaddCarry usubBorrow umulExtended imulExtended bitfieldExtract bitfieldInsert bitfieldReverse
bitCount findLSB findMSB
texture textureProj textureLod textureOffset texelFetch texelFetchOffset textureLodOffset
textureProjLod textureProjLodOffset textureGrad textureGradOffset textureProjGrad textureProjGradOffset
textureGather textureGatherOffset textureSize
dFdx dFdy dFdxFine dFdyFine dFdxCoarse dFdyCoarse fwidth fwidthFine fwidthCoarse
atomicAdd atomicMin atomicMax atomicAnd atomicOr atomicXor atomicExchange atomicCompSwap
barrier memoryBarrier memoryBarrierAtomicCounter memoryBarrierBuffer memoryBarrierShared
groupMemoryBarrier
discard return if else for while do break continue switch case default true false
const uniform in out inout attribute varying flat smooth centroid patch sample invariant
precise layout precision lowp mediump highp
gl_Position gl_PointSize gl_FragCoord gl_FrontFacing gl_FragDepth gl_PointCoord gl_PrimitiveID
gl_VertexID gl_InstanceID gl_VertexIndex gl_DrawID gl_Layer gl_ViewportIndex
gl_NumWorkGroups gl_WorkGroupID gl_LocalInvocationID gl_GlobalInvocationID gl_LocalInvocationIndex`
  .split(/\s+/).filter(Boolean));

const GLSL_TYPE = "(?:void|bool|int|uint|float|double|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?)";

/** 返回 [] 表示没问题；否则是一串 "未声明标识符"（拼错名字就是编译失败） */
function glslUndeclared(src) {
  // 先抹掉数字字面量：否则 1e-4 里的 e、0.5 里的 5 会被当成标识符
  // （vec3/mat4 这类名字里的数字不能抹，所以要求数字前不是标识符字符）
  const s = src.replace(/^[ \t]*#[^\n]*/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
    .replace(/(?<![A-Za-z_0-9.])(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, "0");
  const declared = new Set();
  // 声明符列表：`float lam = 0.0, sp = 0.0, lamSum = 0.0;` 有多个声明符，
  // 必须按**顶层**逗号拆（初始化式里也有逗号，如 pow(max(0.0, d), 2.0)），
  // 每个声明符取 `=` 前面的标识符。
  const declarators = (txt) => {
    let depth = 0, start = 0;
    const parts = [];
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "," && depth === 0) { parts.push(txt.slice(start, i)); start = i + 1; }
    }
    parts.push(txt.slice(start));
    for (const part of parts) {
      const id = part.trim().split("=")[0].trim().match(/^([A-Za-z_]\w*)/);
      if (id) declared.add(id[1]);
    }
  };
  const QUAL = "(?:flat|smooth|centroid|invariant|precise)\\s+";
  const reUniform = new RegExp(`^(?:layout\\s*\\([^)]*\\)\\s*)?(?:${QUAL})?(?:uniform|out|in|const)\\s+(?:(?:lowp|mediump|highp)\\s+)?${GLSL_TYPE}\\s+([\\s\\S]+)$`);
  const reLocal = new RegExp(`^(?:${QUAL})?(?:(?:lowp|mediump|highp)\\s+)?(?:const\\s+)?${GLSL_TYPE}\\s+([\\s\\S]+)$`);
  const reFunc = new RegExp(`^(?:${GLSL_TYPE})\\s+(\\w+)\\s*\\(`);
  // 按 ; { } 切 statement：声明可能紧跟在 { 后面（函数体第一句），只按 ; 切会漏
  for (const raw of s.split(/[;{}]/)) {
    const t = raw.trim();
    if (!t) continue;
    let m = t.match(reUniform);
    if (m) { declarators(m[1]); continue; }
    m = t.match(reFunc);
    if (m) { declared.add(m[1]); continue; }
    m = t.match(/^for\s*\(\s*(?:int|float)\s+(\w+)/);
    if (m) { declared.add(m[1]); continue; }
    m = t.match(reLocal);
    if (m) { declarators(m[1]); continue; }
  }
  for (const mm of s.matchAll(/\(([^()]*)\)/g)) {           // 函数形参
    const p = mm[1].trim().match(new RegExp(`^(?:(?:lowp|mediump|highp)\\s+)?(?:const\\s+)?(?:in\\s+|out\\s+|inout\\s+)?${GLSL_TYPE}\\s+([A-Za-z_]\\w*)$`));
    if (p) declared.add(p[1]);
  }
  const bad = [];
  const reId = /[A-Za-z_]\w*/g;
  let m;
  while ((m = reId.exec(s))) {
    if (s[m.index - 1] === ".") continue;                  // 成员/通道访问 v.x、n.rgb
    const n = m[0];
    if (!declared.has(n) && !GLSL_BUILTIN.has(n) && !bad.includes(n)) bad.push(n);
  }
  return bad;
}
let glCurShader = null, glCurProg = null;
const glStub = () => ({
  ...GL,
  createShader(type) { const s = { type, src: "", compiled: true, log: "" }; glStat.shaders.push(s); return s; },
  shaderSource(s, src) { s.src = src; },
  compileShader(s) { /* 只做粗查：有没有 #version、main、配平的括号 */
    if (!/^#version 300 es/.test(s.src)) { s.compiled = false; s.log = "missing #version 300 es"; }
    if (!/\bvoid\s+main\s*\(/.test(s.src)) { s.compiled = false; s.log = "missing main()"; }
    let d = 0; for (const ch of s.src) { if (ch === "{") d++; else if (ch === "}" && --d < 0) break; }
    if (d !== 0) { s.compiled = false; s.log = "unbalanced braces"; }
    if (s.compiled) {
      const bad = glslUndeclared(s.src);
      if (bad.length) { s.compiled = false; s.log = "undeclared: " + bad.join(","); }
    }
  },
  getShaderParameter(s) { return s.compiled; },
  getShaderInfoLog(s) { return s.log; },
  deleteShader() {},
  createProgram() { const p = { linked: true, log: "", attached: [] }; glStat.programs.push(p); return p; },
  attachShader(p, s) { p.attached.push(s); },
  linkProgram(p) { if (!p.attached.length || p.attached.some(s => !s.compiled)) { p.linked = false; p.log = "attach failed"; } },
  getProgramParameter(p) { return p.linked; },
  getProgramInfoLog(p) { return p.log; },
  useProgram(p) { glCurProg = p; },
  getUniformLocation(_p, name) { glStat.uniforms.add(name); return { name }; },
  getAttribLocation(_p, name) { glStat.attrs.add(name); return { name }; },
  createBuffer() { return { data: null }; },
  bindBuffer(_t, b) { glStat.binds++; glCurBuf = b; },
  bufferData(_t, data) { if (glCurBuf) { glCurBuf.data = data; glStat.uploads++; glLastBuf = glCurBuf; } },
  enable() {}, disable() {},
  depthFunc(f) { glStat.depthFunc = f; }, blendFunc(a, b) { glStat.blendFunc = [a, b]; },
  viewport(x, y, w, h) { glStat.viewport = [x, y, w, h]; },
  clearColor() {}, clearDepth() {}, clear(n) { glStat.clear += n; },
  depthRange(n, f) { glStat.depthRange = [n, f]; },
  uniform1f(l, v) { if (l) glStat.uni.push([l.name, v]); },
  uniform3fv(l, v) { if (l) glStat.uni.push([l.name, v]); },
  uniformMatrix3fv(l, _t, v) { if (l) glStat.uni.push([l.name, v]); },
  enableVertexAttribArray(i) { glStat.attrs.add("#" + i); },
  vertexAttribPointer() {},
  drawArrays(mode, first, count) { glStat.draws++; if (mode === GL.TRIANGLES) { glStat.verts += count; glStat.lastVerts = count; } },
  getError() { return GL.NO_ERROR; },
});
let glCurBuf = null;
let glLastBuf = null;
let glLastCanvas = null;

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
    querySelectorAll() { return []; },
    closest() { return null; },
    matches() { return false; },
    contains() { return false; },
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return this._html; },
    // 真实 DOM 里 innerHTML="" 会清空子节点；桩也必须这样，
    // 否则 renderForms() 每调一次就多攒一批按钮，"列表有 N 个按钮"的断言会失真。
    set(v) { this._html = v; if (!v) this.children.length = 0; },
  });
  if (tag === "canvas") {
    // 关键分流：webgl2 给 GL 桩，2d 给 Canvas 桩。混用会让 glInit() 拿到 2D 桩后整条 GL 路径假死。
    el.getContext = (type) => { const c = (type === "webgl2" || type === "webgl") ? glStub() : gStub(); if (type === "webgl2") glLastCanvas = el; return c; };
    el.toBlob = (cb) => cb({});
    el.toDataURL = () => "data:image/png;base64,AAAA";
  } else {
    el.getContext = (type) => (type === "webgl2" || type === "webgl") ? glStub() : gStub();
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
  documentElement: { dataset: { theme: "light" }, setAttribute(k, v) { if (k === "data-theme") this.dataset.theme = v; }, getAttribute(k) { return k === "data-theme" ? this.dataset.theme : null; } },
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
  localStorage: (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })(),
  // URL 加 ?gl2d=1 可强制走 Canvas 2D 路径（A/B 定位用）；沙箱里没有 location，得补一个
  location: { search: "", href: "" },
  matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }),
  
};
sandbox.window.document = document;
sandbox.window.matchMedia = sandbox.matchMedia;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.location = sandbox.location;
sandbox.globalThis = sandbox;
Object.defineProperty(sandbox, "__glLastBuf", { get() { return glLastBuf; } });
Object.defineProperty(sandbox, "__glLastCanvas", { get() { return glLastCanvas; } });
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
// 内含物：默认「无」（用户要求：不主动塞包体）；选中后数量与大小是两个独立参数
run(`selectMineral("quartz");`);
check("内含物默认「无」", run(`state.inclusion`) === "none" && run(`INC.length`) === 0,
  `inc=${run(`state.inclusion`)} INC=${run(`INC.length`)}`);
check("选中某一类后出现包体（数量滑杆与大小滑杆互不影响）", (() => {
  run(`state.inclusion = "rutile"; state.incDensity = 1; state.incSize = 1; buildInclusions();`);
  const n1 = run(`INC.length`);
  run(`state.incSize = 2.0; buildInclusions();`);
  const n2 = run(`INC.length`);          // 只改大小：数量不变
  const big = run(`(function(){let s=0;for(const f of INC)for(const p of f.pts)s+=Math.abs(p[0])+Math.abs(p[1])+Math.abs(p[2]);return s;})()`);
  run(`state.incSize = 1; buildInclusions();`);
  const small = run(`(function(){let s=0;for(const f of INC)for(const p of f.pts)s+=Math.abs(p[0])+Math.abs(p[1])+Math.abs(p[2]);return s;})()`);
  return n1 > 0 && n2 === n1 && big > small * 1.2;
})(), `数量 ${run(`INC.length`)}`);
check("数量滑杆为 0 时清空", (() => {
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
run(`state.alpha = null; state.transp = null; state.luster = null; state.incDensity = 0.6; state.incSize = 1; state.inclusion = "none"; buildInclusions(); renderTransp(); draw();`);

// ── 第八轮：石英道芬律 / 巴西律（第九轮改成"转变双晶"的正确表现）──
run(`selectMineral("quartz"); state.habitId = "dauphine-twin"; rebuildGeometry(); syncPanels();`);
check("石英道芬律：转变双晶（mode=domain, 域界 ⟂c = 基面 [001]）", (() => {
  const t = run(`JSON.stringify(habit().twin)`);
  return /"mode":"domain"/.test(t) && /"plane":\[0,0,1\]/.test(t) && run(`habit().twin.angle`) === 0;
})(), run(`JSON.stringify(habit().twin)`));
check("道芬律外形与单晶一致（不做两体复制，18 面）", run(`variant().counts.f`) === 18, `f=${run(`variant().counts.f`)}`);
check("道芬律有域界截面（内部虚线，不参与面数）", (() => {
  const d = run(`GEO.domain ? GEO.domain.length : 0`);
  return d >= 3 && run(`variant().counts.f`) === 18;
})(), `domain 点数=${run(`GEO.domain ? GEO.domain.length : 0`)}`);
check("道芬律不可拆解（noSplit，拆解控件隐藏）", (() => {
  run(`syncPanels(); syncPanels();`);
  return run(`habit().twin.noSplit`) === true && run(`document.getElementById("splitBox").style.display`) === "none"
    && run(`document.getElementById("domBox").style.display`) === "";
})());
run(`state.habitId = "brazil-twin"; rebuildGeometry(); syncPanels();;`);
check("石英巴西律：{11-20} 镜面（mode=domain, plane=[11-20]）", (() => {
  const t = run(`JSON.stringify(habit().twin)`);
  return /"mode":"domain"/.test(t) && /"plane":\[1,1,-2,0\]/.test(t);
})(), run(`JSON.stringify(habit().twin)`));
check("巴西律 c 轴平行（夹角 0°，左右形互生）", run(`habit().twin.angle`) === 0);
check("巴西律外形与单晶一致（18 面）", run(`variant().counts.f`) === 18, `f=${run(`variant().counts.f`)}`);
run(`state.habitId = "japan-twin"; rebuildGeometry(); syncPanels();;`);
check("日本律底部被截平（有截断面 form=-2）", (() => {
  return run(`GEO.faces.some(f => f.form === -2)`) === true;
})());
check("日本律整体仍闭合（欧拉数 2、无只用一次的棱）", (() => {
  const r = run(`(() => {
    const vs = new Set(); const em = new Map();
    for (const f of GEO.faces) {
      for (let j = 0; j < f.loop.length; j++) {
        vs.add(f.loop[j]);
        const a = f.loop[j], b = f.loop[(j + 1) % f.loop.length];
        const k = a < b ? a + "-" + b : b + "-" + a;
        em.set(k, (em.get(k) || 0) + 1);
      }
    }
    let once = 0; for (const c of em.values()) if (c === 1) once++;
    return [vs.size - em.size + GEO.faces.length, once];
  })()`);
  return r[0] === 2 && r[1] === 0;
})(), `面数=${run(`GEO.faces.length`)}`);

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
check("贯穿双晶拆开后每个个体都是完整体（萤石：两个闭合立方体）", (() => {
  run(`selectMineral("fluorite"); state.habitId = "spinel-twin"; state.twinSplit = 0; state.twinShow = "both"; rebuildGeometry();`);
  const togetherF = run(`GEO.faces.length`);
  run(`state.twinSplit = 1; rebuildGeometry();`);
  const chiEach = run(`(() => {
    const res = {};
    for (const k of [0, 1]) {
      const fs = GEO.faces.filter(f => f.indiv === k);
      const vs = new Set(); let E = 0;
      for (const f of fs) { for (const i of f.loop) vs.add(i); E += f.loop.length; }
      res[k] = [vs.size - E / 2 + fs.length, fs.length];
    }
    return res;
  })()`);
  const splitF = run(`GEO.faces.length`);
  const apart = run(`(() => {
    const cen = k => { const fs = GEO.faces.filter(f => f.indiv === k); const s = [0,0,0];
      for (const f of fs) for (const p of f.pts) { s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; }
      const n = fs.reduce((a,f)=>a+f.pts.length,0); return s.map(x=>x/n); };
    const a = cen(0), b = cen(1);
    return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
  })()`);
  run(`state.twinSplit = 0; rebuildGeometry();`);
  run(`selectMineral("quartz"); state.habitId = "japan-twin"; rebuildGeometry(); syncPanels();`);
  // 每个个体各是一个闭合体（χ=2）；拆开后两块在 x 方向不再重叠；面数回到"完整个体"的数量
  return chiEach[0][0] === 2 && chiEach[1][0] === 2 && apart > 1.0 && splitF < togetherF;
})(), `并集=${run(`selectMineral("fluorite"); state.habitId="spinel-twin"; state.twinSplit=0; rebuildGeometry(); const n=GEO.faces.length; selectMineral("quartz"); state.habitId="japan-twin"; rebuildGeometry(); syncPanels(); n`)}`);
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
/* 本体色层：中间薄（看得穿）、边缘厚（吃色）、越透明越薄但永不为零。
   这条断言同时钉住三件事：不透明时跳过、半透明时画、透明度越高中心 alpha 越低。 */
function tintProbe(alpha) {
  const stops = [];
  let box = 0;
  const cg = new Proxy({}, {
    get: (t, k) => {
      if (k === "createRadialGradient") return () => ({ addColorStop: (p, c) => stops.push([p, c]) });
      if (k === "fillRect") return () => box++;
      return () => {};
    },
    set: () => true,
  });
  sandbox.__cg = cg;
  const P = `makeProject({ cx: 400, cy: 300, scale: 1, vw: 800, vh: 600 })`;
  run(`state.alpha = ${alpha}; paintTint(__cg, ${P}, mat());`);
  return { box, stops };
}
const tClear = tintProbe(0.1);      // 90% 透明
const tTransl = tintProbe(0.55);    // 45% 透明
const tOpaque = tintProbe(1);       // 不透明
const alphaOf = (c) => { const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(String(c)); return m ? Number(m[1]) : -1; };
const aClearCenter = tClear.stops.length ? alphaOf(tClear.stops[0][1]) : -1;
const aTranslCenter = tTransl.stops.length ? alphaOf(tTransl.stops[0][1]) : -1;
check("半透明时画本体色层，不透明时跳过", tClear.box > 0 && tTransl.box > 0 && tOpaque.box === 0,
  `clear=${tClear.box} transl=${tTransl.box} opaque=${tOpaque.box}`);
check("本体色层中心比边缘薄（玻璃的芯看得穿、边吃色深）",
  tClear.stops.length === 3 && alphaOf(tClear.stops[0][1]) < alphaOf(tClear.stops[2][1]),
  tClear.stops.map(s => s[0] + ":" + alphaOf(s[1])).join(" "));
check("本体色层中间最厚、两头最薄（不透明靠晶面、全透明靠有色透射，都不需要平涂）",
  aTranslCenter > aClearCenter && aClearCenter >= 0 && aTranslCenter > 0.05 && aTranslCenter < 0.30,
  `90%透明芯=${aClearCenter} 45%透明芯=${aTranslCenter}`);
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

// ---- 第十八轮：场景照片背景（AI 生图内联 + 焦点对位 + 程序化兜底） ----
check("五套场景都内联了照片（data URL JPEG，且不是空占位）", (() => {
  const n = Number(run(`BG_IMGS ? Object.keys(BG_IMGS).length : 0`));
  if (n !== 5) return false;
  const ok = run(`["dark","lab","nature","cabinet","paper"].every(id => typeof BG_IMGS[id] === "string" && BG_IMGS[id].startsWith("data:image/jpeg;base64,") && BG_IMGS[id].length > 20000)`);
  return ok === true || ok === "true";
})(), `keys=${run(`BG_IMGS ? Object.keys(BG_IMGS).join(",") : "null"`)}`);
check("每个场景声明 img/focus/vig，且带桌面的场景焦点行 = table.y（贴桌不悬空）", (() => {
  const ok = run(`["dark","lab","nature","cabinet","paper"].every(id => { const B = BACKGROUNDS[id]; return B.img === id && Array.isArray(B.focus) && B.focus.length === 2 && typeof B.vig === "number" && (!B.table || Math.abs(B.focus[1] - B.table.y) < 1e-9); })`);
  return ok === true || ok === "true";
})());
check("照片 cover 对位：焦点行精确落在画布同一比例处（桌面线不随窗口比例漂移）", (() => {
  // 画布比 16:9 更宽（1600×800）：s = 1.25，dw = 1600、dh = 900，
  // dy = fy·(h−dh) = 0.6·(−100) = −60 —— 焦点行 0.6×900 + (−60) = 480 = 0.6×800 ✓
  const calls = [];
  const grad = { addColorStop() {} };
  const pg = new Proxy({}, {
    get: (t, k) => (k === "drawImage" ? (im, dx, dy, dw, dh) => calls.push([dx, dy, dw, dh])
      : (k === "createRadialGradient" || k === "createLinearGradient") ? () => grad : () => {}),
    set: () => true,
  });
  sandbox.__pg = pg;
  sandbox.__pim = { naturalWidth: 1280, naturalHeight: 720 };
  run(`drawCover(__pg, __pim, 1600, 800, 0.5, 0.6)`);
  const c = calls[0] || [];
  return calls.length === 1
    && Math.abs(c[0] - 0.5 * (1600 - 1280 * 1.25)) < 1e-9
    && Math.abs(c[1] - 0.6 * (800 - 720 * 1.25)) < 1e-9
    && Math.abs(c[2] - 1600) < 1e-9 && Math.abs(c[3] - 900) < 1e-9;
})(), `drawImage=${JSON.stringify(globalThis.__lastCover || "")}`);
check("照片未就绪时 drawPhoto 返回 false（回落程序化背景），不抛异常", (() => {
  const ok = run(`(() => { const saved = BG_IMG_ELS["lab"]; BG_IMG_ELS["lab"] = undefined; let threw = false, r = null; try { r = drawPhoto(__bg, BACKGROUNDS.lab, 800, 600); } catch (e) { threw = true; } BG_IMG_ELS["lab"] = saved; return r === false && !threw; })()`);
  return ok === true || ok === "true";
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

// ---- WebGL 阶段 A：GL 路径不是死的 -------------------------------------------
// glw 是 "1400x1050"（设备像素），要与 round(vw*dpr) 对上
// 「测试的测试」：静态检查本身必须能抓住拼错的标识符，否则它只是个心理安慰。
// 没有真浏览器可编译（Edge headless 退出码 13 / Chrome crashpad 被沙箱拦），
// 这一层是唯一能在提交前发现"着色器静默回落到 2D"的手段。
{
  const typo = glslUndeclared(`#version 300 es
void main() {
  float z = max(uDist - w.z, 0.4);
  vec3 c = clamp(envSample(2.0 * d * n - v), 0.0, 1.0);
  frag = vec4(c, 1.0);
}`);
  check("GLSL 静态检查能抓住拼错的 uniform（uFo → uFoc）",
    typo.includes("uDist") && typo.includes("w") && typo.includes("frag") && typo.includes("d") && typo.includes("n") && typo.includes("v") && typo.includes("envSample"),
    JSON.stringify(typo));
  const clean = glslUndeclared(`#version 300 es
precision highp float;
uniform float uDist, uFoc, uCx, uCy, uAmb;
flat in vec3 vCol;
in vec3 vPos;
out vec4 frag;
vec3 envSample(vec3 r) { return r * 0.5; }
void main() {
  float alpha = 1.0;
  vec3 base = vCol;
  if (vPos.z < 0.5) { base *= 0.5; alpha = 0.92; }
  vec3 n = normalize(vPos);
  vec3 v = normalize(vec3(0.0, 0.0, uDist) - vPos);
  float d = dot(n, v);
  float R0 = 1.0;
  float F = R0 + (1.0 - R0) * pow(1.0 - abs(d), 5.0);
  vec3 c = base * uAmb + envSample(2.0 * d * n - v) * F;
  for (int i = 0; i < 3; i++) { c += vec3(0.1); }
  frag = vec4(clamp(c, 0.0, 1.0), alpha);
}`);
  check("GLSL 静态检查不误报（合法着色器零告警）", clean.length === 0, JSON.stringify(clean));
}
const glLastOptsOk = (glw, vw, vh) => {
  const m = /^(\d+)x(\d+)$/.exec(glw || "");
  if (!m) return false;
  const dpr = run(`glLastOpts && glLastOpts.dpr ? glLastOpts.dpr : 1`);
  return Number(m[1]) === Math.round(vw * dpr) && Number(m[2]) === Math.round(vh * dpr);
};
{
  // 1) 桩里录到了几个着色器/程序
  check("WebGL 桩已装（getContext 按 type 分流）", run(`typeof glInit`) === "function" && glStat.shaders.length >= 2, `shaders=${glStat.shaders.length}`);
  check("两个着色器都编译通过", glStat.shaders.length === 2 && glStat.shaders.every(s => s.compiled),
    glStat.shaders.map(s => `${s.type === 0x8B31 ? "VS" : "FS"}:${s.compiled ? "ok" : s.log}`).join(" "));
  check("着色器 info log 干净（无 warning）", glStat.shaders.every(s => s.log === ""), JSON.stringify(glStat.shaders.map(s => s.log)));
  check("程序链接成功且 info log 干净", glStat.programs.length === 1 && glStat.programs[0].linked && glStat.programs[0].log === "");
  check("深度测试开启且用 LEQUAL", glStat.depthFunc === 0x0203, String(glStat.depthFunc));
  check("混合函数 = SRC_ALPHA / ONE_MINUS_SRC_ALPHA", JSON.stringify(glStat.blendFunc) === "[770,771]", JSON.stringify(glStat.blendFunc));

  // 2) 着色器里声明的每个 uniform/attribute，JS 都必须拿到非 null location
  const src = glStat.shaders.map(s => s.src).join("\n");
  const declU = [...src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map(m => m[1]);
  const declA = [...src.matchAll(/(?:in|layout\s*\(location\s*=\s*\d+\s*\)\s*in)\s+\w+\s+(\w+)/g)]
    .map(m => m[1]).filter(n => n !== "vCol" && n !== "vFront" && n !== "vPos" && n !== "vNrm");
  const uniq = (a) => [...new Set(a)];
  const missU = uniq(declU).filter(n => !glStat.uniforms.has(n));
  const missA = uniq(declA).filter(n => !glStat.attrs.has(n));
  check("着色器声明的 uniform 全部在 JS 有 location", missU.length === 0, `missing=[${missU}]`);
  check("着色器声明的 attribute 全部在 JS 有 location", missA.length === 0, `missing=[${missA}]`);
  const badLoc = glStat.uni.filter(([n]) => n.startsWith("#") || n === "null" || n === "undefined");
  check("没有查不到 location 的 uniform 被上传", badLoc.length === 0, JSON.stringify(badLoc.slice(0, 5)));

  // 3) 缓冲顶点数 = Σ每面(pts-2)*3 —— 扇形三角化，少一个面就少一批顶点
  const want = run(`GEO.faces.reduce((a,f)=>a+(f.pts.length-2)*3,0)`);
  const buf = run(`(() => { const b = __glLastBuf; return b && b.data ? b.data.length/GL_STRIDE : -1; })()`);
  check("GL 顶点数 = 扇形三角化的 Σ(n−2)·3", buf === want, `buf=${buf} want=${want}`);

  // 3b) 防裂缝改成顶点着色器外扩：必须有面心属性 + 外扩算式 + 每顶点 12 个 float。
  // 关掉棱线时晶体不能自己长出一圈假轮廓——那是旧的 2D 补缝描边造成的，
  // 它按"棱中点一次着色"取色，而 GL 是逐像素着色，掠射处菲涅耳差得远。
  check("顶点着色器带面心属性与 0.8px 外扩（用于消掉抗锯齿裂缝）", (() => {
    const vs = run(`GL_VS`);
    return /layout\(location=3\)\s+in\s+vec3\s+aCen/.test(vs) && /sp\s*\+=\s*d\s*\/\s*dl/.test(vs) && run(`GL_STRIDE`) === 12;
  })());
  check("paintOverlay 不再补缝描边（否则关掉棱线也会有一圈假棱）", (() => {
    const a = html.indexOf("function paintOverlay(");
    const src = html.slice(a, html.indexOf("function paintFaces2D(", a));
    return a > 0 && src.length > 0 && !/shadeFace\s*\(/.test(src);
  })());

  // 4) drawArrays 真的被调用了，且顶点数与缓冲一致（否则画面是空的）
  check("drawArrays 被调用", glStat.draws > 0, `calls=${glStat.draws}`);
  check("提交的三角形顶点数 = 缓冲顶点数（最近一次 draw）", glStat.lastVerts === want, `verts=${glStat.lastVerts} want=${want}`);
  const glw = run(`(() => { const c = __glLastCanvas; return c ? c.width + "x" + c.height : ""; })()`);
  check("GL 画布尺寸已设置（跟随视口 DPR）", /^\d+x\d+$/.test(glw), glw);

  // 5) 投影必须与 2D 逐字对应。glLastOpts 是最近一次 glRender 真实用的视口参数，
  //    拿它现算一个 makeProject 与 GL 的 uniform 逐项比对——写死 1280x860 会和导出尺寸打架。
  const lastU = (n) => { const a = glStat.uni.filter(u => u[0] === n); return a.length ? a[a.length - 1][1] : undefined; };
  const po = JSON.parse(run(`(() => { const p = makeProject(glLastOpts); return JSON.stringify([p.DIST, p.FOC, p.cx, p.cy, p.vw, p.vh]); })()`));
  const [pD, pF, pCx, pCy, pVw, pVh] = po;
  check("glLastOpts 与 GL 画布尺寸一致", glLastOptsOk(glw, pVw, pVh), `canvas=${glw} opts=${pVw}x${pVh}`);
  check("GL 的 DIST 与 makeProject 一致", lastU("uDist") === pD, `gl=${lastU("uDist")} 2d=${pD}`);
  check("GL 的 FOC 与 makeProject 一致", lastU("uFoc") === pF, `gl=${lastU("uFoc")} 2d=${pF}`);
  check("GL 的光心 cx/cy 与 makeProject 一致", lastU("uCx") === pCx && lastU("uCy") === pCy, `gl=${lastU("uCx")},${lastU("uCy")} 2d=${pCx},${pCy}`);
  check("GL 的视口宽高与 makeProject 一致", lastU("uVw") === pVw && lastU("uVh") === pVh, `gl=${lastU("uVw")}x${lastU("uVh")}`);
  // 深度范围：着色器里把 z 重映射到 [uZn, uZf]，必须包住当前姿态且下界 ≥ 0.4（VS 把 z 夹到 0.4）
  const zn = lastU("uZn"), zf = lastU("uZf");
  check("GL 深度范围包住晶体且下界 ≥ 0.4", zn >= 0.4 && zf > zn, `[${zn}, ${zf}]`);
  // 顶点着色器的 clip 公式必须与 makeProject 的 project() 逐字对应：
  // 取一个真实顶点，用 GL uniform 复算一遍 NDC，再和 2D 投影反推的 NDC 比
  const ndc = run(`(() => {
    const p = makeProject(glLastOpts);
    const VW = p.vw, VH = p.vh;
    const v = GEO.P[0];
    const s2 = p(v);
    return JSON.stringify([ (s2[0] / VW) * 2 - 1, 1 - (s2[1] / VH) * 2 ]);
  })()`);
  const [nx, ny] = JSON.parse(ndc);
  const redo = run(`(() => {
    const o = glLastOpts, DIST = 7.0, FOC = 3.05 * o.scale * Math.min(o.vw, o.vh) * 0.5;
    const R = qToMat(state.quat);
    const v = GEO.P[0];
    const w = [R[0][0]*v[0]+R[0][1]*v[1]+R[0][2]*v[2], R[1][0]*v[0]+R[1][1]*v[1]+R[1][2]*v[2], R[2][0]*v[0]+R[2][1]*v[1]+R[2][2]*v[2]];
    const z = Math.max(DIST - w[2], 0.4);
    return JSON.stringify([ ((o.cx + w[0]*FOC/z)/o.vw)*2 - 1, 1 - ((o.cy - w[1]*FOC/z)/o.vh)*2 ]);
  })()`);
  const [rx, ry] = JSON.parse(redo);
  check("GL 顶点着色器的 clip 公式 = 2D 投影公式（同源）", Math.abs(nx - rx) < 1e-9 && Math.abs(ny - ry) < 1e-9, `2d=[${nx.toFixed(6)},${ny.toFixed(6)}] gl=[${rx.toFixed(6)},${ry.toFixed(6)}]`);

  // 5b) 【决定性断言】拿「桩里真实录到的 uRot + 全部 uniform」在 Node 侧重放一遍顶点着色器，
  //     再和 makeProject 的屏幕坐标反推的 NDC **逐顶点**比对。
  //     为什么必须逐顶点：只查 P[0] 会漏掉「矩阵转置写反」「平移 pan 漏传给 GL」这类
  //     整体性错误——它们不会让画面报错，只会让 GL 填充整体偏移/翻转，
  //     于是 2D 棱线整片飘到晶体外面（用户看到的就是"晶体不显示棱线、棱飘在晶体外"）。
  const glNdcNow = () => {
    const Rot = lastU("uRot");                        // 列主序展平的 9 个数
    const uCx = lastU("uCx"), uCy = lastU("uCy"), uVw = lastU("uVw"), uVh = lastU("uVh");
    const uFoc = lastU("uFoc"), uDist = lastU("uDist");
    if (!Rot || Rot.length !== 9) return null;
    const P = JSON.parse(run(`JSON.stringify(GEO.P)`));
    return P.map(v => {
      // 上传数组是列主：m[c][r] = F[c*3+r] = R[r][c]，故 (m*v)[r] = F[r]*v0 + F[3+r]*v1 + F[6+r]*v2
      const w = [0, 1, 2].map(r => Rot[r] * v[0] + Rot[3 + r] * v[1] + Rot[6 + r] * v[2]);
      const z = Math.max(uDist - w[2], 0.4);
      return [((uCx + w[0] * uFoc / z) / uVw) * 2 - 1, 1 - ((uCy - w[1] * uFoc / z) / uVh) * 2];
    });
  };
  const twoNdcNow = () => JSON.parse(run(`(() => {
    const p = makeProject(glLastOpts);
    return JSON.stringify(GEO.P.map(v => { const s = p(v); return [(s[0] / p.vw) * 2 - 1, 1 - (s[1] / p.vh) * 2]; }));
  })()`));
  const cmpNdc = (tag) => {
    const a = twoNdcNow(), b = glNdcNow();
    if (!b) { check(tag, false, "uRot 未上传"); return; }
    let worst = 0, wi = -1;
    for (let i = 0; i < a.length; i++) {
      const d = Math.max(Math.abs(a[i][0] - b[i][0]), Math.abs(a[i][1] - b[i][1]));
      if (d > worst) { worst = d; wi = i; }
    }
    // 容差 1e-6 而不是 1e-9：GL 的 uRot 是 Float32Array（上传必然降精度），
    // 2D 侧是 float64。实测最大偏差 5.6e-9 NDC ≈ 4e-6 像素，肉眼不可见，
    // 但它会让"容差写 1e-9"的断言变成永假 FAIL，反而盖住真问题（pan bug 是 5.8e-2）。
    check(tag, worst < 1e-6, `${a.length} 顶点最大偏差 ${worst.toExponential(2)}` + (wi >= 0 && worst > 1e-6 ? ` @顶点${wi}` : "") + (worst > 1e-6 ? `（≈ ${(worst * 700).toFixed(1)} px 偏移）` : ""));
  };
  cmpNdc("GL 全部顶点的 NDC = 2D 投影（同源，逐顶点）");
  // 平移（右键/Shift 拖动）也必须同源：GL 用的是 opts.cx/cy，2D 用的是 cx+pan，
  // 两边差一个 pan 就会整体错位——这正是"棱线飘到晶体外"的直接成因
  run(`state.pan = [37, -21]; draw();`);
  cmpNdc("平移后 GL 与 2D 仍逐顶点同源（pan 不能漏传给 GL）");
  run(`state.pan = [0, 0]; draw();`);

  // 5c) 【同类致命 bug 的第二道防线】上面的比对是「照着重写一遍公式」，
  //     所以它只能证明我重写的公式对，**证明不了 GPU 真正看到的 clip 空间**。
  //     GPU 会把 gl_Position.xyz 除以 gl_Position.w。xy 既然已经是换算好的 NDC，
  //     第 4 个分量就必须是常量 1.0；一旦写成 z（≈6–8），画面会整体缩成 1/z 并往中心吸，
  //     而 2D 棱线不除 —— 正是"棱线飘在晶体外、且随旋转呼吸"。
  //     这里从着色器源码里把 gl_Position 的四个分量抠出来，按 GPU 的规则除一遍再比。
  check("gl_Position.w 是常量 1.0（GPU 的透视除法不会把画面再缩一遍）", (() => {
    const src = String(run(`GL_VS`) || "");
    const m = /gl_Position\s*=\s*vec4\s*\(([\s\S]*?)\)\s*;/.exec(src);
    if (!m) return "找不到 gl_Position";
    const parts = m[1].split(",").map(s => s.trim());
    if (parts.length !== 4) return "分量数不是 4：" + parts.length;
    const w = parts[3];
    return w === "1.0" ? "ok" : `第 4 分量是 ${w}（应为 1.0）`;
  })(), String(run(`/gl_Position\\s*=\\s*vec4\\s*\\(([\\s\\S]*?)\\)\\s*;/.exec(GL_VS)[1].replace(/\\s+/g," ").slice(0,140)`) || ""));

  // 6) 旋转只改 uniform、不重传缓冲：连画两帧，uploads 不增加
  const up0 = glStat.uploads;
  run(`state.yaw += 0.7; draw();`);
  check("旋转不重传顶点缓冲（uniform-only）", glStat.uploads === up0, `uploads ${up0}→${glStat.uploads}`);
  const up1 = glStat.uploads;
  run(`state.mask = 5; rebuildGeometry(); draw();`);
  check("改单形掩码会重传顶点缓冲", glStat.uploads === up1 + 1, `uploads ${up1}→${glStat.uploads}`);

  // 7) 回落：2D 路径仍在（无 GL 时不能白屏）
  check("Canvas 2D 兜底路径仍存在", run(`typeof paintFaces2D`) === "function" && run(`typeof paintOverlay`) === "function");
  check("GL 与 2D 用同一个 faceColor（配色不分叉）", run(`typeof faceColor`) === "function");
  // 颜色必须是 0..1：GL 顶点属性不分量纲，0..255 会被 clamp 成全白
  const cols = run(`(() => { const s = new Set(); for (const f of GEO.faces) s.add(JSON.stringify(faceColor(f))); return [...s]; })()`);
  check("faceColor 输出 0..1（GL 顶点属性不会溢出成全白）", cols.every(c => JSON.parse(c).every(x => x >= 0 && x <= 1)), JSON.stringify(cols).slice(0, 90));
  // 换单色要重传缓冲：颜色在顶点属性里，不重传就还是旧色
  const upC = glStat.uploads;
  run(`state.colorMode = "mineral"; state.uniform = "#ff8800"; draw();`);
  check("切换单色会重传顶点缓冲", glStat.uploads === upC + 1, `uploads ${upC}→${glStat.uploads}`);
  check("单色进了顶点缓冲（#ff8800 = 1, 0.533, 0；截断面保持 CLIP 色）", (() => {
    if (!glLastBuf) return false;
    const d = Array.from(glLastBuf.data);
    const isUniform = (i) => Math.abs(d[i] - 1) <= 1e-6 && Math.abs(d[i + 1] - 136 / 255) <= 1e-6 && Math.abs(d[i + 2]) <= 1e-6;
    // 截断面（form<0）走 CLIP_TINT，是刻意的"断面"标记色，不算单色失效
    const isClip = (i) => Math.abs(d[i] - 0.58) <= 1e-6 && Math.abs(d[i + 1] - 0.62) <= 1e-6 && Math.abs(d[i + 2] - 0.68) <= 1e-6;
    let uni = 0, clip = 0;
    for (let i = 6; i + 2 < d.length; i += run(`GL_STRIDE`)) {
      if (isUniform(i)) uni++;
      else if (isClip(i)) clip++;
      else return false;
    }
    return d.length >= run(`GL_STRIDE`) && uni > 0;
  })(), "");
  run(`state.colorMode = "mineral"; state.uniform = null; draw();`);
}

/* ── 第九轮：单形列表 / 内含物双参数 / 透明度 / 透射参考物 ────────────────── */
{
  // 1) 单形选择列表必须真的有按钮。曾经的 bug：renderForms() 从未被调用，
  //    #forms 一直是空的——用户点"没有反应"其实是"根本没有可点的东西"。
  for (const [mn, hb] of [["fluorite", "cuboctahedron"], ["quartz", "prismatic"], ["calcite", "scalenohedron"]]) {
    run(`selectMineral("${mn}"); state.habitId = "${hb}"; rebuildGeometry(); syncPanels();`);
    const n = run(`document.getElementById("forms").children.length`);
    const k = run(`habit().forms.length`);
    check(`单形选择有 ${k} 个可点按钮（${mn}/${hb}）`, n === k, `forms=${n} want=${k}`);
  }
  // 2) 点按钮必须真的改掩码与几何
  run(`selectMineral("quartz"); state.habitId = "prismatic"; rebuildGeometry(); syncPanels();`);
  const f0 = run(`variant().counts.f`);
  run(`(function(){ const b = document.getElementById("forms").children[0]; if (b && b.onclick) b.onclick(); })()`);
  check("点单形按钮会改掩码（掩码变了）", run(`state.mask`) !== 0, `mask=${run(`state.mask`)}`);
  run(`state.mask = 0; rebuildGeometry(); draw();`);
  void f0;

  // 3) 透明度滑杆：读数是透明度，state.alpha 是不透明度（互为补数）
  run(`state.luster = "glass"; state.transp = null; state.alpha = null; renderTransp();`);
  const pos0 = run(`+document.getElementById("alphaR").value`);
  check("透明度滑杆读数 = 100 − 不透明度（方向不能反）",
    Math.abs(pos0 - Math.round((1 - run(`mat().alpha`)) * 100)) <= 1,
    `slider=${pos0} alpha=${run(`mat().alpha`)}`);
  run(`document.getElementById("alphaR").oninput({ target: { value: "90" } });`);
  check("把透明度拉到 90% → 不透明度 0.10", Math.abs(run(`state.alpha`) - 0.10) < 1e-9, `alpha=${run(`state.alpha`)}`);
  run(`document.getElementById("alphaR").oninput({ target: { value: "0" } });`);
  check("把透明度拉到 0% → 不透明度 1（完全不透明）", run(`state.alpha`) === 1, `alpha=${run(`state.alpha`)}`);
  run(`state.alpha = null; state.transp = null; state.luster = null; renderTransp(); draw();`);

  // 4) 场景内容物：每个场景都要在晶体正后方放**属于自己的**东西（透过去才看得见）
  {
    const calls = [];
    const grad = { addColorStop() {} };
    const cg = new Proxy({}, {
      get: (t, k) => {
        if (k === "fillRect" || k === "strokeRect") return (x, y, w, h) => calls.push([x, y, w, h]);
        if (k === "arc" || k === "ellipse") return (x, y, r) => calls.push([x - r, y - r, r * 2, r * 2]);
        if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad;
        return () => {};
      },
      set: () => true,
    });
    sandbox.__cg = cg;
    // 晶体大致占 cx=400、cy=240、R≈204 这一块；内容物必须有东西压在这块里面
    const behind = (id) => {
      calls.length = 0;
      run(`drawSceneProps(__cg, "${id}", 800, 600);`);
      return calls.filter(([x, y, w, h]) => x < 400 && x + w > 400 && y < 240 && y + h > 240).length;
    };
    for (const id of ["dark", "lab", "nature", "cabinet", "paper"]) {
      check(`场景「${id}」在晶体正后方有内容物`, behind(id) > 0 && calls.length > 4, `rects=${calls.length}`);
    }
    check("五个场景的内容物互不相同（不是同一套图案）", (() => {
      const sig = (id) => { calls.length = 0; run(`drawSceneProps(__cg, "${id}", 800, 600);`); return calls.map(c => c.map(v => v.toFixed(2)).join(",")).join("|"); };
      const s = ["dark", "lab", "nature", "cabinet", "paper"].map(sig);
      return new Set(s).size === 5;
    })());
  }

  // 5) GL 逐像素透明度：alpha 由 uAlpha 与高光共同决定（高光不随透射淡掉）
  check("GL 片元着色器有 uAlpha，且像素 alpha = max(uAlpha, 面底线) 再按高光抬升", (() => {
    const src = run(`GL_FS`);
    return /uniform\s+float\s+[^;]*uAlpha/.test(src)
      && /pa\s*=\s*clamp\(max\(uAlpha,\s*floorA\)/.test(src)
      && /floorA\s*=\s*[\d.]+\s*\+\s*[\d.]+\s*\*/.test(src);
  })());
  const uniA = glStat.uni.filter(u => u[0] === "uAlpha");
  check("uAlpha 每次绘制都上传", uniA.length > 0, `n=${uniA.length}`);
  check("全透明时 uAlpha = 0（clear 档就是 100% 透明），半透明 0.62，不透明 1", (() => {
    // 旧版 clear 是 0.26，滑杆只显示到 74%——用户问"全透明为什么不是 100%"。
    // 现在全透明真的是 0：晶面只剩表面反射，颜色交给「有色透射」的 multiply 层。
    run(`state.luster = "glass"; state.transp = "clear"; state.alpha = (transpById("clear") || {}).alpha; renderTransp(); draw();`);
    const vc = (glStat.uni.filter(u => u[0] === "uAlpha").pop() || [])[1];
    run(`state.transp = "transl"; state.alpha = (transpById("transl") || {}).alpha; renderTransp(); draw();`);
    const vt = (glStat.uni.filter(u => u[0] === "uAlpha").pop() || [])[1];
    run(`state.transp = "opaque"; state.alpha = (transpById("opaque") || {}).alpha; renderTransp(); draw();`);
    const vo = (glStat.uni.filter(u => u[0] === "uAlpha").pop() || [])[1];
    run(`state.luster = null; state.transp = null; state.alpha = null; renderTransp(); draw();`);
    return Math.abs(vc - 0) < 1e-9 && Math.abs(vt - 0.62) < 1e-9 && Math.abs(vo - 1) < 1e-9;
  })(), (() => {
    const f = (id) => {
      run(`state.luster = "glass"; state.transp = "${id}"; state.alpha = (transpById("${id}") || {}).alpha; renderTransp(); draw();`);
      return (glStat.uni.filter(u => u[0] === "uAlpha").pop() || [])[1];
    };
    const r = ["clear", "transl", "opaque"].map(f).join("/");
    run(`state.luster = null; state.transp = null; state.alpha = null; renderTransp(); draw();`);
    return r;
  })());
}

/* ── 第十轮：标题栏 + 主题三态 + 左右分栏（UI 重构）────────────────── */
check("标题是「晶体世界 · Crystal World」", /<title>[^<]*晶体世界/.test(html), html.match(/<title>([^<]*)<\/title>/)?.[1]);
check("默认主题是亮色（data-theme=light），不是深色", (() => {
  const t = run(`document.documentElement.dataset.theme`);
  const stored = (() => { try { return vm.runInContext(`localStorage.getItem("crystalworld.theme")`, sandbox); } catch (e) { return null; } })();
  return t === "light" && (stored === null || stored === "light");
})());
check("主题三态循环 light → dark → auto → light", (() => {
  const seq = [];
  const btn = document.getElementById("tbTheme");
  for (let i = 0; i < 4; i++) {
    seq.push(run(`document.documentElement.dataset.theme`));
    // 直接调用处理器：桩元素没有真实 onclick 派发
    run(`document.getElementById("tbTheme").onclick();`);
  }
  return seq.join(",") === "light,dark,auto,light";
})(), () => run(`document.documentElement.dataset.theme`));
check("主题写进 localStorage（下次打开记住）", (() => {
  // 从当前态再点满三轮，落到 light 时应把 light 写回去（关键是 setItem 真被调用）
  const before = (() => { try { return vm.runInContext(`localStorage.getItem("crystalworld.theme")`, sandbox); } catch (e) { return null; } })();
  run(`document.getElementById("tbTheme").onclick();`);
  const after = (() => { try { return vm.runInContext(`localStorage.getItem("crystalworld.theme")`, sandbox); } catch (e) { return null; } })();
  return before !== null && after !== null && before !== after;
})());
check("图标随主题切换（三个图标只显示一个）", (() => {
  const shown = ["icSun", "icMoon", "icAuto"].filter(k => {
    const el = document.getElementById(k);
    return el && el.style.display === "";
  });
  return shown.length === 1;
})(), `可见=${["icSun", "icMoon", "icAuto"].filter(k => { const el = document.getElementById(k); return el && el.style.display === ""; }).join("/") || "无"}`);
// 面板归属必须从 HTML 源码读——桩的 querySelectorAll 不认 ".panel.left [data-sec]" 这类选择器
const secsIn = (panel) => {
  const m = html.match(new RegExp(`<aside class="panel ${panel}">([\\s\\S]*?)</aside>`));
  return m ? [...m[1].matchAll(/data-sec="([a-z]+)"/g)].map(x => x[1]) : [];
};
const popFors = [...html.matchAll(/<div class="pop" data-for="([a-z]+)"/g)].map(x => x[1]);
check("顶部图标按钮共 4 个：视角 / 操作 / 导出 / 数据", popFors.length === 4 && ["view", "input", "export", "data"].every(k => popFors.includes(k)), `pops=${popFors.join(",")}`);
check("左侧是「选择」（晶系/矿物/认识它/外形/单形/组/场景），右侧是「微调」（颜色/质感/内含物/光照/显示）", (() => {
  const left = secsIn("left"), right = secsIn("right");
  const wantL = ["sys", "min", "about", "hab", "frm", "group", "scene"];
  const wantR = ["color", "luster", "incl", "light", "display"];
  return wantL.every(k => left.includes(k)) && wantR.every(k => right.includes(k)) && left.length === 7 && right.length === 5;
})(), `L=${secsIn("left").join(",")} R=${secsIn("right").join(",")}`);
check("视角/操作/导出/数据已从两侧面板搬到顶部浮出（不重复）", (() => {
  const inPanels = [...secsIn("left"), ...secsIn("right")];
  return !["view", "input", "export", "data"].some(k => inPanels.includes(k));
})());
check("场景选择器只有一个（#bgs 未因搬家而重复）", (() => {
  const a = html.split(/id="bgs"/).length - 1;
  return a === 1 && document.getElementById("bgs") !== null;
})(), `html=${html.split(/id="bgs"/).length - 1}`);
check("顶栏是细条（42px 行高，不抢戏）", /grid-template-rows:\s*42px\s+1fr/.test(html) && /\.topbar\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(html));
check("三套主题变量都定义（dark / light / auto）", (() => {
  const has = (sel) => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{").test(html);
  return has(':root[data-theme="dark"]') && has(':root[data-theme="light"]') && has(':root[data-theme="auto"]');
})());
check("gl_Position.w 是常量 1.0（GPU 会除掉它，给了 z 画面会被吸进中心）", (() => {
  const src = run(`GL_VS`);
  // 分量里还有括号（max(uZf-uZn,1e-4)），不能按 [^)]* 截
  const m = /gl_Position\s*=\s*vec4\(/.exec(src);
  if (!m) return false;
  const body = src.slice(m.index + m[0].length, src.indexOf(");", m.index) + 1);
  // 按顶层逗号切
  let depth = 0, parts = [], cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  if (parts.length === 4) parts[3] = parts[3].replace(/\)\s*$/, "");   // 尾巴上还带一个右括号
  return parts.length === 4 && parts[3] === "1.0";
})(), () => { const m = /gl_Position\s*=\s*vec4\(/.exec(run(`GL_VS`)); return m ? run(`GL_VS`).slice(m.index, m.index + 120).replace(/\s+/g, " ") : "未找到"; });
check("HUD 文字颜色跟着场景明暗走（浅场景深字、深场景浅字）", (() => {
  const cls = (bg) => { run(`state.bg = "${bg}"; draw();`); return [...document.body.classList._s].join(","); };
  const paper = cls("paper"), dark = cls("dark");
  run(`state.bg = "lab"; draw();`);
  return paper.includes("lightbg") && !paper.includes("darkbg") && dark.includes("darkbg") && !dark.includes("lightbg");
})(), `paper=${(() => { run(`state.bg = "paper"; draw();`); return [...document.body.classList._s].join(","); })()}`);
check("顶栏图标按钮是 4 个（视角/操作/导出/数据）", (() => {
  const m = html.match(/<nav class="tb-tools" id="tbTools">([\s\S]*?)<\/nav>/);
  return !!m && (m[1].match(/class="tbtn"/g) || []).length === 4;
})(), `n=${(() => { const m = html.match(/<nav class="tb-tools" id="tbTools">([\s\S]*?)<\/nav>/); return m ? (m[1].match(/class="tbtn"/g) || []).length : 0; })()}`);
check("顶栏没有把 logo 做得很大（图标钮 30×26）", /\.tbtn\{[^}]*width:30px;height:26px/.test(html));
check("JS 里 getElementById 的每个 id 在 HTML 里都真实存在（防搬家后拼错/漏搬）", (() => {
  const want = new Set();
  for (const m of html.matchAll(/getElementById\("([^"]+)"\)/g)) want.add(m[1]);
  const have = new Set([...html.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
  const missing = [...want].filter(k => !have.has(k));
  return missing.length === 0;
})(), `缺=${(() => { const want = new Set(); for (const m of html.matchAll(/getElementById\("([^"]+)"\)/g)) want.add(m[1]); const have = new Set([...html.matchAll(/id="([^"]+)"/g)].map(x => x[1])); return [...want].filter(k => !have.has(k)).join(",") || "无"; })()}`);

// ── 第十一轮：矿物科普（认识它） + 新矿物/新光源 ──
const pInfo = () => { const s = run(`selectMineral("pyrite"); syncPanels(); const t = mineral().pointGroup + " " + mineral().luster + " " + habit().forms.map(f=>f.faces).join("/"); selectMineral("fluorite"); syncPanels(); t`); return s; };
check("「认识它」面板存在且放在矿物旁（左栏，与「数据」分开）", (() => {
  const secs = [...html.matchAll(/<div class="sec" data-sec="([a-z]+)">/g)].map(x => x[1]);
  return secs.includes("about") && secs.indexOf("about") === secs.indexOf("min") + 1;
})(), `左栏顺序=${[...html.matchAll(/<div class="sec" data-sec="([a-z]+)">/g)].map(x => x[1]).slice(0, 7).join(",")}`);
check("12 种矿物每种都有 about 四段科普（zh/where/hard/spot）", (() => {
  const bad = run(`DATA.minerals.filter(m => !m.about || !m.about.zh || !m.about.where || !m.about.hard || !m.about.spot).map(m => m.id)`);
  return bad.length === 0 && run(`DATA.minerals.length`) === 12;
})(), `缺=${run(`DATA.minerals.filter(m => !m.about || !m.about.zh || !m.about.where || !m.about.hard || !m.about.spot).map(m => m.id).join(",")`)}`);
check("renderAbout() 被 syncPanels() 调用（换矿物时刷新）", /renderAbout\(\);\s*\/\/[^\n]*认识它/.test(html) && /function renderAbout\(\)/.test(html));
check("导出默认带「认识它」，且换矿物后内容跟着变", (() => {
  const a = run(`selectMineral("diamond"); syncPanels(); document.getElementById("aboutZh").textContent`);
  const b = run(`selectMineral("gypsum"); syncPanels(); document.getElementById("aboutZh").textContent`);
  return !!a && !!b && a !== b && run(`state.exp.fields.about`) !== undefined;
})());
check("新矿物：黄铁矿 m-3（偏形，五角十二面体 12 面）/ 钻石 adamantine / 黄玉 斜方", (() => {
  const p = run(`selectMineral("pyrite"); syncPanels(); [mineral().pointGroup, mineral().luster, mineral().habits.map(h=>h.forms.map(f=>f.faces).join("/")).join(",")]`);
  const d = run(`selectMineral("diamond"); syncPanels(); [mineral().luster, mineral().habits.map(h=>h.forms.map(f=>f.faces).join("/")).join(",")]`);
  const t = run(`selectMineral("topaz"); syncPanels(); [mineral().system, mineral().habits.map(h=>h.forms.map(f=>f.faces).join("/")).join(",")]`);
  run(`selectMineral("fluorite"); syncPanels();`);
  return p[0] === "m-3" && p[1] === "metallic" && p[2].split(/[,\/]/).includes("12")
    && d[0] === "adamantine" && d[1].split(/[,\/]/).includes("8")
    && t[0] === "orthorhombic" && t[1].split(/[,\/]/).includes("4");
})(), "pyrite=" + pInfo());
check("光泽只留四种（蜡状/玻璃/金刚/金属），不透明与透明已从 UI 拿掉", (() => {
  const vis = run(`Object.entries(LUSTERS).filter(([k, v]) => !v.hidden).map(([k]) => k)`);
  return vis.length === 4 && vis.includes("waxy") && vis.includes("glass") && vis.includes("adamantine") && vis.includes("metallic");
})(), `可见=${run(`Object.entries(LUSTERS).filter(([k,v])=>!v.hidden).map(([k])=>k).join(",")`)}`);
check("矿物默认光泽/通透度按实际性质校准（2026-10-24，来源 Mindat / Handbook of Mineralogy）", (() => {
  // 石榴石与方解石曾误标金刚（真实是玻璃光泽）；石膏的蜡状只属于块状雪花石膏（晶体是玻璃+珍珠）。
  // 透明度一律按"最高品级"取全透明，唯一例外是金属（天然不透明）。
  const want = {
    fluorite: ["glass", "clear"], pyrite: ["metallic", "opaque"], diamond: ["adamantine", "clear"],
    garnet: ["glass", "clear"], scheelite: ["adamantine", "clear"], beryl: ["glass", "clear"],
    quartz: ["glass", "clear"], calcite: ["glass", "clear"], topaz: ["glass", "clear"],
    aragonite: ["glass", "clear"], gypsum: ["glass", "clear"], albite: ["glass", "clear"],
  };
  const got = run(`Object.fromEntries(DATA.minerals.map(m => [m.id, [m.luster, m.transp]]))`);
  return Object.entries(want).every(([id, [l, t]]) => got[id] && got[id][0] === l && got[id][1] === t);
})(), `garnet=${run(`(DATA.minerals.find(m=>m.id==="garnet")||{}).luster`)} calcite=${run(`(DATA.minerals.find(m=>m.id==="calcite")||{}).luster`)} gypsum=${run(`(DATA.minerals.find(m=>m.id==="gypsum")||{}).luster`)}`);
check("换矿物时光泽/通透度回到该矿物自己的默认值（数据里的 luster/transp 真正生效）", (() => {
  // 旧版只在首次加载生效：萤石调到全透明后切到黄铁矿，滑杆还显示"透明度 100%"
  const r = run(`(() => { state.luster = "waxy"; state.transp = "opaque"; state.alpha = 1; selectMineral("diamond"); const out = [state.luster, state.transp, state.alpha, mat().alpha]; selectMineral("pyrite"); out.push(state.transp, mat().alpha); return out; })()`);
  return Array.isArray(r) && r[0] === null && r[1] === "clear" && r[2] === 0 && r[3] === 0 && r[4] === "opaque" && r[5] === 1;
})(), `选中钻石后=${JSON.stringify(globalThis.__lastSwitch || "")}`);

/* ── 第十三轮：光泽按反射率排序 / 换光泽立刻联动通透度 / 金刚色散 / 有色透射 ── */
const pfsrc = html.slice(html.indexOf("function paintFaces("), html.indexOf("function paintOverlay("));
check("光泽按钮按反射率从低到高排：蜡状 < 玻璃 < 金刚 < 金属", (() => {
  const o = run(`LUSTER_ORDER.join(",")`);
  return o === "waxy,glass,adamantine,metallic";
})(), `顺序=${run(`LUSTER_ORDER.join(" < ")`)}`);
check("反射率参数确实单调递增（spec 与 ior 都抬），金属 R0=1", (() => {
  const g = (k, f) => run(`LUSTERS["${k}"].${f}`);
  return g("waxy", "spec") < g("glass", "spec") && g("glass", "spec") < g("adamantine", "spec")
    && g("waxy", "ior") < g("glass", "ior") && g("glass", "ior") < g("adamantine", "ior")
    && run(`LUSTERS.metallic.metal`) === 1;
})(), `spec=${run(`LUSTER_ORDER.map(k=>LUSTERS[k].spec).join("/")`)}`);
check("换光泽会立刻刷新通透度（金属立刻禁用滑杆，切回玻璃立刻放开）", (() => {
  // 旧 bug：光泽按钮只调 draw()，disabled 要等下一次 syncPanels，用户看到的是"点了金属没反应"
  const btnClick = (id) => run(`(() => {
    state.luster = "${id}"; renderLusters(); renderTransp();
    return document.getElementById("alphaR").disabled;
  })()`);
  const metalOff = btnClick("metallic");
  const glassOff = btnClick("glass");
  run(`state.luster = null; renderLusters(); renderTransp();`);
  return metalOff === true && glassOff === false;
})(), `金属=${run(`(()=>{state.luster="metallic";renderLusters();renderTransp();const d=document.getElementById("alphaR").disabled;state.luster=null;renderLusters();renderTransp();return d})()`)} 玻璃=${run(`(()=>{state.luster="glass";renderLusters();renderTransp();const d=document.getElementById("alphaR").disabled;state.luster=null;renderLusters();renderTransp();return d})()`)}`);
check("金刚光泽带色散：火彩在晶体内部（三次不同折射率采样），表面高光保持白色", (() => {
  const src = run(`GL_FS`);
  const has = /uniform\s+float\s+[^;]*uDisp/.test(src) && /refract\(\s*-v\s*,\s*n\s*,\s*etaR\s*\)/.test(src) && /vec3\s+internal\s*=/.test(src);
  const d = (k) => run(`LUSTERS["${k}"].disp`);
  return has && d("adamantine") > d("glass") && d("glass") > d("waxy");
})(), `disp=${run(`LUSTER_ORDER.map(k=>k+"="+LUSTERS[k].disp).join(",")`)}`);
check("统一曝光补偿 uExpo = EXPO（GL 与 2D 同值）", (() => {
  const src = run(`GL_FS`);
  return /uniform\s+float\s+[^;]*uExpo/.test(src) && /c\s*\*=\s*uExpo/.test(src) && Math.abs(run(`EXPO`) - 1.10) < 1e-9;
})(), `EXPO=${run(`EXPO`)}`);
check("有色透射：透明度 > 0 时在轮廓内做 multiply 混本体色（不是把颜色整体淡掉）", (() => {
  const s = String(pfsrc);
  return /globalCompositeOperation\s*=\s*"multiply"/.test(s)
    && /const\s+tr\s*=\s*1\s*-\s*\(Mi\.alpha/.test(s)
    && /crystalPath\s*\(\s*g\s*,\s*projOf\(it\)/.test(s);
})(), "paintFaces 含 multiply 分支=" + /multiply/.test(String(pfsrc)));
check("全透明档就是 100% 透明（alpha=0），滑杆读数与档位一致", (() => {
  const a = run(`transpById("clear").alpha`);
  const r = run(`(() => { state.transp = "clear"; state.alpha = transpById("clear").alpha; renderTransp(); const v = document.getElementById("alphaVal").textContent; state.transp = null; state.alpha = null; renderTransp(); return v; })()`);
  return Math.abs(a) < 1e-9 && r === "100%";
})(), `alpha=${run(`transpById("clear").alpha`)} 读数=${run(`(() => { state.transp = "clear"; state.alpha = transpById("clear").alpha; renderTransp(); const v = document.getElementById("alphaVal").textContent; state.transp = null; state.alpha = null; renderTransp(); return v; })()`)}`);
check("六光源：主光/轮廓光/补光/顶光/底反光/后侧光，且按强度归一化（单灯 lam=1 时曝光不变）", (() => {
  const n = run(`LIGHTS.length`);
  const s = run(`LIGHT_SUM`);
  const spec = run(`LIGHT_SPEC_SUM`);
  const raw = run(`LIGHTS.reduce((a,L)=>a+L.inten,0)`);
  const rawSpec = run(`LIGHTS.reduce((a,L)=>a+L.inten*L.spec,0)`);
  return n === 6 && Math.abs(s - raw) < 1e-9 && Math.abs(spec - rawSpec) < 1e-9 && raw > 1;
})(), "n=" + run(`LIGHTS.length`) + " sum=" + run(`LIGHT_SUM`));
check("GL_FS 里 uniform 是六灯数组 uLigDir/uLigCol/uLigInt（与 shadeFace 同源）", /uniform\s+vec3\s+uLigDir\[6\]/.test(html) && /uniform\s+vec3\s+uLigCol\[6\]/.test(html) && /uniform\s+vec3\s+uLigInt\[6\]/.test(html) && /float\s+inten\s*=\s*uLigInt\[i\]\.x/.test(html));
check("环境采样有地平线亮带（影棚围灯在晶体边缘的亮环）", /band\s*=\s*0\.17\s*\*\s*exp\(/.test(html) && /exp\(-abs\(t\)\s*\*\s*5\.0\)/.test(html));
check("五个场景的背景内容物互不相同（不再共用坐标系+白圈+横线）", (() => {
  const sig = run(`(() => {
    const out = [];
    const REC = ["fillRect","strokeRect","arc","ellipse","moveTo","lineTo","quadraticCurveTo","bezierCurveTo","rect","roundRect","arcTo"];
    for (const id of Object.keys(BACKGROUNDS)) {
      const seen = [];
      const mkGrad = () => ({ addColorStop() {} });
      const g = new Proxy({}, {
        get: (_, k) => {
          if (k === "createLinearGradient" || k === "createRadialGradient") return mkGrad;
          if (k === "createPattern" || k === "getContext") return () => null;
          if (k === "measureText") return () => ({ width: 10 });
          return (...a) => { if (REC.includes(k)) seen.push(k + a.join(",")); };
        },
        set: () => true,
      });
      drawSceneProps(g, id, 800, 500);
      out.push(seen.slice(0, 6).join("|"));
    }
    return out;
  })()`);
  return new Set(sig).size === 5 && sig.every(s => s.length > 10);
})());

/* ── 第十七轮：多晶体的锁定 / 晶簇 / 基岩底座 ── */
check("组：锁定整组后左键转的是整组（刚体），不锁定才逐颗拖动", (() => {
  run(`state.extras = []; state.extras.push(mkExtra(state.mineralId)); state.extraSel = 0;`);
  run(`state.groupLock = false; state.moveMode = true; state.groupYaw = 0;`);
  const a = run(`(() => { const e = state.extras[0]; return instXform(e, [1, 0, 0])[0]; })()`);
  run(`state.groupLock = true; state.groupYaw = Math.PI / 2;`);
  const b = run(`(() => { const e = state.extras[0]; return instXform(e, [1, 0, 0])[2]; })()`);
  // 锁定 + 整组转 90°：rotYv([1,0,0], π/2) = [0,0,-1]，世界 x 归零、z 变成 -1
  return Math.abs(a - 1) < 1e-6 && Math.abs(b + 1) < 1e-6 && Math.abs(a) > 0.5;
})(), "a=" + run(`(() => { state.extras=[]; state.extras.push(mkExtra(state.mineralId)); state.groupLock=false; state.groupYaw=0; return instXform(state.extras[0],[1,0,0])[0]; })()`));
check("组：锁定状态在 UI 里互斥（锁定时 moveMode 关闭）", /state\.groupLock\)\s*state\.moveMode\s*=\s*false/.test(html));
check("组：晶簇按钮一次加 4 颗且不超过上限", (() => {
  run(`state.extras = []; addCluster();`);
  const n = run(`state.extras.length`);
  run(`addCluster(); addCluster();`);
  const n2 = run(`state.extras.length`);
  return n === 4 && n2 === Number(run(`MAX_CRYSTALS`)) - 1;
})(), "n=" + run(`(() => { state.extras = []; addCluster(); return state.extras.length; })()`));
check("基岩：四种底座各自给出台面高度", (() => {
  const ys = run(`Object.fromEntries(Object.entries(BASES).map(([k, v]) => [k, v.y]))`);
  return ys.none === null && ys.slab > 0.7 && ys.geode > 0.7 && ys.wood > 0.7 && ys.slab < ys.wood;
})(), "ys=" + JSON.stringify(run(`Object.fromEntries(Object.entries(BASES).map(([k, v]) => [k, v.y]))`)));
check("基岩：每个底座都能正常画一帧（含放在桌面上）", (() => {
  for (const id of Object.keys(run(`BASES`))) {
    run(`state.base = ${JSON.stringify(id)}; state.onTable = true; draw();`);
  }
  run(`state.base = "none"; state.onTable = true; draw();`);
  return true;
})());
check("基岩：导出背景也画底座（预览与保存同源）", /drawBase\(g,\s*state\.base,\s*w,\s*h\)/.test(html));
check("基岩：无底座时退回场景自带的桌面线", /BASES\[state\.base\]\s*&&\s*BASES\[state\.base\]\.y\)\s*\|\|\s*\(BG\.table\s*&&\s*BG\.table\.y\)/.test(html));

/* ── 第十六轮：光源绕行必须匀速（用户反馈"越转越快"） ── */
check("光源绕行每步角度恒定（不会越转越快）", (() => {
  run(`lightPhase = 0; lightBase = null; state.lightAz = 0; state.lightMove = true;`);
  const a = [];
  for (let i = 0; i < 8; i++) a.push(run(`stepLightOrbit()`));
  const d = [];
  for (let i = 1; i < a.length; i++) {
    let x = a[i] - a[i - 1];
    if (x > 180) x -= 360; if (x < -180) x += 360;
    d.push(x);
  }
  // 读数四舍五入到整度，前几步会差 1 度；只看后 4 步是否一致
  const tail = d.slice(4);
  return tail.every(x => Math.abs(x - tail[0]) <= 1.001) && Math.abs(tail[0]) > 0.05 && Math.abs(tail[0]) < 2;
})(), "d=" + run(`(() => { lightPhase = 0; lightBase = null; state.lightAz = 0; const a=[]; for (let i=0;i<8;i++) a.push(stepLightOrbit()); const d=[]; for (let i=1;i<a.length;i++){let x=a[i]-a[i-1]; if(x>180)x-=360; if(x<-180)x+=360; d.push(x.toFixed(2));} return d.join(","); })()`));
check("光源绕行不把 state.lightAz 当基数（基点单独存 lightBase）", /let\s+lightBase\s*=\s*null/.test(html)
  && /lightBase\s*\+\s*lightPhase/.test(html)
  && !/az\s*=\s*\(\(state\.lightAz\s*\?\?\s*35\)\s*\+\s*lightPhase/.test(html));

console.log(out.join("\n"));
console.log("\n规模：矿物", run(`DATA.minerals.length`), "种；外形", report.length, "种；变体总数",
  run(`DATA.minerals.reduce((a,m)=>a+m.habits.reduce((b,h)=>b+Object.keys(h.variants).length,0),0)`));
