// ============================================================
// 第 21 課 · 拍賣式任務分配
//
// 每台無人機只知道自己到各個求救訊號點的距離。各搶最近時，可能一起
// 飛去同一點；拍賣則先把「機、點」配成一對一，避免已經看得見的重工。
// ============================================================

const params = {
  drones: 6,
  tasks: 14,
  rule: 'auction',
  speed: 2.2,
  dwell: 20,
  showBids: true,
  spawnRate: 0,
};

// 下方比較區固定 130px，讓兩種方法的結果始終同一位置可比。
const CHART_HEIGHT = 130;
// 訊號點留出 32px 邊界，避免圓點貼著場地邊緣而難辨識。
const FIELD_MARGIN = 32;
// 無人機從左側 44px 處起飛，留給 HUD 與場地框線呼吸空間。
const START_X = 44;
// 控制面板容許的範圍也用在預設連結，避免不合法值造成空陣列或 NaN。
const MIN_DRONES = 1;
const MAX_DRONES = 18;
const MIN_TASKS = 1;
const MAX_TASKS = 36;
const MIN_SPEED = 0.2;
const MAX_SPEED = 5;
const MIN_DWELL = 1;
const MAX_DWELL = 90;
const MAX_SPAWN_RATE = 0.05;
// 拍賣結果停 30 幀，足夠看見候選線，又不會把課程節奏拖慢。
const AUCTION_HOLD_FRAMES = 30;
// 條圖保留左右 16px，文字不會貼著畫布邊緣。
const PANEL_MARGIN = 16;

let drones = [];
let tasks = [];
let pane = null;
let totalDistance = 0;
let elapsedFrames = 0;
let lastCompletionFrame = null;
let completed = false;
let auctionHoldFrames = 0;
let auctionPending = false;
let auctionLines = [];
let previousRun = null;
let runRule = 'auction';

class Drone {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.target = null;
    this.dwellFrames = 0;
  }
}

class SignalPoint {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.done = false;
    this.assignedTo = null;
  }
}

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function fieldHeight() {
  return Math.max(1, height - CHART_HEIGHT);
}

function safeNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? constrain(number, min, max) : fallback;
}

function normaliseParams() {
  params.drones = Math.floor(safeNumber(params.drones, 6, MIN_DRONES, MAX_DRONES));
  params.tasks = Math.floor(safeNumber(params.tasks, 14, MIN_TASKS, MAX_TASKS));
  params.speed = safeNumber(params.speed, 2.2, MIN_SPEED, MAX_SPEED);
  params.dwell = Math.floor(safeNumber(params.dwell, 20, MIN_DWELL, MAX_DWELL));
  params.spawnRate = safeNumber(params.spawnRate, 0, 0, MAX_SPAWN_RATE);
  params.rule = params.rule === 'nearest' ? 'nearest' : 'auction';
  params.showBids = Boolean(params.showBids);
}

function taskPosition() {
  const marginX = Math.min(FIELD_MARGIN, Math.max(0, width / 3));
  const marginY = Math.min(FIELD_MARGIN, Math.max(0, fieldHeight() / 3));
  return {
    x: random(marginX, Math.max(marginX, width - marginX)),
    y: random(marginY, Math.max(marginY, fieldHeight() - marginY)),
  };
}

function addSignalPoint() {
  const pos = taskPosition();
  tasks.push(new SignalPoint(tasks.length, pos.x, pos.y));
  auctionPending = true;
}

function reset() {
  normaliseParams();
  drones = [];
  tasks = [];
  totalDistance = 0;
  elapsedFrames = 0;
  lastCompletionFrame = null;
  completed = false;
  auctionHoldFrames = 0;
  auctionLines = [];
  runRule = params.rule;

  // 起飛點平均分布在左側，不先替任何求救訊號點偏心。
  const spacing = fieldHeight() / (params.drones + 1);
  for (let i = 0; i < params.drones; i++) {
    drones.push(new Drone(i, Math.min(START_X, width / 2), spacing * (i + 1)));
  }
  for (let i = 0; i < params.tasks; i++) addSignalPoint();

  if (params.rule === 'auction') runAuction();
  else assignNearest();
}

