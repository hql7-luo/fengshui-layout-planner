import type { ElementCategory, ElementType, FacingMode } from './types';

export interface ElementSpec {
  type: ElementType;
  label: string;
  category: ElementCategory;
  /** 默认尺寸（米） */
  defaultSize: [number, number];
  /** 朝向语义 */
  facing: FacingMode;
  /** 画布配色 */
  color: string;
  stroke: string;
  hint: string;
}

export const ELEMENT_SPECS: Record<ElementType, ElementSpec> = {
  living_room: {
    type: 'living_room',
    label: '客厅',
    category: 'room',
    defaultSize: [4.5, 4],
    facing: 'none',
    color: '#e8efe9',
    stroke: '#6f8b78',
    hint: '公共活动核心区，建议靠近入户门但不被直视。',
  },
  master_bedroom: {
    type: 'master_bedroom',
    label: '主卧',
    category: 'room',
    defaultSize: [3.6, 3.6],
    facing: 'none',
    color: '#eae7f2',
    stroke: '#7d74a0',
    hint: '私密性最高的房间，宜位于动线末端。',
  },
  second_bedroom: {
    type: 'second_bedroom',
    label: '次卧',
    category: 'room',
    defaultSize: [3, 3],
    facing: 'none',
    color: '#eeeaf4',
    stroke: '#8d84ac',
    hint: '次要休息空间。',
  },
  kitchen: {
    type: 'kitchen',
    label: '厨房',
    category: 'room',
    defaultSize: [2.6, 2.4],
    facing: 'none',
    color: '#f6ecdf',
    stroke: '#b08a5a',
    hint: '注意与卫生间保持距离，保证排烟通风。',
  },
  bathroom: {
    type: 'bathroom',
    label: '卫生间',
    category: 'room',
    defaultSize: [2.2, 1.8],
    facing: 'none',
    color: '#e3eef3',
    stroke: '#5f89a0',
    hint: '避免位于住宅几何中心。',
  },
  balcony: {
    type: 'balcony',
    label: '阳台',
    category: 'room',
    defaultSize: [3, 1.4],
    facing: 'none',
    color: '#eaf3e6',
    stroke: '#7ca566',
    hint: '主要采光面。',
  },
  study: {
    type: 'study',
    label: '书房',
    category: 'room',
    defaultSize: [2.8, 2.6],
    facing: 'none',
    color: '#edf0f5',
    stroke: '#6f7d99',
    hint: '需要安静与稳定背景墙。',
  },
  dining_room: {
    type: 'dining_room',
    label: '餐厅',
    category: 'room',
    defaultSize: [3, 2.8],
    facing: 'none',
    color: '#f4efe6',
    stroke: '#9c8a68',
    hint: '连接厨房与客厅的过渡区。',
  },
  entry_door: {
    type: 'entry_door',
    label: '入户门',
    category: 'opening',
    defaultSize: [1, 0.22],
    facing: 'bi',
    color: '#c0553f',
    stroke: '#8d3a2a',
    hint: '整套住宅的动线起点，正面箭头指向室内。',
  },
  room_door: {
    type: 'room_door',
    label: '房门',
    category: 'opening',
    defaultSize: [0.9, 0.2],
    facing: 'bi',
    color: '#d08a53',
    stroke: '#9a6034',
    hint: '开门方向即箭头方向。',
  },
  window: {
    type: 'window',
    label: '窗户',
    category: 'opening',
    defaultSize: [1.5, 0.16],
    facing: 'bi',
    color: '#5aa2c4',
    stroke: '#3d7794',
    hint: '采光与通风来源。',
  },
  bed: {
    type: 'bed',
    label: '床',
    category: 'furniture',
    defaultSize: [1.8, 2],
    facing: 'uni',
    color: '#dcd6ea',
    stroke: '#6f6690',
    hint: '箭头为床尾方向，床头在箭头反方向，应靠墙。',
  },
  sofa: {
    type: 'sofa',
    label: '沙发',
    category: 'furniture',
    defaultSize: [2.2, 0.9],
    facing: 'uni',
    color: '#d9e3dc',
    stroke: '#5f7d69',
    hint: '箭头为正面朝向，背面应靠墙。',
  },
  desk: {
    type: 'desk',
    label: '书桌',
    category: 'furniture',
    defaultSize: [1.2, 0.6],
    facing: 'uni',
    color: '#e6e0d3',
    stroke: '#8a7a58',
    hint: '箭头为使用者面向的方向，背后应有实墙。',
  },
  stove: {
    type: 'stove',
    label: '灶台',
    category: 'furniture',
    defaultSize: [0.7, 0.6],
    facing: 'uni',
    color: '#f0d9c6',
    stroke: '#b1734a',
    hint: '避免与水槽正对或紧邻。',
  },
  sink: {
    type: 'sink',
    label: '水槽',
    category: 'furniture',
    defaultSize: [0.6, 0.5],
    facing: 'uni',
    color: '#cfe4ec',
    stroke: '#4f8299',
    hint: '与灶台之间建议保留操作台面。',
  },
  mirror: {
    type: 'mirror',
    label: '镜子',
    category: 'furniture',
    defaultSize: [0.8, 0.12],
    facing: 'uni',
    color: '#cfd8e3',
    stroke: '#5b6b7e',
    hint: '箭头为镜面朝向，避免正对床。',
  },
  screen: {
    type: 'screen',
    label: '玄关/屏风',
    category: 'furniture',
    defaultSize: [1.2, 0.12],
    facing: 'none',
    color: '#e7ddd0',
    stroke: '#a07b54',
    hint: '视线遮挡屏障（玄关柜、屏风、短隔墙）。可阻断门对门、入户对卫生间的直视轴线。',
  },
};

export const ROOM_TYPES = Object.values(ELEMENT_SPECS)
  .filter((s) => s.category === 'room')
  .map((s) => s.type);

export const OPENING_TYPES = Object.values(ELEMENT_SPECS)
  .filter((s) => s.category === 'opening')
  .map((s) => s.type);

export const FURNITURE_TYPES = Object.values(ELEMENT_SPECS)
  .filter((s) => s.category === 'furniture')
  .map((s) => s.type);

export const CATEGORY_LABELS: Record<ElementCategory, string> = {
  room: '房间区域',
  opening: '门窗',
  furniture: '家具设施',
};

export function specOf(type: ElementType): ElementSpec {
  return ELEMENT_SPECS[type];
}

export function labelOf(type: ElementType): string {
  return ELEMENT_SPECS[type]?.label ?? type;
}
