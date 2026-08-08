/**
 * 领域模型定义。
 *
 * 坐标系约定：
 * - 画布坐标以像素为单位，原点在左上角，x 向右、y 向下。
 * - 旋转角 rotation 以度为单位，顺时针为正（与 Konva 一致）。
 * - 每个元素的「正面」为局部 +Y 方向（画布上会渲染一个朝向箭头），「背面」为局部 -Y。
 * - pixelsPerMeter 用于把像素换算成米，规则引擎中所有距离阈值均使用米。
 */

export type ElementCategory = 'room' | 'opening' | 'furniture';

export type RoomType =
  | 'living_room'
  | 'master_bedroom'
  | 'second_bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'balcony'
  | 'study'
  | 'dining_room';

export type OpeningType = 'entry_door' | 'room_door' | 'window';

export type FurnitureType = 'bed' | 'sofa' | 'desk' | 'stove' | 'sink' | 'mirror' | 'screen';

export type ElementType = RoomType | OpeningType | FurnitureType;

/** 朝向语义：bi = 双向正对（门窗），uni = 单向正面（床/沙发/镜子等），none = 无朝向 */
export type FacingMode = 'bi' | 'uni' | 'none';

export interface Point {
  x: number;
  y: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanElement {
  id: string;
  type: ElementType;
  /** 用户可编辑的显示名称 */
  name: string;
  /** 中心点坐标（像素） */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 顺时针旋转角度 */
  rotation: number;
  /**
   * 房间的真实边界（画布绝对坐标）。
   * 缺省时仍使用 x/y/width/height/rotation 表示的旋转矩形；墙体移动后写入 polygon，
   * x/y/width/height 会同步为 polygon 的几何中心与包围盒，供旧规则和编辑器兼容使用。
   */
  polygon?: Point[];
}

export type ScenarioKey = 'before' | 'after';

export interface Scenario {
  elements: PlanElement[];
  /** 该场景的结构模型（墙体/门洞/窗洞/区域），缺省时回退为项目级 structure */
  structure?: StructureModel;
}

export interface PlanImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  image: PlanImage | null;
  canvas: { width: number; height: number };
  /** 正北方向相对画布上方的顺时针夹角（度） */
  northAngle: number;
  pixelsPerMeter: number;
  scenarios: Record<ScenarioKey, Scenario>;
  /** 结构模型（墙体/门洞/窗洞/区域）；场景级 structure 优先，缺省回退到此 */
  structure?: StructureModel;
  /** 来源示例 id（如果由示例创建） */
  sampleId?: string;
}

/* ------------------------------------------------------------------ */
/* 规则引擎                                                            */
/* ------------------------------------------------------------------ */

export type Severity = 'high' | 'medium' | 'low';

export type ScoreCategory =
  | 'fengshui'
  | 'circulation'
  | 'privacy'
  | 'function'
  | 'lighting';

export type CategoryImpact = Partial<Record<ScoreCategory, number>>;

export interface RuleHit {
  /** 命中的元素 id，用于在画布上高亮 */
  elementIds: string[];
  /** 问题标注位置（画布坐标） */
  marker: Point;
  /** 补充说明，例如实测距离 */
  detail?: string;
  /** 可选的「一键应用建议」修正动作，仅部分规则可自动修正 */
  fix?: FixAction;
}

/**
 * 单条「应用建议」修正动作。作用于某个元素：
 * - rotationDelta：顺时针旋转增量（度，0~360）
 * - dx / dy：平移增量（米，画布坐标方向）；应用时会乘以 pixelsPerMeter 转为像素
 * 平移与旋转可同时生效。
 */
export interface FixAction {
  targetId: string;
  rotationDelta?: number;
  dx?: number;
  dy?: number;
}

export interface AnalysisContext {
  elements: PlanElement[];
  rooms: PlanElement[];
  openings: PlanElement[];
  furniture: PlanElement[];
  pixelsPerMeter: number;
  northAngle: number;
  /** 所有房间的联合包围盒；若无房间则退化为画布尺寸 */
  bounds: BBox;
  canvas: { width: number; height: number };
  byType: (...types: ElementType[]) => PlanElement[];
  /** 元素中心点所在的房间 */
  roomOf: (element: PlanElement) => PlanElement | undefined;
  /** 像素 → 米 */
  toMeters: (px: number) => number;
  /** 米 → 像素 */
  toPixels: (meters: number) => number;
}

