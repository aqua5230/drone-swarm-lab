// ============================================================
// 第 20 課 · Voronoi 覆蓋控制（Lloyd 迭代）
//
// 每個格點交給最近的機器人；機器人再往自己責任區的加權重心走。
// 不用精確的 Voronoi 幾何，因為每 8px 取樣已足夠讓分區與收斂可見，
// 也讓每幀成本固定在「格數 × 機器人數」，方便即時教學。
// ============================================================

const params = {
  robots: 8,
  density: 'single',
  gain: 0.06,
  showBorders: true,
  showCost: true,
  jitter: 0,
};

// 8px 是題目指定的取樣格邊長，避免逐像素掃描。
const CELL = 8;
// 130px 是全站課程折線圖慣例，也是題目指定的下方高度。
const CHART_H = 130;
// 400 幀讓折線保有足夠的收斂過程，又不會擠成一團。
const HISTORY_LEN = 400;
// 30 幀是題目指定的穩定判定窗口。
const CONVERGED_FRAMES = 30;
// 0.05px 是題目指定的每幀平均移動量門檻。
const CONVERGED_EPSILON = 0.05;
// 初始群聚寬度取場地短邊的 7%，讓左下角的重新分區特別明顯。
const START_SPREAD = 0.07;
// 高斯峰 sigma 取題目指定的場地短邊 0.18。
// 峰寬用場地的「長邊」而不是短邊：畫布是 894×410 的長條，
// 用短邊算出來的 sigma 只有 74px，熱區只佔全場一小塊，
// 其餘八成的地方密度一樣平——機器人幾乎照均勻分佈站，看不出熱區的效果。
const SIGMA_RATIO = 0.17;

let robots = [];
let pane = null;
let owner = new Int16Array(0);
let densityValues = new Float32Array(0);
let centroids = [];
let history = [];
let coverageCost = 0;
let averageMove = 0;
let stillFrames = 0;
let densityMax = 1;
let sampleCols = 0;
let sampleRows = 0;
let coverageLayer = null;

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function fieldHeight() {
  return Math.max(1, height - CHART_H);
}

function clampNumber(value, fallback, low, high) {
  const number = Number(value);
  return Number.isFinite(number) ? constrain(number, low, high) : fallback;
}

// 分享連結可繞過面板；先收斂成面板允許的範圍，避免 NaN 進入幾何計算。
function normalizeParams() {
  params.robots = Math.round(clampNumber(params.robots, 8, 2, 24));
  params.gain = clampNumber(params.gain, 0.06, 0, 0.3);
  params.jitter = clampNumber(params.jitter, 0, 0, 2);
  if (!['uniform', 'single', 'double', 'edge'].includes(params.density)) params.density = 'uniform';
  params.showBorders = Boolean(params.showBorders);
  params.showCost = Boolean(params.showCost);
}

function reset() {
  normalizeParams();
  rebuildCoverageLayer();
  const h = fieldHeight();
  const spread = Math.max(8, Math.min(width, h) * START_SPREAD);
  // 左下角留一個 24px 邊界，避免起點被裁掉，也符合全站留白。
  const startX = Math.max(16, spread + 24);
  const startY = Math.max(16, h - spread - 24);
  robots = [];
  for (let i = 0; i < params.robots; i++) {
    robots.push({
      x: constrain(startX + random(-spread, spread), 0, width),
      y: constrain(startY + random(-spread, spread), 0, h),
    });
  }
  history = [];
  averageMove = Infinity;
  stillFrames = 0;
  sampleCoverage();
}

// 分區層只保留每個取樣格的一個像素，再由 image() 放大到場地大小。
// 這避開每幀數千次 Canvas fill()/rect() 呼叫。
function rebuildCoverageLayer() {
  const h = fieldHeight();
  sampleCols = Math.max(1, Math.ceil(width / CELL));
  sampleRows = Math.max(1, Math.ceil(h / CELL));
  coverageLayer = createGraphics(sampleCols, sampleRows);
  coverageLayer.pixelDensity(1);
  coverageLayer.noSmooth();
}

// 這是 exp(-r² / 2σ²)；獨立函式讓四種密度規則能直接對照題目。
function gaussian(x, y, cx, cy, sigma) {
  const dx = x - cx;
  const dy = y - cy;
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}

