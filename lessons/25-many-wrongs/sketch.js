// ============================================================
// 第 25 課 · 一群爛導航員，平均起來很準（many wrongs）
//
// 每個個體手上都有一個歪掉的羅盤：方向 = 真方向 + 系統偏差 + 個人隨機誤差。
// 個體照自己的羅盤走會偏；但只要彼此對齊，群體航向等於把所有誤差平均掉，
// 誤差縮成原來的 1/√N。前提是誤差沒有共同的偏向——這正是本課的第二半。
// 依 Grünbaum 1998 與 Simons 2004 的「多錯得正」論點改寫。
// ============================================================

const params = {
  count: 60,
  sigma: 55,
  bias: 0,
  social: 0.85,
  radius: 90,
  showCompass: true,
};

// 下方 130px 放「誤差 vs 群體大小」的曲線。
const CHART_HEIGHT = 130;
// 真方向固定朝右，畫面右緣放一個目標標記。
const TRUE_HEADING = 0;
// 每幀轉向的比例，讓航向平滑收斂而不是瞬間跳過去。
const TURN_RATE = 0.14;
const SPEED = 1.5;
const BODY_RADIUS = 5;
// 掃描的群體大小，取 2 的次方，橫軸才排得開。
const SCAN_SIZES = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
// 每個尺寸重抽這麼多次再平均，單次抽樣的運氣才不會蓋過趨勢。
const SCAN_REPEATS = 400;
// 掃描分幀做，每幀跑這麼多次，避免一次算完卡住畫面。
const SCAN_PER_FRAME = 12;
// 常態分布取絕對值後的平均是標準差的 √(2/π) 倍；理論曲線要跟量到的「平均絕對誤差」同單位。
const MEAN_ABS_FACTOR = Math.sqrt(2 / Math.PI);
// 面板範圍
const COUNT_MIN = 1;
const COUNT_MAX = 400;
const SIGMA_MIN = 0;
const SIGMA_MAX = 90;
const BIAS_MIN = -60;
const BIAS_MAX = 60;
const SOCIAL_MIN = 0;
const SOCIAL_MAX = 1;
const RADIUS_MIN = 20;
const RADIUS_MAX = 400;

let agents = [];
let pane = null;
let groupError = 0;
let personalError = 0;
let alignment = 0;
let scanPoints = [];
let scanning = false;
let scanIndex = 0;
let scanRepeat = 0;
let scanSum = 0;

class Agent {
  constructor(fieldW, fieldH) {
    this.x = random(fieldW);
    this.y = random(fieldH);
    // 個人羅盤：一次抽定，之後不變——像一支出廠就歪掉的指北針。
    this.preferred = TRUE_HEADING + radians(params.bias) + compassNoise();
    this.angle = this.preferred;
  }
}

// 抽一個標準差為 params.sigma 度的常態隨機角度，單位是弧度。
function compassNoise() {
  return radians(randomGaussian(0, Math.max(0, Number(params.sigma) || 0)));
}

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function fieldHeight() {
  return Math.max(1, height - CHART_HEIGHT);
}

function agentCount() {
  return constrain(Math.floor(Number(params.count) || COUNT_MIN), COUNT_MIN, COUNT_MAX);
}

// 把角度差折回 -π～π，才不會把 359° 和 1° 當成差 358°。
function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function reset() {
  agents = [];
  const n = agentCount();
  for (let i = 0; i < n; i++) agents.push(new Agent(width, fieldHeight()));
  updateErrors();
}

// 重抽所有人的羅盤誤差，但不動位置——同一群人換一批運氣。
function redrawCompasses() {
  for (const agent of agents) {
    agent.preferred = TRUE_HEADING + radians(params.bias) + compassNoise();
  }
}

