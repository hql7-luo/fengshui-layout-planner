import { ELEMENT_SPECS } from '@/lib/element-catalog';
import type { Issue, PlanElement, Project } from '@/lib/types';

const SEVERITY_COLORS = {
  high: '#b8523f',
  medium: '#b78034',
  low: '#2f5d50',
} as const;

interface PlanPreviewProps {
  project: Project;
  elements: PlanElement[];
  issues?: Issue[];
  showMarkers?: boolean;
  className?: string;
}

/**
 * 纯 SVG 的户型预览，用于报告页与打印（不依赖 Canvas，可直接打印）。
 */
export function PlanPreview({
  project,
  elements,
  issues = [],
  showMarkers = true,
  className,
}: PlanPreviewProps) {
  const { width, height } = project.canvas;
  const rooms = elements.filter((el) => ELEMENT_SPECS[el.type].category === 'room');
  const others = elements.filter((el) => ELEMENT_SPECS[el.type].category !== 'room');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="户型标注预览"
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {project.image ? (
        <image
          href={project.image.dataUrl}
          x={0}
          y={0}
          width={width}
          height={height}
          opacity={0.85}
          preserveAspectRatio="none"
        />
      ) : null}

      {[...rooms, ...others].map((el) => {
        const spec = ELEMENT_SPECS[el.type];
        const isRoom = spec.category === 'room';
        return (
          <g key={el.id} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}>
            <rect
              x={-el.width / 2}
              y={-el.height / 2}
              width={el.width}
              height={el.height}
              fill={spec.color}
              fillOpacity={isRoom ? 0.62 : 0.95}
              stroke={spec.stroke}
              strokeWidth={isRoom ? 1.6 : 1.2}
              rx={2}
            />
            {el.width > 46 && el.height > 22 ? (
              <text
                x={0}
                y={isRoom ? -el.height / 2 + 15 : 4}
                textAnchor="middle"
                fontSize={isRoom ? 13 : 11}
                fill="#2c332f"
              >
                {el.name}
              </text>
            ) : null}
          </g>
        );
      })}

      {showMarkers
        ? issues.map((issue, index) => (
            <g key={issue.key} transform={`translate(${issue.marker.x} ${issue.marker.y})`}>
              <circle r={13} fill={SEVERITY_COLORS[issue.severity]} fillOpacity={0.92} />
              <text
                x={0}
                y={4.5}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill="#ffffff"
              >
                {index + 1}
              </text>
            </g>
          ))
        : null}

      <g transform={`translate(${width - 54} 54)`}>
        <circle r={26} fill="#ffffff" fillOpacity={0.92} stroke="#e3ded4" />
        <g transform={`rotate(${project.northAngle})`}>
          <line x1={0} y1={16} x2={0} y2={-14} stroke="#b8523f" strokeWidth={2} />
          <polygon points="0,-20 -5,-10 5,-10" fill="#b8523f" />
          <text x={0} y={-24} textAnchor="middle" fontSize={11} fill="#b8523f">
            北
          </text>
        </g>
      </g>
    </svg>
  );
}
