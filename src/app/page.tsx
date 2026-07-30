import Link from 'next/link';
import { StartPanel } from '@/components/home/StartPanel';
import { DISCLAIMER_TEXT, FEATURES, USAGE_STEPS } from '@/lib/constants';
import { RULES } from '@/lib/rules/definitions';
import { CATEGORY_LABELS, SCORE_CATEGORIES } from '@/lib/scoring';

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="inline-flex items-center rounded-full border border-jade/25 bg-jade-soft px-3 py-1 text-xs tracking-wide text-jade-deep">
            本地规则引擎 · 无需登录 · 不需要 API Key
          </p>
          <h1 className="text-balance mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-5xl">
            用可解释的规则，
            <br className="hidden sm:block" />
            重新审视你的户型布局
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-soft sm:text-base">
            AI 风水户型助手把传统住宅布局经验与现代空间设计原则整理成
            <strong className="font-medium text-ink"> {RULES.length} 条确定性规则</strong>
            ，帮助你在装修动工前发现动线、隐私、采光与功能分区上的问题，并得到具体可执行的调整建议。
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/editor"
              className="rounded-lg bg-jade px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-jade-deep"
            >
              进入户型编辑器
            </Link>
            <a
              href="#start"
              className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm text-ink-soft transition-colors hover:border-jade/40 hover:text-jade-deep"
            >
              先看示例户型
            </a>
          </div>

          <dl className="mt-12 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {[
              { k: `${RULES.length} 条`, v: '布局检测规则' },
              { k: '5 个', v: '分类评分维度' },
              { k: '17 类', v: '可标记元素' },
              { k: '100%', v: '本地计算' },
            ].map((item) => (
              <div key={item.v}>
                <dt className="text-2xl font-semibold tracking-tight text-jade-deep">{item.k}</dt>
                <dd className="mt-0.5 text-xs text-muted">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 开始使用 */}
      <section id="start" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-14 sm:px-6">
        <SectionTitle
          eyebrow="开始使用"
          title="上传你的户型，或直接打开示例"
          description="示例户型内置了典型的布局问题，适合先了解分析逻辑与报告结构。"
        />
        <div className="mt-8">
          <StartPanel />
        </div>
      </section>

      {/* 功能 */}
      <section className="border-y border-line bg-paper-deep/40">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
          <SectionTitle
            eyebrow="功能介绍"
            title="它能做什么"
            description="不预测运势，只分析空间。所有结论都能追溯到具体的几何条件。"
          />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="rounded-xl border border-line bg-surface p-5"
              >
                <h3 className="text-sm font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{feature.description}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-xl border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold text-ink">五项分类评分</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {SCORE_CATEGORIES.map((key) => (
                <li
                  key={key}
                  className="rounded-full border border-jade/20 bg-jade-soft px-3 py-1 text-xs text-jade-deep"
                >
                  {CATEGORY_LABELS[key]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 步骤 */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <SectionTitle
          eyebrow="使用步骤"
          title="六步得到一份可打印的分析报告"
          description="整个流程都在浏览器内完成，随时可以回到编辑器继续调整。"
        />
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {USAGE_STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line bg-surface p-5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-jade-soft text-xs font-semibold text-jade-deep">
                {index + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 规则总览 */}
      <section className="border-t border-line bg-paper-deep/40">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
          <SectionTitle
            eyebrow="规则引擎"
            title={`第一版内置的 ${RULES.length} 条规则`}
            description="每条规则都有明确的触发条件、扣分权重、传统解释、现代解释与优化建议。"
          />
          <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-paper/60 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">规则</th>
                  <th className="px-4 py-3 font-medium">主分类</th>
                  <th className="px-4 py-3 font-medium">严重程度</th>
                  <th className="px-4 py-3 font-medium">基础扣分</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((rule) => {
                  const penalty = Object.values(rule.impacts).reduce(
                    (sum, v) => sum + (v ?? 0),
                    0,
                  );
                  return (
                    <tr key={rule.id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3 text-ink">{rule.name}</td>
                      <td className="px-4 py-3 text-ink-soft">{CATEGORY_LABELS[rule.category]}</td>
                      <td className="px-4 py-3">
                        <SeverityTag severity={rule.severity} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-soft">-{penalty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 免责声明 */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-ochre/30 bg-ochre-soft/60 p-6">
          <h2 className="text-sm font-semibold text-ink">风险声明</h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-ink-soft">{DISCLAIMER_TEXT}</p>
          <p className="mt-3 max-w-4xl text-xs leading-relaxed text-muted">
            本工具不提供命理预测服务，不会声称能够改变运势、保证健康或带来财富。所有结论均基于用户自行标注的几何信息，标注精度直接决定分析质量。
          </p>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs tracking-[0.18em] text-jade uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{description}</p>
    </div>
  );
}

function SeverityTag({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const map = {
    high: { label: '高', className: 'border-clay/30 bg-clay-soft text-clay' },
    medium: { label: '中', className: 'border-ochre/30 bg-ochre-soft text-ochre' },
    low: { label: '低', className: 'border-jade/25 bg-jade-soft text-jade-deep' },
  } as const;
  const item = map[severity];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${item.className}`}>
      {item.label}
    </span>
  );
}
