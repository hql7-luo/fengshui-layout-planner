import { describe, expect, it } from 'vitest';
import {
  aabb,
  backMidpoint,
  compassOf,
  containsPoint,
  distanceToBoundary,
  elementGap,
  facingCheck,
  facingVector,
  frontMidpoint,
  mutuallyFacing,
  normalizeDeg,
  rotateVec,
  roundTo,
  unionBBox,
} from '@/lib/geometry';
import type { ElementType, PlanElement } from '@/lib/types';

function el(
  type: ElementType,
  x: number,
  y: number,
  width = 100,
  height = 100,
  rotation = 0,
): PlanElement {
  return { id: `${type}-${x}-${y}`, type, name: type, x, y, width, height, rotation };
}

describe('normalizeDeg', () => {
  it('把任意角度归一到 [0,360)', () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
  });
});

describe('rotateVec', () => {
  it('顺时针旋转 90 度把 +Y 变为 -X', () => {
    const v = rotateVec({ x: 0, y: 1 }, 90);
    expect(roundTo(v.x, 6)).toBe(-1);
    expect(roundTo(v.y, 6)).toBe(0);
  });

  it('旋转 0 度保持不变', () => {
    expect(rotateVec({ x: 3, y: -4 }, 0)).toEqual({ x: 3, y: -4 });
  });
});

describe('facingVector / front / back', () => {
  it('未旋转时正面朝向画布下方（+Y）', () => {
    const bed = el('bed', 100, 100, 80, 60);
    const f = facingVector(bed);
    expect(roundTo(f.x, 6)).toBe(0);
    expect(roundTo(f.y, 6)).toBe(1);
    expect(frontMidpoint(bed)).toEqual({ x: 100, y: 130 });
    expect(backMidpoint(bed)).toEqual({ x: 100, y: 70 });
  });

  it('旋转 180 度后正面朝上', () => {
    const bed = el('bed', 100, 100, 80, 60, 180);
    expect(roundTo(facingVector(bed).y, 6)).toBe(-1);
    expect(roundTo(frontMidpoint(bed).y, 6)).toBe(70);
  });
});

describe('aabb / unionBBox', () => {
  it('未旋转矩形的包围盒等于自身', () => {
    expect(aabb(el('living_room', 100, 100, 200, 120))).toEqual({
      x: 0,
      y: 40,
      width: 200,
      height: 120,
    });
  });

  it('旋转 90 度后宽高互换', () => {
    const box = aabb(el('living_room', 100, 100, 200, 100, 90));
    expect(roundTo(box.width, 6)).toBe(100);
    expect(roundTo(box.height, 6)).toBe(200);
  });

  it('unionBBox 合并多个包围盒', () => {
    const union = unionBBox([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 5, width: 10, height: 30 },
    ]);
    expect(union).toEqual({ x: 0, y: 0, width: 30, height: 35 });
  });

  it('unionBBox 对空数组返回 null', () => {
    expect(unionBBox([])).toBeNull();
  });
});

describe('containsPoint / distanceToBoundary', () => {
  const room = el('living_room', 100, 100, 200, 100);

  it('内部点返回 true，外部点返回 false', () => {
    expect(containsPoint(room, { x: 100, y: 100 })).toBe(true);
    expect(containsPoint(room, { x: 199, y: 100 })).toBe(true);
    expect(containsPoint(room, { x: 201, y: 100 })).toBe(false);
  });

  it('内部点到边界的距离取最近边', () => {
    expect(distanceToBoundary(room, { x: 100, y: 100 })).toBe(50);
    expect(distanceToBoundary(room, { x: 100, y: 140 })).toBe(10);
  });

  it('外部点返回正的欧氏距离', () => {
    expect(distanceToBoundary(room, { x: 210, y: 100 })).toBe(10);
  });
});

describe('elementGap', () => {
  it('相邻不重叠时返回间隙', () => {
    const a = el('kitchen', 0, 0, 100, 100);
    const b = el('bathroom', 150, 0, 100, 100);
    expect(elementGap(a, b)).toBe(50);
  });

  it('重叠时返回 0', () => {
    const a = el('kitchen', 0, 0, 100, 100);
    const b = el('bathroom', 40, 0, 100, 100);
    expect(elementGap(a, b)).toBe(0);
  });
});

describe('facingCheck', () => {
  it('床（uni）正对正前方的门', () => {
    const bed = el('bed', 100, 100, 150, 200);
    const door = el('room_door', 100, 400, 80, 20);
    expect(facingCheck(bed, door, { maxAngle: 25 }).facing).toBe(true);
  });

  it('床背后的门不算正对', () => {
    const bed = el('bed', 100, 400, 150, 200);
    const door = el('room_door', 100, 100, 80, 20);
    expect(facingCheck(bed, door, { maxAngle: 25 }).facing).toBe(false);
  });

  it('门（bi）双向都成立', () => {
    const doorA = el('entry_door', 100, 100, 90, 20);
    const doorB = el('room_door', 100, 500, 90, 20);
    expect(facingCheck(doorA, doorB, { maxAngle: 25 }).facing).toBe(true);
    expect(facingCheck(doorB, doorA, { maxAngle: 25 }).facing).toBe(true);
    expect(mutuallyFacing(doorA, doorB, { maxAngle: 25 })).toBe(true);
  });

  it('房间（none）永不构成朝向关系', () => {
    const room = el('living_room', 100, 100, 200, 200);
    const door = el('room_door', 100, 500, 90, 20);
    expect(facingCheck(room, door).facing).toBe(false);
  });

  it('横向偏移超限时不算正对', () => {
    const bed = el('bed', 100, 100, 150, 200);
    const door = el('room_door', 400, 400, 80, 20);
    expect(facingCheck(bed, door, { maxAngle: 25, maxLateral: 50 }).facing).toBe(false);
  });

  it('超出最大距离时不算正对', () => {
    const bed = el('bed', 100, 100, 150, 200);
    const door = el('room_door', 100, 1200, 80, 20);
    expect(facingCheck(bed, door, { maxAngle: 25, maxDistance: 500 }).facing).toBe(false);
  });
});

describe('compassOf', () => {
  it('北在画布上方时，向上为北、向下为南', () => {
    expect(compassOf({ x: 0, y: -1 }, 0)).toBe('北');
    expect(compassOf({ x: 0, y: 1 }, 0)).toBe('南');
    expect(compassOf({ x: 1, y: 0 }, 0)).toBe('东');
    expect(compassOf({ x: -1, y: 0 }, 0)).toBe('西');
  });

  it('北旋转 90 度（北在右）时，向上变为西', () => {
    expect(compassOf({ x: 0, y: -1 }, 90)).toBe('西');
    expect(compassOf({ x: 1, y: 0 }, 90)).toBe('北');
  });

  it('零向量返回中心', () => {
    expect(compassOf({ x: 0, y: 0 }, 0)).toBe('中心');
  });
});

describe('roundTo', () => {
  it('按指定小数位四舍五入', () => {
    expect(roundTo(1.2345, 2)).toBe(1.23);
    expect(roundTo(1.2355, 2)).toBe(1.24);
    expect(roundTo(1.5)).toBe(1.5);
  });
});
