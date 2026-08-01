import {
  aabb,
  center,
  clamp,
  compassOf,
  containsPoint,
  facingCheck,
  facingVector,
  lineBlocked,
  sub,
} from './geometry';
import { ELEMENT_SPECS } from './element-catalog';
import type {
  AnalysisResult,
  PlanElement,
  Point,
  Severity,
  StructureModel,
} from './types';

export type LayerId =
  | 'heatmap'
  | 'privacy'
  | 'airflow'
  | 'circulation'
  | 'daylight'
  | 'zoning'
  | 'energy';

export const LAYER_IDS: LayerId[] = [
  'heatmap',
  'privacy',
  'airflow',
  'circulation',
  'daylight',
  'zoning',
  'energy',
];

export type LayerShape =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'poly'; points: number[] };

export interface LayerRegion {
  id: string;
  layer: LayerId;
  kind: string;
  shape: LayerShape;
  label: string;
  /** 计算依据：为什么该区域呈现此状态（阳宅能量图必须给出解释） */
  basis: string;
  severity?: Severity;
}

export interface LayerLine {
  id: string;
  layer: LayerId;
  points: number[];
  color: string;
  width?: number;
  dashed?: boolean;
  label?: string;
  basis?: string;
}

export interface LayerOutput {
  regions: LayerRegion[];
  lines: LayerLine[];
  /** 输入数据是否足以绘制该图层 */
  sufficient: boolean;
  insufficiencyReason?: string;
}

export type AllLayers = { [k in LayerId]: LayerOutput };

export interface LayerInput {
  elements: PlanElement[];
  analysis: AnalysisResult;
  options: { pixelsPerMeter: number; northAngle: number; canvas: { width: number; height: number } };
  structure?: StructureModel | null;
}

export const LAYER_META: Record<
  LayerId,
  { label: string; short: string; description: string; legend: { color: string; label: string }[] }
> = {
  heatmap: {
    label: '风水问题热力图',
    short: '问题热力',
    description: '将命中的风水规则按严重程度标注在对应元素位置，红=高风险、橙=中风险、黄=低风险。',
    legend: [
      { color: '#dc2626', label: '高风险' },
      { color: '#f59e0b', label: '中风险' },
      { color: '#facc15', label: '低风险' },
    ],
  },
  privacy: {
    label: '入户隐私视线图',
    short: '隐私视线',
    description: '从入户门沿朝向轴线的直视范围，标注入户即可直视的私密空间（卧室 / 卫生间门等）。玄关屏风可阻断。',
    legend: [
      { color: '#dc2626', label: '直视冲突' },
      { color: '#22c55e', label: '已被屏障阻断' },
    ],
  },
  airflow: {
    label: '门窗气流路径图',
    short: '气流路径',
    description: '以门窗为气口，沿其朝向绘制的室内气流进入路径（传统文化中的「纳气」示意，非真实流体仿真）。',
    legend: [{ color: '#38bdf8', label: '气流进入路径' }],
  },
  circulation: {
    label: '主要生活动线图',
    short: '生活动线',
    description: '入户门经客厅到达各房间门的主要日常通行连线。',
    legend: [{ color: '#10b981', label: '主要动线' }],
  },
  daylight: {
    label: '采光潜力图',
    short: '采光潜力',
    description: '以窗户为光源，按房间到最近窗的距离估算采光潜力（黄=好，暗=弱）。',
    legend: [
      { color: '#fde047', label: '采光好' },
      { color: '#ca8a04', label: '采光一般' },
      { color: '#78350f', label: '采光弱' },
    ],
  },
  zoning: {
    label: '动区与静区分布图',
    short: '动静分区',
    description: '按房间功能划分动区（客厅 / 厨房 / 餐厅等）与静区（卧室 / 书房 / 卫生间等）。',
    legend: [
      { color: '#fb923c', label: '动区' },
      { color: '#60a5fa', label: '静区' },
      { color: '#a78bfa', label: '过渡区' },
    ],
  },
  energy: {
    label: '阳宅空间能量示意图',
    short: '能量示意',
    description:
      '传统文化空间模型（非真实物理能量测量）：综合方位、门窗、气流、采光、开阔度、动静分区、房间功能、与中心关系及已触发规则，给出区域能量状态。',
    legend: [
      { color: '#22c55e', label: '流动顺畅' },
      { color: '#84cc16', label: '相对平衡' },
      { color: '#94a3b8', label: '能量停滞' },
      { color: '#dc2626', label: '直接冲突' },
      { color: '#f59e0b', label: '建议改善' },
    ],
  },
};

