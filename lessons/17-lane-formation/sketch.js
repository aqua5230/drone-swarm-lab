// ============================================================
// 第 17 課 · 人流自己分道（社會力模型）
//
// 兩群人只知道自己要往哪走，也會避開太近的人與上下牆。
// 人少時交錯穿過；人多時，為了少撞幾次，會自己長出同向車道。
// 把雜訊拉高，剛形成的秩序又會散掉。
// ============================================================

const params = {
  count: 220,
  desiredSpeed: 1.5,
  A: 16,
  B: 9,
  noise: 0.25,
  rightBias: 0,
  wallForce: 20,
  follow: 4,
  showProfile: true,
};

let walkers = [];
let obstacles = [];
let pane = null;
let grid = new Map();
let profile = [];
let laneCount = 0;
let averageProgress = 100;

const PROFILE_BINS = 30;
const WALL_TOP = 92;
const WALL_BOTTOM_MARGIN = 20;
const PROFILE_WIDTH = 126;
const WALKER_RADIUS = 4;
const FOV_COS = Math.cos(100 * Math.PI / 180);   // 視野角 2φ = 200°，一半就是 100°
const BEHIND_WEIGHT = 0.5;               // 視野外的人只算一半力氣
const CLOSING_GAIN = 1.6;                // 靠近速度每 1 px/幀，排斥力多這麼多倍
const OBSTACLE_RADIUS = 13;

class Walker {
  constructor(direction) {
    this.direction = direction;
    this.pos = createVector(random(corridorLeft(), corridorRight()), random(corridorTop() + 10, corridorBottom() - 10));
    this.vel = createVector(direction * params.desiredSpeed, random(-0.15, 0.15));
  }
}

function corridorLeft() { return 16; }
function corridorRight() { return width - PROFILE_WIDTH - 16; }
function corridorTop() { return WALL_TOP; }
function corridorBottom() { return height - WALL_BOTTOM_MARGIN; }
function corridorWidth() { return Math.max(80, corridorRight() - corridorLeft()); }
function corridorHeight() { return Math.max(40, corridorBottom() - corridorTop()); }

function reset() {
  walkers = [];
  const rightCount = Math.ceil(params.count / 2);
  for (let i = 0; i < params.count; i++) walkers.push(new Walker(i < rightCount ? 1 : -1));
  profile = Array.from({ length: PROFILE_BINS }, () => ({ blue: 0, orange: 0 }));
  laneCount = 0;
}

function buildGrid() {
  grid = new Map();
  const cellSize = 32;
  for (let i = 0; i < walkers.length; i++) {
    const w = walkers[i];
    const key = `${floor(w.pos.x / cellSize)},${floor(w.pos.y / cellSize)}`;
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    cell.push(i);
  }
}

function wrappedDx(fromX, toX) {
  let dx = toX - fromX;
  const span = corridorWidth();
  if (dx > span / 2) dx -= span;
  if (dx < -span / 2) dx += span;
  return dx;
}

function addPersonForces(w, index, force, range) {
  const cellSize = 32;
  const cx = floor(w.pos.x / cellSize);
  const cy = floor(w.pos.y / cellSize);
  const reach = ceil(range / cellSize);
  for (let gy = cy - reach; gy <= cy + reach; gy++) {
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      const cell = grid.get(`${gx},${gy}`);
      if (!cell) continue;
      for (const otherIndex of cell) {
        if (otherIndex === index) continue;
        const other = walkers[otherIndex];
        const dx = wrappedDx(other.pos.x, w.pos.x);
        const dy = w.pos.y - other.pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 > range * range) continue;
        const d = Math.sqrt(d2);

        // 這一段是整課能不能分道的關鍵：人不是對所有人一樣閃，
        // 而是**只閃迎面來的**。跟你同方向、速度也差不多的人，你根本不需要躲。
        //
        // 做法是看兩人的相對速度有沒有在拉近距離（closing，靠近速度）：
        // 迎面來的相對速度大，推力乘上好幾倍；同向的相對速度接近 0，幾乎不推。
        // 少了這一項，同向與迎面推得一樣兇，閃避就帶不出方向資訊，人流永遠混著。
        const nx = dx / d, ny = dy / d;                    // 由對方指向我的單位向量
        const relX = w.vel.x - other.vel.x;
        const relY = w.vel.y - other.vel.y;
        const closing = Math.max(0, -(relX * nx + relY * ny));   // >0 代表正在靠近

        // 視野權重：背後的人只有一半力氣（原論文 2φ = 200°、視野外權重 c = 0.5）
        const ahead = -nx * w.direction;
        const weight = ahead > FOV_COS ? 1 : BEHIND_WEIGHT;

        // 排斥力對誰都有（不然人會疊在一起），但只有「正在靠近」的才加倍——
        // 也就是迎面來的。同向同速的人相對速度接近 0，只剩最基本的不要貼太近。
        const strength = params.A * weight * (1 + CLOSING_GAIN * closing)
          * Math.exp(-d / Math.max(params.B, 0.01));
        force.x += nx * strength;
        force.y += ny * strength;

        if (other.direction === w.direction) {
          // 再加一項「跟隨同向的人」：只作用在左右方向、而且衰減得比排斥力慢，
          // 所以近距離仍然是排斥贏（不會黏成一坨），中距離才輪到它把同向的人拉成一條。
          // 這是帶子能成形的黏著劑——只有排斥力的話，人只會被推得均勻散開。
          force.y -= ny * params.follow * Math.exp(-d / Math.max(params.B * 3, 0.01));
        }
      }
    }
  }
}

