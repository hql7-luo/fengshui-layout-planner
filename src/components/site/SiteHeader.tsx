import Link from 'next/link';

const NAV = [
  { href: '/', label: '首页' },
  { href: '/editor', label: '户型编辑器' },
  { href: '/report', label: '分析报告' },
];

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
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
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight text-ink">
              AI 风水户型助手
            </span>
            <span className="hidden text-[11px] tracking-[0.14em] text-muted uppercase sm:block">
              FengShui Layout Planner
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-ink-soft transition-colors hover:bg-jade-soft hover:text-jade-deep"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/"
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
