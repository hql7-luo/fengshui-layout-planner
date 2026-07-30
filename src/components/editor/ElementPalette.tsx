'use client';

import {
  CATEGORY_LABELS,
  ELEMENT_SPECS,
  FURNITURE_TYPES,
  OPENING_TYPES,
  ROOM_TYPES,
} from '@/lib/element-catalog';
import type { ElementCategory, ElementType } from '@/lib/types';

const GROUPS: Array<{ category: ElementCategory; types: ElementType[] }> = [
  { category: 'room', types: ROOM_TYPES },
  { category: 'opening', types: OPENING_TYPES },
  { category: 'furniture', types: FURNITURE_TYPES },
];

export function ElementPalette({ onAdd }: { onAdd: (type: ElementType) => void }) {
  return (
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.category}>
          <h3 className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            {CATEGORY_LABELS[group.category]}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {group.types.map((type) => {
              const spec = ELEMENT_SPECS[type];
              return (
                <button
                  key={type}
                  type="button"
                  title={spec.hint}
                  onClick={() => onAdd(type)}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left text-xs text-ink-soft transition-colors hover:border-jade/40 hover:bg-jade-soft/50 hover:text-ink"
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-[3px] border"
                    style={{ backgroundColor: spec.color, borderColor: spec.stroke }}
                  />
                  <span className="truncate">{spec.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="rounded-lg bg-paper-deep/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
        点击即可把元素添加到画布中心。带箭头的元素表示「正面朝向」，床、沙发、书桌的背面需要靠墙。
      </p>
    </div>
  );
}
