'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import {
  Arrow,
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { loadImage } from '@/lib/image';
import type { AllLayers } from '@/lib/analysis-layers';
import AnalysisLayers from '@/components/editor/AnalysisLayers';
import type { Issue, PlanElement, Project } from '@/lib/types';

const SEVERITY_COLORS = {
  high: '#b8523f',
  medium: '#b78034',
  low: '#2f5d50',
} as const;

interface PlanCanvasProps {
  project: Project;
  elements: PlanElement[];
  issues: Issue[];
  selectedId: string | null;
  showIssues: boolean;
  zoom: number;
  layers: AllLayers | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<PlanElement>) => void;
}

/**
 * 加载底图。把 src 与已加载的图片一起存入 state，
 * 通过「派生比较」而不是在 effect 中同步 setState 来处理 src 变更与清空。
 */
function useHtmlImage(src: string | undefined) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src)
      .then((image) => {
        if (alive) setLoaded({ src, image });
      })
      .catch(() => {
        /* 加载失败时保持无底图状态，由下方派生逻辑返回 null */
      });
    return () => {
      alive = false;
    };
  }, [src]);

  return loaded && loaded.src === src ? loaded.image : null;
}

export default function PlanCanvas({
  project,
  elements,
  issues,
  selectedId,
  showIssues,
  zoom,
  layers,
  onSelect,
  onChange,
}: PlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const [fit, setFit] = useState(1);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth - 24;
      setFit(Math.min(1.2, Math.max(0.2, width / project.canvas.width)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [project.canvas.width]);

  const scale = fit * zoom;
  const image = useHtmlImage(project.image?.dataUrl);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedId ? nodeRefs.current[selectedId] : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, elements]);

  const issueElementIds = useMemo(() => {
    const set = new Set<string>();
    if (showIssues) {
      for (const issue of issues) for (const id of issue.elementIds) set.add(id);
    }
    return set;
  }, [issues, showIssues]);

  const gridLines = useMemo(() => {
    const step = project.pixelsPerMeter;
    const lines: number[][] = [];
    for (let x = 0; x <= project.canvas.width; x += step) {
      lines.push([x, 0, x, project.canvas.height]);
    }
    for (let y = 0; y <= project.canvas.height; y += step) {
      lines.push([0, y, project.canvas.width, y]);
    }
    return lines;
  }, [project.canvas.height, project.canvas.width, project.pixelsPerMeter]);

  const handleTransformEnd = useCallback(
    (element: PlanElement) => {
      const node = nodeRefs.current[element.id];
      if (!node) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      onChange(element.id, {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        rotation: Math.round(node.rotation()),
        width: Math.max(8, Math.round(element.width * scaleX)),
        height: Math.max(8, Math.round(element.height * scaleY)),
      });
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className="thin-scroll h-full w-full overflow-auto p-3">
      <Stage
        width={project.canvas.width * scale}
        height={project.canvas.height * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) onSelect(null);
        }}
        onTouchStart={(e) => {
          if (e.target === e.target.getStage()) onSelect(null);
        }}
        className="rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(30,36,34,0.05)]"
      >
        <Layer listening={false}>
          <Rect
            x={0}
            y={0}
            width={project.canvas.width}
            height={project.canvas.height}
            fill="#ffffff"
          />
          {image ? (
            <KonvaImage
              image={image}
              x={0}
              y={0}
              width={project.canvas.width}
              height={project.canvas.height}
              opacity={0.85}
            />
          ) : null}
          {gridLines.map((points, index) => (
            <Line key={index} points={points} stroke="#eae6dd" strokeWidth={1} />
          ))}
        </Layer>

        {/* 分析图层：置于编辑层之下、listening=false 不拦截拖拽，不遮挡墙体/门窗/家具编辑 */}
        <AnalysisLayers layers={layers} />

        <Layer>
          {elements
            .filter((el) => ELEMENT_SPECS[el.type].category === 'room')
            .map((el) => (
              <ElementNode
                key={el.id}
                element={el}
                selected={el.id === selectedId}
                flagged={issueElementIds.has(el.id)}
                registerRef={(node) => {
                  nodeRefs.current[el.id] = node;
                }}
                onSelect={onSelect}
                onChange={onChange}
                onTransformEnd={handleTransformEnd}
              />
            ))}
          {elements
            .filter((el) => ELEMENT_SPECS[el.type].category !== 'room')
            .map((el) => (
              <ElementNode
                key={el.id}
                element={el}
                selected={el.id === selectedId}
                flagged={issueElementIds.has(el.id)}
                registerRef={(node) => {
                  nodeRefs.current[el.id] = node;
                }}
                onSelect={onSelect}
                onChange={onChange}
                onTransformEnd={handleTransformEnd}
              />
            ))}

          <Transformer
            ref={transformerRef}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            anchorSize={8}
            anchorStroke="#2f5d50"
            anchorCornerRadius={2}
            borderStroke="#2f5d50"
            borderDash={[4, 3]}
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 12 || newBox.height < 12 ? oldBox : newBox
            }
          />
        </Layer>

        {showIssues ? (
          <Layer listening={false}>
            {issues.map((issue, index) => (
              <Group key={issue.key} x={issue.marker.x} y={issue.marker.y}>
                <Circle
                  radius={13}
                  fill={SEVERITY_COLORS[issue.severity]}
                  opacity={0.92}
                  shadowColor="#000"
                  shadowOpacity={0.15}
                  shadowBlur={4}
                />
                <Text
                  text={String(index + 1)}
                  fontSize={13}
                  fontStyle="bold"
                  fill="#ffffff"
                  width={26}
                  height={26}
                  offsetX={13}
                  offsetY={13}
                  align="center"
                  verticalAlign="middle"
                />
              </Group>
            ))}
          </Layer>
        ) : null}

        <Layer listening={false}>
          <NorthMarker
            x={project.canvas.width - 54}
            y={54}
            angle={project.northAngle}
          />
        </Layer>
      </Stage>
    </div>
  );
}

