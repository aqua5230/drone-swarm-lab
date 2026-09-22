// ============================================================
// 第 14 課 · 自組裝隊形（Rubenstein / Cornejo / Nagpal 2014 的簡化版）
//
// 沒有全域座標、沒有中央分派。每個個體只有兩條規則：
//
//   1 梯度（gradient）：問看得到的鄰居「你是第幾層」，取最小值 +1 當自己的層數。
//     四個種子固定是第 0 層，層數就這樣一圈一圈長出去，充當距離感。
//   2 邊緣跟隨（edge following）：還沒就位的個體，貼著已就位那群的外緣繞。
//     繞到「人在形狀內、層數又不小於旁邊那隻」時，停下來、變成已就位的一員。
//
// 形狀只是一張「這裡算不算數」的判斷式，每個個體都有一份；沒有人被指派座位。
// ============================================================

const params = {
  count: 70,
  shape: 'star',     // star | k | arrow
  movers: 6,         // 同時在繞路的個體數
  speed: 3.4,
  senseScale: 1.6,   // 通訊半徑 = 間距 × 這個倍數
};

let units = [];
let pane = null;
let polys = [];      // 形狀＝一組多邊形，聯集就是形狀
let S = 150;         // 形狀尺度
let DD = 17;         // 想維持的個體間距
let gradR = 26, senseR = 38;
let centerX = 0, centerY = 0;
let doneFrames = 0, running = true;

// ---- 形狀：用多邊形描述，判斷與繪製共用同一份資料 ----
function bar(x1, y1, x2, y2, w) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w / 2, ny = (dx / len) * w / 2;
  return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
}

function buildShape() {
  const norm = [];
  if (params.shape === 'star') {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.42 : 1;
      const a = -HALF_PI + (i * PI) / 5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    norm.push(pts);
  } else if (params.shape === 'k') {
    norm.push(bar(-0.42, -0.95, -0.42, 0.95, 0.3));
    norm.push(bar(-0.36, 0.02, 0.45, -0.9, 0.28));
    norm.push(bar(-0.36, 0.02, 0.5, 0.95, 0.28));
  } else {
    norm.push([[-0.9, -0.34], [0.08, -0.34], [0.08, -0.8], [0.95, 0], [0.08, 0.8], [0.08, 0.34], [-0.9, 0.34]]);
  }
  polys = norm.map((p) => p.map(([x, y]) => [centerX + x * S, centerY + y * S]));
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inShape = (x, y) => polys.some((p) => pointInPoly(x, y, p));

// ---- 個體 ----
class Unit {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.state = 'reserve';   // reserve | moving | placed
    this.grad = Infinity;
    this.seed = false;
    this.spin = 0;            // 繞了多久，用來救卡住的個體
  }
}

