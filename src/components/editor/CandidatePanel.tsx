'use client';

import { useProjectStore } from '@/store/project-store';
import { CATEGORY_LABELS, SCORE_CATEGORIES } from '@/lib/scoring';

export function CandidatePanel() {
  const candidates = useProjectStore((s) => s.candidates);
  const previewPlanId = useProjectStore((s) => s.previewPlanId);
  const generateCandidates = useProjectStore((s) => s.generateCandidates);
  const setPreviewPlan = useProjectStore((s) => s.setPreviewPlan);
  const applyCandidate = useProjectStore((s) => s.applyCandidate);
  const discardCandidates = useProjectStore((s) => s.discardCandidates);

  if (!candidates) {
    return (
      <div className="rounded-lg border border-line bg-white p-3 text-sm">
        <h3 className="mb-2 font-semibold text-ink">结构优化方案</h3>
        <p className="mb-3 text-xs text-muted">
          基于当前户型生成 A/B/C 候选：最小改动、综合平衡、评分最高。只有明确标记为“非承重墙”的共享墙才能自动移动；外墙、承重墙和未知墙体保持不变。
        </p>
        <button
          type="button"
          onClick={() => generateCandidates()}
          className="w-full rounded-lg bg-jade px-3 py-2 text-sm font-medium text-white transition hover:bg-jade-deep"
        >
          生成结构优化方案
        </button>
      </div>
    );
  }

  const activePlan = candidates.plans.find((p) => p.id === previewPlanId) ?? candidates.plans[0];
  const activeIndex = candidates.plans.findIndex((plan) => plan.id === activePlan?.id);
  const duplicateOf = activePlan
    ? candidates.plans.slice(0, activeIndex).find((plan) =>
        JSON.stringify(plan.modifications) === JSON.stringify(activePlan.modifications),
      )
    : undefined;

  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-ink">结构优化方案</h3>
        <button type="button" onClick={() => discardCandidates()} className="text-xs text-muted hover:text-ink">
          取消
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {candidates.plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => setPreviewPlan(plan.id)}
            aria-pressed={activePlan?.id === plan.id}
            data-testid={`candidate-${plan.id}`}
            className={
              'rounded border px-2 py-1.5 text-xs font-medium transition ' +
              (previewPlanId === plan.id || (!previewPlanId && plan.id === 'A')
                ? 'border-jade bg-jade/10 text-jade-deep'
                : 'border-line bg-white text-ink-soft hover:border-jade hover:text-jade-deep')
            }
          >
            <span className="block">方案 {plan.id}</span>
            <span className="block text-[10px] opacity-80">{plan.feasible ? plan.predictedScore : '—'}</span>
          </button>
        ))}
      </div>

      {activePlan && (
        <div className="space-y-2 text-xs">
          <p className="font-medium text-ink">{activePlan.title}</p>
              {activePlan.conceptOnly && activePlan.modifications.some((modification) =>
                modification.kind !== 'furniture-fix'
              ) && (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-700">
              未标记承重墙，本方案为概念候选，不可直接施工。
            </p>
          )}
          {!activePlan.feasible ? (
            <p className="rounded bg-clay-soft px-2 py-1 text-clay">不可行：{activePlan.infeasibleReason}</p>
          ) : (
            <>
              <p className="text-muted">
                预测评分 {activePlan.predictedScore}（原 {activePlan.originalScore}）· 解决{' '}
                {activePlan.solvedIssues.length} 项 · 新增 {activePlan.introducedIssues.length} 项 ·{' '}
                改动程度 {activePlan.changeDegree === 'minimal' ? '低' : activePlan.changeDegree === 'balanced' ? '中' : '高'}
                （成本点 {activePlan.changeCost}）
              </p>
              <p className="rounded bg-jade-soft/60 px-2 py-1 text-jade-deep">
                画布预览：原墙为灰色虚线，新墙为绿色实线；红叉为删除门洞，绿色标记为新门洞；面积增减区域使用红/绿半透明覆盖。
              </p>
              {duplicateOf ? (
                <p className="rounded bg-paper-deep px-2 py-1 text-muted">
                  当前约束下与方案 {duplicateOf.id} 的安全改动相同；系统未为凑足差异制造额外改动。
                </p>
              ) : null}
              {activePlan.modifications.length > 0 && (
                <ul className="space-y-1 text-muted">
                  {activePlan.modifications.map((m, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-jade">•</span>
                      <span><strong className="font-medium text-ink-soft">{m.label}：</strong>{m.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              {activePlan.solvedIssues.length > 0 ? (
                <p className="text-jade-deep">解决：{activePlan.solvedIssues.map((issue) => issue.name).join('、')}</p>
              ) : null}
              {activePlan.introducedIssues.length > 0 ? (
                <p className="text-clay">新增：{activePlan.introducedIssues.map((issue) => issue.name).join('、')}</p>
              ) : null}
              <details>
                <summary className="cursor-pointer text-muted">查看五维评分变化</summary>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
                  {SCORE_CATEGORIES.map((category) => (
                    <li key={category} className="flex justify-between gap-2">
                      <span>{CATEGORY_LABELS[category]}</span>
                      <span className="tabular-nums">{activePlan.predictedCategories[category]}</span>
                    </li>
                  ))}
                </ul>
              </details>
              {activePlan.risks.length > 0 && (
                <div className="rounded border border-clay/25 bg-clay-soft/50 px-2 py-1.5">
                  <p className="mb-1 font-medium text-clay">风险提示</p>
                  <ul className="list-disc space-y-1 pl-4 text-clay/80">
                    {activePlan.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => applyCandidate(activePlan?.id ?? 'A')}
          disabled={!activePlan?.feasible}
          data-testid="apply-candidate"
          className="flex-1 rounded-lg bg-jade px-3 py-2 text-sm font-medium text-white transition hover:bg-jade-deep disabled:opacity-40"
        >
          应用方案
        </button>
        <button
          type="button"
          onClick={() => discardCandidates()}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft transition hover:border-jade hover:text-jade-deep"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
