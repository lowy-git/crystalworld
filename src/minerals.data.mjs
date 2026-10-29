// 矿物数据（原型阶段）：晶系 → 矿物 → 外形 → 单形
// 约定：
//   forms[].hkl      3 指数（六方/三方系内部用 3 指数，显示用 idx 字段的 4 指数）
//   forms[].k        该单形到晶体中心的距离倍率，1 = 唐奈-哈克近似
//   twin             双晶：mode 'mirror'（双晶面反射）或 'axis'（二次轴旋转 180°）
//   confidence       晶胞参数置信度：high / medium / low（M4b 要逐条对来源复核）
//   source           参数出处；标"待核"的进 pending 清单，不进正式版
//   luster / transp  默认光泽与通透度（2026-10-24 按 Mindat / Handbook of Mineralogy 的
//                    标准光泽描述校准；透明度口径两条：无色/浅色品种按最高品级取全透明，
//                    彩色品种（紫水晶、萤石）按常见品级取半透明——彩色的全透明太罕见）

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
  defColor: "#4fae7a",
  luster: "glass", transp: "transl", inclusion: "pyrite",   // 玻璃光泽；彩色萤石常见半透明（全透明的是无色光学级）
    zh: "萤石", en: "Fluorite", formula: "CaF₂",
    system: "cubic", pointGroup: "m-3m",
    confidence: "high", source: "a = 5.4626 Å（Webmineral / Dana）",
    cell: { a: 5.4626, b: 5.4626, c: 5.4626, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = c = 5.4626 Å，α = β = γ = 90°",
    colors: [
      { zh: "无色", en: "Colorless", hex: "#dfe8ee" },
      { zh: "绿色", en: "Green",     hex: "#4fae7a" },
      { zh: "紫色", en: "Purple",    hex: "#8a63b8" },
      { zh: "莓红", en: "Red",       hex: "#b04a6e" },
      { zh: "蓝色", en: "Blue",      hex: "#4a7fc1" },
      { zh: "蓝紫", en: "Blue-lilac", hex: "#6b7ed0" },
    ],
    intro: {
      zh: "等轴晶系最典型的矿物，立方体、八面体与两者的聚形都常见；尖晶石律是两个立方体沿 [111] 互相穿插，是「贯穿双晶」的标准案例。",
      en: "The textbook cubic mineral: cube, octahedron and their combination all occur; the spinel law is two cubes interpenetrating along [111], the type example of a penetration twin.",
    },
    about: {
      zh: "自然界颜色最杂的矿物之一，紫、绿、蓝、黄都能长，而且常常一块晶体上带好几种色带。加热到一定温度会发出荧光——荧光灯名字的由来就是它。质软、性脆，是最适合当「结晶学教材」的矿物。",
      where: "英国 Cumberland（老牌紫萤石）、中国湖南桃林与内蒙古；墨西哥、美国伊利诺伊都有名坑。",
      hard: "4（小刀一划就白，软到不能做首饰）",
      spot: "立方体 + 八面体 + 四组完全解理；紫绿相间的色带最招人喜欢。",
    },
    habits: [
      { id: "cube", zh: "立方体", en: "Cube", forms: [{ hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" }] },
      { id: "octahedron", zh: "八面体", en: "Octahedron", forms: [{ hkl: [1, 1, 1], k: 1, idx: "{111}", zh: "八面体", en: "Octahedron" }] },
      {
        id: "cuboctahedron", zh: "立方-八面体聚形", en: "Cube + octahedron",
        forms: [   // SMORF Fluorite_001：{100}/{111} 等面距（k 都 = 0.127，即 {111} k=1.0）
          { hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" },
          { hkl: [1, 1, 1], k: 1.0, idx: "{111}", zh: "八面体", en: "Octahedron" },
        ],
      },
      {
        id: "spinel-twin", zh: "尖晶石律双晶", en: "Spinel-law twin",
        note: "尖晶石律：两个立方体沿共有的 [111] 体对角线互相穿插。Handbook of Mineralogy：「Twinning: common on {111}, interpenetrant, flattened」。双晶操作是绕 [111] 的 180° 二次轴；因立方体自身绕该轴有 120° 对称，等价于两个体相对转动 60°。萤石是 centrosymmetric（m-3m），所以「{111} 镜面」与「[111] 二次轴」两种说法是同一个双晶（σ·C₂ = 反演，反演是 m-3m 的对称操作）。两个体的 <100> 棱方向夹角 arccos(−1/3) = 109°28′",
        twin: { mode: "axis", axis: [1, 1, 1], angle: 109.471 },
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" },
        ],
      },
    ],
    localities: [
      {   // 阿尔卑斯红萤石（用户三段参考视频：alandhart / Ziga Mineral / Mont Blanc cristallier）
        id: "binntal",
        zh: "瑞士 · 宾河谷（阿尔卑斯）", en: "Binn Valley, Valais, Swiss Alps",
        style: "octahedral", styleZh: "八面体阶梯",
        habitId: "octahedron",
        setup: {
          base: "matrix", bg: "black", zoom: 0.52, sizeCM: 4,
          rig: "showcase", ambK: 0.75, transp: "clear",
          color: "#b04a6e",                        // 莓紫红：阳光下内部透红的高彩
          matrixCol: [0.73, 0.72, 0.69],           // 白云石-石英围岩
          extras: [                                 // 白水晶柱伴生（阿尔卑斯型脉）
            { mineralId: "quartz", habitId: "prismatic", pos: [0.66, 0, -0.30], scale: 0.5, yaw: 18 },
            { mineralId: "quartz", habitId: "prismatic", pos: [-0.58, 0, 0.34], scale: 0.38, yaw: -25 },
          ],
        },
        text: {
          zh: "阿尔卑斯山脊裂隙型矿床的镇山之宝：深莓红色的八面体萤石，晶棱常呈阶梯状生长，透明度极高——阳光下整颗晶体像一块红玻璃。与白色白云石、清澈水晶同生，采自海拔两千多米的岩缝，由被称为 cristallier 的阿尔卑斯采晶人徒手凿出。宾河谷是世界公认的红萤石圣地。",
          en: "The treasure of Alpine cleft deposits: deep raspberry-red octahedral fluorite with stepped edges and superb transparency, found with white dolomite and rock crystal at over 2,000 m, collected by hand by the Alpine cristalliers. The Binn Valley is the world's shrine of red fluorite.",
        },
        features: ["莓红色", "八面体阶梯", "白云石-水晶共生", "阿尔卑斯裂隙型"],
        source: "Mindat Binntal；用户参考视频（alandhart / Ziga Mineral / Mont Blanc cristallier）",
        confidence: "medium", checked: "2026-10",
      },
      {   // 新疆蓝紫阶梯萤石（liminerals 视频：11×8.6×6.7cm，stepped fluorite + dolomite）
        id: "xinjiang",
        zh: "中国 · 新疆", en: "Xinjiang, China",
        style: "stepped", styleZh: "阶梯聚形",
        habitId: "cuboctahedron",                  // 立方+八面聚形=阶梯观感
        setup: {
          base: "matrix", bg: "black", zoom: 0.5, sizeCM: 11,   // 实测 11×8.6×6.7cm
          rig: "showcase", ambK: 0.7, transp: "transl",
          color: "#6b7ed0",                        // 蓝中带紫
          matrixCol: [0.75, 0.74, 0.71],           // 白云石围岩
          extras: [                                 // 白云石（白色菱面体，以方解石菱面体近似）
            { mineralId: "calcite", habitId: "rhombohedron", pos: [0.72, 0, 0.26], scale: 0.42, yaw: 30 },
            { mineralId: "calcite", habitId: "rhombohedron", pos: [-0.60, 0, -0.34], scale: 0.34, yaw: -18 },
          ],
        },
        text: {
          zh: "新疆出产的蓝紫色萤石：立方体与八面体反复交替生长，形成层层收拢的阶梯状轮廓，颜色在蓝与紫之间流动。白色白云石菱面体贴着晶面生长，对比强烈。标本实测约 11×8.6×6.7 cm——矿区近年产量大，好标本仍一票难求。",
          en: "Blue-lilac fluorite from Xinjiang: cube and octahedron alternating growth builds stepped, terraced outlines, with white dolomite rhombohedra clinging to the faces. The referenced specimen measures about 11 × 8.6 × 6.7 cm.",
        },
        features: ["蓝紫色", "阶梯状聚形", "白云石共生", "11cm 级标本"],
        source: "liminerals 视频（尺寸 11×8.6×6.7cm）+ Mindat Xinjiang",
        confidence: "medium", checked: "2026-10",
      },
    ],
  },
  {
    id: "pyrite",
  defColor: "#c9a227",
  luster: "metallic", transp: "opaque", inclusion: "none",   // 金属光泽、天然不透明（唯一例外，不用改）
    zh: "黄铁矿", en: "Pyrite", formula: "FeS₂",
    system: "cubic", pointGroup: "m-3",
    confidence: "high", source: "a = 5.417 Å（Dana）",
    cell: { a: 5.417, b: 5.417, c: 5.417, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = c = 5.417 Å，α = β = γ = 90°",
    colors: [
      { zh: "亮铜黄", en: "Brass yellow", hex: "#c9a227" },
      { zh: "虹彩", en: "Iridescent", hex: "#8e9aa8" },
    ],
    about: {
      zh: "「愚人金」的正主就是它——比黄金更亮、更黄，但硬且脆，小刀一划就碎，比重也没金子大。最常见的面貌是带条纹的立方体，或者立方体被五角十二面体的面切掉棱之后形成的「立方体+五角十二面体」聚形。",
      where: "西班牙 Navajún（完美立方体）、秘鲁 Huanzala；国内广西、湖南也有。热液矿床和煤层里最常见。",
      hard: "6–6.5（比小刀硬，比石英软）",
      spot: "颜色铜黄到亮白、表面常有平行条纹、条痕是绿黑色——划一下瓷板看条痕，一眼分开真假。",
    },
    intro: {
      zh: "等轴晶系里最典型的金属光泽矿物：{210} 五角十二面体是它的招牌单形，立方体面上常见的平行条纹是双晶或生长台阶留下的。",
      en: "The classic metallic-looking cubic mineral: {210} pyritohedron is its signature form, and the parallel striations on cube faces are twinning or growth steps.",
    },
    habits: [
      { id: "cube", zh: "带条纹的立方体", en: "Striated cube", forms: [{ hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" }] },
      {
        id: "pyritohedron", zh: "五角十二面体", en: "Pyritohedron",
        forms: [{ hkl: [2, 1, 0], k: 1, idx: "{210}", zh: "五角十二面体", en: "Pyritohedron" }],
      },
      {   // SMORF Pyrite_008：{210}:{110}:{111} 面距比 1.372:1:1.18（k=d_SMORF/d_hkl）
        id: "smorf-combo", zh: "三形聚晶（SMORF）", en: "Triform (SMORF)",
        note: "五角十二面体为主，八面体与立方体截棱——Goldschmidt 图谱 Pyrite_008 的实测比例。",
        forms: [
          { hkl: [2, 1, 0], k: 0.566, idx: "{210}", zh: "五角十二面体", en: "Pyritohedron" },
          { hkl: [1, 1, 1], k: 0.377, idx: "{111}", zh: "八面体", en: "Octahedron" },
          { hkl: [1, 1, 0], k: 0.261, idx: "{110}", zh: "菱形十二面体", en: "Dodecahedron" },
        ],
      },
      {
        id: "combo", zh: "立方体 + 五角十二面体", en: "Cube + pyritohedron",
        note: "真实黄铁矿最常见的面貌：立方体的 12 条棱被 {210} 五角十二面体的面一道道切掉。注意 k 要大于 2——{210} 的唐奈-哈克距离只有 {100} 的 1/√5，k=1 时五角十二面体整个缩在立方体里面，一个面都看不见。",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "立方体", en: "Cube" },
          { hkl: [2, 1, 0], k: 2.4, idx: "{210}", zh: "五角十二面体", en: "Pyritohedron" },
        ],
      },
      {
        id: "iron-cross", zh: "铁十字双晶", en: "Iron-cross twin",
        note: "两个五角十二面体以 {110} 为双晶面互相穿插，从某个方向看正好是个十字——德国 Harz 山脉的老矿工把它当护身符。",
        twin: { mode: "axis", axis: [1, 1, 0], angle: 180 },
        forms: [
          { hkl: [2, 1, 0], k: 1, idx: "{210}", zh: "五角十二面体", en: "Pyritohedron" },
        ],
      },
    ],
    localities: [
      {
        id: "navajun",
        zh: "西班牙 · 拉里奥哈 Navajún", en: "Navajún, La Rioja, Spain",
        style: "penetration", styleZh: "穿插连晶",
        habitId: "cube",
        setup: {
          base: "matrix", bg: "black", zoom: 0.5, sizeCM: 15,     // matrix：灰绿色泥灰岩基岩，晶体底埋入丘中
          rig: "showcase", ambK: 0.55,                // 展示灯：暗环境、暖强主光——镜面金属不被亮背景洗白
          extras: [
            // 构图对照实拍标本（fineartminerals 视频）：主晶体旁一左一右两颗
            // 中立方体、前下方一小簇——各晶面朝向不同，底部埋进泥灰岩里
            { mineralId: "pyrite", habitId: "cube", pos: [1.02, 0, 0.40], scale: 0.70, yaw: 26 },
            { mineralId: "pyrite", habitId: "cube", pos: [-1.00, 0, 0.22], scale: 0.58, yaw: -44 },
            { mineralId: "pyrite", habitId: "cube", pos: [0.12, 0, -0.82], scale: 0.40, yaw: 9 },
          ],
        },
        text: {
          zh: "下白垩统泥灰岩里的世界级黄铁矿产地：立方体棱线锋利、晶面如镜，边长 3–5 cm 常见，Mindat 记录最大超过 15 cm。晶体以各种朝向从灰绿色泥灰岩基岩里长出，底部约三分之一嵌在基质里，常两三颗互相穿插连生——镜面里映出的天空近中性白，暗面却是深青铜色。矿山（Ampliación a Victoria）至今仍专为采集标本而季节性开采。",
          en: "A world-class pyrite source in Lower Cretaceous marls: mirror-faced, razor-edged cubes, commonly 3-5 cm on a side and up to 15+ cm. Cubes grow out of the gray-green marl matrix at all orientations, their lower third embedded; two or three often interpenetrate. Mirror faces reflect the sky near-white while shaded faces read deep bronze. The Ampliación a Victoria mine is still worked seasonally solely for specimens.",
        },
        features: ["镜面立方体", "穿插连晶", "灰绿泥灰岩基岩"],
        source: "Mindat loc-7116 / locentry-656314；McDougall Minerals（Navajún 专文）",
        confidence: "high", checked: "2026-10",
      },
      {
        id: "huanzala",
        zh: "秘鲁 · 安卡什 Huanzala", en: "Huanzala Mine, Huallanca, Áncash, Peru",
        style: "cluster", styleZh: "晶簇",
        habitId: "pyritohedron",
        setup: {
          // 黑底标本照 + 浅灰白围岩（Huanzala 标本多产自石英-白云石脉）：展示灯的
          // 暗面在黑底上自然吸收——亮纸面下金属背光面会黑成"一圈黑矿"（用户反馈）
          base: "matrix", bg: "black", zoom: 0.52, sizeCM: 6,
          rig: "showcase", ambK: 0.55, matrixCol: [0.72, 0.70, 0.66],
          extras: [
            { mineralId: "pyrite", habitId: "combo", pos: [0.82, 0, -0.25], scale: 0.75, yaw: 28 },
            { mineralId: "pyrite", habitId: "cube", pos: [-0.72, 0, 0.28], scale: 0.5, yaw: -74 },
          ],
        },
        text: {
          zh: "高海拔多金属铅锌矿山，却是秘鲁出产精品矿物标本最多的矿山之一（Rock Currier 语）。黄铁矿晶面锋利、光泽极亮，五角十二面体发育，常见立方体 + 五角十二面体聚形；在石英脉里与萤石、白云石、黄铜矿共生。标本多为几厘米的迷你精品，与其说「大」不如说「精」。",
          en: "A high-altitude Pb-Zn mine that is among Peru's top producers of fine specimens (Rock Currier). Pyrite is razor sharp and highly lustrous, pyritohedra well developed, often as cube + pyritohedron combinations in quartz veins with fluorite, dolomite and chalcopyrite. Miniature-sized but exquisite.",
        },
        features: ["五角十二面体", "锋利光亮", "多金属共生"],
        source: "Mindat loc-5783 / locentry-31548",
        confidence: "high", checked: "2026-10",
      },
    ],
  },
  {
    id: "diamond",
  defColor: "#eef4f8",
  luster: "adamantine", transp: "clear", inclusion: "none",  // 金刚光泽（adamantine 的命名来源）；宝石级透明
    zh: "钻石（金刚石）", en: "Diamond", formula: "C",
    system: "cubic", pointGroup: "m-3m",
    confidence: "high", source: "a = 3.5670 Å（Dana）",
    cell: { a: 3.5670, b: 3.5670, c: 3.5670, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = c = 3.5670 Å，α = β = γ = 90°",
    colors: [
      { zh: "无色", en: "Colorless", hex: "#eef4f8" },
      { zh: "淡黄", en: "Pale yellow", hex: "#e6d9a8" },
      { zh: "蓝", en: "Blue", hex: "#9fc0d8" },
    ],
    about: {
      zh: "地球上最硬的天然矿物。它硬到只能被自己划伤，所以琢磨全靠钻石粉。天然钻石大多数长得并不「规则」——八面体最常见，但往往曲面化、圆嘟嘟的。",
      where: "南非金伯利（金伯利岩筒）、俄罗斯雅库特、澳大利亚阿盖尔（粉钻）；现在市面上一大半是人工合成的。",
      hard: "10（莫氏硬度老大，定义它就是 10）",
      spot: "金刚光泽——一种「亮到像自己发光」的光；硬度 10 + 划得动刚玉（红蓝宝）就能定。",
    },
    intro: {
      zh: "等轴晶系里折射率最高的矿物（n = 2.42），金刚光泽的名字就是从它来的。{111} 八面体是最常见的天然晶形，{110} 菱形十二面体与曲面八面体也常见。",
      en: "The cubic mineral with the highest refractive index (n = 2.42) — the very mineral \"adamantine lustre\" is named after. {111} octahedra dominate; {110} dodecahedra and curved octahedra also occur.",
    },
    habits: [
      {
        id: "octahedron", zh: "八面体", en: "Octahedron",
        forms: [{ hkl: [1, 1, 1], k: 1, idx: "{111}", zh: "八面体", en: "Octahedron" }],
      },
      {
        id: "dodecahedron", zh: "菱形十二面体", en: "Rhombic dodecahedron",
        forms: [{ hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "菱形十二面体", en: "Rhombic dodecahedron" }],
      },
      {   // SMORF Diamond_107：{111}+{100} 等面距（经典钻石晶体轮廓）
        id: "smorf-cubeoct", zh: "八面体 + 立方体（SMORF）", en: "Octahedron + cube (SMORF)",
        forms: [
          { hkl: [1, 1, 1], k: 1, idx: "{111}", zh: "八面体", en: "Octahedron" },
          { hkl: [1, 0, 0], k: 0.578, idx: "{100}", zh: "立方体", en: "Cube" },
        ],
      },
      {
        id: "combo", zh: "八面体 + 菱形十二面体", en: "Octahedron + dodecahedron",
        forms: [
          { hkl: [1, 1, 1], k: 1, idx: "{111}", zh: "八面体", en: "Octahedron" },
          { hkl: [1, 1, 0], k: 1.35, idx: "{110}", zh: "菱形十二面体", en: "Rhombic dodecahedron" },
        ],
      },
    ],
  },
  {
    id: "garnet",
  defColor: "#8e2b33",
  luster: "glass", transp: "clear", inclusion: "rutile",     // 铁铝榴石：玻璃光泽（Mindat: Vitreous，有的文献记树脂光泽），不是金刚
    zh: "石榴石", en: "Garnet", formula: "Fe₃Al₂(SiO₄)₃",
    system: "cubic", pointGroup: "m-3m",
    confidence: "high", source: "铁铝榴石 a = 11.526 Å（Dana）",
    cell: { a: 11.526, b: 11.526, c: 11.526, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = c = 11.526 Å（铁铝榴石），α = β = γ = 90°",
    colors: [
      { zh: "深红", en: "Deep red", hex: "#8e2b33" },
      { zh: "橙红", en: "Orange",  hex: "#b5651d" },
    ],
    about: {
      zh: "一个大家族的统称（铁铝榴石、镁铝榴石、钙铝榴石……），化学式像，晶系却几乎都落在等轴。颗粒小的时候像一捧红砂，大的能长成拳头大的菱形十二面体。",
      where: "巴西、印度、斯里兰卡（冲积砂矿）；国内河北、内蒙也有。",
      hard: "6.5–7.5（比小刀硬，做磨料用）",
      spot: "等轴晶系 + 菱形十二面体/四角三八面体，颜色红到绿到黑都有，玻璃到金刚光泽。",
    },
    intro: {
      zh: "与萤石同晶系、不同单形：菱形十二面体 {110} 与四角三八面体 {211} 是它的招牌，二者常组成聚形。",
      en: "Same system as fluorite, different forms: the dodecahedron {110} and the trapezohedron {211} are its signatures, often combined.",
    },
    habits: [
      { id: "dodecahedron", zh: "菱形十二面体", en: "Dodecahedron", forms: [{ hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "菱形十二面体", en: "Dodecahedron" }] },
      { id: "trapezohedron", zh: "四角三八面体", en: "Trapezohedron", forms: [{ hkl: [2, 1, 1], k: 1, idx: "{211}", zh: "四角三八面体", en: "Trapezohedron" }] },
      {   // SMORF Garnet_02：{110} 主 + {100} 微截 + {211}/{111} —— 面距比 1:1.01:2.39:1.56
        id: "smorf-modified", zh: "四形聚晶（SMORF）", en: "Modified (SMORF)",
        forms: [
          { hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "菱形十二面体", en: "Dodecahedron" },
          { hkl: [1, 0, 0], k: 0.716, idx: "{100}", zh: "立方体", en: "Cube" },
          { hkl: [2, 1, 1], k: 1.9, idx: "{211}", zh: "四角三八面体", en: "Trapezohedron" },
          { hkl: [1, 1, 1], k: 1.55, idx: "{111}", zh: "八面体", en: "Octahedron" },
        ],
      },
      {   // SMORF Garnet_01（{110}）：铁铝榴石的经典菱形十二面体
        id: "almandine", zh: "铁铝榴石型", en: "Almandine-type",
        forms: [{ hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "菱形十二面体", en: "Dodecahedron" }],
      },
      {   // SMORF Garnet_02（{211}）：翠榴石（钙铁榴石变种）的招牌四角三八面体
        id: "demantoid", zh: "翠榴石型", en: "Demantoid-type",
        forms: [
          { hkl: [2, 1, 1], k: 1, idx: "{211}", zh: "四角三八面体", en: "Trapezohedron" },
          { hkl: [1, 1, 0], k: 0.72, idx: "{110}", zh: "菱形十二面体（微截）", en: "Dodecahedron" },
        ],
      },
      {   // SMORF Garnet_03（{110}+{211}）：锰铝榴石常见的两者聚形
        id: "spessartine", zh: "锰铝榴石型", en: "Spessartine-type",
        forms: [
          { hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "菱形十二面体", en: "Dodecahedron" },
          { hkl: [2, 1, 1], k: 1.7, idx: "{211}", zh: "四角三八面体", en: "Trapezohedron" },
          { hkl: [1, 0, 0], k: 0.85, idx: "{100}", zh: "立方体", en: "Cube" },
        ],
      },
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
  defColor: "#e0a23c",
  luster: "adamantine", transp: "clear", inclusion: "fracture",  // 金刚光泽-玻璃光泽（Mindat: Sub-adamantine, Vitreous）
    zh: "白钨矿", en: "Scheelite", formula: "CaWO₄",
    system: "tetragonal", pointGroup: "4/m",
    confidence: "high", source: "a = 5.2429、c = 11.3736 Å（Dana）",
    cell: { a: 5.2429, b: 5.2429, c: 11.3736, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = b = 5.2429 Å，c = 11.3736 Å，α = β = γ = 90°",
    colors: [
      { zh: "白", en: "White", hex: "#ece7da" },
      { zh: "橙黄", en: "Orange", hex: "#e0a23c" },
    ],
    about: {
      zh: "紫外灯下一片明亮的蓝白色荧光——这是它在野外最好用的身份证。本身是重要的钨矿石，一块带完整四方双锥的标本比矿石值钱得多。",
      where: "中国江西（南岭一带，世界级钨矿区）、四川；国外奥地利、美国加州。",
      hard: "4.5–5（小刀能划动，但晶体往往一按就裂）",
      spot: "四方双锥、金刚光泽、荧光；掂着有点沉（含钨）。",
    },
    intro: {
      zh: "四方双锥 {101} 一个单形就自成闭合晶形——反例教学：单形不必是开形。",
      en: "The tetragonal bipyramid {101} closes on its own: proof that a single form need not be open.",
    },
    habits: [
      { id: "bipyramid", zh: "四方双锥", en: "Tetragonal bipyramid", forms: [{ hkl: [1, 0, 1], k: 1, idx: "{101}", zh: "四方双锥", en: "Bipyramid" }] },
      {   // 经典白钨矿聚形：{101} 双锥为主，{112} 偏方面截棱（SMORF 白钨矿晶体多为 {101}+{112} 组合）
        id: "modified", zh: "双锥 + 截棱", en: "Bipyramid modified",
        forms: [
          { hkl: [1, 0, 1], k: 1, idx: "{101}", zh: "四方双锥", en: "Bipyramid" },
          { hkl: [1, 1, 2], k: 1.5, idx: "{112}", zh: "斜方偏方面（截棱）", en: "Trapezohedron" },
        ],
      },
    ],
  },
  {
    id: "beryl",
  defColor: "#3fc0ba",
  luster: "glass", transp: "clear", inclusion: "fluid",      // 玻璃光泽；宝石级（海蓝宝/祖母绿）透明
    zh: "绿柱石", en: "Beryl", formula: "Be₃Al₂Si₆O₁₈",
    system: "hexagonal", pointGroup: "6/mmm",
    confidence: "high", source: "a = 9.215、c = 9.192 Å（Dana）",
    cell: { a: 9.215, b: 9.215, c: 9.192, alpha: 90, beta: 90, gamma: 120 },
    cellText: "a = b = 9.215 Å，c = 9.192 Å，γ = 120°",
    colors: [
      { zh: "蓝绿（克什米尔）", en: "Kashmir teal", hex: "#3fc0ba" },
      { zh: "海蓝", en: "Aquamarine", hex: "#7fb6c9" },
      { zh: "祖母绿", en: "Emerald",  hex: "#2f8f6a" },
      { zh: "粉红", en: "Morganite", hex: "#d9a0b4" },
    ],
    intro: {
      zh: "六方柱 {10-10} 加底面 {0001}：柱是开形，必须靠底面才闭合成晶体——「开形必须组合」的活教材。",
      en: "Hexagonal prism {10-10} plus basal pinacoid {0001}: the prism is open and only closes with the pinacoid — the classic lesson that open forms must be combined.",
    },
    about: {
      zh: "绿柱石这一大家族的名字来自颜色：海蓝宝是它，祖母绿也是它。六方柱长得又长又直，端头一个平底——这就是「开形必须靠别的面来合」的最好例子。",
      where: "哥伦比亚 Muzo（祖母绿）、巴西、巴基斯坦；国内新疆阿勒泰出过很大的海蓝宝。",
      hard: "7.5–8（比石英硬一点，但性脆，别磕）",
      spot: "六方柱 + 玻璃光泽 + 断口上的树脂感；祖母绿的绿是认不出来的那种绿。",
    },
    habits: [
      {
        id: "prismatic-long", zh: "长柱状", en: "Long prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 0.45, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [0, 0, 1], k: 1, idx: "{0001}", zh: "底面", en: "Basal pinacoid" },
        ],
      },
      {
        id: "prismatic", zh: "柱状", en: "Prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [0, 0, 1], k: 1, idx: "{0001}", zh: "底面", en: "Basal pinacoid" },
        ],
      },
      {   // SMORF Beryl_012（Santa Fé de Bogota——祖母绿产地）：a+m 双柱 + 终端
        id: "emerald", zh: "祖母绿型", en: "Emerald-type",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "六方柱 m", en: "Prism" },
          { hkl: [1, 1, 0], k: 2.0, idx: "{11-20}", zh: "六方柱 a", en: "Prism" },
          { hkl: [0, 0, 1], k: 0.6, idx: "{0001}", zh: "底面", en: "Pinacoid" },
          { hkl: [1, 0, 1], k: 1.35, idx: "{10-11}", zh: "六方双锥", en: "Pyramid" },
        ],
      },
      {   // SMORF Beryl_023（Ural）：m 柱为主 + 平坦底面——海蓝宝石常见习性
        id: "aquamarine", zh: "海蓝宝石型", en: "Aquamarine-type",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "六方柱 m", en: "Prism" },
          { hkl: [1, 1, 0], k: 1.2, idx: "{11-20}", zh: "六方柱 a", en: "Prism" },
          { hkl: [0, 0, 1], k: 1.0, idx: "{0001}", zh: "底面", en: "Pinacoid" },
        ],
      },
      {   // SMORF Beryl_MH217（Pingwu, China——摩根石产地）：Tabular {001} 板状
        id: "morganite", zh: "摩根石型（板状）", en: "Morganite-type (tabular)",
        forms: [
          { hkl: [0, 0, 1], k: 1, idx: "{0001}", zh: "底面（主板面）", en: "Pinacoid" },
          { hkl: [1, 0, 0], k: 0.5, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 1, 0], k: 0.6, idx: "{11-20}", zh: "六方柱", en: "Prism" },
        ],
      },
    ],
    localities: [
      {
        id: "kashmir",
        zh: "巴基斯坦 · 斯卡都（克什米尔）", en: "Skardu, Gilgit-Baltistan, Pakistan",
        title: "克什米尔之王",                     // 标本名（标本页与分享卡的主角）
        style: "parallel", styleZh: "直立并生",
        habitId: "prismatic-long",
        setup: {
          base: "matrix", bg: "black", zoom: 0.46, sizeCM: 20,      // 黑底标本照：白色石英长石基质 + 蓝绿柱体
          restPose: false,                              // 直立并生（实拍里柱体全部站姿）
          transp: "transl",                             // 半透明：蓝绿体色在黑场上"发光"
          ambK: 1.7,                                    // 背光辉光：环境抬亮，柱体像从内部透出蓝绿
          matrixCol: [0.66, 0.64, 0.58],                // 白色石英-长石基质（黑场上读作"被照亮的白"）
          extras: [                                     // 环主晶体一圈（主晶体半宽~0.67，柱体要越过它才探头）
            { mineralId: "beryl", habitId: "prismatic-long", pos: [1.18, 0, 0.68], scale: 0.66, yaw: 8 },
            { mineralId: "beryl", habitId: "prismatic-long", pos: [0.85, 0, -1.05], scale: 0.56, yaw: -12 },
            { mineralId: "beryl", habitId: "prismatic-long", pos: [-0.82, 0, -0.98], scale: 0.50, yaw: 4 },
            { mineralId: "beryl", habitId: "prismatic-long", pos: [-1.05, 0, 0.72], scale: 0.44, yaw: 18 },
          ],
        },
        text: {
          zh: "传奇海蓝宝石标本「克什米尔之王」：多根长柱状海蓝宝石直立并生，从白色石英-长石基质上拔地而起。颜色是罕见的饱和蓝绿——比常见海蓝宝的淡蓝深得多、又比祖母绿偏蓝；晶体全透明、{0001} 平坦端面带生长台阶，转动时像一小片蓝绿色的水晶森林。产地为巴基斯坦斯卡都地区（克什米尔）的花岗岩晶洞。",
          en: "The legendary “King of Kashmir” aquamarine: a cluster of long prismatic aquamarines standing upright from a white quartz-feldspar matrix. The color is a rare saturated blue-green, far deeper than common aquamarine yet bluer than emerald. Fully transparent crystals with flat {0001} terminations, from granite pockets in Skardu, Kashmir, Pakistan.",
        },
        features: ["长柱状并生", "饱和蓝绿", "白色石英长石基质"],
        source: "fine_mineral_show 实拍（King of Kashmir）；Mindat Shigar District",
        confidence: "medium", checked: "2026-10",
      },
    ],
  },
  {
    id: "quartz",
  defColor: "#8b5cb0",
  luster: "glass", transp: "transl", inclusion: "rutile",    // 玻璃光泽；紫水晶常见半透明（无色水晶才全透明）
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
      { zh: "芒果", en: "Mango", hex: "#f0b445", mango: true },
    ],
    intro: {
      zh: "点群 32 没有对称中心也没有镜面，所以 r {10-11} 与 z {01-11} 是两个不同单形，在晶体上下交替出现。日本律双晶的两个 c 轴夹角 84°33′。",
      en: "Point group 32 has neither a centre nor a mirror plane, so r {10-11} and z {01-11} are two distinct forms alternating along c. Japan-law twins meet at 84°33′ between the c axes.",
    },
    about: {
      zh: "地壳里第二多的矿物，长成一根六方柱、两头收尖——也就是「水晶」这个名字的来源。紫水晶的紫色是铁杂质加天然辐照做出来的，加热到两三百度就褪色成黄水晶。",
      where: "巴西米纳斯吉拉斯（紫水晶大晶体）、马达加斯加；国内江苏东海、云南、新疆都有水晶矿。",
      hard: "7（莫氏硬度的标尺就是它，小刀划不动）",
      spot: "六方柱 + 玻璃光泽 + 贝壳状断口；紫水晶颜色不均匀，常见深浅相间的色带。",
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
        note: "双晶面（结合面）{11-22}；两个体 c 轴夹角 84°33′＝84.55°（按 α-石英 a=4.9134、c=5.4052 Å 反算得 84.52°，文献实测 84°33′）。注意：绕 c 轴的双晶是道芬律 <0001>，不是日本律。s 面必须真的长出来（r/z 收到 k=0.80 给它让位），否则两块只在一个棱上相接。自然界里日本律几乎总是长在基质上，下方的晶头不发育——所以这里把底部切平（cutBottom），只露出 V 形的两支晶头",
        twin: { mode: "contact", plane: [1, 1, -2, 2], angle: 84.55, cutBottom: 0.20 },
        forms: [
          { hkl: [1, 0, 0], k: 0.30, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.80, idx: "{10-11}", zh: "菱面体 r", en: "Rhombohedron r" },
          { hkl: [0, 1, 1], k: 0.80, idx: "{01-11}", zh: "菱面体 z", en: "Rhombohedron z" },
          { hkl: [1, 1, 2], k: 1.5, idx: "{11-22}", zh: "s 面（双晶面）", en: "s face (composition plane)" },
        ],
      },
      {
        id: "dauphine-twin", zh: "道芬律双晶", en: "Dauphiné twin",
        note: "成因是「转变双晶」：α-石英在 573 °C 转变为 β-石英时，相邻两域各自选择了不同的 Si-O 四面体旋向，冷却后就被冻结下来。双晶操作是绕 c 轴 [0001] 转 180°（32 点群里没有平行 c 的二次轴，所以是双晶）。关键：两个体的外部晶形完全同名同向、c 轴平行，从外面一点也看不出来——必须把晶体切开做刻蚀，或在正交偏光下看，才能看到两套消光位不同的畴。所以这里不摆两个晶体，只在内部画一条域界（⊥c 的基面），可以关掉它体会「肉眼真的看不出来」",
        twin: { mode: "domain", plane: [0, 0, 1], angle: 0, domainAt: 0 },
        forms: [
          { hkl: [1, 0, 0], k: 0.60, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.95, idx: "{10-11}", zh: "菱面体 r", en: "Rhombohedron r" },
          { hkl: [0, 1, 1], k: 0.95, idx: "{01-11}", zh: "菱面体 z", en: "Rhombohedron z" },
        ],
      },
      {
        id: "brazil-twin", zh: "巴西律双晶", en: "Brazil twin",
        note: "双晶面 {11-20}（含 c 轴的棱柱面），操作是镜面反射。α-石英是 32 点群（无镜面、无对称中心），所以左右形（旋光方向相反的两种晶体）可以互生成为双晶——一个域是右旋、相邻域是左旋。两个体 c 轴严格平行，外部晶形也一模一样，同样看不出来；域界大致平行 {11-20}，但真实形态很不规则。左旋与右旋的旋光、压电效应互相抵消，所以含巴西双晶的石英不能做压电元件。这里同样只画域界",
        twin: { mode: "domain", plane: [1, 1, -2, 0], angle: 0, domainAt: 0 },
        forms: [
          { hkl: [1, 0, 0], k: 0.60, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.95, idx: "{10-11}", zh: "菱面体 r", en: "Rhombohedron r" },
          { hkl: [0, 1, 1], k: 0.95, idx: "{01-11}", zh: "菱面体 z", en: "Rhombohedron z" },
        ],
      },
    ],
    localities: [
      {
        id: "mango",
        zh: "哥伦比亚 · 芒果水晶", en: "Mango quartz, Colombia",
        style: "parallel", styleZh: "柱状并生",
        habitId: "prismatic-long",
        setup: {
          base: "matrix", bg: "black", zoom: 0.5, sizeCM: 14,
          rig: "showcase", ambK: 0.85, transp: "clear",
          color: "mango",
          matrixCol: [0.58, 0.55, 0.50],
          extras: [
            { mineralId: "quartz", habitId: "prismatic-long", pos: [0.78, 0, 0.22], scale: 0.62, yaw: 10 },
            { mineralId: "quartz", habitId: "prismatic-long", pos: [-0.66, 0, -0.30], scale: 0.5, yaw: -16 },
            { mineralId: "quartz", habitId: "prismatic", pos: [-0.42, 0, 0.55], scale: 0.36, yaw: 24 },
          ],
        },
        text: {
          zh: "哥伦比亚中部山区独有的品种：无色透明的水晶柱，顶端被金黄色浸染——像切开的芒果，果肉黄得最浓的地方在晶头。浸染由铁氧化物沿晶体生长方向富集在端部形成，颜色从柱底的清水色一路渐浓到顶端的芒果黄。晶型与普通水晶无异，全部价值都在这一抹黄上。",
          en: "A Colombian specialty: colourless rock crystal with golden-yellow staining concentrated at the terminations, like a sliced mango, deepest at the head. Iron oxides enrich toward the tips; the prism itself is ordinary quartz.",
        },
        features: ["晶头金黄浸染", "无色柱体渐变", "哥伦比亚独有"],
        source: "用户参考视频（Ziga Mineral: great Mango Quartz specimen）；Mindat Colombia",
        confidence: "medium", checked: "2026-10",
      },
      {
        id: "arkansas",
        zh: "美国 · 阿肯色水晶山区", en: "Crystal Mountains, Arkansas, USA",
        style: "parallel", styleZh: "平行连生",
        habitId: "prismatic-long",
        setup: {
          base: "none", bg: "black",
          extras: [
            { mineralId: "quartz", habitId: "prismatic-long", pos: [0.78, 0, 0.2], scale: 0.8, yaw: 14 },
            { mineralId: "quartz", habitId: "prismatic", pos: [-0.72, 0, -0.24], scale: 0.55, yaw: -22 },
          ],
        },
        text: {
          zh: "沃希托山的砂岩晶脉（当地人叫 Crystal Mountains）是美国最著名的水晶产地：晶洞里成簇的长柱状水晶棱刃平直、透明度高，常以平行连生出现，大簇可达数百公斤。十九世纪中叶起商业开采至今，也是全世界收藏者亲手挖晶的圣地（Mount Ida、Hot Springs 一带）。",
          en: "The quartz veins in the Ouachita sandstones (the \"Crystal Mountains\") are America's most famous quartz source: pockets yield clusters of long, straight, water-clear prisms, often in parallel growth; big clusters reach hundreds of pounds. Commercially mined since the mid-1800s and a mecca for dig-it-yourself collectors.",
        },
        features: ["长柱平行连生", "高透明", "砂岩晶洞"],
        source: "Mindat article 1327；USGS Bull. 973-E（Engel, 1952）",
        confidence: "high", checked: "2026-10",
      },
      {
        id: "tessin",
        zh: "瑞士 · 提契诺阿尔卑斯裂隙", en: "Alpine fissures, Tessin, Switzerland",
        style: "single", styleZh: "裂隙单晶",
        habitId: "prismatic-short",
        setup: {
          base: "none", bg: "black",
          extras: [
            { mineralId: "quartz", habitId: "prismatic-short", pos: [0.85, 0, -0.18], scale: 0.6, yaw: 100 },
          ],
        },
        text: {
          zh: "片岩里的阿尔卑斯型裂隙（几厘米宽的透镜状空腔）孕育了「提契诺习形」（Tessin habit）：柱体短粗、陡峭的菱面体 r/z 极度发育，晶体常横卧在晶洞壁上，绿泥石包裹让它带一层淡绿。Gries、Bedretto 谷是经典产地；这类裂隙也是「晶体为什么长在缝里」的教科书现场。",
          en: "Alpine-type fissures (lens-shaped cm-scale cavities) in schist host the \"Tessin habit\": stubby prisms with strongly developed steep rhombohedra, lying across the cavity walls, often tinged pale green by chlorite inclusions. Classic sites include the Gries and Bedretto valleys.",
        },
        features: ["短柱 Tessin 习形", "陡菱面体发育", "阿尔卑斯型裂隙"],
        source: "Mindat loc-342794（Corno Gries）；Mindat glossary: alpine-type fissure；quartzpage.de",
        confidence: "high", checked: "2026-10",
      },
    ],
  },
  {
    id: "calcite",
  defColor: "#e8e6dd",
  luster: "glass", transp: "clear", inclusion: "fluid",      // 玻璃光泽（Mindat: Vitreous，解理面珍珠光泽），冰洲石无色透明——之前误标金刚
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
      zh: "菱面体 {10-14} 的三组解理面互成 74°55′，是整个结晶学最常用的面角锚点；偏三角面体 {21-32} 就是「犬牙石」。",
      en: "The rhombohedron {10-14} cleaves at 74°55′ — the most-quoted interfacial angle in crystallography; the scalenohedron {21-31} is the \"dog-tooth spar\".",
    },
    about: {
      zh: "石灰岩和大理石的主角，也是「冰洲石」的学名——那种能把字切成两个影的透明晶体就是它。三组解理拼成标准菱面体，一敲就顺着解理碎成小块。",
      where: "冰岛 Helgustadir（冰洲石老产地）；国内贵州、广西、湖南的溶洞和石灰岩里遍地都是。",
      hard: "3（小刀一划一个白痕，是最软的常见矿物之一）",
      spot: "菱面体 + 三组解理 + 双折射（透过它看字有重影）；遇盐酸冒泡。",
    },
    habits: [
      {
        id: "rhombohedron", zh: "菱面体", en: "Rhombohedron",
        forms: [{ hkl: [1, 0, 4], k: 1, idx: "{10-14}", zh: "菱面体（解理菱面体）", en: "Rhombohedron" }],
      },
      {
        id: "dogtooth", zh: "犬牙石（偏三角面体）", en: "Dog-tooth spar",
        note: "SMORF Calcite_1719 对照（{2131} 老记号 → 现代 {21-32}，老晶胞 c 减半）：12 个偏三角面绕腰部，{10-14} 菱面体截出平头与尖角——经典犬牙石。",
        note: "SMORF Calcite_1719（{2131} modified）实测面族：柱面 + 偏三角面体 + 菱面体复合——老记号 {2131} 的真实形态。",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "三方柱 m", en: "Prism" },
          { hkl: [1, 1, 0], k: 2.38, idx: "{11-20}", zh: "三方柱 a", en: "Prism" },
          { hkl: [1, 0, 1], k: 0.75, idx: "{10-11}", zh: "三方双锥（斜面）", en: "Scalenohedron" },
          { hkl: [3, 0, 2], k: 1.75, idx: "{30-32}", zh: "偏三角面体", en: "Scalenohedron" },
        ],
      },
      {
        id: "nailhead", zh: "钉头石（板状）", en: "Nailhead spar",
        note: "SMORF Calcite_0010 对照（{021}+{101} 老记号 → {01-12}+{10-14}）：扁平菱面体沿底面拉宽，像一排钉子头。",
        note: "SMORF Calcite_0010（{021}+{101}）实测面族：扁平菱面体 {10-12} 为主。",
        forms: [
          { hkl: [1, 0, -2], k: 1, idx: "{10-12}", zh: "扁平菱面体", en: "Flat rhombohedron" },
          { hkl: [1, 0, 0], k: 0.93, idx: "{10-10}", zh: "三方柱", en: "Prism" },
          { hkl: [2, 0, 3], k: 1.87, idx: "{20-23}", zh: "偏三角面体（边缘）", en: "Scalenohedron" },
        ],
      },    ],
  },
  {
    id: "topaz",
  defColor: "#e0b169",
  luster: "glass", transp: "clear", inclusion: "fluid",
    zh: "黄玉（托帕石）", en: "Topaz", formula: "Al₂SiO₄(F,OH)₂",
    system: "orthorhombic", pointGroup: "mmm",
    confidence: "high", source: "a = 4.6495、b = 8.7968、c = 8.3925 Å（Dana）",
    cell: { a: 4.6495, b: 8.7968, c: 8.3925, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = 4.6495 Å，b = 8.7968 Å，c = 8.3925 Å，α = β = γ = 90°",
    colors: [
      { zh: "无色", en: "Colorless", hex: "#e9f0f3" },
      { zh: "蜜黄", en: "Imperial", hex: "#e0b169" },
      { zh: "蓝", en: "Swiss blue", hex: "#7fb6d8" },
    ],
    about: {
      zh: "斜方晶系最有名的代表：三根轴互相垂直但都不等长，所以晶体总是「瘦高条」而不是立方体。天然黄玉常常巨大——一块拳头大的完整晶体并不稀奇。市面上的蓝色托帕石几乎都是辐照改色过的。",
      where: "巴西 Minas Gerais（帝国托帕石的故乡）、巴基斯坦、俄罗斯乌拉尔、日本（三瓶山越後黃玉）。",
      hard: "8（能划伤石英，但怕磕碰——有一组完全解理，一摔就顺理解开）",
      spot: "玻璃光泽 + 柱状 + 一端常带斜面；蓝色太鲜艳反而要当心是处理过的。",
    },
    intro: {
      zh: "斜方晶系的招牌矿物：{110} 斜方柱配上 {101}、{011} 两组截切面，是标准的高温热液巨晶。注意它和「玉」没有半点关系。",
      en: "The flagship orthorhombic mineral: {110} prism with {101} and {011} truncations, a standard pegmatite giant. Nothing to do with jade.",
    },
    habits: [
      /* 晶型数据取自 SMORF（www.smorf.nl，Goldschmidt《晶体形态图谱》数字化库）：
         下载 Topaz_188/208/215.smorf.bin（BE float32 顶点流 + int32 三角扇索引，0xFFFF 分面），
         由三角扇还原每个面的法线与面距，法线 n ∝ (h/a, k/b, l/c) 匹配 hkl。
         关键换算：内核的 k 是"×该单形自身 d_hkl"的倍率，故 k = d_SMORF / d_hkl（各单形
         d_hkl 不同——{110}=4.09、{011}=6.46——直接把距离比当 k 会渲染成尖刺，已踩坑）。 */
      {
        id: "prismatic", zh: "柱状（Miask 型）", en: "Prismatic (Miask)",
        forms: [
          { hkl: [1, 1, 0], k: 1,    idx: "{110}", zh: "斜方柱", en: "Prism" },
          { hkl: [0, 1, 1], k: 0.73, idx: "{011}", zh: "斜方柱（终端楔面）", en: "Dome" },
          { hkl: [0, 2, 1], k: 1.22, idx: "{021}", zh: "斜方柱（端面）", en: "Dome" },
          { hkl: [1, 2, 1], k: 1.51, idx: "{121}", zh: "斜方双锥", en: "Bipyramid" },
        ],
      },
      {
        id: "tabular", zh: "桶状（Brazil 型）", en: "Tabular (Brazil)",
        forms: [
          { hkl: [1, 1, 0], k: 1,    idx: "{110}", zh: "斜方柱", en: "Prism" },
          { hkl: [0, 1, 1], k: 0.67, idx: "{011}", zh: "斜方柱（终端楔面）", en: "Dome" },
          { hkl: [0, 2, 1], k: 1.24, idx: "{021}", zh: "斜方柱（端面）", en: "Dome" },
          { hkl: [0, 2, 3], k: 1.44, idx: "{023}", zh: "斜方柱（底缘楔面）", en: "Dome" },
          { hkl: [1, 3, 2], k: 1.96, idx: "{132}", zh: "斜方双锥", en: "Bipyramid" },
        ],
      },
      {
        id: "dipyramidal", zh: "复锥柱状（Minas 型）", en: "Dipyramidal (Minas)",
        forms: [
          { hkl: [1, 1, 0], k: 1,    idx: "{110}", zh: "斜方柱", en: "Prism" },
          { hkl: [0, 1, 1], k: 0.62, idx: "{011}", zh: "斜方柱（终端楔面）", en: "Dome" },
          { hkl: [0, 2, 1], k: 1.33, idx: "{021}", zh: "斜方柱（端面）", en: "Dome" },
          { hkl: [0, 2, 3], k: 1.54, idx: "{023}", zh: "斜方柱（底缘楔面）", en: "Dome" },
          { hkl: [1, 3, 2], k: 2.11, idx: "{132}", zh: "斜方双锥", en: "Bipyramid" },
          { hkl: [1, 3, 0], k: 2.12, idx: "{130}", zh: "斜方柱（侧棱面）", en: "Prism" },
        ],
      },
    ],
  },
  {
    id: "aragonite",
  defColor: "#e9e4d6",
  luster: "glass", transp: "clear", inclusion: "fluid",      // 玻璃光泽；透明档按最高品级（宝石级文石透明，常见半透明）
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
    about: {
      zh: "方解石的「孪生兄弟」：化学成分一模一样，但原子排成了斜方晶系，于是长成针状、柱状的晶体，而且更喜欢成群扎堆、扭成假六方。热水泉口边那层白白的「钙华」多半是它。",
      where: "西班牙、意大利西西里（经典产地）；国内云南、西藏的温泉边和溶洞里常见。",
      hard: "3.5–4（比方解石略硬，一样怕酸）",
      spot: "针状/柱状集合体、常带蓝白色荧光；加热会变成方解石粉末。",
    },
    habits: [
      {
        id: "prismatic", zh: "柱状", en: "Prismatic",
        note: "真实文石是沿 c 延长的斜方柱：{110} 四条棱柱面占满，{010} 与 {011} 只做窄窄的截切，{001} 把两端收住。旧版把 {010}/{001} 的 k 收到 0.65/0.8，等于让两个板面狠狠切进来，结果压成一块板——那不是文石。",
        forms: [
          { hkl: [1, 1, 0], k: 1, idx: "{110}", zh: "斜方柱", en: "Prism" },
          { hkl: [0, 1, 0], k: 1.5, idx: "{010}", zh: "板面", en: "Pinacoid b" },
          { hkl: [0, 1, 1], k: 1.3, idx: "{011}", zh: "斜方柱", en: "Dome" },
          { hkl: [0, 0, 1], k: 2.0, idx: "{001}", zh: "底面", en: "Pinacoid c" },
        ],
      },
    ],
  },
  {
    id: "gypsum",
  defColor: "#eae7e0",
  luster: "glass", transp: "clear", inclusion: "none",       // 玻璃光泽、解理面珍珠光泽（透石膏 selenite 完全透明）——蜡状是雪花石膏那种块状的，不是晶体
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
    about: {
      zh: "透明的那种叫「透石膏」，能剥成薄片写字。沙漠里长的「沙漠玫瑰」是它——一群板状晶体围着一粒沙子抱成花的样子。单斜晶系的代表矿物。",
      where: "墨西哥 Naica（水晶洞里的巨晶）、美国新墨西哥（沙漠玫瑰）；国内湖北、山西的石膏矿。",
      hard: "2（指甲就能划动）",
      spot: "一组极完全解理（能撕成薄片）、玻璃光泽（解理面上泛珍珠光）、软到没朋友。",
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
  defColor: "#ece9e4",
  luster: "glass", transp: "clear", inclusion: "tourm",      // 玻璃光泽；清透板状晶体可达透明（常见半透明，按最高取）
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
    about: {
      zh: "长石家族里最常见的一员，也是三斜晶系的代表：三个夹角全都不是 90°，所以晶体长得「歪」。月光石那种柔和的蓝光就来自长石内部的细微片状结构。",
      where: "加拿大 Mont Saint-Hilaire（精品）、巴基斯坦；国内花岗岩里遍地都是。",
      hard: "6–6.5（小刀划不动，但明显软于石英）",
      spot: "板状 + 一组解理 + 玻璃光泽；把晶体泡在水里看反光，聚片双晶会显出平行的细纹。",
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
  {
    id: "rhodochrosite",
  defColor: "#e0899c",
  luster: "glass", transp: "transl", inclusion: "none",     // 玻璃光泽；完整晶体常半透明
    zh: "菱锰矿", en: "Rhodochrosite", formula: "MnCO₃",
    system: "trigonal", pointGroup: "-3m",
    confidence: "high", source: "a = 4.7774、c = 15.6694 Å（Dana）",
    cell: { a: 4.7774, b: 4.7774, c: 15.6694, alpha: 90, beta: 90, gamma: 120 },
    cellText: "a = 4.7774 Å，c = 15.6694 Å，α = β = 90°，γ = 120°（方解石族）",
    colors: [
      { zh: "粉红", en: "Rose", hex: "#e0899c" },
      { zh: "深红", en: "Deep red", hex: "#c05a6e" },
      { zh: "褐", en: "Brownish", hex: "#b08a72" },
    ],
    intro: {
      zh: "方解石族的锰成员：碳酸锰结晶成三方晶系，菱面体习性。阿根廷印卡废矿的层状红纹石切片最有名；完整粉红菱面体则以美国科罗拉多 Sweet Home 矿为至尊。",
      en: "The manganese member of the calcite group: MnCO₃ in the trigonal rhombohedral class. Banded Argentina material is famous, but pristine pink rhombohedra from Colorado's Sweet Home mine are the pinnacle.",
    },
    about: {
      zh: "「玫瑰」这个名字不是白叫的——好的菱锰矿粉红得像花瓣。质软（4）又怕酸，是收藏柜里的娇客。阿根廷的层状品种常切做成饰面。",
      where: "阿根廷 Capillitas（层状红纹石）、美国科罗拉多 Sweet Home Mine（世界最佳菱面体）、南非卡拉哈里锰田。",
      hard: "4（与萤石同档，怕磕碰也怕酸）",
      spot: "菱面体解理三组 + 粉红色 + 遇酸起泡（碳酸盐）。",
    },
    habits: [
      {
        id: "rhombohedron", zh: "菱面体", en: "Rhombohedron",
        forms: [{ hkl: [1, 0, -2], k: 1, idx: "{10-12}", zh: "菱面体", en: "Rhombohedron" }],
      },
      {
        id: "scalenohedron", zh: "偏三角面体", en: "Scalenohedron",
        forms: [
          { hkl: [2, 1, -4], k: 1, idx: "{21-34}", zh: "偏三角面体", en: "Scalenohedron" },
          { hkl: [1, 0, -1], k: 0.75, idx: "{10-11}", zh: "菱面体（端部截切）", en: "Rhombohedron" },
        ],
      },
    ],
  },
  {
    id: "tourmaline",
  defColor: "#2f9e77",
  luster: "glass", transp: "transl", inclusion: "none",     // 玻璃光泽；宝石级透明但多色带
    zh: "电气石", en: "Tourmaline", formula: "Na(Li,Al)₃Al₆(BO₃)₃Si₆O₁₈(OH)₄",
    system: "trigonal", pointGroup: "3m",
    confidence: "high", source: "a = 15.849、c = 7.103 Å（elbaite，Dana）",
    cell: { a: 15.849, b: 15.849, c: 7.103, alpha: 90, beta: 90, gamma: 120 },
    cellText: "a = 15.849 Å，c = 7.103 Å，α = β = 90°，γ = 120°（锂电气石）",
    colors: [
      { zh: "绿", en: "Green", hex: "#2f9e77" },
      { zh: "粉红", en: "Rubellite", hex: "#d4526e" },
      { zh: "蓝", en: "Indicolite", hex: "#3a6fb0" },
      { zh: "西瓜", en: "Watermelon", hex: "#d46a8a" },
    ],
    intro: {
      zh: "三方晶系 3m 点群的矿物代表：柱面纵纹、横截面球面三角形，加热或摩擦会带静电（「电气」之名由此而来）。锂电气石的色彩从绿到粉红到蓝，一块晶体上还能分段变色。",
      en: "The flagship 3m mineral: striated prisms with rounded-triangular cross-sections, pyroelectric and piezoelectric (hence the name). Elbaite runs from green to pink to blue, often zoned along the prism.",
    },
    about: {
      zh: "宝石界配色最全的矿物：绿电气石、红电气石（Rubellite）、蓝电气石（Indicolite）、西瓜电气石（外粉内绿）都是同一个矿物的不同成分环带。柱面纵纹是肉眼鉴定的关键。",
      where: "巴西 Minas Gerais、阿富汗 Nuristan、美国加州 Pala 与缅因州；国内新疆、云南也有。",
      hard: "7–7.5（可以做首饰）",
      spot: "柱面强纵纹 + 球面三角形横截面 + 二色性。",
    },
    habits: [
      {
        id: "prismatic", zh: "柱状（强纵纹）", en: "Prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "三方柱（主柱面）", en: "Prism" },
          { hkl: [1, 1, 0], k: 1.05, idx: "{11-20}", zh: "三方柱（棱柱面）", en: "Prism" },
          { hkl: [1, 0, 1], k: 1.45, idx: "{10-11}", zh: "三方双锥（终端）", en: "Pyramid" },
          { hkl: [0, 1, 1], k: 1.5, idx: "{01-11}", zh: "三方双锥（终端）", en: "Pyramid" },
          { hkl: [0, 0, 1], k: 0.55, idx: "{0001}", zh: "底面", en: "Pedion" },
        ],
      },
    ],
  },
  {
    id: "apophyllite",
  defColor: "#dcebe4",
  luster: "glass", transp: "clear", inclusion: "none",      // 玻璃光泽（珍珠光泽底面）；宝石级透明
    zh: "鱼眼石", en: "Apophyllite", formula: "KCa₄Si₈O₂₀(F,OH)·8H₂O",
    system: "tetragonal", pointGroup: "4/mmm",
    confidence: "high", source: "a = 8.988、c = 15.796 Å（Dana）",
    cell: { a: 8.988, b: 8.988, c: 15.796, alpha: 90, beta: 90, gamma: 90 },
    cellText: "a = 8.988 Å，c = 15.796 Å，α = β = γ = 90°",
    colors: [
      { zh: "无色", en: "Colorless", hex: "#dcebe4" },
      { zh: "绿", en: "Green", hex: "#8fce9e" },
      { zh: "白", en: "White", hex: "#eceae2" },
    ],
    intro: {
      zh: "四方晶系的沸石伴生矿物：{100} 方柱 + {001} 底面 + {111} 锥面，正方外形一眼可认。印度浦那玄武岩的晶洞产出世界最佳的鱼眼石——大、透、还带柔和的绿。",
      en: "The classic zeolite-companion tetragonal mineral: square {100} prism, {001} pinacoid and {111} pyramid. Pune, India produces the world's finest — big, clear, softly green.",
    },
    about: {
      zh: "名字来自希腊语「叶子剥落」——加热时会一片片剥开。含结构水，火烤会变浑。印度德干玄武岩的晶洞里，鱼眼石与沸石、葡萄石共生，是标本市场最常见的精品来源。",
      where: "印度浦那（Deccan 玄武岩晶洞，世界最佳）、巴西、墨西哥；国内也有产出。",
      hard: "4.5–5（质脆怕热）",
      spot: "正方形横截面 + 一组完全解理 + 玻璃光泽偏珍珠。",
    },
    habits: [
      {
        id: "tabular", zh: "方柱板状", en: "Tabular",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "四方柱", en: "Prism" },
          { hkl: [0, 0, 1], k: 0.55, idx: "{001}", zh: "底面", en: "Pinacoid" },
          { hkl: [1, 1, 1], k: 1.3, idx: "{111}", zh: "四方双锥", en: "Bipyramid" },
        ],
      },
      {
        id: "bipyramidal", zh: "锥柱状", en: "Bipyramidal",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{100}", zh: "四方柱", en: "Prism" },
          { hkl: [0, 0, 1], k: 1.1, idx: "{001}", zh: "底面", en: "Pinacoid" },
          { hkl: [1, 1, 1], k: 1.15, idx: "{111}", zh: "四方双锥", en: "Bipyramid" },
          { hkl: [1, 0, 2], k: 1.6, idx: "{102}", zh: "四方双锥（缓锥面）", en: "Bipyramid" },
        ],
      },
    ],
  },
  {
    id: "apatite",
  defColor: "#8fbf9f",
  luster: "glass", transp: "transl", inclusion: "none",     // 玻璃光泽；宝石级透明少见
    zh: "磷灰石", en: "Apatite", formula: "Ca₅(PO₄)₃F",
    system: "hexagonal", pointGroup: "6/m",
    confidence: "high", source: "a = 9.367、c = 6.884 Å（fluorapatite，Dana）",
    cell: { a: 9.367, b: 9.367, c: 6.884, alpha: 90, beta: 90, gamma: 120 },
    cellText: "a = 9.367 Å，c = 6.884 Å，α = β = 90°，γ = 120°（氟磷灰石）",
    colors: [
      { zh: "绿", en: "Green", hex: "#8fbf9f" },
      { zh: "蓝", en: "Blue", hex: "#7fa8c8" },
      { zh: "紫", en: "Purple", hex: "#a58cc0" },
    ],
    intro: {
      zh: "六方晶系 6/m 点群：六方柱 + 平坦底面 + 缓双锥，组合出来的晶体像一颗颗「糖果」。名字来自希腊语「欺骗」——它长得像好几种更贵的宝石。",
      en: "Hexagonal 6/m: hexagonal prisms with flat pinacoids and gentle pyramids — crystals like little candies. The name is Greek for 'deceit': it mimics several pricier gems.",
    },
    about: {
      zh: "你的牙釉质就是羟基磷灰石——这矿物和人体缘分不浅。莫氏 5 恰好在「指甲与小刀之间」，是硬度计的中坚。墨西哥杜兰戈的无色双锥晶体与巴伐利亚的糖果绿柱体都是收藏经典。",
      where: "墨西哥 Durango（大双锥）、德国 Bavaria（糖果绿柱状）、加拿大 Ontario；国内湖北、河南也有。",
      hard: "5（硬度计 4 与 6 之间的标尺）",
      spot: "六方柱 + 平坦底面 + 玻璃光泽；晶体常像被拉长的糖果。",
    },
    habits: [
      {
        id: "prismatic", zh: "柱状（糖果型）", en: "Prismatic",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "六方柱", en: "Prism" },
          { hkl: [0, 0, 1], k: 0.55, idx: "{0001}", zh: "底面", en: "Pinacoid" },
          { hkl: [1, 0, 1], k: 1.35, idx: "{10-11}", zh: "六方双锥", en: "Pyramid" },
        ],
      },
      {
        id: "bipyramidal", zh: "双锥状（Durango 型）", en: "Bipyramidal",
        forms: [
          { hkl: [1, 0, 0], k: 1, idx: "{10-10}", zh: "六方柱（短）", en: "Prism" },
          { hkl: [0, 0, 1], k: 0.35, idx: "{0001}", zh: "底面", en: "Pinacoid" },
          { hkl: [1, 0, 1], k: 1.15, idx: "{10-11}", zh: "六方双锥（主锥面）", en: "Pyramid" },
          { hkl: [1, 0, 2], k: 1.5, idx: "{10-12}", zh: "六方双锥（缓锥面）", en: "Pyramid" },
        ],
      },
    ],
  },
];
