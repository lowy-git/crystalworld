// 矿物数据（原型阶段）：晶系 → 矿物 → 外形 → 单形
// 约定：
//   forms[].hkl      3 指数（六方/三方系内部用 3 指数，显示用 idx 字段的 4 指数）
//   forms[].k        该单形到晶体中心的距离倍率，1 = 唐奈-哈克近似
//   twin             双晶：mode 'mirror'（双晶面反射）或 'axis'（二次轴旋转 180°）
//   confidence       晶胞参数置信度：high / medium / low（M4b 要逐条对来源复核）
//   source           参数出处；标"待核"的进 pending 清单，不进正式版

export const SYSTEMS = [
  { id: "cubic",      zh: "等轴", en: "Isometric",   note: "a = b = c，α = β = γ = 90°" },
  { id: "tetragonal", zh: "四方", en: "Tetragonal",  note: "a = b ≠ c，α = β = γ = 90°" },
  { id: "hexagonal",  zh: "六方", en: "Hexagonal",   note: "a = b ≠ c，α = β = 90°，γ = 120°" },
  { id: "trigonal",   zh: "三方", en: "Trigonal",    note: "六方轴另取，或 a = b = c，α = β = γ ≠ 90°" },
  { id: "orthorhombic", zh: "斜方", en: "Orthorhombic", note: "a ≠ b ≠ c，α = β = γ = 90°" },
  { id: "monoclinic", zh: "单斜", en: "Monoclinic",  note: "a ≠ b ≠ c，α = γ = 90°，β ≠ 90°" },
  { id: "triclinic",  zh: "三斜", en: "Triclinic",   note: "a ≠ b ≠ c，α ≠ β ≠ γ ≠ 90°" },
];