export interface RuleDefinition {
  id: string;
  name: string;
  /** 主分类，用于报告分组展示 */
  category: ScoreCategory;
  severity: Severity;
  /** 各维度扣分分布，总和即该规则的基础扣分 */
  impacts: CategoryImpact;
  /** 触发条件（自然语言描述，展示在报告中） */
  condition: string;
  /** 传统风水解释 */
  traditional: string;
  /** 现代空间设计解释 */
  modern: string;
  /** 具体优化建议 */
  suggestion: string;
  /** 同一规则最多计入的命中次数（防止重复扣分过度） */
  maxOccurrences: number;
  evaluate: (ctx: AnalysisContext) => RuleHit[];
}

export type RuleMeta = Omit<RuleDefinition, 'evaluate'> & { penalty: number };

export interface Issue {
  /** 唯一 key：ruleId#index */
  key: string;
  ruleId: string;
  name: string;
  category: ScoreCategory;
  severity: Severity;
  impacts: CategoryImpact;
  condition: string;
  traditional: string;
  modern: string;
  suggestion: string;
  elementIds: string[];
  marker: Point;
  detail?: string;
  /** 本次命中实际扣分（考虑重复衰减后） */
  appliedPenalty: number;
  /** 可选的「一键应用建议」修正动作 */
  fix?: FixAction;
}

export interface AnalysisResult {
  /** 未应用严重问题上限前，五维等权计算得到的原始总分 */
  rawOverall: number;
  overall: number;
  categories: Record<ScoreCategory, number>;
  issues: Issue[];
  counts: Record<Severity, number>;
  /** 参与评估的元素数量，便于提示用户信息是否充足 */
  elementCount: number;
  /** 严重问题触发总分上限时，保留可追溯的上限依据 */
  scoreCap?: {
    value: number;
    reason: string;
  };
}

/* ------------------------------------------------------------------ */
/* 墙体结构模型                                                        */
/* ------------------------------------------------------------------ */

export type WallKind = 'exterior' | 'load-bearing' | 'partition' | 'unknown';

/** 一段独立墙体：起点终点（像素）、厚度、类型、是否可移动、相邻房间、是否含门窗 */
export interface Wall {
  id: string;
  kind: WallKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessM: number;
  /** 由 kind 推导：只有明确标记为 partition 时为 true */
  movable: boolean;
  adjacentRooms: [string | null, string | null];
  hasDoor: boolean;
  hasWindow: boolean;
}

export type OpeningKind = 'entry' | 'room' | 'bathroom' | 'kitchen' | 'balcony' | 'window';

/** 门洞：位于某段墙体上，linkedElementId 指向对应的 room_door / entry_door 元素 */
export interface DoorOpening {
  id: string;
  wallId: string;
  /** 门洞中心（画布像素） */
  point: Point;
  widthM: number;
  kind: OpeningKind;
  linkedElementId?: string;
  /** 入户门默认不可移动，除非用户明确允许 */
  movable: boolean;
}

export interface WindowOpening {
  id: string;
  wallId: string;
  point: Point;
  widthM: number;
  linkedElementId?: string;
}

export type ZoneKind = 'wet' | 'fixed';

/** 不可移动区域：厨房/卫生间湿区、管井、柱体、楼梯等 */
export interface Zone {
  id: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
  roomId?: string;
  movable: boolean;
}

/** 户型结构模型。loadBearingMarked 只表示用户已完成过墙体属性确认，不授权任何具体墙段移动 */
export interface StructureModel {
  walls: Wall[];
  doors: DoorOpening[];
  windows: WindowOpening[];
  zones: Zone[];
  loadBearingMarked: boolean;
}

/* ------------------------------------------------------------------ */
/* 结构优化候选方案                                                    */
/* ------------------------------------------------------------------ */

export type ModificationKind =
  | 'relocate-door'
  | 'offset-door'
  | 'seal-door'
  | 'add-partition'
  | 'add-screen'
  | 'add-node'
  | 'merge-corridor'
  | 'move-wall'
  | 'furniture-fix';

