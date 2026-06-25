// ============================================================
// 第 5 課 · 分散式感知
//
// 整片畫面蓋著迷霧（coverage 格點，未探為暗）。每隻只照亮 sensRadius
// 範圍內的格子，並朝「附近最暗（最沒探過）的方向」走，同時彼此分離。
// 群體合起來掃出全場覆蓋率；藏起來的目標被任一隻照到就算發現。
// ============================================================

const params = {
  count: 40,
  sensRadius: 34,    // 每隻的感測半徑
  separation: 1.6,   // 彼此散開的力道
  maxSpeed: 2.6,
};

let agents = [];
let cov = null;       // 覆蓋格：值越大代表越「新探過」，會緩慢變舊
let covCols = 0, covRows = 0;
const COV_CELL = 12;
let target = null;
let coveredPct = 0;
let startFrame = 0;
let pane = null;

function initCoverage() {
  covCols = Math.ceil(width / COV_CELL);
  covRows = Math.ceil(height / COV_CELL);
  cov = new Float32Array(covCols * covRows); // 0 = 從沒探過
}

class Scout {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().setMag(params.maxSpeed);
    this.acc = createVector(0, 0);
  }
  // 朝附近最暗的方向走：取 8 個方向、各探一步，挑覆蓋值最小的
  seekDark() {
    let best = null, bestVal = Infinity;
    for (let a = 0; a < TWO_PI; a += PI / 4) {
      const sx = this.pos.x + cos(a) * params.sensRadius * 2.2;
      const sy = this.pos.y + sin(a) * params.sensRadius * 2.2;
      const c = Math.floor(((sx + width) % width) / COV_CELL);
      const r = Math.floor(((sy + height) % height) / COV_CELL);
      const v = cov[r * covCols + c] || 0;
      if (v < bestVal) { bestVal = v; best = createVector(cos(a), sin(a)); }
    }
    if (best) this.acc.add(best.setMag(params.maxSpeed).sub(this.vel).limit(0.08));
  }
  separate() {
    let sum = createVector(0, 0), n = 0;
    for (const o of agents) {
      if (o === this) continue;
      const d = p5.Vector.dist(this.pos, o.pos);
      if (d > 0 && d < params.sensRadius * 1.8) { sum.add(p5.Vector.sub(this.pos, o.pos).div(d)); n++; }
    }
    if (n > 0) this.acc.add(sum.div(n).setMag(params.maxSpeed).sub(this.vel).limit(0.08).mult(params.separation));
  }
  reveal() {
    const cells = Math.ceil(params.sensRadius / COV_CELL);
    const cc = Math.floor(this.pos.x / COV_CELL), cr = Math.floor(this.pos.y / COV_CELL);
    for (let dr = -cells; dr <= cells; dr++) {
      for (let dc = -cells; dc <= cells; dc++) {
        const r = cr + dr, c = cc + dc;
        if (r < 0 || r >= covRows || c < 0 || c >= covCols) continue;
        if (dist(this.pos.x, this.pos.y, c * COV_CELL + COV_CELL / 2, r * COV_CELL + COV_CELL / 2) < params.sensRadius)
          cov[r * covCols + c] = 1;
      }
    }
  }
  update() {
    this.vel.add(this.acc).limit(params.maxSpeed);
    if (this.vel.magSq() < 0.5) this.vel.add(p5.Vector.random2D().mult(0.3));
    this.pos.add(this.vel);
    this.acc.mult(0);
    if (this.pos.x > width) this.pos.x = 0;
    if (this.pos.x < 0) this.pos.x = width;
    if (this.pos.y > height) this.pos.y = 0;
    if (this.pos.y < 0) this.pos.y = height;
  }
}

function reset() {
  initCoverage();
  agents = [];
  for (let i = 0; i < params.count; i++) agents.push(new Scout());
  target = { x: random(width * 0.1, width * 0.9), y: random(height * 0.1, height * 0.9), found: false, foundAt: 0 };
  coveredPct = 0;
  startFrame = frameCount;
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '感測參數', container });
  pane.addBinding(params, 'count', { min: 1, max: 120, step: 1 }).on('change', reset);
  pane.addBinding(params, 'sensRadius', { min: 12, max: 70, step: 1 });
  pane.addBinding(params, 'separation', { min: 0, max: 3, step: 0.1 });
  pane.addBinding(params, 'maxSpeed', { min: 1, max: 5, step: 0.1 });
  pane.addButton({ title: '重新撒一片新迷霧' }).on('click', reset);
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function draw() {
  background(8, 12, 24);

  for (const a of agents) { a.seekDark(); a.separate(); a.update(); a.reveal(); }

  // 畫迷霧：未探的格子鋪暗藍，探過的留空（看見底）
  noStroke();
  let covered = 0;
  for (let r = 0; r < covRows; r++) {
    for (let c = 0; c < covCols; c++) {
      const v = cov[r * covCols + c];
      if (v > 0) covered++;
      else { fill(15, 23, 42); rect(c * COV_CELL, r * COV_CELL, COV_CELL + 1, COV_CELL + 1); }
    }
  }
  coveredPct = (covered / (covCols * covRows)) * 100;

  // 目標：被任一隻照到才現形
  if (!target.found) {
    for (const a of agents) {
      if (dist(a.pos.x, a.pos.y, target.x, target.y) < params.sensRadius) {
        target.found = true; target.foundAt = (frameCount - startFrame) / 60;
        break;
      }
    }
  }
  if (target.found) {
    noFill(); stroke(248, 113, 113); strokeWeight(3);
    circle(target.x, target.y, 30 + sin(frameCount * 0.2) * 6);
    noStroke(); fill(248, 113, 113); circle(target.x, target.y, 8);
  }

  // 偵察兵 + 感測圈
  for (const a of agents) {
    noFill(); stroke(56, 189, 248, 50); strokeWeight(1);
    circle(a.pos.x, a.pos.y, params.sensRadius * 2);
    noStroke(); fill(125, 211, 252); circle(a.pos.x, a.pos.y, 6);
  }

  noStroke();
  fill(226, 232, 240);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`已偵察：${coveredPct.toFixed(0)}%　兵力：${agents.length}`, 16, 14);
  fill(target.found ? color(248, 113, 113) : color(148, 163, 184));
  textSize(14);
  text(target.found ? `目標發現！耗時 ${target.foundAt.toFixed(1)} 秒` : '目標仍藏在迷霧裡…', 16, 38);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  initCoverage();
}
