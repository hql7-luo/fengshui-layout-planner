'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { createProjectFromSample, SAMPLE_CANVAS, SAMPLE_PIXELS_PER_METER } from '@/lib/samples';
import { normalizeDeg, rotateVec } from '@/lib/geometry';
import { applyAllFixesToElements } from '@/lib/apply-fixes';
import { issueIdentity } from '@/lib/issue-diff';
import { generateCandidatePlans, buildStructureFromElements } from '@/lib/optimizer';
import type { LayerId, LayerSelection } from '@/lib/analysis-layers';
import { EMPTY_ENVIRONMENT, type EnvironmentData } from '@/lib/environment';
import { analyzePlan, type ContextOptions } from '@/lib/rules/engine';
import {
  DEFAULT_ACTIVE_LAYERS,
  normalizePersistedState,
  migratePersistedState,
  STORAGE_KEY,
  STORAGE_VERSION,
} from '@/store/persistence';
import type {
  ApplyAllSummary,
  ElementType,
  FixAction,
  OptimizationResult,
  PlanElement,
  PlanImage,
  Project,
  Scenario,
  ScenarioKey,
  StructureModel,
  Wall,
  WallKind,
} from '@/lib/types';

const HISTORY_LIMIT = 50;

/** 稳定引用，避免 useSyncExternalStore 在 project 为 null 时无限循环 */
const EMPTY_ELEMENTS: PlanElement[] = [];

interface HistoryEntry {
  past: Scenario[];
  future: Scenario[];
}

export interface ProjectState {
  projects: Record<string, Project>;
  order: string[];
  currentId: string | null;
  scenario: ScenarioKey;
  selectedId: string | null;
  /** key = `${projectId}:${scenario}`，不持久化 */
  history: Record<string, HistoryEntry>;

  createBlankProject: (name?: string) => string;
  createSampleProject: (sampleId: string) => string | null;
  duplicateProject: (id: string) => string | null;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  setCurrent: (id: string | null) => void;

  setImage: (image: PlanImage | null) => void;
  setNorthAngle: (deg: number) => void;
  setPixelsPerMeter: (value: number) => void;
  setCanvasSize: (width: number, height: number) => void;

  setScenario: (scenario: ScenarioKey) => void;
  copyScenario: (from: ScenarioKey, to: ScenarioKey) => void;
  /** 在指定场景上应用一条「应用建议」修正动作（作用于优化后场景） */
  applyFix: (scenario: ScenarioKey, fix: FixAction) => void;
  /** 一键全部优化：对指定场景自动执行所有可修正项，返回优化结果摘要 */
  applyAllFixes: (scenario: ScenarioKey) => ApplyAllSummary | null;

  /** 结构优化：基于当前场景生成 A/B/C 候选方案（不覆盖原始方案） */
  generateCandidates: () => void;
  /** 预览某个候选方案（画布虚线旧墙 / 实线新墙对比） */
  setPreviewPlan: (planId: string | null) => void;
  /** 应用某个候选方案：复制当前场景到「优化后」并写入，原始方案保留在「改造前」 */
  applyCandidate: (planId: string) => void;
  /** 丢弃当前候选方案 */
  discardCandidates: () => void;
  /** 手动设置结构模型（手动绘制墙体后写入） */
  setStructure: (structure: StructureModel) => void;
  /** 手动新增一段墙体 */
  addWall: (wall: Wall) => void;
  /** 删除一段墙体 */
  removeWall: (id: string) => void;
  /** 标记是否已识别承重墙 */
  setLoadBearingMarked: (marked: boolean) => void;
  /** 用户明确设置单段墙属性；只有 partition 会变为可移动 */
  setWallKind: (id: string, kind: WallKind) => void;
  /** 当前候选方案与预览状态 */
  candidates: OptimizationResult | null;
  previewPlanId: string | null;
  /** 分析图层开关（7 个图层独立控制） */
  activeLayers: Record<LayerId, boolean>;
  /** 图层整体透明度 0-1 */
  layerOpacity: number;
  /** 当前选中的图层区域（点击图例查看计算依据） */
  selectedRegion: LayerSelection | null;
  /** 土地规划环境数据接口（普通户型默认为空，不接入室内能量） */
  environment: EnvironmentData;
  /** localStorage 损坏时自动重置后的非阻塞提示 */
  persistenceNotice: string | null;
  toggleLayer: (id: LayerId) => void;
  setLayerOpacity: (value: number) => void;
  selectRegion: (region: LayerSelection | null) => void;
  setEnvironment: (env: EnvironmentData) => void;
  dismissPersistenceNotice: () => void;
  setPersistenceNotice: (message: string) => void;

