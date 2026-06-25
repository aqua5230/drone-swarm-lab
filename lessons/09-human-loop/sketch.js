// ============================================================
// 第 9 課 · 人在環路
//
// 一支自主群體巡場處理「任務點」。任務點可能落在使用者畫的「禁區」內
// （代表醫院／平民等不可碰的地方）。三種人類介入模式：
//   in   人在環內：每個任務都要人按「同意」才會執行
//   on   人在環上：自動倒數後執行，倒數期間人可否決
//   out  全自動：立刻執行，沒有人把關
// 量化：完成數、用時、誤觸禁區次數 → 看「移走人類」省時間、卻換來錯誤。
// ============================================================

const params = {
  mode: 'on',        // 'in' | 'on' | 'out'
  vetoWindow: 1.6,   // 人在環上：否決窗口秒數
  spawnRate: 0.012,  // 任務點出現頻率
};

let agents = [];
let tasks = [];      // {x,y,state,timer,inNoGo}
let noGo = [];        // {x,y,r}
let done = 0, violations = 0, startFrame = 0;
let pane = null;

function inAnyNoGo(x, y) {
  for (const z of noGo) if ((x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r) return true;
  return false;
}

class Drone {
  constructor() {
    this.pos = createVector(width / 2, height - 20);
    this.vel = p5.Vector.random2D().setMag(2);
  }
  step(target) {
    if (target) this.vel.add(p5.Vector.sub(target, this.pos).setMag(0.2));
    // 避開禁區（飛得過，但任務由人把關）
    for (const z of noGo) {
      const d = dist(this.pos.x, this.pos.y, z.x, z.y);
      if (d < z.r + 20) this.vel.add(p5.Vector.sub(this.pos, createVector(z.x, z.y)).setMag(0.3));
    }
    this.vel.add(p5.Vector.random2D().mult(0.1)).limit(3.2);
    this.pos.add(this.vel);
    this.pos.x = constrain(this.pos.x, 0, width);
    this.pos.y = constrain(this.pos.y, 0, height);
  }
}

function spawnTask() {
  const x = random(width * 0.1, width * 0.9), y = random(height * 0.1, height * 0.75);
  tasks.push({ x, y, state: 'pending', timer: 0, inNoGo: inAnyNoGo(x, y) });
}

function execute(t) {
  t.state = 'done';
  done++;
  if (t.inNoGo) violations++;
}

function reset() {
  agents = [];
  for (let i = 0; i < 22; i++) agents.push(new Drone());
  tasks = [];
  done = 0; violations = 0;
  startFrame = frameCount;
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '介入模式', container });
  pane.addBinding(params, 'mode', {
    options: { '人在環內（每個都要批准）': 'in', '人在環上（可否決）': 'on', '全自動（沒有人）': 'out' },
  });
  pane.addBinding(params, 'vetoWindow', { min: 0.4, max: 4, step: 0.1, label: '否決窗口秒' });
  pane.addBinding(params, 'spawnRate', { min: 0.004, max: 0.04, step: 0.002, label: '任務頻率' });
  pane.addButton({ title: '清空禁區' }).on('click', () => (noGo = []));
  pane.addButton({ title: '重置統計' }).on('click', reset);
}

function mousePressed() {
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  // 先看是不是點在任務點上（批准 / 否決）
  for (const t of tasks) {
    if (t.state === 'done' || t.state === 'vetoed') continue;
    if (dist(mouseX, mouseY, t.x, t.y) < 18) {
      if (params.mode === 'in' && t.state === 'await') { execute(t); return; }
      if (params.mode === 'on' && t.state === 'counting') { t.state = 'vetoed'; return; }
      return;
    }
  }
  // 否則：放一個禁區
  noGo.push({ x: mouseX, y: mouseY, r: 56 });
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder').style('cursor', 'crosshair');
  reset();
  createControls();
}

function draw() {
  background(15, 23, 42);
  if (random() < params.spawnRate) spawnTask();

  // 禁區
  for (const z of noGo) {
    noStroke(); fill(248, 113, 113, 28); circle(z.x, z.y, z.r * 2);
    noFill(); stroke(248, 113, 113, 160); strokeWeight(1.5); circle(z.x, z.y, z.r * 2);
  }

  // 群體飛向最近的「待處理 / 已批准」任務
  const active = tasks.filter((t) => t.state !== 'done' && t.state !== 'vetoed');
  let target = null, best = Infinity;
  const cx = width / 2, cy = height / 2;
  for (const t of active) {
    const d = (t.x - cx) ** 2 + (t.y - cy) ** 2;
    if (d < best) { best = d; target = createVector(t.x, t.y); }
  }
  for (const a of agents) a.step(target);

  const centroid = agents.reduce((acc, a) => acc.add(a.pos), createVector(0, 0)).div(agents.length);

  // 任務狀態機：群體靠近就依模式處理
  for (const t of tasks) {
    if (t.state === 'done' || t.state === 'vetoed') continue;
    const near = dist(centroid.x, centroid.y, t.x, t.y) < 40;
    if (params.mode === 'out') {
      if (near) execute(t);                          // 全自動：到了就做
    } else if (params.mode === 'on') {
      if (near && t.state === 'pending') t.state = 'counting';
      if (t.state === 'counting') {
        t.timer += 1 / 60;
        if (t.timer >= params.vetoWindow) execute(t); // 倒數完、沒被否決就執行
      }
    } else { // in
      if (near && t.state === 'pending') t.state = 'await'; // 等人點「同意」
    }
  }

  // 畫任務
  for (const t of tasks) {
    push();
    translate(t.x, t.y);
    if (t.state === 'done') { fill(t.inNoGo ? color(220, 38, 38) : color(74, 222, 128)); noStroke(); circle(0, 0, 14); }
    else if (t.state === 'vetoed') { noFill(); stroke(148, 163, 184); strokeWeight(2); line(-7, -7, 7, 7); line(-7, 7, 7, -7); }
    else {
      fill(250, 204, 21); noStroke(); circle(0, 0, 13);
      if (t.state === 'await') { noFill(); stroke(250, 204, 21); strokeWeight(2); circle(0, 0, 22 + sin(frameCount * 0.2) * 4); }
      if (t.state === 'counting') {
        noFill(); stroke(248, 113, 113); strokeWeight(3);
        arc(0, 0, 26, 26, -HALF_PI, -HALF_PI + TWO_PI * (t.timer / params.vetoWindow));
      }
    }
    pop();
  }

  // 群體
  for (const a of agents) {
    push(); translate(a.pos.x, a.pos.y); rotate(a.vel.heading());
    noStroke(); fill(56, 189, 248); triangle(8, 0, -5, -3.5, -5, 3.5); pop();
  }

  // HUD
  const t = (frameCount - startFrame) / 60;
  noStroke();
  fill(226, 232, 240); textSize(15); textAlign(LEFT, TOP);
  const modeName = params.mode === 'in' ? '人在環內' : params.mode === 'on' ? '人在環上' : '全自動（無人）';
  text(`模式：${modeName}　完成：${done}　用時：${t.toFixed(0)}s`, 16, 14);
  fill(violations > 0 ? color(248, 113, 113) : color(148, 163, 184));
  text(`誤觸禁區：${violations}`, 16, 38);
  fill(148, 163, 184); textSize(13);
  const hint = params.mode === 'in' ? '黃點閃圈＝等你點「同意」才執行' :
    params.mode === 'on' ? '紅圈倒數中＝點它可否決' : '沒有把關——它自己全做了';
  text(`點空白處放禁區　|　${hint}`, 16, height - 14);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
