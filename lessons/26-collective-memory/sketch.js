// ============================================================
// 第 26 課 · 同樣的規則，群體記得自己來過哪（集體記憶與遲滯）
//
// 每隻只有三圈：太近就推開、中圈跟著轉向、外圈往彼此靠。
// 只把「中圈」的寬度 Δρ 從小調到大，群體會依序長出四種形狀：
//   群集 → 環流 → 動態平行 → 高度平行。
// 關鍵在回頭：同一個 Δρ，從小掃上來和從大掃下去，停在不同的形狀——
// 群體現在長什麼樣，取決於它是從哪裡來的。
// 依 Couzin 等人 2002 的三區模型改寫。
// ============================================================

const params = {
  count: 120,
  dro: 12,
  noise: 0.06,
  turn: 0.13,
  blind: true,
  showZones: true,
};

// 下方 130px 放遲滯迴圈（來回掃描的曲線）。
const CHART_HEIGHT = 130;
// 排斥圈半徑固定，它是整個模型的長度單位；只有中圈寬度是本課要轉的旋鈕。
const ZOR = 8;
// 吸引圈永遠比中圈再外面這麼寬，維持群體不散開。
const ZOA_WIDTH = 120;
// 視野死角：身後 90 度看不到，這是 Couzin 模型長出環流的必要條件之一。
const BLIND_ANGLE = Math.PI / 2;
const SPEED = 1.6;
const BODY_RADIUS = 4;
// Δρ 的可調範圍，足以跨過四種形狀。
const DRO_MIN = 0;
const DRO_MAX = 160;
// 掃描每幀移動的 Δρ；太快群體來不及重組，遲滯會被誤判成雜訊。
const SWEEP_STEP = 0.22;
// 每隔這麼多幀在曲線上記一個點。
const SWEEP_SAMPLE_EVERY = 4;
// 形狀判定門檻，數值取自畫面上四種形狀分得開的位置。
const TORUS_M = 0.62;
const TORUS_P = 0.38;
const HIGH_P = 0.85;
const PARALLEL_P = 0.45;
// 面板範圍
const COUNT_MIN = 30;
const COUNT_MAX = 300;
const NOISE_MIN = 0;
const NOISE_MAX = 0.3;
const TURN_MIN = 0.04;
const TURN_MAX = 0.4;

let agents = [];
let pane = null;
let polarization = 0;
let momentum = 0;
let sweepDir = 0;          // 0 沒在掃、1 由小往大、-1 由大往小
let sweepFrame = 0;
let upTrack = [];
let downTrack = [];

