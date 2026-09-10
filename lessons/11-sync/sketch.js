// ============================================================
// 第 11 課 · 螢火蟲同步（脈衝耦合振盪器）
//
// 每隻只有一個相位 phase：0 慢慢爬到 1，爬到頂就閃一下、歸零重來。
// 唯一的互動：看到鄰居閃，自己的相位往前推 coupling 這麼多。
// 沒有共同時鐘、沒有節拍器，整群卻自己收斂到同一拍。
//
// 同步度＝把每隻的相位當成單位圓上的一個向量，取平均後的長度
// （Kuramoto 序參數：全部朝同一角度＝1，散得均勻＝0）。
// ============================================================

const params = {
  count: 180,
  period: 100,      // 自然週期（幀）
  spread: 0.08,     // 個體差異：每隻的週期在 ±這個比例內random
  coupling: 0.1,    // 看到一次閃光，相位往前推多少
  radius: 150,      // 看得到多遠的閃光
  drift: 0.5,       // 漂移速度（同步不靠站著不動）
};

let bugs = [];
let pane = null;
let syncPct = 0;
let beats = [];     // 每幀閃了幾隻，畫成下方節奏條
const BEAT_LEN = 200;

class Bug {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.phase = random();
    this.glow = 0;
    this.rollRate();
  }
  // 自然頻率：每幀往前走多少相位。個體差異就藏在這個數字裡。
  rollRate() {
    this.rate = 1 / (params.period * (1 + random(-params.spread, params.spread)));
  }
  move() {
    this.vel.setMag(params.drift);
    this.pos.add(this.vel);
    if (this.pos.x < 6 || this.pos.x > width - 6) this.vel.x *= -1;
    if (this.pos.y < 6 || this.pos.y > height - 6) this.vel.y *= -1;
    this.pos.x = constrain(this.pos.x, 6, width - 6);
    this.pos.y = constrain(this.pos.y, 6, height - 6);
  }
}

function reset() {
  bugs = [];
  for (let i = 0; i < params.count; i++) bugs.push(new Bug(random(width), random(height)));
  beats = [];
}

function scramble() {
  for (const b of bugs) b.phase = random();
  beats = [];
}

// 點一下＝把附近的相位打亂，看群體自己收回同一拍
function disturb(x, y, r) {
  for (const b of bugs) {
    if ((b.pos.x - x) ** 2 + (b.pos.y - y) ** 2 < r * r) b.phase = random();
  }
}

function stepPhases() {
  const fired = [];
  for (const b of bugs) {
    b.glow *= 0.86;
    b.phase += b.rate;
    if (b.phase >= 1) {
      b.phase = 0;
      b.glow = 1;
      fired.push(b);
    }
  }

  // 閃光的唯一效果：把半徑內還沒閃的鄰居往前推一點。
  // 推到 0.999 就停手（不讓它連鎖引爆，否則一幀之內會滾雪球）。
  const r2 = params.radius * params.radius;
  for (const f of fired) {
    for (const b of bugs) {
      if (b.glow === 1) continue;
      const dx = b.pos.x - f.pos.x, dy = b.pos.y - f.pos.y;
      if (dx * dx + dy * dy < r2) b.phase = Math.min(b.phase + params.coupling, 0.999);
    }
  }

  beats.push(fired.length);
  if (beats.length > BEAT_LEN) beats.shift();
  return fired.length;
}

function computeSync() {
  let sx = 0, sy = 0;
  for (const b of bugs) {
    sx += Math.cos(b.phase * TWO_PI);
    sy += Math.sin(b.phase * TWO_PI);
  }
  syncPct = (Math.sqrt(sx * sx + sy * sy) / bugs.length) * 100;
}

window.applyLessonPreset = function (partial) {
  if (partial.scramble) { scramble(); return; }
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  if (partial.period !== undefined || partial.spread !== undefined) {
    for (const b of bugs) b.rollRate();
  }
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '同步參數', container });
  pane.addBinding(params, 'count', { min: 40, max: 400, step: 10 }).on('change', reset);
  pane.addBinding(params, 'coupling', { min: 0, max: 0.3, step: 0.005 });
  pane.addBinding(params, 'radius', { min: 40, max: 700, step: 10 });
  pane.addBinding(params, 'period', { min: 40, max: 200, step: 5 })
    .on('change', () => { for (const b of bugs) b.rollRate(); });
  pane.addBinding(params, 'spread', { min: 0, max: 0.4, step: 0.01 })
    .on('change', () => { for (const b of bugs) b.rollRate(); });
  pane.addBinding(params, 'drift', { min: 0, max: 2, step: 0.1 });
  pane.addButton({ title: '↯ 打散相位' }).on('click', scramble);
  pane.addButton({ title: '重置' }).on('click', reset);
}

function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) disturb(mouseX, mouseY, 90);
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder').style('cursor', 'crosshair');
  reset();
  createControls();
}

// 下方節奏條：每一直條＝那一幀閃了幾隻。
// 同步＝一根一根尖峰；沒同步＝一片矮矮的雜訊。
function drawBeats() {
  const h = 46, base = height - 12;
  let peak = 1;
  for (const n of beats) peak = Math.max(peak, n);
  noStroke();
  fill(30, 41, 59, 200);
  rect(0, base - h - 6, width, h + 18);
  const w = width / BEAT_LEN;
  for (let i = 0; i < beats.length; i++) {
    const bh = (beats[i] / peak) * h;
    fill(250, 204, 21, 200);
    rect(i * w, base - bh, Math.max(w - 0.5, 1), bh);
  }
  fill(148, 163, 184);
  textSize(12);
  textAlign(LEFT, BOTTOM);
  text('每幀閃光數（同步＝一根根尖峰，沒同步＝一片矮雜訊）', 10, base - h - 10);
}

function draw() {
  background(15, 23, 42);

  for (const b of bugs) b.move();
  stepPhases();
  if (frameCount % 3 === 0) computeSync();

  noStroke();
  for (const b of bugs) {
    // 快閃之前先微微發亮（相位的 8 次方＝只有接近臨界才看得出來）
    const charge = Math.pow(b.phase, 8);
    const lit = Math.max(charge, b.glow);
    if (b.glow > 0.05) {
      fill(250, 204, 21, 40 * b.glow);
      circle(b.pos.x, b.pos.y, 34 * b.glow);
    }
    fill(250, 204, 21, 35 + 220 * lit);
    circle(b.pos.x, b.pos.y, 5 + 7 * lit);
  }

  drawBeats();

  const col = syncPct > 80 ? color(74, 222, 128) : syncPct > 45 ? color(250, 204, 21) : color(248, 113, 113);
  noStroke();
  fill(col);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`同步度：${syncPct.toFixed(0)}%`, 16, 14);
  fill(148, 163, 184);
  textSize(13);
  text('在畫布上點一下＝打亂那一區的相位，看它自己收回同一拍', 16, 38);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
