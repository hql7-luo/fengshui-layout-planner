import {
  backMidpoint,
  bboxCenter,
  compassOf,
  containsPoint,
  distance,
  distanceToBoundary,
  elementGap,
  facingCheck,
  mutuallyFacing,
  normalize,
  roundTo,
  sub,
  toDeg,
} from '../geometry';
import type {
  AnalysisContext,
  BBox,
  FixAction,
  PlanElement,
  Point,
  RuleDefinition,
  RuleHit,
} from '../types';

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

function pseudoRect(bounds: BBox): PlanElement {
  return {
    id: '__bounds__',
    type: 'living_room',
    name: '整体轮廓',
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
  };
}

function markerOf(...elements: PlanElement[]): Point {
  if (elements.length === 0) return { x: 0, y: 0 };
  const sum = elements.reduce(
    (acc, el) => ({ x: acc.x + el.x, y: acc.y + el.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / elements.length, y: sum.y / elements.length };
}

function meters(ctx: AnalysisContext, px: number): number {
  return roundTo(ctx.toMeters(px), 2);
}

/** 元素背面到所属房间（或整体轮廓）边界的距离，单位米 */
function backWallGap(ctx: AnalysisContext, el: PlanElement): number {
  const room = ctx.roomOf(el);
  const reference = room ?? pseudoRect(ctx.bounds);
  return ctx.toMeters(distanceToBoundary(reference, backMidpoint(el)));
}

/** 房门（含入户门）集合 */
function doors(ctx: AnalysisContext): PlanElement[] {
  return ctx.byType('room_door', 'entry_door');
}

function doorsOfRoom(ctx: AnalysisContext, room: PlanElement): PlanElement[] {
  return ctx
    .byType('room_door')
    .filter((door) => ctx.roomOf(door)?.id === room.id);
}

/** 以网格采样估算房间对包围盒的覆盖率，避免重叠区域重复计算 */
function coverageGrid(ctx: AnalysisContext, divisions = 40): boolean[][] {
  const { bounds, rooms } = ctx;
  const grid: boolean[][] = [];
  for (let row = 0; row < divisions; row += 1) {
    const line: boolean[] = [];
    const y = bounds.y + ((row + 0.5) / divisions) * bounds.height;
    for (let col = 0; col < divisions; col += 1) {
      const x = bounds.x + ((col + 0.5) / divisions) * bounds.width;
      line.push(rooms.some((room) => containsPoint(room, { x, y })));
    }
    grid.push(line);
  }
  return grid;
}

const WALL_TOLERANCE_M = 0.4;

/* ------------------------------------------------------------------ */
/* 一键修正（应用建议）辅助函数                                        */
/* ------------------------------------------------------------------ */

/** 归一化旋转增量到 [-180, 180]，取最短路径 */
function shortestRotationDelta(target: number, current: number): number {
  const d = (((target - current) % 360) + 540) % 360 - 180;
  return roundTo(d, 1);
}

/**
 * 让 el 的「正面」垂直于 el→other 的连线（即侧面对着 other）。
 * 用于床、镜子等避免正对门/床的场景，旋转量取最近路径。
 */
function rotateFacingPerpendicular(el: PlanElement, other: PlanElement): FixAction {
  const dir = normalize(sub(other, el));
  const lineAngle = toDeg(Math.atan2(dir.y, dir.x));
  const cand1 = lineAngle; // rotation 使 facing ⟂ 连线
  const cand2 = lineAngle - 180;
  const delta =
    Math.abs(shortestRotationDelta(cand1, el.rotation)) <=
    Math.abs(shortestRotationDelta(cand2, el.rotation))
      ? shortestRotationDelta(cand1, el.rotation)
      : shortestRotationDelta(cand2, el.rotation);
  return { targetId: el.id, rotationDelta: delta };
}

/**
 * 让 el 的「背面」转向房间中心（即让床头/书桌/沙发背靠对侧墙）。
 * 无房间信息时回退为旋转 180°。
 */
function rotateBackToRoom(el: PlanElement, room?: PlanElement): FixAction {
  if (!room) return { targetId: el.id, rotationDelta: 180 };
  const back = backMidpoint(el);
  const dir = normalize(sub({ x: room.x, y: room.y }, back));
  const backAngle = toDeg(Math.atan2(dir.y, dir.x)); // 背面应指向房间中心
  const targetRotation = backAngle - 270; // 背面角度 = 270 + rotation
  return { targetId: el.id, rotationDelta: shortestRotationDelta(targetRotation, el.rotation) };
}

/** 把 from 沿 from→to 连线推开 distanceM 米（用于灶台/水槽错位） */
function pushAway(from: PlanElement, to: PlanElement, distanceM: number): FixAction {
  const dir = normalize(sub(to, from));
  return { targetId: from.id, dx: dir.x * distanceM, dy: dir.y * distanceM };
}

/* ------------------------------------------------------------------ */
/* 规则定义                                                            */
/* ------------------------------------------------------------------ */

export const RULES: RuleDefinition[] = [
  {
    id: 'entry-door-faces-bathroom',
    name: '入户门正对卫生间',
    category: 'fengshui',
    severity: 'high',
    impacts: { fengshui: 8, privacy: 5, function: 2 },
    condition: '入户门朝向轴线上出现卫生间区域或卫生间门，夹角小于 22°、距离小于 8 米。',
    traditional:
      '传统住宅布局讲究「开门见吉」，入户位置被视为整套住宅气流与视线的起点，通常会避免一进门就直面卫浴等污浊之处。',
    modern:
      '入户即看到卫生间，会让访客第一视觉落在最不希望被展示的空间；同时卫生间的潮气与异味更容易随开门气流扩散到玄关。',
    suggestion:
      '在玄关与卫生间之间设置玄关柜、半高隔断或磨砂玻璃推拉门；条件允许时改变卫生间门的开启方向，使其偏离入户轴线。',
    maxOccurrences: 1,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const entries = ctx.byType('entry_door');
      const bathrooms = ctx.byType('bathroom');
      const maxDistance = ctx.toPixels(8);
      for (const entry of entries) {
        for (const bath of bathrooms) {
          const direct = facingCheck(entry, bath, { maxAngle: 22, maxDistance });
          const bathDoors = doorsOfRoom(ctx, bath);
          const viaDoor = bathDoors.find(
            (door) => facingCheck(entry, door, { maxAngle: 22, maxDistance }).facing,
          );
          if (direct.facing || viaDoor) {
            const target = viaDoor ?? bath;
            hits.push({
              elementIds: [entry.id, target.id],
              marker: markerOf(entry, target),
              detail: `入户门与${viaDoor ? '卫生间门' : '卫生间'}中心距约 ${meters(
                ctx,
                distance(entry, target),
              )} 米。`,
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'entry-door-faces-bedroom-door',
    name: '入户门正对卧室门',
    category: 'privacy',
    severity: 'medium',
    impacts: { privacy: 6, fengshui: 3 },
    condition: '入户门朝向轴线上出现主卧或次卧的房门，夹角小于 24°、距离小于 9 米。',
    traditional:
      '传统布局中卧室属于静区，入户属于动区，一般不主张两者直接贯通，讲究「藏而不露」。',
    modern:
      '开门瞬间卧室内部一览无余，居住者缺少缓冲区；夜间开门的光线与声音也会直接进入休息空间。',
    suggestion:
      '增加玄关隔断或将卧室门改为侧开；短期可在门内侧加装门帘或落地屏风，减少直接视线通廊。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const entries = ctx.byType('entry_door');
      const maxDistance = ctx.toPixels(9);
      const bedroomDoors = ctx.byType('room_door').filter((door) => {
        const room = ctx.roomOf(door);
        return room?.type === 'master_bedroom' || room?.type === 'second_bedroom';
      });
      for (const entry of entries) {
        for (const door of bedroomDoors) {
          if (facingCheck(entry, door, { maxAngle: 24, maxDistance }).facing) {
            hits.push({
              elementIds: [entry.id, door.id],
              marker: markerOf(entry, door),
              detail: `入户门与${ctx.roomOf(door)?.name ?? '卧室'}门中心距约 ${meters(
                ctx,
                distance(entry, door),
              )} 米。`,
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'door-faces-door',
    name: '房门正对房门',
    category: 'fengshui',
    severity: 'medium',
    impacts: { fengshui: 4, privacy: 3 },
    condition: '两扇房门互相正对，双向夹角均小于 25°、距离小于 5 米。',
    traditional: '传统上称为「门冲」，认为相对的门会让气流直来直往，缺少回旋。',
    modern:
      '两门相对时，两个房间的私密性互相削弱，声音传导路径最短，开门也容易互相干扰。',
    suggestion:
      '错开门洞位置（通常错开 30～60 厘米即可明显改善）；无法改动时可在两门之间设置矮柜、绿植或使用不同开启方向。',
    maxOccurrences: 3,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const list = ctx.byType('room_door');
      const maxDistance = ctx.toPixels(5);
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];
          if (ctx.roomOf(a)?.id && ctx.roomOf(a)?.id === ctx.roomOf(b)?.id) continue;
          if (mutuallyFacing(a, b, { maxAngle: 25, maxDistance })) {
            hits.push({
              elementIds: [a.id, b.id],
              marker: markerOf(a, b),
              detail: `${a.name} 与 ${b.name} 相距约 ${meters(ctx, distance(a, b))} 米。`,
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'bathroom-in-center',
    name: '卫生间位于住宅中心',
    category: 'function',
    severity: 'high',
    impacts: { fengshui: 6, function: 4, lighting: 4 },
    condition: '卫生间中心落在整体轮廓中央 30% 的范围内。',
    traditional:
      '传统住宅规划把中心视为「中宫」，多用于厅堂或公共活动，一般不安排卫浴与储污空间。',
    modern:
      '位于平面中心的卫生间几乎没有外墙，无法自然采光与开窗通风，只能依赖机械排风；管线也更难维护，异味与潮气容易扩散到相邻房间。',
    suggestion:
      '如为新建或大改造，优先把卫生间移到有外墙的位置；若无法移动，务必配置持续排风、地面二次防水，并在门口设置干区隔断。',
    maxOccurrences: 1,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const c = bboxCenter(ctx.bounds);
      for (const bath of ctx.byType('bathroom')) {
        const dx = Math.abs(bath.x - c.x) / (ctx.bounds.width / 2 || 1);
        const dy = Math.abs(bath.y - c.y) / (ctx.bounds.height / 2 || 1);
        if (Math.max(dx, dy) < 0.3) {
          hits.push({
            elementIds: [bath.id],
            marker: { x: bath.x, y: bath.y },
            detail: `卫生间中心偏离平面几何中心仅 ${meters(
              ctx,
              Math.hypot(bath.x - c.x, bath.y - c.y),
            )} 米。`,
          });
        }
      }
      return hits;
    },
  },
  {
    id: 'kitchen-bathroom-too-close',
    name: '厨房与卫生间距离过近',
    category: 'function',
    severity: 'medium',
    impacts: { function: 5, fengshui: 3 },
    condition: '厨房与卫生间共墙相邻（间距小于 0.25 米）或两者中心距小于 3 米。',
    traditional: '传统上认为水火相邻不宜，饮食空间与污秽空间应有所区隔。',
    modern:
      '共墙布置时排水立管、潮气与异味更容易串味，尤其在卫生间门正对灶台操作面时；同时燃气与给排水管线交叉，检修难度上升。',
    suggestion:
      '在两者之间插入储藏、洗衣区或走道作为缓冲；无法调整时保证卫生间独立排风，并让厨房操作台背向卫生间墙体。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      for (const kitchen of ctx.byType('kitchen')) {
        for (const bath of ctx.byType('bathroom')) {
          const gapM = ctx.toMeters(elementGap(kitchen, bath));
          const centerM = ctx.toMeters(distance(kitchen, bath));
          if (gapM <= 0.25 || centerM < 3) {
            hits.push({
              elementIds: [kitchen.id, bath.id],
              marker: markerOf(kitchen, bath),
              detail: `两者边界间距约 ${roundTo(gapM, 2)} 米，中心距约 ${roundTo(centerM, 2)} 米。`,
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'bed-faces-door',
    name: '床正对卧室门',
    category: 'privacy',
    severity: 'high',
    impacts: { privacy: 6, fengshui: 4 },
    condition: '床的正面（床尾方向）指向房门或入户门，夹角小于 25°、距离小于 6 米。',
    traditional:
      '传统住宅布局中通常会避免床铺直接面对房门，认为休息时不宜处于气流直冲的位置。',
    modern:
      '房门打开后床铺完全暴露，隐私性较差，也容易受到走廊灯光和噪声影响，浅睡人群更容易被唤醒。',
    suggestion:
      '旋转床铺方向，或使用矮柜、屏风和软隔断减少直接视线；至少让床体避开门洞正中的投影范围。',
    maxOccurrences: 3,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const maxDistance = ctx.toPixels(6);
      for (const bed of ctx.byType('bed')) {
        const room = ctx.roomOf(bed);
        for (const door of doors(ctx)) {
          const doorRoom = ctx.roomOf(door);
          if (room && doorRoom && doorRoom.id !== room.id) continue;
          if (facingCheck(bed, door, { maxAngle: 25, maxDistance }).facing) {
            hits.push({
              elementIds: [bed.id, door.id],
              marker: markerOf(bed, door),
              detail: `${bed.name} 床尾正对 ${door.name}，相距约 ${meters(
                ctx,
                distance(bed, door),
              )} 米。`,
              fix: rotateFacingPerpendicular(bed, door),
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'bed-head-no-wall',
    name: '床头没有靠墙',
    category: 'function',
    severity: 'medium',
    impacts: { fengshui: 4, function: 4 },
    condition: `床头一侧与所在房间墙体的距离大于 ${WALL_TOLERANCE_M} 米。`,
    traditional: '传统讲究「床要有靠」，床头需要稳定的实体依托。',
    modern:
      '床头悬空会让人缺少背部安全感，枕头容易滑落，也不便布置床头灯与插座；靠墙还能减少墙体与床之间的清洁死角。',
    suggestion:
      '把床头贴合完整墙面；若因窗户或门洞无法贴墙，可加装带靠背的床屏或整面软包背景墙作为替代。',
    maxOccurrences: 3,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      for (const bed of ctx.byType('bed')) {
        const room = ctx.roomOf(bed);
        const gap = backWallGap(ctx, bed);
        if (gap > WALL_TOLERANCE_M) {
          hits.push({
            elementIds: [bed.id],
            marker: backMidpoint(bed),
            detail: `床头与最近墙体距离约 ${roundTo(gap, 2)} 米。`,
            fix: rotateBackToRoom(bed, room),
          });
        }
      }
      return hits;
    },
  },
  {
    id: 'mirror-faces-bed',
    name: '镜子正对床',
    category: 'fengshui',
    severity: 'medium',
    impacts: { fengshui: 4, privacy: 2 },
    condition: '镜面朝向指向床体，夹角小于 30°、距离小于 5 米。',
    traditional: '传统习惯上避免镜面直照卧床，认为夜间反射会影响休息。',
    modern:
      '夜间起身时镜面反射的人影与灯光容易造成惊扰；镜子也会把窗外或走廊的光源二次反射到床面，降低睡眠质量。',
    suggestion:
      '把镜子移到衣柜门内侧或改为可移动穿衣镜；若必须保留，可加装遮布或改变镜面角度避开床体投影。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const maxDistance = ctx.toPixels(5);
      for (const mirror of ctx.byType('mirror')) {
        for (const bed of ctx.byType('bed')) {
          if (facingCheck(mirror, bed, { maxAngle: 30, maxDistance }).facing) {
            hits.push({
              elementIds: [mirror.id, bed.id],
              marker: markerOf(mirror, bed),
              detail: `镜面与床中心相距约 ${meters(ctx, distance(mirror, bed))} 米。`,
              fix: rotateFacingPerpendicular(mirror, bed),
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'stove-faces-sink',
    name: '灶台正对水槽',
    category: 'function',
    severity: 'medium',
    impacts: { fengshui: 3, function: 3 },
    condition: '灶台正面指向水槽，夹角小于 25°、距离小于 3 米。',
    traditional: '传统认为「水火相冲」，炉灶与水源不宜直接相对。',
    modern:
      '灶台与水槽正对时，洗涤溅水容易落到灶面导致熄火或油污飞溅，操作动线也会在两人同时使用时发生冲突。',
    suggestion:
      '把水槽与灶台布置在同一操作台面上并保持错位；理想顺序为「水槽 → 备餐台 → 灶台」的直线动线。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const maxDistance = ctx.toPixels(3);
      for (const stove of ctx.byType('stove')) {
        for (const sink of ctx.byType('sink')) {
          if (facingCheck(stove, sink, { maxAngle: 25, maxDistance }).facing) {
            hits.push({
              elementIds: [stove.id, sink.id],
              marker: markerOf(stove, sink),
              detail: `灶台与水槽相距约 ${meters(ctx, distance(stove, sink))} 米且正面相对。`,
              fix: pushAway(sink, stove, 0.7),
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'stove-sink-too-close',
    name: '灶台距离水槽过近',
    category: 'function',
    severity: 'medium',
    impacts: { function: 5 },
    condition: '灶台边缘与水槽边缘之间的净台面宽度小于 0.6 米。',
    traditional: '传统上讲究水火各有其位，不宜紧贴。',
    modern:
      '两者之间缺少备餐台面，切配无处落脚；实际使用中容易出现热锅与湿手交叉作业的安全隐患。行业常见做法是保留 60～90 厘米的操作面。',
    suggestion: '在灶台与水槽之间至少保留 60 厘米台面；小厨房可考虑水槽盖板扩展临时台面。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      for (const stove of ctx.byType('stove')) {
        for (const sink of ctx.byType('sink')) {
          // 使用边缘净距（而非中心距）：这里衡量的是两者之间可用的备餐台面宽度
          const gap = ctx.toMeters(elementGap(stove, sink));
          if (gap < 0.6) {
            const move = Math.max(0, 0.7 - gap) + 0.15;
            hits.push({
              elementIds: [stove.id, sink.id],
              marker: markerOf(stove, sink),
              detail: `两者之间净台面约 ${roundTo(gap, 2)} 米，小于建议的 0.6 米。`,
              fix: pushAway(sink, stove, move),
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'living-room-far-from-entry',
    name: '客厅距离入户门过远',
    category: 'circulation',
    severity: 'medium',
    impacts: { circulation: 4, function: 2 },
    condition: '入户门到客厅中心的距离超过 7 米，或超过整体轮廓对角线的 55%。',
    traditional: '传统布局强调「明堂开阔」，公共厅堂宜靠近入口，动静分区清晰。',
    modern:
      '客厅过远意味着访客需要穿越私密区域才能到达公共空间，动线交叉；搬运家具、收快递等日常行为的路径也被拉长。',
    suggestion:
      '调整功能分区，把公共空间前置、卧室后置；若结构无法改动，可在入口附近增设会客角或调整家具朝向缩短感知距离。',
    maxOccurrences: 1,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const diagonalM = ctx.toMeters(Math.hypot(ctx.bounds.width, ctx.bounds.height));
      const threshold = Math.max(7, diagonalM * 0.55);
      for (const entry of ctx.byType('entry_door')) {
        for (const living of ctx.byType('living_room')) {
          const d = ctx.toMeters(distance(entry, living));
          if (d > threshold) {
            hits.push({
              elementIds: [entry.id, living.id],
              marker: markerOf(entry, living),
              detail: `入户门到客厅中心约 ${roundTo(d, 2)} 米，超过建议阈值 ${roundTo(
                threshold,
                2,
              )} 米。`,
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'long-corridor',
    name: '走廊过长',
    category: 'circulation',
    severity: 'medium',
    impacts: { circulation: 4, lighting: 3 },
    condition: '存在 3 扇及以上沿同一轴线排列（垂直方向偏差小于 2 米）的门，且沿线跨度超过 6 米。',
    traditional: '传统上认为长直廊道气流过急，不利于聚气，宜通过转折与节点化解。',
    modern:
      '长走廊本身不产生使用价值，会稀释套内得房率；缺少自然采光时全天需要人工照明，也会让声音沿廊道传导。',
    suggestion:
      '把走廊两侧改造为储藏墙或书墙提高利用率；在端头设置采光窗或洗墙灯，视觉上打断过长的通道感。',
    maxOccurrences: 1,
    evaluate: (ctx) => {
      const list = doors(ctx);
      if (list.length < 3) return [];
      const options: Array<{ span: number; group: PlanElement[] }> = [];
      const band = ctx.toPixels(2);
      const minSpan = ctx.toPixels(6);

      const evaluateAxis = (axis: 'x' | 'y') => {
        const cross = axis === 'x' ? 'y' : 'x';
        for (const anchor of list) {
          const group = list.filter((d) => Math.abs(d[cross] - anchor[cross]) <= band);
          if (group.length < 3) continue;
          const values = group.map((d) => d[axis]);
          const span = Math.max(...values) - Math.min(...values);
          if (span >= minSpan) options.push({ span, group });
        }
      };
      evaluateAxis('x');
      evaluateAxis('y');
      if (options.length === 0) return [];
      options.sort((a, b) => b.span - a.span || a.group.length - b.group.length);
      const best = options[0];
      return [
        {
          elementIds: best.group.map((d) => d.id),
          marker: markerOf(...best.group),
          detail: `${best.group.length} 扇门沿同一轴线排列，跨度约 ${meters(ctx, best.span)} 米。`,
        },
      ];
    },
  },
  {
    id: 'missing-corner',
    name: '房屋存在明显缺角',
    category: 'fengshui',
    severity: 'medium',
    impacts: { fengshui: 4, function: 3, lighting: 1 },
    condition:
      '整体轮廓四个角部区块（各占长宽 25%）中，存在覆盖率低于 35% 且面积大于 2 平方米的区块。',
    traditional: '传统上把方正视为理想形态，缺角会被解读为格局不完整，需要在对应方位补足。',
    modern:
      '异形缺角会产生难以利用的边角空间，家具排布浪费，采光面也可能被邻栋遮挡；定制家具成本明显高于方正户型。',
    suggestion:
      '把缺角区域纳入阳台、储藏或设备平台等辅助功能；室内可用定制柜体拉齐视觉边界，减少斜角与锐角空间。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      if (ctx.rooms.length < 3) return [];
      const { bounds } = ctx;
      const blockW = bounds.width * 0.25;
      const blockH = bounds.height * 0.25;
      const blockAreaM2 = ctx.toMeters(blockW) * ctx.toMeters(blockH);
      if (blockAreaM2 < 2) return [];

      const samples = 12;
      const cornerOrigins: Array<{ x: number; y: number; offset: Point }> = [
        {
          x: bounds.x,
          y: bounds.y,
          offset: { x: -bounds.width / 2, y: -bounds.height / 2 },
        },
        {
          x: bounds.x + bounds.width - blockW,
          y: bounds.y,
          offset: { x: bounds.width / 2, y: -bounds.height / 2 },
        },
        {
          x: bounds.x,
          y: bounds.y + bounds.height - blockH,
          offset: { x: -bounds.width / 2, y: bounds.height / 2 },
        },
        {
          x: bounds.x + bounds.width - blockW,
          y: bounds.y + bounds.height - blockH,
          offset: { x: bounds.width / 2, y: bounds.height / 2 },
        },
      ];

      const c = bboxCenter(bounds);
      const results = cornerOrigins.map((corner) => {
        let covered = 0;
        for (let row = 0; row < samples; row += 1) {
          for (let col = 0; col < samples; col += 1) {
            const p = {
              x: corner.x + ((col + 0.5) / samples) * blockW,
              y: corner.y + ((row + 0.5) / samples) * blockH,
            };
            if (ctx.rooms.some((room) => containsPoint(room, p))) covered += 1;
          }
        }
        return { corner, ratio: covered / (samples * samples) };
      });

      return results
        .filter((item) => item.ratio < 0.35)
        .sort((a, b) => a.ratio - b.ratio)
        .map((item) => ({
          elementIds: [],
          marker: {
            x: item.corner.x + blockW / 2,
            y: item.corner.y + blockH / 2,
          },
          detail: `${compassOf(item.corner.offset, ctx.northAngle)}角落区块覆盖率约 ${Math.round(
            item.ratio * 100,
          )}%，缺失面积约 ${roundTo(blockAreaM2 * (1 - item.ratio), 1)} 平方米（marker 位于 ${roundTo(
            ctx.toMeters(Math.hypot(item.corner.x + blockW / 2 - c.x, item.corner.y + blockH / 2 - c.y)),
            1,
          )} 米处）。`,
        }));
    },
  },
  {
    id: 'through-draft',
    name: '门窗形成直接穿堂动线',
    category: 'fengshui',
    severity: 'medium',
    impacts: { fengshui: 4, privacy: 3, circulation: 1 },
    condition: '入户门与窗户（或阳台）在同一轴线上，双向夹角均小于 20°，且距离大于 3 米。',
    traditional: '传统称为「穿堂」，认为气流一进一出无法停留。',
    modern:
      '门窗直线贯通时，冬季冷风直灌、开门瞬间气压差会带动门体拍击；同时从入口就能看穿整套住宅，缺少私密缓冲。',
    suggestion:
      '在轴线中段设置玄关柜、通透隔断或绿植组团打断视线；保留通风路径的同时避免完全直通。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const entries = ctx.byType('entry_door');
      const targets = [...ctx.byType('window'), ...ctx.byType('balcony')];
      const minDistance = ctx.toPixels(3);
      for (const entry of entries) {
        for (const target of targets) {
          const forward = facingCheck(entry, target, { maxAngle: 20 });
          if (!forward.facing || forward.distance < minDistance) continue;
          if (target.type === 'window') {
            const back = facingCheck(target, entry, { maxAngle: 25 });
            if (!back.facing) continue;
          }
          hits.push({
            elementIds: [entry.id, target.id],
            marker: markerOf(entry, target),
            detail: `入户门与${target.name}处于同一轴线，间距约 ${meters(
              ctx,
              forward.distance,
            )} 米。`,
          });
        }
      }
      return hits;
    },
  },
  {
    id: 'desk-no-wall-behind',
    name: '书桌背后没有墙',
    category: 'function',
    severity: 'low',
    impacts: { fengshui: 2, function: 2 },
    condition: `书桌背面与所在房间墙体距离大于 ${WALL_TOLERANCE_M} 米。`,
    traditional: '传统讲究「背有靠山」，书案宜背靠实墙。',
    modern:
      '背后为开放空间时，使用者会持续感知身后的走动，注意力容易被打断；视频会议时背景也更杂乱。',
    suggestion: '将书桌背靠实墙或书柜；若受采光限制无法贴墙，可用书架、隔断柜形成背部界面。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      for (const desk of ctx.byType('desk')) {
        const room = ctx.roomOf(desk);
        const gap = backWallGap(ctx, desk);
        if (gap > WALL_TOLERANCE_M) {
          hits.push({
            elementIds: [desk.id],
            marker: backMidpoint(desk),
            detail: `书桌背面与最近墙体距离约 ${roundTo(gap, 2)} 米。`,
            fix: rotateBackToRoom(desk, room),
          });
        }
      }
      return hits;
    },
  },
  {
    id: 'sofa-no-wall-behind',
    name: '沙发背后没有墙',
    category: 'function',
    severity: 'low',
    impacts: { fengshui: 2, function: 2 },
    condition: `沙发背面与所在房间墙体距离大于 ${WALL_TOLERANCE_M} 米。`,
    traditional: '传统上主位沙发讲究有靠，象征稳定。',
    modern:
      '沙发背后为通道时，坐姿会持续被身后的走动干扰；同时背部悬空的沙发在视觉上会削弱客厅的围合感。',
    suggestion:
      '把沙发靠实墙布置；若采用中岛式布局，可在沙发背后加设条案、边柜或矮书架形成明确边界。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      for (const sofa of ctx.byType('sofa')) {
        const room = ctx.roomOf(sofa);
        const gap = backWallGap(ctx, sofa);
        if (gap > WALL_TOLERANCE_M) {
          hits.push({
            elementIds: [sofa.id],
            marker: backMidpoint(sofa),
            detail: `沙发背面与最近墙体距离约 ${roundTo(gap, 2)} 米。`,
            fix: rotateBackToRoom(sofa, room),
          });
        }
      }
      return hits;
    },
  },
  {
    id: 'bathroom-faces-kitchen',
    name: '卫生间门正对厨房',
    category: 'function',
    severity: 'high',
    impacts: { fengshui: 5, function: 5 },
    condition: '卫生间门朝向指向厨房区域或厨房门，夹角小于 25°、距离小于 6 米。',
    traditional: '传统上饮食之所不宜与污秽之所相对。',
    modern:
      '卫生间门开启瞬间的气流会直接进入厨房，异味与细菌传播路径最短；对备餐台面的卫生条件影响明显。',
    suggestion:
      '调整卫生间门开启方向或加装闭门器；在两者之间设置推拉门、隔断墙，并保证卫生间常开排风。',
    maxOccurrences: 2,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const maxDistance = ctx.toPixels(6);
      const bathDoors = ctx.byType('room_door').filter((d) => ctx.roomOf(d)?.type === 'bathroom');
      const kitchens = ctx.byType('kitchen');
      for (const door of bathDoors) {
        for (const kitchen of kitchens) {
          const kitchenDoors = doorsOfRoom(ctx, kitchen);
          const viaDoor = kitchenDoors.find(
            (kd) => facingCheck(door, kd, { maxAngle: 25, maxDistance }).facing,
          );
          const direct = facingCheck(door, kitchen, { maxAngle: 25, maxDistance });
          if (direct.facing || viaDoor) {
            const target = viaDoor ?? kitchen;
            hits.push({
              elementIds: [door.id, target.id],
              marker: markerOf(door, target),
              detail: `卫生间门与${viaDoor ? '厨房门' : '厨房'}相距约 ${meters(
                ctx,
                distance(door, target),
              )} 米。`,
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'master-bedroom-privacy',
    name: '主卧隐私性不足',
    category: 'privacy',
    severity: 'medium',
    impacts: { privacy: 6, function: 2 },
    condition:
      '主卧缺少独立房门，或主卧中心距入户门小于 4.5 米，或主卧门正对客厅中心（夹角小于 30°、距离小于 5 米）。',
    traditional: '传统上主卧属于最静的区域，宜位于动线末端，与公共区保持层次。',
    modern:
      '主卧紧邻入口或直面客厅时，日常起居声音与访客视线都会侵入休息空间，缺少「公共—半公共—私密」的过渡层级。',
    suggestion:
      '通过增加过渡走道、更换开门方向或设置玄关隔断，把主卧从公共动线中剥离；必要时调整房间功能分配，把主卧安排在平面最深处。',
    maxOccurrences: 1,
    evaluate: (ctx) => {
      const hits: RuleHit[] = [];
      const masters = ctx.byType('master_bedroom');
      const entries = ctx.byType('entry_door');
      const livings = ctx.byType('living_room');
      for (const master of masters) {
        const reasons: string[] = [];
        const ownDoors = doorsOfRoom(ctx, master);
        if (ownDoors.length === 0) {
          reasons.push('未标记独立房门');
        }
        for (const entry of entries) {
          const d = ctx.toMeters(distance(entry, master));
          if (d < 4.5) reasons.push(`距入户门仅约 ${roundTo(d, 2)} 米`);
        }
        for (const door of ownDoors) {
          for (const living of livings) {
            const check = facingCheck(door, living, {
              maxAngle: 30,
              maxDistance: ctx.toPixels(5),
            });
            if (check.facing) reasons.push('房门直面客厅中心');
          }
        }
        if (reasons.length > 0) {
          hits.push({
            elementIds: [master.id, ...ownDoors.map((d) => d.id)],
            marker: { x: master.x, y: master.y },
            detail: reasons.join('；') + '。',
          });
        }
      }
      return hits;
    },
  },
];

/** 便于文档与测试引用的规则索引 */
export const RULE_MAP = new Map(RULES.map((rule) => [rule.id, rule]));

export function totalPenaltyOf(rule: RuleDefinition): number {
  return Object.values(rule.impacts).reduce((sum, v) => sum + (v ?? 0), 0);
}

export { pseudoRect, markerOf, coverageGrid, backWallGap, WALL_TOLERANCE_M };
