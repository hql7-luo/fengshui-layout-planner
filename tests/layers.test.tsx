import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { analyzePlan } from '@/lib/rules/engine';
import { createProjectFromSample } from '@/lib/samples';
import { buildStructureFromElements, generateCandidatePlans } from '@/lib/optimizer';
import { computeLayers, LAYER_IDS, type AllLayers, type LayerInput } from '@/lib/analysis-layers';
import LayerPanel from '@/components/editor/LayerPanel';
import { useProjectStore } from '@/store/project-store';
import type { PlanElement, Project } from '@/lib/types';

const SAMPLE_ID = 'entry-facing-bathroom';

const ALL_OFF = Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<
  (typeof LAYER_IDS)[number],
  boolean
>;

function optionsOf(project: Project) {
  return {
    pixelsPerMeter: project.pixelsPerMeter,
    northAngle: project.northAngle,
    canvas: project.canvas,
  };
}

function buildInput(elements: PlanElement[], project: Project): LayerInput {
  return {
    elements,
    analysis: analyzePlan(elements, optionsOf(project)),
    options: optionsOf(project),
  };
}

/**
 * 用结构优化器生成「优化后」布局：取解决问题数最多的可行方案的 projectedElements。
 * 这是用户「根据结构优化方案实时重算」验收点对应的真实路径。
 */
function optimizedAfter(project: Project): { before: PlanElement[]; after: PlanElement[]; solved: number } {
  const before = project.scenarios.before.elements;
  const structure = buildStructureFromElements(before, true, project.pixelsPerMeter);
  const result = generateCandidatePlans({ elements: before, structure, options: optionsOf(project) });
  const plan = [...result.plans].sort(
    (a, b) => b.solvedIssueKeys.length - a.solvedIssueKeys.length,
  )[0];
  return { before, after: plan.projectedElements, solved: plan.solvedIssueKeys.length };
}

/** 仅房间、无门窗、无入户门，用于「数据不足」测试 */
function roomsOnly(elements: PlanElement[]): PlanElement[] {
  const roomTypes = new Set([
    'living_room',
    'master_bedroom',
    'second_bedroom',
    'kitchen',
    'bathroom',
    'balcony',
    'study',
    'dining_room',
  ]);
  return elements.filter((e) => roomTypes.has(e.type));
}

