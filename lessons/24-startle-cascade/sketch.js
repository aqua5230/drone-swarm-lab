// ============================================================
// 第 24 課 · 一隻嚇到，整群跟著跑（逃竄波）
//
// 一隻魚受驚彈開，旁邊的魚看到了，可能跟著彈，也可能沒反應。
// 「看到多少」用鄰居在視野中佔的角寬衡量——近而大的鄰居影響力遠大於遠的那隻。
// 每隻多帶起幾隻（R₀）決定這波是熄掉還是掃過全群。
// 傳染規則可切換成「距離門檻」當對照組，看兩種假設差在哪。
// 依 Rosenthal 等人 2015 對金體美鳊受驚連鎖的發現改寫。
// ============================================================

const params = {
  count: 200,
  sensitivity: 0.09,
  rule: 'visual',
  radius: 70,
  duration: 25,
  auto: true,
  showLinks: true,
};

// 下方 130px 放波及規模的分布長條圖。
const CHART_HEIGHT = 130;
// 魚的體長半徑，也是「視野佔多寬」的分子。
const BODY_RADIUS = 4;
// 分布圖切 10 格，每格 10 個百分點。
const BIN_COUNT = 10;
// 一波結束後停這麼多幀再開下一波，讓讀者看得到結果。
const TRIAL_GAP_FRAMES = 45;
// 巡游速度與受驚後的爆發速度；差三倍才看得出誰在逃。
const CRUISE_SPEED = 1.15;
const BURST_SPEED = 3.6;
// 對齊鄰居的半徑與力道：只要魚群不散開成均勻亂點就夠，不是本課重點。
const ALIGN_RADIUS = 46;
const ALIGN_WEIGHT = 0.12;
// 靠攏力道刻意壓很小：魚群要維持鬆散，密度才會不均勻，
// 「誰擋住誰」的差別才看得出來。太大會塌成一點，每一波都燒到全群。
const COHESION_WEIGHT = 0.0008;
// 看得到的最遠距離；超過這個距離的魚在視野裡只剩不到一度，算它只是浪費計算。
const VISION_RANGE = 260;
// 把一圈視野切成 360 格（一格一度）來記「哪裡已經被擋住了」。
const OCC_BINS = 360;
// 數人頭規則的換算分母，只為了讓兩種規則共用同一根靈敏度滑桿。
const METRIC_SCALE = 8;
// 巡游時的隨機轉向幅度（弧度）。
const WANDER = 0.08;
// 傳染連線只留這麼多幀，畫面才不會被舊線塞滿。
const LINK_LIFETIME = 40;
// 面板範圍
const COUNT_MIN = 40;
const COUNT_MAX = 400;
const SENSITIVITY_MIN = 0.005;
const SENSITIVITY_MAX = 0.3;
const RADIUS_MIN = 20;
const RADIUS_MAX = 200;
const DURATION_MIN = 8;
const DURATION_MAX = 60;

// 三種狀態：0 沒反應、1 正在逃、2 這一波已經逃過了
const NAIVE = 0;
const STARTLED = 1;
const SPENT = 2;

let fishes = [];
let links = [];
let pane = null;
let trialRunning = false;
let gapFrames = 0;
let lastSize = 0;
let secondWave = 0;
let trials = 0;
let sizeSum = 0;
let secondSum = 0;
let maxSize = 0;
let bins = new Array(BIN_COUNT).fill(0);
// 視野佔用表重複使用，避免每隻魚每一幀都配一個新陣列。
const occupancy = new Uint8Array(OCC_BINS);
let scratch = [];

class Fish {
  constructor(fieldW, fieldH) {
    this.x = random(fieldW);
    this.y = random(fieldH);
    this.angle = random(TWO_PI);
    this.state = NAIVE;
    this.timer = 0;
    this.gen = -1;
  }
}

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function fieldHeight() {
  return Math.max(1, height - CHART_HEIGHT);
}

function fishCount() {
  return constrain(Math.floor(Number(params.count) || COUNT_MIN), COUNT_MIN, COUNT_MAX);
}

function reset() {
  fishes = [];
  const n = fishCount();
  const fieldH = fieldHeight();
  for (let i = 0; i < n; i++) fishes.push(new Fish(width, fieldH));
  links = [];
  trialRunning = false;
  gapFrames = TRIAL_GAP_FRAMES;
  lastSize = 0;
  secondWave = 0;
}

function clearStats() {
  trials = 0;
  sizeSum = 0;
  secondSum = 0;
  maxSize = 0;
  bins = new Array(BIN_COUNT).fill(0);
}

