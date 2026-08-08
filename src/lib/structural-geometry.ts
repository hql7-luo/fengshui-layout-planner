import { ELEMENT_SPECS } from './element-catalog';
import {
  corners,
  isSimplePolygon,
  pointInPolygon,
  pointToSegmentDistance,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  polygonOverlapArea,
  roomsConnected,
  simplifyPolygon,
} from './geometry';
import type {
  PlanElement,
  Point,
  RoomAreaChange,
  StructureModel,
  Wall,
  WallMoveRecord,
} from './types';

const GEOMETRY_TOLERANCE_PX = 0.05;

const MIN_ROOM_AREA_M2: Partial<Record<PlanElement['type'], number>> = {
  living_room: 8,
  master_bedroom: 8,
  second_bedroom: 6,
  kitchen: 3.5,
  bathroom: 2.2,
  balcony: 1.5,
  study: 4.5,
  dining_room: 4,
};

const MIN_ROOM_WIDTH_M: Partial<Record<PlanElement['type'], number>> = {
  living_room: 2.4,
  master_bedroom: 2.2,
  second_bedroom: 2,
  kitchen: 1.2,
  bathroom: 1.1,
  balcony: 0.8,
  study: 1.8,
  dining_room: 1.8,
};

function cloneElement(element: PlanElement): PlanElement {
  return {
    ...element,
    polygon: element.polygon?.map((point) => ({ ...point })),
  };
}

export function cloneStructureModel(structure: StructureModel): StructureModel {
  return {
    walls: structure.walls.map((wall) => ({ ...wall, adjacentRooms: [...wall.adjacentRooms] })),
    doors: structure.doors.map((door) => ({ ...door, point: { ...door.point } })),
    windows: structure.windows.map((window) => ({ ...window, point: { ...window.point } })),
    zones: structure.zones.map((zone) => ({ ...zone })),
    loadBearingMarked: structure.loadBearingMarked,
  };
}

export function roomPolygon(room: PlanElement): Point[] {
  return room.polygon?.map((point) => ({ ...point })) ?? corners(room);
}

interface RawEdge {
  roomId: string;
  a: Point;
  b: Point;
  orientation: 'horizontal' | 'vertical' | 'diagonal';
  coordinate: number;
  start: number;
  end: number;
}

function edgeOf(roomId: string, a: Point, b: Point): RawEdge {
  if (Math.abs(a.y - b.y) <= GEOMETRY_TOLERANCE_PX) {
    return {
      roomId,
      a,
      b,
      orientation: 'horizontal',
      coordinate: (a.y + b.y) / 2,
      start: Math.min(a.x, b.x),
      end: Math.max(a.x, b.x),
    };
  }
  if (Math.abs(a.x - b.x) <= GEOMETRY_TOLERANCE_PX) {
    return {
      roomId,
      a,
      b,
      orientation: 'vertical',
      coordinate: (a.x + b.x) / 2,
      start: Math.min(a.y, b.y),
      end: Math.max(a.y, b.y),
    };
  }
  return { roomId, a, b, orientation: 'diagonal', coordinate: 0, start: 0, end: 0 };
}

function wallId(orientation: 'horizontal' | 'vertical', coordinate: number, start: number, end: number): string {
  const safe = (value: number) => Math.round(value * 10).toString().replace('-', 'n');
  return `wall-${orientation === 'horizontal' ? 'h' : 'v'}-${safe(coordinate)}-${safe(start)}-${safe(end)}`;
}

/**
 * 把房间 polygon 的共线边切成原子墙段。共享段只保留一次，并写入墙两侧 room id；
 * 无法从几何确认性质的内部边统一标为 unknown，必须由用户显式改为 partition 后才能移动。
 */
