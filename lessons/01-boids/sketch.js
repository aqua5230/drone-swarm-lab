// ============================================================
// 第 1 課 · Boids 群飛 —— 核心邏輯（待 Codex 實作）
//
// 目標：用 p5.js 畫出一群 boid，每個只看附近鄰居、跑三條規則，
//       並用 Tweakpane 提供即時可調的滑桿。
//
// 參考：Reynolds 1987；Daniel Shiffman《The Nature of Code》flocking 章。
// 規則命名（原始 → 通行）：
//   Collision Avoidance → 分離 Separation
//   Velocity Matching   → 對齊 Alignment
//   Flock Centering     → 聚合 Cohesion
// ============================================================

// 可調參數：Tweakpane 綁這個物件，滑桿一動就即時生效
const params = {
  count: 150,            // boid 數量
  perception: 50,        // 感知半徑（只看這範圍內的鄰居）
  maxSpeed: 3.5,         // 最高速度
  maxForce: 0.05,        // 最大轉向力
  separation: 1.5,       // 分離權重
  alignment: 1.0,        // 對齊權重
  cohesion: 1.0,         // 聚合權重
  showPerception: false, // 是否畫出感知圈（教學用）
};

let flock = [];
let killCount = 0;
let killEffects = [];
let pane = null;
let paneElement = null;

const KILL_RADIUS = 35;
const KILL_EFFECT_FRAMES = 20;
const TRAIL_LENGTH = 12;
const TRAIL_WRAP_BREAK_DISTANCE = () => width * 0.5;
const BOID_HUE_MIN = 180;
const BOID_HUE_MAX = 290;
const BOID_SATURATION = 76;
const BOID_BRIGHTNESS = 96;

function clampGridIndex(value, maxIndex) {
  return Math.max(0, Math.min(maxIndex, value));
}

function buildSpatialGrid(boids) {
  const cellSize = Math.max(1, params.perception);
  const columns = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const cells = new Array(columns * rows);

  for (const boid of boids) {
    const col = clampGridIndex(Math.floor(boid.position.x / cellSize), columns - 1);
    const row = clampGridIndex(Math.floor(boid.position.y / cellSize), rows - 1);
    const index = row * columns + col;

    if (!cells[index]) {
      cells[index] = [];
    }
    cells[index].push(boid);
  }

  return {
    cellSize,
    columns,
    rows,
    cells,
  };
}

class Boid {
  constructor() {
    this.position = createVector(random(width), random(height));
    this.velocity = p5.Vector.random2D();
    this.velocity.setMag(random(params.maxSpeed * 0.3, params.maxSpeed));
    this.acceleration = createVector(0, 0);
    this.trail = [];
  }

  edges() {
    let wrapped = false;

    if (this.position.x > width) {
      this.position.x = 0;
      wrapped = true;
    }
    if (this.position.x < 0) {
      this.position.x = width;
      wrapped = true;
    }
    if (this.position.y > height) {
      this.position.y = 0;
      wrapped = true;
    }
    if (this.position.y < 0) {
      this.position.y = height;
      wrapped = true;
    }

    if (wrapped) {
      this.trail = [];
    }
  }

  flock(grid) {
    this.applyFlockingForces(grid);
  }

