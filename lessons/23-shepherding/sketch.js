// ============================================================
// 第 23 課 · 一隻怎麼推得動一群（牧羊問題）
//
// 牧羊犬只有兩條規則，靠一個條件切換：
//   羊群散了（最遠的羊離群心超過門檻）→ 繞到那隻羊後面，把它推回群裡（收攏）
//   羊群夠緊     → 繞到群心後面，整團往目標推（驅趕）
// 羊只會做三件事：躲開太近的同伴、往最近的幾隻靠、看到牧羊犬就跑。
// 模型依 Strömbom 等人 2014 的啟發式規則改寫成像素座標。
// ============================================================

const params = {
  count: 40,
  detect: 130,
  collect: true,
  neighbors: 20,
  noise: 0.3,
  dogSpeed: 2.4,
  showTargets: true,
};

// 下方 130px 留給「羊群散開程度」的曲線，和第 16、22 課一致。
const CHART_HEIGHT = 130;
// 曲線留 400 個點，約六秒 60fps，足夠看出收攏與驅趕的來回切換。
const HISTORY_LENGTH = 400;
// ra：羊與羊之間「太近了」的距離，同時是整個模型的長度單位。
const AGENT_RADIUS = 8;
// 羊的排斥力道；論文取值使它明顯強過靠攏，羊群才不會疊成一點。
const REPULSION_WEIGHT = 2.0;
// 往鄰居重心靠的力道，略大於 1 讓羊群持續收緊而不是剛好平衡。
const COHESION_WEIGHT = 1.05;
// 躲牧羊犬的力道；與排斥同量級，被逼近時才會壓過靠攏。
const DOG_REPULSION_WEIGHT = 1.0;
// 慣性：保留上一步方向的比例，讓軌跡連續、不會逐幀抖動。
const INERTIA = 0.5;
// 羊每幀走的像素數；牧羊犬要更快才追得上，速度比由面板控制。
const SHEEP_SPEED = 1.55;
// 沒看到牧羊犬時，羊只是低頭吃草：每幀有這個機率隨機挪一小步。
const GRAZE_CHANCE = 0.05;
const GRAZE_STEP = 0.45;
// 牧羊犬靠得比這更近會把羊嚇散，所以它在這個距離內就停下來等。
const DOG_SAFE_DISTANCE = AGENT_RADIUS * 3;
// 羊圈半徑：全部羊進圈就算完成。
const PEN_RADIUS = 62;
// 羊圈放在左上角，羊群初始撒在右下，牧羊犬得把整團推過整個場地。
const PEN_X_RATIO = 0.14;
const PEN_Y_RATIO = 0.24;
// 視覺尺寸
const SHEEP_RADIUS = 3.5;
const DOG_RADIUS = 6;
const TARGET_MARK_RADIUS = 7;
// 面板範圍：羊數上限 200 讓「數量一多這套啟發式就失效」可以被親眼看到。
const COUNT_MIN = 10;
const COUNT_MAX = 200;
const DETECT_MIN = 20;
const DETECT_MAX = 300;
const NEIGHBORS_MIN = 2;
const NEIGHBORS_MAX = 100;
const NOISE_MIN = 0;
const NOISE_MAX = 1.2;
const DOG_SPEED_MIN = 1.6;
const DOG_SPEED_MAX = 5;

let sheep = [];
let dog = { x: 0, y: 0 };
let pen = { x: 0, y: 0 };
let dogTarget = { x: 0, y: 0 };
let mode = 'drive';
let spread = 0;
let threshold = 0;
let history = [];
let elapsed = 0;
let finished = false;
let pane = null;

class Sheep {
  constructor(fieldW, fieldH) {
    // 全部撒在右下角：與左上的羊圈隔開，才有得推。
    this.x = random(fieldW * 0.55, fieldW * 0.94);
    this.y = random(fieldH * 0.45, fieldH * 0.92);
    this.dx = 0;
    this.dy = 0;
  }
}

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function fieldHeight() {
  return Math.max(1, height - CHART_HEIGHT);
}

function sheepCount() {
  return constrain(Math.floor(Number(params.count) || COUNT_MIN), COUNT_MIN, COUNT_MAX);
}

// 論文的門檻：羊群半徑超過 ra·N^(2/3) 就判定「散了」，先收攏再說。
function collectThreshold(n) {
  return AGENT_RADIUS * Math.pow(n, 2 / 3);
}

