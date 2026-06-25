// ============================================================
// 第 7 課 · 費洛蒙與自組織分工（蟻群最短路徑 / stigmergy）
//
// 兩層費洛蒙格點：foodPh（通往食物的氣味）、homePh（通往家的氣味）。
//   找食物的蟻 → 聞 foodPh 走，沿途留 homePh
//   搬食物的蟻 → 聞 homePh 走，沿途留 foodPh
// 留下的氣味隨「離源頭多久」遞減 → 形成梯度；全格每幀蒸發。
// 中間一道有缺口的牆：最短路徑（走較近的缺口）會自己被走出來。
// ============================================================

const params = {
  antCount: 220,
  evaporation: 0.012,  // 每幀蒸發比例
  sensorAngle: 0.5,    // 左右觸角張角
  wander: 0.3,         // 隨機亂走強度
  wall: true,
};

const CELL = 6;
let gc = 0, gr = 0;
let foodPh, homePh;     // Float32Array
let phLayer = null;     // 低解析 graphics，放大畫出
let ants = [];
let nest, food;
let walls = [];          // 障礙格（用矩形描述，碰撞檢查用）
let delivered = 0;
let pane = null;

function inWall(x, y) {
  for (const w of walls) if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
  return false;
}

class Ant {
  constructor() {
    this.pos = createVector(nest.x, nest.y);
    this.angle = random(TWO_PI);
    this.hasFood = false;
    this.drop = 1;        // 留下的氣味量，離源頭越久越淡
  }
  senseAt(layer, a) {
    const sx = this.pos.x + cos(a) * 14;
    const sy = this.pos.y + sin(a) * 14;
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) return -1;
    const c = Math.floor(sx / CELL), r = Math.floor(sy / CELL);
    return layer[r * gc + c] || 0;
  }
  step() {
    const layer = this.hasFood ? homePh : foodPh;
    const l = this.senseAt(layer, this.angle - params.sensorAngle);
    const c = this.senseAt(layer, this.angle);
    const rr = this.senseAt(layer, this.angle + params.sensorAngle);
    // 跟著最濃的觸角轉；三邊差不多就直走
    if (c >= l && c >= rr) { /* 直走 */ }
    else if (l > rr) this.angle -= 0.3;
    else this.angle += 0.3;
    this.angle += random(-params.wander, params.wander);

    // 試走一步，碰牆或邊界就反彈轉向
    const nx = this.pos.x + cos(this.angle) * 1.8;
    const ny = this.pos.y + sin(this.angle) * 1.8;
    if (nx < 2 || nx > width - 2 || ny < 2 || ny > height - 2 || inWall(nx, ny)) {
      this.angle += PI + random(-0.6, 0.6);
    } else {
      this.pos.set(nx, ny);
    }

    // 留氣味：搬食物的留 foodPh、找食物的留 homePh
    const ci = Math.floor(this.pos.y / CELL) * gc + Math.floor(this.pos.x / CELL);
    if (this.hasFood) foodPh[ci] += this.drop * 6;
    else homePh[ci] += this.drop * 6;
    this.drop *= 0.992; // 離源頭越久味道越淡 → 自然形成「越靠近源頭越濃」的梯度

    // 到食物 / 到家：切換狀態、回頭、氣味重新加滿
    if (!this.hasFood && dist(this.pos.x, this.pos.y, food.x, food.y) < 18) {
      this.hasFood = true; this.angle += PI; this.drop = 1;
    } else if (this.hasFood && dist(this.pos.x, this.pos.y, nest.x, nest.y) < 18) {
      this.hasFood = false; this.angle += PI; this.drop = 1; delivered++;
    }
  }
}

function setupWorld() {
  gc = Math.ceil(width / CELL);
  gr = Math.ceil(height / CELL);
  foodPh = new Float32Array(gc * gr);
  homePh = new Float32Array(gc * gr);
  phLayer = createGraphics(gc, gr);
  phLayer.noSmooth();
  nest = { x: width * 0.12, y: height * 0.5 };
  food = { x: width * 0.88, y: height * 0.5 };
  walls = params.wall
    ? [
        { x: width * 0.48, y: 0, w: 14, h: height * 0.38 },          // 上半牆
        { x: width * 0.48, y: height * 0.62, w: 14, h: height * 0.38 }, // 下半牆（中間留缺口）
      ]
    : [];
}

function reset() {
  setupWorld();
  ants = [];
  for (let i = 0; i < params.antCount; i++) ants.push(new Ant());
  delivered = 0;
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.antCount !== undefined || partial.wall !== undefined) reset();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '蟻群參數', container });
  pane.addBinding(params, 'antCount', { min: 40, max: 500, step: 10 }).on('change', reset);
  pane.addBinding(params, 'evaporation', { min: 0.002, max: 0.05, step: 0.002 });
  pane.addBinding(params, 'sensorAngle', { min: 0.2, max: 1.2, step: 0.05 });
  pane.addBinding(params, 'wander', { min: 0, max: 0.8, step: 0.05 });
  pane.addBinding(params, 'wall', { label: '中間隔牆' }).on('change', reset);
  pane.addButton({ title: '重置' }).on('click', reset);
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function draw() {
  background(12, 16, 30);

  for (const a of ants) a.step();

  // 蒸發
  const keep = 1 - params.evaporation;
  for (let i = 0; i < foodPh.length; i++) { foodPh[i] *= keep; homePh[i] *= keep; }

  // 把兩層費洛蒙寫進低解析 graphics，再放大鋪滿畫布
  phLayer.loadPixels();
  for (let i = 0; i < gc * gr; i++) {
    const f = Math.min(255, foodPh[i] * 5);   // 食物氣味：綠
    const h = Math.min(255, homePh[i] * 5);   // 回家氣味：藍
    const p = i * 4;
    phLayer.pixels[p] = h * 0.2;
    phLayer.pixels[p + 1] = f * 0.8 + h * 0.3;
    phLayer.pixels[p + 2] = h * 0.9 + f * 0.2;
    phLayer.pixels[p + 3] = Math.min(220, f + h);
  }
  phLayer.updatePixels();
  image(phLayer, 0, 0, width, height);

  // 牆
  noStroke();
  fill(71, 85, 105);
  for (const w of walls) rect(w.x, w.y, w.w, w.h);

  // 巢與食物
  noStroke();
  fill(250, 204, 21); circle(nest.x, nest.y, 26);
  fill(74, 222, 128); circle(food.x, food.y, 26);
  fill(15, 23, 42); textAlign(CENTER, CENTER); textSize(12);
  text('巢', nest.x, nest.y); text('食', food.x, food.y);

  // 螞蟻
  for (const a of ants) {
    fill(a.hasFood ? color(134, 239, 172) : color(226, 232, 240));
    noStroke();
    circle(a.pos.x, a.pos.y, 3.5);
  }

  fill(226, 232, 240);
  textAlign(LEFT, TOP);
  textSize(15);
  text(`運回食物：${delivered}　螞蟻：${ants.length}`, 16, 14);
  fill(148, 163, 184);
  textSize(13);
  text('沒有蟻在指揮——綠色濃線就是被走出來的最短路徑', 16, 36);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  reset();
}