export function deriveWallsFromRooms(elements: PlanElement[]): Wall[] {
  const rooms = elements.filter((element) => ELEMENT_SPECS[element.type]?.category === 'room');
  if (!rooms.length) return [];
  const allPoints = rooms.flatMap(roomPolygon);
  const bounds = polygonBounds(allPoints);
  const raw: RawEdge[] = rooms.flatMap((room) => {
    const polygon = roomPolygon(room);
    return polygon.map((point, index) => edgeOf(room.id, point, polygon[(index + 1) % polygon.length]));
  });
  const walls: Wall[] = [];

  for (const orientation of ['horizontal', 'vertical'] as const) {
    const groups = new Map<string, RawEdge[]>();
    for (const edge of raw.filter((item) => item.orientation === orientation)) {
      const key = edge.coordinate.toFixed(2);
      groups.set(key, [...(groups.get(key) ?? []), edge]);
    }
    for (const edges of groups.values()) {
      const coordinate = edges[0].coordinate;
      const stops = [...new Set(edges.flatMap((edge) => [edge.start, edge.end]))].sort((a, b) => a - b);
      for (let index = 0; index + 1 < stops.length; index += 1) {
        const start = stops[index];
        const end = stops[index + 1];
        if (end - start <= GEOMETRY_TOLERANCE_PX) continue;
        const midpoint = (start + end) / 2;
        const covering = edges.filter(
          (edge) => midpoint >= edge.start - GEOMETRY_TOLERANCE_PX && midpoint <= edge.end + GEOMETRY_TOLERANCE_PX,
        );
        if (!covering.length) continue;
        const adjacent: [string | null, string | null] = [null, null];
        for (const edge of covering) {
          const room = rooms.find((candidate) => candidate.id === edge.roomId);
          if (!room) continue;
          const roomCenter = polygonCentroid(roomPolygon(room));
          const side = orientation === 'horizontal'
            ? (roomCenter.y < coordinate ? 0 : 1)
            : (roomCenter.x < coordinate ? 0 : 1);
          if (!adjacent[side]) adjacent[side] = room.id;
        }
        const onOuterBounds = orientation === 'horizontal'
          ? Math.abs(coordinate - bounds.y) <= GEOMETRY_TOLERANCE_PX ||
            Math.abs(coordinate - (bounds.y + bounds.height)) <= GEOMETRY_TOLERANCE_PX
          : Math.abs(coordinate - bounds.x) <= GEOMETRY_TOLERANCE_PX ||
            Math.abs(coordinate - (bounds.x + bounds.width)) <= GEOMETRY_TOLERANCE_PX;
        const kind: Wall['kind'] = covering.length === 1 && onOuterBounds ? 'exterior' : 'unknown';
        walls.push({
          id: wallId(orientation, coordinate, start, end),
          kind,
          x1: orientation === 'horizontal' ? start : coordinate,
          y1: orientation === 'horizontal' ? coordinate : start,
          x2: orientation === 'horizontal' ? end : coordinate,
          y2: orientation === 'horizontal' ? coordinate : end,
          thicknessM: kind === 'exterior' ? 0.2 : 0.12,
          movable: false,
          adjacentRooms: adjacent,
          hasDoor: false,
          hasWindow: false,
        });
      }
    }
  }

  // 旋转或非正交房间边无法参与当前的安全平移算法，但仍保留为 unknown 供可视化与人工分类。
  for (const [index, edge] of raw.filter((item) => item.orientation === 'diagonal').entries()) {
    walls.push({
      id: `wall-diagonal-${index}-${edge.roomId}`,
      kind: 'unknown',
      x1: edge.a.x,
      y1: edge.a.y,
      x2: edge.b.x,
      y2: edge.b.y,
      thicknessM: 0.12,
      movable: false,
      adjacentRooms: [edge.roomId, null],
      hasDoor: false,
      hasWindow: false,
    });
  }
  return walls.sort((a, b) => a.id.localeCompare(b.id));
}

function projectT(point: Point, start: Point, end: Point): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  return lengthSquared <= 1e-12 ? 0 : ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared;
}

