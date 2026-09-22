// ============================================================
// 第 13 課 · 群裡混進叛徒（拜占庭節點）
//
// 每個節點手上有一個估計值（0～1，真值 0.5），只跟半徑內的鄰居交換，
// 再把自己的值往「鄰居們的聚合值」挪一點——這就是分散式共識最素的樣子。
//
// 叛徒（拜占庭節點）不更新，永遠回報同一個極端假值。
// 聚合規則換三種，看誰扛得住：平均、中位數、修剪平均。
// 下方數線同時畫出「全體回報的平均」與「中位數」，兩個標記的距離就是這一課。
// ============================================================

const TRUTH = 0.5;

const params = {
  count: 140,
  byzantinePct: 10,
  rule: 'mean',     // mean | median | trimmed
  trim: 20,         // 修剪平均：頭尾各丟掉的百分比
  noise: 0.06,      // 誠實節點的量測誤差
  radius: 320,      // 聽得到多遠的鄰居
  lie: 0.06,        // 叛徒回報的假值
  showLiars: true,
};

let nodes = [];
let pane = null;
let groupErr = 0, allMean = 0, allMedian = 0;

class Node {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().setMag(0.6);
    this.bad = false;
    this.val = TRUTH;
  }
  move() {
    this.pos.add(this.vel);
    if (this.pos.x < 8 || this.pos.x > width - 8) this.vel.x *= -1;
    if (this.pos.y < 8 || this.pos.y > height - 68) this.vel.y *= -1;
    this.pos.x = constrain(this.pos.x, 8, width - 8);
    this.pos.y = constrain(this.pos.y, 8, height - 68);
  }
}

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return TRUTH;
  const m = n >> 1;
  return n % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function aggregate(values) {
  if (values.length === 0) return null;
  if (params.rule === 'mean') {
    let s = 0;
    for (const v of values) s += v;
    return s / values.length;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  if (params.rule === 'median') return median(sorted);
  // 修剪平均：頭尾各丟掉 trim%，剩下的取平均。至少留一個。
  const cut = Math.min(Math.floor(sorted.length * params.trim / 100), (sorted.length - 1) >> 1);
  const kept = sorted.slice(cut, sorted.length - cut);
  let s = 0;
  for (const v of kept) s += v;
  return s / kept.length;
}

function seedValues() {
  for (const n of nodes) n.val = n.bad ? params.lie : constrain(randomGaussian(TRUTH, params.noise), 0, 1);
}

function assignBad() {
  const k = Math.round(nodes.length * params.byzantinePct / 100);
  const idx = nodes.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = floor(random(i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  for (const n of nodes) n.bad = false;
  for (let i = 0; i < k; i++) nodes[idx[i]].bad = true;
  seedValues();
}

function reset() {
  nodes = [];
  for (let i = 0; i < params.count; i++) nodes.push(new Node());
  assignBad();
}

function gossip() {
  const r2 = params.radius * params.radius;
  const next = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const me = nodes[i];
    if (me.bad) { next[i] = params.lie; continue; }   // 叛徒不聽人講，永遠報同一個假值
    const heard = [me.val];
    for (const o of nodes) {
      if (o === me) continue;
      const dx = o.pos.x - me.pos.x, dy = o.pos.y - me.pos.y;
      if (dx * dx + dy * dy < r2) heard.push(o.val);
    }
    const agg = aggregate(heard);
    next[i] = agg === null ? me.val : me.val + (agg - me.val) * 0.14;
  }
  for (let i = 0; i < nodes.length; i++) nodes[i].val = next[i];
}

function measure() {
  const all = nodes.map((n) => n.val);
  let s = 0;
  for (const v of all) s += v;
  allMean = s / all.length;
  allMedian = median(all.slice().sort((a, b) => a - b));
  // 成績只看誠實節點：牠們最後信了什麼
  const honest = nodes.filter((n) => !n.bad).map((n) => n.val).sort((a, b) => a - b);
  groupErr = Math.abs(median(honest) - TRUTH) * 100;
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) reset();
  else if (partial.byzantinePct !== undefined || partial.lie !== undefined) assignBad();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '共識參數', container });
  pane.addBinding(params, 'rule', {
    options: { '平均 mean': 'mean', '中位數 median': 'median', '修剪平均 trimmed': 'trimmed' },
    label: '聚合規則 rule',
  });
  pane.addBinding(params, 'byzantinePct', { min: 0, max: 70, step: 1, label: '叛徒比例' }).on('change', assignBad);
  pane.addBinding(params, 'trim', { min: 0, max: 45, step: 5, label: '修剪比例 trim' });
  pane.addBinding(params, 'lie', { min: 0, max: 1, step: 0.01, label: '謊言強度 lie' }).on('change', seedValues);
  pane.addBinding(params, 'noise', { min: 0, max: 0.2, step: 0.01, label: '量測雜訊 noise' }).on('change', seedValues);
  pane.addBinding(params, 'radius', { min: 60, max: 700, step: 20, label: '通訊半徑 radius' });
  pane.addBinding(params, 'count', { min: 40, max: 260, step: 10, label: '個體數 count' }).on('change', reset);
  pane.addBinding(params, 'showLiars', { label: '顯示叛徒' });
  pane.addButton({ title: '↻ 重新量測' }).on('click', seedValues);
  pane.addButton({ title: '重置' }).on('click', reset);
}

