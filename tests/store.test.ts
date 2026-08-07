import { beforeEach, describe, expect, it } from 'vitest';
import { analyzePlan } from '@/lib/rules/engine';
import { createProjectFromSample } from '@/lib/samples';
import type { StructureModel } from '@/lib/types';
import { useProjectStore } from '@/store/project-store';
import {
  DEFAULT_ACTIVE_LAYERS,
  normalizePersistedState,
  migratePersistedState,
  type PersistedProjectState,
} from '@/store/persistence';

function resetStore() {
  window.localStorage.clear();
  useProjectStore.setState({
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
    persistenceNotice: null,
  });
}

describe('Project store · 场景与结构原子历史', () => {
  beforeEach(resetStore);

  it('应用候选不覆盖 before，实际重算分与预测一致，undo/redo 同时恢复元素和结构', () => {
    const id = useProjectStore.getState().createSampleProject('entry-facing-bathroom')!;
    const initial = useProjectStore.getState().projects[id];
    expect(initial.structure?.loadBearingMarked).toBe(false);
    const beforeSnapshot = structuredClone(initial.scenarios.before);
    const previousAfter = structuredClone(initial.scenarios.after);

    useProjectStore.getState().generateCandidates();
    const plan = useProjectStore.getState().candidates!.plans.find((candidate) => candidate.feasible)!;
    expect(plan).toBeTruthy();
    expect(plan.conceptOnly).toBe(true);
    useProjectStore.getState().applyCandidate(plan.id);

    let state = useProjectStore.getState();
    let project = state.projects[id];
    expect(state.scenario).toBe('after');
    expect(project.scenarios.before).toEqual(beforeSnapshot);
    expect(project.scenarios.after.structure).toEqual(plan.projectedStructure);
    expect(
      analyzePlan(project.scenarios.after.elements, {
        pixelsPerMeter: project.pixelsPerMeter,
        northAngle: project.northAngle,
        canvas: project.canvas,
      }).overall,
    ).toBe(plan.predictedScore);

    useProjectStore.getState().undo();
    state = useProjectStore.getState();
    expect(state.projects[id].scenarios.after).toEqual(previousAfter);
    expect(state.projects[id].scenarios.before).toEqual(beforeSnapshot);

    useProjectStore.getState().redo();
    project = useProjectStore.getState().projects[id];
    expect(project.scenarios.after.structure).toEqual(plan.projectedStructure);
    expect(project.scenarios.before).toEqual(beforeSnapshot);

    const structureBeforeEdit = structuredClone(project.scenarios.after.structure);
    const element = project.scenarios.after.elements[0];
    useProjectStore.getState().updateElement(element.id, { x: element.x + 5 });
    const rebuilt = useProjectStore.getState().projects[id].scenarios.after.structure!;
    expect(rebuilt).not.toEqual(structureBeforeEdit);
    expect(rebuilt.walls.every((wall) => wall.kind === 'exterior' || wall.kind === 'unknown')).toBe(true);
  });

  it('墙体标记 → 真实移动候选 → 应用 → undo/redo 原子恢复 polygon、墙和门窗', () => {
    const id = useProjectStore.getState().createSampleProject('entry-facing-bathroom')!;
    const project = useProjectStore.getState().projects[id];
    const shared = project.structure!.walls.find((wall) => wall.adjacentRooms[0] && wall.adjacentRooms[1])!;
    expect(shared.kind).toBe('unknown');
    useProjectStore.getState().setWallKind(shared.id, 'partition');
    expect(useProjectStore.getState().projects[id].scenarios.before.structure?.walls.find((wall) => wall.id === shared.id)?.movable).toBe(true);

    useProjectStore.getState().generateCandidates();
    const plan = useProjectStore.getState().candidates!.plans.find((candidate) =>
      candidate.feasible && candidate.modifications.some((modification) => modification.kind === 'move-wall'),
    )!;
    expect(plan).toBeTruthy();
    const previousAfter = structuredClone(useProjectStore.getState().projects[id].scenarios.after);
    useProjectStore.getState().applyCandidate(plan.id);
    let after = useProjectStore.getState().projects[id].scenarios.after;
    expect(after.elements.some((element) => element.polygon?.length)).toBe(true);
    expect(after.structure).toEqual(plan.projectedStructure);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().projects[id].scenarios.after).toEqual(previousAfter);
    useProjectStore.getState().redo();
    after = useProjectStore.getState().projects[id].scenarios.after;
    expect(after.structure).toEqual(plan.projectedStructure);
    expect(after.elements).toEqual(plan.projectedElements);
  });

  it('户型编辑后清除陈旧候选，避免应用旧预测', () => {
    const id = useProjectStore.getState().createSampleProject('entry-facing-bathroom')!;
    useProjectStore.getState().generateCandidates();
    expect(useProjectStore.getState().candidates).not.toBeNull();
    const element = useProjectStore.getState().projects[id].scenarios.before.elements[0];
    useProjectStore.getState().updateElement(element.id, { x: element.x + 10 });
    expect(useProjectStore.getState().candidates).toBeNull();
  });
});

