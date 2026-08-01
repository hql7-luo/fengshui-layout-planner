/**
 * 5 个真实户型验证样本 + 1 个复杂性能测试样本
 * 用于发布前验收的第 5 项和第 4 项
 */
import { ELEMENT_SPECS } from './element-catalog';
import type { ElementType, PlanElement } from './types';

const PPM = 75;
const M = 1; // margin in meters

let idc = 0;
function el(type: ElementType, x: number, y: number, opts: { w?: number; h?: number; r?: number; name?: string } = {}): PlanElement {
  const [dw, dh] = ELEMENT_SPECS[type].defaultSize;
  idc += 1;
  return {
    id: `verify-${type}-${idc}`,
    type,
    name: opts.name ?? ELEMENT_SPECS[type].label,
    x: (M + x) * PPM,
    y: (M + y) * PPM,
    width: (opts.w ?? dw) * PPM,
    height: (opts.h ?? dh) * PPM,
    rotation: opts.r ?? 0,
  };
}

/* 1. 小户型（约55㎡，一室一厅） */
export function smallApartment(): PlanElement[] {
  idc = 0;
  return [
    el('living_room', 0, 3.5, { w: 4.5, h: 3.5, name: '客厅' }),
    el('master_bedroom', 0, 0, { w: 4.5, h: 3.0, name: '卧室' }),
    el('bathroom', 4.5, 0, { w: 1.8, h: 2.0, name: '卫生间' }),
    el('kitchen', 4.5, 2.0, { w: 1.8, h: 1.5, name: '厨房' }),
    el('entry_door', 2.25, 7.0, { r: 180, name: '入户门' }),
    el('room_door', 2.25, 3.0, { r: 0, name: '卧室门' }),
    el('room_door', 4.5, 1.0, { r: 90, name: '卫生间门' }),
    el('room_door', 4.5, 2.75, { r: 90, name: '厨房门' }),
    el('window', 0, 0, { r: 0, name: '卧室窗' }),
    el('window', 0, 7.0, { r: 180, name: '客厅窗' }),
    el('bed', 2.25, 0.8, { r: 0, name: '床' }),
    el('sofa', 0.5, 5.5, { r: 0, name: '沙发' }),
    el('stove', 5.3, 2.5, { r: 270, name: '灶台' }),
    el('sink', 5.3, 3.2, { r: 270, name: '水槽' }),
  ];
}

/* 2. 长走廊户型（走廊连接多个房间） */
export function longCorridorApartment(): PlanElement[] {
  idc = 0;
  return [
    el('living_room', 6, 5, { w: 5, h: 4, name: '客厅' }),
    el('master_bedroom', 0, 0, { w: 3.5, h: 3.5, name: '主卧' }),
    el('second_bedroom', 0, 3.5, { w: 3.5, h: 3.5, name: '次卧' }),
    el('study', 0, 7, { w: 3.5, h: 2.5, name: '书房' }),
    el('bathroom', 3.5, 0, { w: 2.0, h: 2.0, name: '卫生间' }),
    el('kitchen', 3.5, 2.0, { w: 2.0, h: 2.0, name: '厨房' }),
    el('balcony', 3.5, 7.5, { w: 2.0, h: 1.5, name: '阳台' }),
    // 走廊由门洞序列构成
    el('entry_door', 3.5, 9.0, { r: 180, name: '入户门' }),
    el('room_door', 3.5, 7.0, { r: 0, name: '书房门' }),
    el('room_door', 3.5, 5.0, { r: 0, name: '次卧门' }),
    el('room_door', 3.5, 3.0, { r: 0, name: '主卧门' }),
    el('room_door', 3.5, 1.0, { r: 0, name: '卫生间门' }),
    el('room_door', 5.5, 2.0, { r: 0, name: '厨房门' }),
    el('room_door', 6, 4.0, { r: 0, name: '客厅门' }),
    el('window', 0, 0, { r: 0, name: '主卧窗' }),
    el('window', 0, 7, { r: 0, name: '书房窗' }),
    el('window', 6, 9, { r: 180, name: '客厅窗' }),
    el('bed', 1.75, 0.8, { r: 0, name: '主卧床' }),
    el('bed', 1.75, 4.3, { r: 0, name: '次卧床' }),
    el('desk', 0.5, 7.5, { r: 0, name: '书桌' }),
    el('sofa', 7, 5.5, { r: 0, name: '沙发' }),
    el('stove', 4.5, 2.5, { r: 180, name: '灶台' }),
    el('sink', 5.0, 2.5, { r: 180, name: '水槽' }),
  ];
}

