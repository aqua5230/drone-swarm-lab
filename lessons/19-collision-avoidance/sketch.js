// ============================================================
// 第 19 課 · 速度障礙避碰
//
// 大家都往圓的正對面飛時，圓心是一定會塞住的交會點。這裡不靠隨機轉彎：
// 先在速度空間劃出會撞的區域，再從剩下的速度裡選最接近目標的那一個。
// ============================================================

const params = {
  agents: 12,
  agentRadius: 9,
  maxSpeed: 1.8,
  timeHorizon: 3.0,
  rule: 'reciprocal',
  showCones: true,
  showVelSpace: true,
};

// 候選的四個同心速度圈，連同八個角度正好是題目指定的 32 個候選。
const SPEED_RATES = [0.25, 0.5, 0.75, 1];
const CANDIDATE_ANGLES = 24;
const VELOCITY_MAP_SIZE = 130;
const VELOCITY_MAP_MARGIN = 16;
const VELOCITY_MAP_STEP = 2;
const CONE_DRAW_LENGTH = 128;
const ARRIVAL_PADDING = 1;
const FLASH_FRAMES = 5;

let agents = [];
let pane = null;
let collisionCount = 0;
let activeCollisions = new Set();
let minGap = 0;
let focusVelocity = { x: 0, y: 0 };

class Agent {
  constructor(index, x, y) {
    this.index = index;
    this.homeX = x;
    this.homeY = y;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.nextVX = 0;
    this.nextVY = 0;
    this.targetX = -x + width;
    this.targetY = -y + height;
    this.arrived = false;
    this.flash = 0;
  }
}

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function safeCount() {
  return constrain(Math.floor(Number(params.agents) || 0), 2, 48);
}

function safeRadius() {
  return constrain(Number(params.agentRadius) || 0, 2, 24);
}

function safeSpeed() {
  return constrain(Number(params.maxSpeed) || 0, 0.05, 5);
}

// 面板上的「往前看」是秒，內部算的是幀。60 幀 = 1 秒。
// 直接把秒當幀用的話，預設 3.0 只看 3 幀 ≈ 5px 的前瞻距離，
// 比兩台的合併半徑 18px 還短——等於發現時已經在撞了。
const FRAMES_PER_SECOND = 60;

function safeHorizon() {
  return constrain(Number(params.timeHorizon) || 0, 0.05, 10) * FRAMES_PER_SECOND;
}

function reset() {
  const count = safeCount();
  const radius = Math.max(28, Math.min(width, height) * 0.34);
  agents = [];
  for (let i = 0; i < count; i++) {
    const angle = i * TWO_PI / count - HALF_PI;
    agents.push(new Agent(i, width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius));
  }
  collisionCount = 0;
  activeCollisions = new Set();
  minGap = count > 1 ? radius * 2 * Math.sin(Math.PI / count) : 0;
  focusVelocity = { x: 0, y: 0 };
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  // 起點數量與規則都改變了整個實驗，因此從同一個圓周起跑才可公平比較。
  if (partial.agents !== undefined || partial.rule !== undefined) reset();
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '避碰策略', container });
  pane.addBinding(params, 'rule', {
    label: '策略',
    options: { 不避讓: 'none', 只有自己閃: 'selfish', 各讓一半: 'reciprocal' },
  }).on('change', reset);
  pane.addBinding(params, 'agents', { label: '個體數', min: 2, max: 48, step: 1 }).on('change', reset);
  pane.addBinding(params, 'agentRadius', { label: '個體半徑', min: 4, max: 16, step: 1 });
  pane.addBinding(params, 'maxSpeed', { label: '最大速度', min: 0.2, max: 4, step: 0.1 });
  pane.addBinding(params, 'timeHorizon', { label: '往前看', min: 0.2, max: 6, step: 0.1 });
  pane.addBinding(params, 'showCones', { label: '顯示紅錐' });
  pane.addBinding(params, 'showVelSpace', { label: '顯示速度空間' });
  pane.addButton({ title: '重置' }).on('click', reset);
}

function setup() {
  SwarmLink.init(params);
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  reset();
}

