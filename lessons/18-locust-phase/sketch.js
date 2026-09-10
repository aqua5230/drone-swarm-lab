// ============================================================
// 第 18 課 · 蝗蟲的密度相變
//
// 每隻若蟲只能在甜甜圈形的環道上走，方向只有逆時針或順時針。
// 牠聽附近同伴的方向，再混進一點雜訊。稀疏時各走各的；密度夠高，
// 局部意見會滾成全群同向行軍。下方曲線記下這個有號秩序參數的翻轉。
// ============================================================

const params = {
  count: 60,
  radius: 34,
  noise: 2.2,
  speed: 1.4,
  ringWidth: 0.42,
  showSeries: true,
};

const SERIES_HEIGHT = 140;
const SERIES_LEN = 900;

let locusts = [];
let pane = null;
let phi = 0;
let series = [];
let flipMarks = [];
let flipCount = 0;
let armedSign = 0;
let lastPhiSign = 0;

class Locust {
  constructor() {
    this.angle = random(TWO_PI);
    this.radial = 0;
    this.radialSpeed = random(-0.25, 0.25);
    // u 是連續的繞行速度，−1（順時針全速）到 +1（逆時針全速）。
    // 用連續值而不是二元方向，是這一課的關鍵：二元方向一旦全群一致就再也翻不回來，
    // 群體層級的自發翻轉需要「整體平均可以慢慢漂過零點」這條路。
    this.u = random(-1, 1);
    this.x = 0;
    this.y = 0;
  }

  place(ring) {
    if (this.radial === 0) this.radial = random(ring.inner + ring.inset, ring.outer - ring.inset);
    this.radial = constrain(this.radial, ring.inner + ring.inset, ring.outer - ring.inset);
    this.x = ring.cx + Math.cos(this.angle) * this.radial;
    this.y = ring.cy + Math.sin(this.angle) * this.radial;
  }

  move(ring) {
    // 螢幕 y 軸向下，所以逆時針是角度減少。
    // 走多快由 u 決定：猶豫不決的（u 接近 0）幾乎站著不動，這也是真實若蟲的樣子。
    this.angle -= this.u * params.speed / Math.max(this.radial, 1);
    this.radialSpeed += randomGaussian(0, 0.035);
    this.radialSpeed += (ring.middle - this.radial) * 0.018;
    this.radialSpeed *= 0.88;
    this.radial += this.radialSpeed;
    this.radial = constrain(this.radial, ring.inner + ring.inset, ring.outer - ring.inset);
    this.place(ring);
  }
}

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 540 };
}

function ringGeometry() {
  const fieldHeight = height - SERIES_HEIGHT;
  const outer = Math.max(12, Math.min(width - 36, fieldHeight - 28) / 2);
  const inner = outer * constrain(params.ringWidth, 0, 0.98);
  return {
    cx: width / 2,
    cy: fieldHeight / 2,
    outer,
    inner,
    inset: Math.max(0.5, Math.min(6, (outer - inner) / 3)),
    middle: (outer + inner) / 2,
  };
}

function reset() {
  locusts = [];
  const count = Math.max(0, Math.floor(params.count));
  for (let i = 0; i < count; i++) locusts.push(new Locust());
  series = [];
  flipMarks = [];
  flipCount = 0;
  armedSign = 0;
  lastPhiSign = 0;
  measurePhi();
}

function addTwenty() {
  const target = Math.min(400, Math.max(0, Math.floor(params.count)) + 20);
  for (let i = locusts.length; i < target; i++) locusts.push(new Locust());
  params.count = target;
  if (pane) pane.refresh();
}

// 所有方向同一輪一起更新，避免陣列前面的個體先影響後面的個體。
function chooseDirections() {
  const r2 = params.radius * params.radius;
  const next = new Array(locusts.length);
  for (let i = 0; i < locusts.length; i++) {
    const me = locusts[i];
    let sum = 0;
    let heard = 0;
    for (let j = 0; j < locusts.length; j++) {
      if (i === j) continue;
      const other = locusts[j];
      const dx = other.x - me.x;
      const dy = other.y - me.y;
      if (dx * dx + dy * dy <= r2) {
        sum += other.u;
        heard++;
      }
    }
    // Czirók 一維自驅粒子規則（Buhl 論文的模型就是這一支）：
    // u(t+1) = G(鄰居平均) + 雜訊，其中 G(u) = (u + sign(u)) / 2 把速度往 ±1 推，
    // 雜訊則是均勻分布在 [−η/2, +η/2]。兩股力氣誰贏，就決定整群整不整齊。
    const mean = (sum + me.u) / (heard + 1);
    const pushed = (mean + Math.sign(mean || (me.u || 1))) / 2;
    next[i] = constrain(pushed + random(-params.noise / 2, params.noise / 2), -1, 1);
  }
  for (let i = 0; i < locusts.length; i++) locusts[i].u = next[i];
}

function measurePhi() {
  if (locusts.length === 0) {
    phi = 0;
    return;
  }
  let sum = 0;
  for (const locust of locusts) sum += locust.u;
  // u = -1 是順時針，因此要反號才是題目定義的 phi（順時針為正）。
  phi = -sum / locusts.length;
}

