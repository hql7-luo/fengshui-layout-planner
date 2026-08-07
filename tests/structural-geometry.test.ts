import { describe, expect, it } from 'vitest';
import { computeLayers, LAYER_IDS } from '@/lib/analysis-layers';
import {
  isSimplePolygon,
  polygonArea,
  polygonOverlapArea,
  roomsConnected,
} from '@/lib/geometry';
import { buildStructureFromElements, generateCandidatePlans, isPointOnWall } from '@/lib/optimizer';
import { analyzePlan } from '@/lib/rules/engine';
import { movePartitionWall, roomPolygon } from '@/lib/structural-geometry';
import type { PlanElement, StructureModel, WallKind } from '@/lib/types';
import { longCorridorApartment } from '@/lib/verify-samples';

const PPM = 100;
const OPTIONS = { pixelsPerMeter: PPM, northAngle: 0, canvas: { width: 900, height: 600 } };

function fixture(): { elements: PlanElement[]; structure: StructureModel; wallId: string } {
  const elements: PlanElement[] = [
    { id: 'living', type: 'living_room', name: '客厅', x: 200, y: 200, width: 400, height: 400, rotation: 0 },
    { id: 'bedroom', type: 'master_bedroom', name: '卧室', x: 600, y: 200, width: 400, height: 400, rotation: 0 },
    { id: 'entry', type: 'entry_door', name: '入户门', x: 200, y: 400, width: 90, height: 18, rotation: 180 },
    { id: 'door', type: 'room_door', name: '房门', x: 400, y: 200, width: 90, height: 18, rotation: 90 },
    { id: 'window', type: 'window', name: '内窗', x: 400, y: 80, width: 100, height: 12, rotation: 90 },
  ];
  const structure = buildStructureFromElements(elements, true, PPM);
  const wall = structure.walls.find((candidate) => candidate.adjacentRooms[0] && candidate.adjacentRooms[1]);
  if (!wall) throw new Error('测试夹具缺少共享墙');
  return { elements, structure, wallId: wall.id };
}

function withKind(structure: StructureModel, wallId: string, kind: WallKind): StructureModel {
  const copy = structuredClone(structure);
  copy.walls = copy.walls.map((wall) => wall.id === wallId
    ? { ...wall, kind, movable: kind === 'partition' }
    : wall);
  copy.doors = copy.doors.map((door) => ({
    ...door,
    movable: door.kind !== 'entry' && copy.walls.find((wall) => wall.id === door.wallId)?.kind === 'partition',
  }));
  return copy;
}