function movePolygonEdge(polygon: Point[], wall: Wall, delta: Point): Point[] | null {
  const wallStart = { x: wall.x1, y: wall.y1 };
  const wallEnd = { x: wall.x2, y: wall.y2 };
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (
      pointToSegmentDistance(wallStart, start, end) > GEOMETRY_TOLERANCE_PX ||
      pointToSegmentDistance(wallEnd, start, end) > GEOMETRY_TOLERANCE_PX
    ) continue;
    const rawT1 = projectT(wallStart, start, end);
    const rawT2 = projectT(wallEnd, start, end);
    const t1 = Math.min(rawT1, rawT2);
    const t2 = Math.max(rawT1, rawT2);
    if (t1 < -1e-6 || t2 > 1 + 1e-6 || t2 - t1 <= 1e-6) continue;
    if (t1 <= 1e-6 && t2 >= 1 - 1e-6) {
      const moved = polygon.map((point) => ({ ...point }));
      moved[index] = { x: start.x + delta.x, y: start.y + delta.y };
      moved[(index + 1) % polygon.length] = { x: end.x + delta.x, y: end.y + delta.y };
      const simplified = simplifyPolygon(moved);
      return isSimplePolygon(simplified) ? simplified : null;
    }
    const edgePoint = (t: number): Point => ({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    });
    const originalStart = edgePoint(Math.max(0, t1));
    const originalEnd = edgePoint(Math.min(1, t2));
    const movedStart = { x: originalStart.x + delta.x, y: originalStart.y + delta.y };
    const movedEnd = { x: originalEnd.x + delta.x, y: originalEnd.y + delta.y };
    const next: Point[] = [];
    for (let cursor = 0; cursor < polygon.length; cursor += 1) {
      next.push({ ...polygon[cursor] });
      if (cursor === index) next.push(originalStart, movedStart, movedEnd, originalEnd);
    }
    const simplified = simplifyPolygon(next);
    return isSimplePolygon(simplified) ? simplified : null;
  }
  return null;
}

function wallLength(wall: Wall): number {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

function pointOnWall(point: Point, wall: Wall, tolerancePx: number): boolean {
  return pointToSegmentDistance(point, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }) <= tolerancePx;
}

type WallAxis = 'horizontal' | 'vertical' | 'diagonal';

function wallAxis(wall: Wall): WallAxis {
  if (Math.abs(wall.y2 - wall.y1) <= GEOMETRY_TOLERANCE_PX) return 'horizontal';
  if (Math.abs(wall.x2 - wall.x1) <= GEOMETRY_TOLERANCE_PX) return 'vertical';
  return 'diagonal';
}

function wallCoordinate(wall: Wall, axis: Exclude<WallAxis, 'diagonal'>): number {
  return axis === 'horizontal' ? (wall.y1 + wall.y2) / 2 : (wall.x1 + wall.x2) / 2;
}

function wallInterval(wall: Wall, axis: Exclude<WallAxis, 'diagonal'>): [number, number] {
  return axis === 'horizontal'
    ? [Math.min(wall.x1, wall.x2), Math.max(wall.x1, wall.x2)]
    : [Math.min(wall.y1, wall.y2), Math.max(wall.y1, wall.y2)];
}

function sameAdjacentRooms(a: Wall, b: Wall): boolean {
  const normalized = (wall: Wall) => wall.adjacentRooms.filter((id): id is string => Boolean(id)).sort().join('|');
  return normalized(a) === normalized(b);
}

function sameWallSegment(a: Wall, b: Wall): boolean {
  const axis = wallAxis(a);
  if (axis !== wallAxis(b)) return false;
  if (axis === 'diagonal') {
    const direct = Math.hypot(a.x1 - b.x1, a.y1 - b.y1) <= GEOMETRY_TOLERANCE_PX &&
      Math.hypot(a.x2 - b.x2, a.y2 - b.y2) <= GEOMETRY_TOLERANCE_PX;
    const reverse = Math.hypot(a.x1 - b.x2, a.y1 - b.y2) <= GEOMETRY_TOLERANCE_PX &&
      Math.hypot(a.x2 - b.x1, a.y2 - b.y1) <= GEOMETRY_TOLERANCE_PX;
    return direct || reverse;
  }
  const [aStart, aEnd] = wallInterval(a, axis);
  const [bStart, bEnd] = wallInterval(b, axis);
  return Math.abs(wallCoordinate(a, axis) - wallCoordinate(b, axis)) <= GEOMETRY_TOLERANCE_PX &&
    Math.abs(aStart - bStart) <= GEOMETRY_TOLERANCE_PX &&
    Math.abs(aEnd - bEnd) <= GEOMETRY_TOLERANCE_PX;
}