describe('Project store · localStorage schema v3', () => {
  beforeEach(resetStore);

  it('持久化当前场景、候选、图层开关与透明度', () => {
    useProjectStore.getState().createSampleProject('entry-facing-bathroom');
    useProjectStore.getState().toggleLayer('heatmap');
    useProjectStore.getState().toggleLayer('energy');
    useProjectStore.getState().setLayerOpacity(0.72);
    useProjectStore.getState().generateCandidates();
    useProjectStore.getState().setPreviewPlan('B');

    const partialize = useProjectStore.persist.getOptions().partialize!;
    const persisted = partialize(useProjectStore.getState()) as unknown;
    const restored = normalizePersistedState(persisted, true);
    expect(restored.currentId).toBeTruthy();
    expect(restored.scenario).toBe('before');
    expect(restored.activeLayers.heatmap).toBe(true);
    expect(restored.activeLayers.energy).toBe(true);
    expect(restored.layerOpacity).toBe(0.72);
    expect(restored.candidates?.plans).toHaveLength(3);
    expect(restored.previewPlanId).toBe('B');
  });

  it('旧版无效 inner 墙体关联会被丢弃并保留项目元素，之后可安全重建', () => {
    const project = createProjectFromSample('entry-facing-bathroom', 123)!;
    const invalidStructure: StructureModel = {
      ...project.structure!,
      doors: project.structure!.doors.map((door) => ({ ...door, wallId: 'inner' })),
    };
    const legacy = {
      projects: { [project.id]: { ...project, structure: invalidStructure } },
      order: [project.id],
      currentId: project.id,
      scenario: 'before',
    };
    const restored = normalizePersistedState(legacy, false);
    expect(restored.projects[project.id].scenarios.before.elements.length).toBeGreaterThan(0);
    expect(restored.projects[project.id].structure).toBeUndefined();
  });

  it('损坏但可解析的数据会安全归一化，不让页面访问缺失场景时崩溃', () => {
    const restored: PersistedProjectState = normalizePersistedState({
      projects: { broken: { id: 'broken', scenarios: null, canvas: { width: -1 } } },
      order: ['missing', 'broken'],
      currentId: 'missing',
      scenario: 'unexpected',
      activeLayers: { heatmap: 'yes' },
      layerOpacity: 9,
    });
    expect(restored.currentId).toBe('broken');
    expect(restored.scenario).toBe('before');
    expect(restored.projects.broken.scenarios.before.elements).toEqual([]);
    expect(restored.projects.broken.scenarios.after.elements).toEqual([]);
    expect(restored.projects.broken.canvas.width).toBe(400);
    expect(restored.activeLayers.heatmap).toBe(false);
    expect(restored.layerOpacity).toBe(1);
  });

  it('候选方案嵌套字段损坏时只丢弃候选，不影响原项目恢复', () => {
    const id = useProjectStore.getState().createSampleProject('entry-facing-bathroom')!;
    useProjectStore.getState().generateCandidates();
    const partialize = useProjectStore.persist.getOptions().partialize!;
    const persisted = structuredClone(partialize(useProjectStore.getState())) as Record<string, unknown>;
    const candidates = persisted.candidates as { plans: Array<Record<string, unknown>> };
    candidates.plans[0].predictedCategories = null;

    const restored = normalizePersistedState(persisted, true);
    expect(restored.projects[id].scenarios.before.elements.length).toBeGreaterThan(0);
    expect(restored.candidates).toBeNull();
    expect(restored.previewPlanId).toBeNull();
  });

  it('v2 自动推导的 partition 安全迁移为 unknown，并丢弃旧候选等待重算', () => {
    const project = createProjectFromSample('entry-facing-bathroom', 456)!;
    const legacyStructure = {
      ...project.structure!,
      walls: project.structure!.walls.map((wall) => wall.kind === 'unknown'
        ? { ...wall, kind: 'partition' as const, movable: true }
        : wall),
    };
    const migrated = migratePersistedState({
      projects: { [project.id]: { ...project, structure: legacyStructure } },
      order: [project.id],
      currentId: project.id,
      scenario: 'before',
      candidates: { plans: [] },
    }, 2);
    expect(migrated.projects[project.id].structure?.walls.some((wall) => wall.kind === 'unknown')).toBe(true);
    expect(migrated.projects[project.id].structure?.walls.some((wall) => wall.kind === 'partition')).toBe(false);
    expect(migrated.candidates).toBeNull();
  });
});
