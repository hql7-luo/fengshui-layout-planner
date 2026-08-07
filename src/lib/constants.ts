export const DISCLAIMER_TEXT =
  '本工具仅提供传统居住文化与空间布局参考，不构成建筑、结构、消防、法律、健康、投资或专业风水咨询意见。实际装修和施工方案应由建筑师、设计师或相关专业人员审核。';

export const PRODUCT_NAME_ZH = 'AI 风水户型助手';
export const PRODUCT_NAME_EN = 'FengShui Layout Planner';

export const USAGE_STEPS = [
  {
    title: '上传户型图',
    description: '支持 JPG / PNG。图片仅在浏览器本地处理，不会上传到任何服务器。',
  },
  {
    title: '设定正北与比例',
    description: '拖动罗盘设定正北方向，并按已知墙体长度校准比例尺，让距离判断更准确。',
  },
  {
    title: '标记房间与家具',
    description: '从元素面板添加客厅、卧室、门窗、床、灶台等对象，可拖动、缩放、旋转与重命名。',
  },
  {
    title: '查看规则检测结果',
    description: '本地规则引擎实时计算五项分类评分，并在图上标注问题位置。',
  },
  {
    title: '对比优化方案',
    description: '复制一份「优化后」方案调整布局，直接比较两版评分差异。',
  },
  {
    title: '导出分析报告',
    description: '一键生成可打印的报告，包含问题解释与可执行的改进建议。',
  },
];

export const FEATURES = [
  {
    title: '确定性规则引擎',
    description:
      '18 条布局规则由纯函数实现，不依赖大模型随机打分。相同户型输入必然得到完全一致的评分结果。',
  },
  {
    title: '双重解释框架',
    description:
      '每条问题同时给出传统住宅文化的说法与现代空间设计的成因分析，便于自行判断取舍。',
  },
  {
    title: '五维分类评分',
    description: '传统风水、空间动线、隐私程度、功能布局、采光通风分别计分，定位薄弱环节。',
  },
  {
    title: '改造前后对比',
    description: '内置「优化前 / 优化后」双方案，调整完布局即可直接看到分数变化。',
  },
  {
    title: '完全本地运行',
    description: '无需登录、无需配置 API Key，户型图与项目数据只保存在你自己的浏览器中。',
  },
  {
    title: '可打印报告',
    description: '结构化输出高风险问题、中风险问题与一般建议，可直接打印或导出 PDF 与设计师沟通。',
  },
];
