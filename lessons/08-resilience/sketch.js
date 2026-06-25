// ============================================================
// 第 8 課 · 抗毀韌性
//
// 每個個體只做一件事：被附近鄰居推開（互斥），並待在場內。
// 結果是自動鋪成均勻覆蓋。砍掉一片 → 缺口處互斥失衡 → 鄰居流入補位。
// 覆蓋率即時量化：看它「被打殘 → 自己長回來」。
// ============================================================

const params = {
  count: 160,
  spacing: 60,       // 互斥半徑（想保持的彼此間距）
  coverRadius: 46,   // 每個個體的覆蓋半徑
  speed: 2.2,
  blastRadius: 70,   // 點一下炸掉的範圍
};

let units = [];
let pane = null;
let coveredPct = 100;
let minCover = 100;

const COV_CELL = 14;
let covCols = 0, covRows = 0;

class Unit {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
  }
  step() {
    let fx = 0, fy = 0;
    for (const o of units) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x, dy = this.pos.y - o.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < params.spacing * params.spacing) {
        const d = Math.sqrt(d2);
        const push = (params.spacing - d) / params.spacing;
        fx += (dx / d) * push;
        fy += (dy / d) * push;
      }
    }
    // 牆壁也推
    const m = 24;
    if (this.pos.x < m) fx += (m - this.pos.x) / m;
    if (this.pos.x > width - m) fx -= (this.pos.x - (width - m)) / m;
    if (this.pos.y < m) fy += (m - this.pos.y) / m;
    if (this.pos.y > height - m) fy -= (this.pos.y - (height - m)) / m;

    this.vel.set(fx, fy).limit(params.speed);
    this.pos.add(this.vel);
    this.pos.x = constrain(this.pos.x, 4, width - 4);
    this.pos.y = constrain(this.pos.y, 4, height - 4);
  }
}

function reset() {
  units = [];
  for (let i = 0; i < params.count; i++) units.push(new Unit(random(width), random(height)));
  minCover = 100;
}

function blast(x, y) {
  const r2 = params.blastRadius * params.blastRadius;
  units = units.filter((u) => (u.pos.x - x) ** 2 + (u.pos.y - y) ** 2 > r2);
}

function attrition(frac) {
  const kill = Math.floor(units.length * frac);
  for (let i = 0; i < kill; i++) units.splice(floor(random(units.length)), 1);
  minCover = 100;
}

function computeCoverage() {
  covCols = Math.ceil(width / COV_CELL);
  covRows = Math.ceil(height / COV_CELL);
  let covered = 0;
  const r2 = params.coverRadius * params.coverRadius;
  for (let r = 0; r < covRows; r++) {
    for (let c = 0; c < covCols; c++) {
      const cx = c * COV_CELL + COV_CELL / 2, cy = r * COV_CELL + COV_CELL / 2;
      for (const u of units) {
        if ((u.pos.x - cx) ** 2 + (u.pos.y - cy) ** 2 < r2) { covered++; break; }
      }
    }
  }
  coveredPct = (covered / (covCols * covRows)) * 100;
  minCover = Math.min(minCover, coveredPct);
}

window.applyLessonPreset = function (partial) {
  if (partial.attrition !== undefined) { attrition(partial.attrition); return; }
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
  pane = new Tweakpane.Pane({ title: '韌性參數', container });
  pane.addBinding(params, 'count', { min: 30, max: 320, step: 10 }).on('change', reset);
  pane.addBinding(params, 'spacing', { min: 30, max: 110, step: 1 });
  pane.addBinding(params, 'coverRadius', { min: 24, max: 80, step: 1 });
  pane.addBinding(params, 'blastRadius', { min: 30, max: 140, step: 5 });
  pane.addButton({ title: '☠ 打掉 30%' }).on('click', () => attrition(0.3));
  pane.addButton({ title: '☠ 打掉 60%' }).on('click', () => attrition(0.6));
  pane.addButton({ title: '重置' }).on('click', reset);
}

function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    blast(mouseX, mouseY);
    minCover = 100;
  }
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder').style('cursor', 'crosshair');
  reset();
  createControls();
}

function draw() {
  background(15, 23, 42);

  for (const u of units) u.step();
  if (frameCount % 3 === 0) computeCoverage();

  // 覆蓋暈
  noStroke();
  for (const u of units) {
    fill(56, 189, 248, 18);
    circle(u.pos.x, u.pos.y, params.coverRadius * 2);
  }
  for (const u of units) {
    fill(125, 211, 252);
    circle(u.pos.x, u.pos.y, 7);
  }

  // 滑鼠處的攻擊預示
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    noFill(); stroke(248, 113, 113, 180); strokeWeight(2);
    circle(mouseX, mouseY, params.blastRadius * 2);
  }

  noStroke();
  const col = coveredPct > 85 ? color(74, 222, 128) : coveredPct > 60 ? color(250, 204, 21) : color(248, 113, 113);
  fill(226, 232, 240);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`存活：${units.length}`, 16, 14);
  fill(col);
  text(`覆蓋率：${coveredPct.toFixed(0)}%　（被打後最低 ${minCover.toFixed(0)}%）`, 16, 38);
  fill(148, 163, 184);
  textSize(13);
  text('在畫布上點一下＝炸掉一片，看缺口自己被補上', 16, 62);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