describe('真实共享墙移动 · 几何与安全约束', () => {
  it('1. partition wall 可以移动且原输入不被修改', () => {
    const { elements, structure, wallId } = fixture();
    const snapshot = structuredClone({ elements, structure });
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    expect(moved.feasible).toBe(true);
    expect(moved.structure.walls.find((wall) => wall.id === wallId)?.x1).toBe(440);
    expect({ elements, structure }).toEqual(snapshot);
  });

  it.each([
    ['load-bearing', '承重墙不可自动移动'],
    ['exterior', '外墙不可移动'],
    ['unknown', '未知墙体不可自动移动'],
  ] as const)('2-4. %s wall 拒绝自动移动并给出具体原因', (kind, reason) => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, withKind(structure, wallId, kind), wallId, 0.4, PPM);
    expect(moved.feasible).toBe(false);
    expect(moved.reason).toContain(reason);
  });

  it('5. 墙两侧房间 polygon 同步替换同一共享边', () => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    const living = moved.elements.find((element) => element.id === 'living')!;
    const bedroom = moved.elements.find((element) => element.id === 'bedroom')!;
    expect(living.polygon).toBeTruthy();
    expect(bedroom.polygon).toBeTruthy();
    expect(roomPolygon(living).filter((point) => point.x === 440)).toHaveLength(2);
    expect(roomPolygon(bedroom).filter((point) => point.x === 440)).toHaveLength(2);
    expect(living.x).toBe(220);
    expect(bedroom.x).toBe(620);
  });

  it('6. 房间面积与面积差计算正确且守恒', () => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    const [living, bedroom] = moved.roomAreaChanges;
    expect(living.beforeM2).toBeCloseTo(16, 6);
    expect(living.afterM2).toBeCloseTo(17.6, 6);
    expect(bedroom.afterM2).toBeCloseTo(14.4, 6);
    expect(living.deltaM2 + bedroom.deltaM2).toBeCloseTo(0, 6);
  });

  it('7. 墙上的门洞和窗洞与画布元素同步依附新墙', () => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    const wall = moved.structure.walls.find((candidate) => candidate.id === wallId)!;
    const door = moved.structure.doors.find((opening) => opening.linkedElementId === 'door')!;
    const window = moved.structure.windows.find((opening) => opening.linkedElementId === 'window')!;
    expect(isPointOnWall(door.point, wall, 0.01)).toBe(true);
    expect(isPointOnWall(window.point, wall, 0.01)).toBe(true);
    expect(moved.elements.find((element) => element.id === 'door')?.x).toBe(440);
    expect(moved.elements.find((element) => element.id === 'window')?.x).toBe(440);
  });

  it('8. 移动后的 polygon 均为简单正面积 polygon', () => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    for (const room of moved.elements.filter((element) => element.type === 'living_room' || element.type === 'master_bedroom')) {
      expect(isSimplePolygon(roomPolygon(room))).toBe(true);
      expect(polygonArea(roomPolygon(room))).toBeGreaterThan(0);
    }
  });

  it('9. 两个相邻房间不产生内部重叠', () => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    const rooms = moved.elements.filter((element) => element.type === 'living_room' || element.type === 'master_bedroom');
    expect(polygonOverlapArea(roomPolygon(rooms[0]), roomPolygon(rooms[1]))).toBeCloseTo(0, 6);
  });

  it('10. 入户门和共享房门保持所有主要房间可达', () => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    const rooms = moved.elements.filter((element) => element.type === 'living_room' || element.type === 'master_bedroom');
    const doors = moved.elements.filter((element) => element.type === 'entry_door' || element.type === 'room_door');
    expect(roomsConnected(rooms, doors, 0.3 * PPM)).toBe(true);
  });

  it('11. 新墙两端仍连接外墙，且原外墙坐标完全不变', () => {
    const { elements, structure, wallId } = fixture();
    const exteriorBefore = structure.walls.filter((wall) => wall.kind === 'exterior');
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    const wall = moved.structure.walls.find((candidate) => candidate.id === wallId)!;
    const others = moved.structure.walls.filter((candidate) => candidate.id !== wallId);
    expect(others.some((candidate) => isPointOnWall({ x: wall.x1, y: wall.y1 }, candidate, 0.01))).toBe(true);
    expect(others.some((candidate) => isPointOnWall({ x: wall.x2, y: wall.y2 }, candidate, 0.01))).toBe(true);
    expect(moved.structure.walls.filter((candidate) => candidate.kind === 'exterior')).toEqual(exteriorBefore);
  });

  it('12. 房间面积会跌破合理下限时返回 no-feasible 具体原因', () => {
    const { elements } = fixture();
    const compact = elements.map((element) => element.id === 'bedroom'
      ? { ...element, x: 510, width: 220 }
      : element);
    const structure = buildStructureFromElements(compact, true, PPM);
    const wall = structure.walls.find((candidate) => candidate.adjacentRooms[0] && candidate.adjacentRooms[1])!;
    const moved = movePartitionWall(compact, structure, wall.id, 0.3, PPM);
    expect(moved.feasible).toBe(false);
    expect(moved.reason).toMatch(/面积.+低于合理下限/);
  });

  it('13. 相同输入和距离得到完全确定的墙体与 polygon 输出', () => {
    const { elements, structure, wallId } = fixture();
    expect(movePartitionWall(elements, structure, wallId, 0.4, PPM)).toEqual(
      movePartitionWall(elements, structure, wallId, 0.4, PPM),
    );
  });
});
describe('真实墙移动 · 优化器、评分和七图层', () => {
  it('14. 长走廊案例的可行 B/C 包含真实墙移动并提高规则评分', () => {
    const elements = longCorridorApartment();
    const options = { pixelsPerMeter: 75, northAngle: 0, canvas: { width: 1080, height: 840 } };
    const structure = buildStructureFromElements(elements, true, 75);
    const result = generateCandidatePlans({ elements, structure, options });
    const plan = result.plans.find((candidate) =>
      candidate.feasible && candidate.modifications.some((modification) => modification.kind === 'move-wall'),
    );
    expect(plan).toBeTruthy();
    expect(plan!.predictedScore).toBeGreaterThan(plan!.originalScore);
    expect(plan!.solvedIssues.some((issue) => issue.ruleId === 'long-corridor')).toBe(true);
  });

  it('15. before/after 的七个图层按新 polygon 重新计算', () => {
    const { elements, structure, wallId } = fixture();
    const moved = movePartitionWall(elements, structure, wallId, 0.4, PPM);
    const input = (planElements: PlanElement[]) => ({
      elements: planElements,
      analysis: analyzePlan(planElements, OPTIONS),
      options: OPTIONS,
    });
    const before = computeLayers(input(elements), LAYER_IDS);
    const after = computeLayers(input(moved.elements), LAYER_IDS);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(JSON.stringify(after)).not.toEqual(JSON.stringify(before));
  });

  it('16. 候选预测评分与 projectedElements 实际重算一致', () => {
    const elements = longCorridorApartment();
    const options = { pixelsPerMeter: 75, northAngle: 0, canvas: { width: 1080, height: 840 } };
    const structure = buildStructureFromElements(elements, true, 75);
    const result = generateCandidatePlans({ elements, structure, options });
    for (const plan of result.plans.filter((candidate) => candidate.feasible)) {
      expect(analyzePlan(plan.projectedElements, options).overall).toBe(plan.predictedScore);
    }
  });
});