function recordPhi() {
  const sign = phi > 0 ? 1 : phi < 0 ? -1 : 0;
  let flipped = false;
  if (Math.abs(phi) > 0.5) armedSign = sign;
  if (armedSign && sign && sign !== armedSign && sign !== lastPhiSign) {
    flipCount++;
    flipped = true;
    armedSign = 0;
  }
  if (sign) lastPhiSign = sign;
  series.push(phi);
  flipMarks.push(flipped);
  if (series.length > SERIES_LEN) {
    series.shift();
    flipMarks.shift();
  }
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  if (pane) pane.refresh();
};

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '密度相變', container });
  pane.addBinding(params, 'count', { label: '個體數', min: 5, max: 400, step: 5 }).on('change', reset);
  pane.addBinding(params, 'radius', { label: '互動半徑', min: 8, max: 120, step: 2 });
  pane.addBinding(params, 'noise', { label: '雜訊', min: 0, max: 3, step: 0.05 });
  pane.addBinding(params, 'speed', { label: '速度', min: 0.3, max: 3, step: 0.1 });
  pane.addBinding(params, 'ringWidth', { label: '內圈比例', min: 0.1, max: 0.8, step: 0.02 });
  pane.addBinding(params, 'showSeries', { label: '顯示時間序列' });
  pane.addButton({ title: '一次加 20 隻' }).on('click', addTwenty);
  pane.addButton({ title: '重置' }).on('click', reset);
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function drawRing(ring) {
  noStroke();
  fill(30, 41, 59);
  circle(ring.cx, ring.cy, ring.outer * 2);
  fill(15, 23, 42);
  circle(ring.cx, ring.cy, ring.inner * 2);
  noFill();
  stroke(71, 85, 105);
  strokeWeight(2);
  circle(ring.cx, ring.cy, ring.outer * 2);
  circle(ring.cx, ring.cy, ring.inner * 2);
}

function drawLocust(locust) {
  const heading = locust.angle - Math.sign(locust.u || 1) * HALF_PI;
  push();
  translate(locust.x, locust.y);
  rotate(heading);
  noStroke();
  // 顏色＝往哪邊繞；越透明代表越猶豫（|u| 越小、走得越慢）
  const commitment = constrain(Math.abs(locust.u), 0, 1);
  const body = locust.u >= 0 ? color(56, 189, 248) : color(251, 146, 60);
  body.setAlpha(90 + 165 * commitment);
  fill(body);
  triangle(7, 0, -5, -4, -5, 4);
  pop();
}

function drawSeries() {
  const top = height - SERIES_HEIGHT;
  const bottom = height - 20;
  const left = 42;
  const right = width - 16;
  const valueToY = (value) => map(value, -1, 1, bottom, top + 18);
  noStroke();
  fill(15, 23, 42, 235);
  rect(0, top, width, SERIES_HEIGHT);
  stroke(71, 85, 105);
  strokeWeight(1);
  line(left, top + 18, left, bottom);
  line(left, bottom, right, bottom);
  drawingContext.setLineDash([5, 5]);
  stroke(148, 163, 184, 160);
  line(left, valueToY(0), right, valueToY(0));
  drawingContext.setLineDash([]);

  fill(148, 163, 184);
  noStroke();
  textSize(11);
  textAlign(RIGHT, CENTER);
  text('+1', left - 7, valueToY(1));
  text('0', left - 7, valueToY(0));
  text('−1', left - 7, valueToY(-1));
  textAlign(LEFT, BOTTOM);
  text('最近 900 幀的 phi（中線＝0）', left, top + 13);
  textAlign(RIGHT, TOP);
  text('時間 →', right, bottom + 3);

  if (!params.showSeries || series.length < 2) return;
  const start = Math.max(0, series.length - SERIES_LEN);
  const span = Math.max(1, Math.min(SERIES_LEN - 1, series.length - 1));
  noFill();
  stroke(167, 139, 250);
  strokeWeight(2);
  beginShape();
  for (let i = start; i < series.length; i++) {
    const x = map(i - start, 0, span, left, right);
    vertex(x, valueToY(series[i]));
  }
  endShape();

  noStroke();
  fill(251, 146, 60);
  for (let i = start; i < flipMarks.length; i++) {
    if (!flipMarks[i]) continue;
    const x = map(i - start, 0, span, left, right);
    triangle(x, valueToY(series[i]) - 5, x - 4, valueToY(series[i]) + 3, x + 4, valueToY(series[i]) + 3);
  }
}

function drawReadout(ring) {
  const area = Math.PI * (ring.outer * ring.outer - ring.inner * ring.inner);
  // 密度用「一個互動圈裡平均幾隻」來表示：這是個體真正感覺得到的密度，
  // 也是決定門檻的量。純粹的「隻／像素平方」對讀者沒有意義。
  const perCircle = area > 0
    ? locusts.length * Math.PI * params.radius * params.radius / area
    : 0;
  const strength = Math.abs(phi);
  // 門檻取 0.5 / 0.25：每隻的 u 被雜訊壓在 ±1 以內，
  // 所以整群「完全同向」時 phi 也只到 0.6 上下，不會逼近 1。
  const verdict = strength > 0.5 ? ['同向行軍', color(74, 222, 128)]
    : strength >= 0.25 ? ['拉鋸中', color(251, 146, 60)]
      : ['各走各的', color(248, 113, 113)];
  noStroke();
  textAlign(LEFT, TOP);
  textSize(15);
  fill(226, 232, 240);
  text(`個體數：${locusts.length}　密度：一個互動圈裡平均 ${perCircle.toFixed(1)} 隻`, 16, 14);
  text(`phi：${phi.toFixed(2)}　已翻轉 ${flipCount} 次`, 16, 38);
  fill(verdict[1]);
  text(`狀態：${verdict[0]}`, 16, 62);
  fill(148, 163, 184);
  textSize(12);
  text('青＝逆時針　琥珀＝順時針；加人後盯著 phi 是否鎖進同一方向', 16, 84);
}

function draw() {
  background(15, 23, 42);
  const ring = ringGeometry();
  for (const locust of locusts) {
    locust.place(ring);
    locust.move(ring);
  }
  chooseDirections();
  measurePhi();
  recordPhi();

  drawRing(ring);
  for (const locust of locusts) drawLocust(locust);
  drawReadout(ring);
  drawSeries();
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
