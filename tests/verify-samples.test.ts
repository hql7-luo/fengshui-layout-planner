import { describe, expect, it } from 'vitest';
import { analyzePlan } from '@/lib/rules/engine';
import { generateCandidatePlans } from '@/lib/optimizer';
import { computeLayers } from '@/lib/analysis-layers';
import { ELEMENT_SPECS } from '@/lib/element-catalog';
import {
  smallApartment,
  longCorridorApartment,
  dualBathroomApartment,
  entrySeesBedroom,
  openLivingDining,
  complexPerformancePlan,
} from '@/lib/verify-samples';
import type { PlanElement } from '@/lib/types';
import { explicitlyClassifiedStructure } from './helpers/structure';

const PPM = 75;
const OPTIONS = { pixelsPerMeter: PPM, northAngle: 0, canvas: { width: 1080, height: 840 } };
const LARGE_OPTIONS = { pixelsPerMeter: PPM, northAngle: 0, canvas: { width: 1200, height: 1000 } };

function runOptimizer(els: PlanElement[], opts = OPTIONS) {
  return generateCandidatePlans({
    elements: els,
    structure: explicitlyClassifiedStructure(els, PPM),
    options: opts,
  });
}

/* ================================================================ */
/* 验收 5: 五个真实户型验证                                          */
/* ================================================================ */

describe('五个真实户型验证', () => {
  const cases: Array<{ name: string; elements: () => PlanElement[] }> = [
    { name: '小户型', elements: smallApartment },
    { name: '长走廊户型', elements: longCorridorApartment },
    { name: '双卫生间户型', elements: dualBathroomApartment },
    { name: '入户见卧室户型', elements: entrySeesBedroom },
    { name: '开放式客餐厅户型', elements: openLivingDining },
  ];

  for (const tc of cases) {
    describe(`${tc.name}`, () => {
      const els = tc.elements();
      const analysis = analyzePlan(els, OPTIONS);
      const opt = runOptimizer(els);

      it('分析结果确定性（无随机）', () => {
        const again = analyzePlan(els, OPTIONS);
        expect(again.overall).toBe(analysis.overall);
        expect(again.issues.length).toBe(analysis.issues.length);
        expect(again.issues.map((i) => i.key).sort()).toEqual(analysis.issues.map((i) => i.key).sort());
      });

      it('检测到的问题有具体规则和元素指向（非误报空指针）', () => {
        for (const issue of analysis.issues) {
          expect(issue.ruleId).toBeTruthy();
          expect(issue.name).toBeTruthy();
          expect(issue.severity).toBeTruthy();
          // 问题至少有一个元素指向或标记位置
          expect(issue.elementIds.length > 0 || issue.marker).toBeTruthy();
        }
      });

      it('优化器生成 3 个候选方案', () => {
        expect(opt.plans).toHaveLength(3);
        expect(opt.plans.map((p) => p.id)).toEqual(['A', 'B', 'C']);
      });

      it('可行方案的预测分与重算一致（非编造）', () => {
        for (const plan of opt.plans.filter((p) => p.feasible)) {
          const recomputed = analyzePlan(plan.projectedElements, OPTIONS);
          expect(recomputed.overall).toBe(plan.predictedScore);
        }
      });

      it('优化后不产生新问题（或新问题数量 ≤ 解决的问题数）', () => {
        for (const plan of opt.plans.filter((p) => p.feasible)) {
          expect(plan.introducedIssues.some((issue) => issue.severity === 'high')).toBe(false);
          expect(plan.solvedIssues.length).toBeGreaterThanOrEqual(plan.introducedIssues.length);
        }
      });

      it('7 个分析图层均可计算（无崩溃）', () => {
        const layers = computeLayers({
          elements: els,
          analysis,
          options: OPTIONS,
        });
        expect(layers).toBeTruthy();
        // 每层都有 regions 或 sufficient=false（数据不足）
        for (const layerId of ['heatmap', 'privacy', 'airflow', 'circulation', 'daylight', 'zoning', 'energy'] as const) {
          const layer = layers[layerId];
          expect(layer).toBeTruthy();
          if (layer.sufficient) {
            expect(layer.regions.length + layer.lines.length).toBeGreaterThan(0);
          } else {
            expect(layer.insufficiencyReason).toBeTruthy();
          }
        }
      });
    });
  }
});