function distPoints(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const SEVERITY_COLOR: Record<Severity, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#facc15',
};

function rooms(elements: PlanElement[]): PlanElement[] {
  return elements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
}
function byType(elements: PlanElement[], type: string): PlanElement[] {
  return elements.filter((e) => e.type === type);
}

/* ------------------------------------------------------------------ */
/* 1. 风水问题热力图                                                    */
/* ------------------------------------------------------------------ */
function computeHeatmap(input: LayerInput): LayerOutput {
  const { analysis, elements, options } = input;
  const ppm = options.pixelsPerMeter;
  const regions: LayerRegion[] = [];
  const lines: LayerLine[] = [];
  for (const issue of analysis.issues) {
    const pts = issue.elementIds
      .map((id) => elements.find((e) => e.id === id))
      .filter((e): e is PlanElement => Boolean(e));
    const anchors = pts.length ? pts.map(center) : [issue.marker];
    for (const a of anchors) {
      const r = 0.55 * ppm;
      regions.push({
        id: `heat-${issue.key}-${Math.round(a.x)}-${Math.round(a.y)}`,
        layer: 'heatmap',
        kind: issue.severity,
        shape: { type: 'circle', cx: a.x, cy: a.y, r },
        label: issue.name,
        severity: issue.severity,
        basis: `${issue.name}（${issue.severity}）：实际扣分 ${issue.appliedPenalty} 分。${issue.detail ?? ''} 建议：${issue.suggestion}`,
      });
    }
  }
  return { regions, lines, sufficient: true };
}

/* ------------------------------------------------------------------ */
/* 2. 入户隐私视线图                                                    */
/* ------------------------------------------------------------------ */
function computePrivacy(input: LayerInput): LayerOutput {
  const { elements, options } = input;
  const ppm = options.pixelsPerMeter;
  const entries = byType(elements, 'entry_door');
  if (entries.length === 0) {
    return { regions: [], lines: [], sufficient: false, insufficiencyReason: '缺少入户门，无法绘制隐私视线' };
  }
  const screens = byType(elements, 'screen');
  const targets = elements.filter((e) =>
    ['room_door', 'bed', 'bathroom', 'master_bedroom', 'second_bedroom'].includes(e.type),
  );
  const regions: LayerRegion[] = [];
  const lines: LayerLine[] = [];
  let idx = 0;
  for (const entry of entries) {
    const a = center(entry);
    for (const t of targets) {
      const b = center(t);
      const hit = facingCheck(entry, t, { maxAngle: 24, maxDistance: ppm * 9 });
      if (!hit.facing) continue;
      const blocked = lineBlocked(a, b, screens);
      const color = blocked ? '#22c55e' : '#dc2626';
      lines.push({
        id: `priv-${idx++}`,
        layer: 'privacy',
        points: [a.x, a.y, b.x, b.y],
        color,
        dashed: blocked,
        label: blocked ? '已被屏障阻断' : '直视冲突',
        basis: blocked
          ? `入户门与${t.name}的直视轴线已被玄关 / 屏风阻断，隐私冲突已缓解。`
          : `入户门正对${t.name}，开门即直视，缺少缓冲；建议增设玄关屏风或错位门洞。`,
      });
      if (!blocked) {
        regions.push({
          id: `priv-r-${idx}`,
          layer: 'privacy',
          kind: 'conflict',
          shape: { type: 'circle', cx: b.x, cy: b.y, r: 0.4 * ppm },
          label: `${t.name} 直视`,
          severity: 'high',
          basis: `该位置（${t.name}）处于入户门直视轴线上，属于隐私冲突热区。`,
        });
      }
    }
  }
  return { regions, lines, sufficient: true };
}

