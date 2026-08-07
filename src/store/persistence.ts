import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { LAYER_IDS, type LayerId } from '@/lib/analysis-layers';
import type {
  CandidatePlan,
  OptimizationResult,
  PlanElement,
  PlanImage,
  Project,
  Scenario,
  ScenarioKey,
  StructureModel,
} from '@/lib/types';

export const STORAGE_KEY = 'fengshui-layout-planner:v1';
export const STORAGE_VERSION = 2;

export const DEFAULT_ACTIVE_LAYERS: Record<LayerId, boolean> = {
  heatmap: false,
  privacy: false,
  airflow: false,
  circulation: false,
  daylight: false,
  zoning: false,
  energy: false,
};

export interface PersistedProjectState {
  projects: Record<string, Project>;
  order: string[];
  currentId: string | null;
  scenario: ScenarioKey;
  candidates: OptimizationResult | null;
  previewPlanId: string | null;
  activeLayers: Record<LayerId, boolean>;
  layerOpacity: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeElement(value: unknown): PlanElement | null {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') return null;
  if (!(item.type in ELEMENT_SPECS)) return null;
  const width = finite(item.width, 0);
  const height = finite(item.height, 0);
  if (width <= 0 || height <= 0) return null;
  return {
    id: item.id,
    type: item.type as PlanElement['type'],
    name: typeof item.name === 'string' ? item.name.slice(0, 120) : ELEMENT_SPECS[item.type as PlanElement['type']].label,
    x: finite(item.x, 0),
    y: finite(item.y, 0),
    width,
    height,
    rotation: ((finite(item.rotation, 0) % 360) + 360) % 360,
  };
}

function sanitizeStructure(value: unknown): StructureModel | undefined {
  const source = record(value);
  if (!source || !Array.isArray(source.walls) || !Array.isArray(source.doors)) return undefined;
  const walls = source.walls.flatMap((value) => {
    const wall = record(value);
    if (!wall || typeof wall.id !== 'string' || !['exterior', 'load-bearing', 'partition'].includes(String(wall.kind))) return [];
    const adjacent = Array.isArray(wall.adjacentRooms) ? wall.adjacentRooms : [null, null];
    const kind = wall.kind as 'exterior' | 'load-bearing' | 'partition';
    return [{
      id: wall.id,
      kind,
      x1: finite(wall.x1, 0),
      y1: finite(wall.y1, 0),
      x2: finite(wall.x2, 0),
      y2: finite(wall.y2, 0),
      thicknessM: clamp(finite(wall.thicknessM, 0.12), 0.05, 1),
      movable: kind === 'partition' && wall.movable !== false,
      adjacentRooms: [
        typeof adjacent[0] === 'string' ? adjacent[0] : null,
        typeof adjacent[1] === 'string' ? adjacent[1] : null,
      ] as [string | null, string | null],
      hasDoor: Boolean(wall.hasDoor),
      hasWindow: Boolean(wall.hasWindow),
    }];
  });
  const wallIds = new Set(walls.map((wall) => wall.id));
  const rawDoors = source.doors;
  const doors = rawDoors.flatMap((value) => {
    const door = record(value);
    const point = record(door?.point);
    if (!door || !point || typeof door.id !== 'string' || typeof door.wallId !== 'string' || !wallIds.has(door.wallId)) return [];
    if (!['entry', 'room', 'bathroom', 'kitchen', 'balcony', 'window'].includes(String(door.kind))) return [];
    return [{
      id: door.id,
      wallId: door.wallId,
      point: { x: finite(point.x, 0), y: finite(point.y, 0) },
      widthM: clamp(finite(door.widthM, 0.9), 0.3, 5),
      kind: door.kind as 'entry' | 'room' | 'bathroom' | 'kitchen' | 'balcony' | 'window',
      linkedElementId: typeof door.linkedElementId === 'string' ? door.linkedElementId : undefined,
      movable: Boolean(door.movable),
    }];
  });
  // 旧版曾使用不存在的 wallId="inner"；整份结构丢弃后可由元素安全重建。
  if (rawDoors.length !== doors.length) return undefined;

  const rawWindows = Array.isArray(source.windows) ? source.windows : [];
  const windows = rawWindows.flatMap((value) => {
    const opening = record(value);
    const point = record(opening?.point);
    if (!opening || !point || typeof opening.id !== 'string' || typeof opening.wallId !== 'string' || !wallIds.has(opening.wallId)) return [];
    return [{
      id: opening.id,
      wallId: opening.wallId,
      point: { x: finite(point.x, 0), y: finite(point.y, 0) },
      widthM: clamp(finite(opening.widthM, 1.2), 0.2, 8),
    }];
  });
  if (rawWindows.length !== windows.length) return undefined;

  const zones = (Array.isArray(source.zones) ? source.zones : []).flatMap((value) => {
    const zone = record(value);
    if (!zone || typeof zone.id !== 'string' || !['wet', 'fixed'].includes(String(zone.kind))) return [];
    return [{
      id: zone.id,
      kind: zone.kind as 'wet' | 'fixed',
      x: finite(zone.x, 0),
      y: finite(zone.y, 0),
      w: Math.max(0, finite(zone.w, 0)),
      h: Math.max(0, finite(zone.h, 0)),
      roomId: typeof zone.roomId === 'string' ? zone.roomId : undefined,
      movable: Boolean(zone.movable),
    }];
  });

  return { walls, doors, windows, zones, loadBearingMarked: Boolean(source.loadBearingMarked) };
}

function sanitizeScenario(value: unknown, fallback: PlanElement[] = []): Scenario {
  const source = record(value);
  const rawElements = Array.isArray(source?.elements) ? source.elements : fallback;
  return {
    elements: rawElements.map(sanitizeElement).filter((item): item is PlanElement => Boolean(item)),
    structure: sanitizeStructure(source?.structure),
  };
}

function sanitizeImage(value: unknown): PlanImage | null {
  const image = record(value);
  if (!image || typeof image.dataUrl !== 'string' || !/^data:image\/(jpeg|png);/i.test(image.dataUrl)) return null;
  const width = finite(image.width, 0);
  const height = finite(image.height, 0);
  if (width <= 0 || height <= 0 || width > 8000 || height > 8000) return null;
  return { dataUrl: image.dataUrl, width, height };
}

function sanitizeProject(value: unknown, fallbackId: string): Project | null {
  const source = record(value);
  if (!source) return null;
  const id = typeof source.id === 'string' && source.id ? source.id : fallbackId;
  const scenarios = record(source.scenarios);
  const before = sanitizeScenario(scenarios?.before);
  const after = sanitizeScenario(scenarios?.after, before.elements.map((element) => ({ ...element })));
  const canvas = record(source.canvas);
  return {
    id,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.slice(0, 120) : '已恢复户型',
    createdAt: finite(source.createdAt, Date.now()),
    updatedAt: finite(source.updatedAt, Date.now()),
    image: sanitizeImage(source.image),
    canvas: {
      width: Math.round(clamp(finite(canvas?.width, 1080), 400, 4000)),
      height: Math.round(clamp(finite(canvas?.height, 840), 400, 4000)),
    },
    northAngle: ((finite(source.northAngle, 0) % 360) + 360) % 360,
    pixelsPerMeter: Math.round(clamp(finite(source.pixelsPerMeter, 75), 20, 200)),
    scenarios: { before, after },
    structure: sanitizeStructure(source.structure),
    sampleId: typeof source.sampleId === 'string' ? source.sampleId : undefined,
  };
}

function validPlan(value: unknown): value is CandidatePlan {
  const plan = record(value);
  const categories = record(plan?.predictedCategories);
  const projectedElements = Array.isArray(plan?.projectedElements) ? plan.projectedElements : [];
  const projectedStructure = sanitizeStructure(plan?.projectedStructure);
  const validDigest = (value: unknown) => {
    const digest = record(value);
    return Boolean(
      digest &&
        typeof digest.key === 'string' &&
        typeof digest.ruleId === 'string' &&
        typeof digest.name === 'string' &&
        ['high', 'medium', 'low'].includes(String(digest.severity)),
    );
  };
  const validModification = (value: unknown) => {
    const modification = record(value);
    if (
      !modification ||
      ![
        'relocate-door',
        'offset-door',
        'seal-door',
        'add-partition',
        'add-screen',
        'add-node',
        'merge-corridor',
        'furniture-fix',
      ].includes(String(modification.kind)) ||
      typeof modification.label !== 'string' ||
      typeof modification.description !== 'string'
    ) return false;
    if (modification.sealedDoorIds !== undefined && (
      !Array.isArray(modification.sealedDoorIds) ||
      !modification.sealedDoorIds.every((id) => typeof id === 'string')
    )) return false;
    if (modification.movedElementIds !== undefined && (
      !Array.isArray(modification.movedElementIds) ||
      !modification.movedElementIds.every((value) => {
        const move = record(value);
        return Boolean(
          move &&
            typeof move.id === 'string' &&
            typeof move.x === 'number' && Number.isFinite(move.x) &&
            typeof move.y === 'number' && Number.isFinite(move.y) &&
            (move.rotation === undefined || (typeof move.rotation === 'number' && Number.isFinite(move.rotation))),
        );
      })
    )) return false;
    if (modification.addedElements !== undefined && (
      !Array.isArray(modification.addedElements) ||
      !modification.addedElements.every((element) => sanitizeElement(element) !== null)
    )) return false;
    if (modification.addedWalls !== undefined) {
      if (!Array.isArray(modification.addedWalls)) return false;
      const structure = sanitizeStructure({
        walls: modification.addedWalls,
        doors: [],
        windows: [],
        zones: [],
      });
      if (!structure || structure.walls.length !== modification.addedWalls.length) return false;
    }
    return true;
  };
  return Boolean(
    plan &&
      ['A', 'B', 'C'].includes(String(plan.id)) &&
      typeof plan.title === 'string' &&
      ['entry-bathroom', 'door-door', 'long-corridor', 'furniture', 'mixed'].includes(String(plan.problemType)) &&
      typeof plan.feasible === 'boolean' &&
      (plan.feasible || typeof plan.infeasibleReason === 'string') &&
      Array.isArray(plan.modifications) && plan.modifications.every(validModification) &&
      Array.isArray(plan.projectedElements) &&
      projectedElements.every((element) => sanitizeElement(element) !== null) &&
      projectedStructure &&
      typeof plan.originalScore === 'number' && Number.isFinite(plan.originalScore) &&
      typeof plan.predictedScore === 'number' && Number.isFinite(plan.predictedScore) &&
      categories && ['fengshui', 'circulation', 'privacy', 'function', 'lighting'].every(
        (category) => typeof categories[category] === 'number' && Number.isFinite(categories[category]),
      ) &&
      Array.isArray(plan.solvedIssueKeys) && plan.solvedIssueKeys.every((key) => typeof key === 'string') &&
      Array.isArray(plan.remainingIssueKeys) && plan.remainingIssueKeys.every((key) => typeof key === 'string') &&
      Array.isArray(plan.solvedIssues) && plan.solvedIssues.every(validDigest) &&
      Array.isArray(plan.introducedIssues) && plan.introducedIssues.every(validDigest) &&
      typeof plan.valueScore === 'number' && Number.isFinite(plan.valueScore) &&
      ['minimal', 'balanced', 'major'].includes(String(plan.changeDegree)) &&
      Array.isArray(plan.risks) && plan.risks.every((risk) => typeof risk === 'string') &&
      typeof plan.conceptOnly === 'boolean',
  );
}

function sanitizeCandidates(
  value: unknown,
  projects: Record<string, Project>,
  currentId: string | null,
  scenario: ScenarioKey,
): OptimizationResult | null {
  const source = record(value);
  if (!source || !Array.isArray(source.plans) || source.plans.length !== 3 || !source.plans.every(validPlan)) return null;
  if (new Set(source.plans.map((plan) => record(plan)?.id)).size !== 3) return null;
  if (typeof source.sourceProjectId !== 'string' || source.sourceProjectId !== currentId) return null;
  const project = projects[source.sourceProjectId];
  if (!project || source.sourceScenario !== scenario) return null;
  if (typeof source.sourceUpdatedAt !== 'number' || source.sourceUpdatedAt !== project.updatedAt) return null;
  if (typeof source.generatedAt !== 'number' || !Number.isFinite(source.generatedAt)) return null;
  if (typeof source.hasStructuralIssue !== 'boolean') return null;
  return source as unknown as OptimizationResult;
}

export function normalizePersistedState(value: unknown, preserveCandidates = true): PersistedProjectState {
  const source = record(value) ?? {};
  const rawProjects = record(source.projects) ?? {};
  const projects: Record<string, Project> = {};
  for (const [id, value] of Object.entries(rawProjects)) {
    const project = sanitizeProject(value, id);
    if (project) projects[project.id] = project;
  }
  const requestedOrder = Array.isArray(source.order) ? source.order.filter((id): id is string => typeof id === 'string') : [];
  const order = [...new Set([...requestedOrder.filter((id) => projects[id]), ...Object.keys(projects)])];
  const currentId = typeof source.currentId === 'string' && projects[source.currentId]
    ? source.currentId
    : (order[0] ?? null);
  const scenario: ScenarioKey = source.scenario === 'after' ? 'after' : 'before';
  const activeSource = record(source.activeLayers);
  const activeLayers = { ...DEFAULT_ACTIVE_LAYERS };
  for (const id of LAYER_IDS) activeLayers[id] = activeSource?.[id] === true;
  const candidates = preserveCandidates
    ? sanitizeCandidates(source.candidates, projects, currentId, scenario)
    : null;
  const previewPlanId = candidates && ['A', 'B', 'C'].includes(String(source.previewPlanId))
    ? String(source.previewPlanId)
    : null;
  return {
    projects,
    order,
    currentId,
    scenario,
    candidates,
    previewPlanId,
    activeLayers,
    layerOpacity: clamp(finite(source.layerOpacity, 0.55), 0, 1),
  };
}