function densityAt(x, y, fieldW, fieldH) {
  if (params.density === 'uniform') return 1;
  const sigma = Math.max(fieldW, fieldH) * SIGMA_RATIO;
  if (params.density === 'single') {
    // 偏左上：x=32%、y=30%，特意不放正中央才看得出偏移。
    // 底值 0.06：不是 0，遠處仍要有人顧；但要夠低，熱區才拉得動站位。
    return 0.06 + gaussian(x, y, fieldW * 0.32, fieldH * 0.30, sigma);
  }
  if (params.density === 'double') {
    // 左上峰強度 1、右下峰強度 0.6，正是題目指定的比例。
    return gaussian(x, y, fieldW * 0.27, fieldH * 0.27, sigma)
      + 0.6 * gaussian(x, y, fieldW * 0.73, fieldH * 0.73, sigma);
  }
  // 從中心 0.1 線性升到角落 1；半對角線就是最遠距離。
  const dx = x - fieldW / 2;
  const dy = y - fieldH / 2;
  const maxDistance = Math.sqrt((fieldW / 2) ** 2 + (fieldH / 2) ** 2);
  return 0.1 + 0.9 * Math.min(1, Math.sqrt(dx * dx + dy * dy) / maxDistance);
}

function sampleCoverage() {
  const h = fieldHeight();
  sampleCols = Math.max(1, Math.ceil(width / CELL));
  sampleRows = Math.max(1, Math.ceil(h / CELL));
  const total = sampleCols * sampleRows;
  owner = new Int16Array(total);
  densityValues = new Float32Array(total);
  centroids = robots.map(() => ({ mass: 0, x: 0, y: 0 }));
  coverageCost = 0;
  densityMax = 0;

  for (let row = 0; row < sampleRows; row++) {
    for (let col = 0; col < sampleCols; col++) {
      const index = col + row * sampleCols;
      // 格心比格子左上角更公平，也不會讓邊緣有固定偏差。
      const x = Math.min(width, (col + 0.5) * CELL);
      const y = Math.min(h, (row + 0.5) * CELL);
      const phi = densityAt(x, y, width, h);
      let nearest = 0;
      let bestDistance2 = Infinity;
      for (let i = 0; i < robots.length; i++) {
        const dx = robots[i].x - x;
        const dy = robots[i].y - y;
        const distance2 = dx * dx + dy * dy;
        if (distance2 < bestDistance2) {
          bestDistance2 = distance2;
          nearest = i;
        }
      }
      owner[index] = nearest;
      densityValues[index] = phi;
      densityMax = Math.max(densityMax, phi);
      const centroid = centroids[nearest];
      centroid.mass += phi;
      centroid.x += x * phi;
      centroid.y += y * phi;
      coverageCost += phi * bestDistance2;
    }
  }
  densityMax = Math.max(densityMax, 0.0001);
  for (const centroid of centroids) {
    if (centroid.mass > 0) {
      centroid.x /= centroid.mass;
      centroid.y /= centroid.mass;
    }
  }
}

function stepSimulation() {
  const h = fieldHeight();
  let moved = 0;
  for (let i = 0; i < robots.length; i++) {
    const robot = robots[i];
    const centroid = centroids[i];
    const oldX = robot.x;
    const oldY = robot.y;
    if (centroid && centroid.mass > 0) {
      robot.x += (centroid.x - robot.x) * params.gain;
      robot.y += (centroid.y - robot.y) * params.gain;
    }
    // jitter 是教學用擾動：仍由下一輪重心拉回固定駐點。
    if (params.jitter > 0) {
      robot.x += random(-params.jitter, params.jitter);
      robot.y += random(-params.jitter, params.jitter);
    }
    robot.x = constrain(robot.x, 0, width);
    robot.y = constrain(robot.y, 0, h);
    const dx = robot.x - oldX;
    const dy = robot.y - oldY;
    moved += Math.sqrt(dx * dx + dy * dy);
  }
  averageMove = robots.length ? moved / robots.length : 0;
  stillFrames = averageMove < CONVERGED_EPSILON ? stillFrames + 1 : 0;
  // 移動後重算分區，再把這一幀真正看見的 H 記進折線。
  sampleCoverage();
  history.push(coverageCost);
  if (history.length > HISTORY_LEN) history.shift();
}

