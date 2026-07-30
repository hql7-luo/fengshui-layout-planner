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

export type FurnitureType = 'bed' | 'sofa' | 'desk' | 'stove' | 'sink' | 'mirror';

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
}

export type ScenarioKey = 'before' | 'after';

export interface Scenario {
  elements: PlanElement[];
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
}

export interface AnalysisResult {
  overall: number;
  categories: Record<ScoreCategory, number>;
  issues: Issue[];
  counts: Record<Severity, number>;
  /** 参与评估的元素数量，便于提示用户信息是否充足 */
  elementCount: number;
}
