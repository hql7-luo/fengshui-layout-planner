import { specOf } from './element-catalog';
import type { BBox, PlanElement, Point } from './types';

export const DEG = Math.PI / 180;

export function toRad(deg: number): number {
  return deg * DEG;
}

export function toDeg(rad: number): number {
  return rad / DEG;
}

/** 归一化到 [0, 360) */
export function normalizeDeg(deg: number): number {
  const v = deg % 360;
  return v < 0 ? v + 360 : v;
}

export function center(el: PlanElement): Point {
  return { x: el.x, y: el.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scaleVec(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}

export function length(a: Point): number {
  return Math.hypot(a.x, a.y);
}

export function normalize(a: Point): Point {
  const l = length(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 局部坐标绕原点顺时针旋转 rotation 度后的世界向量 */
export function rotateVec(v: Point, rotationDeg: number): Point {
  const r = toRad(rotationDeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** 元素局部 +Y 方向（即「正面」朝向）的单位向量 */
export function facingVector(el: PlanElement): Point {
  return rotateVec({ x: 0, y: 1 }, el.rotation);
}

/** 元素局部 +X 方向的单位向量 */
export function lateralVector(el: PlanElement): Point {
  return rotateVec({ x: 1, y: 0 }, el.rotation);
}

/** 元素背面中点（局部 -Y 边中点） */
export function backMidpoint(el: PlanElement): Point {
  return add(center(el), rotateVec({ x: 0, y: -el.height / 2 }, el.rotation));
}

/** 元素正面中点（局部 +Y 边中点） */
export function frontMidpoint(el: PlanElement): Point {
  return add(center(el), rotateVec({ x: 0, y: el.height / 2 }, el.rotation));
}

/** 旋转矩形的四个角点，顺序为左上、右上、右下、左下（局部坐标系） */
export function corners(el: PlanElement): Point[] {
  if (el.polygon && el.polygon.length >= 3) {
    return el.polygon.map((point) => ({ ...point }));
  }
  const hw = el.width / 2;
  const hh = el.height / 2;
  const local: Point[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => add(center(el), rotateVec(p, el.rotation)));
}

/** 旋转矩形的轴对齐包围盒 */
export function aabb(el: PlanElement): BBox {
  const pts = corners(el);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function bboxCenter(b: BBox): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function unionBBox(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function bboxArea(b: BBox): number {
  return Math.max(0, b.width) * Math.max(0, b.height);
}

export function intersectBBox(a: BBox, b: BBox): BBox {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, x2 - x), height: Math.max(0, y2 - y) };
}

/** 两个轴对齐包围盒之间的最小间距（重叠时为 0） */
export function bboxGap(a: BBox, b: BBox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

export function elementGap(a: PlanElement, b: PlanElement): number {
  return bboxGap(aabb(a), aabb(b));
}

export function distance(a: PlanElement, b: PlanElement): number {
  return length(sub(center(b), center(a)));
}

/** 点是否落在（可旋转的）矩形内部 */
export function containsPoint(el: PlanElement, p: Point): boolean {
  if (el.polygon && el.polygon.length >= 3) return pointInPolygon(p, el.polygon);
  const d = sub(p, center(el));
  const local = rotateVec(d, -el.rotation);
  return Math.abs(local.x) <= el.width / 2 + 1e-6 && Math.abs(local.y) <= el.height / 2 + 1e-6;
}

export function containsElement(container: PlanElement, el: PlanElement): boolean {
  return containsPoint(container, center(el));
}

/** 点到（可旋转）矩形四条边的最短距离，点在内部时返回到最近边的距离 */
export function distanceToBoundary(el: PlanElement, p: Point): number {
  if (el.polygon && el.polygon.length >= 3) {
    let best = Infinity;
    for (let i = 0; i < el.polygon.length; i += 1) {
      best = Math.min(best, pointToSegmentDistance(p, el.polygon[i], el.polygon[(i + 1) % el.polygon.length]));
    }
    return best;
  }
  const d = sub(p, center(el));
  const local = rotateVec(d, -el.rotation);
  const hw = el.width / 2;
  const hh = el.height / 2;
  const inside = Math.abs(local.x) <= hw && Math.abs(local.y) <= hh;
  if (inside) {
    return Math.min(hw - Math.abs(local.x), hh - Math.abs(local.y));
  }
  const dx = Math.max(Math.abs(local.x) - hw, 0);
  const dy = Math.max(Math.abs(local.y) - hh, 0);
  return Math.hypot(dx, dy);
}

export interface FacingResult {
  facing: boolean;
  /** 目标方向与朝向轴的夹角（度） */
  angle: number;
  /** 中心距（像素） */
  distance: number;
  /** 目标中心到朝向射线的横向偏移（像素） */
  lateral: number;
}

export interface FacingOptions {
  /** 最大夹角（度） */
  maxAngle?: number;
  /** 最大中心距（像素） */
  maxDistance?: number;
  /** 最大横向偏移（像素） */
  maxLateral?: number;
}

/**
 * 判断 a 是否「正对」b。
 * - 门窗（facing = 'bi'）取正反两个方向；
 * - 床/沙发/镜子等（facing = 'uni'）只取正面方向；
 * - facing = 'none' 的元素恒不成立。
 */
export function facingCheck(
  a: PlanElement,
  b: PlanElement,
  options: FacingOptions = {},
): FacingResult {
  const { maxAngle = 22, maxDistance = Infinity, maxLateral = Infinity } = options;
  const mode = specOf(a.type).facing;
  const delta = sub(center(b), center(a));
  const dist = length(delta);
  if (mode === 'none' || dist === 0) {
    return { facing: false, angle: 180, distance: dist, lateral: dist };
  }
  const u = normalize(delta);
  const n = facingVector(a);
  let d = dot(u, n);
  if (mode === 'bi') d = Math.abs(d);
  const angle = toDeg(Math.acos(clamp(d, -1, 1)));
  const lateral = dist * Math.sin(toRad(angle));
  const facing = angle <= maxAngle && dist <= maxDistance && lateral <= maxLateral;
  return { facing, angle, distance: dist, lateral };
}

/** a 与 b 互相正对（常用于门对门） */
export function mutuallyFacing(
  a: PlanElement,
  b: PlanElement,
  options: FacingOptions = {},
): boolean {
  return facingCheck(a, b, options).facing && facingCheck(b, a, options).facing;
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const COMPASS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const;

/**
 * 把画布向量换算成方位名称。
 * northAngle 表示正北方向相对画布正上方的顺时针夹角。
 */
export function compassOf(vec: Point, northAngle: number): string {
  if (vec.x === 0 && vec.y === 0) return '中心';
  // 画布正上方为 -Y，方位角 = atan2(x, -y)
  const screenBearing = normalizeDeg(toDeg(Math.atan2(vec.x, -vec.y)));
  const bearing = normalizeDeg(screenBearing - northAngle);
  const index = Math.round(bearing / 45) % 8;
  return COMPASS[index];
}

export function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ */
/* 线段 / 遮挡 / 连通 / 重叠（结构优化器与安全校验用）                  */
/* ------------------------------------------------------------------ */

/** 叉积定向 */
function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared <= 1e-12) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + vx * t), point.y - (start.y + vy * t));
}

/** 有向面积；画布坐标中顺时针矩形为正值。 */
export function signedPolygonArea(points: Point[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(signedPolygonArea(points));
}

export function polygonCentroid(points: Point[]): Point {
  const signedArea = signedPolygonArea(points);
  if (Math.abs(signedArea) < 1e-9) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
      y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
    };
  }
  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const factor = a.x * b.y - b.x * a.y;
    x += (a.x + b.x) * factor;
    y += (a.y + b.y) * factor;
  }
  const divisor = 6 * signedArea;
  return { x: x / divisor, y: y / divisor };
}

export function polygonBounds(points: Point[]): BBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 边界视为在 polygon 内，便于门洞/湿区边缘校验。 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j];
    const b = polygon[i];
    if (pointToSegmentDistance(point, a, b) <= 1e-7) return true;
    const crosses = (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function samePoint(a: Point, b: Point, tolerance = 1e-6): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

/** 删除重复点和不改变边界的共线中间点。 */
export function simplifyPolygon(points: Point[], tolerance = 1e-6): Point[] {
  const unique: Point[] = [];
  for (const point of points) {
    if (!unique.length || !samePoint(unique[unique.length - 1], point, tolerance)) unique.push({ ...point });
  }
  if (unique.length > 1 && samePoint(unique[0], unique[unique.length - 1], tolerance)) unique.pop();
  let changed = true;
  while (changed && unique.length >= 4) {
    changed = false;
    for (let i = 0; i < unique.length; i += 1) {
      const prev = unique[(i - 1 + unique.length) % unique.length];
      const current = unique[i];
      const next = unique[(i + 1) % unique.length];
      if (Math.abs(cross(prev, current, next)) <= tolerance &&
          dot(sub(current, prev), sub(next, current)) >= -tolerance) {
        unique.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return unique;
}

export function isSimplePolygon(points: Point[]): boolean {
  if (points.length < 3 || polygonArea(points) <= 1e-6) return false;
  for (let i = 0; i < points.length; i += 1) {
    const a1 = points[i];
    const a2 = points[(i + 1) % points.length];
    if (samePoint(a1, a2)) return false;
    for (let j = i + 1; j < points.length; j += 1) {
      const adjacent = j === i || j === i + 1 || (i === 0 && j === points.length - 1);
      if (adjacent) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % points.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/**
 * 两个简单 polygon 是否存在内部重叠。共享边界/端点不算重叠；结构移动校验使用。
 * 对本项目的正交户型，通过各顶点 x 分段后做中点扫描，结果为确定性精确面积。
 */
export function polygonOverlapArea(a: Point[], b: Point[]): number {
  const xs = [...new Set([...a, ...b].map((point) => point.x))].sort((x, y) => x - y);
  let area = 0;
  const intervalsAt = (polygon: Point[], x: number): Array<[number, number]> => {
    const ys: number[] = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      if ((p.x <= x && x < q.x) || (q.x <= x && x < p.x)) {
        const t = (x - p.x) / (q.x - p.x);
        ys.push(p.y + (q.y - p.y) * t);
      }
    }
    ys.sort((y1, y2) => y1 - y2);
    const intervals: Array<[number, number]> = [];
    for (let i = 0; i + 1 < ys.length; i += 2) intervals.push([ys[i], ys[i + 1]]);
    return intervals;
  };
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const width = xs[i + 1] - xs[i];
    if (width <= 1e-9) continue;
    const x = (xs[i] + xs[i + 1]) / 2;
    const ia = intervalsAt(a, x);
    const ib = intervalsAt(b, x);
    let overlap = 0;
    for (const [a1, a2] of ia) {
      for (const [b1, b2] of ib) overlap += Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
    }
    area += width * overlap;
  }
  return area;
}

/** 两线段是否相交（含端点接触） */
export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  const onSeg = (a: Point, b: Point, c: Point) => {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return c.x >= minX - 1e-6 && c.x <= maxX + 1e-6 && c.y >= minY - 1e-6 && c.y <= maxY + 1e-6;
  };
  if (Math.abs(d1) < 1e-9 && onSeg(p3, p4, p1)) return true;
  if (Math.abs(d2) < 1e-9 && onSeg(p3, p4, p2)) return true;
  if (Math.abs(d3) < 1e-9 && onSeg(p1, p2, p3)) return true;
  if (Math.abs(d4) < 1e-9 && onSeg(p1, p2, p4)) return true;
  return false;
}

/** 线段是否与轴对齐矩形相交 */
export function segmentIntersectsRect(p1: Point, p2: Point, rect: BBox): boolean {
  if (containsPoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 } as PlanElement, p1) ||
      containsPoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 } as PlanElement, p2)) {
    return true;
  }
  const tl = { x: rect.x, y: rect.y };
  const tr = { x: rect.x + rect.width, y: rect.y };
  const br = { x: rect.x + rect.width, y: rect.y + rect.height };
  const bl = { x: rect.x, y: rect.y + rect.height };
  return (
    segmentsIntersect(p1, p2, tl, tr) ||
    segmentsIntersect(p1, p2, tr, br) ||
    segmentsIntersect(p1, p2, br, bl) ||
    segmentsIntersect(p1, p2, bl, tl)
  );
}

/**
 * a→b 的连线是否被任一屏障元素遮挡。
 * 屏障为 screen（玄关/屏风/短隔墙）等家具，用其轴对齐包围盒判定。
 */
export function lineBlocked(a: Point, b: Point, barriers: PlanElement[]): boolean {
  for (const barrier of barriers) {
    if (barrier.type === 'screen' && segmentIntersectsRect(a, b, aabb(barrier))) return true;
  }
  return false;
}

/** 两个轴对齐包围盒重叠面积（无重叠为 0） */
export function bboxOverlapArea(a: BBox, b: BBox): number {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x) * Math.max(0, y2 - y);
}