  applyFlockingForces(grid) {
    const cellCol = clampGridIndex(Math.floor(this.position.x / grid.cellSize), grid.columns - 1);
    const cellRow = clampGridIndex(Math.floor(this.position.y / grid.cellSize), grid.rows - 1);
    const perception = params.perception;

    let separationX = 0;
    let separationY = 0;
    let separationTotal = 0;
    let alignmentX = 0;
    let alignmentY = 0;
    let cohesionX = 0;
    let cohesionY = 0;
    let neighborTotal = 0;

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      const row = cellRow + rowOffset;
      if (row < 0 || row >= grid.rows) {
        continue;
      }

      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        const col = cellCol + colOffset;
        if (col < 0 || col >= grid.columns) {
          continue;
        }

        const cell = grid.cells[row * grid.columns + col];
        if (!cell) {
          continue;
        }

        for (const other of cell) {
          if (other === this) {
            continue;
          }

          const dx = this.position.x - other.position.x;
          const dy = this.position.y - other.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < perception) {
            alignmentX += other.velocity.x;
            alignmentY += other.velocity.y;
            cohesionX += other.position.x;
            cohesionY += other.position.y;
            neighborTotal += 1;

            if (distance > 0) {
              const weightedDistance = distance * distance;
              // 與原本 separation() 相同：越近的鄰居影響越強。
              separationX += dx / weightedDistance;
              separationY += dy / weightedDistance;
              separationTotal += 1;
            }
          }
        }
      }
    }

    if (separationTotal > 0) {
      const separation = createVector(separationX, separationY);
      separation.div(separationTotal);
      separation.setMag(params.maxSpeed);
      separation.sub(this.velocity);
      separation.limit(params.maxForce);
      separation.mult(params.separation);
      this.acceleration.add(separation);
    }

    if (neighborTotal > 0) {
      const alignment = createVector(alignmentX, alignmentY);
      alignment.div(neighborTotal);
      alignment.setMag(params.maxSpeed);
      alignment.sub(this.velocity);
      alignment.limit(params.maxForce);
      alignment.mult(params.alignment);
      this.acceleration.add(alignment);

      const cohesion = createVector(cohesionX, cohesionY);
      cohesion.div(neighborTotal);
      cohesion.sub(this.position);
      cohesion.setMag(params.maxSpeed);
      cohesion.sub(this.velocity);
      cohesion.limit(params.maxForce);
      cohesion.mult(params.cohesion);
      this.acceleration.add(cohesion);
    }
  }

  update() {
    this.velocity.add(this.acceleration);
    this.velocity.limit(params.maxSpeed);
    this.position.add(this.velocity);
    this.acceleration.mult(0);
  }

  headingHue() {
    const normalizedHeading = (this.velocity.heading() + PI) / TWO_PI;
    return lerp(BOID_HUE_MIN, BOID_HUE_MAX, normalizedHeading);
  }

  recordTrail() {
    const last = this.trail[this.trail.length - 1];
    if (last && dist(last.x, last.y, this.position.x, this.position.y) > TRAIL_WRAP_BREAK_DISTANCE()) {
      this.trail = [];
    }

    this.trail.push({
      x: this.position.x,
      y: this.position.y,
    });

    if (this.trail.length > TRAIL_LENGTH) {
      this.trail.shift();
    }
  }

  drawTrail(hue) {
    if (this.trail.length < 2) {
      return;
    }

    // 尾跡畫成「一條連續線」（一次 beginShape/endShape），而不是每段各畫一次 line()。
    // 數百隻時，前者的描繪呼叫量是後者的十分之一，這是消除卡頓的關鍵。
    const breakDistance = TRAIL_WRAP_BREAK_DISTANCE();
    push();
    colorMode(HSB, 360, 100, 100, 1);
    noFill();
    stroke(hue, BOID_SATURATION, BOID_BRIGHTNESS, 0.34);
    strokeWeight(2.2);

    beginShape();
    let prev = this.trail[0];
    vertex(prev.x, prev.y);
    for (let i = 1; i < this.trail.length; i += 1) {
      const point = this.trail[i];
      // 穿越邊界造成的瞬移：把線斷開，別橫跨整個畫面。
      if (dist(prev.x, prev.y, point.x, point.y) > breakDistance) {
        endShape();
        beginShape();
      }
      vertex(point.x, point.y);
      prev = point;
    }
    endShape();

    pop();
  }

  show() {
    if (params.showPerception) {
      noFill();
      stroke(125, 211, 252, 60);
      strokeWeight(1);
      circle(this.position.x, this.position.y, params.perception * 2);
    }

    const angle = this.velocity.heading();
    const hue = this.headingHue();

    this.drawTrail(hue);

    push();
    colorMode(HSB, 360, 100, 100, 1);
    translate(this.position.x, this.position.y);
    noStroke();
    // 便宜的柔光：一個放大、半透明的同色圓暈，取代昂貴的 shadowBlur。
    fill(hue, BOID_SATURATION, BOID_BRIGHTNESS, 0.16);
    circle(0, 0, 17);
    rotate(angle);
    fill(hue, BOID_SATURATION, BOID_BRIGHTNESS, 0.96);
    triangle(10, 0, -7, -5, -7, 5);
    pop();
  }
}

function resetFlock() {
  flock = [];
  for (let i = 0; i < params.count; i += 1) {
    flock.push(new Boid());
  }
}

function resetCommanderDemo() {
  resetFlock();
  killCount = 0;
  killEffects = [];
}

window.applyBoidsPreset = function applyBoidsPreset(partial) {
  if (!partial || typeof partial !== 'object') {
    return;
  }

  const shouldResetFlock = Object.prototype.hasOwnProperty.call(partial, 'count');
  Object.assign(params, partial);

  if (shouldResetFlock) {
    resetFlock();
  }

  if (pane) {
    pane.refresh();
  }
};

function canvasSize() {
  const holder = document.getElementById('canvas-holder');
  return {
    width: holder ? holder.clientWidth : windowWidth,
    height: 540,
  };
}

function createControls() {
  // 若頁面有指定容器，把面板掛進去（釘在畫布旁）；否則維持預設浮在右上。
  const container = document.getElementById('controls-holder');
  pane = container
    ? new Tweakpane.Pane({ title: 'Boids 參數', container })
    : new Tweakpane.Pane({ title: 'Boids 參數' });

  pane.addBinding(params, 'count', { min: 10, max: 400, step: 1 }).on('change', resetFlock);
  pane.addBinding(params, 'perception', { min: 10, max: 160, step: 1 });
  pane.addBinding(params, 'maxSpeed', { min: 0.5, max: 8, step: 0.1 });
  pane.addBinding(params, 'maxForce', { min: 0.01, max: 0.3, step: 0.01 });
  pane.addBinding(params, 'separation', { min: 0, max: 4, step: 0.1 });
  pane.addBinding(params, 'alignment', { min: 0, max: 4, step: 0.1 });
  pane.addBinding(params, 'cohesion', { min: 0, max: 4, step: 0.1 });
  pane.addBinding(params, 'showPerception');
  pane.addButton({ title: '重置群體' }).on('click', resetCommanderDemo);

  paneElement = pane.element;
}

