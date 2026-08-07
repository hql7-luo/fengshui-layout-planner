import type { Issue } from './types';

/**
 * 跨重算稳定识别同一个规则问题。
 * Issue.key 使用命中序号，前一个命中消失后序号会漂移，不能用于 before/after 差异。
 */
export function issueIdentity(issue: Issue): string {
  const elements = [...issue.elementIds].sort().join(',');
  const location = elements
    ? ''
    : `@${Math.round(issue.marker.x / 5) * 5},${Math.round(issue.marker.y / 5) * 5}`;
  return `${issue.ruleId}:${elements}${location}`;
}

export function issueDigest(issue: Issue): Pick<Issue, 'key' | 'ruleId' | 'name' | 'severity'> {
  return {
    key: issue.key,
    ruleId: issue.ruleId,
    name: issue.name,
    severity: issue.severity,
  };
}
