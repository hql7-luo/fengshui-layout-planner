import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

const SAMPLES = [
  { id: 'entry-facing-bathroom', label: '示例一' },
  { id: 'bathroom-in-center', label: '示例二' },
  { id: 'bed-facing-door', label: '示例三' },
];

interface TestResult {
  viewport: string;
  steps: { name: string; passed: boolean; error?: string }[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  screenshotPath?: string;
}

async function runViewport(viewport: { name: string; width: number; height: number }): Promise<TestResult> {
  const result: TestResult = {
    viewport: viewport.name,
    steps: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  // 收集控制台错误
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      result.consoleErrors.push(`[console.error] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    result.pageErrors.push(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.includes('favicon') && !url.includes('.map')) {
      result.requestFailures.push(`[requestfailed] ${url} - ${req.failure()?.errorText}`);
    }
  });

  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      result.steps.push({ name, passed: true });
    } catch (e) {
      result.steps.push({ name, passed: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  try {
    // Step 1: 打开编辑器页面
    await step('打开编辑器页面', async () => {
      await page.goto(`${BASE_URL}/editor`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
    });

    // Step 2: 三个示例户型都能加载并显示画布
    for (const sample of SAMPLES) {
      await step(`加载示例: ${sample.id}`, async () => {
        // 每次加载新示例前清空本地项目，确保示例选择按钮可见
        await page.evaluate(() => {
          localStorage.clear();
        });
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);

        const sampleButton = page.locator(`button:has-text("${sample.label}")`).first();
        await sampleButton.waitFor({ state: 'visible', timeout: 5000 });
        await sampleButton.click();
        await page.waitForSelector('canvas', { timeout: 15000 });
        await page.waitForTimeout(500);
      });
    }

    // 回到第一个示例并保留它作为后续测试的项目
    await step('回到第一个示例', async () => {
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const sampleButton = page.locator(`button:has-text("${SAMPLES[0].label}")`).first();
      await sampleButton.waitFor({ state: 'visible', timeout: 5000 });
      await sampleButton.click();
      await page.waitForSelector('canvas', { timeout: 15000 });
    });

    // Step 3: 开启全部七个分析图层
    await step('开启全部七个分析图层', async () => {
      const layerLabels = ['问题热力', '隐私视线', '气流路径', '生活动线', '采光潜力', '动静分区', '能量示意'];
      for (const label of layerLabels) {
        const checkbox = page.locator(`label:has-text("${label}") input[type="checkbox"]`).first();
        if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
          if (!(await checkbox.isChecked())) await checkbox.check();
        }
      }
      await page.waitForTimeout(500);
    });

    // Step 4: 调整图层透明度
    await step('调整图层透明度', async () => {
      const slider = page.locator('input[aria-label="图层透明度"]').first();
      if (await slider.isVisible({ timeout: 3000 }).catch(() => false)) {
        await slider.fill('70');
        await page.waitForTimeout(300);
      }
    });

    // Step 5: 点击区域查看依据
    await step('点击区域查看依据', async () => {
      const summary = page.locator('summary:has-text("查看区域依据")').first();
      if (await summary.isVisible({ timeout: 3000 }).catch(() => false)) {
        await summary.click();
        await page.waitForTimeout(300);
        const regionBtn = page.locator('details ul li button').first();
        if (await regionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await regionBtn.click();
          await page.waitForTimeout(500);
        }
      }
    });

    // Step 6: 执行一键结构优化
    await step('执行一键结构优化', async () => {
      const generateBtn = page.locator('button:has-text("生成结构优化方案")').first();
      await generateBtn.waitFor({ state: 'visible', timeout: 5000 });
      await generateBtn.click();
      // 优化计算可能需要 1-3 秒
      await page.waitForTimeout(3000);
      // 生成后应出现方案 A/B/C 按钮
      await page.locator('button:has-text("方案 A")').first().waitFor({ state: 'visible', timeout: 5000 });
    });

    // Step 7: 切换方案 A、B、C
    await step('切换方案 A/B/C', async () => {
      for (const planId of ['方案 B', '方案 C', '方案 A']) {
        const btn = page.locator(`button:has-text("${planId}")`).first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      }
    });

    // Step 8: 应用方案
    await step('应用方案', async () => {
      const applyBtn = page.locator('button:has-text("应用方案")').first();
      await applyBtn.waitFor({ state: 'visible', timeout: 5000 });
      // 确保按钮可用（概念候选时也可点击，由 store 处理）
      await applyBtn.click();
      await page.waitForTimeout(1500);
    });

    // Step 9: 撤销
    await step('撤销方案', async () => {
      const undoBtn = page.locator('button:has-text("撤销")').first();
      await undoBtn.waitFor({ state: 'visible', timeout: 5000 });
      // 等待按钮变为可用
      await undoBtn.isEnabled({ timeout: 3000 }).catch(() => {
        throw new Error('撤销按钮未启用');
      });
      await undoBtn.click();
      await page.waitForTimeout(1000);
    });

    // Step 10: 刷新后检查持久化
    await step('刷新检查持久化', async () => {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const canvasCount = await page.locator('canvas').count();
      if (canvasCount === 0) throw new Error('刷新后未找到画布');
    });

    // 截图
    const screenshotPath = path.join(SCREENSHOTS_DIR, `${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshotPath = screenshotPath;
  } finally {
    await browser.close();
  }

  return result;
}

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const results: TestResult[] = [];
  for (const vp of VIEWPORTS) {
    console.log(`\n=== Testing ${vp.name} ===`);
    const result = await runViewport(vp);
    results.push(result);
    for (const step of result.steps) {
      console.log(`  ${step.passed ? '✓' : '✗'} ${step.name}${step.error ? ' → ' + step.error : ''}`);
    }
    if (result.consoleErrors.length) {
      console.log(`  Console errors (${result.consoleErrors.length}):`);
      result.consoleErrors.forEach((e) => console.log(`    ${e}`));
    }
    if (result.pageErrors.length) {
      console.log(`  Page errors (${result.pageErrors.length}):`);
      result.pageErrors.forEach((e) => console.log(`    ${e}`));
    }
    if (result.requestFailures.length) {
      console.log(`  Request failures (${result.requestFailures.length}):`);
      result.requestFailures.forEach((e) => console.log(`    ${e}`));
    }
    if (result.screenshotPath) console.log(`  Screenshot: ${result.screenshotPath}`);
  }

  const reportPath = path.join(__dirname, 'playwright-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Results saved to ${reportPath} ===`);

  const totalSteps = results.flatMap((r) => r.steps).length;
  const passedSteps = results.flatMap((r) => r.steps).filter((s) => s.passed).length;
  const totalConsoleErrors = results.reduce((n, r) => n + r.consoleErrors.length, 0);
  const totalPageErrors = results.reduce((n, r) => n + r.pageErrors.length, 0);
  const totalReqFailures = results.reduce((n, r) => n + r.requestFailures.length, 0);

  console.log(`\n=== Summary ===`);
  console.log(`Steps: ${passedSteps}/${totalSteps} passed`);
  console.log(`Console errors: ${totalConsoleErrors}`);
  console.log(`Page errors: ${totalPageErrors}`);
  console.log(`Request failures: ${totalReqFailures}`);
  console.log(`Screenshots: ${results.filter((r) => r.screenshotPath).length}/${VIEWPORTS.length}`);

  if (passedSteps < totalSteps || totalConsoleErrors > 0 || totalPageErrors > 0 || totalReqFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
