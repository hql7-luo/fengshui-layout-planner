import type { ScoreCategory, Severity } from './types';

export const SCORE_CATEGORIES: ScoreCategory[] = [
  'fengshui',
  'circulation',
  'privacy',
  'function',
  'lighting',
];

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  fengshui: '传统风水',
  circulation: '空间动线',
  privacy: '隐私程度',
  function: '功能布局',
  lighting: '采光通风',
};

export const CATEGORY_DESCRIPTIONS: Record<ScoreCategory, string> = {
  fengshui: '传统居住文化中关于门位、床位、水火关系等经验性布局约定。',
  circulation: '入户到各功能区的行走路径是否顺畅、是否存在无效通道。',
  privacy: '从公共区域到私密区域的视线层级与声音隔离程度。',
  function: '各功能区的尺度、相邻关系与操作动线是否合理。',
  lighting: '自然采光面与通风路径的可用性。',
};

/** 五个维度权重，合计为 1 */
export const CATEGORY_WEIGHTS: Record<ScoreCategory, number> = {
  fengshui: 0.2,
  circulation: 0.2,
  privacy: 0.2,
  function: 0.2,
  lighting: 0.2,
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: '高风险问题',
  medium: '中风险问题',
  low: '一般建议',
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * 结构性问题规则：涉及门位、动线、隐私层级等「空间结构」类问题。
 * 用于总分上限判定：存在两个及以上结构性 medium 问题时，总分原则上不高于 92。
 */
export const STRUCTURAL_RULE_IDS = new Set([
  'entry-door-faces-bathroom',
  'entry-door-faces-bedroom-door',
  'door-faces-door',
  'bathroom-in-center',
  'long-corridor',
  'through-draft',
  'living-room-far-from-entry',
  'master-bedroom-privacy',
  'bathroom-faces-kitchen',
]);

/** 总分硬上限（依据问题严重度） */
export const SCORE_CAP_HIGH = 89; // 存在任意 high 问题时
export const SCORE_CAP_STRUCTURAL_MEDIUM = 92; // 存在两个及以上结构性 medium 问题时

/** 同一规则重复命中时的扣分衰减系数（适当放缓，避免多个问题被过度稀释） */
export const OCCURRENCE_DECAY = [1, 0.8, 0.6];

export function decayFactor(index: number): number {
  return OCCURRENCE_DECAY[index] ?? 0.3;
}

export function gradeOf(score: number): { label: string; tone: 'good' | 'fair' | 'poor' } {
  if (score >= 85) return { label: '优秀', tone: 'good' };
  if (score >= 70) return { label: '良好', tone: 'good' };
  if (score >= 55) return { label: '一般', tone: 'fair' };
  return { label: '需重点优化', tone: 'poor' };
}

export function scoreColor(score: number): string {
  if (score >= 85) return '#3f7d5c';
  if (score >= 70) return '#5f8f6d';
  if (score >= 55) return '#c08a3e';
  return '#b8523f';
}
