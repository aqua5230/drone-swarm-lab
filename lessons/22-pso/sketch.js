// ============================================================
// 第 22 課 · 粒子群最佳化（PSO）
//
// 粒子不需要知道整張地圖；它只記得自己的好位置，並聽全群目前的好位置。
// 兩種記憶的拉力怎麼配，決定群體會繼續探索，或太早卡在一座假山頭。
// ============================================================

const params = {
  count: 40,
  w: 0.72,
  c1: 1.5,
  c2: 1.5,
  vmax: 6,
  terrain: 'deceptive',
  trails: true,
  showTruth: false,
};

// 下方 130px 留給收斂曲線，和第 16 課一致。
const CHART_HEIGHT = 130;
// 熱圖每 6px 取一格，重置才畫一次，避免把函數取樣放進每一幀。
const HEAT_STEP = 6;
// 曲線留 400 個點，約六秒的 60fps 行為足夠看出是否停住。
const HISTORY_LENGTH = 400;
// 1e-4 是題目指定的「算有進步」門檻。
const IMPROVEMENT_EPSILON = 1e-4;
// 個人最佳要排除比熱圖更細的微小改善，否則寬峰會把所有記憶推到同一個浮點座標。
const PBEST_IMPROVEMENT_EPSILON = IMPROVEMENT_EPSILON * 5;
// 96 格先找候選峰；最窄峰仍跨過數格，不會漏掉角落的真答案。
const TRUTH_GRID = 96;
// 八輪逐半縮小的鄰域，讓綠圈比熱圖取樣更接近函數的真正峰頂。
const TRUTH_REFINEMENT_ROUNDS = 8;
// 初速小於速度上限，讓第一輪仍有探索方向而不會一開始就衝出地圖。
const INITIAL_SPEED = 2;
// 尾巴留 12 個位置，夠看出方向又不會把熱圖蓋住。
const TRAIL_LENGTH = 12;
// 視覺大小依小型粒子設計，40 隻同時顯示仍清楚。
const PARTICLE_RADIUS = 3;
const PBEST_RADIUS = 2;
const MARKER_RADIUS = 8;
const TRUTH_RADIUS = 6;
// 面板範圍讓讀者可從無慣性到強慣性、無聽從到強拉力比較。
const COUNT_MIN = 10;
const COUNT_MAX = 160;
const WEIGHT_MIN = 0;
const WEIGHT_MAX = 1;
const COEFFICIENT_MIN = 0;
const COEFFICIENT_MAX = 3;
const VMAX_MIN = 0.1;
const VMAX_MAX = 12;

// 單峰放在中上方，作為所有設定都容易成功的對照組。
const SINGLE_X = 0.50;
const SINGLE_Y = 0.44;
const SINGLE_SIGMA = 0.18;
// 山群的最高峰刻意偏右下，不讓「往中央」看起來像答案。
const MULTI_HIGH_X = 0.72;
const MULTI_HIGH_Y = 0.67;
const MULTI_HIGH_SIGMA = 0.10;
const MULTI_HIGH_AMP = 1.05;
const MULTI_LEFT_X = 0.27;
const MULTI_LEFT_Y = 0.30;
const MULTI_LEFT_SIGMA = 0.15;
const MULTI_LEFT_AMP = 0.78;
const MULTI_TOP_X = 0.58;
const MULTI_TOP_Y = 0.18;
const MULTI_TOP_SIGMA = 0.08;
const MULTI_TOP_AMP = 0.64;
// 陷阱峰很寬；真峰窄且藏在右上角，正好暴露過早跟從 gbest 的代價。
const TRAP_X = 0.42;
const TRAP_Y = 0.52;
const TRAP_SIGMA = 0.20;
const TRAP_AMP = 0.88;
const TRUTH_X = 0.85;
const TRUTH_Y = 0.16;
const TRUTH_SIGMA = 0.040;
const TRUTH_AMP = 1.18;

let particles = [];
let pane = null;
let terrainLayer = null;
let terrainMin = 0;
let terrainMax = 1;
let truth = { x: 0, y: 0, value: 0 };
let gbest = { x: 0, y: 0, value: -Infinity };
let history = [];
let stagnantFrames = 0;