// 把所有魚退回沒反應，再挑一隻當起點。
function startTrial() {
  for (const fish of fishes) {
    fish.state = NAIVE;
    fish.timer = 0;
    fish.gen = -1;
  }
  links = [];
  const seed = fishes[Math.floor(random(fishes.length))];
  seed.state = STARTLED;
  seed.timer = Math.round(params.duration);
  seed.gen = 0;
  trialRunning = true;
  lastSize = 0;
  secondWave = 0;
}

// visual 規則：受驚的魚佔了我視野的幾分之幾。
// 由近而遠掃過所有鄰居，近的先把視野格子佔掉——被擋住的遠魚就完全不算數。
// 這是本課的重點：影響力來自「在我眼裡有多大」，不是「離我幾公尺」。
function visualShareStartled(self) {
  scratch.length = 0;
  for (const other of fishes) {
    if (other === self) continue;
    const dx = other.x - self.x;
    const dy = other.y - self.y;
    const d = Math.hypot(dx, dy);
    if (d > VISION_RANGE) continue;
    scratch.push({
      d,
      angle: Math.atan2(dy, dx),
      // 距離趨近 0 時角寬會爆掉，夾一個下限擋住除以零與無限大。
      half: Math.atan(BODY_RADIUS / Math.max(d, BODY_RADIUS)),
      startled: other.state === STARTLED,
    });
  }
  if (scratch.length === 0) return 0;
  scratch.sort((a, b) => a.d - b.d);

  occupancy.fill(0);
  let startledBins = 0;
  for (const item of scratch) {
    const from = Math.floor((item.angle - item.half) / TWO_PI * OCC_BINS);
    const to = Math.ceil((item.angle + item.half) / TWO_PI * OCC_BINS);
    for (let b = from; b < to; b++) {
      const idx = ((b % OCC_BINS) + OCC_BINS) % OCC_BINS;
      if (occupancy[idx]) continue;      // 這一格已經被更近的魚擋掉了
      occupancy[idx] = 1;
      if (item.startled) startledBins++;
    }
  }
  return startledBins / OCC_BINS;
}

// metric 規則（對照組）：半徑內正在逃的有幾隻，不管誰擋住誰、也不管遠近。
// 除以 METRIC_SCALE 只是把它挪到跟視野佔比差不多的尺度，好共用同一個靈敏度滑桿。
// 注意它沒有上限：魚一多，這個數字就跟著漲——這正是它跟視野規則分道揚鑣的地方。
function metricShareStartled(self) {
  let startled = 0;
  for (const other of fishes) {
    if (other === self) continue;
    if (other.state !== STARTLED) continue;
    if (Math.hypot(other.x - self.x, other.y - self.y) > params.radius) continue;
    startled++;
  }
  return startled / METRIC_SCALE;
}

function startledShare(self) {
  return params.rule === 'metric' ? metricShareStartled(self) : visualShareStartled(self);
}

// 誰把我帶起來的：取視野裡最大的那一隻受驚鄰居，用來畫傳染連線與數代數。
function strongestStartled(self) {
  let best = null;
  let bestScore = -1;
  for (const other of fishes) {
    if (other.state !== STARTLED) continue;
    const d = Math.hypot(other.x - self.x, other.y - self.y);
    const score = 1 / Math.max(d, BODY_RADIUS);
    if (score > bestScore) { bestScore = score; best = other; }
  }
  return best;
}