function rememberRun() {
  previousRun = {
    rule: runRule,
    distance: totalDistance,
    completionFrame: lastCompletionFrame,
  };
}

window.applyLessonPreset = function (partial) {
  const changingRule = partial.rule !== undefined && partial.rule !== params.rule;
  if (changingRule) rememberRun();
  Object.assign(params, partial);
  if (partial.drones !== undefined || partial.tasks !== undefined || partial.rule !== undefined) reset();
  if (pane) pane.refresh();
};

function distanceBetween(drone, task) {
  return Math.hypot(task.x - drone.x, task.y - drone.y);
}

function idleDrones() {
  return drones.filter((drone) => drone.target === null);
}

function unassignedTasks() {
  return tasks.filter((task) => !task.done && task.assignedTo === null);
}

// 真實系統會把電量、負載也算進去，這裡只用距離，讓出價意思清楚。
// 這是貪婪配對，不是 Bertsekas 完整 auction（會讓 epsilon 逐步增加），
// 所以它很直觀、很快，卻不保證全域最佳。
function runAuction() {
  const idle = idleDrones();
  const available = unassignedTasks();
  const bids = [];

  for (const drone of idle) {
    for (const task of available) {
      bids.push({ drone, task, bid: -distanceBetween(drone, task) });
    }
  }

  // 出價越高代表越近；依序取第一個仍未重複的機、點組合。
  bids.sort((a, b) => b.bid - a.bid);
  const usedDrones = new Set();
  const usedTasks = new Set();
  for (const entry of bids) {
    if (usedDrones.has(entry.drone.id) || usedTasks.has(entry.task.id)) continue;
    entry.drone.target = entry.task;
    entry.drone.dwellFrames = 0;
    entry.task.assignedTo = entry.drone.id;
    usedDrones.add(entry.drone.id);
    usedTasks.add(entry.task.id);
  }

  auctionLines = bids;
  auctionHoldFrames = bids.length ? AUCTION_HOLD_FRAMES : 0;
  auctionPending = false;
}

function assignNearest() {
  for (const drone of idleDrones()) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const task of tasks) {
      if (task.done) continue;
      const d = distanceBetween(drone, task);
      if (d < nearestDistance) {
        nearest = task;
        nearestDistance = d;
      }
    }
    if (nearest) {
      // 各搶最近不看別人已選誰，刻意保留重工這個對照組。
      drone.target = nearest;
      drone.dwellFrames = 0;
      if (nearest.assignedTo === null) nearest.assignedTo = drone.id;
    }
  }
}

function finishTask(drone, task) {
  task.done = true;
  task.assignedTo = drone.id;
  drone.target = null;
  drone.dwellFrames = 0;
  lastCompletionFrame = elapsedFrames + 1;
  if (params.rule === 'auction') auctionPending = true;
}

function advanceDrones() {
  for (const drone of drones) {
    const task = drone.target;
    if (!task) continue;
    // 同一點已被別人查看，這台才知道自己剛才飛的是白工。
    if (task.done) {
      drone.target = null;
      drone.dwellFrames = 0;
      continue;
    }
    const dx = task.x - drone.x;
    const dy = task.y - drone.y;
    const d = Math.hypot(dx, dy);
    if (d <= params.speed) {
      drone.x = task.x;
      drone.y = task.y;
      totalDistance += d;
      drone.dwellFrames++;
      if (drone.dwellFrames >= params.dwell) finishTask(drone, task);
      continue;
    }
    drone.x += dx / d * params.speed;
    drone.y += dy / d * params.speed;
    totalDistance += params.speed;
  }
  elapsedFrames++;
}

function allTasksDone() {
  return tasks.length > 0 && tasks.every((task) => task.done);
}