function wallCoversSegment(source: Wall, candidate: Wall): boolean {
  const axis = wallAxis(source);
  if (axis !== wallAxis(candidate)) return false;
  if (axis === 'diagonal') return sameWallSegment(source, candidate);
  if (Math.abs(wallCoordinate(source, axis) - wallCoordinate(candidate, axis)) > GEOMETRY_TOLERANCE_PX) {
    return false;
  }
  const [sourceStart, sourceEnd] = wallInterval(source, axis);
  const [candidateStart, candidateEnd] = wallInterval(candidate, axis);
  return candidateStart >= sourceStart - GEOMETRY_TOLERANCE_PX &&
    candidateEnd <= sourceEnd + GEOMETRY_TOLERANCE_PX;
}

function collinearOverlapLength(a: Wall, b: Wall): number {
  const axis = wallAxis(a);
  if (axis === 'diagonal' || axis !== wallAxis(b)) return 0;
  if (Math.abs(wallCoordinate(a, axis) - wallCoordinate(b, axis)) > GEOMETRY_TOLERANCE_PX) return 0;
  const [aStart, aEnd] = wallInterval(a, axis);
  const [bStart, bEnd] = wallInterval(b, axis);
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function translatedWall(wall: Wall, delta: Point): Wall {
  return {
    ...wall,
    x1: wall.x1 + delta.x,
    y1: wall.y1 + delta.y,
    x2: wall.x2 + delta.x,
    y2: wall.y2 + delta.y,
  };
}

/**
 * room polygon 是墙体移动后的拓扑真值。重新从 polygon 推导原子墙段，然后只恢复：
 * 1. 几何与相邻关系仍匹配的无关显式分类；2. 被移动目标在新位置上的 partition 授权。
 * 这样端部连接段会自然成为单侧 unknown，不会继承共享墙的 movable 属性。
 */
function rebuildTopologyAfterMove(
  originalElements: PlanElement[],
  nextElements: PlanElement[],
  originalStructure: StructureModel,
  movedWall: Wall,
  delta: Point,
): { walls?: Wall[]; targetWalls?: Wall[]; reason?: string } {
  const exteriorWalls = originalStructure.walls
    .filter((wall) => wall.kind === 'exterior')
    .map((wall) => ({ ...wall, adjacentRooms: [...wall.adjacentRooms] as [string | null, string | null] }));
  const beforeDerived = deriveWallsFromRooms(originalElements);
  const afterDerived = deriveWallsFromRooms(nextElements).filter((wall) => wall.kind !== 'exterior');
  const movedGeometry = translatedWall(movedWall, delta);

  const explicitWalls = originalStructure.walls
    .filter((wall) => wall.id !== movedWall.id && (wall.kind === 'partition' || wall.kind === 'load-bearing'))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'load-bearing' ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  const rebuilt = afterDerived.map((derived) => {
    if (sameAdjacentRooms(derived, movedWall) && wallCoversSegment(movedGeometry, derived)) {
      return { ...derived, kind: 'partition' as const, movable: true, thicknessM: movedWall.thicknessM };
    }
    const prior = explicitWalls.find((candidate) =>
      sameAdjacentRooms(candidate, derived) && wallCoversSegment(candidate, derived),
    );
    if (!prior) return derived;
    return {
      ...derived,
      kind: prior.kind,
      movable: prior.kind === 'partition',
      thicknessM: prior.thicknessM,
    };
  });

  const targetWalls = rebuilt.filter((candidate) =>
    candidate.kind === 'partition' &&
    candidate.movable &&
    sameAdjacentRooms(candidate, movedWall) &&
    wallCoversSegment(movedGeometry, candidate),
  );
  if (!targetWalls.length) return { reason: '移动后无法从房间 polygon 恢复目标共享墙' };

  for (const candidate of rebuilt) {
    if (exteriorWalls.some((exterior) => collinearOverlapLength(candidate, exterior) > GEOMETRY_TOLERANCE_PX)) {
      return { reason: '移动后的内墙与外墙发生重叠' };
    }
  }

  // 房间边界之外的独立屏风/短墙不应因拓扑重建而丢失。
  // 与移动前 polygon 边界重合的墙一律视为拓扑墙，避免保留旧 connector。
  const auxiliaryWalls = originalStructure.walls
    .filter((wall) => wall.kind !== 'exterior' && wall.id !== movedWall.id)
    .filter((wall) => !beforeDerived.some((derived) => sameWallSegment(derived, wall)))
    .filter((wall) => !rebuilt.some((derived) => collinearOverlapLength(derived, wall) > GEOMETRY_TOLERANCE_PX))
    .map((wall) => ({ ...wall, adjacentRooms: [...wall.adjacentRooms] as [string | null, string | null] }));

  const walls = [
    ...exteriorWalls,
    ...rebuilt.sort((a, b) => a.id.localeCompare(b.id)),
    ...auxiliaryWalls.sort((a, b) => a.id.localeCompare(b.id)),
  ];
  for (let index = 0; index < walls.length; index += 1) {
    for (let other = index + 1; other < walls.length; other += 1) {
      if (collinearOverlapLength(walls[index], walls[other]) > GEOMETRY_TOLERANCE_PX) {
        return { reason: `移动后产生重复共线墙段：${walls[index].id} / ${walls[other].id}` };
      }
    }
  }
  return { walls, targetWalls };
}

function reattachOpenings(
  structure: StructureModel,
  originalStructure: StructureModel,
  movedWall: Wall,
  targetWalls: Wall[],
  ppm: number,
): string | null {
  for (const wall of structure.walls) {
    wall.hasDoor = false;
    wall.hasWindow = false;
  }
  const attach = (opening: StructureModel['doors'][number] | StructureModel['windows'][number]): Wall | undefined => {
    const previousWall = originalStructure.walls.find((candidate) => candidate.id === opening.wallId);
    return structure.walls
      .filter((candidate) => pointOnWall(opening.point, candidate, 0.03 * ppm))
      .sort((a, b) => {
        const score = (candidate: Wall): number => {
          if (previousWall?.id === movedWall.id) return targetWalls.some((target) => target.id === candidate.id) ? 0 : 20;
          if (candidate.id === previousWall?.id) return 0;
          if (previousWall && sameAdjacentRooms(candidate, previousWall) && candidate.kind === previousWall.kind) return 1;
          if (previousWall?.kind === candidate.kind) return 2;
          return 10;
        };
        return score(a) - score(b) || a.id.localeCompare(b.id);
      })[0];
  };

  for (const door of structure.doors) {
    const wall = attach(door);
    if (!wall) return `门洞「${door.id}」移动后无法依附合法墙段`;
    door.wallId = wall.id;
    door.movable = door.kind !== 'entry' && wall.kind === 'partition' && wall.movable;
    wall.hasDoor = true;
  }
  for (const window of structure.windows) {
    const wall = attach(window);
    if (!wall) return `窗洞「${window.id}」移动后无法依附合法墙段`;
    window.wallId = wall.id;
    wall.hasWindow = true;
  }
  return null;
}

function validateRoomGeometry(
  elements: PlanElement[],
  structure: StructureModel,
  ppm: number,
): string | null {
  const rooms = elements.filter((element) => ELEMENT_SPECS[element.type]?.category === 'room');
  for (const room of rooms) {
    const polygon = roomPolygon(room);
    if (!isSimplePolygon(polygon)) return `房间「${room.name}」边界产生自交或无效 polygon`;
    if (room.polygon) {
      const areaM2 = polygonArea(polygon) / (ppm * ppm);
      const minArea = MIN_ROOM_AREA_M2[room.type] ?? 2;
      if (areaM2 < minArea) return `房间「${room.name}」面积 ${areaM2.toFixed(2)}㎡，低于合理下限 ${minArea}㎡`;
      const bounds = polygonBounds(polygon);
      const minWidth = Math.min(bounds.width, bounds.height) / ppm;
      const requiredWidth = MIN_ROOM_WIDTH_M[room.type] ?? 1;
      if (minWidth < requiredWidth) return `房间「${room.name}」最小通道宽度 ${minWidth.toFixed(2)}m，低于 ${requiredWidth}m`;
    }
  }
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const overlap = polygonOverlapArea(roomPolygon(rooms[i]), roomPolygon(rooms[j]));
      if (overlap > 0.5) {
        return `房间「${rooms[i].name}」与「${rooms[j].name}」发生重叠`;
      }
    }
  }
  for (const zone of structure.zones.filter((candidate) => candidate.kind === 'wet')) {
    const room = rooms.find((candidate) => candidate.id === zone.roomId);
    if (!room) continue;
    const center = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
    if (!pointInPolygon(center, roomPolygon(room))) return `移动会侵占「${room.name}」固定湿区`;
  }
  const doors = elements.filter((element) => element.type === 'entry_door' || element.type === 'room_door');
  if (!roomsConnected(rooms, doors, 0.3 * ppm)) return '移动后产生不可达的主要房间';
  return null;
}

