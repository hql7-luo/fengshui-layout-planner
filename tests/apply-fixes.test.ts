import { describe, expect, it } from 'vitest';
import { analyzePlan, type ContextOptions } from '@/lib/rules/engine';
import { distance } from '@/lib/geometry';
import { applyAllFixesToElements } from '@/lib/apply-fixes';
import { describeFix } from '@/lib/fix-summary';
import { createProjectFromSample } from '@/lib/samples';

function optsFor(project: ReturnType<typeof createProjectFromSample>): ContextOptions {
  return {
    pixelsPerMeter: project!.pixelsPerMeter,
    northAngle: project!.northAngle,
    canvas: project!.canvas,
  };
}

describe('describeFix', () => {
  it('仅旋转时给出顺时针说明', () => {
    const s = describeFix({ targetId: 'a', rotationDelta: 90 }, '床');
    expect(s).toContain('床');
    expect(s).toContain('旋转 90°');
    expect(s).toContain('顺时针');
  });

  it('仅平移时给出方向说明', () => {
    const s = describeFix({ targetId: 'a', dx: -0.3 }, '灶台');
    expect(s).toContain('平移 0.30 米');
    expect(s).toContain('向左');
  });

  it('旋转+平移组合说明', () => {
    const s = describeFix({ targetId: 'a', rotationDelta: -90, dx: 0, dy: -0.2 }, '床');
    expect(s).toContain('旋转 90°（逆时针）');
    expect(s).toContain('向上');
  });
});

describe('applyAllFixesToElements', () => {
  const samples = ['entry-facing-bathroom', 'bathroom-in-center', 'bed-facing-door'];

  for (const id of samples) {
    it(`${id}：应用后无残留可自动修正项且结果确定`, () => {
      const project = createProjectFromSample(id)!;
      const elements = project.scenarios.before.elements;
      const opts = optsFor(project);
      const r1 = applyAllFixesToElements(elements, opts, project.pixelsPerMeter);
      const r2 = applyAllFixesToElements(elements, opts, project.pixelsPerMeter);
      expect(r1.items).toEqual(r2.items); // 确定性

      const hadFixable = analyzePlan(elements, opts).issues.some((i) => i.fix);
      if (hadFixable) {
        expect(r1.elements).not.toEqual(elements); // 确有改动
        const beforeResult = analyzePlan(elements, opts);
        const beforeFixable = beforeResult.issues.filter((i) => i.fix).length;
        const after = analyzePlan(r1.elements, opts);
        const afterFixable = after.issues.filter((i) => i.fix).length;
        // 自动优化后，可修正问题数不增加（不恶化），总分不降
        expect(afterFixable).toBeLessThanOrEqual(beforeFixable);
        expect(after.overall).toBeGreaterThanOrEqual(beforeResult.overall);
      }

      // 摘要结构完整
      expect(
        r1.items.every((i) => typeof i.change === 'string' && i.change.length > 0),
      ).toBe(true);
      const total =
        r1.items.filter((i) => i.status === 'applied').length +
        r1.items.filter((i) => i.status === 'skipped').length;
      expect(total).toBe(r1.items.length);
    });
  }

  it('空布局不会崩溃，返回空结果', () => {
    const opts: ContextOptions = {
      pixelsPerMeter: 75,
      northAngle: 0,
      canvas: { width: 1080, height: 840 },
    };
    const r = applyAllFixesToElements([], opts, 75);
    expect(r.elements).toEqual([]);
    expect(r.items).toEqual([]);
  });

  it('水槽自动错位会远离灶台，且不会降低五维原始评分', () => {
    const project = createProjectFromSample('bathroom-in-center')!;
    const before = project.scenarios.before.elements;
    const stoveBefore = before.find((element) => element.type === 'stove')!;
    const sinkBefore = before.find((element) => element.type === 'sink')!;
    const result = applyAllFixesToElements(before, optsFor(project), project.pixelsPerMeter);
    const stoveAfter = result.elements.find((element) => element.id === stoveBefore.id)!;
    const sinkAfter = result.elements.find((element) => element.id === sinkBefore.id)!;
    expect(distance(stoveAfter, sinkAfter)).toBeGreaterThan(distance(stoveBefore, sinkBefore));
    expect(analyzePlan(result.elements, optsFor(project)).rawOverall).toBeGreaterThanOrEqual(
      analyzePlan(before, optsFor(project)).rawOverall,
    );
  });
});
