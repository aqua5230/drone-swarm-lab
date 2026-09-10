// ============================================================
// 第 12 課 · 少數知情者領路（Couzin et al. 2005）
//
// 全體跑一樣的社交規則（分離／對齊／聚合），差別只在：
// 少數「知情者」心裡多一個偏好方向，會把它按 weight 的比重混進自己的航向。
// 知情者沒有標記、沒有特權、沒有人聽命於牠——但整群還是被帶著走。
//
// conflict > 0 時知情者分成兩派，偏好方向各自偏離中線 conflict/2。
// 讀三個數字就好：
//   極化度＝所有航向的平均向量長度（1 = 全群朝同一邊，0 = 各走各的）
//   航向偏離＝群體平均航向與中線的夾角（0° = 折衷走中間，±conflict/2 = 選了一邊）
//   高極化 + 大偏離 = 選邊；低極化 = 群體裂了。
// ============================================================

const params = {
  count: 160,
  informedPct: 8,
  weight: 0.6,      // ω：偏好方向相對社交方向的比重
  conflict: 0,      // 兩派知情者的意見夾角（度）
  speed: 2.6,
  perception: 62,   // 對齊／聚合看得到的範圍
};

const SEP_R = 22, W_SEP = 1.6, W_ALI = 1.0, W_COH = 0.9;

let boids = [];
let pane = null;
let goalA, goalB;
let smooth = null;    // 平均航向的指數平滑（瞬時值抖得看不清）
let polar = 0, offsetDeg = 0;

class Boid {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().setMag(params.speed);
    this.informed = false;
    this.side = 0;    // 1 = A 派，-1 = B 派
  }
  step(all) {
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, nA = 0, nC = 0;
    const pr2 = params.perception * params.perception, sr2 = SEP_R * SEP_R;
    for (const o of all) {
      if (o === this) continue;
      // 場地是環形的，鄰居要算「抄近路」那一邊；用絕對座標算聚合，
      // 群體飛過邊界時會被硬拉回去，航向就系統性歪掉。
      let dx = o.pos.x - this.pos.x, dy = o.pos.y - this.pos.y;
      if (dx > width / 2) dx -= width; else if (dx < -width / 2) dx += width;
      if (dy > height / 2) dy -= height; else if (dy < -height / 2) dy += height;
      const d2 = dx * dx + dy * dy;
      if (d2 > pr2 || d2 === 0) continue;
      ax += o.vel.x; ay += o.vel.y;
      cx += dx; cy += dy;
      nA++; nC++;
      if (d2 < sr2) {
        const d = Math.sqrt(d2);
        sx -= dx / d; sy -= dy / d;
      }
    }

    let desired = createVector(0, 0);
    if (nA > 0) {
      const ali = createVector(ax / nA, ay / nA).normalize().mult(W_ALI);
      const coh = createVector(cx / nC, cy / nC).normalize().mult(W_COH);
      desired.add(ali).add(coh);
    }
    if (sx || sy) desired.add(createVector(sx, sy).normalize().mult(W_SEP));
    if (desired.mag() > 0) desired.normalize();
    else desired = this.vel.copy().normalize();

    // 知情者才有的那一項：把偏好方向按 weight 混進來
    if (this.informed) {
      const g = this.side > 0 ? goalA : goalB;
      desired.add(g.x * params.weight, g.y * params.weight).normalize();
    }

    this.vel.lerp(desired.mult(params.speed), 0.09).setMag(params.speed);
    this.pos.add(this.vel);
    // 環形場地：飛出去從對邊回來，群體才能一直往目標走
    if (this.pos.x < 0) this.pos.x += width;
    if (this.pos.x > width) this.pos.x -= width;
    if (this.pos.y < 0) this.pos.y += height;
    if (this.pos.y > height) this.pos.y -= height;
  }
  draw() {
    const c = !this.informed ? [125, 211, 252] : this.side > 0 ? [251, 191, 36] : [244, 114, 182];
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    noStroke();
    fill(c[0], c[1], c[2], this.informed ? 255 : 190);
    const s = this.informed ? 6.5 : 5;
    triangle(s * 1.8, 0, -s, s * 0.72, -s, -s * 0.72);
    pop();
  }
}

// 目標方向：中線固定朝右，兩派各偏 conflict/2
function updateGoals() {
  const half = radians(params.conflict / 2);
  goalA = createVector(Math.cos(-half), Math.sin(-half));
  goalB = createVector(Math.cos(half), Math.sin(half));
}

