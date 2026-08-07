import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'fengshui-layout-planner:v1';

interface StoredElement {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface StoredScenario {
  elements: StoredElement[];
  structure?: unknown;
}

interface StoredPlan {
  id: 'A' | 'B' | 'C';
  feasible: boolean;
  predictedScore: number;
  modifications: Array<{
    kind: string;
    movedWalls?: Array<{ wallId: string; distanceM: number }>;
    roomAreaChanges?: Array<{ roomId: string; beforeM2: number; afterM2: number }>;
  }>;
}

interface StoredStructure {
  walls: Array<{
    id: string;
    kind: 'exterior' | 'load-bearing' | 'partition' | 'unknown';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    adjacentRooms: [string | null, string | null];
  }>;
}

interface StoredEnvelope {
  version: number;
  state: {
    projects: Record<string, {
      canvas: { width: number; height: number };
      scenarios: { before: StoredScenario; after: StoredScenario };
      structure?: StoredStructure;
    }>;
    currentId: string;
    scenario: 'before' | 'after';
    activeLayers: Record<string, boolean>;
    layerOpacity: number;
    candidates: { plans: StoredPlan[] } | null;
    previewPlanId: string | null;
  };
}

async function persisted(page: Page): Promise<StoredEnvelope> {
  return page.evaluate((key) => {
    const value = window.localStorage.getItem(key);
    if (!value) throw new Error(`missing localStorage key: ${key}`);
    return JSON.parse(value) as StoredEnvelope;
  }, STORAGE_KEY);
}

async function loadFirstSample(page: Page) {
  await page.goto('/editor');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /示例一/ }).click();
  await expect(page.locator('[data-testid="plan-canvas"] canvas').first()).toBeVisible();
}

async function markSharedWallAsPartition(page: Page) {
  const initial = await persisted(page);
  const project = initial.state.projects[initial.state.currentId];
  const shared = project.structure?.walls.find((wall) => wall.adjacentRooms[0] && wall.adjacentRooms[1]);
  if (!shared) throw new Error('sample has no shared wall');
  const stage = page.locator('[data-testid="plan-canvas"] .konvajs-content');
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox();
  if (!box) throw new Error('Konva stage has no bounding box');
  const x = box.x + (((shared.x1 + shared.x2) / 2) / project.canvas.width) * box.width;
  const y = box.y + (((shared.y1 + shared.y2) / 2) / project.canvas.height) * box.height;
  await page.mouse.click(x, y);
  await expect(page.locator('[data-testid="wall-inspector"]')).toBeVisible();
  await page.locator('[data-testid="wall-kind-partition"]').click();
  await expect(page.locator('[data-testid="wall-kind-partition"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const state = await persisted(page);
    return state.state.projects[state.state.currentId].scenarios.before.structure &&
      (state.state.projects[state.state.currentId].scenarios.before.structure as StoredStructure).walls
        .find((wall) => wall.id === shared.id)?.kind;
  }).toBe('partition');
  return shared.id;
}

function captureRuntimeProblems(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (!request.url().includes('favicon')) {
      errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`response ${response.status()}: ${response.url()}`);
  });
  return errors;
}