/**
 * 房间矩形是否过度重叠（允许微小容差，因旋转/标注误差）。
 * 重叠面积超过较小房间面积的 15% 视为冲突。
 */
export function roomsOverlap(a: PlanElement, b: PlanElement): boolean {
  if (a.polygon || b.polygon) {
    return polygonOverlapArea(corners(a), corners(b)) > 0.5;
  }
  const boxA = aabb(a);
  const boxB = aabb(b);
  const overlap = bboxOverlapArea(boxA, boxB);
  if (overlap <= 0) return false;
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  return overlap > Math.min(areaA, areaB) * 0.15;
}

/** 包围盒向外膨胀 t 像素 */
export function inflateBBox(el: PlanElement, t: number): BBox {
  const box = aabb(el);
  return { x: box.x - t, y: box.y - t, width: box.width + 2 * t, height: box.height + 2 * t };
}

/** 门洞中心是否落在房间的膨胀包围盒内（门通常压在墙线上，需要容差） */
export function doorBelongsToRoom(room: PlanElement, door: PlanElement, tolPx: number): boolean {
  const b = inflateBBox(room, tolPx);
  const c = center(door);
  return c.x >= b.x && c.x <= b.x + b.width && c.y >= b.y && c.y <= b.y + b.height;
}

/**
 * 在候选房间中找出门洞最可能归属的房间：优先中心落入房间内部，
 * 否则取门洞中心到房间包围盒距离最近者（不超过 tolPx）。
 */