  addElement: (type: ElementType, position?: { x: number; y: number }) => string | null;
  updateElement: (id: string, patch: Partial<PlanElement>, options?: { commit?: boolean }) => void;
  removeElement: (id: string) => void;
  clearElements: () => void;
  select: (id: string | null) => void;

  undo: () => void;
  redo: () => void;
}

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankProject(name: string): Project {
  const ts = Date.now();
  return {
    id: nowId('project'),
    name,
    createdAt: ts,
    updatedAt: ts,
    image: null,
    canvas: { ...SAMPLE_CANVAS },
    northAngle: 0,
    pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
    scenarios: { before: { elements: [] }, after: { elements: [] } },
  };
}

function cloneStructure(structure: StructureModel | undefined): StructureModel | undefined {
  if (!structure) return undefined;
  return {
    walls: structure.walls.map((wall) => ({ ...wall, adjacentRooms: [...wall.adjacentRooms] })),
    doors: structure.doors.map((door) => ({ ...door, point: { ...door.point } })),
    windows: structure.windows.map((window) => ({ ...window, point: { ...window.point } })),
    zones: structure.zones.map((zone) => ({ ...zone })),
    loadBearingMarked: structure.loadBearingMarked,
  };
}

function cloneScenario(scenario: Scenario): Scenario {
  return {
    elements: scenario.elements.map((element) => ({
      ...element,
      polygon: element.polygon?.map((point) => ({ ...point })),
    })),
    structure: cloneStructure(scenario.structure),
  };
}

