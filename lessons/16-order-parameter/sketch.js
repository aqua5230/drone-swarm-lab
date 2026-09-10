// ============================================================
// 第 16 課 · 秩序參數（Vicsek 自驅粒子模型）
//
// 每隻粒子朝半徑內鄰居的平均方向走，再加上一點隨機角度。
// 雜訊小時，局部的跟隨會傳成全群同向；超過臨界點，秩序會突然垮掉。
// 下方的 va 是所有行進方向平均後的長度：1 是同向，0 是一團亂。
// ============================================================

const params = {
  count: 400,
  eta: 0.6,
  radius: 26,
  speed: 1.6,
  boxScale: 1.0,
  trails: false,
  showChart: true,
};

const CHART_H = 130;
const HISTORY_LEN = 400;
const ETA_MAX = 6.283;
const SCAN_WAIT = 40;

let particles = [];
let nextAngles = new Float32Array(0);
let pane = null;
let order = 0;
let history = [];
let scanPoints = [];
let scanning = false;
let scanFrame = 0;
let scanSum = 0;

class Particle {
  constructor(boxW, boxH) {
    this.x = random(boxW);
    this.y = random(boxH);
    this.angle = random(TWO_PI);
  }
}

function fieldHeight() {
  return height - CHART_H;
}

function boxSize() {
  return {
    width: Math.max(1, width * params.boxScale),
    height: Math.max(1, fieldHeight() * params.boxScale),
  };
}

function reset() {
  const box = boxSize();
  particles = [];
  for (let i = 0; i < params.count; i++) particles.push(new Particle(box.width, box.height));
  nextAngles = new Float32Array(params.count);
  history = [];
  order = 0;
}

// 格子邊長剛好等於感知半徑，因此每隻只要查自己的九個格子。
function stepSimulation() {
  const box = boxSize();
  // 面板最小值是 8；仍保護分享連結或測試直接給 0 的情況。
  const r = Math.max(0.001, params.radius);
  const r2 = r * r;
  const cols = Math.max(1, Math.ceil(box.width / r));
  const rows = Math.max(1, Math.ceil(box.height / r));
  const needsDedup = cols < 3 || rows < 3;
  const grid = new Map();

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = Math.min(cols - 1, Math.floor(p.x / r));
    const cy = Math.min(rows - 1, Math.floor(p.y / r));
    const key = cx + cy * cols;
    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push(i);
  }

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = Math.min(cols - 1, Math.floor(p.x / r));
    const cy = Math.min(rows - 1, Math.floor(p.y / r));
    let sx = 0, sy = 0;
    const seen = needsDedup ? new Set() : null;

    for (let oy = -1; oy <= 1; oy++) {
      const gy = (cy + oy + rows) % rows;
      for (let ox = -1; ox <= 1; ox++) {
        const gx = (cx + ox + cols) % cols;
        const key = gx + gy * cols;
        // 方框小到只剩一、兩格時，週期性索引會繞回同一格；只算一次。
        if (seen && seen.has(key)) continue;
        if (seen) seen.add(key);
        const cell = grid.get(key);
        if (!cell) continue;
        for (let n = 0; n < cell.length; n++) {
          const q = particles[cell[n]];
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          // 週期性邊界：穿過右邊，等於從左邊看見鄰居。
          if (dx > box.width / 2) dx -= box.width;
          else if (dx < -box.width / 2) dx += box.width;
          if (dy > box.height / 2) dy -= box.height;
          else if (dy < -box.height / 2) dy += box.height;
          if (dx * dx + dy * dy <= r2) {
            sx += Math.cos(q.angle);
            sy += Math.sin(q.angle);
          }
        }
      }
    }
    // 自己也在格子裡；方向平均後才加均勻雜訊。
    nextAngles[i] = Math.atan2(sy, sx) + random(-params.eta / 2, params.eta / 2);
  }

  let meanX = 0, meanY = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.angle = nextAngles[i];
    p.x += Math.cos(p.angle) * params.speed;
    p.y += Math.sin(p.angle) * params.speed;
    p.x = (p.x + box.width) % box.width;
    p.y = (p.y + box.height) % box.height;
    meanX += Math.cos(p.angle);
    meanY += Math.sin(p.angle);
  }
  order = particles.length ? Math.sqrt(meanX * meanX + meanY * meanY) / particles.length : 0;
  history.push(order);
  if (history.length > HISTORY_LEN) history.shift();
}

function startOrCancelScan() {
  if (scanning) {
    scanning = false;
    return;
  }
  params.eta = 0;
  scanPoints = [];
  scanFrame = 0;
  scanSum = 0;
  scanning = true;
  reset();
  if (pane) pane.refresh();
}

