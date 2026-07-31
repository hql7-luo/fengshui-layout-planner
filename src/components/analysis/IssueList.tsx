'use client';

import { useState } from 'react';
import { CATEGORY_LABELS, SEVERITY_LABELS } from '@/lib/scoring';
import type { Issue, Severity } from '@/lib/types';

const SEVERITY_STYLES: Record<Severity, string> = {
  high: 'border-clay/30 bg-clay-soft/60',
  medium: 'border-ochre/30 bg-ochre-soft/50',
  low: 'border-jade/25 bg-jade-soft/50',
};

const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-clay',
  medium: 'bg-ochre',
  low: 'bg-jade',
};

interface IssueListProps {
  issues: Issue[];
  /** 是否默认展开全部细节（报告页用 true） */
  defaultExpanded?: boolean;
  onFocus?: (issue: Issue) => void;
  /** 一键应用建议；仅当 issue.fix 存在时按钮才会出现 */
  onApply?: (issue: Issue) => void;
}

export function IssueList({ issues, defaultExpanded = false, onFocus, onApply }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-jade/25 bg-jade-soft/50 px-4 py-6 text-center">
        <p className="text-sm font-medium text-jade-deep">当前标注下未检测到规则冲突</p>
        <p className="mt-1 text-xs text-muted">
          若标注还不完整（例如尚未添加门窗或家具），检测结果会偏乐观。
        </p>
      </div>
    );
  }

  const groups: Array<{ severity: Severity; items: Array<{ issue: Issue; index: number }> }> = (
    ['high', 'medium', 'low'] as Severity[]
  ).map((severity) => ({
    severity,
    items: issues
      .map((issue, index) => ({ issue, index }))
      .filter((item) => item.issue.severity === severity),
  }));

  return (
    <div className="space-y-6">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.severity}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[group.severity]}`} />
              {SEVERITY_LABELS[group.severity]}
              <span className="text-xs font-normal text-muted">{group.items.length} 项</span>
            </h3>
            <ul className="mt-3 space-y-3">
              {group.items.map(({ issue, index }) => (
                <IssueCard
                  key={issue.key}
                  issue={issue}
                  index={index}
                  defaultExpanded={defaultExpanded}
                  onFocus={onFocus}
                  onApply={onApply}
                />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function IssueCard({
  issue,
  index,
  defaultExpanded,
  onFocus,
  onApply,
}: {
  issue: Issue;
  index: number;
  defaultExpanded: boolean;
  onFocus?: (issue: Issue) => void;
  onApply?: (issue: Issue) => void;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <li className={`print-block rounded-xl border p-4 ${SEVERITY_STYLES[issue.severity]}`}>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${SEVERITY_DOT[issue.severity]}`}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h4 className="text-sm font-semibold text-ink">{issue.name}</h4>
            <span className="rounded border border-line/80 bg-surface/70 px-1.5 py-0.5 text-[11px] text-muted">
              {CATEGORY_LABELS[issue.category]}
            </span>
            <span className="text-[11px] tabular-nums text-muted">
              扣 {issue.appliedPenalty} 分
            </span>
          </div>
          {issue.detail ? (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{issue.detail}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs no-print">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-jade underline-offset-2 hover:underline"
            >
              {open ? '收起说明' : '查看解释与建议'}
            </button>
            {onFocus ? (
              <button
                type="button"
                onClick={() => onFocus(issue)}
                className="text-ink-soft underline-offset-2 hover:underline"
              >
                在图上定位
              </button>
            ) : null}
            {issue.fix && onApply ? (
              <button
                type="button"
                onClick={() => onApply(issue)}
                className="rounded-md border border-jade/40 bg-jade/10 px-2 py-0.5 font-medium text-jade-deep transition hover:bg-jade/20"
              >
                一键应用建议
              </button>
            ) : null}
          </div>

          {open ? (
            <dl className="mt-3 space-y-2.5 border-t border-line/70 pt-3 text-xs leading-relaxed">
              <Block term="触发条件" text={issue.condition} />
              <Block term="传统解释" text={issue.traditional} />
              <Block term="现代解释" text={issue.modern} />
              <Block term="优化建议" text={issue.suggestion} highlight />
            </dl>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Block({
  term,
  text,
  highlight,
}: {
  term: string;
  text: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt
        className={`text-[11px] font-medium tracking-wide ${
          highlight ? 'text-jade-deep' : 'text-muted'
        }`}
      >
        {term}
      </dt>
      <dd className={`mt-0.5 ${highlight ? 'text-ink' : 'text-ink-soft'}`}>{text}</dd>
    </div>
  );
}
