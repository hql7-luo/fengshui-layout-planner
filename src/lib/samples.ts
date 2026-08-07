import { ELEMENT_SPECS } from './element-catalog';
import { buildStructureFromElements } from './optimizer';
import type { ElementType, PlanElement, Project } from './types';

/** 示例户型统一使用的比例尺与画布 */
export const SAMPLE_PIXELS_PER_METER = 75;
export const SAMPLE_MARGIN_M = 1;
export const SAMPLE_CANVAS = { width: 1080, height: 840 };

type Item = {
  type: ElementType;
  name?: string;
  /** 中心点（米，相对户型左上角） */
  x: number;
  y: number;
  /** 尺寸（米），缺省时使用类型默认值 */
  w?: number;
  h?: number;
  /** 顺时针旋转角度 */
  r?: number;
};

export interface SampleDefinition {
  id: string;
  name: string;
  summary: string;
  /** 该示例重点演示的规则 id */
  highlightRules: string[];
  northAngle: number;
  items: Item[];
}

/* ------------------------------------------------------------------ */

const sampleA: SampleDefinition = {
  id: 'entry-facing-bathroom',
  name: '示例一 · 入户门正对卫生间',
  summary:
    '约 108 平方米的三居室，入户门轴线上正对卫生间，同时上部走廊偏长。适合观察玄关缓冲与视线遮挡的处理方式。',
  highlightRules: ['entry-door-faces-bathroom'],
  northAngle: 0,
  items: [
    { type: 'second_bedroom', name: '次卧', x: 1.7, y: 1.8, w: 3.4, h: 3.6 },
    { type: 'study', name: '书房', x: 4.8, y: 1.5, w: 2.4, h: 3.0 },
    { type: 'dining_room', name: '餐厅', x: 7.1, y: 1.5, w: 1.8, h: 3.0 },
    { type: 'master_bedroom', name: '主卧', x: 10.1, y: 2.0, w: 3.8, h: 4.0 },
    { type: 'living_room', name: '客厅', x: 1.85, y: 7.0, w: 3.7, h: 4.0 },
    // 卫生间左侧与客厅共享一段墙，供用户标记为 partition 后演示真实墙体平移。
    { type: 'bathroom', name: '卫生间', x: 4.8, y: 7.0, w: 2.2, h: 1.8 },
    { type: 'kitchen', name: '厨房', x: 8.8, y: 7.5, w: 2.8, h: 3.0 },
    { type: 'balcony', name: '生活阳台', x: 11.2, y: 7.5, w: 1.6, h: 3.0 },

    { type: 'entry_door', name: '入户门', x: 4.8, y: 9.0, r: 180 },
    { type: 'room_door', name: '卫生间门', x: 4.8, y: 7.85, r: 0 },
    { type: 'room_door', name: '主卧门', x: 8.35, y: 2.0, r: 90 },
    { type: 'room_door', name: '次卧门', x: 1.7, y: 3.5, r: 0 },
    { type: 'room_door', name: '书房门', x: 4.8, y: 2.9, r: 0 },
    { type: 'room_door', name: '厨房门', x: 8.8, y: 6.15, r: 180 },
    { type: 'window', name: '客厅窗', x: 1.85, y: 9.0, r: 180 },
    { type: 'window', name: '主卧窗', x: 10.1, y: 0, r: 0 },
    { type: 'window', name: '次卧窗', x: 1.7, y: 0, r: 0 },

    { type: 'sofa', name: '沙发', x: 0.6, y: 7.0, r: 270 },
    { type: 'bed', name: '主卧床', x: 10.1, y: 1.1, r: 0 },
    { type: 'desk', name: '书桌', x: 4.8, y: 0.4, r: 0 },
    { type: 'stove', name: '灶台', x: 8.0, y: 8.7, r: 180 },
    { type: 'sink', name: '水槽', x: 9.6, y: 8.7, r: 180 },
  ],
};

const sampleB: SampleDefinition = {
  id: 'bathroom-in-center',
  name: '示例二 · 卫生间位于住宅中心',
  summary:
    '方正的三居室，卫生间被四面房间包围、完全没有外墙，同时厨房紧邻卫生间、灶台与水槽间距不足。',
  highlightRules: ['bathroom-in-center', 'kitchen-bathroom-too-close', 'stove-sink-too-close'],
  northAngle: 0,
  items: [
    { type: 'dining_room', name: '餐厅', x: 2.4, y: 2.0, w: 4.6, h: 3.6 },
    { type: 'master_bedroom', name: '主卧', x: 9.6, y: 2.2, w: 4.6, h: 4.0 },
    { type: 'second_bedroom', name: '次卧', x: 9.6, y: 6.9, w: 4.6, h: 4.0 },
    { type: 'living_room', name: '客厅', x: 2.5, y: 6.9, w: 4.8, h: 4.0 },
    { type: 'bathroom', name: '卫生间', x: 6.0, y: 4.5, w: 2.2, h: 2.0 },
    { type: 'kitchen', name: '厨房', x: 6.1, y: 7.0, w: 2.4, h: 2.4 },
    { type: 'balcony', name: '阳台', x: 6.0, y: 0.9, w: 2.4, h: 1.4 },

    { type: 'entry_door', name: '入户门', x: 2.5, y: 9.0, r: 180 },
    { type: 'room_door', name: '卫生间门', x: 6.0, y: 3.6, r: 180 },
    { type: 'room_door', name: '厨房门', x: 6.0, y: 5.9, r: 180 },
    { type: 'room_door', name: '主卧门', x: 7.4, y: 2.2, r: 270 },
    { type: 'room_door', name: '次卧门', x: 7.4, y: 6.9, r: 270 },
    { type: 'window', name: '主卧窗', x: 9.6, y: 0.2, r: 0 },
    { type: 'window', name: '次卧窗', x: 9.6, y: 8.9, r: 180 },
    { type: 'window', name: '客厅窗', x: 0.1, y: 6.9, r: 90 },

    { type: 'sofa', name: '沙发', x: 2.5, y: 5.5, r: 0 },
    { type: 'bed', name: '主卧床', x: 9.6, y: 1.2, r: 0 },
    { type: 'bed', name: '次卧床', x: 9.6, y: 5.9, r: 0 },
    { type: 'stove', name: '灶台', x: 5.2, y: 7.9, r: 180 },
    { type: 'sink', name: '水槽', x: 5.6, y: 7.9, r: 180 },
  ],
};