function buildGrid() {
  const reach = 2 * safeRadius() + 2 * safeSpeed() * safeHorizon();
  // 格子邊長等於這一幀可能碰到的最遠距離，所以只查自己的九宮格。
  const cellSize = Math.max(1, reach);
  const grid = new Map();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const cx = Math.floor(a.x / cellSize);
    const cy = Math.floor(a.y / cellSize);
    const key = `${cx},${cy}`;
    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push(i);
  }
  return { grid, cellSize, reach };
}

function nearbyIndices(index, gridInfo) {
  const me = agents[index];
  const cx = Math.floor(me.x / gridInfo.cellSize);
  const cy = Math.floor(me.y / gridInfo.cellSize);
  const list = [];
  const reach2 = gridInfo.reach * gridInfo.reach;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cell = gridInfo.grid.get(`${cx + ox},${cy + oy}`);
      if (!cell) continue;
      for (const otherIndex of cell) {
        if (otherIndex === index) continue;
        const other = agents[otherIndex];
        const dx = other.x - me.x;
        const dy = other.y - me.y;
        if (dx * dx + dy * dy <= reach2) list.push(otherIndex);
      }
    }
  }
  return list;
}

function coneApex(me, other) {
  if (params.rule === 'reciprocal') {
    // RVO 把兩人的責任平分，所以錐的頂點落在兩人目前速度的中點。
    return { x: (me.vx + other.vx) * 0.5, y: (me.vy + other.vy) * 0.5 };
  }
  // VO 由自己承擔完整閃避責任，故錐頂點是鄰居目前的速度。
  return { x: other.vx, y: other.vy };
}

function collisionTime(me, other, vx, vy) {
  const apex = coneApex(me, other);
  const rx = other.x - me.x;
  const ry = other.y - me.y;
  const rvx = vx - apex.x;
  const rvy = vy - apex.y;
  const combined = safeRadius() * 2;
  const c = rx * rx + ry * ry - combined * combined;
  if (c <= 0) return 0;

  const a = rvx * rvx + rvy * rvy;
  if (a < 0.000001) return Infinity;
  // rx 是 other - me；相對速度是 me - other，故兩者隨時間相減。
  // 展開 |r - vt|² 時，一次項必須是負號，才能取到最早入射時間。
  const b = -2 * (rx * rvx + ry * rvy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const root = Math.sqrt(discriminant);
  const enter = (-b - root) / (2 * a);
  const leave = (-b + root) / (2 * a);
  // safeHorizon() 已把「秒」換算成幀，這裡的 enter 也是以幀為單位。
  if (leave < 0 || enter > safeHorizon()) return Infinity;
  return Math.max(0, enter);
}

function preferredVelocity(me) {
  if (me.arrived) return { x: 0, y: 0 };
  const dx = me.targetX - me.x;
  const dy = me.targetY - me.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.000001) return { x: 0, y: 0 };
  const speed = safeSpeed();
  return { x: dx / distance * speed, y: dy / distance * speed };
}