// 驅趕時牧羊犬站的位置：群心後方 ra·√N，羊愈多要站愈遠才推得動整團。
function driveOffset(n) {
  return AGENT_RADIUS * Math.sqrt(n);
}

function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  // 長度為 0 時回傳零向量，避免除以零產生 NaN 汙染整群座標。
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: vx / len, y: vy / len };
}

function reset() {
  const fieldW = width;
  const fieldH = fieldHeight();
  pen = { x: fieldW * PEN_X_RATIO, y: fieldH * PEN_Y_RATIO };
  sheep = [];
  const n = sheepCount();
  for (let i = 0; i < n; i++) sheep.push(new Sheep(fieldW, fieldH));
  // 牧羊犬從右下角出發，一開始就在羊群外側。
  dog = { x: fieldW * 0.96, y: fieldH * 0.96 };
  dogTarget = { x: dog.x, y: dog.y };
  threshold = collectThreshold(n);
  spread = 0;
  history = [];
  elapsed = 0;
  finished = false;
}

function flockCenter() {
  let sx = 0;
  let sy = 0;
  for (const s of sheep) { sx += s.x; sy += s.y; }
  return { x: sx / sheep.length, y: sy / sheep.length };
}

// 離群心最遠的那一隻，就是收攏模式要去追的目標。
function furthestSheep(center) {
  let best = sheep[0];
  let bestDist = -1;
  for (const s of sheep) {
    const d = Math.hypot(s.x - center.x, s.y - center.y);
    if (d > bestDist) { bestDist = d; best = s; }
  }
  return { sheep: best, dist: bestDist };
}

// 每隻羊往「最近的 n 隻的重心」靠；n 小於全群時要先排序取前 n 個。
function localCenter(self, n) {
  const others = [];
  for (const s of sheep) {
    if (s === self) continue;
    others.push({ s, d: Math.hypot(s.x - self.x, s.y - self.y) });
  }
  if (others.length === 0) return { x: self.x, y: self.y };
  others.sort((a, b) => a.d - b.d);
  const take = Math.min(n, others.length);
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < take; i++) { sx += others[i].s.x; sy += others[i].s.y; }
  return { x: sx / take, y: sy / take };
}

function stepDog(center, furthest) {
  const n = sheep.length;
  threshold = collectThreshold(n);
  spread = furthest.dist;

  if (params.collect && spread > threshold) {
    mode = 'collect';
    // 站到「群心 → 最遠那隻」延長線上、比那隻羊再外面一個身位的位置。
    const away = normalize(furthest.sheep.x - center.x, furthest.sheep.y - center.y);
    dogTarget = {
      x: furthest.sheep.x + away.x * AGENT_RADIUS,
      y: furthest.sheep.y + away.y * AGENT_RADIUS,
    };
  } else {
    mode = 'drive';
    // 站到「羊圈 → 群心」延長線上，整團才會被推向羊圈。
    const behind = normalize(center.x - pen.x, center.y - pen.y);
    const offset = driveOffset(n);
    dogTarget = { x: center.x + behind.x * offset, y: center.y + behind.y * offset };
  }

  // 靠太近會把羊炸散，所以身邊有羊時牧羊犬原地不動，等羊自己走開。
  let nearest = Infinity;
  for (const s of sheep) nearest = Math.min(nearest, Math.hypot(s.x - dog.x, s.y - dog.y));
  if (nearest < DOG_SAFE_DISTANCE) return;

  const step = normalize(dogTarget.x - dog.x, dogTarget.y - dog.y);
  const speed = Math.max(DOG_SPEED_MIN, Number(params.dogSpeed) || DOG_SPEED_MIN);
  dog.x = constrain(dog.x + step.x * speed, 0, width);
  dog.y = constrain(dog.y + step.y * speed, 0, fieldHeight());
}

