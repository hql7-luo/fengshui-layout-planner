import { describe, expect, it } from 'vitest';
import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { buildStructureFromElements, generateCandidatePlans } from '@/lib/optimizer';
import { analyzePlan } from '@/lib/rules/engine';
import { aabb, roomsConnected, roomsOverlap } from '@/lib/geometry';
import { SAMPLE_PIXELS_PER_METER, sampleElements } from '@/lib/samples';
import type { ElementType, PlanElement } from '@/lib/types';
import { explicitlyClassifiedStructure } from './helpers/structure';

const PPM = SAMPLE_PIXELS_PER_METER;
const OPTIONS = { pixelsPerMeter: PPM, northAngle: 0, canvas: { width: 1080, height: 840 } };

let counter = 0;
function m(
  type: ElementType,
  x: number,
  y: number,
  opts: { w?: number; h?: number; r?: number; name?: string } = {},
): PlanElement {
  const [dw, dh] = ELEMENT_SPECS[type].defaultSize;
  counter += 1;
  return {
    id: `${type}-accept-${counter}`,
    type,
    name: opts.name ?? ELEMENT_SPECS[type].label,
    x: x * PPM,
    y: y * PPM,
    width: (opts.w ?? dw) * PPM,
    height: (opts.h ?? dh) * PPM,
    rotation: opts.r ?? 0,
  };
}

/* ================================================================ */
/* 验收 1: 评分上限逻辑独立性                                        */
/* ================================================================ */

describe('评分上限逻辑 · 不因可优化性影响原始评分', () => {
  /**
   * 构造入户门正对卫生间门的场景。
   * largeBathroom: 房间足够大（≥1.4m 短边），优化器可设玄关 → 可优化
   * tinyBathroom:  房间极小（<1.4m 短边），优化器无法设玄关 → 不可优化
   * 两个场景的 analyzePlan 原始评分应完全一致（同一规则同一扣分）。
   */
  function buildScenario(bathroomW: number, bathroomH: number): PlanElement[] {
    counter += 100;
    return [
      m('living_room', 5, 6.2, { w: 6, h: 4, name: '客厅' }),
      m('bathroom', 5, 2.2, { w: bathroomW, h: bathroomH, name: '卫生间' }),
      m('master_bedroom', 9.2, 2.2, { w: 4, h: 4, name: '主卧' }),
      m('entry_door', 5, 8.2, { r: 180, name: '入户门' }),
      m('room_door', 5, 3.4, { r: 0, name: '卫生间门' }),
      m('room_door', 7.2, 2.2, { r: 90, name: '主卧门' }),
      m('window', 2.5, 8.2, { r: 180, name: '客厅窗' }),
    ];
  }

  it('同一 high 问题在「可优化」和「不可优化」状态下原始评分一致', () => {
    // 可优化：卫生间 2.4m × 2.2m（短边 ≥ 1.4m）
    const solvable = buildScenario(2.4, 2.2);
    // 不可优化：卫生间 1.0m × 1.0m（短边 < 1.4m）
    const unsolvable = buildScenario(1.0, 1.0);

    const solvableAnalysis = analyzePlan(solvable, OPTIONS);
    const unsolvableAnalysis = analyzePlan(unsolvable, OPTIONS);

    // 两场景都检测到 entry-door-faces-bathroom high 问题
    const solvableHigh = solvableAnalysis.issues.find(
      (i) => i.ruleId === 'entry-door-faces-bathroom' && i.severity === 'high',
    );
    const unsolvableHigh = unsolvableAnalysis.issues.find(
      (i) => i.ruleId === 'entry-door-faces-bathroom' && i.severity === 'high',
    );
    expect(solvableHigh).toBeTruthy();
    expect(unsolvableHigh).toBeTruthy();

    // 关键验证：原始评分完全一致（不因优化器能否解决而变）
    expect(solvableAnalysis.overall).toBe(unsolvableAnalysis.overall);
    expect(solvableAnalysis.categories).toEqual(unsolvableAnalysis.categories);

    // 两者都被 89 分上限压制
    expect(solvableAnalysis.overall).toBeLessThanOrEqual(89);
    expect(unsolvableAnalysis.overall).toBeLessThanOrEqual(89);
  });

  it('优化器在可优化场景下能解决问题并提升分数', () => {
    const els = buildScenario(2.4, 2.2);
    const res = generateCandidatePlans({ elements: els, structure: explicitlyClassifiedStructure(els, PPM), options: OPTIONS });
    const feasible = res.plans.filter((p) => p.feasible);
    expect(feasible.length).toBeGreaterThan(0);
    const best = feasible.reduce((a, b) => (b.predictedScore > a.predictedScore ? b : a));
    expect(best.predictedScore).toBeGreaterThan(best.originalScore);
    // 问题真正消失
    const recomputed = analyzePlan(best.projectedElements, OPTIONS);
    expect(recomputed.issues.some((i) => i.key === solvableHigh(els))).toBe(false);
  });

  it('优化器在不可优化场景下返回不可行或分数不变', () => {
    const els = buildScenario(1.0, 1.0);
    const base = analyzePlan(els, OPTIONS);
    const res = generateCandidatePlans({ elements: els, structure: explicitlyClassifiedStructure(els, PPM), options: OPTIONS });
    // 不可优化场景下，所有方案的 originalScore == base.overall
    for (const p of res.plans) {
      expect(p.originalScore).toBe(base.overall);
    }
  });

  function solvableHigh(els: PlanElement[]): string {
    const r = analyzePlan(els, OPTIONS);
    const h = r.issues.find((i) => i.ruleId === 'entry-door-faces-bathroom' && i.severity === 'high');
    return h?.key ?? '';
  }
});