function stepWalkers() {
  buildGrid();
  const next = new Array(walkers.length);
  const range = Math.max(18, params.B * 4);
  const top = corridorTop(), bottom = corridorBottom();

  for (let i = 0; i < walkers.length; i++) {
    const w = walkers[i];
    const desiredX = w.direction * params.desiredSpeed;
    // 驅動力把目前速度拉回自己的目標速度；其餘力再以較小步長積分。
    // 兩個方向都是「把速度拉回想走的速度」，係數要接近：側向阻尼一大，
    // 閃避產生的橫向位移會在一幀內被抹掉，帶子就長不出來。
    const force = createVector((desiredX - w.vel.x) * 3.2, -w.vel.y * 0.2);
    addPersonForces(w, i, force, range);

    const topDistance = Math.max(0.5, w.pos.y - top);
    const bottomDistance = Math.max(0.5, bottom - w.pos.y);
    force.y += params.wallForce * Math.exp(-topDistance / 10);
    force.y -= params.wallForce * Math.exp(-bottomDistance / 10);

    for (const o of obstacles) {
      const dx = w.pos.x - o.x;
      const dy = w.pos.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 === 0 || d2 > range * range) continue;
      const d = Math.sqrt(d2);
      const surfaceDistance = Math.max(0.5, d - OBSTACLE_RADIUS);
      const strength = params.A * 1.6 * Math.exp(-surfaceDistance / Math.max(params.B, 0.01));
      force.x += (dx / d) * strength;
      force.y += (dy / d) * strength;
    }

    // 螢幕座標往下是正；右行者的右側就是往下，左行者反之。
    force.y += w.direction * params.rightBias;
    force.x += randomGaussian(0, params.noise);
    force.y += randomGaussian(0, params.noise);

    const velocity = p5.Vector.add(w.vel, p5.Vector.mult(force, 0.025));
    velocity.limit(Math.max(3, params.desiredSpeed * 2.4));
    const position = p5.Vector.add(w.pos, velocity);
    if (position.x > corridorRight()) position.x = corridorLeft() + (position.x - corridorRight());
    if (position.x < corridorLeft()) position.x = corridorRight() - (corridorLeft() - position.x);
    position.y = constrain(position.y, top + WALKER_RADIUS, bottom - WALKER_RADIUS);
    if (position.y <= top + WALKER_RADIUS || position.y >= bottom - WALKER_RADIUS) velocity.y *= 0.45;
    next[i] = { pos: position, vel: velocity };
  }

  for (let i = 0; i < walkers.length; i++) {
    walkers[i].pos = next[i].pos;
    walkers[i].vel = next[i].vel;
  }
}

function measure() {
  profile = Array.from({ length: PROFILE_BINS }, () => ({ blue: 0, orange: 0 }));
  let progress = 0;
  for (const w of walkers) {
    const bin = constrain(floor((w.pos.y - corridorTop()) / corridorHeight() * PROFILE_BINS), 0, PROFILE_BINS - 1);
    if (w.direction > 0) profile[bin].blue++;
    else profile[bin].orange++;
    progress += Math.max(0, w.vel.x * w.direction) / Math.max(params.desiredSpeed, 0.01);
  }
  averageProgress = walkers.length ? progress / walkers.length * 100 : 0;
}

function measureLanes() {
  let previous = '';
  laneCount = 0;
  for (const bin of profile) {
    const total = bin.blue + bin.orange;
    const state = total === 0 ? '' : bin.blue / total >= 0.7 ? 'blue' : bin.orange / total >= 0.7 ? 'orange' : '';
    if (state && state !== previous) laneCount++;
    previous = state;
  }
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '人流參數', container });
  pane.addBinding(params, 'count', { label: '人數（＝密度）', min: 20, max: 600, step: 20 }).on('change', reset);
  pane.addBinding(params, 'desiredSpeed', { label: '想走多快', min: 0.3, max: 3, step: 0.1 });
  pane.addBinding(params, 'A', { label: '排斥力強度', min: 0, max: 40, step: 1 });
  pane.addBinding(params, 'B', { label: '排斥力衰減長度', min: 2, max: 25, step: 1 });
  pane.addBinding(params, 'noise', { label: '隨機擾動', min: 0, max: 1.5, step: 0.05 });
  pane.addBinding(params, 'rightBias', { label: '靠右習慣', min: -1, max: 1, step: 0.05 });
  pane.addBinding(params, 'follow', { label: '跟隨同向的人', min: 0, max: 8, step: 0.25 });
  pane.addBinding(params, 'wallForce', { label: '牆的排斥力', min: 0, max: 40, step: 1 });
  pane.addBinding(params, 'showProfile', { label: '顯示橫斷面' });
  pane.addButton({ title: '清除障礙物' }).on('click', () => { obstacles = []; });
  pane.addButton({ title: '重置' }).on('click', reset);
}