function stepSheep() {
  const fieldW = width;
  const fieldH = fieldHeight();
  const detect = Math.max(0, Number(params.detect) || 0);
  const neighbors = constrain(Math.floor(Number(params.neighbors) || NEIGHBORS_MIN),
    NEIGHBORS_MIN, NEIGHBORS_MAX);

  for (const s of sheep) {
    const dogDist = Math.hypot(s.x - dog.x, s.y - dog.y);
    if (dogDist > detect) {
      // 看不到牧羊犬的羊只是吃草，偶爾隨機挪一步。
      if (random() < GRAZE_CHANCE) {
        const jitter = p5.Vector.random2D();
        s.x = constrain(s.x + jitter.x * GRAZE_STEP, 0, fieldW);
        s.y = constrain(s.y + jitter.y * GRAZE_STEP, 0, fieldH);
      }
      s.dx *= INERTIA;
      s.dy *= INERTIA;
      continue;
    }

    // 一、躲開所有太近的同伴（距離小於 ra）。
    let repelX = 0;
    let repelY = 0;
    for (const other of sheep) {
      if (other === s) continue;
      const dx = s.x - other.x;
      const dy = s.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d < AGENT_RADIUS && d > 1e-9) {
        repelX += dx / d;
        repelY += dy / d;
      }
    }
    const repel = normalize(repelX, repelY);

    // 二、往最近的幾隻的重心靠。
    const lcm = localCenter(s, neighbors);
    const cohere = normalize(lcm.x - s.x, lcm.y - s.y);

    // 三、背對牧羊犬跑。
    const flee = normalize(s.x - dog.x, s.y - dog.y);

    const jitter = p5.Vector.random2D();
    const noise = Math.max(0, Number(params.noise) || 0);
    let vx = INERTIA * s.dx
      + COHESION_WEIGHT * cohere.x
      + REPULSION_WEIGHT * repel.x
      + DOG_REPULSION_WEIGHT * flee.x
      + noise * jitter.x;
    let vy = INERTIA * s.dy
      + COHESION_WEIGHT * cohere.y
      + REPULSION_WEIGHT * repel.y
      + DOG_REPULSION_WEIGHT * flee.y
      + noise * jitter.y;

    const dir = normalize(vx, vy);
    s.dx = dir.x;
    s.dy = dir.y;
    s.x = constrain(s.x + dir.x * SHEEP_SPEED, 0, fieldW);
    s.y = constrain(s.y + dir.y * SHEEP_SPEED, 0, fieldH);
  }
}

function pennedCount() {
  let inside = 0;
  for (const s of sheep) {
    if (Math.hypot(s.x - pen.x, s.y - pen.y) <= PEN_RADIUS) inside++;
  }
  return inside;
}

function stepSimulation() {
  if (finished) return;
  const center = flockCenter();
  const furthest = furthestSheep(center);
  stepDog(center, furthest);
  stepSheep();
  elapsed++;
  history.push(spread);
  if (history.length > HISTORY_LENGTH) history.shift();
  if (pennedCount() === sheep.length) finished = true;
}

function drawPen() {
  noFill();
  stroke(74, 222, 128, 180);
  strokeWeight(2);
  drawingContext.setLineDash([6, 6]);
  circle(pen.x, pen.y, PEN_RADIUS * 2);
  drawingContext.setLineDash([]);
  noStroke();
  fill(74, 222, 128);
  textSize(11);
  textAlign(CENTER, BOTTOM);
  text('羊圈', pen.x, pen.y - PEN_RADIUS - 6);
}

function drawSheep() {
  noStroke();
  for (const s of sheep) {
    const alarmed = Math.hypot(s.x - dog.x, s.y - dog.y) <= params.detect;
    // 看得到牧羊犬的羊染成天藍，看不到的維持灰白——一眼看出感測半徑掃到誰。
    if (alarmed) fill(56, 189, 248);
    else fill(203, 213, 225, 170);
    circle(s.x, s.y, SHEEP_RADIUS * 2);
  }
}

function drawDog() {
  if (params.showTargets) {
    stroke(248, 113, 113, 120);
    strokeWeight(1);
    drawingContext.setLineDash([3, 4]);
    line(dog.x, dog.y, dogTarget.x, dogTarget.y);
    drawingContext.setLineDash([]);
    noFill();
    stroke(248, 113, 113, 160);
    circle(dogTarget.x, dogTarget.y, TARGET_MARK_RADIUS * 2);
  }
  // 感測半徑畫成一圈淡線：羊只在這圈內才會躲。
  noFill();
  stroke(248, 113, 113, 60);
  strokeWeight(1);
  circle(dog.x, dog.y, params.detect * 2);
  noStroke();
  fill(248, 113, 113);
  circle(dog.x, dog.y, DOG_RADIUS * 2);
}