/* ------------------------------------------------------------------ */
/* 3. 门窗气流路径图                                                    */
/* ------------------------------------------------------------------ */
function computeAirflow(input: LayerInput): LayerOutput {
  const { elements, options } = input;
  const ppm = options.pixelsPerMeter;
  const inlets = [...byType(elements, 'window'), ...byType(elements, 'entry_door')];
  if (inlets.length === 0) {
    return { regions: [], lines: [], sufficient: false, insufficiencyReason: '缺少门窗，无法绘制气流路径' };
  }
  const regions: LayerRegion[] = [];
  const lines: LayerLine[] = [];
  inlets.forEach((el, i) => {
    const a = center(el);
    const dir = facingVector(el);
    const end = { x: a.x + dir.x * 3 * ppm, y: a.y + dir.y * 3 * ppm };
    lines.push({
      id: `air-${i}`,
      layer: 'airflow',
      points: [a.x, a.y, end.x, end.y],
      color: '#38bdf8',
      width: 2,
      label: el.type === 'window' ? '窗进气' : '入户气流',
      basis: `以${el.name}为气口，气流沿其朝向进入室内（传统文化「纳气」示意，非真实流体仿真）。`,
    });
  });
  return { regions, lines, sufficient: true };
}

/* ------------------------------------------------------------------ */
/* 4. 主要生活动线图                                                    */
/* ------------------------------------------------------------------ */
function computeCirculation(input: LayerInput): LayerOutput {
  const { elements } = input;
  const entry = byType(elements, 'entry_door')[0];
  if (!entry) {
    return { regions: [], lines: [], sufficient: false, insufficiencyReason: '缺少入户门，无法绘制动线' };
  }
  const living = elements.find((e) => e.type === 'living_room') ?? rooms(elements)[0];
  const doors = byType(elements, 'room_door');
  const a = center(entry);
  const hub = living ? center(living) : a;
  const lines: LayerLine[] = [];
  const regions: LayerRegion[] = [];
  let idx = 0;
  lines.push({
    id: `circ-hub-${idx++}`,
    layer: 'circulation',
    points: [a.x, a.y, hub.x, hub.y],
    color: '#10b981',
    label: '入户→客厅',
    basis: '主要生活动线：入户经客厅进入主要活动区。',
  });
  for (const d of doors) {
    const b = center(d);
    lines.push({
      id: `circ-${idx++}`,
      layer: 'circulation',
      points: [hub.x, hub.y, b.x, b.y],
      color: '#10b981',
      dashed: true,
      label: `客厅→${d.name}`,
      basis: `从客厅到达「${d.name}」的日常通行连线。`,
    });
  }
  return { regions, lines, sufficient: true };
}

/* ------------------------------------------------------------------ */
/* 5. 采光潜力图                                                        */
/* ------------------------------------------------------------------ */
function computeDaylight(input: LayerInput): LayerOutput {
  const { elements, options } = input;
  const ppm = options.pixelsPerMeter;
  const windows = byType(elements, 'window');
  if (windows.length === 0) {
    return { regions: [], lines: [], sufficient: false, insufficiencyReason: '缺少窗户，无法估算采光潜力' };
  }
  const roomEls = rooms(elements);
  const regions: LayerRegion[] = [];
  const lines: LayerLine[] = [];
  for (const room of roomEls) {
    const b = aabb(room);
    let best = Infinity;
    for (const w of windows) {
      const d = distPoints(center(w), center(room));
      if (d < best) best = d;
    }
    const meters = best / ppm;
    const t = clamp(1 - meters / 8, 0, 1);
    regions.push({
      id: `day-${room.id}`,
      layer: 'daylight',
      kind: t > 0.66 ? 'good' : t > 0.33 ? 'mid' : 'weak',
      shape: { type: 'rect', x: b.x, y: b.y, w: b.width, h: b.height },
      label: `${room.name} 采光`,
      basis: `「${room.name}」到最近窗约 ${meters.toFixed(1)} 米，采光潜力${t > 0.66 ? '好' : t > 0.33 ? '一般' : '弱'}。`,
    });
  }
  return { regions, lines, sufficient: true };
}

