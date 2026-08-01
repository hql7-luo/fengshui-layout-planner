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

console.log('=== 五个真实户型评分变化 ===');
for (const sample of samples) {
  const analysis = analyzePlan(sample.elements, OPTIONS);
  const structure = buildStructureFromElements(sample.elements, true, PPM);
  const opt = generateCandidatePlans({ elements: sample.elements, structure, options: OPTIONS });
  const bestPlan = opt.plans
    .filter((p) => p.feasible)
    .sort((a, b) => b.predictedScore - a.predictedScore)[0];

  console.log(`\n${sample.name}:`);
  console.log(`  原始评分: ${analysis.overall}`);
  console.log(`  检测到问题: ${analysis.issues.length} 项`);
  console.log(`  优化器可行方案: ${opt.plans.filter((p) => p.feasible).length}/3`);
  if (bestPlan) {
    console.log(`  最优方案预测评分: ${bestPlan.predictedScore} (${bestPlan.title})`);
    console.log(`  解决问题: ${bestPlan.solvedIssueKeys.length} 项`);
    console.log(`  改动项: ${bestPlan.modifications.map((m) => m.label).join('、') || '无'}`);
  } else {
    console.log('  无可行结构优化方案（仅家具自动优化）');
  }
}

console.log('\n=== 性能测试结果 ===');
const complex = complexPerformancePlan();

const t0 = performance.now();
const analysis = analyzePlan(complex, LARGE_OPTIONS);
const analysisTime = performance.now() - t0;
console.log(`分析计算: ${analysisTime.toFixed(1)}ms (问题 ${analysis.issues.length} 项)`);

const t1 = performance.now();
const layers = computeLayers({
  elements: complex,
  analysis,
  options: LARGE_OPTIONS,
});
const layersTime = performance.now() - t1;
console.log(`7 图层计算: ${layersTime.toFixed(1)}ms`);

const t2 = performance.now();
const opt = generateCandidatePlans({
  elements: complex,
  structure: buildStructureFromElements(complex, true, PPM),
  options: LARGE_OPTIONS,
});
const optTime = performance.now() - t2;
console.log(`优化器计算: ${optTime.toFixed(1)}ms`);