export interface WallMoveRecord {
  wallId: string;
  from: [Point, Point];
  to: [Point, Point];
  /** 带方向的移动距离（米） */
  distanceM: number;
}

export interface RoomAreaChange {
  roomId: string;
  roomName: string;
  beforeM2: number;
  afterM2: number;
  deltaM2: number;
}

/** 单条优化动作的改动记录（用于结果摘要） */
export interface PlanModification {
  kind: ModificationKind;
  /** 中文动作名，例如「改门洞位置」「新增玄关隔断」 */
  label: string;
  description: string;
  /** 新增墙体（玄关短墙、隔断） */
  addedWalls?: Wall[];
  /** 需封闭的旧门洞 id */
  sealedDoorIds?: string[];
  /** 移动的元素（门洞移位） */
  movedElementIds?: Array<{ id: string; x: number; y: number; rotation?: number }>;
  /** 新增的元素（玄关屏风等） */
  addedElements?: PlanElement[];
  /** 真正移动的共享非承重墙及前后坐标 */
  movedWalls?: WallMoveRecord[];
  /** 墙体移动导致的房间面积变化 */
  roomAreaChanges?: RoomAreaChange[];
}

export type ChangeDegree = 'minimal' | 'balanced' | 'major';
export type ProblemType =
  | 'entry-bathroom'
  | 'door-door'
  | 'long-corridor'
  | 'furniture'
  | 'mixed';

/** 单条结构优化候选方案（A=最小改动 / B=综合平衡 / C=结构综合调整） */
export interface CandidatePlan {
  id: 'A' | 'B' | 'C';
  title: string;
  problemType: ProblemType;
  feasible: boolean;
  /** 不可行时的具体原因，例如「未完成墙体属性确认 / 房间尺寸不足 / 湿区不可移动 / 通道宽度不合格 / 没有足够墙面移动门洞」 */
  infeasibleReason?: string;
  modifications: PlanModification[];
  /** 应用后的元素布局（原始不会被覆盖，需用户点击「应用方案」） */
  projectedElements: PlanElement[];
  /** 应用后的结构模型 */
  projectedStructure: StructureModel;
  originalScore: number;
  predictedScore: number;
  predictedCategories: Record<ScoreCategory, number>;
  solvedIssueKeys: string[];
  remainingIssueKeys: string[];
  /** 相对原方案真正消除的问题（按规则 + 涉及元素稳定比对，避免序号漂移） */
  solvedIssues: Array<Pick<Issue, 'key' | 'ruleId' | 'name' | 'severity'>>;
  /** 候选方案新增的问题；用于防止以制造新风险换取分数 */
  introducedIssues: Array<Pick<Issue, 'key' | 'ruleId' | 'name' | 'severity'>>;
  /** 优化价值 = 解决问题扣分 − 改动成本 − 约束惩罚 */
  valueScore: number;
  changeDegree: ChangeDegree;
  /** 由改动项确定性计算的相对成本点数；只用于方案比较，不是施工报价 */
  changeCost: number;
  risks: string[];
  /** 用户未完成墙体属性确认时为 true，方案仅作概念候选、不可直接施工 */
  conceptOnly: boolean;
}

export interface OptimizationResult {
  plans: CandidatePlan[];
  /** 是否存在可生成结构方案的问题 */
  hasStructuralIssue: boolean;
  generatedAt: number;
  /** Store 写入的来源信息，用于刷新恢复与防止应用陈旧候选 */
  sourceProjectId?: string;
  sourceScenario?: ScenarioKey;
  sourceUpdatedAt?: number;
}

/* ------------------------------------------------------------------ */
/* 一键全部优化摘要                                                    */
/* ------------------------------------------------------------------ */

export type ApplyStatus = 'applied' | 'skipped';

/** 单条优化的执行结果 */
export interface ApplyAllItem {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  status: ApplyStatus;
  /** 具体改动内容（已优化为改动说明，需手动为原因） */
  change: string;
  /** 被修改元素的名称与目标 id（仅已优化时有） */
  targetName?: string;
  targetId?: string;
}

/** 「一键全部优化」执行后的整体摘要 */
export interface ApplyAllSummary {
  appliedCount: number;
  skippedCount: number;
  /** 优化前总分 */
  startedScore: number;
  /** 优化后总分 */
  finishedScore: number;
  items: ApplyAllItem[];
}
