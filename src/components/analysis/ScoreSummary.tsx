import { CATEGORY_LABELS, SCORE_CATEGORIES, gradeOf, scoreColor } from '@/lib/scoring';
import type { AnalysisResult } from '@/lib/types';

export function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const grade = gradeOf(score);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#eae6dd"
          strokeWidth={9}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums text-ink">{score}</span>
        <span className="mt-0.5 text-xs text-muted">{grade.label}</span>
      </div>
    </div>
  );
}

export function CategoryBars({
  result,
  compare,
}: {
  result: AnalysisResult;
  compare?: AnalysisResult | null;
}) {
  return (
    <ul className="space-y-3">
      {SCORE_CATEGORIES.map((key) => {
        const value = result.categories[key];
        const other = compare?.categories[key];
        const delta = other === undefined ? null : value - other;
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-soft">{CATEGORY_LABELS[key]}</span>
              <span className="tabular-nums text-ink">
                {value}
                {delta !== null && delta !== 0 ? (
                  <span className={delta > 0 ? 'ml-1 text-jade' : 'ml-1 text-clay'}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-deep">
              <div
                className="h-full rounded-full"
                style={{ width: `${value}%`, backgroundColor: scoreColor(value) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function IssueCounts({ result }: { result: AnalysisResult }) {
  const items = [
    { key: 'high', label: '高风险', value: result.counts.high, className: 'text-clay' },
    { key: 'medium', label: '中风险', value: result.counts.medium, className: 'text-ochre' },
    { key: 'low', label: '一般建议', value: result.counts.low, className: 'text-jade-deep' },
  ];
  return (
    <ul className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <li key={item.key} className="rounded-lg border border-line bg-paper/60 px-3 py-2">
          <p className={`text-lg font-semibold tabular-nums ${item.className}`}>{item.value}</p>
          <p className="text-[11px] text-muted">{item.label}</p>
        </li>
      ))}
    </ul>
  );
}

export function ScoreCapNotice({ result }: { result: AnalysisResult }) {
  if (!result.scoreCap) return null;
  return (
    <p className="rounded-lg border border-ochre/30 bg-ochre-soft/60 px-3 py-2 text-xs leading-relaxed text-ink-soft">
      {result.scoreCap.reason}
      {result.rawOverall > result.overall ? ` 五维原始等权分为 ${result.rawOverall} 分。` : ''}
    </p>
  );
}
