'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SAMPLES } from '@/lib/samples';
import { ImageLoadError, readPlanImage } from '@/lib/image';
import { useProjectStore } from '@/store/project-store';

export function StartPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createBlankProject = useProjectStore((s) => s.createBlankProject);
  const createSampleProject = useProjectStore((s) => s.createSampleProject);
  const setImage = useProjectStore((s) => s.setImage);
  const setCanvasSize = useProjectStore((s) => s.setCanvasSize);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await readPlanImage(file);
      createBlankProject(file.name.replace(/\.[^.]+$/, '') || '我的户型');
      setImage(image);
      setCanvasSize(image.width, image.height);
      router.push('/editor');
    } catch (err) {
      setError(err instanceof ImageLoadError ? err.message : '图片处理失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  function openSample(id: string) {
    const created = createSampleProject(id);
    if (created) router.push('/editor');
  }

  function startBlank() {
    createBlankProject('空白户型');
    router.push('/editor');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* 上传 */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(30,36,34,0.04)]">
        <h2 className="text-lg font-semibold text-ink">上传户型图</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          支持 JPG / PNG。图片只在你的浏览器里处理与保存，不会上传到任何服务器。
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFile(e.dataTransfer.files?.[0]);
          }}
          className="mt-5 rounded-xl border border-dashed border-jade/35 bg-jade-soft/40 px-5 py-9 text-center"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="mx-auto h-9 w-9"
            fill="none"
            stroke="#2f5d50"
            strokeWidth="1.3"
          >
            <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-sm text-ink-soft">把户型图拖到这里，或</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center rounded-lg bg-jade px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-jade-deep disabled:opacity-60"
          >
            {busy ? '处理中…' : '选择文件'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? undefined)}
          />
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={startBlank}
          className="mt-4 w-full rounded-lg border border-line px-4 py-2.5 text-sm text-ink-soft transition-colors hover:border-jade/40 hover:text-jade-deep"
        >
          没有户型图？从空白画布开始
        </button>
      </div>

      {/* 示例 */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(30,36,34,0.04)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">直接体验示例户型</h2>
          <span className="text-xs text-muted">无需上传，一键载入</span>
        </div>

        <ul className="mt-4 space-y-3">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                onClick={() => openSample(sample.id)}
                className="group w-full rounded-xl border border-line bg-paper/50 p-4 text-left transition-colors hover:border-jade/40 hover:bg-jade-soft/50"
              >
                <div className="flex items-start gap-3">
                  <SampleGlyph id={sample.id} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{sample.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{sample.summary}</p>
                  </div>
                  <span className="ml-auto shrink-0 self-center text-xs text-jade opacity-0 transition-opacity group-hover:opacity-100">
                    打开 →
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SampleGlyph({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    'entry-facing-bathroom': (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 21v-6" />
        <rect x="9" y="9" width="6" height="6" />
      </>
    ),
    'bathroom-in-center': (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <rect x="9.5" y="9.5" width="5" height="5" />
      </>
    ),
    'bed-facing-door': (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <rect x="6" y="6" width="7" height="5" />
        <path d="M13 17h6" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="mt-0.5 h-8 w-8 shrink-0"
      fill="none"
      stroke="#2f5d50"
      strokeWidth="1.2"
      strokeLinejoin="round"
    >
      {paths[id] ?? <rect x="3" y="3" width="18" height="18" rx="2" />}
    </svg>
  );
}
