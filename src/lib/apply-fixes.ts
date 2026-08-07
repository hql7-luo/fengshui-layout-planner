import { normalizeDeg } from './geometry';
import { issueIdentity } from './issue-diff';
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
  const resolved = new Set<string>();

  for (const issue of original.issues) {
    if (!issue.fix) {
      items.push({
        ruleId: issue.ruleId,
        ruleName: issue.name,
        severity: issue.severity,
        status: 'skipped',
        change: manualReason(issue.ruleId),
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
    const candidate = working.map((e, i) => (i === idx ? next : e));
    const candidateResult = analyzePlan(candidate, options);
    const candidateIdentities = new Set(candidateResult.issues.map(issueIdentity));
    const targetIdentity = issueIdentity(fresh);
    const reintroduced = [...resolved].some((identity) => candidateIdentities.has(identity));
    const madeWorse =
      candidateResult.counts.high > current.counts.high ||
      candidateResult.rawOverall < current.rawOverall;

    if (candidateIdentities.has(targetIdentity) || reintroduced || madeWorse) {
      items.push({
        ruleId: issue.ruleId,
        ruleName: issue.name,
        severity: issue.severity,
        status: 'skipped',
        change: candidateIdentities.has(targetIdentity)
          ? '自动调整无法在当前房间尺度内消除该问题，已保持原位'
          : reintroduced
            ? '该调整会重新引入已解决的问题，已保持原位'
            : '该调整会降低五维原始评分或新增高风险问题，已保持原位',
      });
      continue;
    }

    working = candidate;
    resolved.add(targetIdentity);

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

  return { elements: working, items };
}

function manualReason(ruleId: string): string {
  switch (ruleId) {
    case 'bathroom-in-center':
      return '涉及卫生间湿区、排水与防水位置，不能自动移动；需由建筑师或专业设计师评估';
    case 'entry-door-faces-bathroom':
    case 'entry-door-faces-bedroom-door':
    case 'door-faces-door':
    case 'bathroom-faces-kitchen':
      return '涉及门洞、墙体或隐私隔断，不能作为家具调整自动应用；请生成结构候选方案';
    case 'long-corridor':
    case 'living-room-far-from-entry':
      return '涉及主要动线和功能分区，自动移动单个家具无法安全解决';
    case 'kitchen-bathroom-too-close':
      return '涉及厨房与卫生间湿区及管线关系，不能自动移动房间';
    case 'missing-corner':
      return '属于整体户型轮廓问题，不能通过移动标注元素安全修复';
    case 'through-draft':
      return '需要玄关或隔断阻断直线视线，不能作为普通家具调整自动应用';
    default:
      return '当前规则没有满足安全约束的自动修正动作，请按规则建议手动调整';
  }
}
