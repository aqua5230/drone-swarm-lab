// ============================================================
// 第 15 課 · 鄰居規則：拓樸鄰居 vs 距離鄰居
//
// 椋鳥不是問「半徑內有誰」，而是固定看最近的幾隻。這裡只換掉誰算鄰居，
// 分離、對齊、聚合三條規則完全一樣。拉大 spread，距離鄰居會逐漸斷線；
// 拓樸鄰居仍各自帶著 k 條關係。按住滑鼠可放進一隻掠食者，把群體打散。
// ============================================================

const params = {
  count: 260,
  mode: 'topological',
  k: 7,
  metricR: 60,
  spread: 1.0,
  sep: 1.4,
  ali: 1.0,
  coh: 0.9,
  maxSpeed: 2.6,
  showLinks: true,
};

let boids = [];
let pane = null;
let neighborLists = [];
let avgNeighbors = 0;
let components = 1;
let order = 0;

// 格子比感知半徑小，密集時也只需排序附近少量候選，不會退化成全體兩兩比較。
const GRID_TARGET = 24;
const STEER_FORCE = 0.055;
const PREDATOR_R = 145;

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function wrapIndex(value, size) {
  return ((value % size) + size) % size;
}

// 從 a 指向 b 的最短環繞位移，讓穿過畫面邊緣的鄰居仍然相鄰。
function wrappedDelta(a, b, size) {
  let d = b - a;
  if (d > size * 0.5) d -= size;
  if (d < -size * 0.5) d += size;
  return d;
}

class Boid {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().setMag(random(0.7, params.maxSpeed));
    const angle = random(TWO_PI);
    const radius = Math.sqrt(random());
    // 每隻各有一個分布錨點；spread 改變時，整片錨點一起縮放或擴張。
    this.anchor = createVector(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
}

function reset() {
  boids = [];
  for (let i = 0; i < params.count; i++) boids.push(new Boid());
  neighborLists = new Array(boids.length).fill(null).map(() => []);
  avgNeighbors = 0;
  components = boids.length > 0 ? boids.length : 0;
}

function buildGrid() {
  const cols = Math.max(1, Math.ceil(width / GRID_TARGET));
  const rows = Math.max(1, Math.ceil(height / GRID_TARGET));
  const cellW = width / cols;
  const cellH = height / rows;
  const cells = new Array(cols * rows);
  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    const col = Math.min(cols - 1, Math.floor(b.pos.x / cellW));
    const row = Math.min(rows - 1, Math.floor(b.pos.y / cellH));
    const index = row * cols + col;
    if (!cells[index]) cells[index] = [];
    cells[index].push(i);
  }
  return { cols, rows, cellW, cellH, minCell: Math.min(cellW, cellH), cells };
}

function cellOf(boid, grid) {
  return {
    col: Math.min(grid.cols - 1, Math.floor(boid.pos.x / grid.cellW)),
    row: Math.min(grid.rows - 1, Math.floor(boid.pos.y / grid.cellH)),
  };
}

function distanceSquared(a, b) {
  const dx = wrappedDelta(a.pos.x, b.pos.x, width);
  const dy = wrappedDelta(a.pos.y, b.pos.y, height);
  return dx * dx + dy * dy;
}

function metricNeighbors(index, grid) {
  const me = boids[index];
  const here = cellOf(me, grid);
  const reach = Math.ceil(params.metricR / grid.minCell);
  const seenCells = new Set();
  const found = [];
  const r2 = params.metricR * params.metricR;

  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const col = wrapIndex(here.col + dx, grid.cols);
      const row = wrapIndex(here.row + dy, grid.rows);
      const key = row * grid.cols + col;
      if (seenCells.has(key)) continue;
      seenCells.add(key);
      const cell = grid.cells[key];
      if (!cell) continue;
      for (const other of cell) {
        if (other !== index && distanceSquared(me, boids[other]) <= r2) found.push(other);
      }
    }
  }
  return found;
}