// 面板可能蓋在畫布右上角，操作滑桿時別誤殺底下的 boid。
function pointerOverPane() {
  if (!paneElement) return false;
  const rect = paneElement.getBoundingClientRect();
  return (
    winMouseX >= rect.left &&
    winMouseX <= rect.right &&
    winMouseY >= rect.top &&
    winMouseY <= rect.bottom
  );
}

function findNearestBoidIndex(x, y) {
  let nearestIndex = -1;
  let nearestDistance = KILL_RADIUS;

  for (let i = 0; i < flock.length; i += 1) {
    const boid = flock[i];
    const distance = dist(x, y, boid.position.x, boid.position.y);

    if (distance <= nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

function pointerOverCanvas() {
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

function createKillFragments() {
  const fragments = [];
  const fragmentCount = floor(random(6, 9));

  for (let i = 0; i < fragmentCount; i += 1) {
    fragments.push({
      angle: random(TWO_PI),
      speed: random(1.4, 3.2),
      length: random(5, 10),
    });
  }

  return fragments;
}

function drawTargetHighlight() {
  if (!pointerOverCanvas() || pointerOverPane()) {
    return;
  }

  const boidIndex = findNearestBoidIndex(mouseX, mouseY);
  if (boidIndex === -1) {
    return;
  }

  const boid = flock[boidIndex];
  push();
  noFill();
  stroke(250, 204, 21, 230);
  strokeWeight(2.5);
  circle(boid.position.x, boid.position.y, KILL_RADIUS * 2);
  pop();
}

function mousePressed() {
  // p5 的 mousePressed 是全域事件；先排除畫布外點擊與面板上的操作，避免誤殺。
  if (!pointerOverCanvas()) {
    return;
  }
  if (pointerOverPane()) {
    return;
  }

  const boidIndex = findNearestBoidIndex(mouseX, mouseY);
  if (boidIndex === -1) {
    return;
  }

  const killedBoid = flock[boidIndex];
  killEffects.push({
    x: killedBoid.position.x,
    y: killedBoid.position.y,
    age: 0,
    fragments: createKillFragments(),
  });
  flock.splice(boidIndex, 1);
  killCount += 1;
}

function drawKillEffects() {
  killEffects = killEffects.filter((effect) => effect.age < KILL_EFFECT_FRAMES);

  for (const effect of killEffects) {
    const progress = effect.age / KILL_EFFECT_FRAMES;
    const radius = 10 + progress * 32;
    const alpha = 220 * (1 - progress);

    noFill();
    stroke(248, 113, 113, alpha);
    strokeWeight(2);
    circle(effect.x, effect.y, radius * 2);

    for (const fragment of effect.fragments) {
      const distance = fragment.speed * effect.age;
      const x = effect.x + cos(fragment.angle) * distance;
      const y = effect.y + sin(fragment.angle) * distance;
      const tailX = x - cos(fragment.angle) * fragment.length;
      const tailY = y - sin(fragment.angle) * fragment.length;

      stroke(252, 211, 77, alpha);
      strokeWeight(2);
      line(tailX, tailY, x, y);
    }

    effect.age += 1;
  }
}

function drawHud() {
  push();
  textFont('sans-serif');

  noStroke();
  fill(241, 245, 249, 230);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`已擊殺『指揮官』：${killCount}`, 16, 14);

  fill(203, 213, 225, 210);
  textSize(13);
  text('群體：仍在飛行 — 沒有中央可斬首', 16, 36);

  fill(203, 213, 225, 155);
  textSize(13);
  textAlign(CENTER, BOTTOM);
  text('點任何一隻，當作牠是老大，殺掉牠', width / 2, height - 12);

  pop();
}

function setup() {
  const size = canvasSize();
  const canvas = createCanvas(size.width, size.height);
  canvas.parent('canvas-holder');
  canvas.style('cursor', 'crosshair');

  resetFlock();
  createControls();
}

function draw() {
  colorMode(RGB, 255, 255, 255, 255);
  background(15, 23, 42);

  const spatialGrid = buildSpatialGrid(flock);

  for (const boid of flock) {
    boid.flock(spatialGrid);
    boid.update();
    boid.edges();
    boid.recordTrail();
    boid.show();
  }

  colorMode(RGB, 255, 255, 255, 255);
  drawTargetHighlight();
  drawKillEffects();
  drawHud();
}

function windowResized() {
  const size = canvasSize();
  resizeCanvas(size.width, size.height);
}