test('候选、七图层、结构应用、原子撤销、刷新和报告完整闭环', async ({ page }, testInfo) => {
  const runtimeProblems = captureRuntimeProblems(page);
  await loadFirstSample(page);
  const markedWallId = await markSharedWallAsPartition(page);

  const expand = page.getByRole('button', { name: '展开' });
  if (await expand.isVisible()) await expand.click();

  const layerNames = [
    '风水问题热力图',
    '入户隐私视线图',
    '门窗气流路径图',
    '主要生活动线图',
    '采光潜力图',
    '动区与静区分布图',
    '阳宅空间能量示意图',
  ];
  for (const name of layerNames) {
    const checkbox = page.getByLabel(name);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  }
  await page.getByLabel('图层透明度').fill('70');

  const airflowCard = page
    .getByText('门窗气流路径图', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded") and contains(@class,"border")][1]');
  await airflowCard.getByText(/查看计算依据/).click();
  await airflowCard.locator('details button').first().click();
  await expect(page.getByText(/为气口，气流沿其朝向进入室内/)).toBeVisible();

  const canvasLayerCountBeforeCandidate = await page
    .locator('[data-testid="plan-canvas"] .konvajs-content canvas')
    .count();
  await page.getByRole('button', { name: '生成结构优化方案' }).click();
  for (const id of ['A', 'B', 'C'] as const) {
    await expect(page.locator(`[data-testid="candidate-${id}"]`)).toBeVisible();
  }
  for (const id of ['A', 'C', 'B'] as const) {
    await page.locator(`[data-testid="candidate-${id}"]`).click();
    await expect(page.locator(`[data-testid="candidate-${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await persisted(page)).state.previewPlanId).toBe(id);
  }

  const generated = await persisted(page);
  const projectId = generated.state.currentId;
  const beforeSnapshot = JSON.stringify(generated.state.projects[projectId].scenarios.before);
  const priorAfter = JSON.stringify(generated.state.projects[projectId].scenarios.after);
  const planB = generated.state.candidates!.plans.find((plan) => plan.id === 'B')!;
  expect(planB.feasible).toBe(true);
  expect(planB.modifications.some((modification) =>
    modification.kind === 'move-wall' && modification.movedWalls?.some((wall) => wall.wallId === markedWallId)
  )).toBe(true);
  expect(planB.modifications.flatMap((modification) => modification.roomAreaChanges ?? []).length).toBe(2);
  expect(
    new Set(generated.state.candidates!.plans.map((plan) => JSON.stringify(plan.modifications))).size,
  ).toBe(3);
  await expect(page.getByText(/原墙为灰色虚线，新墙为绿色实线/)).toBeVisible();
  const canvasLayerCountWithCandidate = await page
    .locator('[data-testid="plan-canvas"] .konvajs-content canvas')
    .count();
  expect(canvasLayerCountWithCandidate).toBeGreaterThan(canvasLayerCountBeforeCandidate);
  expect(canvasLayerCountWithCandidate).toBeLessThanOrEqual(5);

  const screenshotsDir = path.join(process.cwd(), 'tests', 'screenshots');
  mkdirSync(screenshotsDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotsDir, `${testInfo.project.name}-wall-preview.png`),
    fullPage: true,
  });

  await page.reload();
  if (await page.getByRole('button', { name: '展开' }).isVisible()) {
    await page.getByRole('button', { name: '展开' }).click();
  }
  await expect(page.locator('[data-testid="candidate-B"]')).toHaveAttribute('aria-pressed', 'true');
  for (const name of layerNames) await expect(page.getByLabel(name)).toBeChecked();
  await expect(page.getByLabel('图层透明度')).toHaveValue('70');

  await page.locator('[data-testid="apply-candidate"]').click();
  await expect(page.getByRole('button', { name: '改造后' })).toHaveAttribute('aria-pressed', 'true');
  const applied = await persisted(page);
  expect(JSON.stringify(applied.state.projects[projectId].scenarios.before)).toBe(beforeSnapshot);
  expect(JSON.stringify(applied.state.projects[projectId].scenarios.after)).not.toBe(priorAfter);
  expect(applied.state.projects[projectId].scenarios.after.structure).toBeTruthy();
  expect(applied.state.projects[projectId].scenarios.after.elements.some((element) =>
    Array.isArray((element as StoredElement & { polygon?: unknown[] }).polygon)
  )).toBe(true);
  await expect(page.getByText(new RegExp(`综合评分 ${planB.predictedScore}$`))).toBeVisible();

  const undo = page.getByRole('button', { name: '撤销' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(async () => JSON.stringify((await persisted(page)).state.projects[projectId].scenarios.after)).toBe(priorAfter);
  expect(JSON.stringify((await persisted(page)).state.projects[projectId].scenarios.before)).toBe(beforeSnapshot);

  const redo = page.getByRole('button', { name: '恢复' });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(async () => Boolean((await persisted(page)).state.projects[projectId].scenarios.after.structure)).toBe(true);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: path.join(screenshotsDir, `${testInfo.project.name}-final.png`), fullPage: true });

  await page.getByRole('link', { name: '生成分析报告' }).click();
  await expect(page.getByText(/AI 风水户型助手 · 户型布局分析报告/)).toBeVisible();
  await expect(page.getByRole('contentinfo').getByText(/实际装修和施工方案应由建筑师/)).toBeVisible();
  expect(runtimeProblems, runtimeProblems.join('\n')).toEqual([]);
});

test('上传、添加、改名、旋转、真实拖拽、删除、撤销恢复和缩放', async ({ page }) => {
  const runtimeProblems = captureRuntimeProblems(page);
  await loadFirstSample(page);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByText(/仅支持 JPG 与 PNG/)).toBeVisible();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
    'base64',
  );
  await fileInput.setInputFiles({ name: 'floor-plan.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('button', { name: '更换底图' })).toBeVisible();

  const beforeAdd = await persisted(page);
  const projectId = beforeAdd.state.currentId;
  const countBefore = beforeAdd.state.projects[projectId].scenarios.before.elements.length;
  await page.getByRole('button', { name: '床', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).state.projects[projectId].scenarios.before.elements.length).toBe(countBefore + 1);

  let state = await persisted(page);
  const added = state.state.projects[projectId].scenarios.before.elements.at(-1)!;
  await page.locator('#el-name').fill('E2E 测试床');
  await page.getByLabel('宽度 (米)').fill('2.1');
  await page.locator('#el-rotation').fill('90');
  await expect.poll(async () => {
    const element = (await persisted(page)).state.projects[projectId].scenarios.before.elements.find((item) => item.id === added.id);
    return `${element?.name}:${element?.width}:${element?.rotation}`;
  }).toBe('E2E 测试床:158:90');

  const stage = page.locator('[data-testid="plan-canvas"] .konvajs-content');
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox();
  if (!box) throw new Error('Konva stage has no bounding box');
  const canvas = state.state.projects[projectId].canvas;
  const targetX = box.x + (added.x / canvas.width) * box.width;
  const targetY = box.y + (added.y / canvas.height) * box.height;
  await page.mouse.move(targetX, targetY);
  await page.mouse.down();
  await page.mouse.move(targetX + 24, targetY + 18, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => {
    const element = (await persisted(page)).state.projects[projectId].scenarios.before.elements.find((item) => item.id === added.id)!;
    return Math.hypot(element.x - added.x, element.y - added.y);
  }).toBeGreaterThan(20);

  await page.getByLabel('画布缩放').fill('1.5');
  await expect(page.getByLabel('画布缩放')).toHaveValue('1.5');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await persisted(page)).state.projects[projectId].scenarios.before.elements.length).toBe(countBefore);
  await page.getByRole('button', { name: '撤销' }).click();
  await expect.poll(async () => (await persisted(page)).state.projects[projectId].scenarios.before.elements.length).toBe(countBefore + 1);
  await page.getByRole('button', { name: '恢复' }).click();
  await expect.poll(async () => (await persisted(page)).state.projects[projectId].scenarios.before.elements.length).toBe(countBefore);

  state = await persisted(page);
  expect(state.version).toBe(3);
  expect(runtimeProblems, runtimeProblems.join('\n')).toEqual([]);
});