beforeEach(() => {
  // 图层开关/透明度不持久化（partialize 未包含），但用例间仍重置为全关以隔离状态
  useProjectStore.setState({ activeLayers: { ...ALL_OFF }, layerOpacity: 0.55, selectedRegion: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('分析图层 · 确定性', () => {
  it('相同输入两次计算结果完全一致（无随机值）', () => {
    const project = createProjectFromSample(SAMPLE_ID)!;
    const input = buildInput(project.scenarios.before.elements, project);
    const a = computeLayers(input);
    const b = computeLayers(input);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('分析图层 · before/after 实时重算', () => {
  it('应用结构优化方案后图层结果随布局变化', () => {
    const project = createProjectFromSample(SAMPLE_ID)!;
    const { before, after, solved } = optimizedAfter(project);
    expect(solved).toBeGreaterThan(0);

    const beforeLayers: AllLayers = computeLayers(buildInput(before, project));
    const afterLayers: AllLayers = computeLayers(buildInput(after, project));

    // 隐私图层（玄关阻断入户正对卫生间）应发生可见变化
    expect(JSON.stringify(beforeLayers.privacy)).not.toEqual(JSON.stringify(afterLayers.privacy));
    // 整体图层输出不应完全相等
    expect(JSON.stringify(beforeLayers)).not.toEqual(JSON.stringify(afterLayers));
  });
});

describe('分析图层 · 解决问题后冲突热区减少', () => {
  it('结构优化后问题数减少、隐私直视冲突热区减少、热力图区域减少', () => {
    const project = createProjectFromSample(SAMPLE_ID)!;
    const { before, after, solved } = optimizedAfter(project);
    expect(solved).toBeGreaterThan(0);

    const beforeInput = buildInput(before, project);
    const afterInput = buildInput(after, project);
    const beforeLayers = computeLayers(beforeInput);
    const afterLayers = computeLayers(afterInput);

    // 1) 结构优化确实解决了问题（问题数下降）
    expect(afterInput.analysis.issues.length).toBeLessThan(beforeInput.analysis.issues.length);

    // 2) 隐私直视冲突热区（红色 conflict 区域）减少
    const beforeConflict = beforeLayers.privacy.regions.filter((r) => r.kind === 'conflict').length;
    const afterConflict = afterLayers.privacy.regions.filter((r) => r.kind === 'conflict').length;
    expect(beforeConflict).toBeGreaterThan(0);
    expect(afterConflict).toBeLessThan(beforeConflict);

    // 3) 问题热力图区域随问题解决而减少（每条命中问题生成对应热区）
    expect(afterLayers.heatmap.regions.length).toBeLessThan(beforeLayers.heatmap.regions.length);
  });
});

describe('分析图层 · 独立开关', () => {
  it('各图层开关互相独立', () => {
    const store = useProjectStore.getState();
    store.toggleLayer('heatmap');
    let active = useProjectStore.getState().activeLayers;
    expect(active.heatmap).toBe(true);
    for (const id of LAYER_IDS) {
      if (id !== 'heatmap') expect(active[id]).toBe(false);
    }

    store.toggleLayer('energy');
    active = useProjectStore.getState().activeLayers;
    expect(active.heatmap).toBe(true);
    expect(active.energy).toBe(true);
    expect(active.privacy).toBe(false);

    store.toggleLayer('heatmap');
    active = useProjectStore.getState().activeLayers;
    expect(active.heatmap).toBe(false);
    expect(active.energy).toBe(true);
  });
});

describe('分析图层 · 透明度调整', () => {
  it('透明度在 0-1 之间且可 clamp', () => {
    const store = useProjectStore.getState();
    store.setLayerOpacity(0.3);
    expect(useProjectStore.getState().layerOpacity).toBeCloseTo(0.3);
    store.setLayerOpacity(1.5);
    expect(useProjectStore.getState().layerOpacity).toBe(1);
    store.setLayerOpacity(-0.2);
    expect(useProjectStore.getState().layerOpacity).toBe(0);
  });
});

describe('分析图层 · 数据不足提示', () => {
  it('缺少门窗 / 入户门 / 朝向数据时返回 sufficient=false 与原因', () => {
    const project = createProjectFromSample(SAMPLE_ID)!;
    const onlyRooms = roomsOnly(project.scenarios.before.elements);
    expect(onlyRooms.length).toBeGreaterThan(0);
    const layers = computeLayers(buildInput(onlyRooms, project));

    expect(layers.privacy.sufficient).toBe(false);
    expect(layers.privacy.insufficiencyReason ?? '').toContain('入户门');
    expect(layers.airflow.sufficient).toBe(false);
    expect(layers.airflow.insufficiencyReason ?? '').toContain('门窗');
    expect(layers.circulation.sufficient).toBe(false);
    expect(layers.circulation.insufficiencyReason ?? '').toContain('入户门');
    expect(layers.daylight.sufficient).toBe(false);
    expect(layers.daylight.insufficiencyReason ?? '').toContain('窗户');
    // 有房间时动静分区与能量图仍可得（数据充足）
    expect(layers.zoning.sufficient).toBe(true);
    expect(layers.energy.sufficient).toBe(true);
    // 热力图本身不依赖门窗，恒为充足
    expect(layers.heatmap.sufficient).toBe(true);
  });
});

describe('分析图层 · 不修改原始元素', () => {
  it('computeLayers 不修改传入的 elements', () => {
    const project = createProjectFromSample(SAMPLE_ID)!;
    const elements = project.scenarios.before.elements;
    const snapshot = JSON.stringify(elements);
    const beforeRefs = elements.map((e) => e);
    computeLayers(buildInput(elements, project));
    expect(JSON.stringify(elements)).toEqual(snapshot);
    elements.forEach((e, i) => expect(e).toBe(beforeRefs[i]));
  });
});

describe('图层控制面板 · 移动端默认折叠', () => {
  beforeEach(() => {
    // jsdom 不实现 matchMedia，mock 为移动端（max-width:768px 命中）
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  it('移动端默认折叠复杂图层控制（按钮显示「展开」）', async () => {
    const project = createProjectFromSample(SAMPLE_ID)!;
    const input = buildInput(project.scenarios.before.elements, project);
    render(<LayerPanel layers={computeLayers(input)} />);
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: '展开' });
      expect(btn).toBeInTheDocument();
    });
  });
});
