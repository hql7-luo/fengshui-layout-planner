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
import type { CandidatePlan, Issue, PlanElement, Project, StructureModel } from '@/lib/types';

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
  selectedWallId: string | null;
  showIssues: boolean;
  zoom: number;
  layers: AllLayers | null;
  previewPlan: CandidatePlan | null;
  structure?: StructureModel;
  onSelect: (id: string | null) => void;
  onWallSelect: (id: string) => void;
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
  selectedWallId,
  showIssues,
  zoom,
  layers,
  previewPlan,
  structure,
  onSelect,
  onWallSelect,
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
    <div ref={containerRef} data-testid="plan-canvas" className="thin-scroll h-full w-full overflow-auto p-3">
      <Stage
        width={project.canvas.width * scale}
        height={project.canvas.height * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) {
            onSelect(null);
          }
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
          <NorthMarker
            x={project.canvas.width - 54}
            y={54}
            angle={project.northAngle}
          />
        </Layer>

        {/* 分析图层：置于编辑层之下、listening=false 不拦截拖拽，不遮挡墙体/门窗/家具编辑 */}
        <AnalysisLayers layers={layers} />

        <CandidatePreviewLayer plan={previewPlan} elements={elements} structure={structure} />

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

          {(structure?.walls ?? []).map((wall) => {
            const selected = wall.id === selectedWallId;
            const style = WALL_STYLES[wall.kind];
            return (
              <Group key={`structure-${wall.id}`}>
                <Line
                  points={[wall.x1, wall.y1, wall.x2, wall.y2]}
                  stroke={style.stroke}
                  strokeWidth={selected ? style.width + 2 : style.width}
                  dash={style.dash ? [...style.dash] : undefined}
                  opacity={selected ? 1 : 0.78}
                  hitStrokeWidth={14}
                  lineCap="round"
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                    onWallSelect(wall.id);
                  }}
                  onTouchStart={(event) => {
                    event.cancelBubble = true;
                    onWallSelect(wall.id);
                  }}
                />
                {selected ? (
                  <Text
                    x={(wall.x1 + wall.x2) / 2 + 6}
                    y={(wall.y1 + wall.y2) / 2 - 18}
                    text={WALL_LABELS[wall.kind]}
                    fontSize={11}
                    fill={style.stroke}
                    listening={false}
                  />
                ) : null}
              </Group>
            );
          })}

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
      </Stage>
    </div>
  );
}

const WALL_STYLES = {
  exterior: { stroke: '#26342f', width: 4, dash: undefined },
  'load-bearing': { stroke: '#b8523f', width: 5, dash: undefined },
  partition: { stroke: '#2f7a67', width: 3, dash: undefined },
  unknown: { stroke: '#8a8f8c', width: 2.5, dash: [7, 5] },
} as const;

const WALL_LABELS = {
  exterior: '外墙',
  'load-bearing': '承重墙',
  partition: '非承重墙',
  unknown: '未知墙体',
} as const;

