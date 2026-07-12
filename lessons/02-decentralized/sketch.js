// ============================================================
// 第 2 課 · 去中心化 vs 中央控制
//
// 同一塊畫布切兩半：
//   左半 = 中央控制。一個金色「指揮官」自己亂走，其他全朝牠靠。
//   右半 = 去中心化。一群 boid，只看鄰居跑分離／對齊／聚合。
// 「同時斬首」按鈕：左半殺掉指揮官、右半隨機殺一隻。看誰垮。
// ============================================================

const params = {
  count: 90,        // 每半邊的個體數
  followPull: 1.4,  // 中央：跟隨指揮官的力道
  separation: 1.2,  // 兩邊共用：太近就閃
  maxSpeed: 3.2,
  maxForce: 0.06,
};

let central = [];   // 左半：central[0] 是指揮官
let swarm = [];      // 右半：boids
let commanderAlive = true;
let pane = null;
const PERCEPTION = 60;

function halfWidth() {
  return width / 2;
}

class Agent {
  constructor(x0, x1) {
    this.x0 = x0;
    this.x1 = x1;
    this.pos = createVector(random(x0, x1), random(height));
    this.vel = p5.Vector.random2D().setMag(random(1, params.maxSpeed));
    this.acc = createVector(0, 0);
  }

  edges() {
    const w = this.x1 - this.x0;
    if (this.pos.x > this.x1) this.pos.x = this.x0;
    if (this.pos.x < this.x0) this.pos.x = this.x1;
    if (this.pos.y > height) this.pos.y = 0;
    if (this.pos.y < 0) this.pos.y = height;
    // 防呆：邊界寬度為 0 時不動
    if (w <= 0) this.pos.x = this.x0;
  }

  steerTo(targetVel, weight = 1) {
    const s = targetVel.copy().setMag(params.maxSpeed).sub(this.vel).limit(params.maxForce);
    this.acc.add(s.mult(weight));
  }

  separate(others) {
    let sum = createVector(0, 0);
    let n = 0;
    for (const o of others) {
      if (o === this) continue;
      const d = p5.Vector.dist(this.pos, o.pos);
      if (d > 0 && d < PERCEPTION) {
        sum.add(p5.Vector.sub(this.pos, o.pos).div(d * d));
        n++;
      }
    }
    if (n > 0) {
      sum.div(n);
      this.steerTo(sum, params.separation);
    }
    return n;
  }

  update() {
    this.vel.add(this.acc).limit(params.maxSpeed);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }

  show(col, size = 7) {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    noStroke();
    fill(col);
    triangle(size + 3, 0, -size, -size * 0.6, -size, size * 0.6);
    pop();
  }
}

// 中央控制：每隻朝指揮官靠 + 彼此分離
function updateCentral() {
  const commander = central[0];
  for (let i = 0; i < central.length; i++) {
    const a = central[i];
    if (i === 0 && commanderAlive) {
      // 指揮官自己亂走（柏林式漂移）
      a.acc.add(p5.Vector.random2D().mult(0.05));
    } else {
      a.separate(central);
      if (commanderAlive) {
        const toCmd = p5.Vector.sub(commander.pos, a.pos);
        a.steerTo(toCmd, params.followPull);
      }
      // 指揮官死了：沒有目標，只剩慣性 + 分離 → 群體失去方向、攤開
    }
    a.update();
    a.edges();
  }
}

// 去中心化：標準 boids（分離／對齊／聚合）
function updateSwarm() {
  for (const a of swarm) {
    let alignX = 0, alignY = 0, cohX = 0, cohY = 0, sepX = 0, sepY = 0, n = 0, sn = 0;
    for (const o of swarm) {
      if (o === a) continue;
      const d = p5.Vector.dist(a.pos, o.pos);
      if (d < PERCEPTION) {
        alignX += o.vel.x; alignY += o.vel.y;
        cohX += o.pos.x; cohY += o.pos.y;
        n++;
        if (d > 0) { sepX += (a.pos.x - o.pos.x) / (d * d); sepY += (a.pos.y - o.pos.y) / (d * d); sn++; }
      }
    }
    if (n > 0) {
      a.steerTo(createVector(alignX / n, alignY / n));
      a.steerTo(createVector(cohX / n - a.pos.x, cohY / n - a.pos.y));
    }
    if (sn > 0) a.steerTo(createVector(sepX, sepY), params.separation);
    a.update();
    a.edges();
  }
}

function resetAll() {
  const mid = halfWidth();
  central = [];
  swarm = [];
  commanderAlive = true;
  for (let i = 0; i < params.count; i++) central.push(new Agent(0, mid));
  for (let i = 0; i < params.count; i++) swarm.push(new Agent(mid, width));
  // 指揮官擺中間
  central[0].pos.set(mid / 2, height / 2);
}

function behead() {
  commanderAlive = false;
  central[0].vel.mult(0.05);
  // 右半隨機殺一隻（但右半永遠補回，證明砍不到頭）
  if (swarm.length > 5) swarm.splice(floor(random(swarm.length)), 1);
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  if (partial.count !== undefined) resetAll();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '中央 vs 去中心', container });
  pane.addBinding(params, 'count', { min: 20, max: 200, step: 1 }).on('change', resetAll);
  pane.addBinding(params, 'followPull', { min: 0, max: 3, step: 0.1 });
  pane.addBinding(params, 'separation', { min: 0, max: 3, step: 0.1 });
  pane.addBinding(params, 'maxSpeed', { min: 1, max: 6, step: 0.1 });
  pane.addButton({ title: '☠ 同時斬首' }).on('click', behead);
  pane.addButton({ title: '重置' }).on('click', resetAll);
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  resetAll();
  createControls();
}

function draw() {
  background(15, 23, 42);
  const mid = halfWidth();

  // 兩半底色與分隔線
  noStroke();
  fill(30, 41, 59, 90);
  rect(0, 0, mid, height);
  stroke(71, 85, 105);
  line(mid, 0, mid, height);

  updateCentral();
  updateSwarm();

  for (let i = 0; i < central.length; i++) {
    if (i === 0) {
      const c = commanderAlive ? color(250, 204, 21) : color(120, 60, 60);
      central[i].show(c, 11);
    } else {
      central[i].show(color(148, 163, 184));
    }
  }
  for (const a of swarm) a.show(color(56, 189, 248));

  // 標籤
  noStroke();
  fill(226, 232, 240);
  textSize(15);
  textAlign(LEFT, TOP);
  text('中央控制', 16, 14);
  textAlign(RIGHT, TOP);
  text('去中心化', width - 16, 14);

  textSize(13);
  textAlign(LEFT, BOTTOM);
  fill(commanderAlive ? color(148, 163, 184) : color(248, 113, 113));
  text(commanderAlive ? '指揮官在，隊形成立' : '指揮官已死 → 群龍無首，攤散', 16, height - 12);
  fill(148, 163, 184);
  textAlign(RIGHT, BOTTOM);
  text('砍不到頭，照飛', width - 16, height - 12);
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
}
