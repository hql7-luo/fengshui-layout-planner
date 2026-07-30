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
  const d = sub(p, center(el));
  const local = rotateVec(d, -el.rotation);
  return Math.abs(local.x) <= el.width / 2 + 1e-6 && Math.abs(local.y) <= el.height / 2 + 1e-6;
}

export function containsElement(container: PlanElement, el: PlanElement): boolean {
  return containsPoint(container, center(el));
}

/** 点到（可旋转）矩形四条边的最短距离，点在内部时返回到最近边的距离 */
export function distanceToBoundary(el: PlanElement, p: Point): number {
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