function CandidatePreviewLayer({
  plan,
  elements,
  structure,
}: {
  plan: CandidatePlan | null;
  elements: PlanElement[];
  structure?: StructureModel;
}) {
  if (!plan || !plan.feasible) return null;
  const modifications = plan.modifications;
  const addedWalls = modifications.flatMap((modification) => modification.addedWalls ?? []);
  const addedElements = modifications.flatMap((modification) => modification.addedElements ?? []);
  const moves = modifications.flatMap((modification) => modification.movedElementIds ?? []);
  const wallMoves = modifications.flatMap((modification) => modification.movedWalls ?? []);
  const areaChanges = modifications.flatMap((modification) => modification.roomAreaChanges ?? []);
  const sealedIds = new Set(modifications.flatMap((modification) => modification.sealedDoorIds ?? []));
  const sealedDoors = (structure?.doors ?? []).filter((door) => sealedIds.has(door.id));

  return (
    <Layer listening={false} opacity={0.9}>
      {wallMoves.map((move) => {
        const strip = [
          move.from[0].x, move.from[0].y,
          move.from[1].x, move.from[1].y,
          move.to[1].x, move.to[1].y,
          move.to[0].x, move.to[0].y,
        ];
        const gains = areaChanges.filter((change) => change.deltaM2 > 0.001);
        const losses = areaChanges.filter((change) => change.deltaM2 < -0.001);
        const label = [...gains, ...losses]
          .map((change) => `${change.roomName} ${change.deltaM2 >= 0 ? '+' : ''}${change.deltaM2.toFixed(2)}㎡`)
          .join(' / ');
        return (
          <Group key={`wall-move-${move.wallId}`}>
            {losses.length ? <Line points={strip} closed fill="#b8523f" opacity={0.18} /> : null}
            {gains.length ? <Line points={strip} closed fill="#4f8f78" opacity={0.22} /> : null}
            <Line
              points={[move.from[0].x, move.from[0].y, move.from[1].x, move.from[1].y]}
              stroke="#777d7a"
              strokeWidth={3}
              dash={[8, 6]}
            />
            <Line
              points={[move.to[0].x, move.to[0].y, move.to[1].x, move.to[1].y]}
              stroke="#176f59"
              strokeWidth={5}
              lineCap="round"
            />
            <Arrow
              points={[
                (move.from[0].x + move.from[1].x) / 2,
                (move.from[0].y + move.from[1].y) / 2,
                (move.to[0].x + move.to[1].x) / 2,
                (move.to[0].y + move.to[1].y) / 2,
              ]}
              stroke="#176f59"
              fill="#176f59"
              strokeWidth={2}
              pointerLength={8}
              pointerWidth={8}
            />
            {label ? (
              <Text
                x={(move.to[0].x + move.to[1].x) / 2 + 8}
                y={(move.to[0].y + move.to[1].y) / 2 + 8}
                text={label}
                fontSize={11}
                fill="#26342f"
              />
            ) : null}
          </Group>
        );
      })}
      {sealedDoors.map((door) => (
        <Group key={`sealed-${door.id}`} x={door.point.x} y={door.point.y}>
          <Line points={[-10, -10, 10, 10]} stroke="#b8523f" strokeWidth={3} />
          <Line points={[-10, 10, 10, -10]} stroke="#b8523f" strokeWidth={3} />
          <Text text="封闭旧门洞" x={12} y={-8} fontSize={11} fill="#b8523f" />
        </Group>
      ))}
      {moves.map((move) => {
        const original = elements.find((element) => element.id === move.id);
        if (!original) return null;
        return (
          <Group key={`move-${move.id}`}>
            <Arrow
              points={[original.x, original.y, move.x, move.y]}
              stroke="#2f5d50"
              fill="#2f5d50"
              strokeWidth={2.5}
              dash={[7, 4]}
              pointerLength={8}
              pointerWidth={8}
            />
            <Circle x={move.x} y={move.y} radius={8} stroke="#2f5d50" strokeWidth={2} fill="#e7eeea" />
          </Group>
        );
      })}
      {addedWalls.map((wall) => (
        <Line
          key={wall.id}
          points={[wall.x1, wall.y1, wall.x2, wall.y2]}
          stroke="#2f5d50"
          strokeWidth={Math.max(4, wall.thicknessM * 20)}
          lineCap="round"
        />
      ))}
      {addedElements.map((element) => (
        <Rect
          key={`ghost-${element.id}`}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          offsetX={element.width / 2}
          offsetY={element.height / 2}
          rotation={element.rotation}
          fill="#e7eeea"
          stroke="#2f5d50"
          strokeWidth={2}
          dash={[6, 4]}
        />
      ))}
    </Layer>
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
  const polygonPoints = element.polygon?.flatMap((point) => [point.x - element.x, point.y - element.y]);

  return (
    <Group
      x={element.x}
      y={element.y}
      rotation={polygonPoints ? 0 : element.rotation}
      draggable
      ref={registerRef}
      onMouseDown={() => onSelect(element.id)}
      onTouchStart={() => onSelect(element.id)}
      onDragEnd={(e) =>
        onChange(element.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
      }
      onTransformEnd={() => onTransformEnd(element)}
    >
      {polygonPoints ? (
        <Line
          points={polygonPoints}
          closed
          fill={spec.color}
          opacity={0.62}
          stroke={flagged ? '#b8523f' : spec.stroke}
          strokeWidth={flagged ? 2.4 : 1.6}
          dash={flagged ? [7, 4] : undefined}
        />
      ) : (
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
      )}
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
      {selected && polygonPoints ? (
        <Line
          points={polygonPoints}
          closed
          stroke="#2f5d50"
          strokeWidth={1}
          dash={[3, 3]}
          listening={false}
        />
      ) : selected ? (
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