function mousePressed() {
  if (mouseX < corridorLeft() || mouseX > corridorRight() || mouseY < corridorTop() || mouseY > corridorBottom()) return;
  const found = obstacles.findIndex((o) => dist(mouseX, mouseY, o.x, o.y) < 24);
  if (found >= 0) obstacles.splice(found, 1);
  else if (obstacles.length < 6) obstacles.push({ x: mouseX, y: mouseY });
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder').style('cursor', 'crosshair');
  reset();
  createControls();
}

function drawWalls() {
  noStroke();
  fill(30, 41, 59);
  rect(corridorLeft() - 8, corridorTop() - 10, corridorWidth() + 16, 8);
  rect(corridorLeft() - 8, corridorBottom() + 2, corridorWidth() + 16, 8);
  fill(71, 85, 105);
  rect(corridorLeft(), corridorTop() - 2, corridorWidth(), 2);
  rect(corridorLeft(), corridorBottom(), corridorWidth(), 2);
}

function drawProfile() {
  if (!params.showProfile) return;
  const x = width - PROFILE_WIDTH + 12;
  const middle = x + 52;
  const binHeight = corridorHeight() / PROFILE_BINS;
  let peak = 1;
  for (const bin of profile) peak = Math.max(peak, bin.blue, bin.orange);
  noStroke(); fill(30, 41, 59, 220);
  rect(x - 8, corridorTop() - 4, 112, corridorHeight() + 8, 5);
  stroke(100, 116, 139); strokeWeight(1);
  line(middle, corridorTop(), middle, corridorBottom());
  noStroke(); textSize(11); textAlign(CENTER, BOTTOM); fill(148, 163, 184);
  text('橫斷面', middle, corridorTop() - 9);
  for (let i = 0; i < PROFILE_BINS; i++) {
    const bin = profile[i];
    const y = corridorTop() + i * binHeight + 1;
    const blueWidth = bin.blue / peak * 46;
    const orangeWidth = bin.orange / peak * 46;
    fill(56, 189, 248, 210);
    rect(middle - blueWidth, y, blueWidth, Math.max(1, binHeight - 2));
    fill(251, 146, 60, 210);
    rect(middle, y, orangeWidth, Math.max(1, binHeight - 2));
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    noStroke(); fill(71, 85, 105); circle(o.x, o.y, OBSTACLE_RADIUS * 2 + 6);
    fill(226, 232, 240); circle(o.x, o.y - 4, 8);
    fill(100, 116, 139); rect(o.x - 5, o.y + 2, 10, 12, 3);
    fill(56, 189, 248); rect(o.x + 3, o.y + 3, 4, 7, 1);
  }
}

function draw() {
  background(15, 23, 42);
  stepWalkers();
  measure();
  if (frameCount % 15 === 0) measureLanes();

  drawWalls();
  drawObstacles();
  noStroke();
  for (const w of walkers) {
    fill(w.direction > 0 ? color(56, 189, 248) : color(251, 146, 60));
    circle(w.pos.x, w.pos.y, WALKER_RADIUS * 2);
  }
  drawProfile();

  // 密度講「平均每人可以站多大一塊地」——比「人／平方像素」好懂得多，
  // 也直接看得出擠不擠：數字越小越擠。
  const perPerson = walkers.length
    ? Math.sqrt(corridorWidth() * corridorHeight() / walkers.length)
    : 0;
  fill(226, 232, 240); textSize(15); textAlign(LEFT, TOP);
  text(`人數：${walkers.length}　車道數：${laneCount}`, 16, 14);
  text(`平均前進速度：${averageProgress.toFixed(0)}%　密度：平均每人 ${perPerson.toFixed(0)} px 見方`, 16, 37);
  fill(148, 163, 184); textSize(13);
  text('藍色往右、橘色往左；點走廊放障礙物，再點附近移除（最多 6 個）', 16, 60);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  for (const w of walkers) {
    w.pos.x = constrain(w.pos.x, corridorLeft(), corridorRight());
    w.pos.y = constrain(w.pos.y, corridorTop() + WALKER_RADIUS, corridorBottom() - WALKER_RADIUS);
  }
  obstacles = obstacles.filter((o) => o.x >= corridorLeft() && o.x <= corridorRight() && o.y >= corridorTop() && o.y <= corridorBottom());
}
