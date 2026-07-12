// ============================================================
// 第 3 課 · 斷通訊還能協同嗎
//
// boids，但每隻只跟「通訊半徑內、且這一幀沒掉封包」的鄰居協同。
// 剪短 commsRadius 或調高 packetLoss → 連線變稀 → 群體碎成孤島。
// 用 union-find（併查集）即時數出「群島數」當量化指標。
// ============================================================

const params = {
  count: 110,
  commsRadius: 90,    // 通訊半徑：聽得到多遠的鄰居
  packetLoss: 0.0,    // 封包遺失率：每條連線這一幀失效的機率
  maxSpeed: 3.2,
  maxForce: 0.06,
  showLinks: true,
};

let agents = [];
let pane = null;
let islandCount = 1;

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
  steer(v) {
    this.acc.add(v.copy().setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce));
  }
  update() {
    this.vel.add(this.acc).limit(params.maxSpeed);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }
  show(col) {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    noStroke();
    fill(col);
    triangle(9, 0, -6, -4, -6, 4);
    pop();
  }
}

// 併查集：把「連得上的」歸成同一群，最後不同的根 = 不同的島
function makeDSU(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  return { find, union };
}

function step() {
  const r2 = params.commsRadius * params.commsRadius;
  const dsu = makeDSU(agents.length);
  const links = [];

  // 每隻累積鄰居的對齊/聚合/分離；只算「連線存活」的鄰居
  const acc = agents.map(() => ({ ax: 0, ay: 0, cx: 0, cy: 0, sx: 0, sy: 0, n: 0, sn: 0 }));

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const dx = agents[i].pos.x - agents[j].pos.x;
      const dy = agents[i].pos.y - agents[j].pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 === 0 || d2 > r2) continue;
      // 在通訊半徑內，但這一幀可能掉封包
      if (random() < params.packetLoss) continue;

      dsu.union(i, j);
      if (params.showLinks) links.push([i, j, d2 / r2]);

      const a = acc[i], b = acc[j];
      a.ax += agents[j].vel.x; a.ay += agents[j].vel.y;
      b.ax += agents[i].vel.x; b.ay += agents[i].vel.y;
      a.cx += agents[j].pos.x; a.cy += agents[j].pos.y;
      b.cx += agents[i].pos.x; b.cy += agents[i].pos.y;
      a.n++; b.n++;
      a.sx += dx / d2; a.sy += dy / d2;
      b.sx -= dx / d2; b.sy -= dy / d2;
      a.sn++; b.sn++;
    }
  }

  for (let i = 0; i < agents.length; i++) {
    const a = acc[i], boid = agents[i];
    if (a.n > 0) {
      boid.steer(createVector(a.ax / a.n, a.ay / a.n));
      boid.steer(createVector(a.cx / a.n - boid.pos.x, a.cy / a.n - boid.pos.y));
    }
    if (a.sn > 0) boid.steer(createVector(a.sx, a.sy).mult(1.4));
    boid.update();
    boid.edges();
  }

  // 數島：不同的根有幾個
  const roots = new Set();
  for (let i = 0; i < agents.length; i++) roots.add(dsu.find(i));
  islandCount = roots.size;

  return links;
}

function reset() {
  agents = [];
  for (let i = 0; i < params.count; i++) agents.push(new Boid());
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
  pane = new Tweakpane.Pane({ title: '通訊參數', container });
  pane.addBinding(params, 'count', { min: 30, max: 220, step: 1 }).on('change', reset);
  pane.addBinding(params, 'commsRadius', { min: 20, max: 220, step: 1 });
  pane.addBinding(params, 'packetLoss', { min: 0, max: 0.9, step: 0.01 });
  pane.addBinding(params, 'maxSpeed', { min: 1, max: 6, step: 0.1 });
  pane.addBinding(params, 'showLinks');
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
  const links = step();

  if (params.showLinks) {
    strokeWeight(1);
    for (const [i, j, t] of links) {
      stroke(56, 189, 248, 120 * (1 - t));
      line(agents[i].pos.x, agents[i].pos.y, agents[j].pos.x, agents[j].pos.y);
    }
  }

  // 島越多 → 顏色越偏紅，給個直覺
  const col = islandCount <= 2 ? color(56, 189, 248)
    : islandCount <= 6 ? color(250, 204, 21)
    : color(248, 113, 113);
  for (const a of agents) a.show(col);

  noStroke();
  fill(226, 232, 240);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`群島數：${islandCount}`, 16, 14);
  fill(148, 163, 184);
  textSize(13);
  text(islandCount <= 2 ? '一片連通——還是一個群' : '已碎成孤島——各飛各的，協同瓦解', 16, 36);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
