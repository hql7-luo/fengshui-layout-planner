'use client';

import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { roundTo } from '@/lib/geometry';
import type { PlanElement } from '@/lib/types';

interface InspectorProps {
  element: PlanElement | null;
  pixelsPerMeter: number;
  onChange: (patch: Partial<PlanElement>) => void;
  onDelete: () => void;
}

export function Inspector({ element, pixelsPerMeter, onChange, onDelete }: InspectorProps) {
  if (!element) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
        在画布中选择一个元素后，可在此修改名称、尺寸与角度。
      </p>
    );
  }

  const spec = ELEMENT_SPECS[element.type];
  const toM = (px: number) => roundTo(px / pixelsPerMeter, 2);
  const toPx = (m: number) => Math.round(m * pixelsPerMeter);

  return (
    <div className="space-y-3.5">
      <div>
        <label className="text-[11px] text-muted" htmlFor="el-name">
          名称（{spec.label}）
        </label>
        <input
          id="el-name"
          value={element.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-jade/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="宽度 (米)"
          value={toM(element.width)}
          step={0.1}
          min={0.1}
          onChange={(v) => onChange({ width: Math.max(8, toPx(v)) })}
        />
        <NumberField
          label="高度 (米)"
          value={toM(element.height)}
          step={0.1}
          min={0.1}
          onChange={(v) => onChange({ height: Math.max(8, toPx(v)) })}
        />
        <NumberField
          label="中心 X (米)"
          value={toM(element.x)}
          step={0.1}
          onChange={(v) => onChange({ x: toPx(v) })}
        />
        <NumberField
          label="中心 Y (米)"
          value={toM(element.y)}
          step={0.1}
          onChange={(v) => onChange({ y: toPx(v) })}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="text-[11px] text-muted" htmlFor="el-rotation">
            旋转角度
          </label>
          <span className="text-[11px] tabular-nums text-ink-soft">{element.rotation}°</span>
        </div>
        <input
          id="el-rotation"
          type="range"
          min={0}
          max={359}
          value={((element.rotation % 360) + 360) % 360}
          onChange={(e) => onChange({ rotation: Number(e.target.value) })}
          className="mt-1.5 w-full accent-[#2f5d50]"
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => onChange({ rotation: deg })}
              className="rounded border border-line px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-jade/40 hover:text-jade-deep"
            >
              {deg}°
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ rotation: (((element.rotation + 15) % 360) + 360) % 360 })}
            className="rounded border border-line px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-jade/40 hover:text-jade-deep"
          >
            +15°
          </button>
        </div>
      </div>

      {spec.facing !== 'none' ? (
        <p className="rounded-lg bg-jade-soft/60 px-2.5 py-2 text-[11px] leading-relaxed text-jade-deep">
          {spec.hint}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded-lg border border-clay/30 bg-clay-soft/60 px-3 py-2 text-xs text-clay transition-colors hover:bg-clay-soft"
      >
        删除该元素
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums text-ink outline-none focus:border-jade/50"
      />
    </label>
  );
}