function updateSimulation() {
  if (completed) return;
  if (params.spawnRate > 0 && random() < params.spawnRate) addSignalPoint();

  if (params.rule === 'auction') {
    // 候選出價在停格期間維持不動，讀者才看得到分配前的競爭。
    if (auctionHoldFrames > 0) {
      auctionHoldFrames--;
      return;
    }
    // 最後一張停格已畫完，才移除候選線，避免少顯示一幀。
    auctionLines = [];
    if (auctionPending || (idleDrones().length > 0 && unassignedTasks().length > 0)) runAuction();
  } else {
    assignNearest();
  }

  advanceDrones();
  if (allTasksDone()) completed = true;
}

function activeClaims(task) {
  return drones.filter((drone) => drone.target === task).length;
}

function drawAuctionBids() {
  if (params.rule !== 'auction' || !params.showBids || auctionHoldFrames < 0 || !auctionLines.length) return;
  let best = -Infinity;
  let worst = Infinity;
  for (const entry of auctionLines) {
    best = Math.max(best, entry.bid);
    worst = Math.min(worst, entry.bid);
  }
  for (const entry of auctionLines) {
    const brightness = best === worst ? 210 : map(entry.bid, worst, best, 65, 255);
    stroke(56, 189, 248, brightness);
    strokeWeight(1);
    line(entry.drone.x, entry.drone.y, entry.task.x, entry.task.y);
  }
}

function drawAssignmentLines() {
  for (const drone of drones) {
    const task = drone.target;
    if (!task || task.done) continue;
    const contested = params.rule === 'nearest' && activeClaims(task) > 1;
    stroke(contested ? color(248, 113, 113) : color(56, 189, 248));
    strokeWeight(contested ? 2.5 : 1.5);
    line(drone.x, drone.y, task.x, task.y);
  }
}

function drawTasks() {
  for (const task of tasks) {
    const claims = activeClaims(task);
    const assigned = !task.done && (task.assignedTo !== null || claims > 0);
    noStroke();
    if (task.done) fill(74, 222, 128);
    else if (assigned) fill(251, 146, 60);
    else fill(148, 163, 184);
    // 完成點縮成 6px，保留地圖痕跡但不再與待查看點搶視線。
    circle(task.x, task.y, task.done ? 6 : 11);
  }
}

function drawDrone(drone) {
  const task = drone.target;
  const angle = task ? Math.atan2(task.y - drone.y, task.x - drone.x) : 0;
  push();
  translate(drone.x, drone.y);
  rotate(angle);
  noStroke();
  fill(56, 189, 248);
  // 12px 長的三角形在任務點與 HUD 中間仍清楚，又不遮住點。
  triangle(7, 0, -5, -4, -5, 4);
  pop();
}

function drawField() {
  noStroke();
  fill(30, 41, 59);
  rect(0, 0, width, fieldHeight());
  stroke(71, 85, 105);
  strokeWeight(1);
  line(0, fieldHeight(), width, fieldHeight());
}

function metricText(value, digits, suffix) {
  return value === null ? '—' : `${value.toFixed(digits)}${suffix}`;
}

function drawMetricBar(y, label, value, previous, digits, suffix, currentColor) {
  const left = PANEL_MARGIN;
  const right = width - PANEL_MARGIN;
  const labelWidth = 142;
  const barLeft = Math.min(right, left + labelWidth);
  const barWidth = Math.max(1, right - barLeft);
  const previousValue = previous === null ? null : previous;
  const maxValue = Math.max(1, value, previousValue === null ? 0 : previousValue);
  const currentWidth = barWidth * value / maxValue;

  noStroke();
  fill(148, 163, 184);
  textAlign(LEFT, TOP);
  textSize(12);
  text(`${label} ${metricText(value, digits, suffix)}`, left, y - 2);
  fill(30, 41, 59);
  rect(barLeft, y, barWidth, 12, 3);
  fill(currentColor);
  rect(barLeft, y, currentWidth, 12, 3);

  if (previousValue !== null) {
    const markerX = barLeft + barWidth * previousValue / maxValue;
    stroke(167, 139, 250);
    strokeWeight(2);
    line(markerX, y - 3, markerX, y + 15);
    noStroke();
    fill(167, 139, 250);
    textAlign(RIGHT, TOP);
    text(`上次 ${metricText(previousValue, digits, suffix)}`, right, y + 16);
  } else {
    noStroke();
    fill(167, 139, 250);
    textAlign(RIGHT, TOP);
    text('上次 —', right, y + 16);
  }
}