/* 3. 双卫生间户型 */
export function dualBathroomApartment(): PlanElement[] {
  idc = 0;
  return [
    el('master_bedroom', 0, 0, { w: 4.5, h: 4.0, name: '主卧' }),
    el('bathroom', 4.5, 0, { w: 2.0, h: 2.0, name: '主卫' }),
    el('second_bedroom', 0, 4.0, { w: 4.0, h: 3.5, name: '次卧' }),
    el('living_room', 6.5, 0, { w: 5.5, h: 4.5, name: '客厅' }),
    el('bathroom', 4.5, 2.5, { w: 2.0, h: 1.8, name: '客卫' }),
    el('kitchen', 6.5, 4.5, { w: 3.0, h: 2.5, name: '厨房' }),
    el('dining_room', 4.5, 4.5, { w: 2.0, h: 2.5, name: '餐厅' }),
    el('balcony', 9.5, 4.5, { w: 2.5, h: 2.5, name: '阳台' }),
    el('entry_door', 7.5, 7.0, { r: 180, name: '入户门' }),
    el('room_door', 4.5, 1.0, { r: 90, name: '主卫门' }),
    el('room_door', 4.5, 3.5, { r: 90, name: '客卫门' }),
    el('room_door', 3.5, 4.0, { r: 0, name: '次卧门' }),
    el('room_door', 4.5, 0, { r: 0, name: '主卧门' }),
    el('room_door', 6.5, 4.5, { r: 0, name: '厨房门' }),
    el('window', 0, 0, { r: 0, name: '主卧窗' }),
    el('window', 0, 7.5, { r: 180, name: '次卧窗' }),
    el('window', 6.5, 0, { r: 0, name: '客厅窗' }),
    el('bed', 2.25, 0.8, { r: 0, name: '主卧床' }),
    el('bed', 2.0, 4.8, { r: 0, name: '次卧床' }),
    el('sofa', 8, 0.5, { r: 0, name: '沙发' }),
    el('stove', 7.5, 5.5, { r: 180, name: '灶台' }),
    el('sink', 8.5, 5.5, { r: 180, name: '水槽' }),
  ];
}

/* 4. 入户直接见卧室户型 */
export function entrySeesBedroom(): PlanElement[] {
  idc = 0;
  return [
    el('master_bedroom', 0, 0, { w: 5.0, h: 4.0, name: '主卧' }),
    el('living_room', 5.0, 0, { w: 5.5, h: 4.5, name: '客厅' }),
    el('bathroom', 0, 4.0, { w: 2.0, h: 2.0, name: '卫生间' }),
    el('kitchen', 2.0, 4.0, { w: 3.0, h: 2.5, name: '厨房' }),
    el('second_bedroom', 5.0, 4.5, { w: 3.5, h: 3.0, name: '次卧' }),
    el('balcony', 8.5, 4.5, { w: 2.0, h: 3.0, name: '阳台' }),
    // 入户门正对主卧门
    el('entry_door', 2.5, 0, { r: 0, name: '入户门' }),
    el('room_door', 2.5, 4.0, { r: 0, name: '主卧门' }),
    el('room_door', 2.0, 4.0, { r: 180, name: '卫生间门' }),
    el('room_door', 3.5, 4.0, { r: 180, name: '厨房门' }),
    el('room_door', 5.0, 4.0, { r: 0, name: '次卧门' }),
    el('window', 0, 4.0, { r: 180, name: '卫生间窗' }),
    el('window', 5.0, 0, { r: 0, name: '客厅窗' }),
    el('window', 8.5, 7.5, { r: 180, name: '阳台窗' }),
    el('bed', 2.5, 0.8, { r: 0, name: '主卧床' }),
    el('bed', 6.75, 5.5, { r: 0, name: '次卧床' }),
    el('sofa', 7, 0.5, { r: 0, name: '沙发' }),
    el('stove', 3.0, 5.5, { r: 180, name: '灶台' }),
    el('sink', 4.0, 5.5, { r: 180, name: '水槽' }),
  ];
}