/* ================================================================ */
/* 验收 2: 结构方案真实性                                            */
/* ================================================================ */

describe('结构方案真实性 · 方案 B/C 检查', () => {
  function entryBathroomElements(): PlanElement[] {
    counter += 200;
    return [
      m('living_room', 5, 6.2, { w: 6, h: 4, name: '客厅' }),
      m('bathroom', 5, 2.2, { w: 2.4, h: 2.2, name: '卫生间' }),
      m('master_bedroom', 9.2, 2.2, { w: 4, h: 4, name: '主卧' }),
      m('entry_door', 5, 8.2, { r: 180, name: '入户门' }),
      m('room_door', 5, 3.4, { r: 0, name: '卫生间门' }),
      m('room_door', 7.2, 2.2, { r: 90, name: '主卧门' }),
      m('window', 2.5, 8.2, { r: 180, name: '客厅窗' }),
    ];
  }

  it('门洞移位后仍位于所在房间边界内（不超出墙体范围）', () => {
    const els = entryBathroomElements();
    const res = generateCandidatePlans({
      elements: els,
      structure: explicitlyClassifiedStructure(els, PPM),
      options: OPTIONS,
    });
    const rooms = els.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');

    for (const plan of res.plans.filter((p) => p.feasible)) {
      for (const mod of plan.modifications) {
        if (!mod.movedElementIds) continue;
        for (const mv of mod.movedElementIds) {
          const original = els.find((e) => e.id === mv.id);
          if (!original || original.type !== 'room_door') continue;
          // 找到门所属房间
          const room = rooms.find((r) => {
            const b = aabb(r);
            const cx = mv.x;
            const cy = mv.y;
            const tol = 0.45 * PPM;
            return cx >= b.x - tol && cx <= b.x + b.width + tol && cy >= b.y - tol && cy <= b.y + b.height + tol;
          });
          expect(room).toBeTruthy();
          // 新位置在房间内（带容差）
          if (room) {
            const b = aabb(room);
            const tol = 0.3 * PPM;
            expect(mv.x).toBeGreaterThanOrEqual(b.x - tol);
            expect(mv.x).toBeLessThanOrEqual(b.x + b.width + tol);
            expect(mv.y).toBeGreaterThanOrEqual(b.y - tol);
            expect(mv.y).toBeLessThanOrEqual(b.y + b.height + tol);
          }
        }
      }
    }
  });

  it('可行方案不产生房间重叠', () => {
    const els = entryBathroomElements();
    const res = generateCandidatePlans({
      elements: els,
      structure: explicitlyClassifiedStructure(els, PPM),
      options: OPTIONS,
    });
    for (const plan of res.plans.filter((p) => p.feasible)) {
      const rooms = plan.projectedElements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          expect(roomsOverlap(rooms[i], rooms[j])).toBe(false);
        }
      }
    }
  });

  it('可行方案保持所有房间连通（无孤立房间）', () => {
    const els = entryBathroomElements();
    const res = generateCandidatePlans({
      elements: els,
      structure: explicitlyClassifiedStructure(els, PPM),
      options: OPTIONS,
    });
    for (const plan of res.plans.filter((p) => p.feasible)) {
      const rooms = plan.projectedElements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
      const doors = plan.projectedElements.filter((e) => e.type === 'entry_door' || e.type === 'room_door');
      expect(roomsConnected(rooms, doors, 0.3 * PPM)).toBe(true);
    }
  });

  it('外墙和承重墙不被移动', () => {
    for (const id of ['entry-facing-bathroom', 'bathroom-in-center', 'bed-facing-door']) {
      const els = sampleElements(id);
      const original = explicitlyClassifiedStructure(els, PPM);
      const res = generateCandidatePlans({ elements: els, structure: original, options: OPTIONS });
      for (const plan of res.plans) {
        const origExt = original.walls.filter((w) => w.kind === 'exterior');
        const projExt = plan.projectedStructure.walls.filter((w) => w.kind === 'exterior');
        expect(projExt).toEqual(origExt);
      }
    }
  });

  it('门洞移位方案包含墙体附着与封堵风险提示', () => {
    const els = entryBathroomElements();
    const res = generateCandidatePlans({
      elements: els,
      structure: explicitlyClassifiedStructure(els, PPM),
      options: OPTIONS,
    });
    const relocationPlans = res.plans.filter((p) =>
      p.modifications.some((m) => m.kind === 'relocate-door' || m.kind === 'offset-door'),
    );
    expect(relocationPlans.length).toBeGreaterThan(0);
    for (const plan of relocationPlans) {
      expect(plan.risks.some((r) => r.includes('墙体') || r.includes('封堵'))).toBe(true);
      expect(plan.risks.some((r) => r.includes('建筑师') || r.includes('结构设计师') || r.includes('物业'))).toBe(true);
    }
  });

  it('新增隔断方案包含专业确认提示', () => {
    const els = entryBathroomElements();
    const res = generateCandidatePlans({
      elements: els,
      structure: explicitlyClassifiedStructure(els, PPM),
      options: OPTIONS,
    });
    const partitionPlans = res.plans.filter((p) =>
      p.modifications.some((m) => m.kind === 'add-screen' || m.kind === 'add-partition' || m.kind === 'add-node'),
    );
    for (const plan of partitionPlans) {
      expect(plan.risks.some((r) => r.includes('非承重') || r.includes('物业') || r.includes('确认'))).toBe(true);
    }
  });

  it('未标记承重墙时所有方案标记为概念候选并含明确提示', () => {
    const els = entryBathroomElements();
    const res = generateCandidatePlans({
      elements: els,
      structure: buildStructureFromElements(els, false, PPM), // loadBearingMarked = false
      options: OPTIONS,
    });
    for (const plan of res.plans) {
      expect(plan.conceptOnly).toBe(true);
      expect(plan.risks.some((r) => r.includes('概念候选'))).toBe(true);
      expect(plan.risks.some((r) => r.includes('建筑师') || r.includes('结构设计师') || r.includes('物业'))).toBe(true);
    }
  });

  it('封闭旧门洞：sealedDoorIds 中的门在 projectedStructure 中被移除', () => {
    const els = entryBathroomElements();
    const res = generateCandidatePlans({
      elements: els,
      structure: explicitlyClassifiedStructure(els, PPM),
      options: OPTIONS,
    });
    for (const plan of res.plans.filter((p) => p.feasible)) {
      for (const mod of plan.modifications) {
        if (!mod.sealedDoorIds) continue;
        for (const doorId of mod.sealedDoorIds) {
          const stillExists = plan.projectedStructure.doors.some((d) => d.id === doorId);
          expect(stillExists).toBe(false);
        }
      }
    }
  });

  it('只有真实 move-wall 方案会改变房间 polygon，其他方案保持房间几何不变', () => {
    for (const id of ['entry-facing-bathroom', 'bathroom-in-center', 'bed-facing-door']) {
      const els = sampleElements(id);
      const res = generateCandidatePlans({
        elements: els,
        structure: explicitlyClassifiedStructure(els, PPM),
        options: OPTIONS,
      });
      const originalRooms = els.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
      for (const plan of res.plans) {
        const projectedRooms = plan.projectedElements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
        // 房间数量不变
        expect(projectedRooms.length).toBe(originalRooms.length);
        const movesWall = plan.modifications.some((modification) => modification.kind === 'move-wall');
        for (const origRoom of originalRooms) {
          const projRoom = projectedRooms.find((r) => r.id === origRoom.id);
          expect(projRoom).toBeTruthy();
          if (projRoom) {
            if (movesWall && plan.modifications.some((modification) =>
              modification.roomAreaChanges?.some((change) => change.roomId === origRoom.id)
            )) {
              expect(projRoom.polygon?.length).toBeGreaterThanOrEqual(4);
            } else {
              expect(projRoom.x).toBeCloseTo(origRoom.x, 5);
              expect(projRoom.y).toBeCloseTo(origRoom.y, 5);
              expect(projRoom.width).toBeCloseTo(origRoom.width, 5);
              expect(projRoom.height).toBeCloseTo(origRoom.height, 5);
            }
          }
        }
      }
    }
  });
});
