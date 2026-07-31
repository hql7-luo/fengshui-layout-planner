import { describe, expect, it } from 'vitest';
import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { buildContext } from '@/lib/rules/context';
import { RULES, RULE_MAP, totalPenaltyOf } from '@/lib/rules/definitions';
import { analyzePlan } from '@/lib/rules/engine';
import { SAMPLE_CANVAS, SAMPLE_PIXELS_PER_METER, sampleElements, SAMPLES } from '@/lib/samples';
import { CATEGORY_WEIGHTS, SCORE_CATEGORIES } from '@/lib/scoring';
import type { ElementType, PlanElement } from '@/lib/types';

const PPM = 60;
const OPTIONS = {
  pixelsPerMeter: PPM,
  northAngle: 0,
  canvas: { width: 1200, height: 900 },
};

let counter = 0;
/** 以米为单位快速构造元素 */
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

function ruleIds(elements: PlanElement[]): string[] {
  return analyzePlan(elements, OPTIONS).issues.map((i) => i.ruleId);
}

/* ------------------------------------------------------------------ */
/* 规则定义自身的完整性                                                */
/* ------------------------------------------------------------------ */

describe('规则定义', () => {
  it('第一版包含 18 条规则', () => {
    expect(RULES).toHaveLength(18);
  });

  it('规则 id 唯一', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });

  it('每条规则都有名称、分类、严重程度与四段文案', () => {
    for (const rule of RULES) {
      expect(rule.name.length).toBeGreaterThan(0);
      expect(SCORE_CATEGORIES).toContain(rule.category);
      expect(['high', 'medium', 'low']).toContain(rule.severity);
      expect(rule.condition.length).toBeGreaterThan(0);
      expect(rule.traditional.length).toBeGreaterThan(0);
      expect(rule.modern.length).toBeGreaterThan(0);
      expect(rule.suggestion.length).toBeGreaterThan(0);
      expect(rule.maxOccurrences).toBeGreaterThanOrEqual(1);
    }
  });

  it('每条规则的扣分为正且不超过 20', () => {
    for (const rule of RULES) {
      const total = totalPenaltyOf(rule);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(20);
    }
  });

  it('RULE_MAP 可按 id 索引到规则', () => {
    for (const rule of RULES) {
      expect(RULE_MAP.get(rule.id)).toBe(rule);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 引擎基础行为                                                        */
/* ------------------------------------------------------------------ */

describe('analyzePlan 基础行为', () => {
  it('空户型得满分且无问题', () => {
    const result = analyzePlan([], OPTIONS);
    expect(result.overall).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.elementCount).toBe(0);
    for (const key of SCORE_CATEGORIES) {
      expect(result.categories[key]).toBe(100);
    }
  });

  it('评分是确定性的：相同输入多次运行结果完全一致', () => {
    const elements = sampleElements('bed-facing-door');
    const options = {
      pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
      northAngle: 0,
      canvas: SAMPLE_CANVAS,
    };
    const a = analyzePlan(elements, options);
    const b = analyzePlan(elements, options);
    const c = analyzePlan(elements.map((e) => ({ ...e })), options);
    expect(b).toEqual(a);
    expect(c.overall).toBe(a.overall);
    expect(c.issues.map((i) => i.key)).toEqual(a.issues.map((i) => i.key));
  });

  it('总分等于五维加权求和', () => {
    const elements = sampleElements('bathroom-in-center');
    const result = analyzePlan(elements, {
      pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
      northAngle: 0,
      canvas: SAMPLE_CANVAS,
    });
    const expected = Math.round(
      SCORE_CATEGORIES.reduce(
        (sum, key) => sum + result.categories[key] * CATEGORY_WEIGHTS[key],
        0,
      ),
    );
    expect(result.overall).toBe(expected);
  });

  it('所有分数被限制在 0-100', () => {
    // 构造一个极端糟糕的布局，确保不会出现负分
    const elements: PlanElement[] = [
      m('living_room', 5, 5, { w: 4, h: 4 }),
      m('bathroom', 5, 5, { w: 2, h: 2 }),
      m('kitchen', 6.2, 5, { w: 2, h: 2 }),
      m('master_bedroom', 2, 2, { w: 3, h: 3 }),
      m('entry_door', 5, 8, { r: 180 }),
      m('room_door', 5, 6.1, { r: 0 }),
      m('bed', 2, 2),
      m('mirror', 2, 3.4, { r: 180 }),
      m('stove', 6, 5),
      m('sink', 6.3, 5),
    ];
    const result = analyzePlan(elements, OPTIONS);
    for (const key of SCORE_CATEGORIES) {
      expect(result.categories[key]).toBeGreaterThanOrEqual(0);
      expect(result.categories[key]).toBeLessThanOrEqual(100);
    }
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('问题按严重程度排序（高风险在前）', () => {
    const result = analyzePlan(sampleElements('bed-facing-door'), {
      pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
      northAngle: 0,
      canvas: SAMPLE_CANVAS,
    });
    const order = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < result.issues.length; i += 1) {
      expect(order[result.issues[i].severity]).toBeGreaterThanOrEqual(
        order[result.issues[i - 1].severity],
      );
    }
  });

  it('counts 与 issues 的严重程度分布一致', () => {
    const result = analyzePlan(sampleElements('entry-facing-bathroom'), {
      pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
      northAngle: 0,
      canvas: SAMPLE_CANVAS,
    });
    const manual = { high: 0, medium: 0, low: 0 };
    for (const issue of result.issues) manual[issue.severity] += 1;
    expect(result.counts).toEqual(manual);
  });

  it('重复命中同一规则时扣分递减', () => {
    const one = analyzePlan(
      [
        m('master_bedroom', 3, 3, { w: 4, h: 4 }),
        m('bed', 3, 2.2),
        m('room_door', 3, 5, { r: 0 }),
      ],
      OPTIONS,
    );
    const two = analyzePlan(
      [
        m('master_bedroom', 3, 3, { w: 4, h: 4 }),
        m('bed', 3, 2.2),
        m('room_door', 3, 5, { r: 0 }),
        m('second_bedroom', 9, 3, { w: 4, h: 4 }),
        m('bed', 9, 2.2),
        m('room_door', 9, 5, { r: 0 }),
      ],
      OPTIONS,
    );
    const bedIssuesOne = one.issues.filter((i) => i.ruleId === 'bed-faces-door');
    const bedIssuesTwo = two.issues.filter((i) => i.ruleId === 'bed-faces-door');
    expect(bedIssuesOne).toHaveLength(1);
    expect(bedIssuesTwo).toHaveLength(2);
    // 第二次命中的实际扣分应小于第一次
    expect(bedIssuesTwo[1].appliedPenalty).toBeLessThan(bedIssuesTwo[0].appliedPenalty);
  });
});

/* ------------------------------------------------------------------ */
/* 单条规则触发                                                        */
/* ------------------------------------------------------------------ */

describe('单条规则触发验证', () => {
  it('entry-door-faces-bathroom：入户门正对卫生间', () => {
    const ids = ruleIds([
      m('living_room', 3, 3, { w: 5, h: 4 }),
      m('bathroom', 3, 7.5, { w: 2.2, h: 1.8 }),
      m('entry_door', 3, 0.4, { r: 0 }),
    ]);
    expect(ids).toContain('entry-door-faces-bathroom');
  });

  it('入户门与卫生间不在同一轴线上时不触发', () => {
    const ids = ruleIds([
      m('living_room', 3, 3, { w: 5, h: 4 }),
      m('bathroom', 9, 7.5, { w: 2.2, h: 1.8 }),
      m('entry_door', 3, 0.4, { r: 0 }),
    ]);
    expect(ids).not.toContain('entry-door-faces-bathroom');
  });

  it('bathroom-in-center：卫生间位于住宅中心且无外墙', () => {
    const ids = ruleIds([
      m('living_room', 3, 3, { w: 5, h: 4 }),
      m('master_bedroom', 9, 3, { w: 5, h: 4 }),
      m('second_bedroom', 3, 8, { w: 5, h: 4 }),
      m('kitchen', 9, 8, { w: 5, h: 4 }),
      m('bathroom', 6, 5.5, { w: 2, h: 1.8 }),
    ]);
    expect(ids).toContain('bathroom-in-center');
  });

  it('卫生间靠外墙时不触发中心卫生间规则', () => {
    const ids = ruleIds([
      m('living_room', 3, 3, { w: 5, h: 4 }),
      m('master_bedroom', 9, 3, { w: 5, h: 4 }),
      m('second_bedroom', 3, 8, { w: 5, h: 4 }),
      m('kitchen', 9, 8, { w: 5, h: 4 }),
      m('bathroom', 0.9, 5.5, { w: 1.8, h: 1.8 }),
    ]);
    expect(ids).not.toContain('bathroom-in-center');
  });

  it('bed-faces-door：床尾正对房门', () => {
    const ids = ruleIds([
      m('master_bedroom', 3, 3, { w: 4, h: 4 }),
      m('bed', 3, 2.2),
      m('room_door', 3, 5, { r: 0 }),
    ]);
    expect(ids).toContain('bed-faces-door');
  });

  it('床侧对房门时不触发', () => {
    const ids = ruleIds([
      m('master_bedroom', 3, 3, { w: 4, h: 4 }),
      m('bed', 3, 2.2, { r: 90 }),
      m('room_door', 3, 5, { r: 0 }),
    ]);
    expect(ids).not.toContain('bed-faces-door');
  });

  it('mirror-faces-bed：镜子正对床', () => {
    const ids = ruleIds([
      m('master_bedroom', 3, 3, { w: 4, h: 4 }),
      m('bed', 3, 2.2),
      m('mirror', 3, 4.3, { r: 180 }),
    ]);
    expect(ids).toContain('mirror-faces-bed');
  });

  it('stove-sink-too-close：灶台与水槽间距过近', () => {
    const ids = ruleIds([
      m('kitchen', 3, 3, { w: 3, h: 3 }),
      m('stove', 2.7, 3.6),
      m('sink', 3.3, 3.6),
    ]);
    expect(ids).toContain('stove-sink-too-close');
  });

  it('灶台与水槽间距充足时不触发', () => {
    const ids = ruleIds([
      m('kitchen', 3, 3, { w: 5, h: 3 }),
      m('stove', 1.4, 3.6),
      m('sink', 4.6, 3.6),
    ]);
    expect(ids).not.toContain('stove-sink-too-close');
  });

  it('bed-head-no-wall：床头远离墙体', () => {
    const ids = ruleIds([
      m('master_bedroom', 4, 4, { w: 6, h: 6 }),
      m('bed', 4, 4),
    ]);
    expect(ids).toContain('bed-head-no-wall');
  });

  it('床头贴墙时不触发', () => {
    const ids = ruleIds([
      m('master_bedroom', 4, 4, { w: 6, h: 6 }),
      m('bed', 4, 2.1),
    ]);
    expect(ids).not.toContain('bed-head-no-wall');
  });
});

/* ------------------------------------------------------------------ */
/* 上下文                                                              */
/* ------------------------------------------------------------------ */

describe('buildContext', () => {
  it('按类别拆分元素', () => {
    const elements = [
      m('living_room', 3, 3, { w: 4, h: 4 }),
      m('entry_door', 3, 5.2),
      m('sofa', 3, 2),
    ];
    const ctx = buildContext(elements, OPTIONS);
    expect(ctx.rooms).toHaveLength(1);
    expect(ctx.openings).toHaveLength(1);
    expect(ctx.furniture).toHaveLength(1);
  });

  it('无房间时 bounds 退化为画布尺寸', () => {
    const ctx = buildContext([], OPTIONS);
    expect(ctx.bounds).toEqual({ x: 0, y: 0, ...OPTIONS.canvas });
  });

  it('roomOf 能定位家具所属房间', () => {
    const room = m('master_bedroom', 3, 3, { w: 4, h: 4 });
    const bed = m('bed', 3, 2.2);
    const ctx = buildContext([room, bed], OPTIONS);
    expect(ctx.roomOf(bed)?.id).toBe(room.id);
  });

  it('米与像素换算互为逆运算', () => {
    const ctx = buildContext([], OPTIONS);
    expect(ctx.toMeters(ctx.toPixels(3.5))).toBeCloseTo(3.5, 6);
    expect(ctx.toPixels(1)).toBe(PPM);
  });
});

/* ------------------------------------------------------------------ */
/* 示例户型                                                            */
/* ------------------------------------------------------------------ */

describe('示例户型', () => {
  it('内置 3 个示例', () => {
    expect(SAMPLES).toHaveLength(3);
  });

  it.each(SAMPLES.map((s) => [s.id, s.name] as const))(
    '%s 能被分析且命中重点规则',
    (id) => {
      const sample = SAMPLES.find((s) => s.id === id)!;
      const result = analyzePlan(sampleElements(id), {
        pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
        northAngle: sample.northAngle,
        canvas: SAMPLE_CANVAS,
      });
      expect(result.elementCount).toBeGreaterThan(10);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.overall).toBeLessThan(100);

      const hit = new Set(result.issues.map((i) => i.ruleId));
      for (const ruleId of sample.highlightRules) {
        expect(hit, `${id} 应命中 ${ruleId}`).toContain(ruleId);
      }
    },
  );

  it('每个问题都带有画布内的标注坐标', () => {
    for (const sample of SAMPLES) {
      const result = analyzePlan(sampleElements(sample.id), {
        pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
        northAngle: sample.northAngle,
        canvas: SAMPLE_CANVAS,
      });
      for (const issue of result.issues) {
        expect(Number.isFinite(issue.marker.x)).toBe(true);
        expect(Number.isFinite(issue.marker.y)).toBe(true);
        expect(issue.elementIds.length).toBeGreaterThan(0);
      }
    }
  });
});
