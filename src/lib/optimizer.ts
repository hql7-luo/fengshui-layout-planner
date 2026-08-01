import { analyzePlan, type ContextOptions } from './rules/engine';
import { applyAllFixesToElements } from './apply-fixes';
import { SCORE_CAP_HIGH } from './scoring';
import type {
  CandidatePlan,
  DoorOpening,
  Issue,
  OptimizationResult,
  PlanElement,
  PlanModification,
  Point,
  StructureModel,
  Wall,
} from './types';
import {
  aabb,
  center,
  clamp,
  midpoint,
  normalize,
  roomOfDoor,
  roomsConnected,
  roomsOverlap,
  sub,
  toDeg,
} from './geometry';
import { ELEMENT_SPECS } from './element-catalog';

/**
 * 结构优化器（纯函数、确定性）。
 *
 * 输入当前场景的元素与结构模型，针对检测到的结构问题（入户对卫生间 / 门对门 /
 * 长走廊）生成 A（最小改动）、B（综合平衡）、C（评分最高）三套候选方案。
 *
 * 每套方案都：
 * 1. 在家具自动优化基础上叠加结构改动（改门洞 / 移门 / 加玄关短墙）；
 * 2. 用规则引擎重算预测得分（得分变化一定是规则扣分驱动，非编造）；
 * 3. 通过安全校验（不动外墙 / 不动承重墙 / 不遮挡窗户 / 房间不重叠 / 保持连通）；
 * 4. 计算优化价值 = 解决问题扣分 − 改动成本 − 约束惩罚。
 *
 * 原始方案不被覆盖；用户需点击「应用方案」才会写入新场景，且可一步撤销。
 */

const COST_MOVE = 2;
const COST_SCREEN = 3;
const COST_WALL = 4;
const DOOR_ROOM_TOL_M = 0.45; // 米：门洞压在墙线上时归属房间的容差
const MIN_ROOM_HALF = 0.4; // 米：门洞可移位所需的最小房间半宽
const MIN_SCREEN_ROOM_M = 1.4; // 米：可安全设置玄关屏风的最小房间短边 // 米：房间半宽小于此值无法移位门洞

type ProblemType = CandidatePlan['problemType'];

export interface OptimizerInput {
  elements: PlanElement[];
  structure?: StructureModel;
  options: ContextOptions;
  /** 是否允许移动入户门（默认 false：安全约束） */
  allowEntryMove?: boolean;
}

/* ------------------------------------------------------------------ */
/* 结构模型推导                                                        */
/* ------------------------------------------------------------------ */