class Agent {
  constructor() {
    // 一開始擠在中央一小團，四種形狀都從同一個起點長出來。
    this.x = random(-60, 60);
    this.y = random(-60, 60);
    this.angle = random(TWO_PI);
  }
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

function zoneOrientation() {
  return ZOR + Math.max(0, Number(params.dro) || 0);
}

function zoneAttraction() {
  return zoneOrientation() + ZOA_WIDTH;
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function reset() {
  agents = [];
  const n = agentCount();
  for (let i = 0; i < n; i++) agents.push(new Agent());
  updateMetrics();
}

function clearTracks() {
  upTrack = [];
  downTrack = [];
  sweepDir = 0;
}

function centroid() {
  let cx = 0;
  let cy = 0;
  for (const a of agents) { cx += a.x; cy += a.y; }
  return { x: cx / agents.length, y: cy / agents.length };
}

// 極化度 p：所有行進方向加起來的長度 ÷ 隻數。1 是整群同向，0 是一團亂。
// 角動量 m：每隻相對群心的方位與它的方向叉積平均。1 是整群繞著群心轉。
function updateMetrics() {
  if (agents.length === 0) return;
  const c = centroid();
  let vx = 0;
  let vy = 0;
  let cross = 0;
  for (const a of agents) {
    const ux = Math.cos(a.angle);
    const uy = Math.sin(a.angle);
    vx += ux;
    vy += uy;
    const rx = a.x - c.x;
    const ry = a.y - c.y;
    const len = Math.hypot(rx, ry);
    // 剛好站在群心上的個體沒有方位可言，跳過以免除以零。
    if (len < 1e-6) continue;
    cross += (rx / len) * uy - (ry / len) * ux;
  }
  polarization = Math.hypot(vx, vy) / agents.length;
  momentum = Math.abs(cross) / agents.length;
}

function shapeLabel() {
  if (momentum > TORUS_M && polarization < TORUS_P) return '環流';
  if (polarization > HIGH_P) return '高度平行';
  if (polarization > PARALLEL_P) return '動態平行';
  return '群集';
}

function stepSimulation() {
  const zoo = zoneOrientation();
  const zoa = zoneAttraction();
  const zoo2 = zoo * zoo;
  const zoa2 = zoa * zoa;
  const zor2 = ZOR * ZOR;
  const turn = constrain(Number(params.turn) || TURN_MIN, TURN_MIN, TURN_MAX);
  const noise = Math.max(0, Number(params.noise) || 0);

  const desired = new Float64Array(agents.length);
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const ux = Math.cos(a.angle);
    const uy = Math.sin(a.angle);
    let repX = 0;
    let repY = 0;
    let oriX = 0;
    let oriY = 0;
    let attX = 0;
    let attY = 0;
    let repelling = false;

    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      const b = agents[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > zoa2 || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);

      if (d2 < zor2) {
        // 太近：只管推開，其他一律不看——這條優先權是避免相撞的硬規則。
        repX -= dx / d;
        repY -= dy / d;
        repelling = true;
        continue;
      }
      // 身後的死角看不到。死角關掉時整群比較難長出環流。
      if (params.blind) {
        const cosTheta = (dx * ux + dy * uy) / d;
        if (cosTheta < Math.cos(Math.PI - BLIND_ANGLE / 2)) continue;
      }
      if (d2 < zoo2) {
        oriX += Math.cos(b.angle);
        oriY += Math.sin(b.angle);
      } else {
        attX += dx / d;
        attY += dy / d;
      }
    }

    let tx;
    let ty;
    if (repelling) {
      tx = repX;
      ty = repY;
    } else {
      // 中圈跟外圈各出一半力：這正是 Couzin 模型裡 (d_o + d_a)/2 那一步。
      const oLen = Math.hypot(oriX, oriY);
      const aLen = Math.hypot(attX, attY);
      const ox = oLen > 0 ? oriX / oLen : 0;
      const oy = oLen > 0 ? oriY / oLen : 0;
      const ax = aLen > 0 ? attX / aLen : 0;
      const ay = aLen > 0 ? attY / aLen : 0;
      tx = ox + ax;
      ty = oy + ay;
    }
    // 附近完全沒有鄰居時就照原方向走，不要因為零向量而亂轉。
    const target = (Math.abs(tx) < 1e-9 && Math.abs(ty) < 1e-9)
      ? a.angle
      : Math.atan2(ty, tx) + randomGaussian(0, noise);
    // 每幀最多轉這麼多，轉向速率有上限是這個模型會出現環流的另一個條件。
    desired[i] = a.angle + constrain(wrapAngle(target - a.angle), -turn, turn);
  }

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    a.angle = desired[i];
    a.x += Math.cos(a.angle) * SPEED;
    a.y += Math.sin(a.angle) * SPEED;
  }
  updateMetrics();
}

function stepSweep() {
  if (sweepDir === 0) return;
  params.dro = constrain(params.dro + SWEEP_STEP * sweepDir, DRO_MIN, DRO_MAX);
  sweepFrame++;
  if (sweepFrame % SWEEP_SAMPLE_EVERY === 0) {
    const track = sweepDir > 0 ? upTrack : downTrack;
    track.push({ dro: params.dro, p: polarization, m: momentum });
  }
  const done = sweepDir > 0 ? params.dro >= DRO_MAX : params.dro <= DRO_MIN;
  if (done) {
    sweepDir = 0;
    if (pane) pane.refresh();
  }
}

function startSweep(direction) {
  // 由小往大要先把 Δρ 歸零，由大往小要先推到頂，否則掃出來的不是完整那一條。
  params.dro = direction > 0 ? DRO_MIN : DRO_MAX;
  if (direction > 0) upTrack = [];
  else downTrack = [];
  sweepDir = direction;
  sweepFrame = 0;
  if (pane) pane.refresh();
}

function drawAgents() {
  const c = centroid();
  push();
  // 鏡頭跟著群心：這個模型沒有牆，群體會一直往外走，不跟就跑出畫面了。
  translate(width / 2 - c.x, fieldHeight() / 2 - c.y);

  if (params.showZones && agents.length > 0) {
    const a = agents[0];
    noFill();
    strokeWeight(1);
    stroke(248, 113, 113, 110);
    circle(a.x, a.y, ZOR * 2);
    stroke(56, 189, 248, 110);
    circle(a.x, a.y, zoneOrientation() * 2);
    stroke(148, 163, 184, 70);
    circle(a.x, a.y, zoneAttraction() * 2);
  }

  noStroke();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    fill(i === 0 && params.showZones ? color(250, 204, 21) : color(56, 189, 248));
    push();
    translate(a.x, a.y);
    rotate(a.angle);
    triangle(BODY_RADIUS, 0, -BODY_RADIUS, BODY_RADIUS * 0.6, -BODY_RADIUS, -BODY_RADIUS * 0.6);
    pop();
  }
  pop();
}