function removeThree() {
  if (robots.length <= 2) return;
  // Fisher–Yates 的隨機索引讓任何三台都有相同機會被移除。
  const removeCount = Math.min(3, robots.length - 2);
  for (let i = 0; i < removeCount; i++) {
    const index = Math.floor(random(robots.length));
    robots.splice(index, 1);
  }
  params.robots = robots.length;
  history = [];
  stillFrames = 0;
  rebuildCoverageLayer();
  sampleCoverage();
  if (pane) pane.refresh();
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.robots !== undefined || partial.density !== undefined) reset();
  else normalizeParams();
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '覆蓋控制', container });
  // 2 是題目規定的移除下限；24 在 8px 格點掃描下仍可穩定即時更新。
  pane.addBinding(params, 'robots', { label: '機器人數', min: 2, max: 24, step: 1 }).on('change', reset);
  pane.addBinding(params, 'density', {
    label: '重要性密度',
    options: {
      '每處一樣重要': 'uniform',
      '一個熱區': 'single',
      '兩個熱區': 'double',
      '重要的在邊界': 'edge',
    },
  }).on('change', reset);
  // 0.3 包含題目給的快速收斂預設，0 可用來暫停 Lloyd 步驟。
  pane.addBinding(params, 'gain', { label: '移動比例', min: 0, max: 0.3, step: 0.01 });
  pane.addBinding(params, 'jitter', { label: '隨機擾動', min: 0, max: 2, step: 0.05 });
  pane.addBinding(params, 'showBorders', { label: '顯示分區邊界' });
  pane.addBinding(params, 'showCost', { label: '顯示成本折線' });
  pane.addButton({ title: '隨機移除 3 台' }).on('click', removeThree);
  pane.addButton({ title: '重置' }).on('click', reset);
}

function robotHue(index) {
  // 均勻 HSB 色相讓相鄰責任區通常可分辨，台數改變也不需維護色表。
  return (index * 360 / Math.max(1, robots.length)) % 360;
}

function coverageRgb(index) {
  const hue = robotHue(index) / 60;
  // 飽和度壓到 0.5：全站是 slate/sky 的深藍調，0.72 的八個色相會亮得跳出頁面。
  const chroma = 224.4 * 0.5;
  const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
  const match = 224.4 - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 1) [red, green] = [chroma, secondary];
  else if (hue < 2) [red, green] = [secondary, chroma];
  else if (hue < 3) [green, blue] = [chroma, secondary];
  else if (hue < 4) [green, blue] = [secondary, chroma];
  else if (hue < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];
  return [red + match, green + match, blue + match];
}

function drawCoverage() {
  if (!coverageLayer || coverageLayer.width !== sampleCols || coverageLayer.height !== sampleRows) {
    rebuildCoverageLayer();
  }
  coverageLayer.loadPixels();
  const pixels = coverageLayer.pixels;
  const colors = robots.map((_, index) => coverageRgb(index));
  const alphaScale = 150 / densityMax;
  const showBorders = params.showBorders;
  for (let row = 0; row < sampleRows; row++) {
    for (let col = 0; col < sampleCols; col++) {
      const index = col + row * sampleCols;
      // 最低 18 讓低密度仍隱約看見分區；最高 168 讓白色機器人與十字仍跳得出來。
      const alpha = 18 + alphaScale * densityValues[index];
      const color = colors[owner[index]];
      let red = color[0];
      let green = color[1];
      let blue = color[2];
      let outputAlpha = alpha;
      if (showBorders && (
        (col + 1 < sampleCols && owner[index] !== owner[index + 1])
        || (row + 1 < sampleRows && owner[index] !== owner[index + sampleCols])
      )) {
        // 原本的深色邊界在同一離屏像素中以 source-over 混色表示。
        const baseAlpha = alpha / 255;
        const borderAlpha = 210 / 255;
        const combinedAlpha = borderAlpha + baseAlpha * (1 - borderAlpha);
        red = (15 * borderAlpha + red * baseAlpha * (1 - borderAlpha)) / combinedAlpha;
        green = (23 * borderAlpha + green * baseAlpha * (1 - borderAlpha)) / combinedAlpha;
        blue = (42 * borderAlpha + blue * baseAlpha * (1 - borderAlpha)) / combinedAlpha;
        outputAlpha = combinedAlpha * 255;
      }
      const pixel = index * 4;
      pixels[pixel] = red;
      pixels[pixel + 1] = green;
      pixels[pixel + 2] = blue;
      pixels[pixel + 3] = outputAlpha;
    }
  }
  coverageLayer.updatePixels();
  noSmooth();
  image(coverageLayer, 0, 0, width, fieldHeight());
  smooth();
}