/* ------------------------------------------------------------------ */
/* 6. 动区与静区分布图                                                  */
/* ------------------------------------------------------------------ */
function zoneOf(type: string): 'active' | 'quiet' | 'transit' {
  if (['living_room', 'kitchen', 'dining_room', 'balcony', 'entry_door'].includes(type)) return 'active';
  if (['bed', 'master_bedroom', 'second_bedroom', 'study', 'bathroom'].includes(type)) return 'quiet';
  return 'transit';
}
const ZONE_COLOR = { active: '#fb923c', quiet: '#60a5fa', transit: '#a78bfa' };

function computeZoning(input: LayerInput): LayerOutput {
  const { elements } = input;
  const roomEls = rooms(elements);
  if (roomEls.length === 0) {
    return { regions: [], lines: [], sufficient: false, insufficiencyReason: '缺少房间，无法划分动静区' };
  }
  const regions: LayerRegion[] = [];
  const lines: LayerLine[] = [];
  for (const room of roomEls) {
    const b = aabb(room);
    const z = zoneOf(room.type) === 'active' ? 'active' : zoneOf(room.type) === 'quiet' ? 'quiet' : 'transit';
    regions.push({
      id: `zone-${room.id}`,
      layer: 'zoning',
      kind: z,
      shape: { type: 'rect', x: b.x, y: b.y, w: b.width, h: b.height },
      label: `${room.name}（${z === 'active' ? '动区' : z === 'quiet' ? '静区' : '过渡区'}）`,
      basis: `房间功能为「${ELEMENT_SPECS[room.type]?.label ?? room.type}」，属${z === 'active' ? '动区' : z === 'quiet' ? '静区' : '过渡区'}。`,
    });
  }
  return { regions, lines, sufficient: true };
}

/* ------------------------------------------------------------------ */
/* 7. 阳宅空间能量示意图（传统文化模型，非真实物理测量）                 */
/* ------------------------------------------------------------------ */
type EnergyKind = 'flow' | 'balanced' | 'stagnant' | 'conflict' | 'improve';
const ENERGY_COLOR: Record<EnergyKind, string> = {
  flow: '#22c55e',
  balanced: '#84cc16',
  stagnant: '#94a3b8',
  conflict: '#dc2626',
  improve: '#f59e0b',
};