function patchElementGeometry(element: PlanElement, patch: Partial<PlanElement>): PlanElement {
  const next = { ...element, ...patch, id: element.id };
  if (patch.polygon) return { ...next, polygon: patch.polygon.map((point) => ({ ...point })) };
  if (!element.polygon || !['x', 'y', 'width', 'height', 'rotation'].some((key) => key in patch)) return next;
  const scaleX = next.width / Math.max(1e-6, element.width);
  const scaleY = next.height / Math.max(1e-6, element.height);
  const rotationDelta = next.rotation - element.rotation;
  const polygon = element.polygon.map((point) => {
    const scaled = {
      x: (point.x - element.x) * scaleX,
      y: (point.y - element.y) * scaleY,
    };
    const rotated = rotateVec(scaled, rotationDelta);
    return { x: next.x + rotated.x, y: next.y + rotated.y };
  });
  return { ...next, polygon };
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => {
      /** 读写当前项目的辅助函数 */
      const mutate = (
        updater: (project: Project) => Project,
        options: { recordHistory?: boolean; invalidateCandidates?: boolean } = {},
      ) => {
        const state = get();
        const id = state.currentId;
        if (!id) return;
        const project = state.projects[id];
        if (!project) return;

        const historyKey = `${id}:${state.scenario}`;
        const nextHistory = { ...state.history };
        if (options.recordHistory) {
          const entry = nextHistory[historyKey] ?? { past: [], future: [] };
          nextHistory[historyKey] = {
            past: [...entry.past, cloneScenario(project.scenarios[state.scenario])].slice(-HISTORY_LIMIT),
            future: [],
          };
        }

        const updated = { ...updater(project), updatedAt: Date.now() };
        set({
          projects: { ...state.projects, [id]: updated },
          history: nextHistory,
          ...(options.invalidateCandidates === false
            ? {}
            : { candidates: null, previewPlanId: null, selectedRegion: null }),
        });
      };

      const setElements = (elements: PlanElement[], recordHistory = true) => {
        const scenario = get().scenario;
        mutate(
          (project) => ({
            ...project,
            scenarios: {
              ...project.scenarios,
              [scenario]: { ...project.scenarios[scenario], elements },
            },
          }),
          { recordHistory },
        );
      };

      return {
        projects: {},
        order: [],
        currentId: null,
        scenario: 'before',
        selectedId: null,
        history: {},
        candidates: null,
        previewPlanId: null,
        activeLayers: { ...DEFAULT_ACTIVE_LAYERS },
        layerOpacity: 0.55,
        selectedRegion: null,
        environment: EMPTY_ENVIRONMENT,
        persistenceNotice: null,

        createBlankProject: (name = '未命名户型') => {
          const project = blankProject(name);
          set((state) => ({
            projects: { ...state.projects, [project.id]: project },
            order: [project.id, ...state.order],
            currentId: project.id,
            scenario: 'before',
            selectedId: null,
            candidates: null,
            previewPlanId: null,
          }));
          return project.id;
        },

        createSampleProject: (sampleId) => {
          const project = createProjectFromSample(sampleId);
          if (!project) return null;
          set((state) => ({
            projects: { ...state.projects, [project.id]: project },
            order: [project.id, ...state.order],
            currentId: project.id,
            scenario: 'before',
            selectedId: null,
            candidates: null,
            previewPlanId: null,
          }));
          return project.id;
        },

        duplicateProject: (id) => {
          const source = get().projects[id];
          if (!source) return null;
          const ts = Date.now();
          const copy: Project = {
            ...source,
            id: nowId('project'),
            name: `${source.name} 副本`,
            createdAt: ts,
            updatedAt: ts,
            structure: cloneStructure(source.structure),
            scenarios: {
              before: cloneScenario(source.scenarios.before),
              after: cloneScenario(source.scenarios.after),
            },
          };
          set((state) => ({
            projects: { ...state.projects, [copy.id]: copy },
            order: [copy.id, ...state.order],
            currentId: copy.id,
            candidates: null,
            previewPlanId: null,
          }));
          return copy.id;
        },

        deleteProject: (id) =>
          set((state) => {
            const projects = { ...state.projects };
            delete projects[id];
            const order = state.order.filter((x) => x !== id);
            return {
              projects,
              order,
              currentId: state.currentId === id ? (order[0] ?? null) : state.currentId,
              selectedId: null,
              candidates: null,
              previewPlanId: null,
            };
          }),

        renameProject: (id, name) =>
          set((state) => {
            const project = state.projects[id];
            if (!project) return state;
            return {
              projects: { ...state.projects, [id]: { ...project, name, updatedAt: Date.now() } },
              candidates: null,
              previewPlanId: null,
            };
          }),

        setCurrent: (id) => set({
          currentId: id,
          selectedId: null,
          scenario: 'before',
          candidates: null,
          previewPlanId: null,
          selectedRegion: null,
        }),

        setImage: (image) => mutate((project) => ({ ...project, image })),
        setNorthAngle: (deg) =>
          mutate((project) => ({ ...project, northAngle: ((deg % 360) + 360) % 360 })),
        setPixelsPerMeter: (value) =>
          mutate((project) => ({
            ...project,
            pixelsPerMeter: Math.max(10, Math.min(400, Math.round(value))),
          })),
        setCanvasSize: (width, height) =>
          mutate((project) => ({
            ...project,
            canvas: {
              width: Math.round(Math.max(400, Math.min(4000, width))),
              height: Math.round(Math.max(400, Math.min(4000, height))),
            },
          })),

        setScenario: (scenario) =>
          set((state) => ({
            scenario,
            selectedId: null,
            selectedRegion: null,
            ...(state.scenario === scenario ? {} : { candidates: null, previewPlanId: null }),
          })),

        copyScenario: (from, to) => {
          const state = get();
          const id = state.currentId;
          if (!id) return;
          const project = state.projects[id];
          if (!project) return;
          const key = `${id}:${to}`;
          const entry = state.history[key] ?? { past: [], future: [] };
          set({
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: { ...project.scenarios, [to]: cloneScenario(project.scenarios[from]) },
              },
            },
            history: {
              ...state.history,
              [key]: {
                past: [...entry.past, cloneScenario(project.scenarios[to])].slice(-HISTORY_LIMIT),
                future: [],
              },
            },
            candidates: null,
            previewPlanId: null,
            selectedRegion: null,
          });
        },

        applyFix: (scenario, fix) => {
          const state = get();
          const id = state.currentId;
          if (!id) return;
          const project = state.projects[id];
          if (!project) return;
          const elements = project.scenarios[scenario].elements;
          const idx = elements.findIndex((e) => e.id === fix.targetId);
          if (idx < 0) return;
          const target = elements[idx];
          const ppm = project.pixelsPerMeter;
          const next: PlanElement = {
            ...target,
            x: target.x + (fix.dx ?? 0) * ppm,
            y: target.y + (fix.dy ?? 0) * ppm,
            rotation: normalizeDeg(target.rotation + (fix.rotationDelta ?? 0)),
          };
          const updatedElements = elements.map((e, i) => (i === idx ? next : e));
          const currentResult = analyzePlan(elements, {
            pixelsPerMeter: project.pixelsPerMeter,
            northAngle: project.northAngle,
            canvas: project.canvas,
          });
          const sourceIssue = currentResult.issues.find((issue) =>
            issue.fix?.targetId === fix.targetId &&
            issue.fix.dx === fix.dx &&
            issue.fix.dy === fix.dy &&
            issue.fix.rotationDelta === fix.rotationDelta,
          );
          if (!sourceIssue) {
            set({ persistenceNotice: '该建议已与当前户型状态不一致，请重新查看分析结果。' });
            return;
          }
          const updatedResult = analyzePlan(updatedElements, {
            pixelsPerMeter: project.pixelsPerMeter,
            northAngle: project.northAngle,
            canvas: project.canvas,
          });
          const updatedIdentities = new Set(updatedResult.issues.map(issueIdentity));
          if (
            updatedIdentities.has(issueIdentity(sourceIssue)) ||
            updatedResult.counts.high > currentResult.counts.high ||
            updatedResult.rawOverall < currentResult.rawOverall
          ) {
            set({ persistenceNotice: '该自动调整无法安全消除问题或会降低原始评分，已保持当前布局。' });
            return;
          }
          const historyKey = `${id}:${scenario}`;
          const entry = state.history[historyKey] ?? { past: [], future: [] };
          set((s) => ({
            projects: {
              ...s.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: {
                  ...project.scenarios,
                  [scenario]: { ...project.scenarios[scenario], elements: updatedElements },
                },
              },
            },
            history: {
              ...s.history,
              [historyKey]: {
                past: [...entry.past, cloneScenario(project.scenarios[scenario])].slice(-HISTORY_LIMIT),
                future: [],
              },
            },
            candidates: null,
            previewPlanId: null,
          }));
        },

        applyAllFixes: (scenario) => {
          const state = get();
          const id = state.currentId;
          if (!id) return null;
          const project = state.projects[id];
          if (!project) return null;
          const elements = project.scenarios[scenario].elements;
          if (elements.length === 0) return null;

          const options: ContextOptions = {
            pixelsPerMeter: project.pixelsPerMeter,
            northAngle: project.northAngle,
            canvas: project.canvas,
          };

          const startedScore = analyzePlan(elements, options).overall;
          const { elements: nextElements, items } = applyAllFixesToElements(
            elements,
            options,
            project.pixelsPerMeter,
          );
          const finishedScore = analyzePlan(nextElements, options).overall;

          const summary: ApplyAllSummary = {
            appliedCount: items.filter((i) => i.status === 'applied').length,
            skippedCount: items.filter((i) => i.status === 'skipped').length,
            startedScore,
            finishedScore,
            items,
          };

          // 整批只记一个撤销点，一次撤销即可回退全部自动优化
          const historyKey = `${id}:${scenario}`;
          const nextHistory = { ...state.history };
          const entry = nextHistory[historyKey] ?? { past: [], future: [] };
          nextHistory[historyKey] = {
            past: [...entry.past, cloneScenario(project.scenarios[scenario])].slice(-HISTORY_LIMIT),
            future: [],
          };

          set({
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: {
                  ...project.scenarios,
                  [scenario]: { ...project.scenarios[scenario], elements: nextElements },
                },
              },
            },
            history: nextHistory,
            candidates: null,
            previewPlanId: null,
          });
          return summary;
        },

        generateCandidates: () => {
          const state = get();
          const id = state.currentId;
          if (!id) return;
          const project = state.projects[id];
          if (!project) return;
          const scenario = state.scenario;
          const elements = project.scenarios[scenario].elements;
          if (elements.length === 0) return;
          const options: ContextOptions = {
            pixelsPerMeter: project.pixelsPerMeter,
            northAngle: project.northAngle,
            canvas: project.canvas,
          };
          const scenarioStructure = project.scenarios[scenario].structure;
          const projectStructure = project.structure;
          const marked =
            projectStructure?.loadBearingMarked ?? scenarioStructure?.loadBearingMarked ?? false;
          const structure =
            scenarioStructure ??
            projectStructure ??
            buildStructureFromElements(elements, marked, project.pixelsPerMeter);
          const result = generateCandidatePlans({ elements, structure, options });
          result.generatedAt = Date.now();
          result.sourceProjectId = id;
          result.sourceScenario = scenario;
          result.sourceUpdatedAt = project.updatedAt;
          set({ candidates: result, previewPlanId: null });
        },

        setPreviewPlan: (planId) => set({ previewPlanId: planId }),

        applyCandidate: (planId) => {
          const state = get();
          const id = state.currentId;
          if (!id) return;
          const project = state.projects[id];
          if (!project || !state.candidates) return;
          const plan = state.candidates.plans.find((p) => p.id === planId);
          if (!plan || !plan.feasible) return;
          if (
            state.candidates.sourceProjectId !== id ||
            state.candidates.sourceScenario !== state.scenario ||
            state.candidates.sourceUpdatedAt !== project.updatedAt
          ) {
            set({
              candidates: null,
              previewPlanId: null,
              persistenceNotice: '户型已发生变化，旧候选方案已失效，请重新生成。',
            });
            return;
          }

          // 原始 before 永远保留；候选只写入 after，并把原 after 场景作为一个完整撤销点。
          const historyKey = `${id}:after`;
          const nextHistory = { ...state.history };
          const entry = nextHistory[historyKey] ?? { past: [], future: [] };
          nextHistory[historyKey] = {
            past: [...entry.past, cloneScenario(project.scenarios.after)].slice(-HISTORY_LIMIT),
            future: [],
          };

          set({
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: {
                  before: cloneScenario(project.scenarios.before),
                  after: {
                    elements: plan.projectedElements.map((e) => ({
                      ...e,
                      polygon: e.polygon?.map((point) => ({ ...point })),
                    })),
                    structure: cloneStructure(plan.projectedStructure),
                  },
                },
              },
            },
            scenario: 'after',
            candidates: null,
            previewPlanId: null,
            history: nextHistory,
          });
        },

        discardCandidates: () => set({ candidates: null, previewPlanId: null }),
        toggleLayer: (id) => set((state) => ({ activeLayers: { ...state.activeLayers, [id]: !state.activeLayers[id] } })),
        setLayerOpacity: (value) => set({ layerOpacity: Math.max(0, Math.min(1, value)) }),
        selectRegion: (region) => set({ selectedRegion: region }),
        setEnvironment: (env) => set({ environment: env }),
        dismissPersistenceNotice: () => set({ persistenceNotice: null }),
        setPersistenceNotice: (message) => set({ persistenceNotice: message }),

        setStructure: (structure) =>
          mutate((project) => {
            const scenario = get().scenario;
            return {
              ...project,
              scenarios: {
                ...project.scenarios,
                [scenario]: { ...project.scenarios[scenario], structure: cloneStructure(structure) },
              },
            };
          }, { recordHistory: true }),

        addWall: (wall) =>
          mutate((project) => {
            const scenario = get().scenario;
            const base = project.scenarios[scenario].structure ??
              project.structure ??
              buildStructureFromElements(project.scenarios[scenario].elements, false, project.pixelsPerMeter);
            const merged = { ...base, walls: [...base.walls, wall] };
            return {
              ...project,
              scenarios: {
                ...project.scenarios,
                [scenario]: { ...project.scenarios[scenario], structure: merged },
              },
            };
          }, { recordHistory: true }),

        removeWall: (wid) =>
          mutate((project) => {
            const scenario = get().scenario;
            const base = project.scenarios[scenario].structure ??
              project.structure ??
              buildStructureFromElements(project.scenarios[scenario].elements, false, project.pixelsPerMeter);
            const merged = { ...base, walls: base.walls.filter((w) => w.id !== wid) };
            return {
              ...project,
              scenarios: {
                ...project.scenarios,
                [scenario]: { ...project.scenarios[scenario], structure: merged },
              },
            };
          }, { recordHistory: true }),

        setLoadBearingMarked: (marked) =>
          mutate((project) => {
            const scenario = get().scenario;
            const base = project.scenarios[scenario].structure ??
              project.structure ??
              buildStructureFromElements(project.scenarios[scenario].elements, false, project.pixelsPerMeter);
            const merged = { ...base, loadBearingMarked: marked };
            return {
              ...project,
              scenarios: {
                ...project.scenarios,
                [scenario]: { ...project.scenarios[scenario], structure: merged },
              },
            };
          }, { recordHistory: true }),

        setWallKind: (wallId, kind) =>
          mutate((project) => {
            const scenario = get().scenario;
            const elements = project.scenarios[scenario].elements;
            const base = project.scenarios[scenario].structure ??
              project.structure ??
              buildStructureFromElements(elements, false, project.pixelsPerMeter);
            const exists = base.walls.some((wall) => wall.id === wallId);
            if (!exists) return project;
            const walls = base.walls.map((wall) => wall.id === wallId
              ? { ...wall, kind, movable: kind === 'partition' }
              : { ...wall });
            const doors = base.doors.map((door) => ({
              ...door,
              movable: door.kind !== 'entry' && walls.find((wall) => wall.id === door.wallId)?.kind === 'partition',
            }));
            const structure: StructureModel = {
              ...base,
              walls,
              doors,
              loadBearingMarked: base.loadBearingMarked || kind === 'load-bearing' || kind === 'partition',
            };
            return {
              ...project,
              scenarios: {
                ...project.scenarios,
                [scenario]: { ...project.scenarios[scenario], structure },
              },
            };
          }, { recordHistory: true }),

        addElement: (type, position) => {
          const state = get();
          const project = state.currentId ? state.projects[state.currentId] : null;
          if (!project) return null;
          const spec = ELEMENT_SPECS[type];
          const ppm = project.pixelsPerMeter;
          const element: PlanElement = {
            id: nowId('el'),
            type,
            name: spec.label,
            x: position?.x ?? project.canvas.width / 2,
            y: position?.y ?? project.canvas.height / 2,
            width: spec.defaultSize[0] * ppm,
            height: spec.defaultSize[1] * ppm,
            rotation: 0,
          };
          const current = project.scenarios[state.scenario].elements;
          setElements([...current, element]);
          set({ selectedId: element.id });
          return element.id;
        },

        updateElement: (id, patch, options) => {
          const state = get();
          const project = state.currentId ? state.projects[state.currentId] : null;
          if (!project) return;
          const current = project.scenarios[state.scenario].elements;
          const original = current.find((element) => element.id === id);
          if (!original) return;
          const next = current.map((element) => element.id === id ? patchElementGeometry(element, patch) : element);
          const roomGeometryChanged = ELEMENT_SPECS[original.type].category === 'room' &&
            ['x', 'y', 'width', 'height', 'rotation', 'polygon'].some((key) => key in patch);
          if (!roomGeometryChanged) {
            setElements(next, options?.commit !== false);
            return;
          }
          mutate((currentProject) => ({
            ...currentProject,
            scenarios: {
              ...currentProject.scenarios,
              [state.scenario]: {
                elements: next,
                // 房间几何发生人工变换后旧墙拓扑已失效，安全重建为 unknown，等待用户重新确认属性。
                structure: buildStructureFromElements(next, false, currentProject.pixelsPerMeter),
              },
            },
          }), { recordHistory: options?.commit !== false });
        },

        removeElement: (id) => {
          const state = get();
          const project = state.currentId ? state.projects[state.currentId] : null;
          if (!project) return;
          const next = project.scenarios[state.scenario].elements.filter((el) => el.id !== id);
          setElements(next);
          if (state.selectedId === id) set({ selectedId: null });
        },

        clearElements: () => setElements([]),

        select: (id) => set({ selectedId: id }),

        undo: () => {
          const state = get();
          const id = state.currentId;
          if (!id) return;
          const key = `${id}:${state.scenario}`;
          const entry = state.history[key];
          if (!entry || entry.past.length === 0) return;
          const project = state.projects[id];
          const previous = entry.past[entry.past.length - 1];
          const current = cloneScenario(project.scenarios[state.scenario]);
          set({
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: {
                  ...project.scenarios,
                  [state.scenario]: cloneScenario(previous),
                },
              },
            },
            history: {
              ...state.history,
              [key]: { past: entry.past.slice(0, -1), future: [current, ...entry.future] },
            },
            selectedId: null,
            candidates: null,
            previewPlanId: null,
            selectedRegion: null,
          });
        },

        redo: () => {
          const state = get();
          const id = state.currentId;
          if (!id) return;
          const key = `${id}:${state.scenario}`;
          const entry = state.history[key];
          if (!entry || entry.future.length === 0) return;
          const project = state.projects[id];
          const next = entry.future[0];
          const current = cloneScenario(project.scenarios[state.scenario]);
          set({
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: {
                  ...project.scenarios,
                  [state.scenario]: cloneScenario(next),
                },
              },
            },
            history: {
              ...state.history,
              [key]: { past: [...entry.past, current], future: entry.future.slice(1) },
            },
            selectedId: null,
            candidates: null,
            previewPlanId: null,
            selectedRegion: null,
          });
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : window.localStorage,
      ),
      migrate: (persistedState, storedVersion) => migratePersistedState(persistedState, storedVersion),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedState(persistedState, true),
        history: {},
        selectedId: null,
        selectedRegion: null,
      }),
      onRehydrateStorage: (state) => (_rehydrated, error) => {
        if (!error || typeof window === 'undefined') return;
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // 隐私模式等环境可能禁止 localStorage；仍保持内存态可用。
        }
        state.setPersistenceNotice('本地项目数据已损坏或无法读取，已安全重置为空白状态。');
      },
      partialize: (state) => ({
        projects: state.projects,
        order: state.order,
        currentId: state.currentId,
        scenario: state.scenario,
        candidates: state.candidates,
        previewPlanId: state.previewPlanId,
        activeLayers: state.activeLayers,
        layerOpacity: state.layerOpacity,
      }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* 选择器                                                              */
/* ------------------------------------------------------------------ */

export function selectCurrentProject(state: ProjectState): Project | null {
  return state.currentId ? (state.projects[state.currentId] ?? null) : null;
}

export function selectCurrentElements(state: ProjectState): PlanElement[] {
  const project = selectCurrentProject(state);
  return project ? project.scenarios[state.scenario].elements : EMPTY_ELEMENTS;
}

export function selectCanUndo(state: ProjectState): boolean {
  if (!state.currentId) return false;
  return (state.history[`${state.currentId}:${state.scenario}`]?.past.length ?? 0) > 0;
}

export function selectCanRedo(state: ProjectState): boolean {
  if (!state.currentId) return false;
  return (state.history[`${state.currentId}:${state.scenario}`]?.future.length ?? 0) > 0;
}