function drawRobots() {
  for (let i = 0; i < robots.length; i++) {
    const robot = robots[i];
    const centroid = centroids[i];
    if (centroid && centroid.mass > 0) {
      stroke(226, 232, 240, 170);
      strokeWeight(1);
      line(robot.x, robot.y, centroid.x, centroid.y);
      // 十字長度 4px：小於機器人直徑，卻仍能在深色背景辨認。
      stroke(226, 232, 240);
      strokeWeight(1.5);
      line(centroid.x - 4, centroid.y, centroid.x + 4, centroid.y);
      line(centroid.x, centroid.y - 4, centroid.x, centroid.y + 4);
    }
    colorMode(HSB, 360, 100, 100, 255);
    fill(robotHue(i), 78, 96, 255);
    stroke(226, 232, 240);
    strokeWeight(2);
    // 13px 是讓機器人比 8px 格子顯眼的直徑。
    circle(robot.x, robot.y, 13);
    colorMode(RGB, 255, 255, 255, 255);
  }
}

function drawHud() {
  const converged = stillFrames >= CONVERGED_FRAMES;
  noStroke();
  fill(226, 232, 240);
  textAlign(LEFT, TOP);
  textSize(15);
  text(`機器人：${robots.length}　覆蓋成本 H：${(coverageCost / 1e6).toFixed(2)} 百萬（越低越好）`, 16, 14);
  fill(converged ? 74 : 226, converged ? 222 : 232, converged ? 128 : 240);
  text(`平均移動量：${Number.isFinite(averageMove) ? averageMove.toFixed(3) : '—'} px/幀　狀態：${converged ? '已收斂' : '移動中'}`, 16, 35);
  fill(148, 163, 184);
  textSize(12);
  text('顏色＝各自的責任區；十字＝該區的重心，機器人正往那裡走', 16, 57);
}

function drawCostChart() {
  const top = fieldHeight();
  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_H);
  if (!params.showCost) return;

  // 左邊留白比第 16 課寬：那課的軸標只有「1」「0」，這裡是「12.3 百萬」這種長字串，
  // 42px 放不下會被畫布左緣切掉。
  const left = 74;
  const right = width - 18;
  const graphTop = top + 28;
  const graphBottom = height - 24;
  const maxValue = Math.max(1, ...history, coverageCost);
  stroke(71, 85, 105);
  strokeWeight(1);
  line(left, graphTop, left, graphBottom);
  line(left, graphBottom, right, graphBottom);
  noStroke();
  fill(148, 163, 184);
  textSize(11);
  textAlign(LEFT, TOP);
  text('覆蓋成本 H（最近 400 幀，越低越好）', left, top + 6);
  textAlign(RIGHT, CENTER);
  text(`${(maxValue / 1e6).toFixed(1)} 百萬`, left - 7, graphTop);
  text('0', left - 7, graphBottom);

  if (history.length > 1) {
    noFill();
    stroke(56, 189, 248);
    strokeWeight(2);
    beginShape();
    const start = Math.max(0, history.length - HISTORY_LEN);
    const span = Math.max(1, history.length - 1 - start);
    for (let i = start; i < history.length; i++) {
      const x = map(i - start, 0, span, left, right);
      const y = map(history[i], 0, maxValue, graphBottom, graphTop);
      vertex(x, y);
    }
    endShape();
  }
}

function setup() {
  SwarmLink.init(params); // 讀網址參數；一定要在 reset() 與面板之前。
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function draw() {
  background(15, 23, 42);
  stepSimulation();
  drawCoverage();
  drawRobots();
  drawHud();
  drawCostChart();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  reset();
}