interface ElementNodeProps {
  element: PlanElement;
  selected: boolean;
  flagged: boolean;
  registerRef: (node: Konva.Group | null) => void;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<PlanElement>) => void;
  onTransformEnd: (element: PlanElement) => void;
}

function ElementNode({
  element,
  selected,
  flagged,
  registerRef,
  onSelect,
  onChange,
  onTransformEnd,
}: ElementNodeProps) {
  const spec = ELEMENT_SPECS[element.type];
  const isRoom = spec.category === 'room';
  const w = element.width;
  const h = element.height;
  const showLabel = w > 44 && h > 22;

  return (
    <Group
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      draggable
      ref={registerRef}
      onMouseDown={() => onSelect(element.id)}
      onTouchStart={() => onSelect(element.id)}
      onDragEnd={(e) =>
        onChange(element.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
      }
      onTransformEnd={() => onTransformEnd(element)}
    >
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={spec.color}
        opacity={isRoom ? 0.62 : 0.95}
        stroke={flagged ? '#b8523f' : spec.stroke}
        strokeWidth={flagged ? 2.4 : isRoom ? 1.6 : 1.2}
        dash={flagged ? [7, 4] : undefined}
        cornerRadius={isRoom ? 3 : 2}
      />
      {spec.facing !== 'none' ? (
        <Arrow
          points={[0, 0, 0, Math.max(14, Math.min(h, 46) / 2 + 12)]}
          pointerLength={6}
          pointerWidth={6}
          stroke={spec.stroke}
          fill={spec.stroke}
          strokeWidth={1.4}
          opacity={0.85}
        />
      ) : null}
      {showLabel ? (
        <Text
          text={element.name}
          fontSize={isRoom ? 13 : 11}
          fill={isRoom ? '#2c332f' : '#3a423e'}
          width={w}
          offsetX={w / 2}
          offsetY={isRoom ? h / 2 - 5 : 6}
          align="center"
          listening={false}
        />
      ) : null}
      {selected ? (
        <Rect
          x={-w / 2 - 3}
          y={-h / 2 - 3}
          width={w + 6}
          height={h + 6}
          stroke="#2f5d50"
          strokeWidth={1}
          dash={[3, 3]}
          listening={false}
        />
      ) : null}
    </Group>
  );
}

function NorthMarker({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <Group x={x} y={y}>
      <Circle radius={26} fill="#ffffff" opacity={0.92} stroke="#e3ded4" strokeWidth={1} />
      <Group rotation={angle}>
        <Arrow
          points={[0, 16, 0, -18]}
          pointerLength={8}
          pointerWidth={8}
          stroke="#b8523f"
          fill="#b8523f"
          strokeWidth={2}
        />
        <Text
          text="北"
          fontSize={11}
          fill="#b8523f"
          width={20}
          offsetX={10}
          offsetY={32}
          align="center"
        />
      </Group>
    </Group>
  );
}
