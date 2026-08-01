/**
 * 土地规划模式的环境风险数据接口（预留）。
 *
 * 重要：普通住宅户型模式不接入以下环境数据，且绝不宣称潮汐 / 河流等环境因素
 * 会直接改变室内风水能量。潮汐仅作为沿海或滨水「土地规划」模式下的
 * 环境风险（洪水 / 潮浸）参考数据。
 */
export type BBoxM = { x: number; y: number; w: number; h: number };

export type SiteMode = 'residential' | 'land-planning';

export interface EnvironmentData {
  mode: SiteMode;
  /** 河流 / 水体位置（米，相对于地块原点） */
  rivers: BBoxM[];
  /** 海岸距离（米）；非滨水地为 null */
  coastlineDistanceM: number | null;
  /** 潮汐潮差（米）；仅沿海 / 滨水土地规划使用，普通户型必须保持 null */
  tidalRangeM: number | null;
  /** 洪水风险等级 */
  floodRisk: 'low' | 'medium' | 'high' | null;
  /** 地势高差（米，正为高地） */
  elevationM: number | null;
  /** 周边道路 */
  roads: BBoxM[];
  /** 周边建筑 */
  surroundingBuildings: BBoxM[];
}

export const EMPTY_ENVIRONMENT: EnvironmentData = {
  mode: 'residential',
  rivers: [],
  coastlineDistanceM: null,
  tidalRangeM: null,
  floodRisk: null,
  elevationM: null,
  roads: [],
  surroundingBuildings: [],
};

/**
 * 潮汐洪水风险评分（0-10，越高越危险）。
 * 仅当 mode='land-planning' 且同时具备潮差与海岸距离时计算；
 * 普通住宅户型（residential）一律返回 null，绝不参与室内能量计算。
 */
export function tidalFloodRisk(env: EnvironmentData): number | null {
  if (env.mode !== 'land-planning') return null;
  if (env.tidalRangeM == null || env.coastlineDistanceM == null) return null;
  const raw = env.tidalRangeM * 0.7 - env.coastlineDistanceM * 0.004;
  return Math.max(0, Math.min(10, Math.round(raw * 10) / 10));
}

export function isCoastalSite(env: EnvironmentData): boolean {
  return env.mode === 'land-planning' && env.coastlineDistanceM != null && env.coastlineDistanceM < 1000;
}