export function roomOfDoor(
  rooms: PlanElement[],
  door: PlanElement,
  tolPx: number,
): PlanElement | undefined {
  const c = center(door);
  let best: PlanElement | undefined;
  let bestDist = Infinity;
  for (const room of rooms) {
    const b = aabb(room);
    const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.width));
    const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.height));
    const d = Math.hypot(dx, dy);
    if (d <= tolPx && d < bestDist) {
      bestDist = d;
      best = room;
    }
  }
  return best;
}

/**
 * 所有房间是否可达。
 *
 * 建模简化：户型内部的走廊 / 过道 / 开放区域是一块连续的公共通行空间，
 * 因此只要一个房间（或与其直接相邻的房间组）在边界上拥有至少一个门洞，
 * 它就能经由公共空间到达入户门。判定步骤：
 * 1. 包围盒接触（缝隙 < tolPx）的房间合并为同一「房间组」（开放式相连，如客餐厅）；
 * 2. 组内任意房间拥有门洞、或组内包含入户门，则该组可达；
 * 3. 若存在任何不可达的房间组，则判定为产生了不可进入的房间。
 */
export function roomsConnected(
  rooms: PlanElement[],
  doors: PlanElement[],
  tolPx: number,
): boolean {
  const n = rooms.length;
  if (n <= 1) return true;

  // 1. 相邻房间合并为组（并查集）
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    let c = i;
    while (parent[c] !== c) {
      const next = parent[c];
      parent[c] = r;
      c = next;
    }
    return r;
  };
  const union = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[b] = a;
  };
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (bboxOverlapArea(inflateBBox(rooms[i], tolPx), aabb(rooms[j])) > 0) union(i, j);
    }
  }

  // 2. 标记拥有门洞的组
  const reachable = new Set<number>();
  for (const door of doors) {
    for (let i = 0; i < n; i += 1) {
      if (doorBelongsToRoom(rooms[i], door, tolPx)) reachable.add(find(i));
    }
  }

  // 3. 所有组都必须可达
  const groups = new Set<number>();
  for (let i = 0; i < n; i += 1) groups.add(find(i));
  for (const g of groups) {
    if (!reachable.has(g)) return false;
  }
  return true;
}
