import { buildStructureFromElements } from '@/lib/optimizer';
import type { PlanElement, StructureModel } from '@/lib/types';

/**
 * 仅用于需要可移内墙/门洞的测试场景：逐 id 显式地将每一段推导内墙分类为 partition。
 * loadBearingMarked 不参与逐墙授权，所以测试也不得借助该全局标志获得 movable。
 */
export function explicitlyClassifiedStructure(elements: PlanElement[], ppm: number): StructureModel {
  const structure = buildStructureFromElements(elements, false, ppm);
  const walls = structure.walls.map((wall) => wall.kind === 'unknown'
    ? { ...wall, kind: 'partition' as const, movable: true }
    : { ...wall });
  return {
    ...structure,
    loadBearingMarked: true,
    walls,
    doors: structure.doors.map((door) => ({
      ...door,
      movable: door.kind !== 'entry' && walls.find((wall) => wall.id === door.wallId)?.kind === 'partition',
    })),
  };
}