function validateOpenings(elements: PlanElement[], structure: StructureModel, ppm: number): string | null {
  for (const opening of structure.doors) {
    const wall = structure.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return `门洞「${opening.id}」失去所属墙体`;
    if (!pointOnWall(opening.point, wall, 0.03 * ppm)) return `门洞「${opening.id}」移动后悬空`;
    if (opening.widthM * ppm + 0.2 * ppm > wallLength(wall)) return `门洞「${opening.id}」超过新墙段可用长度`;
    if (opening.linkedElementId) {
      const element = elements.find((candidate) => candidate.id === opening.linkedElementId);
      if (!element || Math.hypot(element.x - opening.point.x, element.y - opening.point.y) > 0.45 * ppm) {
        return `门洞「${opening.id}」与画布标记不同步`;
      }
    }
  }
  for (const opening of structure.windows) {
    const wall = structure.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return `窗洞「${opening.id}」失去所属墙体`;
    if (!pointOnWall(opening.point, wall, 0.03 * ppm)) return `窗洞「${opening.id}」移动后悬空`;
    if (opening.linkedElementId) {
      const element = elements.find((candidate) => candidate.id === opening.linkedElementId);
      if (!element || Math.hypot(element.x - opening.point.x, element.y - opening.point.y) > 0.45 * ppm) {
        return `窗洞「${opening.id}」与画布标记不同步`;
      }
    }
  }
  return null;
}