function drawHysteresisChart() {
  const top = fieldHeight();
  const left = 46;
  const right = width - 18;
  const plotTop = top + 25;
  const plotBottom = height - 23;
  const droToX = (v) => map(v, DRO_MIN, DRO_MAX, left, right);
  const valueToY = (v) => map(constrain(v, 0, 1), 0, 1, plotBottom, plotTop);

  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_HEIGHT);
  stroke(71, 85, 105);
  strokeWeight(1);
  line(left, plotTop, left, plotBottom);
  line(left, plotBottom, right, plotBottom);

  const drawTrack = (track, key, col, dashed) => {
    if (track.length < 2) return;
    noFill();
    stroke(col);
    strokeWeight(2);
    if (dashed) drawingContext.setLineDash([5, 4]);
    beginShape();
    for (const point of track) vertex(droToX(point.dro), valueToY(point[key]));
    endShape();
    drawingContext.setLineDash([]);
  };
  drawTrack(upTrack, 'p', color(56, 189, 248), false);
  drawTrack(downTrack, 'p', color(56, 189, 248), true);
  drawTrack(upTrack, 'm', color(250, 204, 21), false);
  drawTrack(downTrack, 'm', color(250, 204, 21), true);

  // 目前 Δρ 的位置畫一條豎線，對得起上面的形狀。
  stroke(226, 232, 240, 90);
  strokeWeight(1);
  line(droToX(params.dro), plotTop, droToX(params.dro), plotBottom);

  noStroke();
  fill(148, 163, 184);
  textSize(11);
  textAlign(RIGHT, CENTER);
  text('1', left - 7, plotTop);
  text('0', left - 7, plotBottom);
  textAlign(LEFT, TOP);
  text('藍＝極化度　黃＝角動量　實線＝由小往大　虛線＝由大往小', left, top + 5);
  textAlign(LEFT, TOP);
  text('Δρ 0', left, plotBottom + 4);
  textAlign(RIGHT, TOP);
  text(`Δρ ${DRO_MAX}`, right, plotBottom + 4);
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
  const sweeping = sweepDir > 0 ? '（掃描中：由小往大）' : sweepDir < 0 ? '（掃描中：由大往小）' : '';
  const line1 = `形狀：${shapeLabel()}${sweeping}`;
  const line2 = `中圈寬度 Δρ = ${Number(params.dro).toFixed(1)}　極化度 ${polarization.toFixed(2)}　角動量 ${momentum.toFixed(2)}`;
  const hint = '黃色那隻畫出三圈：紅＝推開　藍＝跟著轉　灰＝往它靠';
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
  params.count = 120;
  params.dro = 12;
  params.noise = 0.06;
  params.turn = 0.13;
  params.blind = true;
  params.showZones = true;
  reset();
  clearTracks();
  if (pane) pane.refresh();
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  // 課文裡那四顆形狀按鈕要給出確定的結果，所以重新撒一次點再長。
  // 不重撒的話會撞上本課要講的遲滯：從高度平行按回 Δρ=12 不會變成環流。
  // 面板上的滑桿不走這裡，手動拖曳仍然看得到歷史效應。
  if (partial.dro !== undefined) { sweepDir = 0; reset(); }
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '集體記憶', container });
  pane.addBinding(params, 'count', { label: '個體數', min: COUNT_MIN, max: COUNT_MAX, step: 10 })
    .on('change', () => { reset(); clearTracks(); });
  pane.addBinding(params, 'dro', { label: '中圈寬度 Δρ', min: DRO_MIN, max: DRO_MAX, step: 1 })
    .on('change', () => { sweepDir = 0; });
  pane.addBinding(params, 'noise', { label: '轉向雜訊', min: NOISE_MIN, max: NOISE_MAX, step: 0.01 });
  pane.addBinding(params, 'turn', { label: '每幀最多轉', min: TURN_MIN, max: TURN_MAX, step: 0.01 });
  pane.addBinding(params, 'blind', { label: '身後有死角' });
  pane.addBinding(params, 'showZones', { label: '顯示三圈' });
  pane.addButton({ title: '由小往大掃 Δρ' }).on('click', () => startSweep(1));
  pane.addButton({ title: '由大往小掃 Δρ' }).on('click', () => startSweep(-1));
  pane.addButton({ title: '清掉曲線' }).on('click', clearTracks);
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
  stepSimulation();
  stepSweep();
  drawAgents();
  drawHysteresisChart();
  drawHUD();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
