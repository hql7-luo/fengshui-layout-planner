import { DISCLAIMER_TEXT } from '@/lib/constants';

export function SiteFooter() {
  return (
    <footer className="no-print border-t border-line bg-paper-deep/60">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <p className="max-w-4xl text-xs leading-relaxed text-muted">{DISCLAIMER_TEXT}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>FengShui Layout Planner</span>
          <span aria-hidden>·</span>
          <span>MIT License</span>
          <span aria-hidden>·</span>
          <span>本地规则引擎，数据仅保存在浏览器 localStorage</span>
        </div>
      </div>
    </footer>
  );
}