function updateErrors() {
  if (agents.length === 0) return;
  let sx = 0;
  let sy = 0;
  let absSum = 0;
  for (const agent of agents) {
    sx += Math.cos(agent.angle);
    sy += Math.sin(agent.angle);
    absSum += Math.abs(wrapAngle(agent.preferred - TRUE_HEADING));
  }
  personalError = degrees(absSum / agents.length);
  // 全部方向為零向量時（理論上不會，但夾住以免 atan2(0,0) 進到統計）視為無誤差。
  groupError = (sx === 0 && sy === 0) ? 0 : Math.abs(degrees(wrapAngle(Math.atan2(sy, sx) - TRUE_HEADING)));
  // 一致度：所有行進方向加起來的長度 ÷ 隻數。接近 1 才代表牠們真的在一起走，
  // 而不是各走各的、只是數學上平均起來剛好指對方向。
  alignment = Math.hypot(sx, sy) / agents.length;
}

function stepSimulation() {
  const fieldW = width;
  const fieldH = fieldHeight();
  const social = constrain(Number(params.social) || 0, SOCIAL_MIN, SOCIAL_MAX);
  const radius = Math.max(1, Number(params.radius) || 1);

  const headings = agents.map((a) => a.angle);
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    let sx = 0;
    let sy = 0;
    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      if (Math.hypot(agents[j].x - agent.x, agents[j].y - agent.y) > radius) continue;
      sx += Math.cos(headings[j]);
      sy += Math.sin(headings[j]);
    }
    // 沒有鄰居就只能聽自己的羅盤，社交力道形同 0。
    const hasNeighbor = sx !== 0 || sy !== 0;
    const mixX = (1 - social) * Math.cos(agent.preferred) + (hasNeighbor ? social * sx / Math.hypot(sx, sy) : 0);
    const mixY = (1 - social) * Math.sin(agent.preferred) + (hasNeighbor ? social * sy / Math.hypot(sx, sy) : 0);
    const target = (mixX === 0 && mixY === 0) ? agent.preferred : Math.atan2(mixY, mixX);
    agent.angle += wrapAngle(target - agent.angle) * TURN_RATE;
  }

  for (const agent of agents) {
    agent.x += Math.cos(agent.angle) * SPEED;
    agent.y += Math.sin(agent.angle) * SPEED;
    // 環繞邊界：群體可以一直走，不會被右牆擠成一排。
    if (agent.x < 0) agent.x += fieldW;
    if (agent.x > fieldW) agent.x -= fieldW;
    if (agent.y < 0) agent.y += fieldH;
    if (agent.y > fieldH) agent.y -= fieldH;
  }
  updateErrors();
}

// 掃描：直接對每個群體大小重抽 N 支羅盤、取方向平均，量它偏離真方向多少。
// 這算的就是模擬裡群體航向收斂到的那個量，只是不必等動畫跑完。
function stepScan() {
  if (!scanning) return;
  for (let k = 0; k < SCAN_PER_FRAME && scanning; k++) {
    const n = SCAN_SIZES[scanIndex];
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      const a = TRUE_HEADING + radians(params.bias) + compassNoise();
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    scanSum += Math.abs(degrees(wrapAngle(Math.atan2(sy, sx) - TRUE_HEADING)));
    scanRepeat++;
    if (scanRepeat >= SCAN_REPEATS) {
      scanPoints.push({ n, error: scanSum / SCAN_REPEATS });
      scanRepeat = 0;
      scanSum = 0;
      scanIndex++;
      if (scanIndex >= SCAN_SIZES.length) scanning = false;
    }
  }
}

function startScan() {
  scanPoints = [];
  scanning = true;
  scanIndex = 0;
  scanRepeat = 0;
  scanSum = 0;
}

function drawGoal() {
  const y = fieldHeight() / 2;
  stroke(74, 222, 128, 150);
  strokeWeight(2);
  line(width - 42, y, width - 18, y);
  line(width - 26, y - 7, width - 18, y);
  line(width - 26, y + 7, width - 18, y);
  noStroke();
  fill(74, 222, 128);
  textSize(11);
  textAlign(RIGHT, BOTTOM);
  text('真方向', width - 18, y - 10);
}

