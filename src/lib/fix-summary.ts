import type { FixAction } from './types';

/**
 * 把一条「应用建议」修正动作转成中文改动说明，用于报告中的优化结果摘要。
 * 例：
 * - 仅旋转：床 旋转 90°（顺时针）
 * - 仅平移：灶台 平移 0.62 米（向左）
 * - 两者：床 旋转 90°（顺时针）、平移 0.30 米（向上）
 */
export function describeFix(fix: FixAction, elementName: string): string {
  const parts: string[] = [];

  if (fix.rotationDelta) {
    const delta = Math.abs(fix.rotationDelta);
    const dir = fix.rotationDelta > 0 ? '顺时针' : '逆时针';
    parts.push(`旋转 ${Math.round(delta)}°（${dir}）`);
  }

  const dx = fix.dx ?? 0;
  const dy = fix.dy ?? 0;
  const dist = Math.hypot(dx, dy);
  if (dist > 0.01) {
    const dirs = ['右', '右下', '下', '左下', '左', '左上', '上', '右上'];
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const index = Math.round(((angle + 360) % 360) / 45) % 8;
    parts.push(`平移 ${dist.toFixed(2)} 米（向${dirs[index]}）`);
  }

  if (parts.length === 0) return `${elementName} 无需改动`;
  return `${elementName} ${parts.join('、')}`;
}
