import { specOf } from '../element-catalog';
import { aabb, containsElement, distanceToBoundary, unionBBox } from '../geometry';
import type { AnalysisContext, BBox, ElementType, PlanElement } from '../types';

export interface ContextOptions {
  pixelsPerMeter: number;
  northAngle: number;
  canvas: { width: number; height: number };
}

/**
 * 构建规则引擎的分析上下文。纯函数，输入相同则输出相同。
 */
export function buildContext(
  elements: PlanElement[],
  options: ContextOptions,
): AnalysisContext {
  const rooms = elements.filter((e) => specOf(e.type).category === 'room');
  const openings = elements.filter((e) => specOf(e.type).category === 'opening');
  const furniture = elements.filter((e) => specOf(e.type).category === 'furniture');

  const fallback: BBox = { x: 0, y: 0, width: options.canvas.width, height: options.canvas.height };
  const bounds = unionBBox(rooms.map(aabb)) ?? unionBBox(elements.map(aabb)) ?? fallback;

  const roomCache = new Map<string, PlanElement | undefined>();

  const roomOf = (element: PlanElement): PlanElement | undefined => {
    if (roomCache.has(element.id)) return roomCache.get(element.id);
    // 优先取包含中心点的房间；若有多个，取面积最小的（更贴近实际归属）
    const containing = rooms
      .filter((room) => room.id !== element.id && containsElement(room, element))
      .sort((a, b) => a.width * a.height - b.width * b.height);
    let result = containing[0];
    if (!result) {
      // 门窗常常压在墙上，允许一定的容差
      const tolerance = options.pixelsPerMeter * 0.6;
      const nearby = rooms
        .filter((room) => room.id !== element.id)
        .map((room) => ({ room, d: distanceToBoundary(room, { x: element.x, y: element.y }) }))
        .filter((item) => item.d <= tolerance)
        .sort((a, b) => a.d - b.d);
      result = nearby[0]?.room;
    }
    roomCache.set(element.id, result);
    return result;
  };

  return {
    elements,
    rooms,
    openings,
    furniture,
    pixelsPerMeter: options.pixelsPerMeter,
    northAngle: options.northAngle,
    bounds,
    canvas: options.canvas,
    byType: (...types: ElementType[]) => elements.filter((e) => types.includes(e.type)),
    roomOf,
    toMeters: (px: number) => px / options.pixelsPerMeter,
    toPixels: (meters: number) => meters * options.pixelsPerMeter,
  };
}
