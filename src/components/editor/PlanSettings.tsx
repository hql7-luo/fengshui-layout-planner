'use client';

import { compassOf } from '@/lib/geometry';

interface PlanSettingsProps {
  northAngle: number;
  pixelsPerMeter: number;
  canvas: { width: number; height: number };
  onNorth: (deg: number) => void;
  onPixelsPerMeter: (value: number) => void;
  onCanvas: (width: number, height: number) => void;
}

const NORTH_PRESETS = [
  { label: '上', value: 0 },
  { label: '右', value: 90 },
  { label: '下', value: 180 },
  { label: '左', value: 270 },
];

export function PlanSettings({
  northAngle,
  pixelsPerMeter,
  canvas,
  onNorth,
  onPixelsPerMeter,
  onCanvas,
}: PlanSettingsProps) {
  // 画布正上方（-Y）对应的实际方位
  const upLabel = compassOf({ x: 0, y: -1 }, northAngle);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-medium text-ink-soft">正北方向</span>
          <span className="tabular-nums text-xs text-muted">
            {Math.round(northAngle)}° · 画布上方为{upLabel}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={355}
          step={5}
          value={northAngle}
          onChange={(e) => onNorth(Number(e.target.value))}
          className="w-full accent-jade"
          aria-label="正北方向角度"
        />
        <div className="mt-1.5 flex gap-1">
          {NORTH_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onNorth(preset.value)}
              className={`flex-1 rounded-md border px-1 py-1 text-xs transition ${
                Math.round(northAngle) === preset.value
                  ? 'border-jade bg-jade-soft text-jade-deep'
                  : 'border-line text-muted hover:border-jade'
              }`}
            >
              北在{preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-medium text-ink-soft">比例尺</span>
          <span className="tabular-nums text-xs text-muted">{pixelsPerMeter} px / 米</span>
        </div>
        <input
          type="range"
          min={20}
          max={200}
          step={5}
          value={pixelsPerMeter}
          onChange={(e) => onPixelsPerMeter(Number(e.target.value))}
          className="w-full accent-jade"
          aria-label="比例尺"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          调整到「一个房间的宽度看起来符合实际米数」即可。比例尺影响距离类规则的判定。
        </p>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-ink-soft">画布尺寸（px）</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={400}
            max={4000}
            step={20}
            value={canvas.width}
            onChange={(e) => onCanvas(Number(e.target.value) || canvas.width, canvas.height)}
            className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs tabular-nums outline-none focus:border-jade"
            aria-label="画布宽度"
          />
          <span className="text-xs text-muted">×</span>
          <input
            type="number"
            min={400}
            max={4000}
            step={20}
            value={canvas.height}
            onChange={(e) => onCanvas(canvas.width, Number(e.target.value) || canvas.height)}
            className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs tabular-nums outline-none focus:border-jade"
            aria-label="画布高度"
          />
        </div>
      </div>
    </div>
  );
}
