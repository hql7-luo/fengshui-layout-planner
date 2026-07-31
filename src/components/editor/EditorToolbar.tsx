'use client';

import { useRef } from 'react';
import type { ScenarioKey } from '@/lib/types';

interface EditorToolbarProps {
  projectName: string;
  scenario: ScenarioKey;
  hasImage: boolean;
  showIssues: boolean;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onRename: (name: string) => void;
  onScenario: (scenario: ScenarioKey) => void;
  onCopyToAfter: () => void;
  onToggleIssues: () => void;
  onZoom: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: () => void;
}

export function EditorToolbar({
  projectName,
  scenario,
  hasImage,
  showIssues,
  zoom,
  canUndo,
  canRedo,
  onRename,
  onScenario,
  onCopyToAfter,
  onToggleIssues,
  onZoom,
  onUndo,
  onRedo,
  onUploadImage,
  onRemoveImage,
}: EditorToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-paper px-4 py-2.5">
      <input
        value={projectName}
        onChange={(e) => onRename(e.target.value)}
        className="min-w-[8rem] max-w-[14rem] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-ink outline-none transition hover:border-line focus:border-jade focus:bg-white"
        aria-label="项目名称"
      />

      <div className="flex items-center gap-1 rounded-lg bg-paper-deep p-0.5">
        {(['before', 'after'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onScenario(key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              scenario === key ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {key === 'before' ? '改造前' : '改造后'}
          </button>
        ))}
      </div>

      {scenario === 'after' ? (
        <button
          type="button"
          onClick={onCopyToAfter}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft transition hover:border-jade hover:text-jade-deep"
          title="用「改造前」的标注覆盖当前场景"
        >
          从改造前复制
        </button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft transition enabled:hover:border-jade enabled:hover:text-jade-deep disabled:opacity-35"
          >
            撤销
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft transition enabled:hover:border-jade enabled:hover:text-jade-deep disabled:opacity-35"
          >
            恢复
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          缩放
          <input
            type="range"
            min={0.4}
            max={2}
            step={0.1}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            className="w-20 accent-jade"
          />
          <span className="w-9 tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
        </label>

        <button
          type="button"
          onClick={onToggleIssues}
          className={`rounded-md border px-2.5 py-1 text-xs transition ${
            showIssues
              ? 'border-jade bg-jade-soft text-jade-deep'
              : 'border-line text-ink-soft hover:border-jade'
          }`}
        >
          {showIssues ? '隐藏问题标注' : '显示问题标注'}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadImage(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft transition hover:border-jade hover:text-jade-deep"
        >
          {hasImage ? '更换底图' : '上传底图'}
        </button>
        {hasImage ? (
          <button
            type="button"
            onClick={onRemoveImage}
            className="rounded-md border border-line px-2.5 py-1 text-xs text-muted transition hover:border-clay hover:text-clay"
          >
            移除底图
          </button>
        ) : null}
      </div>
    </div>
  );
}
