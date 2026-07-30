'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ELEMENT_SPECS } from '@/lib/element-catalog';
import { createProjectFromSample, SAMPLE_CANVAS, SAMPLE_PIXELS_PER_METER } from '@/lib/samples';
import type { ElementType, PlanElement, PlanImage, Project, ScenarioKey } from '@/lib/types';

const STORAGE_KEY = 'fengshui-layout-planner:v1';
const HISTORY_LIMIT = 50;

interface HistoryEntry {
  past: PlanElement[][];
  future: PlanElement[][];
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
        options: { recordHistory?: boolean } = {},
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
            past: [...entry.past, project.scenarios[state.scenario].elements].slice(-HISTORY_LIMIT),
            future: [],
          };
        }

        const updated = { ...updater(project), updatedAt: Date.now() };
        set({
          projects: { ...state.projects, [id]: updated },
          history: nextHistory,
        });
      };

      const setElements = (elements: PlanElement[], recordHistory = true) => {
        const scenario = get().scenario;
        mutate(
          (project) => ({
            ...project,
            scenarios: {
              ...project.scenarios,
              [scenario]: { elements },
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

        createBlankProject: (name = '未命名户型') => {
          const project = blankProject(name);
          set((state) => ({
            projects: { ...state.projects, [project.id]: project },
            order: [project.id, ...state.order],
            currentId: project.id,
            scenario: 'before',
            selectedId: null,
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
            scenarios: {
              before: { elements: source.scenarios.before.elements.map((e) => ({ ...e })) },
              after: { elements: source.scenarios.after.elements.map((e) => ({ ...e })) },
            },
          };
          set((state) => ({
            projects: { ...state.projects, [copy.id]: copy },
            order: [copy.id, ...state.order],
            currentId: copy.id,
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
            };
          }),

        renameProject: (id, name) =>
          set((state) => {
            const project = state.projects[id];
            if (!project) return state;
            return {
              projects: { ...state.projects, [id]: { ...project, name, updatedAt: Date.now() } },
            };
          }),

        setCurrent: (id) => set({ currentId: id, selectedId: null, scenario: 'before' }),

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
            canvas: { width: Math.round(width), height: Math.round(height) },
          })),

        setScenario: (scenario) => set({ scenario, selectedId: null }),

        copyScenario: (from, to) =>
          mutate(
            (project) => ({
              ...project,
              scenarios: {
                ...project.scenarios,
                [to]: { elements: project.scenarios[from].elements.map((e) => ({ ...e })) },
              },
            }),
            { recordHistory: false },
          ),

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
          const next = current.map((el) => (el.id === id ? { ...el, ...patch, id: el.id } : el));
          setElements(next, options?.commit !== false);
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
          const current = project.scenarios[state.scenario].elements;
          set({
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: {
                  ...project.scenarios,
                  [state.scenario]: { elements: previous },
                },
              },
            },
            history: {
              ...state.history,
              [key]: { past: entry.past.slice(0, -1), future: [current, ...entry.future] },
            },
            selectedId: null,
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
          const current = project.scenarios[state.scenario].elements;
          set({
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                updatedAt: Date.now(),
                scenarios: {
                  ...project.scenarios,
                  [state.scenario]: { elements: next },
                },
              },
            },
            history: {
              ...state.history,
              [key]: { past: [...entry.past, current], future: entry.future.slice(1) },
            },
            selectedId: null,
          });
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : window.localStorage,
      ),
      partialize: (state) => ({
        projects: state.projects,
        order: state.order,
        currentId: state.currentId,
        scenario: state.scenario,
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
  return project ? project.scenarios[state.scenario].elements : [];
}

export function selectCanUndo(state: ProjectState): boolean {
  if (!state.currentId) return false;
  return (state.history[`${state.currentId}:${state.scenario}`]?.past.length ?? 0) > 0;
}

export function selectCanRedo(state: ProjectState): boolean {
  if (!state.currentId) return false;
  return (state.history[`${state.currentId}:${state.scenario}`]?.future.length ?? 0) > 0;
}
