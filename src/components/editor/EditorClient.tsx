'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IssueList } from '@/components/analysis/IssueList';
import { CategoryBars, IssueCounts, ScoreRing } from '@/components/analysis/ScoreSummary';
import { ElementPalette } from '@/components/editor/ElementPalette';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { Inspector } from '@/components/editor/Inspector';
import LayerPanel from '@/components/editor/LayerPanel';
import { PlanSettings } from '@/components/editor/PlanSettings';
import { useAnalysis } from '@/hooks/use-analysis';
import { useHydrated } from '@/hooks/use-hydrated';
import { ImageLoadError, readPlanImage } from '@/lib/image';
import { computeLayers, type AllLayers } from '@/lib/analysis-layers';
import { SAMPLES } from '@/lib/samples';
import type { ElementType, Issue, PlanElement } from '@/lib/types';
import {
  selectCanRedo,
  selectCanUndo,
  selectCurrentElements,
  selectCurrentProject,
  useProjectStore,
} from '@/store/project-store';

const PlanCanvas = dynamic(() => import('@/components/editor/PlanCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted">
      画布加载中…
    </div>
  ),
});

type SidePanel = 'elements' | 'issues';

export function EditorClient() {
  const hydrated = useHydrated();
  const project = useProjectStore(selectCurrentProject);
  const elements = useProjectStore(selectCurrentElements);
  const scenario = useProjectStore((s) => s.scenario);
  const selectedId = useProjectStore((s) => s.selectedId);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);

  const createSampleProject = useProjectStore((s) => s.createSampleProject);
  const createBlankProject = useProjectStore((s) => s.createBlankProject);
  const renameProject = useProjectStore((s) => s.renameProject);
  const setScenario = useProjectStore((s) => s.setScenario);
  const copyScenario = useProjectStore((s) => s.copyScenario);
  const setImage = useProjectStore((s) => s.setImage);
  const setNorthAngle = useProjectStore((s) => s.setNorthAngle);
  const setPixelsPerMeter = useProjectStore((s) => s.setPixelsPerMeter);
  const setCanvasSize = useProjectStore((s) => s.setCanvasSize);
  const addElement = useProjectStore((s) => s.addElement);
  const updateElement = useProjectStore((s) => s.updateElement);
  const removeElement = useProjectStore((s) => s.removeElement);
  const select = useProjectStore((s) => s.select);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const [zoom, setZoom] = useState(1);
  const [showIssues, setShowIssues] = useState(true);
  const [panel, setPanel] = useState<SidePanel>('elements');
  const [error, setError] = useState<string | null>(null);
  const [focusedIssue, setFocusedIssue] = useState<string | null>(null);

  const result = useAnalysis(project, scenario);
  const issues = useMemo(() => result?.issues ?? [], [result]);

  // 分析图层随当前场景（改造前 / 改造后）实时重算；computeLayers 为纯函数，不修改 elements
  const layers = useMemo<AllLayers | null>(() => {
    if (!result || !project) return null;
    return computeLayers({
      elements,
      analysis: result,
      options: {
        pixelsPerMeter: project.pixelsPerMeter,
        northAngle: project.northAngle,
        canvas: project.canvas,
      },
    });
  }, [result, project, elements]);

  const selected: PlanElement | null = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  );

  /* 键盘快捷键：Delete 删除、Cmd/Ctrl+Z 撤销、Shift+Cmd/Ctrl+Z 恢复 */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeElement(selectedId);
      }
      if (event.key === 'Escape') select(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, undo, removeElement, select, selectedId]);

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const image = await readPlanImage(file);
        setImage(image);
      } catch (err) {
        setError(err instanceof ImageLoadError ? err.message : '图片读取失败，请换一张试试。');
      }
    },
    [setImage],
  );

  const handleFocusIssue = useCallback(
    (issue: Issue) => {
      setFocusedIssue(issue.key);
      setShowIssues(true);
      if (issue.elementIds.length > 0) select(issue.elementIds[0]);
    },
    [select],
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">
        正在读取本地项目…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold text-ink">还没有打开的户型项目</h1>
          <p className="mt-2 text-sm text-muted">
            可以从首页上传户型图，或直接载入一个示例户型开始体验。
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => createSampleProject(sample.id)}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-soft transition hover:border-jade hover:text-jade-deep"
            >
              {sample.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => createBlankProject()}
            className="rounded-lg bg-jade px-3 py-2 text-sm text-white transition hover:bg-jade-deep"
          >
            新建空白项目
          </button>
        </div>
        <Link href="/" className="text-xs text-muted underline underline-offset-4 hover:text-jade">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <EditorToolbar
        projectName={project.name}
        scenario={scenario}
        hasImage={Boolean(project.image)}
        showIssues={showIssues}
        zoom={zoom}
        canUndo={canUndo}
        canRedo={canRedo}
        onRename={(name) => renameProject(project.id, name)}
        onScenario={setScenario}
        onCopyToAfter={() => copyScenario('before', 'after')}
        onToggleIssues={() => setShowIssues((v) => !v)}
        onZoom={setZoom}
        onUndo={undo}
        onRedo={redo}
        onUploadImage={handleUpload}
        onRemoveImage={() => setImage(null)}
      />

      {error ? (
        <p className="border-b border-clay/25 bg-clay-soft px-4 py-2 text-xs text-clay">{error}</p>
      ) : null}

      <div className="grid flex-1 gap-0 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* 左：元素库 + 图纸设置 */}
        <aside className="thin-scroll order-2 max-h-[70vh] space-y-5 overflow-y-auto border-line p-4 lg:order-1 lg:max-h-none lg:border-r">
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted">添加元素</h2>
            <ElementPalette onAdd={(type: ElementType) => addElement(type)} />
          </section>
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted">图纸设置</h2>
            <PlanSettings
              northAngle={project.northAngle}
              pixelsPerMeter={project.pixelsPerMeter}
              canvas={project.canvas}
              onNorth={setNorthAngle}
              onPixelsPerMeter={setPixelsPerMeter}
              onCanvas={setCanvasSize}
            />
          </section>
          <section>
            <LayerPanel layers={layers} />
          </section>
        </aside>

        {/* 中：画布 */}
        <main className="order-1 min-h-[52vh] border-b border-line bg-paper-deep/40 lg:order-2 lg:min-h-0 lg:border-b-0">
          <PlanCanvas
            project={project}
            elements={elements}
            issues={showIssues ? issues : []}
            selectedId={selectedId}
            showIssues={showIssues}
            zoom={zoom}
            layers={layers}
            onSelect={select}
            onChange={(id, patch) => updateElement(id, patch)}
          />
        </main>

        {/* 右：属性 / 评分 / 问题 */}
        <aside className="thin-scroll order-3 max-h-[70vh] space-y-4 overflow-y-auto border-line p-4 lg:max-h-none lg:border-l">
          <div className="flex items-center gap-1 rounded-lg bg-paper-deep p-0.5">
            {(
              [
                ['elements', '属性'],
                ['issues', `问题 ${issues.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPanel(key)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                  panel === key ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {panel === 'elements' ? (
            <Inspector
              element={selected}
              pixelsPerMeter={project.pixelsPerMeter}
              onChange={(patch) => {
                if (selected) updateElement(selected.id, patch);
              }}
              onDelete={() => {
                if (selected) removeElement(selected.id);
              }}
            />
          ) : (
            <div className="space-y-4">
              {result ? (
                <>
                  <div className="flex items-center gap-4">
                    <ScoreRing score={result.overall} size={96} />
                    <IssueCounts result={result} />
                  </div>
                  <CategoryBars result={result} />
                </>
              ) : null}
              <IssueList issues={issues} onFocus={handleFocusIssue} />
              {focusedIssue ? (
                <p className="text-[11px] text-muted">已在画布中选中该问题涉及的元素。</p>
              ) : null}
            </div>
          )}

          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-xs text-muted">
              当前场景共 {elements.length} 个标注
              {result ? ` · 综合评分 ${result.overall}` : ''}
            </p>
            <Link
              href="/report"
              className="block rounded-lg bg-jade px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-jade-deep"
            >
              生成分析报告
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