const sampleC: SampleDefinition = {
  id: 'bed-facing-door',
  name: '示例三 · 床对门且家具布局不合理',
  summary:
    '大开间改造户型：床尾正对卧室门、床头悬空、镜面正对床，沙发与书桌背后均为通道，入户与客厅窗形成直通轴线。',
  highlightRules: [
    'bed-faces-door',
    'bed-head-no-wall',
    'mirror-faces-bed',
    'sofa-no-wall-behind',
    'desk-no-wall-behind',
    'through-draft',
  ],
  northAngle: 0,
  items: [
    { type: 'study', name: '书房', x: 2.8, y: 1.7, w: 5.2, h: 2.8 },
    { type: 'master_bedroom', name: '主卧', x: 8.0, y: 2.3, w: 4.0, h: 4.0 },
    { type: 'living_room', name: '客厅', x: 3.0, y: 5.3, w: 5.6, h: 3.8 },
    { type: 'bathroom', name: '卫生间', x: 7.0, y: 6.2, w: 2.0, h: 2.4 },
    { type: 'kitchen', name: '厨房', x: 9.45, y: 6.2, w: 2.7, h: 2.4 },
    { type: 'balcony', name: '阳台', x: 3.0, y: 8.0, w: 5.6, h: 1.0 },

    { type: 'entry_door', name: '入户门', x: 10.8, y: 3.2, r: 90 },
    { type: 'room_door', name: '主卧门', x: 8.0, y: 4.2, r: 0 },
    { type: 'room_door', name: '书房门', x: 2.8, y: 3.0, r: 0 },
    { type: 'room_door', name: '卫生间门', x: 7.0, y: 5.1, r: 180 },
    { type: 'room_door', name: '厨房门', x: 9.45, y: 5.1, r: 180 },
    { type: 'window', name: '客厅窗', x: 0.2, y: 5.3, r: 270 },
    { type: 'window', name: '主卧窗', x: 8.0, y: 0.3, r: 0 },

    { type: 'bed', name: '主卧床', x: 8.0, y: 2.0, r: 0 },
    { type: 'mirror', name: '穿衣镜', x: 8.0, y: 3.6, r: 180 },
    { type: 'sofa', name: '沙发', x: 3.0, y: 5.3, r: 0 },
    { type: 'desk', name: '书桌', x: 2.8, y: 1.7, r: 0 },
    { type: 'stove', name: '灶台', x: 8.6, y: 6.2, r: 270 },
    { type: 'sink', name: '水槽', x: 10.2, y: 6.2, r: 90 },
  ],
};

export const SAMPLES: SampleDefinition[] = [sampleA, sampleB, sampleC];

export function getSample(id: string): SampleDefinition | undefined {
  return SAMPLES.find((s) => s.id === id);
}

function toElements(sample: SampleDefinition): PlanElement[] {
  const ppm = SAMPLE_PIXELS_PER_METER;
  const offset = SAMPLE_MARGIN_M * ppm;
  return sample.items.map((item, index) => {
    const spec = ELEMENT_SPECS[item.type];
    const [dw, dh] = spec.defaultSize;
    return {
      id: `${sample.id}-${index}`,
      type: item.type,
      name: item.name ?? spec.label,
      x: offset + item.x * ppm,
      y: offset + item.y * ppm,
      width: (item.w ?? dw) * ppm,
      height: (item.h ?? dh) * ppm,
      rotation: item.r ?? 0,
    };
  });
}

export function sampleElements(id: string): PlanElement[] {
  const sample = getSample(id);
  return sample ? toElements(sample) : [];
}

/**
 * 根据示例创建一个新项目。
 * timestamp 参数用于测试时保持确定性。
 */
export function createProjectFromSample(id: string, timestamp = Date.now()): Project | null {
  const sample = getSample(id);
  if (!sample) return null;
  const elements = toElements(sample);
  return {
    id: `sample-${sample.id}-${timestamp}`,
    name: sample.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    image: null,
    canvas: { ...SAMPLE_CANVAS },
    northAngle: sample.northAngle,
    pixelsPerMeter: SAMPLE_PIXELS_PER_METER,
    scenarios: {
      before: { elements },
      after: { elements: elements.map((el) => ({ ...el })) },
    },
    // 示例只提供几何标注，并没有真实承重墙识别结果；结构候选必须保持“概念方案”。
    structure: buildStructureFromElements(elements, false, SAMPLE_PIXELS_PER_METER),
    sampleId: sample.id,
  };
}