class Particle {
  constructor(fieldW, fieldH) {
    this.x = random(fieldW);
    this.y = random(fieldH);
    this.vx = random(-INITIAL_SPEED, INITIAL_SPEED);
    this.vy = random(-INITIAL_SPEED, INITIAL_SPEED);
    this.pbestX = this.x;
    this.pbestY = this.y;
    this.pbestValue = terrainValueAtPixel(this.x, this.y);
    this.trail = [{ x: this.x, y: this.y }];
  }
}

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function fieldHeight() {
  return Math.max(1, height - CHART_HEIGHT);
}

function gaussian(u, v, x, y, sigma, amplitude) {
  const dx = u - x;
  const dy = v - y;
  return amplitude * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}

function terrainValue(u, v) {
  if (params.terrain === 'single') {
    return gaussian(u, v, SINGLE_X, SINGLE_Y, SINGLE_SIGMA, 1);
  }
  if (params.terrain === 'multi') {
    return gaussian(u, v, MULTI_HIGH_X, MULTI_HIGH_Y, MULTI_HIGH_SIGMA, MULTI_HIGH_AMP)
      + gaussian(u, v, MULTI_LEFT_X, MULTI_LEFT_Y, MULTI_LEFT_SIGMA, MULTI_LEFT_AMP)
      + gaussian(u, v, MULTI_TOP_X, MULTI_TOP_Y, MULTI_TOP_SIGMA, MULTI_TOP_AMP);
  }
  return gaussian(u, v, TRAP_X, TRAP_Y, TRAP_SIGMA, TRAP_AMP)
    + gaussian(u, v, TRUTH_X, TRUTH_Y, TRUTH_SIGMA, TRUTH_AMP);
}

function terrainValueAtPixel(x, y) {
  return terrainValue(constrain(x / Math.max(1, width), 0, 1),
    constrain(y / fieldHeight(), 0, 1));
}

function terrainLabel() {
  if (params.terrain === 'single') return '一座山';
  if (params.terrain === 'multi') return '一片山群';
  return '陷阱地形';
}

function findTruth() {
  let best = { x: 0, y: 0, value: -Infinity };
  for (let iy = 0; iy <= TRUTH_GRID; iy++) {
    for (let ix = 0; ix <= TRUTH_GRID; ix++) {
      const u = ix / TRUTH_GRID;
      const v = iy / TRUTH_GRID;
      const value = terrainValue(u, v);
      if (value > best.value) best = { x: u, y: v, value };
    }
  }

  let span = 1 / TRUTH_GRID;
  for (let round = 0; round < TRUTH_REFINEMENT_ROUNDS; round++) {
    let localBest = best;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const u = constrain(best.x + ox * span, 0, 1);
        const v = constrain(best.y + oy * span, 0, 1);
        const value = terrainValue(u, v);
        if (value > localBest.value) localBest = { x: u, y: v, value };
      }
    }
    best = localBest;
    span *= 0.5;
  }
  return {
    x: best.x * width,
    y: best.y * fieldHeight(),
    value: best.value,
  };
}

// 地圖只在重置時取樣；粒子飛行時只讀同一個函數，兩者不會產生不同地形。
function buildTerrainCache() {
  const fieldW = Math.max(1, Math.floor(width));
  const fieldH = Math.max(1, Math.floor(fieldHeight()));
  const samples = [];
  terrainMin = Infinity;
  terrainMax = -Infinity;
  for (let y = 0; y < fieldH; y += HEAT_STEP) {
    for (let x = 0; x < fieldW; x += HEAT_STEP) {
      const value = terrainValue(x / fieldW, y / fieldH);
      samples.push({ x, y, value });
      terrainMin = Math.min(terrainMin, value);
      terrainMax = Math.max(terrainMax, value);
    }
  }

  terrainLayer = createGraphics(fieldW, fieldH);
  terrainLayer.noStroke();
  const range = Math.max(IMPROVEMENT_EPSILON, terrainMax - terrainMin);
  for (const sample of samples) {
    const t = constrain((sample.value - terrainMin) / range, 0, 1);
    // 深藍到天藍只用全站既有的 slate/sky 配色。
    terrainLayer.fill(15 + (56 - 15) * t, 23 + (189 - 23) * t, 42 + (248 - 42) * t);
    terrainLayer.rect(sample.x, sample.y, HEAT_STEP + 1, HEAT_STEP + 1);
  }
  truth = findTruth();
  // 曲線的上界要含精修後的峰值，不讓真答案的虛線被粗熱圖誤切掉。
  terrainMax = Math.max(terrainMax, truth.value);
}