function drawAgents() {
  noStroke();
  for (const agent of agents) {
    const err = Math.abs(degrees(wrapAngle(agent.preferred - TRUE_HEADING)));
    // 羅盤越歪畫得越紅：一眼看出群體裡其實沒幾個人是準的。
    const t = constrain(err / 90, 0, 1);
    fill(lerpColor(color(56, 189, 248), color(248, 113, 113), t));
    push();
    translate(agent.x, agent.y);
    rotate(agent.angle);
    triangle(BODY_RADIUS, 0, -BODY_RADIUS, BODY_RADIUS * 0.6, -BODY_RADIUS, -BODY_RADIUS * 0.6);
    pop();

    if (params.showCompass) {
      stroke(226, 232, 240, 40);
      strokeWeight(1);
      line(agent.x, agent.y, agent.x + Math.cos(agent.preferred) * 14,
        agent.y + Math.sin(agent.preferred) * 14);
      noStroke();
    }
  }
}

// 畫面中央一支粗箭頭＝群體現在實際往哪走，跟綠色真方向對照。
function drawGroupArrow() {
  let sx = 0;
  let sy = 0;
  for (const agent of agents) { sx += Math.cos(agent.angle); sy += Math.sin(agent.angle); }
  if (sx === 0 && sy === 0) return;
  const angle = Math.atan2(sy, sx);
  const cx = width / 2;
  const cy = fieldHeight() - 52;
  push();
  translate(cx, cy);
  rotate(angle);
  stroke(226, 232, 240);
  strokeWeight(3);
  line(-46, 0, 46, 0);
  line(46, 0, 32, -9);
  line(46, 0, 32, 9);
  pop();
  noStroke();
  fill(148, 163, 184);
  textSize(11);
  textAlign(CENTER, TOP);
  text('群體實際航向', cx, cy + 14);
}

function drawScanChart() {
  const top = fieldHeight();
  const left = 46;
  const right = width - 18;
  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_HEIGHT);

  const plotTop = top + 25;
  const plotBottom = height - 23;
  const axisMax = Math.max(20, Math.abs(params.bias) + params.sigma * 0.9);
  const errorToY = (e) => map(constrain(e, 0, axisMax), 0, axisMax, plotBottom, plotTop);
  // 橫軸取以 2 為底的對數，1 到 512 才排得下、也才看得出 1/√N 是直線。
  const sizeToX = (n) => map(Math.log2(Math.max(1, n)), 0, Math.log2(512), left, right);

  stroke(71, 85, 105);
  strokeWeight(1);
  line(left, plotTop, left, plotBottom);
  line(left, plotBottom, right, plotBottom);

  // 理論曲線：誤差沒有偏向時是 σ/√N，有偏向時整條被抬到偏差值上下不來。
  noFill();
  stroke(148, 163, 184, 170);
  drawingContext.setLineDash([4, 4]);
  beginShape();
  for (let n = 1; n <= 512; n *= 1.2) {
    const spread = params.sigma / Math.sqrt(n) * MEAN_ABS_FACTOR;
    const expected = Math.hypot(Math.abs(params.bias), spread);
    vertex(sizeToX(n), errorToY(expected));
  }
  endShape();
  drawingContext.setLineDash([]);

  noFill();
  stroke(56, 189, 248);
  strokeWeight(2);
  beginShape();
  for (const point of scanPoints) vertex(sizeToX(point.n), errorToY(point.error));
  endShape();
  noStroke();
  fill(56, 189, 248);
  for (const point of scanPoints) circle(sizeToX(point.n), errorToY(point.error), 5);

  // 目前這一群的即時誤差畫成空心圈，讀者可以核對它落在曲線上。
  noFill();
  stroke(250, 204, 21);
  strokeWeight(2);
  circle(sizeToX(agents.length), errorToY(groupError), 10);

  noStroke();
  fill(148, 163, 184);
  textSize(11);
  textAlign(RIGHT, CENTER);
  text(`${Math.round(axisMax)}°`, left - 7, plotTop);
  text('0°', left - 7, plotBottom);
  textAlign(LEFT, TOP);
  text(scanning
    ? `掃描中…（${scanIndex}／${SCAN_SIZES.length}）`
    : '群體航向誤差 vs 群體大小（虛線＝理論，黃圈＝現在這一群）', left, top + 5);
  textAlign(LEFT, TOP);
  text('1 隻', left, plotBottom + 4);
  textAlign(RIGHT, TOP);
  text('512 隻', right, plotBottom + 4);
}

