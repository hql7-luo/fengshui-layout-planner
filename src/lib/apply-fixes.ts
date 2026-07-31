import { normalizeDeg } from './geometry';
import { analyzePlan, type ContextOptions } from './rules/engine';
import { describeFix } from './fix-summary';
import type { ApplyAllItem, PlanElement } from './types';

/**
 * 一键全部优化（纯函数，确定性）。
 *
 * 做法：
 * 1. 对原始布局做一次分析，按问题清单（severity 降序）逐项处理；
 * 2. 每处理一条前**重新分析当前工作副本**，用最新位置生成修正量，
 *    这样同元素出现多条修正（如「床正对门」+「床头无靠」）时旋转/平移能正确叠加；
 * 3. 若前序修正已消除该问题，则标记为「已消除」跳过，避免重复/振荡；
 * 4. 无「一键应用」方案的规则（结构性 / 涉及墙体）标记为「需手动」。
 *
 * 返回新的元素数组与逐条结果，便于上层生成优化摘要并整批记录一次撤销。
 */
export function applyAllFixesToElements(
  elements: PlanElement[],
  options: ContextOptions,
  pixelsPerMeter: number,
): { elements: PlanElement[]; items: ApplyAllItem[] } {
  const original = analyzePlan(elements, options);
  let working: PlanElement[] = elements.map((e) => ({ ...e }));
  const items: ApplyAllItem[] = [];

  for (const issue of original.issues) {
    if (!issue.fix) {
      items.push({
        ruleId: issue.ruleId,
        ruleName: issue.name,
        severity: issue.severity,
        status: 'skipped',
        change: '涉及墙体或房间位置，需手动调整布局',
      });
      continue;
    }

    // 用当前工作副本重新分析，取该规则在最新位置上的修正量
    const current = analyzePlan(working, options);
    const fresh = current.issues.find(
      (i) => i.ruleId === issue.ruleId && i.fix?.targetId === issue.fix?.targetId,
    );

    if (!fresh || !fresh.fix) {
      items.push({
        ruleId: issue.ruleId,
        ruleName: issue.name,
        severity: issue.severity,
        status: 'skipped',
        change: '前序优化已消除该问题',
      });
      continue;
    }

    const idx = working.findIndex((e) => e.id === fresh.fix!.targetId);
    const target = working[idx];
    const next: PlanElement = {
      ...target,
      x: target.x + (fresh.fix.dx ?? 0) * pixelsPerMeter,
      y: target.y + (fresh.fix.dy ?? 0) * pixelsPerMeter,
      rotation: normalizeDeg(target.rotation + (fresh.fix.rotationDelta ?? 0)),
    };
    working = working.map((e, i) => (i === idx ? next : e));

    items.push({
      ruleId: issue.ruleId,
      ruleName: issue.name,
      severity: issue.severity,
      status: 'applied',
      change: describeFix(fresh.fix, target.name),
      targetName: target.name,
      targetId: target.id,
    });
  }

  // 终检：若某项「已优化」后该规则在最新布局上仍触发（与另一项优化冲突），
  // 则如实降级为「需手动」，避免摘要给出虚假的「已优化」。
  const finalResult = analyzePlan(working, options);
  const stillFixable = new Set(
    finalResult.issues
      .filter((i) => i.fix)
      .map((i) => `${i.ruleId}:${i.fix!.targetId}`),
  );
  for (const item of items) {
    if (item.status === 'applied' && item.targetId) {
      const key = `${item.ruleId}:${item.targetId}`;
      if (stillFixable.has(key)) {
        item.status = 'skipped';
        item.change = '优化后该问题仍存在（布局约束冲突，需手动微调）';
      }
    }
  }

  return { elements: working, items };
}