// 知情者從頭抽一次，並平均分成兩派（讓兩邊人數相當，比較才公平）
function assignInformed() {
  const n = Math.round(boids.length * params.informedPct / 100);
  const idx = boids.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = floor(random(i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  for (const b of boids) { b.informed = false; b.side = 0; }
  for (let k = 0; k < n; k++) {
    const b = boids[idx[k]];
    b.informed = true;
    b.side = k % 2 === 0 ? 1 : -1;
  }
}

function reset() {
  boids = [];
  for (let i = 0; i < params.count; i++) boids.push(new Boid());
  assignInformed();
  smooth = null;
}

function measure() {
  let vx = 0, vy = 0;
  for (const b of boids) { vx += b.vel.x; vy += b.vel.y; }
  vx /= boids.length * params.speed;
  vy /= boids.length * params.speed;
  polar = Math.sqrt(vx * vx + vy * vy);
  if (!smooth) smooth = { x: vx, y: vy };
  smooth.x += (vx - smooth.x) * 0.05;
  smooth.y += (vy - smooth.y) * 0.05;
  offsetDeg = degrees(Math.atan2(smooth.y, smooth.x));
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  else if (partial.informedPct !== undefined) assignInformed();
  if (partial.conflict !== undefined) updateGoals();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '領路參數', container });
  pane.addBinding(params, 'count', { min: 40, max: 400, step: 10 }).on('change', reset);
  pane.addBinding(params, 'informedPct', { min: 0, max: 40, step: 1 }).on('change', assignInformed);
  pane.addBinding(params, 'weight', { min: 0, max: 2, step: 0.05 });
  pane.addBinding(params, 'conflict', { min: 0, max: 180, step: 5 }).on('change', updateGoals);
  pane.addBinding(params, 'perception', { min: 30, max: 120, step: 2 });
  pane.addButton({ title: '重置' }).on('click', reset);
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  updateGoals();
  reset();
  createControls();
}

// 右上角的羅盤：畫出兩派知情者各自想去的方向
function drawCompass() {
  const cx = width - 62, cy = 62, r = 34;
  noFill(); stroke(71, 85, 105); strokeWeight(1);
  circle(cx, cy, r * 2);
  const arrow = (v, col) => {
    stroke(col[0], col[1], col[2]); strokeWeight(3);
    line(cx, cy, cx + v.x * r, cy + v.y * r);
    noStroke(); fill(col[0], col[1], col[2]);
    circle(cx + v.x * r, cy + v.y * r, 7);
  };
  arrow(goalA, [251, 191, 36]);
  if (params.conflict > 0) arrow(goalB, [244, 114, 182]);
  // 群體實際航向
  if (smooth) {
    const m = Math.hypot(smooth.x, smooth.y) || 1;
    stroke(226, 232, 240); strokeWeight(2);
    line(cx, cy, cx + (smooth.x / m) * r * 0.8, cy + (smooth.y / m) * r * 0.8);
  }
  noStroke(); fill(148, 163, 184); textSize(11); textAlign(CENTER, TOP);
  text('目標／實際航向', cx, cy + r + 6);
}

function draw() {
  background(15, 23, 42);

  for (const b of boids) b.step(boids);
  for (const b of boids) b.draw();
  measure();
  drawCompass();

  const informedN = boids.filter((b) => b.informed).length;
  noStroke();
  fill(226, 232, 240); textSize(15); textAlign(LEFT, TOP);
  text(`知情者：${informedN} / ${boids.length}（${params.informedPct}%）`, 16, 14);

  const polCol = polar > 0.7 ? color(74, 222, 128) : polar > 0.4 ? color(250, 204, 21) : color(248, 113, 113);
  fill(polCol);
  text(`極化度：${(polar * 100).toFixed(0)}%${polar < 0.4 ? '　← 群體裂了' : ''}`, 16, 38);

  const label = params.conflict > 0 ? '航向偏離中線' : '航向誤差';
  const err = params.conflict > 0 ? offsetDeg : Math.abs(offsetDeg);
  fill(148, 163, 184); textSize(14);
  text(`${label}：${err.toFixed(0)}°` +
    (params.conflict > 0 ? `　（兩派各偏 ${(params.conflict / 2).toFixed(0)}°）` : ''), 16, 62);
  textSize(13);
  text('琥珀＝知情者Ａ派　粉紅＝Ｂ派　藍＝不知情', 16, 86);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