const LINE_M = 40;
const valToX = (v) => LINE_M + v * (width - LINE_M * 2);

// 在畫布上左右點一下＝叛徒改口，改報那個位置對應的值
function mousePressed() {
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  params.lie = constrain((mouseX - LINE_M) / (width - LINE_M * 2), 0, 1);
  for (const n of nodes) if (n.bad) n.val = params.lie;
  if (pane) pane.refresh();
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder').style('cursor', 'crosshair');
  reset();
  createControls();
}

// 值 → 顏色：0 琥珀、0.5 青（真值）、1 紫
function valColor(v) {
  return v < 0.5
    ? lerpColor(color(251, 146, 60), color(56, 189, 248), v * 2)
    : lerpColor(color(56, 189, 248), color(167, 139, 250), (v - 0.5) * 2);
}

function drawScale() {
  const y = height - 34;
  stroke(71, 85, 105); strokeWeight(1);
  line(LINE_M, y, width - LINE_M, y);

  // 每個節點的回報值
  for (const n of nodes) {
    stroke(n.bad ? color(248, 113, 113) : color(125, 211, 252, 150));
    strokeWeight(n.bad ? 2 : 1);
    const x = valToX(n.val);
    line(x, y - 9, x, y + 9);
  }

  const marker = (v, col, label, up) => {
    const x = valToX(v);
    stroke(col); strokeWeight(2);
    line(x, y - 16, x, y + 16);
    noStroke(); fill(col); textSize(11);
    textAlign(CENTER, up ? BOTTOM : TOP);
    text(label, x, up ? y - 18 : y + 18);
  };
  marker(TRUTH, color(74, 222, 128), '真值', true);
  marker(allMean, color(250, 204, 21), '全體平均', false);
  marker(allMedian, color(226, 232, 240), '全體中位數', true);
}

function draw() {
  background(15, 23, 42);

  for (const n of nodes) n.move();
  gossip();
  measure();

  noStroke();
  for (const n of nodes) {
    if (n.bad && params.showLiars) {
      fill(248, 113, 113, 60);
      circle(n.pos.x, n.pos.y, 20);
    }
    fill(valColor(n.val));
    circle(n.pos.x, n.pos.y, n.bad && params.showLiars ? 9 : 8);
  }

  drawScale();

  const badN = nodes.filter((n) => n.bad).length;
  const verdict = groupErr < 3 ? ['守住', color(74, 222, 128)]
    : groupErr < 12 ? ['動搖', color(250, 204, 21)]
      : ['被帶走', color(248, 113, 113)];
  fill(226, 232, 240); textSize(15); textAlign(LEFT, TOP);
  text(`叛徒：${badN} / ${nodes.length}（${params.byzantinePct}%）`, 16, 14);
  fill(verdict[1]);
  text(`誠實節點偏離真值：${groupErr.toFixed(1)}%　${verdict[0]}`, 16, 38);
  fill(148, 163, 184); textSize(13);
  text('左右點一下＝叛徒改口報那個值；紅圈＝上帝視角標出來的叛徒，群體自己看不到', 16, 62);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