function drawComparison() {
  const top = fieldHeight();
  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_HEIGHT);
  fill(226, 232, 240);
  textAlign(LEFT, TOP);
  textSize(13);
  const previousLabel = previousRun ? `（對照：${previousRun.rule === 'auction' ? '拍賣分配' : '各搶最近'}）` : '（切換模式後顯示對照）';
  text(`本輪：${params.rule === 'auction' ? '拍賣分配' : '各搶最近'} ${previousLabel}`, PANEL_MARGIN, top + 10);
  drawMetricBar(top + 35, '總飛行距離', totalDistance, previousRun ? previousRun.distance : null, 0, ' px', color(56, 189, 248));
  drawMetricBar(top + 82, '最後一點完成', lastCompletionFrame,
    previousRun ? previousRun.completionFrame : null, 0, ' 幀', color(74, 222, 128));
}

function drawHud() {
  const done = tasks.filter((task) => task.done).length;
  const idle = idleDrones().length;
  const label = params.rule === 'auction' ? '拍賣分配' : '各搶最近';
  noStroke();
  textAlign(LEFT, TOP);
  textSize(15);
  fill(226, 232, 240);
  text(`模式：${label}　已查看：${done}/${tasks.length}`, 16, 14);
  text(`總飛行距離：${totalDistance.toFixed(0)} px　閒置中：${idle} 台`, 16, 38);
  if (completed) {
    fill(74, 222, 128);
    text('全部完成', 16, 62);
  }
  fill(148, 163, 184);
  textSize(12);
  const legend = '灰＝待查看　琥珀＝已指派　綠＝完成；紅線＝兩台搶同一個點';
  const availableWidth = Math.max(1, width - 300);
  if (textWidth(legend) <= availableWidth) text(legend, 16, completed ? 86 : 62);
  else {
    // 窄畫布仍守住面板右側的空白，改成兩行而不縮小 12px 提示字。
    text('灰＝待查看　琥珀＝已指派　綠＝完成', 16, completed ? 86 : 62);
    text('紅線＝兩台搶同一個點', 16, completed ? 102 : 78);
  }
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '任務分配', container });
  pane.addBinding(params, 'drones', { label: '無人機數', min: MIN_DRONES, max: MAX_DRONES, step: 1 }).on('change', reset);
  pane.addBinding(params, 'tasks', { label: '初始訊號點', min: MIN_TASKS, max: MAX_TASKS, step: 1 }).on('change', reset);
  pane.addBinding(params, 'rule', { label: '分配法', options: { '各搶最近': 'nearest', '拍賣分配': 'auction' } }).on('change', () => {
    rememberRun();
    reset();
  });
  pane.addBinding(params, 'speed', { label: '飛行速度', min: MIN_SPEED, max: MAX_SPEED, step: 0.1 });
  pane.addBinding(params, 'dwell', { label: '查看停留幀數', min: MIN_DWELL, max: MAX_DWELL, step: 1 });
  pane.addBinding(params, 'showBids', { label: '顯示出價線' });
  pane.addBinding(params, 'spawnRate', { label: '新增訊號機率', min: 0, max: MAX_SPAWN_RATE, step: 0.001 });
  pane.addButton({ title: '重置' }).on('click', reset);
}

function setup() {
  SwarmLink.init(params);            // 一定先讀網址參數，才建立場景與面板
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}

function draw() {
  background(15, 23, 42);
  updateSimulation();
  drawField();
  drawAuctionBids();
  drawAssignmentLines();
  drawTasks();
  for (const drone of drones) drawDrone(drone);
  drawHud();
  drawComparison();
}
