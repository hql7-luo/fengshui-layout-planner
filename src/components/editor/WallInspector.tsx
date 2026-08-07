'use client';

import { roundTo } from '@/lib/geometry';
import type { Wall, WallKind } from '@/lib/types';

const OPTIONS: Array<{ kind: WallKind; label: string; note: string; swatch: string }> = [
  { kind: 'exterior', label: '外墙', note: '永远不可移动', swatch: 'bg-[#26342f]' },
  { kind: 'load-bearing', label: '承重墙', note: '不可自动移动', swatch: 'bg-[#b8523f]' },
  { kind: 'partition', label: '非承重墙', note: '可进入安全搜索', swatch: 'bg-[#2f7a67]' },
  { kind: 'unknown', label: '未知', note: '只生成概念建议', swatch: 'bg-[#8a8f8c]' },
];

export function WallInspector({
  wall,
  pixelsPerMeter,
  onKind,
}: {
  wall: Wall;
  pixelsPerMeter: number;
  onKind: (kind: WallKind) => void;
}) {
  const lengthM = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) / pixelsPerMeter;
  return (
    <div className="space-y-3" data-testid="wall-inspector">
      <div className="rounded-lg border border-line bg-paper-deep/50 p-2.5">
        <p className="text-xs font-medium text-ink">已选择墙体</p>
        <p className="mt-1 break-all text-[10px] text-muted">{wall.id}</p>
        <p className="mt-1 text-[11px] text-ink-soft">
          长约 {roundTo(lengthM, 2)}m · 相邻房间 {wall.adjacentRooms.filter(Boolean).length} 个
          {wall.hasDoor ? ' · 含门洞' : ''}{wall.hasWindow ? ' · 含窗洞' : ''}
        </p>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[11px] text-muted">墙体属性</legend>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              data-testid={`wall-kind-${option.kind}`}
              aria-pressed={wall.kind === option.kind}
              onClick={() => onKind(option.kind)}
              className={`rounded-lg border px-2 py-2 text-left transition ${
                wall.kind === option.kind
                  ? 'border-jade bg-jade-soft/70 text-jade-deep'
                  : 'border-line bg-white text-ink-soft hover:border-jade/50'
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span className={`h-1.5 w-5 rounded-full ${option.swatch}`} aria-hidden="true" />
                {option.label}
              </span>
              <span className="mt-1 block text-[10px] text-muted">{option.note}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
        属性标记只代表用户输入。实际施工前仍须由建筑师、结构设计师、物业或相关专业人员确认。
      </p>
    </div>
  );
}