// 點到線段的距離，用來量一個點離形狀邊界多遠
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// 種子放形狀「最深」的地方（離邊界最遠的一點）。
// 放在星形尖端的話，一層只擠得下一個，整群會長成一條線而不是填滿。
function seedSpot() {
  let best = [centerX, centerY], bestD = -1;
  for (let y = centerY - S; y <= centerY + S; y += S / 26) {
    for (let x = centerX - S; x <= centerX + S; x += S / 26) {
      if (!inShape(x, y)) continue;
      let d = Infinity;
      for (const poly of polys) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          d = Math.min(d, distToSeg(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
        }
      }
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
  }
  return best;
}

function layout() {
  S = Math.min(width * 0.27, height * 0.33);
  DD = S / 8.6;
  gradR = DD * params.senseScale;
  senseR = DD * 2.4;
  centerX = width - S - Math.max(20, width * 0.05);
  centerY = height / 2;
}

function reset() {
  layout();
  buildShape();
  units = [];
  doneFrames = 0;
  running = true;

  // 四顆種子：唯一被寫死層數的個體，其他人的距離感都是從牠們算出來的
  const [sx, sy] = seedSpot();
  const offs = [[0, 0], [DD, 0], [DD / 2, -DD * 0.87], [-DD / 2, -DD * 0.87]];
  for (const [ox, oy] of offs) {
    const u = new Unit(sx + ox - DD / 2, sy + oy - DD * 0.5);
    u.state = 'placed';
    u.seed = true;
    u.grad = 0;
    units.push(u);
  }

  // 其餘擠在形狀左邊的待命區（貼著放，省掉來回路程）
  const right = Math.max(DD * 3, centerX - S - DD);
  const cols = Math.max(3, Math.floor((right - 12) / (DD * 0.85)));
  for (let i = 0; i < params.count; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    units.push(new Unit(right - c * DD * 0.85, height / 2 + (r % 2 ? 1 : -1) * Math.ceil(r / 2) * DD * 0.85));
  }
}

const placedUnits = () => units.filter((u) => u.state === 'placed');

// 看得到的已就位鄰居裡最小層數 +1，就是我的層數
function gradEstimate(pos, placed) {
  let best = Infinity;
  for (const p of placed) {
    if ((p.pos.x - pos.x) ** 2 + (p.pos.y - pos.y) ** 2 < gradR * gradR) best = Math.min(best, p.grad);
  }
  return best === Infinity ? Infinity : best + 1;
}

// 層數要一直重算：新來的人可能替某些個體接上更短的路。
// 這就是真實系統裡「梯度靠持續互相報數維持」的樣子，不是算一次就定案。
function relaxGradients(placed) {
  for (let pass = 0; pass < 2; pass++) {
    const next = placed.map((u) => {
      if (u.seed) return 0;
      let best = Infinity;
      for (const o of placed) {
        if (o === u) continue;
        if ((o.pos.x - u.pos.x) ** 2 + (o.pos.y - u.pos.y) ** 2 < gradR * gradR) best = Math.min(best, o.grad);
      }
      return best === Infinity ? u.grad : best + 1;
    });
    for (let i = 0; i < placed.length; i++) placed[i].grad = next[i];
  }
}

function nearestPlaced(pos, placed) {
  let best = null, bd = Infinity;
  for (const p of placed) {
    const d = (p.pos.x - pos.x) ** 2 + (p.pos.y - pos.y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { unit: best, dist: Math.sqrt(bd) } : null;
}

function stepAssembly() {
  const placed = placedUnits();
  relaxGradients(placed);

  // 補足同時在繞路的人數
  let moving = units.filter((u) => u.state === 'moving').length;
  for (const u of units) {
    if (moving >= params.movers) break;
    if (u.state === 'reserve') { u.state = 'moving'; u.spin = 0; moving++; }
  }

  let cx = 0, cy = 0;
  for (const p of placed) { cx += p.pos.x; cy += p.pos.y; }
  cx /= placed.length; cy /= placed.length;

  for (const u of units) {
    if (u.state !== 'moving') continue;
    u.spin++;
    const near = nearestPlaced(u.pos, placed);

    // 還看不到那群人：先朝它們走
    if (!near || near.dist > senseR) {
      const dir = createVector(cx - u.pos.x, cy - u.pos.y).setMag(params.speed);
      u.pos.add(dir);
      continue;
    }

    // 邊緣跟隨：切線方向繞行 + 把距離拉回 DD
    const to = createVector(u.pos.x - near.unit.pos.x, u.pos.y - near.unit.pos.y);
    const d = to.mag() || 0.001;
    to.div(d);
    const move = createVector(-to.y, to.x).mult(1).add(to.copy().mult((DD - d) * 0.06));
    // 別壓到其他已就位的人
    for (const p of placed) {
      if (p === near.unit) continue;
      const dx = u.pos.x - p.pos.x, dy = u.pos.y - p.pos.y;
      const dd = Math.hypot(dx, dy);
      if (dd < DD * 0.95 && dd > 0) move.add((dx / dd) * (DD - dd) * 0.14, (dy / dd) * (DD - dd) * 0.14);
    }
    move.setMag(params.speed);

    u.grad = gradEstimate(u.pos, placed);
    const next = createVector(u.pos.x + move.x * 2.5, u.pos.y + move.y * 2.5);
    let clear = true, snug = 0;
    for (const p of placed) {
      const d2 = (p.pos.x - u.pos.x) ** 2 + (p.pos.y - u.pos.y) ** 2;
      if (d2 < (DD * 0.8) ** 2) { clear = false; break; }
      if (d2 < (DD * 1.4) ** 2) snug++;
    }
    // 停下來要同時成立：卡進一個至少靠著兩個人的凹口（開頭人少時放寬）、人在形狀內，
    // 而且層數已經追平旁邊那隻、或再走就要離開形狀了。
    if (u.grad !== Infinity && clear && snug >= (placed.length > 6 ? 2 : 1) &&
        inShape(u.pos.x, u.pos.y) &&
        (u.grad >= near.unit.grad || !inShape(next.x, next.y))) {
      u.state = 'placed';
      continue;
    }

    u.pos.add(move);
    u.pos.x = constrain(u.pos.x, 6, width - 6);
    u.pos.y = constrain(u.pos.y, 6, height - 6);

    // 繞太久還沒位子＝形狀滿了，回待命區排隊，別無限繞
    if (u.spin > 2600) { u.state = 'reserve'; u.spin = 0; }
  }
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  reset();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '自組裝參數', container });
  pane.addBinding(params, 'shape', {
    options: { '星形': 'star', '字母Ｋ': 'k', '箭頭': 'arrow' },
    label: '形狀 shape',
  }).on('change', reset);
  pane.addBinding(params, 'count', { min: 40, max: 260, step: 10, label: '個體數 count' }).on('change', reset);
  pane.addBinding(params, 'movers', { min: 1, max: 12, step: 1, label: '同時移動數' });
  pane.addBinding(params, 'speed', { min: 1, max: 6, step: 0.2, label: '移動速度 speed' });
  pane.addBinding(params, 'senseScale', { min: 1.2, max: 2.4, step: 0.1, label: '通訊半徑倍數' }).on('change', reset);
  pane.addButton({ title: '↻ 重新組裝' }).on('click', reset);
}

function setup() {
  SwarmLink.init(params);   // 讀網址上的參數；要在 reset() 與面板之前
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

// 層數 → 顏色：越靠種子越青，越外圈越紫
function gradColor(g) {
  const t = constrain(g / 14, 0, 1);
  return lerpColor(color(56, 189, 248), color(167, 139, 250), t);
}

function draw() {
  background(15, 23, 42);

  // 形狀本身：一張大家都有的判斷式，畫成淡淡的底
  noStroke();
  fill(56, 189, 248, 16);
  for (const p of polys) {
    beginShape();
    for (const [x, y] of p) vertex(x, y);
    endShape(CLOSE);
  }
  noFill(); stroke(56, 189, 248, 70); strokeWeight(1);
  for (const p of polys) {
    beginShape();
    for (const [x, y] of p) vertex(x, y);
    endShape(CLOSE);
  }

  if (running) stepAssembly();

  noStroke();
  for (const u of units) {
    if (u.state === 'reserve') { fill(71, 85, 105); circle(u.pos.x, u.pos.y, 7); }
  }
  for (const u of units) {
    if (u.state !== 'placed') continue;
    if (u.seed) { fill(250, 204, 21); circle(u.pos.x, u.pos.y, 11); }
    else { fill(gradColor(u.grad)); circle(u.pos.x, u.pos.y, 9); }
  }
  for (const u of units) {
    if (u.state !== 'moving') continue;
    fill(255, 255, 255, 60); circle(u.pos.x, u.pos.y, 18);
    fill(248, 250, 252); circle(u.pos.x, u.pos.y, 8);
  }

  const placed = units.filter((u) => u.state === 'placed').length;
  const moving = units.filter((u) => u.state === 'moving').length;
  const wait = units.length - placed - moving;
  if (wait === 0 && moving === 0) doneFrames++;

  fill(226, 232, 240); textSize(15); textAlign(LEFT, TOP);
  text(`已就位：${placed} / ${units.length}`, 16, 14);
  fill(148, 163, 184); textSize(13);
  text(`繞路中 ${moving}　待命 ${wait}　金色＝種子（第 0 層）`, 16, 38);
  text('顏色＝層數：越青越靠種子，越紫離種子越多跳', 16, 58);
  if (doneFrames > 30) {
    fill(74, 222, 128); textSize(15);
    text('形狀完成——沒有人被指派過座位', 16, 82);
  }
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  reset();
}
