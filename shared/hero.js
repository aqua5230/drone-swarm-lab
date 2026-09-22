// 首頁背景：小群 boids 在文字背後流動，不依賴 p5，避免影響課程的 global mode。
(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let boids = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let visible = true;

  function makeBoid() {
    const angle = Math.random() * Math.PI * 2;
    return { x: Math.random() * width, y: Math.random() * height,
      vx: Math.cos(angle), vy: Math.sin(angle) };
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(60, Math.min(90, Math.round(width * height / 8500)));
    boids = Array.from({ length: count }, makeBoid);
  }

  function step() {
    for (const boid of boids) {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, nearby = 0;
      for (const other of boids) {
        if (boid === other) continue;
        const dx = other.x - boid.x, dy = other.y - boid.y, d2 = dx * dx + dy * dy;
        if (d2 > 76 * 76) continue;
        nearby++;
        ax += other.vx; ay += other.vy; cx += other.x; cy += other.y;
        if (d2 < 28 * 28) { sx -= dx / (d2 + 1); sy -= dy / (d2 + 1); }
      }
      if (nearby) {
        boid.vx += sx * .06 + (ax / nearby - boid.vx) * .035 + (cx / nearby - boid.x) * .0007;
        boid.vy += sy * .06 + (ay / nearby - boid.vy) * .035 + (cy / nearby - boid.y) * .0007;
      }
      const speed = Math.hypot(boid.vx, boid.vy);
      if (speed < .001) { boid.vx = 1; boid.vy = 0; }
      else {
        boid.vx = boid.vx / speed * Math.min(2.1, Math.max(.7, speed));
        boid.vy = boid.vy / speed * Math.min(2.1, Math.max(.7, speed));
      }
      boid.x += boid.vx; boid.y += boid.vy;
      if (boid.x < -8) boid.x = width + 8;
      if (boid.x > width + 8) boid.x = -8;
      if (boid.y < -8) boid.y = height + 8;
      if (boid.y > height + 8) boid.y = -8;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const boid of boids) {
      const angle = Math.atan2(boid.vy, boid.vx);
      ctx.save();
      ctx.translate(boid.x, boid.y); ctx.rotate(angle);
      ctx.fillStyle = `hsla(${195 + (angle + Math.PI) * 11}, 88%, 70%, .62)`;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 4); ctx.lineTo(-2, 0); ctx.lineTo(-5, -4); ctx.fill();
      ctx.restore();
    }
  }

  function animate() {
    frame = 0;
    if (!visible || document.hidden || reduce.matches) return;
    step(); draw();
    frame = requestAnimationFrame(animate);
  }

  function update() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    draw();
    if (visible && !document.hidden && !reduce.matches) frame = requestAnimationFrame(animate);
  }

  resize(); draw(); update();
  // 手機捲動時網址列伸縮也會觸發 resize，只有寬度變了才重排，免得整群重生跳一下
  addEventListener('resize', () => {
    if (hero.getBoundingClientRect().width === width) return;
    resize(); update();
  });
  document.addEventListener('visibilitychange', update);
  reduce.addEventListener('change', update);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(hero);
})();