function candidateVelocities(pref) {
  const candidates = [{ x: pref.x, y: pref.y }, { x: 0, y: 0 }];
  const baseAngle = Math.atan2(pref.y, pref.x);
  for (let angleIndex = 0; angleIndex < CANDIDATE_ANGLES; angleIndex++) {
    const angle = baseAngle + angleIndex * TWO_PI / CANDIDATE_ANGLES;
    for (const rate of SPEED_RATES) {
      const speed = safeSpeed() * rate;
      candidates.push({ x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
    }
  }
  return candidates;
}

function chooseVelocity(index, nearby) {
  const me = agents[index];
  const pref = preferredVelocity(me);
  if (params.rule === 'none' || me.arrived) return pref;

  let bestSafe = null;
  let bestSafeCost = Infinity;
  let bestLate = null;
  let latestCollision = -Infinity;
  for (const candidate of candidateVelocities(pref)) {
    let earliest = Infinity;
    for (const otherIndex of nearby) {
      const hit = collisionTime(me, agents[otherIndex], candidate.x, candidate.y);
      if (hit < earliest) earliest = hit;
    }
    const dx = candidate.x - pref.x;
    const dy = candidate.y - pref.y;
    // 同樣安全時，保留速度比在交會點前一起煞停更能拉開群體。
    const speedLoss = safeSpeed() - Math.hypot(candidate.x, candidate.y);
    const cost = dx * dx + dy * dy + speedLoss * speedLoss * 10;
    if (earliest === Infinity && cost < bestSafeCost) {
      bestSafe = candidate;
      bestSafeCost = cost;
    }
    if (earliest > latestCollision) {
      bestLate = candidate;
      latestCollision = earliest;
    }
  }
  return bestSafe || bestLate || { x: 0, y: 0 };
}

function updateArrivals() {
  const threshold = safeSpeed() + ARRIVAL_PADDING;
  for (const a of agents) {
    if (Math.hypot(a.targetX - a.x, a.targetY - a.y) <= threshold) {
      a.x = a.targetX;
      a.y = a.targetY;
      a.vx = 0;
      a.vy = 0;
      a.arrived = true;
    }
  }
  if (!agents.length || !agents.every((a) => a.arrived)) return;
  for (const a of agents) {
    // 全員到齊才一起折返，避免有人在目標點等候時又被下一趟的人撞到。
    const atHome = Math.hypot(a.x - a.homeX, a.y - a.homeY) < 0.01;
    a.targetX = atHome ? width - a.homeX : a.homeX;
    a.targetY = atHome ? height - a.homeY : a.homeY;
    a.arrived = false;
  }
}

function recordCollisions() {
  const nextActive = new Set();
  const combined = safeRadius() * 2;
  minGap = Infinity;
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i];
      const b = agents[j];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      minGap = Math.min(minGap, distance);
      if (distance >= combined) continue;
      const key = `${i}:${j}`;
      nextActive.add(key);
      if (!activeCollisions.has(key)) collisionCount++;
      a.flash = FLASH_FRAMES;
      b.flash = FLASH_FRAMES;
    }
  }
  activeCollisions = nextActive;
  if (!Number.isFinite(minGap)) minGap = 0;
}

function stepSimulation() {
  const gridInfo = buildGrid();
  for (let i = 0; i < agents.length; i++) {
    const next = chooseVelocity(i, nearbyIndices(i, gridInfo));
    agents[i].nextVX = next.x;
    agents[i].nextVY = next.y;
  }
  for (const a of agents) {
    a.vx = a.nextVX;
    a.vy = a.nextVY;
    a.x += a.vx;
    a.y += a.vy;
    if (a.flash > 0) a.flash--;
  }
  updateArrivals();
  recordCollisions();
  if (agents[0]) focusVelocity = { x: agents[0].vx, y: agents[0].vy };
}

function drawWorldCones() {
  if (!params.showCones || agents.length < 2) return;
  const focus = agents[0];
  const combined = safeRadius() * 2;
  for (let i = 1; i < agents.length; i++) {
    const other = agents[i];
    const dx = other.x - focus.x;
    const dy = other.y - focus.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) continue;
    const direction = Math.atan2(dy, dx);
    const halfAngle = Math.asin(constrain(combined / distance, 0, 0.999));
    const length = Math.min(CONE_DRAW_LENGTH, Math.max(30, distance));
    noStroke();
    fill(248, 113, 113, 24);
    triangle(focus.x, focus.y,
      focus.x + Math.cos(direction - halfAngle) * length, focus.y + Math.sin(direction - halfAngle) * length,
      focus.x + Math.cos(direction + halfAngle) * length, focus.y + Math.sin(direction + halfAngle) * length);
    stroke(248, 113, 113, 100);
    strokeWeight(1);
    line(focus.x, focus.y, focus.x + Math.cos(direction - halfAngle) * length, focus.y + Math.sin(direction - halfAngle) * length);
    line(focus.x, focus.y, focus.x + Math.cos(direction + halfAngle) * length, focus.y + Math.sin(direction + halfAngle) * length);
  }
}

function drawRiskLines() {
  const warningDistance = safeRadius() * 2.5;
  strokeWeight(1.5);
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i];
      const b = agents[j];
      if (Math.hypot(b.x - a.x, b.y - a.y) < warningDistance) {
        stroke(248, 113, 113, 210);
        line(a.x, a.y, b.x, b.y);
      }
    }
  }
}