function reset() {
  buildTerrainCache();
  particles = [];
  const count = constrain(Math.floor(Number(params.count) || COUNT_MIN), COUNT_MIN, COUNT_MAX);
  for (let i = 0; i < count; i++) particles.push(new Particle(width, fieldHeight()));

  gbest = { x: 0, y: 0, value: -Infinity };
  for (const particle of particles) {
    if (particle.pbestValue > gbest.value) {
      gbest = { x: particle.pbestX, y: particle.pbestY, value: particle.pbestValue };
    }
  }
  history = [gbest.value];
  stagnantFrames = 0;
}

// 同一幀所有粒子都聽上一幀的 gbest，避免陣列前面的粒子先改變後面的規則。
function stepSimulation() {
  const target = { x: gbest.x, y: gbest.y };
  const fieldW = width;
  const fieldH = fieldHeight();
  const maxSpeed = Math.max(0, Number(params.vmax) || 0);
  for (const particle of particles) {
    const r1 = random();
    const r2 = random();
    particle.vx = params.w * particle.vx
      + params.c1 * r1 * (particle.pbestX - particle.x)
      + params.c2 * r2 * (target.x - particle.x);
    particle.vy = params.w * particle.vy
      + params.c1 * r1 * (particle.pbestY - particle.y)
      + params.c2 * r2 * (target.y - particle.y);

    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > maxSpeed && speed > 0) {
      particle.vx = particle.vx / speed * maxSpeed;
      particle.vy = particle.vy / speed * maxSpeed;
    }
    particle.x += particle.vx;
    particle.y += particle.vy;

    // 不環繞：地圖邊界是地形的一部分，撞牆便在該方向停下來。
    if (particle.x < 0 || particle.x > fieldW) {
      particle.x = constrain(particle.x, 0, fieldW);
      particle.vx = 0;
    }
    if (particle.y < 0 || particle.y > fieldH) {
      particle.y = constrain(particle.y, 0, fieldH);
      particle.vy = 0;
    }

    particle.trail.push({ x: particle.x, y: particle.y });
    if (particle.trail.length > TRAIL_LENGTH) particle.trail.shift();
    const value = terrainValueAtPixel(particle.x, particle.y);
    if (value > particle.pbestValue + PBEST_IMPROVEMENT_EPSILON) {
      particle.pbestX = particle.x;
      particle.pbestY = particle.y;
      particle.pbestValue = value;
    }
  }

  const previousBest = gbest.value;
  for (const particle of particles) {
    if (particle.pbestValue > gbest.value) {
      gbest = { x: particle.pbestX, y: particle.pbestY, value: particle.pbestValue };
    }
  }
  stagnantFrames = gbest.value > previousBest + IMPROVEMENT_EPSILON ? 0 : stagnantFrames + 1;
  history.push(gbest.value);
  if (history.length > HISTORY_LENGTH) history.shift();
}

function drawParticles() {
  if (params.trails) {
    noFill();
    stroke(56, 189, 248, 100);
    strokeWeight(1);
    for (const particle of particles) {
      beginShape();
      for (const point of particle.trail) vertex(point.x, point.y);
      endShape();
    }
  }

  noStroke();
  fill(226, 232, 240, 42);
  for (const particle of particles) circle(particle.pbestX, particle.pbestY, PBEST_RADIUS * 2);
  fill(56, 189, 248);
  for (const particle of particles) circle(particle.x, particle.y, PARTICLE_RADIUS * 2);
}

function drawMarkers() {
  if (params.showTruth) {
    noFill();
    stroke(74, 222, 128);
    strokeWeight(2);
    circle(truth.x, truth.y, TRUTH_RADIUS * 2);
  }

  const x = gbest.x;
  const y = gbest.y;
  noFill();
  stroke(226, 232, 240);
  strokeWeight(2);
  circle(x, y, MARKER_RADIUS * 2);
  line(x - MARKER_RADIUS - 3, y, x + MARKER_RADIUS + 3, y);
  line(x, y - MARKER_RADIUS - 3, x, y + MARKER_RADIUS + 3);
}