function drawSpreadChart() {
  const top = fieldHeight();
  const left = 42;
  const right = width - 18;
  const graphTop = top + 25;
  const graphBottom = height - 23;
  // 縱軸上限跟著門檻走，換羊數時曲線不會超出格子。
  const axisMax = Math.max(threshold * 2.2, 120);
  const valueToY = (value) => map(constrain(value, 0, axisMax), 0, axisMax, graphBottom, graphTop);

  noStroke();
  fill(15, 23, 42);
  rect(0, top, width, CHART_HEIGHT);
  stroke(71, 85, 105);
  strokeWeight(1);
  line(left, graphTop, left, graphBottom);
  line(left, graphBottom, right, graphBottom);
  drawingContext.setLineDash([4, 4]);
  stroke(148, 163, 184, 150);
  line(left, valueToY(threshold), right, valueToY(threshold));
  drawingContext.setLineDash([]);

  noStroke();
  fill(148, 163, 184);
  textSize(11);
  textAlign(RIGHT, CENTER);
  text(Math.round(axisMax), left - 7, graphTop);
  text('0', left - 7, graphBottom);
  textAlign(LEFT, TOP);
  text('最遠的羊離群心多遠（虛線＝切換門檻，在線上＝收攏）', left, top + 5);
  textAlign(RIGHT, TOP);
  text('時間 →', right, graphBottom + 4);

  if (history.length > 1) {
    noFill();
    stroke(56, 189, 248);
    strokeWeight(2);
    beginShape();
    const span = Math.max(1, history.length - 1);
    for (let i = 0; i < history.length; i++) {
      vertex(map(i, 0, span, left, right), valueToY(history[i]));
    }
    endShape();
  }
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
  const modeLabel = params.collect ? (mode === 'collect' ? '收攏' : '驅趕') : '驅趕（收攏已關）';
  const line1 = finished
    ? `全部進圈　用了 ${(elapsed / 60).toFixed(1)} 秒`
    : `模式：${modeLabel}　進圈 ${pennedCount()}／${sheep.length}　${(elapsed / 60).toFixed(1)} 秒`;
  const line2 = `羊群半徑 ${spread.toFixed(0)} px　切換門檻 ${threshold.toFixed(0)} px`;
  const hint = '紅點＝牧羊犬，虛線指向它現在要去站的位置；藍羊＝感測得到牧羊犬';
  noStroke();
  textAlign(LEFT, TOP);
  fill(finished ? color(74, 222, 128) : color(226, 232, 240));
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
  params.detect = 130;
  params.collect = true;
  params.neighbors = 20;
  params.noise = 0.3;
  params.dogSpeed = 2.4;
  params.showTargets = true;
  reset();
  if (pane) pane.refresh();
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  // 本課每顆按鈕都是「換一個設定重跑一場」，不是中途改參數。
  // 而且趕完之後 finished 會停住模擬，不重來的話按了等於沒反應。
  reset();
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '牧羊問題', container });
  pane.addBinding(params, 'count', { label: '羊數', min: COUNT_MIN, max: COUNT_MAX, step: 5 }).on('change', reset);
  pane.addBinding(params, 'detect', { label: '羊看得到多遠', min: DETECT_MIN, max: DETECT_MAX, step: 5 });
  pane.addBinding(params, 'collect', { label: '開啟收攏' });
  pane.addBinding(params, 'neighbors', { label: '往幾隻靠', min: NEIGHBORS_MIN, max: NEIGHBORS_MAX, step: 1 });
  pane.addBinding(params, 'noise', { label: '羊的雜訊', min: NOISE_MIN, max: NOISE_MAX, step: 0.05 });
  pane.addBinding(params, 'dogSpeed', { label: '牧羊犬速度', min: DOG_SPEED_MIN, max: DOG_SPEED_MAX, step: 0.1 });
  pane.addBinding(params, 'showTargets', { label: '顯示牧羊犬的站位' });
  pane.addButton({ title: '重新放羊' }).on('click', reset);
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
  drawPen();
  stepSimulation();
  drawSheep();
  drawDog();
  drawSpreadChart();
  drawHUD();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  // 場地尺寸變了，羊圈與座標都要重算，直接重開一場最安全。
  reset();
}
