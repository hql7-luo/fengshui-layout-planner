'use client';

import { useState, useSyncExternalStore } from 'react';
import { LAYER_IDS, LAYER_META } from '@/lib/analysis-layers';
import type { AllLayers, LayerId } from '@/lib/analysis-layers';
import { useProjectStore } from '@/store/project-store';

interface LayerPanelProps {
  layers: AllLayers | null;
}

/** 订阅 matchMedia，判断是否为移动端（useSyncExternalStore 避免在 effect 中 setState） */
function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(max-width: 768px)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(max-width: 768px)').matches,
    () => false,
  );
}

export default function LayerPanel({ layers }: LayerPanelProps) {
  const activeLayers = useProjectStore((s) => s.activeLayers);
  const layerOpacity = useProjectStore((s) => s.layerOpacity);
  const selectedRegion = useProjectStore((s) => s.selectedRegion);
  const toggleLayer = useProjectStore((s) => s.toggleLayer);
  const setLayerOpacity = useProjectStore((s) => s.setLayerOpacity);
  const selectRegion = useProjectStore((s) => s.selectRegion);

  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(true);
  const [manuallySet, setManuallySet] = useState(false);
  // 手机端默认折叠；用户手动切换后以其选择为准
  const effectiveExpanded = manuallySet ? expanded : !isMobile;
  const toggleExpanded = () => {
    setManuallySet(true);
    setExpanded((v) => !v);
  };

  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-ink">分析图层</h3>
        <button
          type="button"
          className="rounded border border-line px-2 py-0.5 text-xs text-muted"
          onClick={toggleExpanded}
        >
          {effectiveExpanded ? '收起' : '展开'}
        </button>
      </div>

      <div className="mb-3">
        <label className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>图层透明度</span>
          <span>{Math.round(layerOpacity * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(layerOpacity * 100)}
          onChange={(e) => setLayerOpacity(Number(e.target.value) / 100)}
          className="w-full"
        />
      </div>

      {!effectiveExpanded && (
        <p className="text-xs text-muted">移动端已折叠复杂图层控制，点击「展开」查看图例与依据。</p>
      )}

      <div className={effectiveExpanded ? 'space-y-2' : 'hidden'}>
        {LAYER_IDS.map((id: LayerId) => {
          const meta = LAYER_META[id];
          const on = activeLayers[id];
          const out = layers?.[id];
          return (
            <div key={id} className="rounded border border-line p-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={on} onChange={() => toggleLayer(id)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-ink">{meta.label}</span>
                  <span className="block text-xs text-muted">{meta.description}</span>
                </span>
              </label>

              {on && out && !out.sufficient && (
                <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  数据不足：{out.insufficiencyReason}
                </p>
              )}

              {on && out && out.sufficient && (
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap gap-2">
                    {meta.legend.map((lg) => (
                      <span key={lg.label} className="flex items-center gap-1 text-xs text-muted">
                        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: lg.color }} />
                        {lg.label}
                      </span>
                    ))}
                  </div>
                  {out.regions.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted">查看区域依据（{out.regions.length}）</summary>
                      <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
                        {out.regions.slice(0, 40).map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              className={
                                'block w-full rounded px-1 py-0.5 text-left hover:bg-line ' +
                                (selectedRegion?.id === r.id ? ' bg-line font-medium' : '')
                              }
                              onClick={() => selectRegion(r)}
                            >
                              {r.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedRegion && (
        <div className="mt-3 rounded border border-line bg-line/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-ink">{selectedRegion.label}</span>
            <button type="button" className="text-xs text-muted" onClick={() => selectRegion(null)}>
              关闭
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted">{selectedRegion.basis}</p>
        </div>
      )}
    </div>
  );
}
