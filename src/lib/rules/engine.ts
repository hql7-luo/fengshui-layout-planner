import {
  CATEGORY_WEIGHTS,
  SCORE_CATEGORIES,
  SEVERITY_ORDER,
  decayFactor,
} from '../scoring';
import type {
  AnalysisResult,
  Issue,
  PlanElement,
  ScoreCategory,
  Severity,
} from '../types';
import { buildContext, type ContextOptions } from './context';
import { RULES } from './definitions';

function emptyCategories(): Record<ScoreCategory, number> {
  return {
    fengshui: 100,
    circulation: 100,
    privacy: 100,
    function: 100,
    lighting: 100,
  };
}

/**
 * 规则引擎主入口：完全确定性，不依赖随机数、时间或网络。
 * 相同输入必然得到完全一致的评分与问题列表。
 */
export function analyzePlan(
  elements: PlanElement[],
  options: ContextOptions,
): AnalysisResult {
  const ctx = buildContext(elements, options);
  const categories = emptyCategories();
  const issues: Issue[] = [];

  for (const rule of RULES) {
    const hits = rule.evaluate(ctx).slice(0, rule.maxOccurrences);
    hits.forEach((hit, index) => {
      const factor = decayFactor(index);
      let applied = 0;
      for (const [key, value] of Object.entries(rule.impacts) as Array<
        [ScoreCategory, number]
      >) {
        const penalty = value * factor;
        categories[key] -= penalty;
        applied += penalty;
      }
      issues.push({
        key: `${rule.id}#${index}`,
        ruleId: rule.id,
        name: rule.name,
        category: rule.category,
        severity: rule.severity,
        impacts: rule.impacts,
        condition: rule.condition,
        traditional: rule.traditional,
        modern: rule.modern,
        suggestion: rule.suggestion,
        elementIds: hit.elementIds,
        marker: hit.marker,
        detail: hit.detail,
        fix: hit.fix,
        appliedPenalty: Math.round(applied * 10) / 10,
      });
    });
  }

  for (const key of SCORE_CATEGORIES) {
    categories[key] = Math.max(0, Math.min(100, Math.round(categories[key])));
  }

  const overall = Math.round(
    SCORE_CATEGORIES.reduce((sum, key) => sum + categories[key] * CATEGORY_WEIGHTS[key], 0),
  );

  issues.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (b.appliedPenalty !== a.appliedPenalty) return b.appliedPenalty - a.appliedPenalty;
    return a.key.localeCompare(b.key);
  });

  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.severity] += 1;

  return {
    overall,
    categories,
    issues,
    counts,
    elementCount: elements.length,
  };
}

export { RULES } from './definitions';
export { buildContext } from './context';
export type { ContextOptions } from './context';
