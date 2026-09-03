// 共用：渲染頂部導覽列 + 首頁目錄。
// base 參數 = 從目前這頁回到網站根目錄要走的相對路徑：
//   首頁傳 ''；課內頁（lessons/01-boids/）傳 '../../'。
// 這樣多頁之間的連結不會因為所在資料夾不同而失效。
import { LESSONS } from './lessons.js';

// 把導覽列塞進 #site-nav。current = 目前所在課的 id（首頁傳 null）。
// 設計參考一流 explorable 站（Eloquent JavaScript、Book of Shaders）：頂部只放
// 品牌＋一顆「目錄」鈕，點開從右側滑出抽屜列全部課程；課內頁底部放上一課／下一課。
export function mountNav(base, current) {
  const host = document.getElementById('site-nav');
  if (!host) return;

  // 一頁上有兩個 <nav>（頂部與課末），各給一個名字才分得出來
  host.setAttribute('aria-label', '網站導覽');

  // 左上單一入口：品牌＝目錄鈕，點了開抽屜（避免「品牌」「目錄」兩顆功能重疊）
  const ready = LESSONS.filter((lesson) => lesson.status === 'ready');
  host.innerHTML =
    `<button class="nav-menu" aria-label="課程目錄" aria-expanded="false">☰ Swarm Lab</button>`;

  // 抽屜式課程目錄：平常收起，點按鈕才滑出
  const drawer = document.createElement('div');
  drawer.className = 'nav-drawer';
  drawer.hidden = true;
  drawer.innerHTML =
    `<div class="nav-drawer-backdrop"></div>` +
    `<aside class="nav-drawer-panel">` +
      `<div class="nav-drawer-head">` +
      `<a class="nav-drawer-home" href="${base}">課程首頁</a>` +
      `<button class="nav-drawer-close" aria-label="關閉">✕</button></div>` +
      ready.map((lesson) => {
        const cls = lesson.id === current ? ' class="current"' : '';
        return `<a href="${base}lessons/${lesson.id}/"${cls} aria-label="${lesson.title}">` +
          `<b>${lesson.title}</b><small aria-hidden="true">${lesson.blurb}</small></a>`;
      }).join('') +
    `</aside>`;
  document.body.appendChild(drawer);

  // 抽屜蓋住整頁：開的時候把背景設成 inert（不可點、Tab 也走不進去），
  // 焦點送進抽屜；關的時候還原並把焦點交還給開啟鈕，鍵盤使用者才不會迷路。
  const menu = host.querySelector('.nav-menu');
  const main = document.querySelector('main');
  const setDrawer = (open) => {
    drawer.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    host.inert = open;
    if (main) main.inert = open;
    if (open) drawer.querySelector('.nav-drawer-close').focus();
    else menu.focus();
  };
  const close = () => { if (!drawer.hidden) setDrawer(false); };
  menu.addEventListener('click', () => { setDrawer(true); });
  drawer.querySelector('.nav-drawer-backdrop').addEventListener('click', close);
  drawer.querySelector('.nav-drawer-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  if (current) {
    mountFootNav(base, current, ready);
    labelControlPanel();
  }
}

// Tweakpane 的數值輸入框只有旁邊一行純文字當參數名，沒有真的 <label>，
// 螢幕閱讀器讀到那格會不知道是哪個參數。面板由各課 sketch.js 在 p5 setup() 裡建、
// 時機不定，所以盯著容器，一有東西出現就把參數名補成 aria-label。
function labelControlPanel() {
  const holder = document.getElementById('controls-holder');
  if (!holder) return;

  const label = () => {
    for (const row of holder.querySelectorAll('.tp-lblv')) {
      const name = row.querySelector('.tp-lblv_l');
      if (!name) continue;
      // 滑桿與數字格是 input，下拉選單（Tweakpane 的 list）是 select
      for (const field of row.querySelectorAll('input:not([aria-label]), select:not([aria-label])')) {
        field.setAttribute('aria-label', name.textContent.trim());
      }
    }
  };

  label();
  new MutationObserver(label).observe(holder, { childList: true, subtree: true });
}

// 課內頁底部的「上一課／下一課」，順著讀不用回目錄
function mountFootNav(base, current, ready) {
  const main = document.querySelector('main');
  if (!main) return;
  const idx = ready.findIndex((lesson) => lesson.id === current);
  const prev = ready[idx - 1];
  const next = ready[idx + 1];
  const foot = document.createElement('nav');
  foot.className = 'lesson-foot';
  foot.setAttribute('aria-label', '上一課／下一課');
  foot.innerHTML =
    (prev ? `<a class="prev" href="${base}lessons/${prev.id}/">← ${prev.title}</a>` : '<span></span>') +
    (next ? `<a class="next" href="${base}lessons/${next.id}/">${next.title} →</a>` : '<span></span>');
  main.appendChild(foot);
}

// 首頁用：把每一課畫成一張卡片塞進 #lesson-grid。
export function mountIndex(base) {
  const host = document.getElementById('lesson-grid');
  if (!host) return;

  host.innerHTML = LESSONS.map((lesson) => {
    const inner =
      `<h2>${lesson.title}</h2><p>${lesson.blurb}</p>`;
    if (lesson.status === 'ready') {
      return `<a class="lesson-card" href="${base}lessons/${lesson.id}/">${inner}</a>`;
    }
    return `<div class="lesson-card planned">${inner}<span class="badge">規劃中</span></div>`;
  }).join('');
}
