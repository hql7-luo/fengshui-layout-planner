import { describe, expect, it } from 'vitest';
import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { buildStructureFromElements, generateCandidatePlans, isPointOnWall } from '@/lib/optimizer';
import { analyzePlan } from '@/lib/rules/engine';
import { SAMPLE_PIXELS_PER_METER, SAMPLES, sampleElements } from '@/lib/samples';
import { roomsConnected, roomsOverlap } from '@/lib/geometry';
import type { ElementType, PlanElement, StructureModel } from '@/lib/types';

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
    id: `${type}-${counter}`,
    type,
    name: opts.name ?? ELEMENT_SPECS[type].label,
    x: x * PPM,
    y: y * PPM,
    width: (opts.w ?? dw) * PPM,
    height: (opts.h ?? dh) * PPM,
    rotation: opts.r ?? 0,
  };
}

function run(elements: PlanElement[], structure?: StructureModel) {
  return generateCandidatePlans({
    elements,
    structure: structure ?? buildStructureFromElements(elements, true, PPM),
    options: OPTIONS,
  });
}

/** 入户门正对卫生间的最小场景 */
function entryFacingBathroom(): PlanElement[] {
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

/** 房门正对房门的最小场景 */
function doorFacingDoor(): PlanElement[] {
  return [
    m('second_bedroom', 2.2, 2.4, { w: 3.6, h: 3.6, name: '次卧' }),
    m('master_bedroom', 8.2, 2.4, { w: 3.6, h: 3.6, name: '主卧' }),
    m('living_room', 5.2, 6.9, { w: 6, h: 4, name: '客厅' }),
    m('room_door', 4.1, 2.4, { r: 90, name: '次卧门' }),
    m('room_door', 6.3, 2.4, { r: 270, name: '主卧门' }),
    m('entry_door', 5.2, 8.9, { r: 180, name: '入户门' }),
    m('window', 2.2, 0.6, { name: '次卧窗' }),
  ];
}

describe('结构优化器 · 数据结构与结构模型', () => {
  it('由元素推导出的结构模型包含四面外墙、门洞、窗洞与湿区', () => {
    const els = entryFacingBathroom();
    const s = buildStructureFromElements(els, true, PPM);
    expect(s.walls.filter((w) => w.kind === 'exterior')).toHaveLength(4);
    expect(s.walls.every((w) => w.kind !== 'exterior' || w.movable === false)).toBe(true);
    expect(s.doors.some((d) => d.kind === 'entry' && d.movable === false)).toBe(true);
    expect(s.doors.some((d) => d.kind === 'bathroom')).toBe(true);
    expect(s.windows.length).toBeGreaterThan(0);
    expect(s.zones.some((z) => z.kind === 'wet' && z.movable === false)).toBe(true);
    for (const door of s.doors) {
      const wall = s.walls.find((item) => item.id === door.wallId);
      expect(wall).toBeTruthy();
      expect(wall && isPointOnWall(door.point, wall, 0.01)).toBe(true);
    }
  });

  it('凹形户型的入户门可依附房间外边线，不要求位于整体包围盒四边', () => {
    const rooms = [
      m('study', 2, 6, { w: 2, h: 2 }),
      m('living_room', 7, 2, { w: 4, h: 4 }),
    ];
    const entry = m('entry_door', 3, 6, { r: 90 });
    const structure = buildStructureFromElements([...rooms, entry], false, PPM);
    const opening = structure.doors.find((door) => door.linkedElementId === entry.id)!;
    const wall = structure.walls.find((candidate) => candidate.id === opening.wallId);
    expect(wall).toBeTruthy();
    expect(isPointOnWall(opening.point, wall!)).toBe(true);
    expect(opening.movable).toBe(false);
  });
});

describe('验收 ①②③ · 三类结构问题都能生成候选方案', () => {
  it('① 入户门正对卫生间 → 生成改门洞或玄关方案', () => {
    const els = entryFacingBathroom();
    const res = run(els);
    expect(res.hasStructuralIssue).toBe(true);
    expect(res.plans).toHaveLength(3);
    const kinds = res.plans.flatMap((p) => p.modifications.map((mm) => mm.kind));
    expect(kinds.some((k) => k === 'add-screen' || k === 'relocate-door')).toBe(true);
    const feasible = res.plans.filter((p) => p.feasible);
    expect(feasible.length).toBeGreaterThan(0);
  });

  it('② 房门正对房门 → 生成错位门洞方案', () => {
    const els = doorFacingDoor();
    const res = run(els);
    expect(res.plans).toHaveLength(3);
    expect(res.plans.some((p) => p.modifications.some((mm) => mm.kind === 'offset-door'))).toBe(true);
  });

  it('③ 走廊过长 → 生成分割 / 入口调整方案', () => {
    const els = sampleElements('bed-facing-door');
    const res = run(els);
    expect(res.plans).toHaveLength(3);
    const kinds = res.plans.flatMap((p) => p.modifications.map((mm) => mm.kind));
    expect(kinds.some((k) => k === 'offset-door' || k === 'add-node')).toBe(true);
  });
});

describe('验收 ④⑤⑥⑦ · 安全约束', () => {
  const cases = [...SAMPLES.map((s) => s.id)];

  it('④ 任何方案都不移动承重墙', () => {
    for (const id of cases) {
      const els = sampleElements(id);
      const original = buildStructureFromElements(els, true, PPM);
      // 人为加入一段承重墙
      original.walls.push({
        id: 'lb-1',
        kind: 'load-bearing',
        x1: 300,
        y1: 0,
        x2: 300,
        y2: 600,
        thicknessM: 0.24,
        movable: false,
        adjacentRooms: [null, null],
        hasDoor: false,
        hasWindow: false,
      });
      const res = run(els, original);
      for (const p of res.plans) {
        const before = original.walls.filter((w) => w.kind === 'load-bearing');
        const after = p.projectedStructure.walls.filter((w) => w.kind === 'load-bearing');
        expect(after).toEqual(before);
      }
    }
  });

  it('⑤ 任何方案都不移动外墙', () => {
    for (const id of cases) {
      const els = sampleElements(id);
      const original = buildStructureFromElements(els, true, PPM);
      const res = run(els, original);
      for (const p of res.plans) {
        const before = original.walls.filter((w) => w.kind === 'exterior');
        const after = p.projectedStructure.walls.filter((w) => w.kind === 'exterior');
        expect(after).toEqual(before);
      }
    }
  });

  it('⑥ 可行方案不产生房间重叠', () => {
    for (const id of cases) {
      const res = run(sampleElements(id));
      for (const p of res.plans.filter((x) => x.feasible)) {
        const rooms = p.projectedElements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
        for (let i = 0; i < rooms.length; i += 1) {
          for (let j = i + 1; j < rooms.length; j += 1) {
            expect(roomsOverlap(rooms[i], rooms[j])).toBe(false);
          }
        }
      }
    }
  });

  it('⑦ 可行方案不产生不可达房间', () => {
    for (const id of cases) {
      const res = run(sampleElements(id));
      for (const p of res.plans.filter((x) => x.feasible)) {
        const rooms = p.projectedElements.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
        const doors = p.projectedElements.filter((e) => e.type === 'entry_door' || e.type === 'room_door');
        expect(roomsConnected(rooms, doors, 0.3 * PPM)).toBe(true);
      }
    }
  });

  it('入户门默认不被移动', () => {
    for (const id of SAMPLES.map((s) => s.id)) {
      const els = sampleElements(id);
      const entry = els.find((e) => e.type === 'entry_door');
      if (!entry) continue;
      const res = run(els);
      for (const p of res.plans) {
        const moved = p.projectedElements.find((e) => e.id === entry.id);
        expect(moved?.x).toBeCloseTo(entry.x, 5);
        expect(moved?.y).toBeCloseTo(entry.y, 5);
      }
    }
  });
});

describe('验收 ⑧⑨ · 原始方案与稳定性', () => {
  it('⑧ 生成候选不会修改传入的原始元素与结构', () => {
    const els = entryFacingBathroom();
    const snapshot = JSON.stringify(els);
    const structure = buildStructureFromElements(els, true, PPM);
    const structSnapshot = JSON.stringify(structure);
    const res = run(els, structure);
    expect(JSON.stringify(els)).toBe(snapshot);
    expect(JSON.stringify(structure)).toBe(structSnapshot);
    // 候选方案是独立副本
    expect(res.plans[0].projectedElements).not.toBe(els);
  });

  it('⑨ 同一输入重复生成结果稳定（确定性）', () => {
    for (const id of SAMPLES.map((s) => s.id)) {
      const els = sampleElements(id);
      const a = run(els);
      const b = run(sampleElements(id));
      expect(a.plans.map((p) => p.id)).toEqual(['A', 'B', 'C']);
      expect(JSON.stringify(a.plans)).toBe(JSON.stringify(b.plans));
    }
  });
});

describe('验收 ⑩⑪ · 应用效果与撤销', () => {
  it('⑩ 所有样本应用候选方案后得分不下降且确实解决了问题', () => {
    for (const id of SAMPLES.map((s) => s.id)) {
      const els = sampleElements(id);
      const res = run(els);
      const feasible = res.plans.filter((p) => p.feasible);
      expect(feasible.length).toBeGreaterThan(0);
      const best = feasible.reduce((x, y) => {
        if (y.predictedScore !== x.predictedScore) return y.predictedScore > x.predictedScore ? y : x;
        return y.solvedIssueKeys.length > x.solvedIssueKeys.length ? y : x;
      });
      // 存在其他 high 问题（如湿区位置）时，总分被高风险上限压制在 89 以内属合理结果
      expect(best.predictedScore).toBeGreaterThanOrEqual(best.originalScore);
      // 方案必须真正消除了部分问题
      expect(best.solvedIssueKeys.length).toBeGreaterThan(0);
      // 预测分必须与规则引擎实际重算一致（非编造）
      const recomputed = analyzePlan(best.projectedElements, OPTIONS);
      expect(recomputed.overall).toBe(best.predictedScore);
    }
  });

  it('⑩ 仅含一个可解决 high 问题的独立场景优化后分数确实提高', () => {
    // entry-facing-bathroom 示例：仅 1 个 high 问题（入户门正对卫生间），玄关 / 移门可解
    const els = sampleElements('entry-facing-bathroom');
    const base = analyzePlan(els, OPTIONS);
    const highIssue = base.issues.find((i) => i.ruleId === 'entry-door-faces-bathroom' && i.severity === 'high');
    expect(highIssue).toBeTruthy();
    // 存在 high 问题 → 被高风险上限压制在 89 分以内
    expect(base.overall).toBeLessThanOrEqual(89);
    const res = run(els);
    const feasible = res.plans.filter((p) => p.feasible);
    expect(feasible.length).toBeGreaterThan(0);
    const best = feasible.reduce((x, y) => (y.predictedScore > x.predictedScore ? y : x));
    // 该 high 问题被结构优化解决后，分数应高于上限压迫值
    expect(best.predictedScore).toBeGreaterThan(best.originalScore);
    expect(best.solvedIssueKeys).toContain(highIssue!.key);
    const recomputed = analyzePlan(best.projectedElements, OPTIONS);
    expect(recomputed.overall).toBe(best.predictedScore);
  });

  it('⑪ 撤销可恢复：projectedElements 与原始元素互不影响', () => {
    const els = entryFacingBathroom();
    const before = els.map((e) => ({ ...e }));
    const res = run(els);
    const plan = res.plans.find((p) => p.feasible)!;
    plan.projectedElements[0].x = -9999;
    expect(els).toEqual(before);
  });

  it('移位门洞在同一真实墙段创建新 opening，旧 opening 移除且墙段连续保留', () => {
    const els = entryFacingBathroom();
    const structure = buildStructureFromElements(els, true, PPM);
    const result = run(els, structure);
    const plan = result.plans.find((candidate) =>
      candidate.feasible && candidate.modifications.some((modification) => modification.sealedDoorIds?.length),
    );
    expect(plan).toBeTruthy();
    for (const modification of plan?.modifications ?? []) {
      for (const sealedId of modification.sealedDoorIds ?? []) {
        const original = structure.doors.find((door) => door.id === sealedId)!;
        const relocated = plan!.projectedStructure.doors.find(
          (door) => door.linkedElementId === original.linkedElementId,
        );
        expect(relocated?.id).not.toBe(sealedId);
        expect(relocated?.wallId).toBe(original.wallId);
        const wall = plan!.projectedStructure.walls.find((item) => item.id === original.wallId)!;
        expect(isPointOnWall(relocated!.point, wall, 0.01)).toBe(true);
        expect(plan!.projectedStructure.walls.filter((item) => item.id === original.wallId)).toHaveLength(1);
      }
    }
  });
});

describe('验收 ⑫ · 无可行方案时给出具体原因', () => {
  it('房间过小导致门洞无法移位时返回具体原因而非「需手动」', () => {
    counter = 0;
    const els = [
      m('second_bedroom', 2, 2, { w: 0.9, h: 0.9, name: '迷你次卧' }),
      m('master_bedroom', 4, 2, { w: 0.9, h: 0.9, name: '迷你主卧' }),
      m('living_room', 3, 5, { w: 4, h: 3, name: '客厅' }),
      m('room_door', 2.45, 2, { r: 90, w: 0.3, name: '次卧门' }),
      m('room_door', 3.55, 2, { r: 270, w: 0.3, name: '主卧门' }),
      m('entry_door', 3, 6.5, { r: 180, name: '入户门' }),
    ];
    const res = run(els);
    const infeasible = res.plans.filter((p) => !p.feasible);
    for (const p of infeasible) {
      expect(p.infeasibleReason).toBeTruthy();
      expect(p.infeasibleReason).not.toContain('需手动');
      expect(
        ['房间尺寸不足', '没有足够墙面', '湿区', '通道宽度', '承重墙', '外墙', '重叠', '不可达', '遮挡窗户'].some(
          (k) => p.infeasibleReason!.includes(k),
        ),
      ).toBe(true);
    }
  });

  it('未标记承重墙时方案标记为概念候选', () => {
    const els = entryFacingBathroom();
    const res = generateCandidatePlans({
      elements: els,
      structure: buildStructureFromElements(els, false, PPM),
      options: OPTIONS,
    });
    expect(res.plans.every((p) => p.conceptOnly)).toBe(true);
    expect(res.plans.every((p) => p.risks.some((r) => r.includes('概念候选')))).toBe(true);
  });
});

describe('评分校准', () => {
  it('存在 high 问题时总分 ≤ 89', () => {
    for (const id of SAMPLES.map((s) => s.id)) {
      const r = analyzePlan(sampleElements(id), OPTIONS);
      if (r.issues.some((i) => i.severity === 'high')) {
        expect(r.overall).toBeLessThanOrEqual(89);
      }
    }
  });

  it('三个示例户型基础分均低于 94（区分度）', () => {
    for (const id of SAMPLES.map((s) => s.id)) {
      const r = analyzePlan(sampleElements(id), OPTIONS);
      expect(r.overall).toBeLessThan(94);
    }
  });
});