function drawAgent(a) {
  const heading = Math.atan2(a.vy, a.vx);
  // 撞到時整台閃紅，所以這個變數會被改寫，不能用 const
  let body = a.index === 0 ? color(251, 146, 60) : color(56, 189, 248);
  if (a.flash > 0) body = color(248, 113, 113);
  push();
  translate(a.x, a.y);
  rotate(Number.isFinite(heading) ? heading : 0);
  noStroke();
  fill(body);
  // 7 和 5 是 9 px 預設半徑下仍清楚看出朝向的三角形半尺寸。
  triangle(7, 0, -5, -5, -5, 5);
  pop();
}

function forbiddenVelocity(vx, vy, focus, nearby) {
  if (params.rule === 'none') return false;
  for (const otherIndex of nearby) {
    if (collisionTime(focus, agents[otherIndex], vx, vy) !== Infinity) return true;
  }
  return false;
}

function drawVelocitySpace() {
  if (!params.showVelSpace || !agents[0]) return;
  const left = VELOCITY_MAP_MARGIN;
  const top = height - VELOCITY_MAP_MARGIN - VELOCITY_MAP_SIZE;
  const centerX = left + VELOCITY_MAP_SIZE / 2;
  const centerY = top + VELOCITY_MAP_SIZE / 2;
  const radius = VELOCITY_MAP_SIZE / 2 - 10;
  const maxSpeed = safeSpeed();
  const gridInfo = buildGrid();
  const nearby = nearbyIndices(0, gridInfo);

  noStroke();
  fill(30, 41, 59, 242);
  rect(left - 4, top - 20, VELOCITY_MAP_SIZE + 8, VELOCITY_MAP_SIZE + 24, 4);
  fill(148, 163, 184);
  textSize(11);
  textAlign(LEFT, TOP);
  text('速度空間', left, top - 17);

  // 2 px 小格把連續的錐近似成色塊；130 px 圖上已足夠平滑且不拖慢主畫面。
  for (let py = top; py < top + VELOCITY_MAP_SIZE; py += VELOCITY_MAP_STEP) {
    for (let px = left; px < left + VELOCITY_MAP_SIZE; px += VELOCITY_MAP_STEP) {
      const nx = (px + VELOCITY_MAP_STEP / 2 - centerX) / radius;
      const ny = (centerY - (py + VELOCITY_MAP_STEP / 2)) / radius;
      if (nx * nx + ny * ny > 1) continue;
      if (forbiddenVelocity(nx * maxSpeed, ny * maxSpeed, agents[0], nearby)) {
        fill(248, 113, 113, 115);
        rect(px, py, VELOCITY_MAP_STEP, VELOCITY_MAP_STEP);
      }
    }
  }

  noFill();
  stroke(71, 85, 105);
  strokeWeight(1);
  circle(centerX, centerY, radius * 2);
  line(centerX - radius, centerY, centerX + radius, centerY);
  line(centerX, centerY - radius, centerX, centerY + radius);
  noStroke();
  fill(148, 163, 184);
  textSize(9);
  textAlign(CENTER, TOP);
  text('速度', centerX, top + VELOCITY_MAP_SIZE + 2);

  const pointX = centerX + focusVelocity.x / maxSpeed * radius;
  const pointY = centerY - focusVelocity.y / maxSpeed * radius;
  fill(226, 232, 240);
  circle(pointX, pointY, 7);
  fill(251, 146, 60);
  circle(pointX, pointY, 4);
}

function modeLabel() {
  if (params.rule === 'none') return '不避讓';
  if (params.rule === 'selfish') return '只有自己閃';
  return '各讓一半';
}

function drawHud() {
  const arrived = agents.filter((a) => a.arrived).length;
  noStroke();
  fill(226, 232, 240);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`模式：${modeLabel()}　碰撞次數：${collisionCount}`, 16, 14);
  text(`已抵達：${arrived}/${agents.length}　目前最小間距：${minGap.toFixed(1)} px`, 16, 36);
  fill(148, 163, 184);
  textSize(12);
  text('琥珀＝焦點；紅錐＝這個方向會撞上，被劃掉', 16, 59);
}

function draw() {
  background(15, 23, 42);
  stepSimulation();
  drawWorldCones();
  drawRiskLines();
  for (const a of agents) drawAgent(a);
  drawVelocitySpace();
  drawHud();
}