function topologicalNeighbors(index, grid) {
  const me = boids[index];
  const here = cellOf(me, grid);
  const found = [];
  const seenCells = new Set();
  const maxRing = Math.max(grid.cols, grid.rows);

  // 一圈圈向外讀格子；已有 k 個候選且外圈不可能更近時才停。
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const col = wrapIndex(here.col + dx, grid.cols);
        const row = wrapIndex(here.row + dy, grid.rows);
        const key = row * grid.cols + col;
        if (seenCells.has(key)) continue;
        seenCells.add(key);
        const cell = grid.cells[key];
        if (!cell) continue;
        for (const other of cell) if (other !== index) found.push(other);
      }
    }

    if (found.length < params.k) continue;
    found.sort((a, b) => distanceSquared(me, boids[a]) - distanceSquared(me, boids[b]));
    const kthDistance = Math.sqrt(distanceSquared(me, boids[found[params.k - 1]]));
    // 未讀格子至少隔著一個完整格寬；保守一格，寧可多讀一圈也不漏最近鄰。
    if (ring > 1 && kthDistance < (ring - 1) * grid.minCell) return found.slice(0, params.k);
    if (seenCells.size === grid.cells.length) return found.slice(0, params.k);
  }
  return found.slice(0, params.k);
}

function findNeighbors() {
  const grid = buildGrid();
  neighborLists = new Array(boids.length);
  let total = 0;
  for (let i = 0; i < boids.length; i++) {
    const list = params.mode === 'metric' ? metricNeighbors(i, grid) : topologicalNeighbors(i, grid);
    neighborLists[i] = list;
    total += list.length;
  }
  avgNeighbors = boids.length ? total / boids.length : 0;
}

function addSteer(boid, x, y, weight) {
  const m = Math.sqrt(x * x + y * y);
  if (m === 0) return;
  x = x / m * params.maxSpeed - boid.vel.x;
  y = y / m * params.maxSpeed - boid.vel.y;
  const force = Math.sqrt(x * x + y * y);
  if (force > STEER_FORCE) {
    x = x / force * STEER_FORCE;
    y = y / force * STEER_FORCE;
  }
  boid.vel.x += x * weight;
  boid.vel.y += y * weight;
}

function applyRules() {
  const extent = constrain((params.spread - 0.3) / 2.7, 0, 1);
  const anchorX = width * (0.06 + extent * 0.47);
  const anchorY = height * (0.06 + extent * 0.47);

  for (let i = 0; i < boids.length; i++) {
    const me = boids[i];
    let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0;
    const list = neighborLists[i];
    for (const otherIndex of list) {
      const other = boids[otherIndex];
      const dx = wrappedDelta(me.pos.x, other.pos.x, width);
      const dy = wrappedDelta(me.pos.y, other.pos.y, height);
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.001) {
        sepX -= dx / d2;
        sepY -= dy / d2;
      }
      aliX += other.vel.x;
      aliY += other.vel.y;
      cohX += dx;
      cohY += dy;
    }
    if (list.length) {
      addSteer(me, sepX, sepY, params.sep);
      addSteer(me, aliX / list.length, aliY / list.length, params.ali);
      addSteer(me, cohX / list.length, cohY / list.length, params.coh);
    }

    // 這股力很弱：只負責改密度，不能取代三條群飛規則。
    const targetX = width * 0.5 + me.anchor.x * anchorX;
    const targetY = height * 0.5 + me.anchor.y * anchorY;
    me.vel.x += wrappedDelta(me.pos.x, targetX, width) * 0.0008;
    me.vel.y += wrappedDelta(me.pos.y, targetY, height) * 0.0008;

    if (mouseIsPressed && mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
      const dx = wrappedDelta(mouseX, me.pos.x, width);
      const dy = wrappedDelta(mouseY, me.pos.y, height);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.1 && d < PREDATOR_R) {
        const strength = (1 - d / PREDATOR_R) * 0.36;
        me.vel.x += dx / d * strength;
        me.vel.y += dy / d * strength;
      }
    }
  }

  for (const b of boids) {
    b.vel.limit(params.maxSpeed);
    b.pos.add(b.vel);
    b.pos.x = wrap(b.pos.x, width);
    b.pos.y = wrap(b.pos.y, height);
  }
}