function computeEnergy(input: LayerInput): LayerOutput {
  const { elements, analysis, options } = input;
  const ppm = options.pixelsPerMeter;
  const W = options.canvas.width;
  const H = options.canvas.height;
  const cell = 0.5 * ppm;
  const roomsEls = rooms(elements);
  const windows = byType(elements, 'window');
  const doors = byType(elements, 'room_door').concat(byType(elements, 'entry_door'));
  const house = { x: W / 2, y: H / 2 };

  // 预计算问题元素包围盒
  const issueBoxes = analysis.issues.map((iss) => ({
    issue: iss,
    box: unionBox(iss.elementIds.map((id) => elements.find((e) => e.id === id)).filter(Boolean) as PlanElement[]),
  }));

  const regions: LayerRegion[] = [];
  let idx = 0;
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      const p: Point = { x: cx, y: cy };

      let score = 0;
      const factors: string[] = [];

      // 与户型中心关系（气聚于中）
      const dCenter = Math.hypot(cx - house.x, cy - house.y) / ppm;
      const centerScore = clamp(1 - dCenter / 7, -0.5, 0.5);
      score += centerScore * 0.5;
      if (centerScore > 0.2) factors.push('靠近户型中心，气聚');
      else if (centerScore < -0.2) factors.push('偏离中心，气散');

      // 门窗分布（气口近则通畅）
      let dDoor = Infinity;
      for (const d of doors) dDoor = Math.min(dDoor, distPoints(p, center(d)) / ppm);
      const doorScore = dDoor === Infinity ? -0.2 : clamp(1 - dDoor / 6, -0.3, 0.4);
      score += doorScore * 0.4;
      if (doorScore > 0.2) factors.push('邻门窗气口，气流通畅');

      // 采光潜力（近窗则明）
      let dWin = Infinity;
      for (const w of windows) dWin = Math.min(dWin, distPoints(p, center(w)) / ppm);
      const lightScore = dWin === Infinity ? -0.1 : clamp(1 - dWin / 7, -0.2, 0.4);
      score += lightScore * 0.4;
      if (lightScore > 0.2) factors.push('近窗采光好');

      // 方位（基于 northAngle 的纳气示意：南 / 东南偏好）
      const vec = sub(p, house);
      const compass = compassOf(vec, options.northAngle);
      if (['南', '东南', '东'].includes(compass)) {
        score += 0.2;
        factors.push(`方位偏${compass}，传统纳气较利`);
      } else if (['北', '西北'].includes(compass)) {
        score -= 0.1;
      }

      // 空间开阔度：不在房间内或处于大房间内
      const inRoom = roomsEls.find((r) => containsPoint(r, p));
      if (!inRoom) {
        score -= 0.1;
        factors.push('位于房间之外（墙体 / 公共通道）');
      } else if (inRoom && aabb(inRoom).width / ppm > 4) {
        score += 0.1;
        factors.push('处于开阔房间内');
      }

      // 已触发规则：冲突扣分
      let hitIssue: (typeof issueBoxes)[number] | null = null;
      for (const ib of issueBoxes) {
        if (ib.box && pointInBox(p, ib.box)) {
          hitIssue = ib;
          break;
        }
      }
      let kind: EnergyKind;
      if (hitIssue) {
        const sev = hitIssue.issue.severity;
        score -= sev === 'high' ? 1.2 : sev === 'medium' ? 0.6 : 0.3;
        kind = sev === 'high' ? 'conflict' : 'improve';
        factors.push(`命中规则「${hitIssue.issue.name}」（${sev}），形成冲突`);
      } else if (score > 0.5) kind = 'flow';
      else if (score > 0.1) kind = 'balanced';
      else if (score > -0.2) kind = 'stagnant';
      else kind = 'conflict';

      if (kind === 'conflict' && !hitIssue) factors.push('多项不利因素叠加，能量冲突');
      if (kind === 'stagnant') factors.push('气口与采光偏弱，能量停滞');

      const basisText =
        `能量状态：${kind === 'flow' ? '流动顺畅' : kind === 'balanced' ? '相对平衡' : kind === 'stagnant' ? '能量停滞' : kind === 'conflict' ? '直接冲突' : '建议改善'}。` +
        (factors.length ? ' 依据：' + factors.join('；') + '。' : '') +
        '（阳宅空间能量为传统文化可视化模型，非真实物理能量测量。）';

      regions.push({
        id: `en-${idx++}`,
        layer: 'energy',
        kind,
        shape: { type: 'rect', x, y, w: cell, h: cell },
        label: LAYER_META.energy.legend.find((l) => l.color === ENERGY_COLOR[kind])?.label ?? kind,
        basis: basisText,
      });
    }
  }
  return { regions, lines: [], sufficient: true };
}

function unionBox(els: PlanElement[]): { x: number; y: number; width: number; height: number } | null {
  if (els.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of els) {
    const b = aabb(e);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function pointInBox(p: Point, b: { x: number; y: number; width: number; height: number }): boolean {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}

export function computeLayers(input: LayerInput): AllLayers {
  return {
    heatmap: computeHeatmap(input),
    privacy: computePrivacy(input),
    airflow: computeAirflow(input),
    circulation: computeCirculation(input),
    daylight: computeDaylight(input),
    zoning: computeZoning(input),
    energy: computeEnergy(input),
  };
}

export { SEVERITY_COLOR, ENERGY_COLOR, ZONE_COLOR };
