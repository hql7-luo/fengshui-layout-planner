'use client';

import { Circle, Group, Layer, Line, Rect } from 'react-konva';
import { ENERGY_COLOR, LAYER_IDS, SEVERITY_COLOR, ZONE_COLOR, type AllLayers, type LayerId, type LayerRegion } from '@/lib/analysis-layers';
import { useProjectStore } from '@/store/project-store';

interface AnalysisLayersProps {
  layers: AllLayers | null;
}

function regionColor(layer: LayerId, r: LayerRegion): string {
  if (layer === 'heatmap') return SEVERITY_COLOR[(r.severity as 'high' | 'medium' | 'low') ?? 'low'];
  if (layer === 'energy') return ENERGY_COLOR[r.kind as keyof typeof ENERGY_COLOR] ?? '#888';
  if (layer === 'zoning') return ZONE_COLOR[r.kind as keyof typeof ZONE_COLOR] ?? '#888';
  if (layer === 'daylight') return r.kind === 'good' ? '#fde047' : r.kind === 'mid' ? '#ca8a04' : '#78350f';
  if (layer === 'privacy') return r.kind === 'conflict' ? '#dc2626' : '#22c55e';
  return '#888';
}

function RegionShape({ region, selected }: { region: LayerRegion; selected: boolean }) {
  const color = regionColor(region.layer, region);
  const common = {
    fill: color,
    opacity: 0.32,
    stroke: selected ? '#111827' : color,
    strokeWidth: selected ? 2.5 : 1,
    listening: false,
  };
  if (region.shape.type === 'rect') {
    return <Rect x={region.shape.x} y={region.shape.y} width={region.shape.w} height={region.shape.h} {...common} />;
  }
  if (region.shape.type === 'circle') {
    return <Circle x={region.shape.cx} y={region.shape.cy} radius={region.shape.r} {...common} />;
  }
  return <Line points={region.shape.points} closed fill={color} opacity={0.32} stroke={selected ? '#111827' : color} strokeWidth={selected ? 2.5 : 1} listening={false} />;
}

function LineShape({ points, color, dashed, selected }: { points: number[]; color: string; dashed?: boolean; selected: boolean }) {
  return (
    <Line
      points={points}
      stroke={color}
      strokeWidth={selected ? 3 : 2}
      dash={dashed ? [6, 4] : undefined}
      opacity={0.85}
      lineCap="round"
      listening={false}
    />
  );
}

export default function AnalysisLayers({ layers }: AnalysisLayersProps) {
  const activeLayers = useProjectStore((s) => s.activeLayers);
  const layerOpacity = useProjectStore((s) => s.layerOpacity);
  const selectedRegion = useProjectStore((s) => s.selectedRegion);

  if (!layers) return null;
  const active = LAYER_IDS.filter((id) => activeLayers[id]);

  return (
    <Layer listening={false} opacity={layerOpacity}>
      {active.map((id) => {
        const out = layers[id];
        if (!out.sufficient) return null;
        return (
          <Group key={id}>
            {out.regions.map((r) => (
              <RegionShape key={r.id} region={r} selected={selectedRegion?.id === r.id} />
            ))}
            {out.lines.map((l) => (
              <LineShape key={l.id} points={l.points} color={l.color} dashed={l.dashed} selected={selectedRegion?.id === l.id} />
            ))}
          </Group>
        );
      })}
    </Layer>
  );
}