function measureOrder() {
  let x = 0, y = 0;
  for (const b of boids) {
    const m = b.vel.mag();
    if (m > 0) { x += b.vel.x / m; y += b.vel.y / m; }
  }
  order = boids.length ? Math.sqrt(x * x + y * y) / boids.length : 0;
}

function measureComponents() {
  const parent = boids.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const join = (a, b) => {
    a = find(a); b = find(b);
    if (a !== b) parent[b] = a;
  };
  const sets = neighborLists.map((list) => new Set(list));
  for (let i = 0; i < neighborLists.length; i++) {
    for (const j of neighborLists[i]) if (sets[j] && sets[j].has(i)) join(i, j);
  }
  const roots = new Set();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  components = roots.size;
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
  pane = new Tweakpane.Pane({ title: '鄰居規則', container });
  pane.addBinding(params, 'mode', {
    label: '模式',
    options: { '拓樸：最近 k 隻': 'topological', '距離：半徑內全部': 'metric' },
  });
  pane.addBinding(params, 'k', { label: '最近鄰數 k', min: 1, max: 20, step: 1 });
  pane.addBinding(params, 'metricR', { label: '距離半徑', min: 10, max: 220, step: 5 });
  pane.addBinding(params, 'spread', { label: '分布密度', min: 0.3, max: 3, step: 0.1 });
  pane.addBinding(params, 'count', { label: '個體數', min: 40, max: 600, step: 20 }).on('change', reset);
  pane.addBinding(params, 'sep', { label: '分離', min: 0, max: 3, step: 0.1 });
  pane.addBinding(params, 'ali', { label: '對齊', min: 0, max: 3, step: 0.1 });
  pane.addBinding(params, 'coh', { label: '聚合', min: 0, max: 3, step: 0.1 });
  pane.addBinding(params, 'maxSpeed', { label: '最高速度', min: 0, max: 6, step: 0.1 });
  pane.addBinding(params, 'showLinks', { label: '顯示鄰居連線' });
  pane.addButton({ title: '重置' }).on('click', reset);
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder').style('cursor', 'crosshair');
  reset();
  createControls();
}

function drawLinks() {
  if (!params.showLinks) return;
  stroke(params.mode === 'topological' ? color(167, 139, 250, 46) : color(251, 146, 60, 40));
  strokeWeight(0.7);
  for (let i = 0; i < boids.length; i++) {
    const me = boids[i];
    for (const j of neighborLists[i]) {
      const other = boids[j];
      line(me.pos.x, me.pos.y,
        me.pos.x + wrappedDelta(me.pos.x, other.pos.x, width),
        me.pos.y + wrappedDelta(me.pos.y, other.pos.y, height));
    }
  }
}

function drawPredator() {
  if (!mouseIsPressed || mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  noFill();
  stroke(248, 113, 113, 70); strokeWeight(1);
  circle(mouseX, mouseY, PREDATOR_R * 2);
  noStroke(); fill(248, 113, 113);
  circle(mouseX, mouseY, 16);
}

function drawBoids() {
  noStroke();
  for (const b of boids) {
    const angle = b.vel.heading();
    push();
    translate(b.pos.x, b.pos.y);
    rotate(angle);
    fill(56, 189, 248);
    triangle(7, 0, -5, 4, -5, -4);
    pop();
  }
}

function draw() {
  background(15, 23, 42);
  findNeighbors();
  if (frameCount % 10 === 0) measureComponents();
  measureOrder();
  drawLinks();
  drawPredator();
  drawBoids();
  applyRules();

  fill(226, 232, 240); textSize(15); textAlign(LEFT, TOP);
  text(`模式：${params.mode === 'topological' ? `拓樸（最近 ${params.k} 隻）` : `距離（${params.metricR}px 內）`}`, 16, 14);
  text(`平均鄰居數：${avgNeighbors.toFixed(1)}　連通群數：${components}　秩序參數：${order.toFixed(2)}`, 16, 38);
  fill(148, 163, 184); textSize(13);
  text('拖動「分布密度」比較兩種連線；按住滑鼠＝掠食者，放開看群體能否自己合回來', 16, 62);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
