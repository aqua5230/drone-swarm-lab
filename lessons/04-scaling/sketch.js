// ============================================================
// 第 4 課 · 擴量：從 10 隻到 2000 隻
//
// 同一套 boids 規則，數量可拉到 2000。兩種找鄰居的方式：
//   useGrid=true  → 空間網格，每隻只查附近格 → 約 O(n)
//   useGrid=false → 暴力法，每隻掃全部 → O(n²)，數量一大 FPS 就崩
// 用平滑後的 FPS 讓「演算法選擇」的代價看得見。
// ============================================================

const params = {
  count: 300,
  perception: 36,
  maxSpeed: 3.2,
  maxForce: 0.06,
  useGrid: true,
};

let flock = [];
let pane = null;
let smoothFps = 60;

class Boid {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().setMag(random(1, params.maxSpeed));
    this.acc = createVector(0, 0);
  }
  edges() {
    if (this.pos.x > width) this.pos.x = 0;
    if (this.pos.x < 0) this.pos.x = width;
    if (this.pos.y > height) this.pos.y = 0;
    if (this.pos.y < 0) this.pos.y = height;
  }
  update() {
    this.vel.add(this.acc).limit(params.maxSpeed);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }
}

function flockForces(boid, neighbors) {
  let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0, sn = 0;
  const p2 = params.perception * params.perception;
  for (const o of neighbors) {
    if (o === boid) continue;
    const dx = boid.pos.x - o.pos.x, dy = boid.pos.y - o.pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > p2) continue;
    ax += o.vel.x; ay += o.vel.y;
    cx += o.pos.x; cy += o.pos.y;
    n++;
    if (d2 > 0) { sx += dx / d2; sy += dy / d2; sn++; }
  }
  const steer = (vx, vy, mult) => {
    const v = createVector(vx, vy);
    if (v.magSq() === 0) return;
    v.setMag(params.maxSpeed).sub(boid.vel).limit(params.maxForce).mult(mult);
    boid.acc.add(v);
  };
  if (n > 0) {
    steer(ax / n, ay / n, 1.0);
    steer(cx / n - boid.pos.x, cy / n - boid.pos.y, 1.0);
  }
  if (sn > 0) steer(sx, sy, 1.4);
}

// 空間網格：把畫面切格，每隻只取自己與周圍 8 格的鄰居
function buildGrid() {
  const cell = Math.max(1, params.perception);
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const cells = new Array(cols * rows);
  for (const b of flock) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(b.pos.x / cell)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(b.pos.y / cell)));
    const idx = r * cols + c;
    (cells[idx] || (cells[idx] = [])).push(b);
  }
  return { cell, cols, rows, cells };
}

function neighborsFromGrid(boid, grid) {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(boid.pos.x / grid.cell)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor(boid.pos.y / grid.cell)));
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= grid.rows || cc < 0 || cc >= grid.cols) continue;
      const cell = grid.cells[rr * grid.cols + cc];
      if (cell) out.push(...cell);
    }
  }
  return out;
}

function reset() {
  flock = [];
  for (let i = 0; i < params.count; i++) flock.push(new Boid());
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
  pane = new Tweakpane.Pane({ title: '擴量參數', container });
  pane.addBinding(params, 'count', { min: 10, max: 2000, step: 10 }).on('change', reset);
  pane.addBinding(params, 'perception', { min: 12, max: 80, step: 1 });
  pane.addBinding(params, 'maxSpeed', { min: 1, max: 6, step: 0.1 });
  pane.addBinding(params, 'useGrid', { label: '用空間網格' });
  pane.addButton({ title: '重置' }).on('click', reset);
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function draw() {
  background(15, 23, 42);

  const grid = params.useGrid ? buildGrid() : null;
  for (const b of flock) {
    const neighbors = params.useGrid ? neighborsFromGrid(b, grid) : flock;
    flockForces(b, neighbors);
  }
  for (const b of flock) { b.update(); b.edges(); }

  // 數量大時用 2px 點，省描繪；數量小時畫三角形
  noStroke();
  if (flock.length > 600) {
    fill(56, 189, 248, 200);
    for (const b of flock) circle(b.pos.x, b.pos.y, 3);
  } else {
    fill(56, 189, 248);
    for (const b of flock) {
      push();
      translate(b.pos.x, b.pos.y);
      rotate(b.vel.heading());
      triangle(8, 0, -5, -3.5, -5, 3.5);
      pop();
    }
  }

  smoothFps = lerp(smoothFps, frameRate(), 0.1);
  const fpsCol = smoothFps > 45 ? color(74, 222, 128) : smoothFps > 24 ? color(250, 204, 21) : color(248, 113, 113);
  fill(226, 232, 240);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`數量：${flock.length}　找鄰居：${params.useGrid ? '空間網格 O(n)' : '暴力法 O(n²)'}`, 16, 14);
  fill(fpsCol);
  textSize(15);
  text(`FPS：${smoothFps.toFixed(0)}`, 16, 38);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