function drawHistoryChart() {
  const top = fieldHeight();
  const left = 42;
  const right = width - 18;
  const graphTop = top + 25;
  const graphBottom = height - 23;
  const valueToY = (value) => map(constrain(value, terrainMin, terrainMax), terrainMin, terrainMax,
    graphBottom, graphTop);

  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_HEIGHT);
  stroke(71, 85, 105);
  strokeWeight(1);
  line(left, graphTop, left, graphBottom);
  line(left, graphBottom, right, graphBottom);
  drawingContext.setLineDash([4, 4]);
  stroke(148, 163, 184, 150);
  line(left, valueToY(truth.value), right, valueToY(truth.value));
  drawingContext.setLineDash([]);

  noStroke();
  fill(148, 163, 184);
  textSize(11);
  textAlign(RIGHT, CENTER);
  text(terrainMax.toFixed(2), left - 7, graphTop);
  text(terrainMin.toFixed(2), left - 7, graphBottom);
  textAlign(LEFT, TOP);
  text('全群最佳值（最近 400 幀；虛線＝真最高點）', left, top + 5);
  textAlign(RIGHT, TOP);
  text('時間 →', right, graphBottom + 4);

  if (history.length > 1) {
    noFill();
    stroke(56, 189, 248);
    strokeWeight(2);
    beginShape();
    const start = Math.max(0, history.length - HISTORY_LENGTH);
    const span = Math.max(1, Math.min(HISTORY_LENGTH - 1, history.length - 1));
    for (let i = start; i < history.length; i++) {
      const x = map(i - start, 0, span, left, right);
      vertex(x, valueToY(history[i]));
    }
    endShape();
  }
}

function fittedTextSize(message, preferredSize, maxWidth) {
  textSize(preferredSize);
  if (textWidth(message) <= maxWidth) return;
  // 小螢幕才縮字；一般畫布仍固定使用題目指定的 15px／12px。
  textSize(Math.max(8, preferredSize * maxWidth / Math.max(1, textWidth(message))));
}

function drawHUD() {
  const x = 16;
  const maxWidth = Math.max(1, width - 300);
  const line1 = `地形：${terrainLabel()}　目前最佳：${gbest.value.toFixed(3)}`;
  const line2 = `w=${params.w.toFixed(2)} c1=${params.c1.toFixed(2)} c2=${params.c2.toFixed(2)}　停滯：${stagnantFrames} 幀沒進步`;
  const hint = '白十字＝全群目前最好的位置；打開「顯示真答案」看它是不是找錯山頭';
  noStroke();
  fill(226, 232, 240);
  textAlign(LEFT, TOP);
  fittedTextSize(line1, 15, maxWidth);
  text(line1, x, 14);
  fill(226, 232, 240);
  fittedTextSize(line2, 15, maxWidth);
  text(line2, x, 38);
  fill(148, 163, 184);
  fittedTextSize(hint, 12, maxWidth);
  text(hint, x, 62);
}

function resetDefaults() {
  params.count = 40;
  params.w = 0.72;
  params.c1 = 1.5;
  params.c2 = 1.5;
  params.vmax = 6;
  params.terrain = 'deceptive';
  params.trails = true;
  params.showTruth = false;
  reset();
  if (pane) pane.refresh();
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.terrain !== undefined || partial.count !== undefined) reset();
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '粒子群最佳化', container });
  pane.addBinding(params, 'terrain', {
    label: '地形',
    options: { '一座山': 'single', '一片山群': 'multi', '陷阱地形': 'deceptive' },
  }).on('change', reset);
  pane.addBinding(params, 'count', { label: '粒子數', min: COUNT_MIN, max: COUNT_MAX, step: 5 }).on('change', reset);
  pane.addBinding(params, 'w', { label: '慣性 w', min: WEIGHT_MIN, max: WEIGHT_MAX, step: 0.01 });
  pane.addBinding(params, 'c1', { label: '聽自己 c1', min: COEFFICIENT_MIN, max: COEFFICIENT_MAX, step: 0.1 });
  pane.addBinding(params, 'c2', { label: '聽全群 c2', min: COEFFICIENT_MIN, max: COEFFICIENT_MAX, step: 0.1 });
  pane.addBinding(params, 'vmax', { label: '速度上限', min: VMAX_MIN, max: VMAX_MAX, step: 0.1 });
  pane.addBinding(params, 'trails', { label: '顯示尾巴' });
  pane.addBinding(params, 'showTruth', { label: '顯示真答案' });
  pane.addButton({ title: '重新撒粒子' }).on('click', reset);
  pane.addButton({ title: '重置' }).on('click', resetDefaults);
}

function setup() {
  SwarmLink.init(params);            // 一定要在 reset() 與面板之前讀網址參數
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function draw() {
  image(terrainLayer, 0, 0, width, fieldHeight());
  stepSimulation();
  drawParticles();
  drawMarkers();
  drawHistoryChart();
  drawHUD();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  // 畫布比例變了，舊熱圖已不對應粒子座標，因此安全地整場重建。
  reset();
}
