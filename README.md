# AI 风水户型助手 · FengShui Layout Planner

> 结合传统住宅布局经验与现代空间设计原则，对户型图进行**布局分析、家具摆放建议、动线优化、隐私与采光通风参考**的工具。
>
> 本工具**不是算命网站**，不提供任何改变命运、保证健康或保证发财的承诺。所有结论均为对既有空间布局的客观提示，仅供参考，不构成工程、法律或医疗建议。

[English documentation](./README.en.md)

---

## 目录

- [项目定位](#项目定位)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [内置示例户型](#内置示例户型)
- [使用流程](#使用流程)
- [目录结构](#目录结构)
- [架构：确定性规则引擎](#架构确定性规则引擎)
- [评分系统（五维）](#评分系统五维)
- [规则总览（18 条）](#规则总览18-条)
- [技术栈](#技术栈)
- [可扩展路线](#可扩展路线)
- [贡献](#贡献)
- [许可证](#许可证)
- [免责声明](#免责声明)

---

## 项目定位

| 项目 | 说明 |
| --- | --- |
| 中文名 | AI 风水户型助手 |
| 英文名 | FengShui Layout Planner |
| 类型 | 纯前端户型布局分析工具 |
| 运行方式 | Next.js + 浏览器，数据保存在本地（localStorage） |
| 核心约束 | 评分必须由固定规则引擎计算，**不依赖大模型随机评分** |

工具覆盖的核心能力：

- 上传 JPG/PNG 户型图，或直接使用内置示例（无需上传即可体验）
- 设置正北方向、入户门位置、比例尺
- 标记 17 种房间 / 门窗 / 家具元素，支持拖动、缩放、旋转、删除、改名、撤销 / 恢复
- 固定规则引擎检测，输出综合评分与五维分类评分
- 在图上文位置标注问题，给出传统解释、现代解释与优化建议
- 改造前 / 后双场景对比
- 生成可打印分析报告

---

## 功能特性

- **确定性分析**：同一户型、相同标记，永远得到相同评分。规则为纯函数，无随机数、无时间、无网络依赖。
- **五维评分**：传统风水、空间动线、私密程度、功能布局、采光通风，各 100 分起评，等权合成总分。
- **17 种可标记元素**：客厅、主卧、次卧、厨房、卫生间、阳台、书房、餐厅、入户门、房门、窗户、床、沙发、书桌、灶台、水槽、镜子。
- **图上标注**：按严重程度着色的问题标记，点击可在图文中定位。
- **改造对比**：`before` / `after` 双场景，可复制场景后逐项整改再对比评分变化。
- **本地持久化**：项目保存在浏览器 localStorage，刷新、关闭后仍在。
- **零配置起步**：第一版无需数据库、不强制 AI API、不需要配置任何 Key。
- **响应式**：首页 / 报告页适配电脑与移动端；编辑器以电脑端为主。

---

## 快速开始

环境要求：**Node.js ≥ 20**，**npm ≥ 10**。

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:3000）
npm run dev

# 3. 代码检查
npm run lint

# 4. 类型检查
npm run typecheck

# 5. 运行测试
npm run test

# 6. 生产构建
npm run build

# 7. 预览生产构建
npm run start
```

> 说明：若你的环境在 `NODE_OPTIONS` 中设置了 Turbopack Worker 不支持的参数（如某些企业代理证书相关的 `--use-system-ca`），构建前请临时清空：
> `NODE_OPTIONS= npm run build`

---

## 内置示例户型

无需上传图片即可体验完整流程（首页点击「载入示例」）：

| 示例 ID | 名称 | 演示要点 |
| --- | --- | --- |
| `entry-facing-bathroom` | 入户门正对卫生间 | 入户视线与动线问题、隐私 |
| `bathroom-in-center` | 卫生间位于住宅中心 | 中心污位、采光通风 |
| `bed-facing-door` | 床正对门且家具不合理 | 床对门、床头无靠墙、镜子对床 |

---

## 使用流程

1. **上传 / 载入**：在首页上传户型图，或一键载入示例户型。
2. **设置基准**：设置正北方向（罗盘参考）、入户门位置、比例尺（像素 ↔ 米）。
3. **标记元素**：从元素面板添加房间 / 门窗 / 家具，拖动到正确位置，按需缩放、旋转、改名。
4. **规则检测**：切换至报告页，规则引擎自动计算评分并列出问题。
5. **定位与优化**：在问题列表中点击「在图上定位」，查看图上标注；按优化建议整改。
6. **改造对比**：复制当前场景为 `after`，整改后对比五维评分变化。
7. **导出报告**：打印或保存分析报告。

---

## 目录结构

```
fengshui-layout-planner/
├── src/
│   ├── app/                      # Next.js App Router 路由
│   │   ├── layout.tsx            # 根布局（站点头/尾、字体、元信息）
│   │   ├── page.tsx              # 首页（介绍/功能/步骤/规则总览/风险声明）
│   │   ├── editor/page.tsx       # 编辑器页（画布+面板+工具条）
│   │   ├── report/page.tsx       # 报告页（评分+问题+预览+对比）
│   │   └── globals.css           # 主题色板与打印样式
│   ├── components/
│   │   ├── site/                 # SiteHeader / SiteFooter
│   │   ├── home/                 # StartPanel（上传/示例入口）
│   │   ├── editor/               # PlanCanvas / ElementPalette / Inspector / EditorToolbar / PlanSettings / EditorClient
│   │   └── analysis/             # PlanPreview / ScoreSummary / IssueList / ReportClient
│   ├── hooks/                    # use-hydrated / use-analysis
│   ├── lib/                      # 领域模型与规则引擎
│   │   ├── types.ts              # 领域类型（元素/项目/规则/结果）
│   │   ├── element-catalog.ts    # 17 种元素规格
│   │   ├── geometry.ts           # 几何与朝向计算
│   │   ├── scoring.ts            # 五维评分与等级
│   │   ├── constants.ts          # 产品名/步骤/功能/免责声明
│   │   ├── image.ts              # 户型图读取与压缩
│   │   ├── samples.ts            # 内置示例户型
│   │   └── rules/                # 规则引擎
│   │       ├── definitions.ts    # 18 条规则定义
│   │       ├── context.ts        # 分析上下文构建
│   │       └── engine.ts         # 评分计算（analyzePlan）
│   └── store/
│       └── project-store.ts      # Zustand 持久化状态
├── tests/                        # Vitest 测试（geometry / engine）
├── .github/workflows/ci.yml      # 持续集成（lint + test + build）
├── vitest.config.ts
├── eslint.config.mjs
├── next.config.ts
├── vercel.json
├── LICENSE                       # MIT
└── package.json
```

---

## 架构：确定性规则引擎

评分**不依赖任何大模型**。整个分析管线是纯函数：

```
标记元素 (PlanElement[])
   ↓
buildContext()         — 分类房间/门窗/家具，计算包围盒、就近归属、米/像素换算
   ↓
RULES[].evaluate(ctx)  — 每条规则返回命中(Hit[])，含涉及元素、标记点、说明
   ↓
analyzePlan()          — 应用重复命中衰减，扣减五维分类分，排序，计算总分
   ↓
AnalysisResult         — 总分 + 五维分 + 问题列表
```

关键设计：

- **朝向判定**（`facingCheck`）：按元素类型使用不同「正对模式」（`bi` 双向 / `uni` 单向正面 / `none` 房间），结合**夹角、距离、横向偏移**三重阈值，避免纯几何误判。
- **重复命中衰减**：同一规则多次命中按 `OCCURRENCE_DECAY = [1, 0.6, 0.4, …]` 衰减，防止单类问题无限拉低分数。
- **可解释性**：每条规则携带 `traditional`（传统解释）、`modern`（现代解释）、`suggestion`（优化建议）三段话术，全部在报告中呈现。

---

## 评分系统（五维）

每个维度从 **100 分**起评，按命中规则的 `impacts` 扣分（受重复衰减影响）。总分 = 五维等权（各 0.2）加权求和。

| 维度 Key | 中文 | 关注点 |
| --- | --- | --- |
| `fengshui` | 传统风水 | 门冲、穿堂、缺角、污位等传统格局 |
| `circulation` | 空间动线 | 走廊、公共区可达性、动线交叉 |
| `privacy` | 私密程度 | 入户视线通廊、卧室/主卧隐私 |
| `function` | 功能布局 | 床/沙发/书桌靠墙、水火分区、中心布置 |
| `lighting` | 采光通风 | 中心卫生间、长走廊采光、缺角采光面 |

等级：≥85 优秀 / 70–84 良好 / 55–69 一般 / 40–54 偏弱 / <40 待改善。

---

## 规则总览（18 条）

严重程度：`高` 显著建议优先整改；`中` 一般建议优化；`低` 体验性建议。

| # | 规则 ID | 名称 | 维度 | 严重度 |
| --- | --- | --- | --- | --- |
| 1 | `entry-door-faces-bathroom` | 入户门正对卫生间 | 传统风水 | 高 |
| 2 | `entry-door-faces-bedroom-door` | 入户门正对卧室门 | 私密程度 | 中 |
| 3 | `door-faces-door` | 房门正对房门 | 传统风水 | 中 |
| 4 | `bathroom-in-center` | 卫生间位于住宅中心 | 功能布局 | 高 |
| 5 | `kitchen-bathroom-too-close` | 厨房与卫生间距离过近 | 功能布局 | 中 |
| 6 | `bed-faces-door` | 床正对卧室门 | 私密程度 | 高 |
| 7 | `bed-head-no-wall` | 床头没有靠墙 | 功能布局 | 中 |
| 8 | `mirror-faces-bed` | 镜子正对床 | 传统风水 | 中 |
| 9 | `stove-faces-sink` | 灶台正对水槽 | 功能布局 | 中 |
| 10 | `stove-sink-too-close` | 灶台距离水槽过近 | 功能布局 | 中 |
| 11 | `living-room-far-from-entry` | 客厅距离入户门过远 | 空间动线 | 中 |
| 12 | `long-corridor` | 走廊过长 | 空间动线 | 中 |
| 13 | `missing-corner` | 房屋存在明显缺角 | 传统风水 | 中 |
| 14 | `through-draft` | 门窗形成直接穿堂动线 | 传统风水 | 中 |
| 15 | `desk-no-wall-behind` | 书桌背后没有墙 | 功能布局 | 低 |
| 16 | `sofa-no-wall-behind` | 沙发背后没有墙 | 功能布局 | 低 |
| 17 | `bathroom-faces-kitchen` | 卫生间门正对厨房 | 功能布局 | 高 |
| 18 | `master-bedroom-privacy` | 主卧隐私性不足 | 私密程度 | 中 |

每条规则的触发条件、传统解释、现代解释与优化建议在应用内报告及 `src/lib/rules/definitions.ts` 中完整定义。

---

## 技术栈

- **框架**：Next.js 16（App Router, `src/` 目录）+ React 19 + TypeScript
- **样式**：Tailwind CSS v4（`@theme` 定制色板）
- **画布**：react-konva / Konva.js（元素拖拽、缩放、旋转、问题标注、罗盘层）
- **状态**：Zustand + `persist` 中间件（localStorage）
- **测试**：Vitest + @testing-library/react + jsdom
- **质量**：ESLint 9（`eslint-config-next`）、`tsc --noEmit`
- **部署**：Vercel（`vercel.json` 已配置）

---

## 可扩展路线

架构已为后续能力预留空间，按推荐顺序：

1. **AI 文字润色**：在规则话术基础上，用 OpenAI 等大模型生成更口语化的整改说明（评分仍由规则引擎决定）。
2. **户型图识别**：上传图片后自动识别墙体与房间，减少手动标记。
3. **后端与账号**：引入 Supabase / Postgres 存储项目，支持多设备同步与登录。
4. **PDF 导出**：在现有可打印报告基础上生成 PDF。
5. **土地 / 规划视角**：扩展规则覆盖楼栋朝向、地块形状。
6. **地产商 / 装修公司模式**：批量户型评分、模板库、团队协作。

---

## 贡献

欢迎提交 Issue 与 Pull Request。提交前请确保：

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

全部通过后再发起 PR。CI 会自动执行同样的检查。

---

## 许可证

[MIT](./LICENSE) © 2026 haoqiluo

---

## 免责声明

本工具仅用于住宅布局的**参考与分析**，所有评分与建议均由固定规则引擎根据用户输入的标记计算得出，不代表任何迷信或玄学结论。本工具**不承诺、不暗示**能够改变使用者的命运、健康或财富状况。涉及实际装修、结构改动、承重墙拆改等事项，请务必咨询具备资质的建筑、设计或施工专业人员。
