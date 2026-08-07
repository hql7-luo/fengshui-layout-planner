import { analyzePlan, type ContextOptions } from './rules/engine';
import { applyAllFixesToElements } from './apply-fixes';
import { issueDigest, issueIdentity } from './issue-diff';
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
  corners,
  midpoint,
  normalize,
  roomOfDoor,
  polygonBounds,
  sub,
  toDeg,
} from './geometry';
import { ELEMENT_SPECS } from './element-catalog';
import {
  cloneStructureModel,
  deriveWallsFromRooms,
  movePartitionWall,
  validateStructuralScenario,
} from './structural-geometry';

/**
 * 结构优化器（纯函数、确定性）。
 *
 * 输入当前场景的元素与结构模型，针对检测到的结构问题（入户对卫生间 / 门对门 /
 * 长走廊）生成 A（最小改动）、B（综合平衡）、C（结构综合调整）三套候选方案。
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
const MIN_SCREEN_AXIS_M = 1.4; // 米：入户门与目标过近时不放置屏风，避免堵住门口

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

function projectPointToWall(point: Point, wall: Wall): { point: Point; t: number; distance: number } {
  const vx = wall.x2 - wall.x1;
  const vy = wall.y2 - wall.y1;
  const lengthSquared = vx * vx + vy * vy;
  const rawT = lengthSquared === 0 ? 0 : ((point.x - wall.x1) * vx + (point.y - wall.y1) * vy) / lengthSquared;
  const t = clamp(rawT, 0, 1);
  const projected = { x: wall.x1 + vx * t, y: wall.y1 + vy * t };
  return {
    point: projected,
    t,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

export function isPointOnWall(point: Point, wall: Wall, tolerancePx = 1): boolean {
  return projectPointToWall(point, wall).distance <= tolerancePx;
}

function nearestWall(
  point: Point,
  walls: Wall[],
  allowedKinds: Wall['kind'][],
  tolerancePx: number,
): Wall | undefined {
  return walls
    .filter((wall) => allowedKinds.includes(wall.kind))
    .map((wall) => ({ wall, distance: projectPointToWall(point, wall).distance }))
    .filter((item) => item.distance <= tolerancePx)
    .sort((a, b) => a.distance - b.distance || a.wall.id.localeCompare(b.wall.id))[0]?.wall;
}

/** 由元素推导一个结构模型（用于没有手动绘制墙体时的示意结构） */
export function buildStructureFromElements(
  elements: PlanElement[],
  loadBearingMarked: boolean,
  ppm = 75,
): StructureModel {
  const rooms = elements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
  const derivedWalls = deriveWallsFromRooms(elements).filter((wall) => wall.kind !== 'exterior').map((wall) =>
    loadBearingMarked && wall.kind === 'unknown'
      ? { ...wall, kind: 'partition' as const, movable: true }
      : wall,
  );
  const roomPoints = rooms.flatMap(corners);
  const bounds = roomPoints.length ? polygonBounds(roomPoints) : { x: 0, y: 0, width: 1080, height: 840 };
  // 保留完整外轮廓，覆盖开放过道没有房间矩形贴边的情况；外墙始终不可移动。
  const walls: Wall[] = [
    { id: 'ext-top', kind: 'exterior', x1: bounds.x, y1: bounds.y, x2: bounds.x + bounds.width, y2: bounds.y, thicknessM: 0.2, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
    { id: 'ext-bottom', kind: 'exterior', x1: bounds.x, y1: bounds.y + bounds.height, x2: bounds.x + bounds.width, y2: bounds.y + bounds.height, thicknessM: 0.2, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
    { id: 'ext-left', kind: 'exterior', x1: bounds.x, y1: bounds.y, x2: bounds.x, y2: bounds.y + bounds.height, thicknessM: 0.2, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
    { id: 'ext-right', kind: 'exterior', x1: bounds.x + bounds.width, y1: bounds.y, x2: bounds.x + bounds.width, y2: bounds.y + bounds.height, thicknessM: 0.2, movable: false, adjacentRooms: [null, null], hasDoor: false, hasWindow: false },
    ...derivedWalls,
  ];

  const doors: DoorOpening[] = [];
  for (const el of elements) {
    if (el.type === 'entry_door') {
      // 凹形户型的真实外边界不一定落在整体包围盒四边；匹配最近房间边线，
      // 再由 opening.movable=false 保证入户门不会被自动调整。
      const wall = nearestWall(center(el), walls, ['exterior', 'partition', 'unknown'], DOOR_ROOM_TOL_M * ppm);
      doors.push({ id: `do-${el.id}`, wallId: wall?.id ?? `unassigned-${el.id}`, point: wall ? projectPointToWall(center(el), wall).point : center(el), widthM: el.width / ppm, kind: 'entry', linkedElementId: el.id, movable: false });
    } else if (el.type === 'room_door') {
      const room = roomOfDoor(rooms, el, DOOR_ROOM_TOL_M * ppm);
      const kind: DoorOpening['kind'] = room?.type === 'bathroom' ? 'bathroom' : room?.type === 'kitchen' ? 'kitchen' : room?.type === 'balcony' ? 'balcony' : 'room';
      const roomWalls = room
        ? walls.filter((wall) => wall.adjacentRooms.includes(room.id))
        : walls.filter((wall) => wall.kind === 'partition' || wall.kind === 'unknown');
      const wall = nearestWall(center(el), roomWalls, ['partition', 'unknown'], DOOR_ROOM_TOL_M * ppm);
      doors.push({ id: `do-${el.id}`, wallId: wall?.id ?? `unassigned-${el.id}`, point: wall ? projectPointToWall(center(el), wall).point : center(el), widthM: el.width / ppm, kind, linkedElementId: el.id, movable: wall?.kind === 'partition' });
    }
  }

  const windows = elements
    .filter((el) => el.type === 'window')
    .map((el) => {
      const wall = nearestWall(center(el), walls, ['exterior', 'partition', 'unknown'], DOOR_ROOM_TOL_M * ppm);
      return { id: `wo-${el.id}`, wallId: wall?.id ?? `unassigned-${el.id}`, point: wall ? projectPointToWall(center(el), wall).point : center(el), widthM: el.width / ppm, linkedElementId: el.id };
    });

  for (const door of doors) {
    const wall = walls.find((item) => item.id === door.wallId);
    if (wall) wall.hasDoor = true;
  }
  for (const window of windows) {
    const wall = walls.find((item) => item.id === window.wallId);
    if (wall) wall.hasWindow = true;
  }

  const zones = elements
    .filter((el) => el.type === 'bathroom' || el.type === 'kitchen')
    .map((el) => {
      const b = aabb(el);
      return { id: `zn-${el.id}`, kind: 'wet' as const, x: b.x, y: b.y, w: b.width, h: b.height, roomId: el.id, movable: false };
    });

  return { walls, doors, windows, zones, loadBearingMarked };
}

function cloneStructure(s: StructureModel): StructureModel {
  return cloneStructureModel(s);
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

/** 把门洞沿其真实依附墙段移位，并为失败返回可展示的具体原因。 */
function shiftDoorOnWall(
  door: PlanElement,
  structure: StructureModel,
  meters: number,
  ppm: number,
): { position?: { x: number; y: number }; reason?: string } {
  const opening = structure.doors.find((item) => item.linkedElementId === door.id);
  if (!opening) return { reason: `门洞「${door.name}」缺少结构关联` };
  const wall = structure.walls.find((item) => item.id === opening.wallId);
  if (!wall) return { reason: `门洞「${door.name}」未依附有效墙体` };
  if (!opening.movable || !wall.movable || wall.kind !== 'partition') {
    return { reason: `门洞「${door.name}」所在墙体不可移动或不是非承重隔墙` };
  }

  const lengthPx = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const endClearance = door.width / 2 + 0.15 * ppm;
  if (lengthPx <= endClearance * 2 + Math.abs(meters) * ppm) {
    return { reason: `门洞「${door.name}」所在墙段长度不足，无法保留洞口与墙端安全距离` };
  }

  const projection = projectPointToWall(opening.point, wall);
  const minT = endClearance / lengthPx;
  const nextT = clamp(projection.t + (meters * ppm) / lengthPx, minT, 1 - minT);
  const next = {
    x: wall.x1 + (wall.x2 - wall.x1) * nextT,
    y: wall.y1 + (wall.y2 - wall.y1) * nextT,
  };
  if (Math.hypot(next.x - opening.point.x, next.y - opening.point.y) < 0.25 * ppm) {
    return { reason: `门洞「${door.name}」靠近墙端，没有足够墙面完成有效错位` };
  }
  return { position: next };
}

function wallMoveModification(
  ctx: BuildCtx,
  preferredRoomIds: string[],
  distanceM: number,
): { modification?: PlanModification; reason?: string } {
  const preferred = new Set(preferredRoomIds);
  const sharedWalls = ctx.structure.walls
    .filter((wall) => wall.adjacentRooms[0] && wall.adjacentRooms[1])
    .sort((a, b) => {
      const score = (wall: Wall) => wall.adjacentRooms.filter((roomId) => roomId && preferred.has(roomId)).length;
      return score(b) - score(a) || a.id.localeCompare(b.id);
    });
  const partitions = sharedWalls.filter((wall) => wall.kind === 'partition' && wall.movable);
  if (!partitions.length) {
    const protectedWall = sharedWalls.find((wall) => wall.kind !== 'partition');
    if (protectedWall?.kind === 'unknown') {
      return { reason: `相关共享墙「${protectedWall.id}」属性为未知；只有用户明确标记为非承重墙后才可自动移动` };
    }
    if (protectedWall?.kind === 'load-bearing') return { reason: `相关共享墙「${protectedWall.id}」为承重墙，不可自动移动` };
    if (protectedWall?.kind === 'exterior') return { reason: '相关墙段属于外墙，不可移动' };
    return { reason: '未找到同时连接两个房间的可移动非承重墙' };
  }
  const failures: string[] = [];
  for (const wall of partitions) {
    for (const signedDistance of [distanceM, -distanceM]) {
      const moved = movePartitionWall(ctx.baseElements, ctx.structure, wall.id, signedDistance, ctx.ppm);
      if (!moved.feasible || !moved.wallMove) {
        if (moved.reason) failures.push(moved.reason);
        continue;
      }
      const direction = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1) ? '垂直' : '水平';
      const areaSummary = moved.roomAreaChanges
        .map((change) => `${change.roomName} ${change.deltaM2 >= 0 ? '+' : ''}${change.deltaM2.toFixed(2)}㎡`)
        .join('，');
      return {
        modification: {
          kind: 'move-wall',
          label: '移动非承重墙',
          description: `将共享墙「${wall.id}」${direction}平移 ${Math.abs(signedDistance).toFixed(2)} 米；${areaSummary}。墙上门窗与端部连接段同步更新。`,
          movedWalls: [moved.wallMove],
          roomAreaChanges: moved.roomAreaChanges,
        },
      };
    }
  }
  return { reason: [...new Set(failures)].slice(0, 3).join('；') || '非承重墙在允许距离内没有满足面积、通道和连通性约束的位置' };
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
  let els = base.map((e) => ({ ...e, polygon: e.polygon?.map((point) => ({ ...point })) }));
  for (const mod of mods) {
    if (mod.addedElements) els = [...els, ...mod.addedElements.map((e) => ({ ...e, polygon: e.polygon?.map((point) => ({ ...point })) }))];
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
  const originalDoors = structure.doors.map((door) => ({ ...door }));
  // 收集所有被封堵的门洞 ID
  const sealedIds = new Set<string>();
  for (const mod of mods) {
    if (mod.sealedDoorIds) {
      for (const sid of mod.sealedDoorIds) sealedIds.add(sid);
      next.doors = next.doors.filter((d) => !mod.sealedDoorIds!.includes(d.id));
    }
    if (mod.addedWalls) next.walls = [
      ...next.walls,
      ...mod.addedWalls.map((w) => ({
        ...w,
        adjacentRooms: [...w.adjacentRooms] as [string | null, string | null],
      })),
    ];
  }
  // 同步门洞元素移位到结构模型；墙体本身保持连续，旧 opening 移除后在同一墙段创建新 opening。
  for (const mod of mods) {
    if (mod.movedElementIds) {
      for (const mv of mod.movedElementIds) {
        const oldDoorId = `do-${mv.id}`;
        const wasSealed = sealedIds.has(oldDoorId);
        if (wasSealed) {
          const original = originalDoors.find((door) => door.id === oldDoorId || door.linkedElementId === mv.id);
          if (!original) continue;
          next.doors.push({
            ...original,
            id: `${oldDoorId}-relocated`,
            point: { x: mv.x, y: mv.y },
          });
        } else {
          const opening = next.doors.find((d) => d.linkedElementId === mv.id);
          if (opening) opening.point = { x: mv.x, y: mv.y };
        }
      }
    }
  }
  return next;
}

function applyPlanModifications(
  baseElements: PlanElement[],
  structure: StructureModel,
  mods: PlanModification[],
  ppm: number,
): { elements: PlanElement[]; structure: StructureModel; reason?: string } {
  let elements = applyElements(baseElements, mods);
  let projectedStructure = applyStructure(structure, mods);
  for (const movedWall of mods.flatMap((modification) => modification.movedWalls ?? [])) {
    const result = movePartitionWall(elements, projectedStructure, movedWall.wallId, movedWall.distanceM, ppm);
    if (!result.feasible) {
      return { elements, structure: projectedStructure, reason: result.reason ?? '墙体移动没有可行几何解' };
    }
    elements = result.elements;
    projectedStructure = result.structure;
  }
  return { elements, structure: projectedStructure };
}

function validatePlan(
  projectedElements: PlanElement[],
  projectedStructure: StructureModel,
  originalStructure: StructureModel,
  mods: PlanModification[],
  windows: PlanElement[],
  ppm: number,
): string | null {
  // 1. 外墙、承重墙与 unknown 墙不可移动；按稳定 id 比对，新增连接段不影响检查。
  const sameWall = (a: Wall, b: Wall) =>
    a.kind === b.kind && a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
  for (const kind of ['exterior', 'load-bearing', 'unknown'] as const) {
    const orig = originalStructure.walls.filter((w) => w.kind === kind);
    for (const original of orig) {
      const projected = projectedStructure.walls.find((wall) => wall.id === original.id);
      if (!projected || !sameWall(original, projected)) {
        return kind === 'exterior' ? '移动了外墙' : kind === 'load-bearing' ? '移动了承重墙' : '移动了未知属性墙体';
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
  // 3. 所有门窗 opening 必须依附真实墙段，且结构点与画布元素同步
  const movedIds = new Set(mods.flatMap((modification) => modification.movedElementIds?.map((move) => move.id) ?? []));
  for (const opening of projectedStructure.doors) {
    const wall = projectedStructure.walls.find((item) => item.id === opening.wallId);
    if (!wall) return `门洞「${opening.id}」未依附有效墙体`;
    if (!isPointOnWall(opening.point, wall, 0.03 * ppm)) {
      return `门洞「${opening.id}」偏离所属墙体`;
    }
    if (opening.linkedElementId) {
      const element = projectedElements.find((item) => item.id === opening.linkedElementId);
      const tolerance = movedIds.has(opening.linkedElementId) ? 0.05 * ppm : DOOR_ROOM_TOL_M * ppm;
      if (!element || Math.hypot(element.x - opening.point.x, element.y - opening.point.y) > tolerance) {
        return `门洞「${opening.id}」与画布标记不同步`;
      }
    }
  }
  for (const opening of projectedStructure.windows) {
    const wall = projectedStructure.walls.find((item) => item.id === opening.wallId);
    if (!wall) return `窗洞「${opening.id}」未依附有效墙体`;
    if (!isPointOnWall(opening.point, wall, 0.03 * ppm)) return `窗洞「${opening.id}」偏离所属墙体`;
  }

  // 4. polygon、面积、房间重叠、湿区、通道宽度、门窗和主要房间可达性统一校验。
  return validateStructuralScenario(projectedElements, projectedStructure, ppm);
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
  const finalRisks = ctx.conceptOnly
    ? ['未完成墙体属性确认，本方案为概念候选，不可直接施工；需建筑师、结构设计师或物业确认']
    : [];
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
    solvedIssues: [],
    introducedIssues: [],
    valueScore: 0,
    changeDegree: 'minimal',
    changeCost: 0,
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
  const applied = applyPlanModifications(furnitureFixed, ctx.structure, mods, ctx.ppm);
  const projectedElements = applied.elements;
  const projectedStructure = applied.structure;

  const projected = analyzePlan(projectedElements, ctx.options);
  const baseIdentities = new Set(ctx.baseResult.issues.map(issueIdentity));
  const projectedIdentities = new Set(projected.issues.map(issueIdentity));
  const solved = ctx.baseResult.issues.filter((issue) => !projectedIdentities.has(issueIdentity(issue)));
  const introduced = projected.issues.filter((issue) => !baseIdentities.has(issueIdentity(issue)));
  const remaining = projected.issues.map((i) => i.key);

  let infeasible = applied.reason ?? validatePlan(
    projectedElements,
    projectedStructure,
    ctx.structure,
    mods,
    ctx.baseElements.filter((e) => e.type === 'window'),
    ctx.ppm,
  );
  if (!infeasible && introduced.some((issue) => issue.severity === 'high')) {
    infeasible = `方案会新增高风险问题：${introduced
      .filter((issue) => issue.severity === 'high')
      .map((issue) => issue.name)
      .join('、')}`;
  }
  if (!infeasible && projected.rawOverall < ctx.baseResult.rawOverall) {
    infeasible = `方案会使五维原始评分下降 ${ctx.baseResult.rawOverall - projected.rawOverall} 分`;
  }

  const movedDoors = mods.reduce((n, m) => n + (m.movedElementIds?.length ?? 0), 0);
  const screens = mods.reduce((n, m) => n + (m.addedElements?.length ?? 0), 0);
  const walls = mods.reduce((n, m) => n + (m.addedWalls?.length ?? 0), 0);
  const movedWalls = mods.reduce((n, m) => n + (m.movedWalls?.length ?? 0), 0);
  const wallDistanceCost = mods.reduce(
    (sum, modification) => sum + (modification.movedWalls ?? []).reduce(
      (inner, move) => inner + Math.ceil(Math.abs(move.distanceM) * 10),
      0,
    ),
    0,
  );
  const solvedPenalty = solved.reduce((s, i) => s + i.appliedPenalty, 0);
  const introducedPenalty = introduced.reduce((sum, issue) => sum + issue.appliedPenalty, 0);
  const valueScore = Math.round(
    solvedPenalty - introducedPenalty - movedDoors * COST_MOVE - screens * COST_SCREEN - walls * COST_WALL - movedWalls * 7 - wallDistanceCost,
  );

  const changeCost = movedDoors * COST_MOVE + screens * COST_SCREEN + walls * COST_WALL + movedWalls * 7 + wallDistanceCost;

  const maximumWallDistance = Math.max(
    0,
    ...mods.flatMap((modification) => modification.movedWalls?.map((move) => Math.abs(move.distanceM)) ?? []),
  );
  const degree: CandidatePlan['changeDegree'] = id === 'A'
    ? 'minimal'
    : id === 'B'
      ? 'balanced'
      : maximumWallDistance >= 0.45 || mods.length >= 2
        ? 'major'
        : 'balanced';

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
  if (movedWalls > 0) {
    finalRisks.push('非承重墙平移已通过本模型的几何与连通性约束，但不构成施工依据；开工前须复核墙内管线、防水、消防、楼板与物业许可。');
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
    solvedIssues: solved.map(issueDigest),
    introducedIssues: introduced.map(issueDigest),
    valueScore,
    changeDegree: degree,
    changeCost,
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
  /** 方案 B 使用的小范围墙体平移 */
  balancedWall?: PlanModification;
  /** 方案 C 使用的更明显、仍在安全搜索范围内的墙体平移 */
  maximumWall?: PlanModification;
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

  const a = center(entry);
  const b = center(targetDoor);

  // 两门距离过近时不强行放屏风，避免直接堵住门口。
  const screenFeasible = Math.hypot(b.x - a.x, b.y - a.y) >= MIN_SCREEN_AXIS_M * ctx.ppm;

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
  const shiftForward = shiftDoorOnWall(targetDoor, ctx.structure, 0.8, ctx.ppm);
  const shift = shiftForward.position
    ? shiftForward
    : shiftDoorOnWall(targetDoor, ctx.structure, -0.8, ctx.ppm);
  if (shift.position) {
      const next = shift.position;
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

  const minimal: PlanModification[] = screenMod ? [screenMod] : relocate.length ? [relocate[0]] : [];
  if (minimal.length === 0) {
    return {
      ...empty,
      reason: '房间尺寸不足，没有足够空间设置玄关或移动门洞（不阻塞通道）',
    };
  }

  const full = [...relocate, ...(screenMod ? [screenMod] : [])];
  const preferredRoomIds = issue.elementIds.filter((id) => rooms.some((room) => room.id === id));
  const balancedWall = wallMoveModification(ctx, preferredRoomIds, 0.3);
  const maximumWall = wallMoveModification(ctx, preferredRoomIds, 0.5);
  return {
    type: 'entry-bathroom',
    minimal,
    full: full.length ? full : minimal,
    balancedWall: balancedWall.modification,
    maximumWall: maximumWall.modification,
    reason: [
      relocate.length ? null : `${shift.reason ?? shiftForward.reason ?? '没有足够墙面移动门洞'}（仅可做玄关遮挡）`,
      maximumWall.reason ? `墙体调整：${maximumWall.reason}` : null,
    ].filter(Boolean).join('；') || undefined,
  };
}
function solveDoorDoor(ctx: BuildCtx, issue: Issue): ProblemSolution {
  const empty: ProblemSolution = { type: 'door-door', minimal: [], full: [] };
  const ids = issue.elementIds;
  const doorA = ctx.baseElements.find((e) => e.id === ids[0] && e.type === 'room_door');
  const doorB = ctx.baseElements.find((e) => e.id === ids[1] && e.type === 'room_door');
  if (!doorA || !doorB) return { ...empty, reason: '未能定位正对的两扇房门' };

  const shiftA = shiftDoorOnWall(doorA, ctx.structure, 0.6, ctx.ppm);
  const shiftB = shiftDoorOnWall(doorB, ctx.structure, -0.6, ctx.ppm);
  const nextA = shiftA.position;
  const nextB = shiftB.position;

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
      reason: [shiftA.reason, shiftB.reason].filter(Boolean).join('；') || '两侧门洞没有足够墙面完成错位',
    };
  }

  const rooms = ctx.baseElements.filter((room) => ELEMENT_SPECS[room.type]?.category === 'room');
  const preferredRoomIds = [doorA, doorB]
    .map((door) => roomOfDoor(rooms, door, DOOR_ROOM_TOL_M * ctx.ppm)?.id)
    .filter((id): id is string => Boolean(id));
  const balancedWall = wallMoveModification(ctx, preferredRoomIds, 0.25);
  const maximumWall = wallMoveModification(ctx, preferredRoomIds, 0.45);

  return {
    type: 'door-door',
    minimal: mods.length ? mods : modsFull.slice(0, 1),
    full: modsFull,
    balancedWall: balancedWall.modification,
    maximumWall: maximumWall.modification,
    reason: maximumWall.reason ? `墙体调整：${maximumWall.reason}` : undefined,
  };
}

/** 走廊过长 */
function solveLongCorridor(ctx: BuildCtx, issue: Issue): ProblemSolution {
  const empty: ProblemSolution = { type: 'long-corridor', minimal: [], full: [] };
  const group = issue.elementIds
    .map((id) => ctx.baseElements.find((e) => e.id === id && (e.type === 'room_door' || e.type === 'entry_door')))
    .filter((e): e is PlanElement => Boolean(e));
  if (group.length < 3) return { ...empty, reason: '未能识别构成长走廊的门洞序列' };

  const sorted = [...group].sort((p, q) => center(p).x + center(p).y - (center(q).x + center(q).y));

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
  const shiftReasons: string[] = [];
  let idx = 0;
  for (const door of movable) {
    if (entryMods.length >= 2) break;
    const sign = idx % 2 === 0 ? 1 : -1;
    const attempt = shiftDoorOnWall(door, ctx.structure, 0.7 * sign, ctx.ppm);
    const next = attempt.position;
    idx += 1;
    if (!next) {
      if (attempt.reason) shiftReasons.push(attempt.reason);
      continue;
    }
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

  const rooms = ctx.baseElements.filter((room) => ELEMENT_SPECS[room.type]?.category === 'room');
  const preferredRoomIds = movable
    .map((door) => roomOfDoor(rooms, door, DOOR_ROOM_TOL_M * ctx.ppm)?.id)
    .filter((id): id is string => Boolean(id));
  const balancedWall = wallMoveModification(ctx, preferredRoomIds, 0.3);
  const maximumWall = wallMoveModification(ctx, preferredRoomIds, 0.55);

  if (entryMods.length === 0) {
    return {
      type: 'long-corridor',
      minimal: [nodeMod],
      full: [nodeMod],
      balancedWall: balancedWall.modification,
      maximumWall: maximumWall.modification,
      reason: [
        `${shiftReasons.join('；') || '沿走廊房间墙面不足'}（仅可做走廊节点分割）`,
        maximumWall.reason ? `墙体调整：${maximumWall.reason}` : null,
      ].filter(Boolean).join('；'),
    };
  }

  return {
    type: 'long-corridor',
    minimal: [entryMods[0]],
    full: [...entryMods, nodeMod],
    balancedWall: balancedWall.modification,
    maximumWall: maximumWall.modification,
    reason: maximumWall.reason ? `墙体调整：${maximumWall.reason}` : undefined,
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
        infeasiblePlan('C', '方案 C · 结构综合调整', reason, ctx),
      ],
      hasStructuralIssue: true,
      generatedAt: 0,
    };
  }

  // A：仅解决优先级最高问题的最小改动
  const modsA = dedupeMods(solvable[0].minimal);
  // B：优先级最高问题彻底解决 + 小范围共享墙平移 + 次优先问题最小改动
  const modsB = dedupeMods([
    ...solvable[0].full,
    ...(solvable[0].balancedWall ? [solvable[0].balancedWall] : []),
    ...(solvable[1]?.minimal ?? []),
  ]);
  // C：所有问题彻底解决 + 更大但仍通过安全搜索的墙体平移
  const modsC = dedupeMods([
    ...solvable.flatMap((solution) => solution.full),
    ...solvable.flatMap((solution) => solution.maximumWall ? [solution.maximumWall] : []),
  ]);
  const modsCSafe = dedupeMods([
    ...solvable[0].full,
    ...(solvable[0].maximumWall ? [solvable[0].maximumWall] : []),
    ...solvable.slice(1).flatMap((solution) => solution.minimal),
  ]);
  const modsCStructural = dedupeMods([
    ...solvable[0].minimal,
    ...(solvable[0].maximumWall ? [solvable[0].maximumWall] : []),
  ]);

  const partial = reasons.length ? ['部分问题受结构限制无法彻底解决 —— ' + reasons.join('；')] : [];

  const planA = buildPlan('A', '方案 A · ' + planTitle(solvable[0].type, 'minimal') + '（最小改动）', ctx, modsA, [
      '改动范围最小、造价最低，仅处理优先级最高的结构问题。',
      ...partial,
    ]);
  const planB = buildPlan('B', '方案 B · ' + planTitle(solvable[0].type, 'full') + '（综合平衡）', ctx, modsB, [
      '涉及门洞开凿与封堵，需现场确认所在墙体为非承重墙。',
      ...partial,
    ]);
  const cRisks = [
      '改动范围最大、工期与造价最高，建议由结构工程师复核后施工。',
      ...partial,
  ];
  const cVariants = [modsC, modsCSafe, modsCStructural]
    .filter((mods, index, list) => list.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(mods)) === index)
    .map((mods) => buildPlan('C', '方案 C · 评分最高结构调整', ctx, mods, cRisks));
  const planC = [...cVariants].sort((a, b) =>
    Number(b.feasible) - Number(a.feasible) ||
    b.predictedScore - a.predictedScore ||
    b.solvedIssues.length - a.solvedIssues.length ||
    b.valueScore - a.valueScore,
  )[0];
  const plans: CandidatePlan[] = [planA, planB, planC];

  // 不用重复方案凑数：若约束下 B/C 与更低成本方案完全相同，明确返回 no-feasible-plan 原因。
  for (let index = 1; index < plans.length; index += 1) {
    const duplicate = plans.slice(0, index).find(
      (candidate) => candidate.feasible && JSON.stringify(candidate.modifications) === JSON.stringify(plans[index].modifications),
    );
    if (plans[index].feasible && duplicate) {
      plans[index] = infeasiblePlan(
        plans[index].id,
        plans[index].title,
        `no-feasible-plan：当前已标记墙体与安全约束下，无法生成区别于方案 ${duplicate.id} 的额外结构改动`,
        ctx,
      );
    }
  }

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
  const movedWallIds = new Set<string>();
  for (let i = mods.length - 1; i >= 0; i -= 1) {
    const mod = mods[i];
    const addKey = (mod.addedElements ?? []).map((e) => e.id).join(',');
    if (addKey && addedIds.has(addKey)) continue;
    if (addKey) addedIds.add(addKey);
    const mvKey = (mod.movedElementIds ?? []).map((e) => e.id).join(',');
    if (mvKey && movedIds.has(mvKey)) continue;
    if (mvKey) movedIds.add(mvKey);
    const wallKey = (mod.movedWalls ?? []).map((wall) => wall.wallId).join(',');
    if (wallKey && movedWallIds.has(wallKey)) continue;
    if (wallKey) movedWallIds.add(wallKey);
    out.unshift(mod);
  }
  return out;
}

/* ---- 仅有家具类问题：生成 A/B/C ---- */
function buildFurnitureOnly(ctx: BuildCtx): CandidatePlan[] {
  const { elements: allFixed } = applyAllFixesToElements(ctx.baseElements, ctx.options, ctx.ppm);
  const projected = analyzePlan(allFixed, ctx.options);
  const baseIdentities = new Set(ctx.baseResult.issues.map(issueIdentity));
  const projectedIdentities = new Set(projected.issues.map(issueIdentity));
  const solved = ctx.baseResult.issues.filter((issue) => !projectedIdentities.has(issueIdentity(issue)));
  const introduced = projected.issues.filter((issue) => !baseIdentities.has(issueIdentity(issue)));
  const conceptRisk: string[] = [];
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
    solvedIssues: solved.map(issueDigest),
    introducedIssues: introduced.map(issueDigest),
    valueScore: Math.round(solved.reduce((s, i) => s + i.appliedPenalty, 0)),
    changeDegree: 'minimal',
    changeCost: 0,
    risks: conceptRisk,
    conceptOnly: false,
  };
  const note = '当前户型未检测到可通过结构调整解决的问题，本方案与方案 A 内容一致。';
  return [
    planA,
    { ...planA, id: 'B', title: '方案 B · 家具优化（综合平衡）', risks: [...conceptRisk, note] },
    { ...planA, id: 'C', title: '方案 C · 家具优化（完整建议）', risks: [...conceptRisk, note] },
  ];
}

/* ---- 工具 ---- */