function unionRoomBounds(elements: PlanElement[]): { x: number; y: number; width: number; height: number } {
  const rooms = elements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
  if (rooms.length === 0) return { x: 0, y: 0, width: 1080, height: 840 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    const b = aabb(r);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 由元素推导一个结构模型（用于没有手动绘制墙体时的示意结构） */
export function buildStructureFromElements(
  elements: PlanElement[],
  loadBearingMarked: boolean,
  ppm = 75,
): StructureModel {
  const bounds = unionRoomBounds(elements);
  const t = 0.2;
  const walls: Wall[] = [
    { id: 'ext-top', kind: 'exterior', x1: bounds.x, y1: bounds.y, x2: bounds.x + bounds.width, y2: bounds.y, thicknessM: t, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
    { id: 'ext-bottom', kind: 'exterior', x1: bounds.x, y1: bounds.y + bounds.height, x2: bounds.x + bounds.width, y2: bounds.y + bounds.height, thicknessM: t, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
    { id: 'ext-left', kind: 'exterior', x1: bounds.x, y1: bounds.y, x2: bounds.x, y2: bounds.y + bounds.height, thicknessM: t, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
    { id: 'ext-right', kind: 'exterior', x1: bounds.x + bounds.width, y1: bounds.y, x2: bounds.x + bounds.width, y2: bounds.y + bounds.height, thicknessM: t, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
  ];

  const doors: DoorOpening[] = [];
  for (const el of elements) {
    if (el.type === 'entry_door') {
      doors.push({ id: `do-${el.id}`, wallId: 'ext-bottom', point: center(el), widthM: el.width / ppm, kind: 'entry', linkedElementId: el.id, movable: false });
    } else if (el.type === 'room_door') {
      const room = roomOfDoor(elements.filter((r) => ELEMENT_SPECS[r.type]?.category === 'room'), el, DOOR_ROOM_TOL_M * ppm);
      const kind: DoorOpening['kind'] = room?.type === 'bathroom' ? 'bathroom' : room?.type === 'kitchen' ? 'kitchen' : room?.type === 'balcony' ? 'balcony' : 'room';
      doors.push({ id: `do-${el.id}`, wallId: 'inner', point: center(el), widthM: el.width / ppm, kind, linkedElementId: el.id, movable: true });
    }
  }

  const windows = elements
    .filter((el) => el.type === 'window')
    .map((el) => ({ id: `wo-${el.id}`, wallId: 'inner', point: center(el), widthM: el.width / ppm }));

  const zones = elements
    .filter((el) => el.type === 'bathroom' || el.type === 'kitchen')
    .map((el) => {
      const b = aabb(el);
      return { id: `zn-${el.id}`, kind: 'wet' as const, x: b.x, y: b.y, w: b.width, h: b.height, roomId: el.id, movable: false };
    });

  return { walls, doors, windows, zones, loadBearingMarked };
}

/** 门洞位于房间内部或压在其墙线上（带容差） */
function containsCenter(room: PlanElement, el: PlanElement, tolPx = DOOR_ROOM_TOL_M * 75): boolean {
  const b = aabb(room);
  const c = center(el);
  return (
    c.x >= b.x - tolPx &&
    c.x <= b.x + b.width + tolPx &&
    c.y >= b.y - tolPx &&
    c.y <= b.y + b.height + tolPx
  );
}

function cloneStructure(s: StructureModel): StructureModel {
  return {
    walls: s.walls.map((w) => ({ ...w })),
    doors: s.doors.map((d) => ({ ...d })),
    windows: s.windows.map((w) => ({ ...w })),
    zones: s.zones.map((z) => ({ ...z })),
    loadBearingMarked: s.loadBearingMarked,
  };
}

/* ------------------------------------------------------------------ */
/* 几何辅助                                                            */
/* ------------------------------------------------------------------ */

/** 在 a→b 连线中点生成一段垂直于连线的玄关屏风（同时生成对应短墙） */
function makeScreen(a: Point, b: Point, idSeed: string, ppm: number): { element: PlanElement; wall: Wall } {
  const mid = midpoint(a, b);
  const dir = normalize(sub(b, a));
  const perp = { x: -dir.y, y: dir.x };
  const lenM = 1.2;
  const rot = toDeg(Math.atan2(perp.y, perp.x));
  const element: PlanElement = {
    id: `scr-${idSeed}`,
    type: 'screen',
    name: '玄关/屏风',
    x: mid.x,
    y: mid.y,
    width: lenM * ppm,
    height: 0.12 * ppm,
    rotation: rot,
  };
  const half = (lenM / 2) * ppm;
  const wall: Wall = {
    id: `part-${idSeed}`,
    kind: 'partition',
    x1: mid.x - perp.x * half,
    y1: mid.y - perp.y * half,
    x2: mid.x + perp.x * half,
    y2: mid.y + perp.y * half,
    thicknessM: 0.12,
    movable: true,
    adjacentRooms: [null, null],
    hasDoor: false,
    hasWindow: false,
  };
  return { element, wall };
}

/** 把门洞沿垂直方向移位 meters 米，并约束在所在房间内部 */
function shiftDoorInRoom(
  door: PlanElement,
  room: PlanElement | undefined,
  perp: Point,
  meters: number,
  ppm: number,
): { x: number; y: number } | null {
  const from = center(door);
  let next = { x: from.x + perp.x * meters * ppm, y: from.y + perp.y * meters * ppm };
  if (room) {
    const b = aabb(room);
    const inset = 0.25 * ppm;
    next = {
      x: clamp(next.x, b.x + inset, b.x + b.width - inset),
      y: clamp(next.y, b.y + inset, b.y + b.height - inset),
    };
    // 房间需足够宽以容纳移位
    const halfW = Math.min(b.width, b.height) / 2;
    if (halfW < MIN_ROOM_HALF * ppm + door.width / 2) return null;
  }
  if (Math.abs(next.x - from.x) < 1 && Math.abs(next.y - from.y) < 1) return null;
  return next;
}

/* ------------------------------------------------------------------ */
/* 候选方案构建                                                        */
/* ------------------------------------------------------------------ */

interface BuildCtx {
  baseElements: PlanElement[];
  baseResult: ReturnType<typeof analyzePlan>;
  structure: StructureModel;
  options: ContextOptions;
  ppm: number;
  conceptOnly: boolean;
  problemType: ProblemType;
}

function applyElements(base: PlanElement[], mods: PlanModification[]): PlanElement[] {
  let els = base.map((e) => ({ ...e }));
  for (const mod of mods) {
    if (mod.addedElements) els = [...els, ...mod.addedElements.map((e) => ({ ...e }))];
    if (mod.movedElementIds) {
      els = els.map((e) => {
        const mv = mod.movedElementIds!.find((m) => m.id === e.id);
        return mv ? { ...e, x: mv.x, y: mv.y, rotation: mv.rotation ?? e.rotation } : e;
      });
    }
  }
  return els;
}

function applyStructure(structure: StructureModel, mods: PlanModification[]): StructureModel {
  const next = cloneStructure(structure);
  // 收集所有被封堵的门洞 ID
  const sealedIds = new Set<string>();
  for (const mod of mods) {
    if (mod.sealedDoorIds) {
      for (const sid of mod.sealedDoorIds) sealedIds.add(sid);
      next.doors = next.doors.filter((d) => !mod.sealedDoorIds!.includes(d.id));
    }
    if (mod.addedWalls) next.walls = [...next.walls, ...mod.addedWalls.map((w) => ({ ...w }))];
  }
  // 同步门洞元素移位到结构模型；被封堵的门用新 ID 创建（旧门洞已封闭）
  for (const mod of mods) {
    if (mod.movedElementIds) {
      for (const mv of mod.movedElementIds) {
        const oldDoorId = `do-${mv.id}`;
        const wasSealed = sealedIds.has(oldDoorId);
        if (wasSealed) {
          // 旧门洞已封堵，在新位置创建新门洞
          next.doors.push({ id: `${oldDoorId}-relocated`, wallId: 'inner', point: { x: mv.x, y: mv.y }, widthM: 0.9, kind: 'room', linkedElementId: mv.id, movable: true });
        } else {
          const opening = next.doors.find((d) => d.linkedElementId === mv.id);
          if (opening) opening.point = { x: mv.x, y: mv.y };
          else next.doors.push({ id: oldDoorId, wallId: 'inner', point: { x: mv.x, y: mv.y }, widthM: 0.9, kind: 'room', linkedElementId: mv.id, movable: true });
        }
      }
    }
  }
  return next;
}

function validatePlan(
  projectedElements: PlanElement[],
  projectedStructure: StructureModel,
  originalStructure: StructureModel,
  mods: PlanModification[],
  windows: PlanElement[],
): string | null {
  // 1. 外墙与承重墙不可移动
  const sameWall = (a: Wall, b: Wall) =>
    a.kind === b.kind && a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
  for (const kind of ['exterior', 'load-bearing'] as const) {
    const orig = originalStructure.walls.filter((w) => w.kind === kind);
    const proj = projectedStructure.walls.filter((w) => w.kind === kind);
    if (orig.length !== proj.length) {
      return kind === 'exterior' ? '移动了外墙' : '移动了承重墙';
    }
    for (let i = 0; i < orig.length; i += 1) {
      if (!sameWall(orig[i], proj[i])) {
        return kind === 'exterior' ? '移动了外墙' : '移动了承重墙';
      }
    }
  }
  // 2. 新增墙体 / 屏风不得遮挡窗户
  for (const w of windows) {
    const wb = aabb(w);
    for (const mod of mods) {
      for (const sc of mod.addedElements ?? []) {
        if (overlapArea(aabb(sc), wb) > 0) return '遮挡窗户';
      }
    }
  }
  // 3. 房间不得过度重叠
  const rooms = projectedElements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      if (roomsOverlap(rooms[i], rooms[j])) return '造成房间重叠';
    }
  }
  // 4. 所有房间保持连通
  const doors = projectedElements.filter((e) => e.type === 'entry_door' || e.type === 'room_door');
  if (!roomsConnected(rooms, doors, 0.3 * 75)) return '产生不可达房间';
  return null;
}

function overlapArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x) * Math.max(0, y2 - y);
}

function infeasiblePlan(
  id: CandidatePlan['id'],
  title: string,
  reason: string,
  ctx: BuildCtx,
): CandidatePlan {
  const finalRisks = ctx.conceptOnly ? ['未标记承重墙，本方案为概念候选，不可直接施工'] : [];
  return {
    id,
    title,
    problemType: ctx.problemType,
    feasible: false,
    infeasibleReason: reason,
    modifications: [],
    projectedElements: ctx.baseElements.map((e) => ({ ...e })),
    projectedStructure: cloneStructure(ctx.structure),
    originalScore: ctx.baseResult.overall,
    predictedScore: ctx.baseResult.overall,
    predictedCategories: ctx.baseResult.categories,
    solvedIssueKeys: [],
    remainingIssueKeys: ctx.baseResult.issues.map((i) => i.key),
    valueScore: 0,
    changeDegree: 'minimal',
    risks: finalRisks,
    conceptOnly: ctx.conceptOnly,
  };
}

function buildPlan(
  id: CandidatePlan['id'],
  title: string,
  ctx: BuildCtx,
  mods: PlanModification[],
  risks: string[],
): CandidatePlan {
  // 家具自动优化作为基础，再叠加结构改动
  const { elements: furnitureFixed } = applyAllFixesToElements(ctx.baseElements, ctx.options, ctx.ppm);
  const projectedElements = applyElements(furnitureFixed, mods);
  const projectedStructure = applyStructure(ctx.structure, mods);

  const projected = analyzePlan(projectedElements, ctx.options);
  const solved = ctx.baseResult.issues.filter((i) => !projected.issues.some((p) => p.key === i.key));
  const remaining = projected.issues.map((i) => i.key);

  const infeasible = validatePlan(projectedElements, projectedStructure, ctx.structure, mods, ctx.baseElements.filter((e) => e.type === 'window'));

  const movedDoors = mods.reduce((n, m) => n + (m.movedElementIds?.length ?? 0), 0);
  const screens = mods.reduce((n, m) => n + (m.addedElements?.length ?? 0), 0);
  const walls = mods.reduce((n, m) => n + (m.addedWalls?.length ?? 0), 0);
  const solvedPenalty = solved.reduce((s, i) => s + i.appliedPenalty, 0);
  const valueScore = Math.round(solvedPenalty - movedDoors * COST_MOVE - screens * COST_SCREEN - walls * COST_WALL);

  const degree: CandidatePlan['changeDegree'] = mods.length >= 3 ? 'major' : mods.length === 2 ? 'balanced' : 'minimal';

  const finalRisks = [...risks];

  // 说明「为什么分数没有更高」：剩余高风险问题与评分上限
  const remainingHigh = projected.issues.filter((i) => i.severity === 'high');
  const unsolvableHigh = remainingHigh.filter((i) => !PROBLEM_ORDER[i.ruleId]);
  if (unsolvableHigh.length > 0) {
    finalRisks.push(
      '以下高风险问题无法通过门洞 / 隔断调整解决（湿区与承重结构不可移动）：' +
        unsolvableHigh.map((i) => i.name).join('、') +
        '；因此总分被高风险上限压制在 ' +
        String(SCORE_CAP_HIGH) +
        ' 分以内。',
    );
  } else if (remainingHigh.length > 0) {
    finalRisks.push(
      '仍存在 ' + String(remainingHigh.length) + ' 项高风险问题，总分被上限压制在 ' + String(SCORE_CAP_HIGH) + ' 分以内。',
    );
  }

  // 门洞移位风险提示：新位置须现场确认在墙体上，旧门洞须封堵恢复
  const hasDoorRelocation = mods.some((mm) => mm.kind === 'relocate-door' || mm.kind === 'offset-door');
  if (hasDoorRelocation) {
    finalRisks.push(
      '门洞移位为新位置需经现场确认其在非承重墙体上，且新门洞尺寸不超过所在墙段；' +
        '旧门洞需用同材质墙体封堵恢复完整性，不得留有空洞。需建筑师或结构设计师复核。',
    );
  }
  // 新增隔断 / 屏风提示
  const hasPartition = mods.some((mm) => mm.kind === 'add-screen' || mm.kind === 'add-partition' || mm.kind === 'add-node');
  if (hasPartition) {
    finalRisks.push('新增隔断 / 屏风为非承重构件，安装前需确认楼板承载及管线避让，建议由物业确认施工许可。');
  }

  if (ctx.conceptOnly) finalRisks.unshift('未标记承重墙，本方案为概念候选，不可直接施工；需建筑师、结构设计师或物业确认后方可实施');

  return {
    id,
    title,
    problemType: ctx.problemType,
    feasible: infeasible === null,
    infeasibleReason: infeasible ?? undefined,
    modifications: mods,
    projectedElements,
    projectedStructure,
    originalScore: ctx.baseResult.overall,
    predictedScore: projected.overall,
    predictedCategories: projected.categories,
    solvedIssueKeys: solved.map((i) => i.key),
    remainingIssueKeys: remaining,
    valueScore,
    changeDegree: degree,
    risks: finalRisks,
    conceptOnly: ctx.conceptOnly,
  };
}

/* ------------------------------------------------------------------ */
/* 问题分解：每个结构问题给出「最小改动」与「彻底解决」两级改动集         */
/* ------------------------------------------------------------------ */

interface ProblemSolution {
  type: ProblemType;
  /** 最小改动集（成本最低、见效最快） */
  minimal: PlanModification[];
  /** 彻底解决集（改动更大、预期得分更高） */
  full: PlanModification[];
  /** 无法彻底解决时的具体原因 */
  reason?: string;
}

/** 入户门正对卫生间 */
function solveEntryBathroom(ctx: BuildCtx, issue: Issue): ProblemSolution {
  // 处理「入户门正对任一房间门（卫生间门 / 卧室门）」：玄关屏风阻断直视，或移动被正对的门洞
  const empty: ProblemSolution = { type: 'entry-bathroom', minimal: [], full: [] };
  const entry = ctx.baseElements.find((e) => e.type === 'entry_door');
  if (!entry) return { ...empty, reason: '未找到入户门元素，无法定位视线轴线' };

  const rooms = ctx.baseElements.filter((r) => ELEMENT_SPECS[r.type]?.category === 'room');
  const tol = DOOR_ROOM_TOL_M * ctx.ppm;

  // 优先从 elementIds 取房间门；规则有时直接给出房间（如正对卫生间中心），需反查其门
  const targetDoorFromIds = ctx.baseElements.find(
    (e) => e.type === 'room_door' && issue.elementIds.includes(e.id),
  );
  let targetDoor = targetDoorFromIds;
  if (!targetDoor) {
    const roomId = issue.elementIds.find((id) => {
      const el = ctx.baseElements.find((e) => e.id === id);
      return el && ELEMENT_SPECS[el.type]?.category === 'room';
    });
    if (roomId) {
      targetDoor = ctx.baseElements.find(
        (e) => e.type === 'room_door' && roomOfDoor(rooms, e, tol)?.id === roomId,
      );
    }
  }
  if (!targetDoor) return { ...empty, reason: '未找到被入户门正对的房间门，无法生成结构方案' };

  const targetRoom = roomOfDoor(rooms, targetDoor, tol);
  const a = center(entry);
  const b = center(targetDoor);

  // 小房间（较短边不足）无法安全设置玄关屏风，会阻塞通行通道
  const screenFeasible =
    !targetRoom || Math.min(aabb(targetRoom).width, aabb(targetRoom).height) >= MIN_SCREEN_ROOM_M * ctx.ppm;

  let screenMod: PlanModification | null = null;
  if (screenFeasible) {
    const screen = makeScreen(a, b, 'entry-screen', ctx.ppm);
    screenMod = {
      kind: 'add-screen',
      label: '新增玄关屏风',
      description: '在入户门与被正对的房间门之间设置 1.2 米玄关屏风，阻断直视轴线（新增非承重隔断）。',
      addedElements: [screen.element],
      addedWalls: [screen.wall],
    };
  }

  const relocate: PlanModification[] = [];
  if (targetRoom) {
    const perp = perpDir(a, b);
    const next = shiftDoorInRoom(targetDoor, targetRoom, perp, 0.8, ctx.ppm);
    if (next) {
      const from = center(targetDoor);
      relocate.push({
        kind: 'relocate-door',
        label: '房间门洞移位',
        description:
          '将被入户门正对的门移出视线轴线：原门洞 (' +
          Math.round(from.x) + ', ' + Math.round(from.y) +
          ') → 新门洞 (' + Math.round(next.x) + ', ' + Math.round(next.y) +
          ')，原门洞需封闭。',
        movedElementIds: [{ id: targetDoor.id, x: next.x, y: next.y }],
        sealedDoorIds: ['do-' + targetDoor.id],
      });
    }
  }

  const minimal: PlanModification[] = screenMod ? [screenMod] : relocate.length ? [relocate[0]] : [];
  if (minimal.length === 0) {
    return {
      ...empty,
      reason: '房间尺寸不足，没有足够空间设置玄关或移动门洞（不阻塞通道）',
    };
  }

  const full = [...relocate, ...(screenMod ? [screenMod] : [])];
  return {
    type: 'entry-bathroom',
    minimal,
    full: full.length ? full : minimal,
    reason: relocate.length ? undefined : '房间尺寸不足，没有足够墙面移动门洞（仅可做玄关遮挡）',
  };
}
function solveDoorDoor(ctx: BuildCtx, issue: Issue): ProblemSolution {
  const empty: ProblemSolution = { type: 'door-door', minimal: [], full: [] };
  const ids = issue.elementIds;
  const doorA = ctx.baseElements.find((e) => e.id === ids[0] && e.type === 'room_door');
  const doorB = ctx.baseElements.find((e) => e.id === ids[1] && e.type === 'room_door');
  if (!doorA || !doorB) return { ...empty, reason: '未能定位正对的两扇房门' };

  const rooms = ctx.baseElements.filter((r) => ELEMENT_SPECS[r.type]?.category === 'room');
  const tol = DOOR_ROOM_TOL_M * ctx.ppm;
  const roomA = roomOfDoor(rooms, doorA, tol);
  const roomB = roomOfDoor(rooms, doorB, tol);
  const perp = perpDir(center(doorA), center(doorB));

  const nextA = shiftDoorInRoom(doorA, roomA, perp, 0.6, ctx.ppm);
  const nextB = shiftDoorInRoom(doorB, roomB, perp, -0.6, ctx.ppm);

  const mods: PlanModification[] = [];
  if (nextA) {
    const from = center(doorA);
    mods.push({
      kind: 'offset-door',
      label: '房门错位',
      description:
        '将「' + doorA.name + '」沿墙体错开 0.6 米：原门洞 (' +
        Math.round(from.x) + ', ' + Math.round(from.y) +
        ') → 新门洞 (' + Math.round(nextA.x) + ', ' + Math.round(nextA.y) +
        ')，原门洞需封闭。',
      movedElementIds: [{ id: doorA.id, x: nextA.x, y: nextA.y }],
      sealedDoorIds: ['do-' + doorA.id],
    });
  }
  const modsFull = [...mods];
  if (nextB) {
    const from = center(doorB);
    modsFull.push({
      kind: 'offset-door',
      label: '对侧房门错位',
      description:
        '将「' + doorB.name + '」反向错开 0.6 米：原门洞 (' +
        Math.round(from.x) + ', ' + Math.round(from.y) +
        ') → 新门洞 (' + Math.round(nextB.x) + ', ' + Math.round(nextB.y) +
        ')，原门洞需封闭。',
      movedElementIds: [{ id: doorB.id, x: nextB.x, y: nextB.y }],
      sealedDoorIds: ['do-' + doorB.id],
    });
  }

  if (modsFull.length === 0) {
    return {
      ...empty,
      reason: '两侧房间尺寸不足，没有足够墙面移动门洞，且无法安全增设隔断（会阻塞通道）',
    };
  }

  return {
    type: 'door-door',
    minimal: mods.length ? mods : modsFull.slice(0, 1),
    full: modsFull,
  };
}

/** 走廊过长 */
function solveLongCorridor(ctx: BuildCtx, issue: Issue): ProblemSolution {
  const empty: ProblemSolution = { type: 'long-corridor', minimal: [], full: [] };
  const group = issue.elementIds
    .map((id) => ctx.baseElements.find((e) => e.id === id && (e.type === 'room_door' || e.type === 'entry_door')))
    .filter((e): e is PlanElement => Boolean(e));
  if (group.length < 3) return { ...empty, reason: '未能识别构成长走廊的门洞序列' };

  const rooms = ctx.baseElements.filter((r) => ELEMENT_SPECS[r.type]?.category === 'room');
  const tol = DOOR_ROOM_TOL_M * ctx.ppm;
  const sorted = [...group].sort((p, q) => center(p).x + center(p).y - (center(q).x + center(q).y));
  const axisVec = mainAxis(sorted.map(center));
  const perp = { x: -axisVec.y, y: axisVec.x };

  const node = makeScreen(center(sorted[0]), center(sorted[sorted.length - 1]), 'cor-node', ctx.ppm);
  const nodeMod: PlanModification = {
    kind: 'add-node',
    label: '走廊中段分割节点',
    description: '在走廊中段增设玄关柜 / 矮隔断节点，打断过长的直线视线与穿堂气流。',
    addedElements: [node.element],
    addedWalls: [node.wall],
  };

  const movable = sorted.filter((d) => d.type === 'room_door');
  const entryMods: PlanModification[] = [];
  let idx = 0;
  for (const door of movable) {
    if (entryMods.length >= 2) break;
    const room = roomOfDoor(rooms, door, tol);
    const sign = idx % 2 === 0 ? 1 : -1;
    const next = shiftDoorInRoom(door, room, perp, 0.7 * sign, ctx.ppm);
    idx += 1;
    if (!next) continue;
    const from = center(door);
    entryMods.push({
      kind: 'offset-door',
      label: '调整房间入口',
      description:
        '将「' + door.name + '」移出走廊轴线：原门洞 (' +
        Math.round(from.x) + ', ' + Math.round(from.y) +
        ') → 新门洞 (' + Math.round(next.x) + ', ' + Math.round(next.y) +
        ')，原门洞需封闭。',
      movedElementIds: [{ id: door.id, x: next.x, y: next.y }],
      sealedDoorIds: ['do-' + door.id],
    });
  }

  if (entryMods.length === 0) {
    return {
      type: 'long-corridor',
      minimal: [nodeMod],
      full: [nodeMod],
      reason: '沿走廊房间墙面不足，没有足够墙面移动门洞（仅可做走廊节点分割）',
    };
  }

  return {
    type: 'long-corridor',
    minimal: [entryMods[0]],
    full: [...entryMods, nodeMod],
  };
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

const PROBLEM_ORDER: Record<string, ProblemType> = {
  'entry-door-faces-bathroom': 'entry-bathroom',
  'door-faces-door': 'door-door',
  'entry-door-faces-bedroom-door': 'entry-bathroom',
  'long-corridor': 'long-corridor',
};

export function generateCandidatePlans(input: OptimizerInput): OptimizationResult {
  const { elements, options } = input;
  const ppm = options.pixelsPerMeter;
  const base = analyzePlan(elements, options);
  const structure = input.structure ?? buildStructureFromElements(elements, false, ppm);
  const conceptOnly = !structure.loadBearingMarked;

  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  const structural = base.issues
    .filter((i) => Boolean(PROBLEM_ORDER[i.ruleId]))
    .sort(
      (a, b) => severityRank[a.severity] - severityRank[b.severity] || b.appliedPenalty - a.appliedPenalty,
    );

  const primary: ProblemType = structural[0] ? PROBLEM_ORDER[structural[0].ruleId] : 'furniture';

  const ctx: BuildCtx = {
    baseElements: elements,
    baseResult: base,
    structure,
    options,
    ppm,
    conceptOnly,
    problemType: structural.length > 1 ? 'mixed' : primary,
  };

  if (structural.length === 0) {
    return { plans: buildFurnitureOnly(ctx), hasStructuralIssue: false, generatedAt: 0 };
  }

  const solutions: ProblemSolution[] = [];
  const seen = new Set<ProblemType>();
  for (const issue of structural) {
    const type = PROBLEM_ORDER[issue.ruleId];
    if (seen.has(type)) continue;
    seen.add(type);
    const sol =
      type === 'entry-bathroom'
        ? solveEntryBathroom(ctx, issue)
        : type === 'door-door'
          ? solveDoorDoor(ctx, issue)
          : solveLongCorridor(ctx, issue);
    solutions.push(sol);
  }

  const solvable = solutions.filter((s) => s.minimal.length > 0);
  const reasons = solutions
    .filter((s) => s.reason)
    .map((s) => problemLabel(s.type) + '：' + s.reason);

  if (solvable.length === 0) {
    const reason = reasons.length ? reasons.join('；') : '当前户型没有可安全调整的墙体或门洞';
    return {
      plans: [
        infeasiblePlan('A', '方案 A · 最小改动', reason, ctx),
        infeasiblePlan('B', '方案 B · 综合平衡', reason, ctx),
        infeasiblePlan('C', '方案 C · 评分最高', reason, ctx),
      ],
      hasStructuralIssue: true,
      generatedAt: 0,
    };
  }

  // A：仅解决优先级最高问题的最小改动
  const modsA = dedupeMods(solvable[0].minimal);
  // B：优先级最高问题彻底解决 + 次优先问题最小改动
  const modsB = dedupeMods([...solvable[0].full, ...(solvable[1]?.minimal ?? [])]);
  // C：所有问题彻底解决
  const modsC = dedupeMods(solvable.flatMap((s) => s.full));

  const partial = reasons.length ? ['部分问题受结构限制无法彻底解决 —— ' + reasons.join('；')] : [];

  const plans = [
    buildPlan('A', '方案 A · ' + planTitle(solvable[0].type, 'minimal') + '（最小改动）', ctx, modsA, [
      '改动范围最小、造价最低，仅处理优先级最高的结构问题。',
      ...partial,
    ]),
    buildPlan('B', '方案 B · ' + planTitle(solvable[0].type, 'full') + '（综合平衡）', ctx, modsB, [
      '涉及门洞开凿与封堵，需现场确认所在墙体为非承重墙。',
      ...partial,
    ]),
    buildPlan('C', '方案 C · 结构综合调整（评分最高）', ctx, modsC, [
      '改动范围最大、工期与造价最高，建议由结构工程师复核后施工。',
      ...partial,
    ]),
  ];

  return { plans, hasStructuralIssue: true, generatedAt: 0 };
}

function problemLabel(t: ProblemType): string {
  switch (t) {
    case 'entry-bathroom':
      return '入户门正对卫生间';
    case 'door-door':
      return '房门正对房门';
    case 'long-corridor':
      return '走廊过长';
    case 'furniture':
      return '家具布置';
    default:
      return '综合问题';
  }
}

function planTitle(t: ProblemType, level: 'minimal' | 'full'): string {
  if (t === 'entry-bathroom') return level === 'minimal' ? '玄关屏风遮挡' : '卫生间门洞移位 + 玄关';
  if (t === 'door-door') return level === 'minimal' ? '单侧房门错位' : '双侧房门错位';
  if (t === 'long-corridor') return level === 'minimal' ? '调整入口打断走廊' : '入口调整 + 走廊节点';
  return '家具优化';
}

/** 同一元素被多次移动时保留最后一次；同一屏风只加一次 */
function dedupeMods(mods: PlanModification[]): PlanModification[] {
  const out: PlanModification[] = [];
  const addedIds = new Set<string>();
  const movedIds = new Set<string>();
  for (let i = mods.length - 1; i >= 0; i -= 1) {
    const mod = mods[i];
    const addKey = (mod.addedElements ?? []).map((e) => e.id).join(',');
    if (addKey && addedIds.has(addKey)) continue;
    if (addKey) addedIds.add(addKey);
    const mvKey = (mod.movedElementIds ?? []).map((e) => e.id).join(',');
    if (mvKey && movedIds.has(mvKey)) continue;
    if (mvKey) movedIds.add(mvKey);
    out.unshift(mod);
  }
  return out;
}

/* ---- 仅有家具类问题：生成 A/B/C ---- */
function buildFurnitureOnly(ctx: BuildCtx): CandidatePlan[] {
  const { elements: allFixed } = applyAllFixesToElements(ctx.baseElements, ctx.options, ctx.ppm);
  const projected = analyzePlan(allFixed, ctx.options);
  const solved = ctx.baseResult.issues.filter((i) => !projected.issues.some((p) => p.key === i.key));
  const conceptRisk = ctx.conceptOnly ? ['未标记承重墙，本方案为概念候选，不可直接施工'] : [];
  const planA: CandidatePlan = {
    id: 'A',
    title: '方案 A · 家具自动优化（最小改动）',
    problemType: 'furniture',
    feasible: true,
    modifications: [
      {
        kind: 'furniture-fix',
        label: '家具朝向 / 位置修正',
        description: '旋转床与镜子、书桌沙发靠墙布置、拉开灶台与水槽等，不涉及任何结构改动。',
      },
    ],
    projectedElements: allFixed,
    projectedStructure: cloneStructure(ctx.structure),
    originalScore: ctx.baseResult.overall,
    predictedScore: projected.overall,
    predictedCategories: projected.categories,
    solvedIssueKeys: solved.map((i) => i.key),
    remainingIssueKeys: projected.issues.map((i) => i.key),
    valueScore: Math.round(solved.reduce((s, i) => s + i.appliedPenalty, 0)),
    changeDegree: 'minimal',
    risks: conceptRisk,
    conceptOnly: ctx.conceptOnly,
  };
  const note = '当前户型未检测到可通过结构调整解决的问题，本方案与方案 A 内容一致。';
  return [
    planA,
    { ...planA, id: 'B', title: '方案 B · 家具优化（综合平衡）', risks: [...conceptRisk, note] },
    { ...planA, id: 'C', title: '方案 C · 家具优化（评分最高）', risks: [...conceptRisk, note] },
  ];
}

/* ---- 工具 ---- */
function perpDir(a: Point, b: Point): Point {
  const d = normalize(sub(b, a));
  return { x: -d.y, y: d.x };
}

function mainAxis(points: Point[]): Point {
  const a = points[0];
  const b = points[points.length - 1];
  const d = sub(b, a);
  if (Math.abs(d.x) >= Math.abs(d.y)) return { x: Math.sign(d.x) || 1, y: 0 };
  return { x: 0, y: Math.sign(d.y) || 1 };
}