/* 5. 开放式客餐厅户型 */
export function openLivingDining(): PlanElement[] {
  idc = 0;
  return [
    el('living_room', 0, 0, { w: 6.0, h: 4.0, name: '客厅' }),
    el('dining_room', 6.0, 0, { w: 4.0, h: 4.0, name: '餐厅' }),
    el('master_bedroom', 0, 4.0, { w: 4.0, h: 3.5, name: '主卧' }),
    el('second_bedroom', 4.0, 4.0, { w: 3.5, h: 3.5, name: '次卧' }),
    el('bathroom', 7.5, 4.0, { w: 2.5, h: 2.0, name: '卫生间' }),
    el('kitchen', 7.5, 6.0, { w: 2.5, h: 1.5, name: '厨房' }),
    el('balcony', 0, 7.5, { w: 4.0, h: 1.5, name: '阳台' }),
    el('entry_door', 3.0, 7.5, { r: 180, name: '入户门' }),
    el('room_door', 3.0, 4.0, { r: 0, name: '主卧门' }),
    el('room_door', 5.75, 4.0, { r: 0, name: '次卧门' }),
    el('room_door', 7.5, 4.0, { r: 0, name: '卫生间门' }),
    el('room_door', 7.5, 6.0, { r: 0, name: '厨房门' }),
    el('window', 0, 0, { r: 0, name: '客厅窗' }),
    el('window', 6.0, 0, { r: 0, name: '餐厅窗' }),
    el('window', 0, 7.5, { r: 180, name: '阳台窗' }),
    el('bed', 2.0, 4.8, { r: 0, name: '主卧床' }),
    el('bed', 5.75, 4.8, { r: 0, name: '次卧床' }),
    el('sofa', 0.5, 0.5, { r: 0, name: '沙发' }),
    el('desk', 8.0, 0.5, { r: 0, name: '餐桌' }),
    el('stove', 8.5, 6.8, { r: 180, name: '灶台' }),
    el('sink', 9.2, 6.8, { r: 180, name: '水槽' }),
  ];
}

