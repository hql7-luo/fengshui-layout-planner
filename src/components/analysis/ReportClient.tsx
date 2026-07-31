'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { IssueList } from '@/components/analysis/IssueList';
import { PlanPreview } from '@/components/analysis/PlanPreview';
import { CategoryBars, IssueCounts, ScoreRing } from '@/components/analysis/ScoreSummary';
import { useAnalysis } from '@/hooks/use-analysis';
import { useHydrated } from '@/hooks/use-hydrated';
import { DISCLAIMER_TEXT, PRODUCT_NAME_ZH } from '@/lib/constants';
import { CATEGORY_DESCRIPTIONS, CATEGORY_LABELS, gradeOf, SCORE_CATEGORIES } from '@/lib/scoring';
import type { ApplyAllSummary, ApplyStatus, Issue, ScenarioKey } from '@/lib/types';
import { selectCurrentProject, useProjectStore } from '@/store/project-store';

const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  before: '改造前',
  after: '改造后',
};

export function ReportClient() {
  const hydrated = useHydrated();
  const project = useProjectStore(selectCurrentProject);
  const storeScenario = useProjectStore((s) => s.scenario);
  const applyFix = useProjectStore((s) => s.applyFix);
  const applyAllFixes = useProjectStore((s) => s.applyAllFixes);
  const copyScenario = useProjectStore((s) => s.copyScenario);
  const setScenario = useProjectStore((s) => s.setScenario);
  const [primary, setPrimary] = useState<ScenarioKey>(storeScenario);
  const [compareOn, setCompareOn] = useState(false);
  const [summary, setSummary] = useState<ApplyAllSummary | null>(null);

  /** 一键应用建议：作用于「优化后」场景；若当前在改造前，先复制方案再切换 */
  const handleApply = (issue: Issue) => {
    if (!issue.fix) return;
    if (primary === 'before') {
      copyScenario('before', 'after');
      setPrimary('after');
      setScenario('after');
    }
    applyFix('after', issue.fix);
  };

  /** 一键全部优化：作用于「优化后」场景；若当前在改造前，先复制方案再切换 */
  const handleApplyAll = () => {
    let target: ScenarioKey = primary;
    if (primary === 'before') {
      copyScenario('before', 'after');
      setPrimary('after');
      setScenario('after');
      target = 'after';
    }
    const result = applyAllFixes(target);
    setSummary(result);
  };

  const other: ScenarioKey = primary === 'before' ? 'after' : 'before';
  const primaryResult = useAnalysis(project, primary);
  const otherResult = useAnalysis(project, other);

  const otherHasContent = (project?.scenarios[other].elements.length ?? 0) > 0;
  const compare = compareOn && otherHasContent ? otherResult : null;

  const generatedAt = useMemo(
    () => (project ? new Date(project.updatedAt).toLocaleString('zh-CN') : ''),
    [project],
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">
        正在读取本地项目…
      </div>
    );
  }

  if (!project || !primaryResult) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-ink">暂无可生成报告的项目</h1>
        <p className="text-sm text-muted">请先在编辑器中标记房间与家具，再回到本页生成报告。</p>
        <Link
          href="/editor"
          className="rounded-lg bg-jade px-4 py-2 text-sm text-white transition hover:bg-jade-deep"
        >
          前往编辑器
        </Link>
      </div>
    );
  }

  const elements = project.scenarios[primary].elements;
  const grade = gradeOf(primaryResult.overall);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* 顶部操作条（打印时隐藏） */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/editor"
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-jade hover:text-jade-deep"
        >
          ← 返回编辑器
        </Link>

        <div className="flex items-center gap-1 rounded-lg bg-paper-deep p-0.5">
          {(['before', 'after'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPrimary(key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                primary === key ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {SCENARIO_LABELS[key]}
            </button>
          ))}
        </div>

        <label
          className={`flex items-center gap-1.5 text-xs ${
            otherHasContent ? 'text-ink-soft' : 'cursor-not-allowed text-muted/60'
          }`}
        >
          <input
            type="checkbox"
            checked={compareOn && otherHasContent}
            disabled={!otherHasContent}
            onChange={(e) => setCompareOn(e.target.checked)}
            className="accent-jade"
          />
          与「{SCENARIO_LABELS[other]}」对比
        </label>

        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-lg bg-jade px-4 py-1.5 text-sm font-medium text-white transition hover:bg-jade-deep"
        >
          打印 / 导出 PDF
        </button>
      </div>

      {/* 报告正文 */}
      <article className="space-y-8">
        <header className="print-block border-b border-line pb-5">
          <p className="text-xs tracking-wide text-muted">{PRODUCT_NAME_ZH} · 户型布局分析报告</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{project.name}</h1>
          <p className="mt-1.5 text-xs text-muted">
            方案：{SCENARIO_LABELS[primary]} · 标注元素 {elements.length} 个 · 比例尺{' '}
            {project.pixelsPerMeter} px/米 · 正北 {Math.round(project.northAngle)}° · 更新于{' '}
            {generatedAt}
          </p>
        </header>

        {/* 评分总览 */}
        <section className="print-block grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={primaryResult.overall} />
            <p className="text-sm font-medium text-ink">{grade.label}</p>
            {compare ? (
              <p className="text-xs text-muted">
                {SCENARIO_LABELS[other]} {compare.overall} 分
                <span
                  className={
                    primaryResult.overall - compare.overall >= 0
                      ? 'ml-1 text-jade'
                      : 'ml-1 text-clay'
                  }
                >
                  ({primaryResult.overall - compare.overall >= 0 ? '+' : ''}
                  {primaryResult.overall - compare.overall})
                </span>
              </p>
            ) : null}
          </div>
          <div className="space-y-4">
            <IssueCounts result={primaryResult} />
            <CategoryBars result={primaryResult} compare={compare} />
          </div>
        </section>

        {/* 户型标注图 */}
        <section className="print-block">
          <h2 className="mb-3 text-sm font-semibold text-ink">户型标注与问题位置</h2>
          <div className="rounded-xl border border-line bg-white p-3">
            <PlanPreview project={project} elements={elements} issues={primaryResult.issues} />
          </div>
          <p className="mt-2 text-xs text-muted">
            图中编号圆点对应下方问题清单序号；红色为高风险，黄色为中风险，绿色为一般建议。
          </p>
        </section>

        {/* 分类说明 */}
        <section className="print-block">
          <h2 className="mb-3 text-sm font-semibold text-ink">五维评分口径</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {SCORE_CATEGORIES.map((key) => (
              <div key={key} className="rounded-lg border border-line bg-white px-3 py-2.5">
                <dt className="flex items-baseline justify-between text-xs font-medium text-ink">
                  {CATEGORY_LABELS[key]}
                  <span className="tabular-nums text-sm text-jade-deep">
                    {primaryResult.categories[key]}
                  </span>
                </dt>
                <dd className="mt-1 text-[11px] leading-relaxed text-muted">
                  {CATEGORY_DESCRIPTIONS[key]}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 问题清单 */}
        <section className="print-block">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">
              问题清单与优化建议（{primaryResult.issues.length} 项）
            </h2>
            <div className="flex items-center gap-2 no-print">
              <button
                type="button"
                onClick={handleApplyAll}
                disabled={primaryResult.issues.length === 0}
                className="rounded-lg bg-jade px-4 py-1.5 text-sm font-medium text-white transition hover:bg-jade-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                一键全部优化
              </button>
            </div>
          </div>
          <IssueList issues={primaryResult.issues} defaultExpanded onApply={handleApply} />

          {summary ? (
            <ApplyAllSummaryPanel summary={summary} onClose={() => setSummary(null)} />
          ) : null}
        </section>

        {/* 对比方案缩略图 */}
        {compare ? (
          <section className="print-block">
            <h2 className="mb-3 text-sm font-semibold text-ink">
              对比方案：{SCENARIO_LABELS[other]}（{compare.overall} 分）
            </h2>
            <div className="rounded-xl border border-line bg-white p-3">
              <PlanPreview
                project={project}
                elements={project.scenarios[other].elements}
                issues={compare.issues}
              />
            </div>
          </section>
        ) : null}

        <footer className="print-block border-t border-line pt-4">
          <h2 className="text-xs font-semibold text-ink">免责声明</h2>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{DISCLAIMER_TEXT}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            本报告由固定规则引擎按既定阈值计算生成，结果取决于你在编辑器中的标注位置与比例尺设置。
            标注调整后评分会随之变化，请以实际测量与专业人员意见为准。
          </p>
        </footer>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 一键全部优化结果摘要                                                */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: ApplyStatus }) {
  const applied = status === 'applied';
  return (
    <span
      className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        applied ? 'bg-jade/15 text-jade-deep' : 'bg-clay/15 text-clay'
      }`}
    >
      {applied ? '已优化' : '需手动'}
    </span>
  );
}

function ApplyAllSummaryPanel({
  summary,
  onClose,
}: {
  summary: ApplyAllSummary;
  onClose: () => void;
}) {
  const delta = summary.finishedScore - summary.startedScore;
  return (
    <div className="no-print mt-5 rounded-xl border border-jade/30 bg-paper-deep p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">优化结果摘要</h3>
          <p className="mt-1 text-xs text-muted">
            已自动优化{' '}
            <span className="font-medium text-jade-deep">{summary.appliedCount}</span> 项，需手动处理{' '}
            <span className="font-medium text-clay">{summary.skippedCount}</span> 项；总分{' '}
            <span className="tabular-nums">{summary.startedScore}</span> →{' '}
            <span className="tabular-nums font-medium text-ink">{summary.finishedScore}</span>
            <span className={delta >= 0 ? 'ml-1 text-jade' : 'ml-1 text-clay'}>
              （{delta >= 0 ? '+' : ''}
              {delta}）
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          收起
        </button>
      </div>

      <ul className="mt-3 divide-y divide-line/70">
        {summary.items.map((item, i) => (
          <li key={`${item.ruleId}-${i}`} className="flex items-start gap-3 py-2">
            <StatusBadge status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink">{item.ruleName}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.change}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        自动优化仅调整家具朝向与相对位置，不改变墙体与房间结构；结构性问题仍需你手动调整。
        如需回退，请在编辑器中使用「撤销」（一步即可恢复全部自动优化）。
      </p>
    </div>
  );
}