function runScan() {
  if (!scanning) return;
  scanFrame++;
  // 前 30 幀讓群體適應，最後 10 幀才取平均，避免把剛換雜訊的瞬間算進去。
  if (scanFrame > SCAN_WAIT - 10) scanSum += order;
  if (scanFrame < SCAN_WAIT) return;

  scanPoints.push({ eta: params.eta, va: scanSum / 10 });
  if (params.eta >= ETA_MAX - 0.0001) {
    scanning = false;
    if (pane) pane.refresh();
    return;
  }
  params.eta = Math.min(ETA_MAX, params.eta + 0.02);
  scanFrame = 0;
  scanSum = 0;
  if (pane) pane.refresh();
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined || partial.boxScale !== undefined) reset();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '秩序參數', container });
  pane.addBinding(params, 'eta', { label: '雜訊 eta', min: 0, max: ETA_MAX, step: 0.02 });
  pane.addBinding(params, 'radius', { label: '感知半徑', min: 8, max: 80, step: 2 });
  pane.addBinding(params, 'speed', { label: '移動速度', min: 0.2, max: 4, step: 0.1 });
  pane.addBinding(params, 'count', { label: '粒子數', min: 50, max: 1200, step: 50 }).on('change', reset);
  pane.addBinding(params, 'boxScale', { label: '有效方框大小', min: 0.5, max: 2, step: 0.1 }).on('change', reset);
  pane.addBinding(params, 'trails', { label: '顯示尾巴' });
  pane.addBinding(params, 'showChart', { label: '顯示折線圖' });
  pane.addButton({ title: '▶ 掃描雜訊 0 → 最大' }).on('click', startOrCancelScan);
  pane.addButton({ title: '重置' }).on('click', reset);
}

function drawParticles() {
  const box = boxSize();
  const sx = width / box.width;
  const sy = fieldHeight() / box.height;
  colorMode(HSB, 360, 100, 100, 255);
  strokeWeight(2);
  for (const p of particles) {
    const x = p.x * sx;
    const y = p.y * sy;
    const hue = ((p.angle % TWO_PI + TWO_PI) % TWO_PI) / TWO_PI * 360;
    const tail = 7;
    stroke(hue, 75, 100, 230);
    line(x - Math.cos(p.angle) * tail, y - Math.sin(p.angle) * tail,
      x + Math.cos(p.angle) * 3, y + Math.sin(p.angle) * 3);
  }
  colorMode(RGB, 255, 255, 255, 255);
}

function drawHistoryChart() {
  if (!params.showChart) return;
  const top = fieldHeight();
  const split = Math.max(250, Math.floor(width * 0.68));
  const left = 38;
  const graphTop = top + 25;
  const graphBottom = height - 22;
  const graphRight = split - 12;

  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_H);
  stroke(51, 65, 85);
  strokeWeight(1);
  line(left, graphTop, left, graphBottom);
  line(left, graphBottom, graphRight, graphBottom);
  fill(148, 163, 184);
  noStroke();
  textSize(11);
  textAlign(RIGHT, CENTER);
  text('1', left - 7, graphTop);
  text('0', left - 7, graphBottom);
  textAlign(LEFT, TOP);
  text('即時 va（最近 400 幀）', left, top + 5);

  const vaY = map(order, 0, 1, graphBottom, graphTop);
  drawingContext.setLineDash([4, 4]);
  stroke(148, 163, 184, 150);
  line(left, vaY, graphRight, vaY);
  drawingContext.setLineDash([]);
  noStroke();
  fill(226, 232, 240);
  textAlign(RIGHT, BOTTOM);
  text(`目前 va ${order.toFixed(3)}`, graphRight, vaY - 3);

  if (history.length > 1) {
    noFill();
    stroke(56, 189, 248);
    strokeWeight(2);
    beginShape();
    for (let i = 0; i < history.length; i++) {
      const x = map(i, 0, HISTORY_LEN - 1, left, graphRight);
      vertex(x, map(history[i], 0, 1, graphBottom, graphTop));
    }
    endShape();
  }

  const sx = split + 25;
  const sr = width - 12;
  const st = graphTop;
  const sb = graphBottom;
  stroke(51, 65, 85);
  strokeWeight(1);
  line(sx, st, sx, sb);
  line(sx, sb, sr, sb);
  noStroke();
  fill(148, 163, 184);
  textSize(10);
  textAlign(LEFT, TOP);
  text('掃描：eta → va', sx, top + 5);
  textAlign(RIGHT, CENTER);
  text('1', sx - 5, st);
  text('0', sx - 5, sb);
  textAlign(CENTER, TOP);
  text('0', sx, sb + 4);
  text('2π', sr, sb + 4);
  noStroke();
  fill(56, 189, 248);
  for (const point of scanPoints) {
    circle(map(point.eta, 0, ETA_MAX, sx, sr), map(point.va, 0, 1, sb, st), 4);
  }
}

function draw() {
  const h = fieldHeight();
  if (params.trails) {
    noStroke();
    fill(15, 23, 42, 42);
    rect(0, 0, width, h);
  } else {
    background(15, 23, 42);
  }

  stepSimulation();
  runScan();
  drawParticles();
  drawHistoryChart();

  const box = boxSize();
  // 密度用「一個感知圈裡平均幾隻」表示：這是粒子真正感覺得到的密度，
  // 也是決定臨界點的那個量。「幾隻／像素平方」對讀者沒有意義。
  const perCircle = particles.length * Math.PI * params.radius * params.radius
    / (box.width * box.height);
  noStroke();
  fill(226, 232, 240);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`粒子數：${particles.length}　eta：${params.eta.toFixed(2)}　密度：一圈內平均 ${perCircle.toFixed(1)} 隻　秩序參數 va：${order.toFixed(3)}`, 16, 14);
  if (scanning) {
    fill(251, 146, 60);
    text(`掃描中 eta=${params.eta.toFixed(2)}（每個值停留 ${SCAN_WAIT} 幀；再按一次取消）`, 16, 38);
  } else {
    fill(148, 163, 184);
    text('顏色＝行進方向；同色代表同向。把雜訊拉過臨界點，看 va 突然掉下去。', 16, 38);
  }
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  reset();
}
