import { computeLayers } from '@/lib/analysis-layers';
import { analyzePlan } from '@/lib/rules/engine';
import { generateCandidatePlans, buildStructureFromElements } from '@/lib/optimizer';
import {
  smallApartment,
  longCorridorApartment,
  dualBathroomApartment,
  entrySeesBedroom,
  openLivingDining,
  complexPerformancePlan,
} from '@/lib/verify-samples';

const PPM = 75;
const OPTIONS = { pixelsPerMeter: PPM, northAngle: 0, canvas: { width: 1080, height: 840 } };
const LARGE_OPTIONS = { pixelsPerMeter: PPM, northAngle: 0, canvas: { width: 1200, height: 1000 } };

const samples = [
  { name: '小户型', elements: smallApartment() },
  { name: '长走廊户型', elements: longCorridorApartment() },
  { name: '双卫生间户型', elements: dualBathroomApartment() },
  { name: '入户见卧室户型', elements: entrySeesBedroom() },
  { name: '开放式客餐厅户型', elements: openLivingDining() },
];

const representativeNames = new Set(['长走廊户型', '双卫生间户型', '开放式客餐厅户型']);
const representativeResults: string[] = [];

console.log('=== 五个真实户型评分变化 ===');
for (const sample of samples) {
  const analysis = analyzePlan(sample.elements, OPTIONS);
  const structure = buildStructureFromElements(sample.elements, true, PPM);
  const opt = generateCandidatePlans({ elements: sample.elements, structure, options: OPTIONS });
  const bestPlan = opt.plans
    .filter((p) => p.feasible)
    .sort((a, b) => b.predictedScore - a.predictedScore)[0];
  const structuralPlan = opt.plans
    .filter((plan) => plan.feasible && plan.modifications.some((modification) => modification.kind === 'move-wall'))
    .sort((a, b) => b.predictedScore - a.predictedScore || b.changeCost - a.changeCost)[0];

  console.log(`\n${sample.name}:`);
  console.log(`  原始评分: ${analysis.overall}`);
  console.log(`  检测到问题: ${analysis.issues.length} 项`);
  console.log(`  优化器可行方案: ${opt.plans.filter((p) => p.feasible).length}/3`);
  if (bestPlan) {
    console.log(`  最优方案预测评分: ${bestPlan.predictedScore} (${bestPlan.title})`);
    console.log(`  解决问题: ${bestPlan.solvedIssueKeys.length} 项`);
    console.log(`  改动项: ${bestPlan.modifications.map((m) => m.label).join('、') || '无'}`);
  } else {
    console.log('  无可行结构优化方案');
    console.log(`  约束原因: ${[...new Set(opt.plans.map((plan) => plan.infeasibleReason).filter(Boolean))].join('；')}`);
  }
  if (structuralPlan) {
    const moves = structuralPlan.modifications.flatMap((modification) => modification.movedWalls ?? []);
    const areas = structuralPlan.modifications.flatMap((modification) => modification.roomAreaChanges ?? []);
    console.log(`  结构方案: ${structuralPlan.id}，墙移动 ${moves.map((move) => `${Math.abs(move.distanceM).toFixed(2)}m`).join('、')}`);
    console.log(`  房间面积变化: ${areas.map((area) => `${area.roomName} ${area.beforeM2.toFixed(2)}→${area.afterM2.toFixed(2)}㎡`).join('；')}`);
    if (representativeNames.has(sample.name)) {
      representativeResults.push(
        `${sample.name}: ${analysis.overall}→${structuralPlan.predictedScore}，方案 ${structuralPlan.id}，` +
        `${moves.map((move) => `${Math.abs(move.distanceM).toFixed(2)}m`).join('、')}，` +
        `${areas.map((area) => `${area.roomName} ${area.beforeM2.toFixed(2)}→${area.afterM2.toFixed(2)}㎡`).join('；')}`,
      );
    }
  }
}

console.log('\n=== 三个代表性墙体结构案例（内部共享墙已显式确认为 partition）===');
for (const result of representativeResults) console.log(result);

console.log('\n=== 性能测试结果 ===');
const complex = complexPerformancePlan();
const complexAnalysis = analyzePlan(complex, LARGE_OPTIONS);

function medianMs(run: () => void, iterations: number): number {
  for (let index = 0; index < 3; index += 1) run();
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    run();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const analysisTime = medianMs(() => {
  analyzePlan(complex, LARGE_OPTIONS);
}, 50);
console.log(`分析计算中位数: ${analysisTime.toFixed(2)}ms (问题 ${complexAnalysis.issues.length} 项, 50 次)`);

const layersTime = medianMs(() => {
  computeLayers({
    elements: complex,
    analysis: complexAnalysis,
    options: LARGE_OPTIONS,
  });
}, 30);
console.log(`7 图层计算中位数: ${layersTime.toFixed(2)}ms (30 次)`);

const complexStructure = buildStructureFromElements(complex, true, PPM);
const optTime = medianMs(() => {
  generateCandidatePlans({
    elements: complex,
    structure: complexStructure,
    options: LARGE_OPTIONS,
  });
}, 20);
console.log(`优化器计算中位数: ${optTime.toFixed(2)}ms (20 次)`);
