import Link from 'next/link';

const NAV = [
  { href: '/', label: '首页', shortLabel: '首页' },
  { href: '/editor', label: '户型编辑器', shortLabel: '编辑' },
  { href: '/report', label: '分析报告', shortLabel: '报告' },
];

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-2 sm:gap-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-jade/25 bg-jade-soft"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#2f5d50" strokeWidth="1.4">
              <path d="M3 10.5 12 4l9 6.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 9.6V20h13V9.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9.6 20v-5.4h4.8V20" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="whitespace-nowrap leading-tight">
            <span className="block text-sm font-semibold tracking-tight text-ink sm:text-[15px]">
              AI 风水户型助手
            </span>
            <span className="hidden text-[11px] tracking-[0.14em] text-muted uppercase sm:block">
              FengShui Layout Planner
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex min-w-0 items-center gap-0 text-xs sm:gap-1 sm:text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="whitespace-nowrap rounded-lg px-2 py-2 text-ink-soft transition-colors hover:bg-jade-soft hover:text-jade-deep sm:px-3"
            >
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          ))}
          <a
            href="https://github.com/hql7-luo/fengshui-layout-planner"
            target="_blank"
            rel="noreferrer noopener"
            className="ml-1 hidden rounded-lg border border-line px-3 py-2 text-ink-soft transition-colors hover:border-jade/40 hover:text-jade-deep sm:block"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