function stepCascade() {
  if (!trialRunning) return;
  const sensitivity = Math.max(0, Number(params.sensitivity) || 0);
  const duration = Math.round(constrain(Number(params.duration) || DURATION_MIN,
    DURATION_MIN, DURATION_MAX));

  // 先算出這一幀誰會被帶起來，算完再一起改狀態；
  // 否則陣列前面剛被點燃的魚會在同一幀去影響後面的魚。
  // 沒有魚在逃就沒有東西要傳，跳過整段昂貴的視野計算。
  let anyStartled = false;
  for (const fish of fishes) if (fish.state === STARTLED) { anyStartled = true; break; }

  const ignitions = [];
  if (anyStartled) {
    for (const fish of fishes) {
      if (fish.state !== NAIVE) continue;
      const share = startledShare(fish);
      if (share <= 0) continue;
      // 佔比轉成這一幀反應的機率：佔得越大越可能反應，但永遠不會超過 1。
      const p = 1 - Math.exp(-sensitivity * share);
      if (random() < p) ignitions.push({ fish, trigger: strongestStartled(fish) });
    }
  }

  for (const { fish, trigger } of ignitions) {
    fish.state = STARTLED;
    fish.timer = duration;
    fish.gen = trigger ? trigger.gen + 1 : 1;
    // 背對帶起它的那隻逃開。
    if (trigger) fish.angle = Math.atan2(fish.y - trigger.y, fish.x - trigger.x);
    if (fish.gen === 1) secondWave++;
    links.push({ ax: trigger ? trigger.x : fish.x, ay: trigger ? trigger.y : fish.y,
      bx: fish.x, by: fish.y, life: LINK_LIFETIME });
  }

  let stillStartled = 0;
  for (const fish of fishes) {
    if (fish.state !== STARTLED) continue;
    fish.timer--;
    if (fish.timer <= 0) fish.state = SPENT;
    else stillStartled++;
  }

  if (stillStartled === 0) {
    let responded = 0;
    for (const fish of fishes) if (fish.state !== NAIVE) responded++;
    lastSize = responded / fishes.length;
    trials++;
    sizeSum += lastSize;
    secondSum += secondWave;
    maxSize = Math.max(maxSize, lastSize);
    // 100% 要落在最後一格，不能因為 index 剛好等於格數而掉出陣列。
    bins[Math.min(BIN_COUNT - 1, Math.floor(lastSize * BIN_COUNT))]++;
    trialRunning = false;
    gapFrames = TRIAL_GAP_FRAMES;
  }
}

function stepMotion() {
  const fieldW = width;
  const fieldH = fieldHeight();
  let cx = 0;
  let cy = 0;
  for (const fish of fishes) { cx += fish.x; cy += fish.y; }
  cx /= fishes.length;
  cy /= fishes.length;

  for (const fish of fishes) {
    if (fish.state === STARTLED) {
      // 逃跑時不理會鄰居，直線衝出去。
      fish.x += Math.cos(fish.angle) * BURST_SPEED;
      fish.y += Math.sin(fish.angle) * BURST_SPEED;
    } else {
      let sx = 0;
      let sy = 0;
      for (const other of fishes) {
        if (other === fish) continue;
        if (Math.hypot(other.x - fish.x, other.y - fish.y) > ALIGN_RADIUS) continue;
        sx += Math.cos(other.angle);
        sy += Math.sin(other.angle);
      }
      if (sx !== 0 || sy !== 0) {
        const target = Math.atan2(sy, sx);
        fish.angle += Math.atan2(Math.sin(target - fish.angle),
          Math.cos(target - fish.angle)) * ALIGN_WEIGHT;
      }
      const toCenter = Math.atan2(cy - fish.y, cx - fish.x);
      fish.angle += Math.atan2(Math.sin(toCenter - fish.angle),
        Math.cos(toCenter - fish.angle)) * COHESION_WEIGHT * 20;
      fish.angle += random(-WANDER, WANDER);
      fish.x += Math.cos(fish.angle) * CRUISE_SPEED;
      fish.y += Math.sin(fish.angle) * CRUISE_SPEED;
    }

    // 環繞邊界：魚群不會被牆擠成一條線，密度分布才維持得住。
    if (fish.x < 0) fish.x += fieldW;
    if (fish.x > fieldW) fish.x -= fieldW;
    if (fish.y < 0) fish.y += fieldH;
    if (fish.y > fieldH) fish.y -= fieldH;
  }
}

function stepSimulation() {
  stepMotion();
  stepCascade();
  if (!trialRunning) {
    gapFrames--;
    if (gapFrames <= 0 && params.auto) startTrial();
  }
  for (const link of links) link.life--;
  links = links.filter((link) => link.life > 0);
}

function drawLinks() {
  if (!params.showLinks) return;
  strokeWeight(1);
  for (const link of links) {
    stroke(250, 204, 21, 150 * link.life / LINK_LIFETIME);
    line(link.ax, link.ay, link.bx, link.by);
  }
}

function drawFishes() {
  noStroke();
  for (const fish of fishes) {
    if (fish.state === STARTLED) fill(248, 113, 113);
    else if (fish.state === SPENT) fill(250, 204, 21, 150);
    else fill(148, 163, 184, 190);
    push();
    translate(fish.x, fish.y);
    rotate(fish.angle);
    triangle(BODY_RADIUS, 0, -BODY_RADIUS, BODY_RADIUS * 0.6, -BODY_RADIUS, -BODY_RADIUS * 0.6);
    pop();
  }
}