export function validateStructuralScenario(
  elements: PlanElement[],
  structure: StructureModel,
  ppm: number,
): string | null {
  return validateRoomGeometry(elements, structure, ppm) ?? validateOpenings(elements, structure, ppm);
}

export interface MoveWallResult {
  feasible: boolean;
  reason?: string;
  elements: PlanElement[];
  structure: StructureModel;
  wallMove?: WallMoveRecord;
  roomAreaChanges: RoomAreaChange[];
}

/**
 * 真正移动一段共享 partition wall。房间 polygon 同步更新后，整体重建原子墙段拓扑；
 * 墙上的门窗与对应元素整体平移并重新依附真实墙段。函数不修改输入，并在返回前完成几何、
 * 重叠墙段、门窗依附与连通性校验。
 */
export function movePartitionWall(
  elements: PlanElement[],
  structure: StructureModel,
  wallIdToMove: string,
  distanceM: number,
  ppm: number,
): MoveWallResult {
  const originalElements = elements.map(cloneElement);
  const originalStructure = cloneStructureModel(structure);
  const failure = (reason: string): MoveWallResult => ({
    feasible: false,
    reason,
    elements: originalElements,
    structure: originalStructure,
    roomAreaChanges: [],
  });
  const wall = originalStructure.walls.find((candidate) => candidate.id === wallIdToMove);
  if (!wall) return failure(`未找到墙段「${wallIdToMove}」`);
  if (wall.kind === 'exterior') return failure('外墙不可移动');
  if (wall.kind === 'load-bearing') return failure('承重墙不可自动移动');
  if (wall.kind === 'unknown') return failure('未知墙体不可自动移动；请先确认并标记为非承重墙');
  if (!wall.movable || wall.kind !== 'partition') return failure('该墙段未明确标记为可移动非承重墙');
  if (!wall.adjacentRooms[0] || !wall.adjacentRooms[1]) return failure('墙体两侧房间关系不完整，不能安全同步边界');
  if (!Number.isFinite(distanceM) || Math.abs(distanceM) < 0.15 || Math.abs(distanceM) > 0.8) {
    return failure('墙体移动距离必须在 0.15m 至 0.8m 之间');
  }
  const horizontal = Math.abs(wall.y2 - wall.y1) <= GEOMETRY_TOLERANCE_PX;
  const vertical = Math.abs(wall.x2 - wall.x1) <= GEOMETRY_TOLERANCE_PX;
  if (!horizontal && !vertical) return failure('当前仅支持轴对齐墙段的安全平移');
  const distancePx = distanceM * ppm;
  const delta = horizontal ? { x: 0, y: distancePx } : { x: distancePx, y: 0 };
  const affectedRoomIds = wall.adjacentRooms.filter((id): id is string => Boolean(id));
  const nextElements = originalElements.map(cloneElement);
  const roomAreaChanges: RoomAreaChange[] = [];
  for (const roomId of affectedRoomIds) {
    const index = nextElements.findIndex((candidate) => candidate.id === roomId);
    const room = nextElements[index];
    if (!room || ELEMENT_SPECS[room.type]?.category !== 'room') return failure(`墙侧房间「${roomId}」不存在`);
    const beforePolygon = roomPolygon(room);
    const afterPolygon = movePolygonEdge(beforePolygon, wall, delta);
    if (!afterPolygon) return failure(`墙段不是房间「${room.name}」的合法连续边界，无法同步 polygon`);
    const bounds = polygonBounds(afterPolygon);
    const centroid = polygonCentroid(afterPolygon);
    const beforeM2 = polygonArea(beforePolygon) / (ppm * ppm);
    const afterM2 = polygonArea(afterPolygon) / (ppm * ppm);
    nextElements[index] = {
      ...room,
      x: centroid.x,
      y: centroid.y,
      width: bounds.width,
      height: bounds.height,
      rotation: 0,
      polygon: afterPolygon,
    };
    roomAreaChanges.push({
      roomId,
      roomName: room.name,
      beforeM2,
      afterM2,
      deltaM2: afterM2 - beforeM2,
    });
  }

  const from: [Point, Point] = [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }];
  const movedGeometry = translatedWall(wall, delta);
  const to: [Point, Point] = [
    { x: movedGeometry.x1, y: movedGeometry.y1 },
    { x: movedGeometry.x2, y: movedGeometry.y2 },
  ];
  const nextStructure = cloneStructureModel(originalStructure);

  for (const opening of nextStructure.doors.filter((candidate) => candidate.wallId === wall.id)) {
    opening.point = { x: opening.point.x + delta.x, y: opening.point.y + delta.y };
    if (opening.linkedElementId) {
      const element = nextElements.find((candidate) => candidate.id === opening.linkedElementId);
      if (element) {
        element.x = opening.point.x;
        element.y = opening.point.y;
      }
    }
  }
  for (const opening of nextStructure.windows.filter((candidate) => candidate.wallId === wall.id)) {
    opening.point = { x: opening.point.x + delta.x, y: opening.point.y + delta.y };
    if (opening.linkedElementId) {
      const element = nextElements.find((candidate) => candidate.id === opening.linkedElementId);
      if (element) {
        element.x = opening.point.x;
        element.y = opening.point.y;
      }
    }
  }

  const rebuilt = rebuildTopologyAfterMove(originalElements, nextElements, originalStructure, wall, delta);
  if (!rebuilt.walls || !rebuilt.targetWalls) return failure(rebuilt.reason ?? '移动后墙体拓扑重建失败');
  nextStructure.walls = rebuilt.walls;
  const attachmentFailure = reattachOpenings(
    nextStructure,
    originalStructure,
    wall,
    rebuilt.targetWalls,
    ppm,
  );
  if (attachmentFailure) return failure(attachmentFailure);

  const geometryFailure = validateRoomGeometry(nextElements, nextStructure, ppm);
  if (geometryFailure) return failure(geometryFailure);
  const openingFailure = validateOpenings(nextElements, nextStructure, ppm);
  if (openingFailure) return failure(openingFailure);
  return {
    feasible: true,
    elements: nextElements,
    structure: nextStructure,
    wallMove: { wallId: wall.id, from, to, distanceM },
    roomAreaChanges,
  };
}