/* 性能测试样本：12+ 房间 / 30+ 墙体(由房间推导) / 15+ 门窗 / 25+ 家具 */
export function complexPerformancePlan(): PlanElement[] {
  idc = 0;
  return [
    // 12 个房间
    el('living_room', 0, 6, { w: 5, h: 4, name: '客厅' }),
    el('dining_room', 5, 6, { w: 3, h: 4, name: '餐厅' }),
    el('master_bedroom', 0, 0, { w: 4, h: 3.5, name: '主卧' }),
    el('second_bedroom', 4, 0, { w: 3.5, h: 3.5, name: '次卧1' }),
    el('second_bedroom', 7.5, 0, { w: 3.5, h: 3.5, name: '次卧2' }),
    el('study', 11, 0, { w: 3, h: 3.5, name: '书房' }),
    el('bathroom', 0, 3.5, { w: 2, h: 2.5, name: '主卫' }),
    el('bathroom', 2, 3.5, { w: 2, h: 2.5, name: '客卫' }),
    el('kitchen', 8, 3.5, { w: 3, h: 2.5, name: '厨房' }),
    el('balcony', 11, 3.5, { w: 3, h: 2.5, name: '阳台1' }),
    el('balcony', 0, 10, { w: 3, h: 1.5, name: '阳台2' }),
    el('dining_room', 8, 6, { w: 3.5, h: 4, name: '西厨' }),
    // 16 个门窗
    el('entry_door', 2.5, 11.5, { r: 180, name: '入户门' }),
    el('room_door', 2.5, 6, { r: 0, name: '客厅门' }),
    el('room_door', 2, 3.5, { r: 0, name: '主卧门' }),
    el('room_door', 5.75, 3.5, { r: 0, name: '次卧1门' }),
    el('room_door', 9.25, 3.5, { r: 0, name: '次卧2门' }),
    el('room_door', 12.5, 3.5, { r: 0, name: '书房门' }),
    el('room_door', 1, 3.5, { r: 90, name: '主卫门' }),
    el('room_door', 3, 3.5, { r: 90, name: '客卫门' }),
    el('room_door', 9.5, 3.5, { r: 90, name: '厨房门' }),
    el('room_door', 12.5, 3.5, { r: 90, name: '阳台1门' }),
    el('room_door', 5, 6, { r: 90, name: '餐厅门' }),
    el('room_door', 8, 6, { r: 90, name: '西厨门' }),
    el('window', 0, 0, { r: 0, name: '主卧窗' }),
    el('window', 4, 0, { r: 0, name: '次卧1窗' }),
    el('window', 7.5, 0, { r: 0, name: '次卧2窗' }),
    el('window', 11, 0, { r: 0, name: '书房窗' }),
    // 25 个家具
    el('bed', 2, 0.8, { r: 0, name: '主卧床' }),
    el('bed', 5.75, 0.8, { r: 0, name: '次卧1床' }),
    el('bed', 9.25, 0.8, { r: 0, name: '次卧2床' }),
    el('desk', 12.5, 0.5, { r: 0, name: '书桌' }),
    el('sofa', 0.5, 6.5, { r: 0, name: '沙发' }),
    el('sofa', 5.5, 6.5, { r: 0, name: '餐椅' }),
    el('stove', 8.5, 4.0, { r: 180, name: '灶台' }),
    el('sink', 9.5, 4.0, { r: 180, name: '水槽' }),
    el('mirror', 1, 3.5, { r: 90, name: '主卫镜' }),
    el('mirror', 3, 3.5, { r: 90, name: '客卫镜' }),
    el('desk', 6.5, 6.5, { r: 0, name: '餐桌' }),
    el('desk', 9.5, 6.5, { r: 0, name: '西厨台' }),
    el('bed', 12.5, 4.0, { r: 0, name: '阳台椅' }),
    el('sofa', 0.5, 10.5, { r: 0, name: '阳台2椅' }),
    el('stove', 8.5, 8, { r: 0, name: '西厨灶' }),
    el('sink', 9.5, 8, { r: 0, name: '西厨槽' }),
    el('desk', 11, 6.5, { r: 0, name: '书架' }),
    el('mirror', 5, 6, { r: 90, name: '穿衣镜' }),
    el('bed', 1.5, 1.5, { r: 0, name: '床头柜' }),
    el('bed', 5.25, 1.5, { r: 0, name: '床头柜2' }),
    el('bed', 8.75, 1.5, { r: 0, name: '床头柜3' }),
    el('sofa', 2, 8, { r: 0, name: '茶几' }),
    el('desk', 6, 8, { r: 0, name: '餐边柜' }),
    el('stove', 10.5, 8, { r: 0, name: '备用灶' }),
    el('sink', 11.5, 8, { r: 0, name: '备用槽' }),
  ];
}

export const VERIFY_SAMPLES = [
  { id: 'small-apartment', name: '小户型', elements: smallApartment },
  { id: 'long-corridor', name: '长走廊户型', elements: longCorridorApartment },
  { id: 'dual-bathroom', name: '双卫生间户型', elements: dualBathroomApartment },
  { id: 'entry-sees-bedroom', name: '入户见卧室户型', elements: entrySeesBedroom },
  { id: 'open-living-dining', name: '开放式客餐厅户型', elements: openLivingDining },
];