function drawHistogram() {
  const top = fieldHeight();
  const left = 42;
  const right = width - 18;
  const graphTop = top + 25;
  const graphBottom = height - 23;

  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_HEIGHT);
  stroke(71, 85, 105);
  strokeWeight(1);
  line(left, graphTop, left, graphBottom);
  line(left, graphBottom, right, graphBottom);

  const peak = Math.max(1, ...bins);
  const slot = (right - left) / BIN_COUNT;
  noStroke();
  for (let i = 0; i < BIN_COUNT; i++) {
    const h = (graphBottom - graphTop) * bins[i] / peak;
    // 最後一格（波及九成以上）標成紅色，一眼看到「整群都跑了」出現幾次。
    fill(i === BIN_COUNT - 1 ? color(248, 113, 113) : color(56, 189, 248));
    rect(left + i * slot + 2, graphBottom - h, slot - 4, h);
  }

  fill(148, 163, 184);
  textSize(11);
  textAlign(RIGHT, CENTER);
  text(peak, left - 7, graphTop);
  text('0', left - 7, graphBottom);
  textAlign(LEFT, TOP);
  text(`每一波波及全群的比例，分成十格（已跑 ${trials} 波）`, left, top + 5);
  textAlign(LEFT, TOP);
  text('0%', left, graphBottom + 4);
  textAlign(RIGHT, TOP);
  text('100%', right, graphBottom + 4);
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
  const avg = trials > 0 ? sizeSum / trials : 0;
  const r0 = trials > 0 ? secondSum / trials : 0;
  const ruleLabel = params.rule === 'visual' ? '視野佔多寬' : '距離門檻';
  const line1 = `規則：${ruleLabel}　這一波波及 ${(lastSize * 100).toFixed(0)}%　最大一波 ${(maxSize * 100).toFixed(0)}%`;
  const line2 = `已跑 ${trials} 波　平均波及 ${(avg * 100).toFixed(0)}%　第一隻平均帶起 ${r0.toFixed(2)} 隻（≈R₀）`;
  const hint = '紅＝正在逃　黃＝這波逃過了　黃線＝誰把誰帶起來的';
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
  params.count = 200;
  params.sensitivity = 0.09;
  params.rule = 'visual';
  params.radius = 70;
  params.duration = 25;
  params.auto = true;
  params.showLinks = true;
  reset();
  clearStats();
  if (pane) pane.refresh();
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  // 換了規則或靈敏度，舊的統計已經不是同一個實驗，必須歸零重數。
  if (partial.rule !== undefined || partial.sensitivity !== undefined
    || partial.radius !== undefined || partial.count !== undefined) clearStats();
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '逃竄波', container });
  pane.addBinding(params, 'count', { label: '魚數', min: COUNT_MIN, max: COUNT_MAX, step: 10 })
    .on('change', () => { reset(); clearStats(); });
  pane.addBinding(params, 'rule', {
    label: '傳染規則',
    options: { '視野佔多寬': 'visual', '距離門檻': 'metric' },
  }).on('change', clearStats);
  pane.addBinding(params, 'sensitivity', { label: '靈敏度', min: SENSITIVITY_MIN, max: SENSITIVITY_MAX, step: 0.005 })
    .on('change', clearStats);
  pane.addBinding(params, 'radius', { label: '距離門檻半徑', min: RADIUS_MIN, max: RADIUS_MAX, step: 5 })
    .on('change', clearStats);
  pane.addBinding(params, 'duration', { label: '逃跑持續幀數', min: DURATION_MIN, max: DURATION_MAX, step: 1 })
    .on('change', clearStats);
  pane.addBinding(params, 'auto', { label: '自動一波接一波' });
  pane.addBinding(params, 'showLinks', { label: '顯示傳染連線' });
  pane.addButton({ title: '手動嚇一隻' }).on('click', () => { if (!trialRunning) startTrial(); });
  pane.addButton({ title: '統計歸零' }).on('click', clearStats);
  pane.addButton({ title: '重置' }).on('click', resetDefaults);
}

function setup() {
  SwarmLink.init(params);            // 一定要在 reset() 與面板之前讀網址參數
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  clearStats();
  createControls();
}

function draw() {
  background(15, 23, 42);
  stepSimulation();
  drawLinks();
  drawFishes();
  drawHistogram();
  drawHUD();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  // 場地變了，密度跟著變，統計不能跨尺寸累加，一併歸零。
  reset();
  clearStats();
}
