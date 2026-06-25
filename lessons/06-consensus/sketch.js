// ============================================================
// 第 6 課 · 群體共識（蜜蜂選巢模型）
//
// 每隻蜂的狀態：未決定，或認定某個候選地點。動態（well-mixed 近似）：
//   未決定 → 自發發現地點（機率 ∝ 該地點品質）
//   未決定 → 被認定者拉票（機率 ∝ 對方地點品質）
//   認定 i → 自發放棄（機率 ∝ 1/品質）
//   認定 i → 撞見認定 j≠i 者，被「喊停」變回未決定（交叉抑制）
// 任一地點的票數過 quorum 門檻 → 全群定案。
// ============================================================

const params = {
  count: 200,
  qualityA: 1.0,   // 三個候選地點的品質
  qualityB: 0.6,
  qualityC: 0.35,
  recruit: 0.9,    // 拉票力道
  inhibit: 0.6,    // 交叉抑制力道（撞見不同意見就喊停）
};

let bees = [];
let sites = [];      // {x,y,quality,color,label}
let decided = -1;
let pane = null;
const QUORUM = 0.7;  // 過七成即定案

function setupSites() {
  sites = [
    { quality: params.qualityA, color: [56, 189, 248], label: 'A', x: width * 0.22, y: height * 0.35 },
    { quality: params.qualityB, color: [74, 222, 128], label: 'B', x: width * 0.78, y: height * 0.35 },
    { quality: params.qualityC, color: [250, 204, 21], label: 'C', x: width * 0.5, y: height * 0.82 },
  ];
}

class Bee {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().setMag(1.6);
    this.commit = -1; // -1 = 未決定，否則為 site index
  }
  decide() {
    if (this.commit === -1) {
      // 自發發現
      for (let i = 0; i < sites.length; i++) {
        if (random() < 0.0009 * sites[i].quality) { this.commit = i; return; }
      }
      // 被拉票：隨機遇到一隻已認定的
      const other = bees[floor(random(bees.length))];
      if (other.commit !== -1 && random() < params.recruit * 0.02 * sites[other.commit].quality)
        this.commit = other.commit;
    } else {
      // 自發放棄（地點越差越容易放棄）
      if (random() < 0.004 / sites[this.commit].quality) { this.commit = -1; return; }
      // 交叉抑制：遇到認定別處的，被喊停
      const other = bees[floor(random(bees.length))];
      if (other.commit !== -1 && other.commit !== this.commit && random() < params.inhibit * 0.02)
        this.commit = -1;
    }
  }
  move() {
    // 認定了就往那個地點飄，未決定就在中間遊蕩
    if (this.commit !== -1) {
      const s = sites[this.commit];
      this.vel.add(p5.Vector.sub(createVector(s.x, s.y), this.pos).setMag(0.08));
    } else {
      this.vel.add(p5.Vector.random2D().mult(0.15));
    }
    this.vel.limit(2.4);
    this.pos.add(this.vel);
    if (this.pos.x < 0 || this.pos.x > width) this.vel.x *= -1;
    if (this.pos.y < 0 || this.pos.y > height) this.vel.y *= -1;
    this.pos.x = constrain(this.pos.x, 0, width);
    this.pos.y = constrain(this.pos.y, 0, height);
  }
}

function counts() {
  const c = [0, 0, 0];
  for (const b of bees) if (b.commit !== -1) c[b.commit]++;
  return c;
}

function reset() {
  setupSites();
  bees = [];
  for (let i = 0; i < params.count; i++) bees.push(new Bee());
  decided = -1;
}

window.applyLessonPreset = function (partial) {
  Object.assign(params, partial);
  setupSites();
  if (partial.count !== undefined) reset();
  if (pane) pane.refresh();
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return { width: holder ? holder.clientWidth : windowWidth, height: 520 };
}

function createControls() {
  const container = document.getElementById('controls-holder');
  pane = new Tweakpane.Pane({ title: '共識參數', container });
  pane.addBinding(params, 'count', { min: 50, max: 400, step: 10 }).on('change', reset);
  pane.addBinding(params, 'qualityA', { min: 0.1, max: 1, step: 0.05 }).on('change', setupSites);
  pane.addBinding(params, 'qualityB', { min: 0.1, max: 1, step: 0.05 }).on('change', setupSites);
  pane.addBinding(params, 'qualityC', { min: 0.1, max: 1, step: 0.05 }).on('change', setupSites);
  pane.addBinding(params, 'recruit', { min: 0, max: 2, step: 0.05 });
  pane.addBinding(params, 'inhibit', { min: 0, max: 2, step: 0.05 });
  pane.addButton({ title: '重新表決' }).on('click', reset);
}

function setup() {
  const s = canvasSize();
  createCanvas(s.width, s.height).parent('canvas-holder');
  reset();
  createControls();
}

function draw() {
  background(15, 23, 42);

  // 候選地點：圈大小 = 品質
  for (const s of sites) {
    noStroke();
    fill(s.color[0], s.color[1], s.color[2], 30);
    circle(s.x, s.y, 60 + s.quality * 90);
    fill(s.color[0], s.color[1], s.color[2], 220);
    textAlign(CENTER, CENTER);
    textSize(18);
    text(s.label, s.x, s.y);
    fill(203, 213, 225);
    textSize(12);
    text(`品質 ${s.quality.toFixed(2)}`, s.x, s.y + 22);
  }

  for (const b of bees) { b.decide(); b.move(); }

  for (const b of bees) {
    noStroke();
    if (b.commit === -1) fill(148, 163, 184, 160);
    else { const c = sites[b.commit].color; fill(c[0], c[1], c[2]); }
    circle(b.pos.x, b.pos.y, 5);
  }

  // 票數長條 + quorum 判定
  const c = counts();
  const need = params.count * QUORUM;
  if (decided === -1) for (let i = 0; i < 3; i++) if (c[i] >= need) decided = i;

  const barX = 16, barW = 180;
  for (let i = 0; i < 3; i++) {
    const y = 16 + i * 26;
    const col = sites[i].color;
    noStroke();
    fill(51, 65, 85);
    rect(barX, y, barW, 16, 4);
    fill(col[0], col[1], col[2]);
    rect(barX, y, barW * (c[i] / params.count), 16, 4);
    fill(226, 232, 240);
    textAlign(LEFT, CENTER);
    textSize(12);
    text(`${sites[i].label}　${c[i]}`, barX + barW + 8, y + 8);
  }
  // quorum 門檻線
  stroke(248, 113, 113, 180);
  strokeWeight(1);
  line(barX + barW * QUORUM, 12, barX + barW * QUORUM, 16 + 2 * 26 + 18);

  if (decided !== -1) {
    noStroke();
    fill(sites[decided].color);
    textAlign(RIGHT, TOP);
    textSize(17);
    text(`✓ 全群定案：地點 ${sites[decided].label}`, width - 16, 16);
  }
}

function windowResized() {
  const s = canvasSize();
  resizeCanvas(s.width, s.height);
  setupSites();
}