/* ================================================================ */
/* 验收 4: 性能测试                                                  */
/* ================================================================ */

describe('性能测试 · 复杂户型（12房间/16门窗/25家具）', () => {
  const els = complexPerformancePlan();
  const rooms = els.filter((e) => ELEMENT_SPECS[e.type]?.category === 'room');
  const doors = els.filter((e) => e.type === 'entry_door' || e.type === 'room_door');
  const windows = els.filter((e) => e.type === 'window');
  const furniture = els.filter((e) => ELEMENT_SPECS[e.type]?.category === 'furniture');

  it('样本规模达标：≥12房间 / ≥15门窗 / ≥25家具', () => {
    expect(rooms.length).toBeGreaterThanOrEqual(12);
    expect(doors.length + windows.length).toBeGreaterThanOrEqual(15);
    expect(furniture.length).toBeGreaterThanOrEqual(25);
  });

  it('分析计算在 2 秒内完成', () => {
    const start = performance.now();
    const analysis = analyzePlan(els, LARGE_OPTIONS);
    const elapsed = performance.now() - start;
    expect(analysis.issues.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  });

  it('7 图层同时计算在 3 秒内完成', () => {
    const analysis = analyzePlan(els, LARGE_OPTIONS);
    const start = performance.now();
    const layers = computeLayers({
      elements: els,
      analysis,
      options: LARGE_OPTIONS,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(3000);
    // 每层都有结果
    for (const layerId of ['heatmap', 'privacy', 'airflow', 'circulation', 'daylight', 'zoning', 'energy'] as const) {
      expect(layers[layerId]).toBeTruthy();
    }
  });

  it('优化器计算在 5 秒内完成', () => {
    const start = performance.now();
    const result = runOptimizer(els, LARGE_OPTIONS);
    const elapsed = performance.now() - start;
    expect(result.plans).toHaveLength(3);
    expect(elapsed).toBeLessThan(5000);
  });

  it('重复计算结果一致（确定性，无随机）', () => {
    const a1 = analyzePlan(els, LARGE_OPTIONS);
    const a2 = analyzePlan(els, LARGE_OPTIONS);
    expect(a1.overall).toBe(a2.overall);
    expect(a1.issues.length).toBe(a2.issues.length);
  });

  it('网格采样密度自适应（能量图层区域数与画布面积正相关）', () => {
    const analysis = analyzePlan(els, LARGE_OPTIONS);
    const smallCanvasLayers = computeLayers({
      elements: els,
      analysis,
      options: { ...OPTIONS, canvas: { width: 600, height: 400 } },
    });
    const largeCanvasLayers = computeLayers({
      elements: els,
      analysis,
      options: { ...LARGE_OPTIONS, canvas: { width: 1500, height: 1200 } },
    });
    const smallEnergy = smallCanvasLayers.energy.regions.length;
    const largeEnergy = largeCanvasLayers.energy.regions.length;
    expect(largeEnergy).toBeGreaterThan(smallEnergy);
  });

  it('computeLayers 不修改输入元素（无副作用）', () => {
    const analysis = analyzePlan(els, LARGE_OPTIONS);
    const snapshot = JSON.stringify(els);
    computeLayers({ elements: els, analysis, options: LARGE_OPTIONS });
    expect(JSON.stringify(els)).toBe(snapshot);
  });

  it('优化器不修改输入元素（无副作用）', () => {
    const snapshot = JSON.stringify(els);
    runOptimizer(els, LARGE_OPTIONS);
    expect(JSON.stringify(els)).toBe(snapshot);
  });
});