function fittedTextSize(message, preferredSize, maxWidth) {
  textSize(preferredSize);
  if (textWidth(message) <= maxWidth) return;
  // 小螢幕才縮字；一般畫布仍維持 15px／12px。
  textSize(Math.max(8, preferredSize * maxWidth / Math.max(1, textWidth(message))));
}

function drawHUD() {
  const x = 16;
  const maxWidth = Math.max(1, width - 300);
  const expected = Math.hypot(Math.abs(params.bias),
    params.sigma / Math.sqrt(Math.max(1, agents.length)) * MEAN_ABS_FACTOR);
  const line1 = `${agents.length} 隻　個體羅盤平均歪 ${personalError.toFixed(1)}°　群體航向歪 ${groupError.toFixed(1)}°`;
  const line2 = `理論值 ${expected.toFixed(1)}°　隊形一致度 ${alignment.toFixed(2)}　（羅盤雜訊 ${params.sigma}°，系統偏差 ${params.bias}°）`;
  const hint = '細線＝每隻自己的羅盤指向；顏色越紅代表這隻歪得越多';
  noStroke();
  textAlign(LEFT, TOP);
  fill(226, 232, 240);
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
  params.count = 60;
  params.sigma = 55;
  params.bias = 0;
  params.social = 0.85;
  params.radius = 90;
  params.showCompass = true;
  reset();
  scanPoints = [];
  scanning = false;
  if (pane) pane.refresh();
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  // 雜訊或偏差變了，舊的掃描結果是別的實驗，清掉以免混看。
  if (partial.sigma !== undefined || partial.bias !== undefined) {
    redrawCompasses();
    scanPoints = [];
    scanning = false;
  }
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '多錯得正', container });
  pane.addBinding(params, 'count', { label: '群體大小', min: COUNT_MIN, max: COUNT_MAX, step: 1 }).on('change', reset);
  pane.addBinding(params, 'sigma', { label: '羅盤雜訊 σ（度）', min: SIGMA_MIN, max: SIGMA_MAX, step: 1 })
    .on('change', () => { redrawCompasses(); scanPoints = []; });
  pane.addBinding(params, 'bias', { label: '系統偏差（度）', min: BIAS_MIN, max: BIAS_MAX, step: 1 })
    .on('change', () => { redrawCompasses(); scanPoints = []; });
  pane.addBinding(params, 'social', { label: '社交力道', min: SOCIAL_MIN, max: SOCIAL_MAX, step: 0.01 });
  pane.addBinding(params, 'radius', { label: '感知半徑', min: RADIUS_MIN, max: RADIUS_MAX, step: 5 });
  pane.addBinding(params, 'showCompass', { label: '顯示每隻的羅盤' });
  pane.addButton({ title: '掃描群體大小' }).on('click', startScan);
  pane.addButton({ title: '重抽羅盤' }).on('click', redrawCompasses);
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
  background(15, 23, 42);
  drawGoal();
  stepSimulation();
  stepScan();
  drawAgents();
  drawGroupArrow();
  drawScanChart();
  drawHUD();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  reset();
}
