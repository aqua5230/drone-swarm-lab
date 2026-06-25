// ============================================================
// 第 10 課 · 綜合沙盒
//
// 把前面學到的全部疊起來：boids 三規則（含空間網格）＋ 障礙閃避
// ＋ 掠食者追獵與群體逃竄。點畫布放障礙，旋鈕全開隨你玩。
// ============================================================

const params = {
  count: 250,
  perception: 40,
  separation: 1.5,
  alignment: 1.0,
  cohesion: 1.0,
  maxSpeed: 3.6,
  maxForce: 0.07,
  predator: true,
  fearRadius: 90,
};

let flock = [];
let obstacles = [];   // {x,y,r}
let predator = null;
let pane = null;

class Boid {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().setMag(random(1, params.maxSpeed));
    this.acc = createVector(0, 0);
  }
  steer(vx, vy, mult) {
    const v = createVector(vx, vy);
    if (v.magSq() === 0) return;
    v.setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce).mult(mult);
    this.acc.add(v);
  }
  edges() {
    if (this.pos.x > width) this.pos.x = 0;
    if (this.pos.x < 0) this.pos.x = width;
    if (this.pos.y > height) this.pos.y = 0;
    if (this.pos.y < 0) this.pos.y = height;
  }
  avoid() {
    for (const o of obstacles) {
      const d = dist(this.pos.x, this.pos.y, o.x, o.y);
      if (d < o.r + 30) this.steer(this.pos.x - o.x, this.pos.y - o.y, 2.2);
    }
  }
  flee() {
    if (!params.predator || !predator) return;
    const d = dist(this.pos.x, this.pos.y, predator.pos.x, predator.pos.y);
    if (d < params.fearRadius) this.steer(this.pos.x - predator.pos.x, this.pos.y - predator.pos.y, 3.0);
  }
  update() {
    this.vel.add(this.acc).limit(params.maxSpeed);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }
  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    noStroke();
    const near = params.predator && predator && dist(this.pos.x, this.pos.y, predator.pos.x, predator.pos.y) < params.fearRadius;
    fill(near ? color(251, 191, 36) : color(56, 189, 248));
    triangle(8, 0, -5, -3.5, -5, 3.5);
    pop();
  }
}

class Predator {
  constructor() { this.pos = createVector(width / 2, height / 2); this.vel = createVector(2, 2); }
  hunt() {
    // 追最近的 boid
    let best = null, bd = Infinity;
    for (const b of flock) {
      const d = (b.pos.x - this.pos.x) ** 2 + (b.pos.y - this.pos.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.vel.add(p5.Vector.sub(best.pos, this.pos).setMag(0.18));
    this.vel.limit(params.maxSpeed * 0.92);
    this.pos.add(this.vel);
    if (this.pos.x > width) this.pos.x = 0;
    if (this.pos.x < 0) this.pos.x = width;
    if (this.pos.y > height) this.pos.y = 0;
    if (this.pos.y < 0) this.pos.y = height;
  }
  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    noStroke(); fill(248, 113, 113);
    triangle(15, 0, -9, -7, -9, 7);
    pop();
  }
}

// 空間網格（同第 1、4 課）
function buildGrid() {
  const cell = Math.max(1, params.perception);
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const cells = new Array(cols * rows);
  for (const b of flock) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(b.pos.x / cell)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(b.pos.y / cell)));
    (cells[r * cols + c] || (cells[r * cols + c] = [])).push(b);
  }
  return { cell, cols, rows, cells };
}

function flockForces(b, grid) {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(b.pos.x / grid.cell)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor(b.pos.y / grid.cell)));
  let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0, sn = 0;
  const p2 = params.perception * params.perception;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= grid.rows || cc < 0 || cc >= grid.cols) continue;
      const cell = grid.cells[rr * grid.cols + cc];
      if (!cell) continue;
      for (const o of cell) {
        if (o === b) continue;
        const dx = b.pos.x - o.pos.x, dy = b.pos.y - o.pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > p2) continue;
        ax += o.vel.x; ay += o.vel.y; cx += o.pos.x; cy += o.pos.y; n++;
        if (d2 > 0) { sx += dx / d2; sy += dy / d2; sn++; }
      }
    }
  }
  if (n > 0) {
    b.steer(ax / n, ay / n, params.alignment);
    b.steer(cx / n - b.pos.x, cy / n - b.pos.y, params.cohesion);
  }
  if (sn > 0) b.steer(sx, sy, params.separation);
}

function reset() {
  flock = [];
  for (let i = 0; i < params.count; i++) flock.push(new Boid());
  predator = new Predator();
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
  pane = new Tweakpane.Pane({ title: '沙盒參數', container });
  pane.addBinding(params, 'count', { min: 20, max: 800, step: 10 }).on('change', reset);
  pane.addBinding(params, 'perception', { min: 16, max: 90, step: 1 });
  pane.addBinding(params, 'separation', { min: 0, max: 4, step: 0.1 });
  pane.addBinding(params, 'alignment', { min: 0, max: 4, step: 0.1 });
  pane.addBinding(params, 'cohesion', { min: 0, max: 4, step: 0.1 });
  pane.addBinding(params, 'maxSpeed', { min: 1, max: 7, step: 0.1 });
  pane.addBinding(params, 'predator', { label: '掠食者' });
  pane.addBinding(params, 'fearRadius', { min: 30, max: 180, step: 5, label: '恐懼半徑' });
  pane.addButton({ title: '清空障礙' }).on('click', () => (obstacles = []));
  pane.addButton({ title: '重置' }).on('click', reset);
}

function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height)
    obstacles.push({ x: mouseX, y: mouseY, r: random(18, 38) });
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder').style('cursor', 'crosshair');
  reset();
  createControls();
}

function draw() {
  background(15, 23, 42);

  const grid = buildGrid();
  for (const b of flock) { flockForces(b, grid); b.avoid(); b.flee(); }
  for (const b of flock) { b.update(); b.edges(); }
  if (params.predator) predator.hunt();

  noStroke();
  for (const o of obstacles) { fill(71, 85, 105); circle(o.x, o.y, o.r * 2); }
  for (const b of flock) b.show();
  if (params.predator) predator.show();

  fill(226, 232, 240); textSize(15); textAlign(LEFT, TOP);
  text(`boid：${flock.length}　障礙：${obstacles.length}`, 16, 14);
  fill(148, 163, 184); textSize(13);
  text('點畫布放障礙　|　關掉聚合看群體炸開　|　拉滿恐懼半徑看牠們開花躲避', 16, height - 14);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