export const MINERALS = [
  {
    id: "fluorite",
  luster: "glass",
    zh: "萤石", en: "Fluorite", formula: "CaF₂",
    system: "cubic", pointGroup: "m-3m",
    confidence: "high", source: "a = 5.4626 Å（Webmineral / Dana）",
    cell: { a: 5.4626, b: 5.4626, c: 5.4626, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = c = 5.4626 Å，α = β = γ = 90°",
    colors: [
      { zh: "无色", en: "Colorless", hex: "#dfe8ee" },
      { zh: "绿色", en: "Green",     hex: "#4fae7a" },
      { zh: "紫色", en: "Purple",    hex: "#8a63b8" },
      { zh: "蓝色", en: "Blue",      hex: "#4a7fc1" },
    ],
    intro: {
      zh: "等轴晶系最典型的矿物，立方体、八面体与两者的聚形都常见；{111} 贯穿双晶是「尖晶石律」的标准案例。",
      en: "The textbook cubic mineral: cube, octahedron and their combination all occur; the {111} penetration twin is the type example of the spinel law.",
    },
    habits: [
      { id: "cube", zh: "立方体", en: "Cube", forms: [{ hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" }] },
      { id: "octahedron", zh: "八面体", en: "Octahedron", forms: [{ hkl: [1, 1, 1], k: 1, idx: "{111}", zh: "八面体", en: "Octahedron" }] },
      {
        id: "cuboctahedron", zh: "立方-八面体聚形", en: "Cube + octahedron",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" },
          { hkl: [1, 1, 1], k: 1.45, idx: "{111}", zh: "八面体", en: "Octahedron" },
        ],
      },
      {
        id: "spinel-twin", zh: "尖晶石律双晶", en: "Spinel-law twin",
        note: "双晶面 {111}：两个体以该面互为镜像（尖晶石律）",
        twin: { mode: "contact", plane: [1, 1, 1], angle: 109.471 },
        forms: [{ hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" }],
      },
    ],
  },
  {
    id: "garnet",
  luster: "adamantine",
    zh: "石榴石", en: "Garnet", formula: "Fe₃Al₂(SiO₄)₃",
    system: "cubic", pointGroup: "m-3m",
    confidence: "high", source: "铁铝榴石 a = 11.526 Å（Dana）",
    cell: { a: 11.526, b: 11.526, c: 11.526, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = c = 11.526 Å（铁铝榴石），α = β = γ = 90°",
    colors: [
      { zh: "深红", en: "Deep red", hex: "#8e2b33" },
      { zh: "橙红", en: "Orange",  hex: "#b5651d" },
    ],
    intro: {
      zh: "与萤石同晶系、不同单形：菱形十二面体 {110} 与四角三八面体 {211} 是它的招牌，二者常组成聚形。",
      en: "Same system as fluorite, different forms: the dodecahedron {110} and the trapezohedron {211} are its signatures, often combined.",
    },
    habits: [
      { id: "dodecahedron", zh: "菱形十二面体", en: "Dodecahedron", forms: [{ hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "菱形十二面体", en: "Dodecahedron" }] },
      { id: "trapezohedron", zh: "四角三八面体", en: "Trapezohedron", forms: [{ hkl: [2, 1, 1], k: 1, idx: "{211}", zh: "四角三八面体", en: "Trapezohedron" }] },
      {
        id: "combined", zh: "两者聚形", en: "Dodecahedron + trapezohedron",
        forms: [
          { hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "菱形十二面体", en: "Dodecahedron" },
          { hkl: [2, 1, 1], k: 1.7, idx: "{211}", zh: "四角三八面体", en: "Trapezohedron" },
        ],
      },
    ],
  },
  {
    id: "scheelite",
  luster: "adamantine",
    zh: "白钨矿", en: "Scheelite", formula: "CaWO₄",
    system: "tetragonal", pointGroup: "4/m",
    confidence: "high", source: "a = 5.2429、c = 11.3736 Å（Dana）",
    cell: { a: 5.2429, b: 5.2429, c: 11.3736, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = 5.2429 Å，c = 11.3736 Å，α = β = γ = 90°",
    colors: [
      { zh: "白", en: "White", hex: "#ece7da" },
      { zh: "橙黄", en: "Orange", hex: "#e0a23c" },
    ],
    intro: {
      zh: "四方双锥 {101} 一个单形就自成闭合晶形——反例教学：单形不必是开形。",
      en: "The tetragonal bipyramid {101} closes on its own: proof that a single form need not be open.",
    },
    habits: [
      { id: "bipyramid", zh: "四方双锥", en: "Tetragonal bipyramid", forms: [{ hkl: [1, 0, 1], k: 1, idx: "{101}", zh: "四方双锥", en: "Bipyramid" }] },
    ],
  },
  {
    id: "beryl",
  luster: "glass",
    zh: "绿柱石", en: "Beryl", formula: "Be₃Al₂Si₆O₁₈",
    system: "hexagonal", pointGroup: "6/mmm",
    confidence: "high", source: "a = 9.215、c = 9.192 Å（Dana）",
    cell: { a: 9.215, b: 9.215, c: 9.192, alpha: 90, beta: 90, gamma: 120 },
    cellText: "a = b = 9.215 Å，c = 9.192 Å，γ = 120°",
    colors: [
      { zh: "海蓝", en: "Aquamarine", hex: "#7fb6c9" },
      { zh: "祖母绿", en: "Emerald",  hex: "#2f8f6a" },
      { zh: "粉红", en: "Morganite", hex: "#d9a0b4" },
    ],
    intro: {
      zh: "六方柱 {10-10} 加底面 {0001}：柱是开形，必须靠底面才闭合成晶体——「开形必须组合」的活教材。",
      en: "Hexagonal prism {10-10} plus basal pinacoid {0001}: the prism is open and only closes with the pinacoid — the classic lesson that open forms must be combined.",
    },
    habits: [
      {
        id: "prismatic", zh: "柱状", en: "Prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [0, 0, 1], k: 1, idx: "{0001}", zh: "底面", en: "Basal pinacoid" },
        ],
      },
    ],
  },
  {
    id: "quartz",
  luster: "glass",
    zh: "石英", en: "Quartz", formula: "SiO₂",
    system: "trigonal", pointGroup: "32",
    confidence: "high", source: "a = 4.9134、c = 5.4052 Å（Dana）",
    cell: { a: 4.9134, b: 4.9134, c: 5.4052, alpha: 90, beta: 90, gamma: 120 },
    cellText: "a = b = 4.9134 Å，c = 5.4052 Å，γ = 120°",
    colors: [
      { zh: "无色", en: "Rock crystal", hex: "#e6eef6" },
      { zh: "紫水晶", en: "Amethyst", hex: "#8b5cb0" },
      { zh: "黄水晶", en: "Citrine", hex: "#d9a441" },
      { zh: "烟晶", en: "Smoky", hex: "#6b5a52" },
    ],
    intro: {
      zh: "点群 32 没有对称中心也没有镜面，所以 r {10-11} 与 z {01-11} 是两个不同单形，在晶体上下交替出现。日本律双晶的两个 c 轴夹角 84°33′。",
      en: "Point group 32 has neither a centre nor a mirror plane, so r {10-11} and z {01-11} are two distinct forms alternating along c. Japan-law twins meet at 84°33′ between the c axes.",
    },
    habits: [
      {
        id: "prismatic-long", zh: "长柱状", en: "Long prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 0.40, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.95, idx: "{10-11}", zh: "菱面体 r", en: "Rhombohedron r" },
          { hkl: [0, 1, 1], k: 0.95, idx: "{01-11}", zh: "菱面体 z", en: "Rhombohedron z" },
        ],
      },
      {
        id: "prismatic", zh: "标准柱状", en: "Prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 0.60, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.95, idx: "{10-11}", zh: "菱面体 r", en: "Rhombohedron r" },
          { hkl: [0, 1, 1], k: 0.95, idx: "{01-11}", zh: "菱面体 z", en: "Rhombohedron z" },
        ],
      },
      {
        id: "prismatic-short", zh: "短柱状", en: "Short prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 0.78, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.95, idx: "{10-11}", zh: "菱面体 r", en: "Rhombohedron r" },
          { hkl: [0, 1, 1], k: 0.95, idx: "{01-11}", zh: "菱面体 z", en: "Rhombohedron z" },
        ],
      },
      {
        id: "japan-twin", zh: "日本律双晶", en: "Japan twin",
        note: "双晶面 {11-22}；两晶体 c 轴夹角 84°33′（计算 84.54°）",
        twin: { mode: "contact", plane: [1, 1, -2, 2], angle: 84.543 },
        forms: [
          { hkl: [1, 0, 0], k: 0.30, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.95, idx: "{10-11}", zh: "菱面体 r", en: "Rhombohedron r" },
          { hkl: [0, 1, 1], k: 0.95, idx: "{01-11}", zh: "菱面体 z", en: "Rhombohedron z" },
          { hkl: [1, 1, 2], k: 0.99, idx: "{11-22}", zh: "s 面（双晶面）", en: "s face (composition plane)" },
        ],
      },
    ],
  },
  {
    id: "calcite",
  luster: "adamantine",
    zh: "方解石", en: "Calcite", formula: "CaCO₃",
    system: "trigonal", pointGroup: "-3m",
    confidence: "high", source: "a = 4.990、c = 17.061 Å（Dana）；{10-14} 面角 74°55′",
    cell: { a: 4.990, b: 4.990, c: 17.061, alpha: 90, beta: 90, gamma: 120 },
    cellText: "a = b = 4.990 Å，c = 17.061 Å，γ = 120°",
    colors: [
      { zh: "无色", en: "Iceland spar", hex: "#e8e6dd" },
      { zh: "蜜黄", en: "Honey", hex: "#d8b872" },
      { zh: "玫瑰", en: "Rose", hex: "#d59a9a" },
    ],
    intro: {
      zh: "菱面体 {10-14} 的三组解理面互成 74°55′，是整个结晶学最常用的面角锚点；偏三角面体 {21-31} 就是「犬牙石」。",
      en: "The rhombohedron {10-14} cleaves at 74°55′ — the most-quoted interfacial angle in crystallography; the scalenohedron {21-31} is the \"dog-tooth spar\".",
    },
    habits: [
      {
        id: "rhombohedron", zh: "菱面体", en: "Rhombohedron",
        forms: [{ hkl: [1, 0, 4], k: 1, idx: "{10-14}", zh: "菱面体", en: "Rhombohedron" }],
      },
      {
        id: "scalenohedron", zh: "犬牙石（偏三角面体 + 菱面体）", en: "Dog-tooth spar",
        note: "单形 {21-31} 在方解石的晶胞里长宽比 10:1，真实犬牙石还得靠 {10-14} 菱面体把两端截平",
        forms: [
          { hkl: [2, 1, 1], k: 1.4, idx: "{21-31}", zh: "偏三角面体", en: "Scalenohedron" },
          { hkl: [1, 0, 4], k: 1.2, idx: "{10-14}", zh: "菱面体", en: "Rhombohedron" },
        ],
      },
    ],
  },
  {
    id: "aragonite",
  luster: "glass",
    zh: "文石", en: "Aragonite", formula: "CaCO₃",
    system: "orthorhombic", pointGroup: "mmm",
    confidence: "high", source: "a = 4.9614、b = 7.9671、c = 5.7404 Å（Dana）",
    cell: { a: 4.9614, b: 7.9671, c: 5.7404, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = 4.9614 Å，b = 7.9671 Å，c = 5.7404 Å，α = β = γ = 90°",
    colors: [
      { zh: "白", en: "White", hex: "#e9e4d6" },
      { zh: "淡紫", en: "Lilac", hex: "#a98bb5" },
    ],
    intro: {
      zh: "与方解石同成分、不同晶系（斜方 vs 三方）——「同质多象」的标准例子，常成假六方三连晶。",
      en: "Same chemistry as calcite but orthorhombic rather than trigonal — the classic polymorph pair, often forming pseudo-hexagonal trillings.",
    },
    habits: [
      {
        id: "prismatic", zh: "柱状", en: "Prismatic",
        forms: [
          { hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "斜方柱", en: "Prism" },
          { hkl: [0, 1, 0], k: 0.65, idx: "{010}", zh: "板面", en: "Pinacoid b" },
          { hkl: [0, 0, 1], k: 0.8, idx: "{001}", zh: "底面", en: "Pinacoid c" },
        ],
      },
    ],
  },
  {
    id: "gypsum",
  luster: "waxy",
    zh: "石膏", en: "Gypsum", formula: "CaSO₄·2H₂O",
    system: "monoclinic", pointGroup: "2/m",
    confidence: "medium", source: "a = 5.6794、b = 15.1774、c = 6.2867 Å，β = 118.43°（待复核）",
    cell: { a: 5.6794, b: 15.1774, c: 6.2867, alpha: 90, beta: 118.43, gamma: 90 },
    cellText: "a = 5.6794 Å，b = 15.1774 Å，c = 6.2867 Å，β = 118.43°",
    colors: [
      { zh: "白", en: "White", hex: "#eae7e0" },
      { zh: "蜜色", en: "Honey", hex: "#d9c49a" },
    ],
    intro: {
      zh: "板状晶体以 {010} 为最大面；单斜晶系的 b 轴是唯一轴，c 轴斜插——这正是「单斜」三个字的来历。",
      en: "Tabular plates dominated by {010}; the unique b axis plus the inclined c is exactly what \"monoclinic\" means.",
    },
    habits: [
      {
        id: "tabular", zh: "板状", en: "Tabular",
        forms: [
          { hkl: [0, 1, 0], k: 0.7, idx: "{010}", zh: "板面", en: "Pinacoid b" },
          { hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "斜方柱", en: "Prism" },
          { hkl: [0, 0, 1], k: 1, idx: "{001}", zh: "底面", en: "Pinacoid c" },
        ],
      },
    ],
  },
  {
    id: "albite",
  luster: "glass",
    zh: "斜长石（钠长石）", en: "Albite", formula: "NaAlSi₃O₈",
    system: "triclinic", pointGroup: "-1",
    confidence: "medium", source: "a = 8.137、b = 12.785、c = 7.174 Å，α = 94.26°、β = 116.60°、γ = 87.67°（待复核）",
    cell: { a: 8.137, b: 12.785, c: 7.174, alpha: 94.26, beta: 116.60, gamma: 87.67 },
    cellText: "a = 8.137，b = 12.785，c = 7.174 Å；α = 94.26°，β = 116.60°，γ = 87.67°",
    colors: [
      { zh: "白", en: "White", hex: "#ece9e4" },
      { zh: "淡蓝", en: "Pale blue", hex: "#b9cfe0" },
    ],
    intro: {
      zh: "三斜晶系：三个轴都不垂直、三个角都不等，只有对称中心。板状外形配钠长石律聚片双晶最有名。",
      en: "Triclinic: no two axes perpendicular, no two angles equal, only a centre of symmetry. Tabular crystals plus albite-law polysynthetic twinning.",
    },
    habits: [
      {
        id: "tabular", zh: "板状", en: "Tabular",
        forms: [
          { hkl: [0, 1, 0], k: 0.75, idx: "{010}", zh: "板面", en: "Pinacoid b" },
          { hkl: [0, 0, 1], k: 0.9, idx: "{001}", zh: "底面", en: "Pinacoid c" },
          { hkl: [1, 1, 0], k: 0.8, idx: "{110}", zh: "斜柱面", en: "Prism" },
          { hkl: [1, -1, 0], k: 0.8, idx: "{1-10}", zh: "斜柱面", en: "Prism" },
        ],
      },
    ],
  },
];
