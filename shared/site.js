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
  const here = LESSONS.find((lesson) => lesson.id === current);
  host.innerHTML =
    `<button class="nav-menu" aria-label="課程目錄" aria-expanded="false">☰ Swarm Lab</button>` +
    (here ? `<span class="nav-here">${here.title}</span>` : '') +
    (here ? `<div class="read-progress" aria-hidden="true"></div>` : '');

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
      withPartHeads(ready, (part) => `<h2 class="part-head">${part}</h2>`, (lesson) => {
        const cls = lesson.id === current ? ' class="current"' : '';
        return `<a href="${base}lessons/${lesson.id}/"${cls} aria-label="${lesson.title}">` +
          `<b>${lesson.title}</b><small aria-hidden="true">${lesson.blurb}</small></a>`;
      }) +
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
    (prev
      ? `<a class="prev" href="${base}lessons/${prev.id}/">` +
        `<span class="dir">← 上一課</span><span>${prev.title}</span></a>`
      : '<span></span>') +
    (next
      ? `<a class="next" href="${base}lessons/${next.id}/">` +
        `<span class="dir">下一課 →</span><span>${next.title}</span></a>`
      : '<span></span>');
  main.appendChild(foot);
}

// 首頁用：把每一課畫成一張卡片塞進 #lesson-grid。
export function mountIndex(base) {
  const host = document.getElementById('lesson-grid');
  if (!host) return;

  const countOf = (part) => LESSONS.filter((lesson) => lesson.part === part).length;
  host.innerHTML = withPartHeads(
    LESSONS,
    (part) => `<h2 class="part-head">${part}` +
      `<span class="count">${countOf(part)} 課</span></h2>`,
    (lesson, isPartLead) => {
      // 課名長成「第 1 課 · Boids 三規則」；把課號拆出來當眉標，
      // 標題就只剩概念本身，一整列掃過去讀得比較快。拆不出來就整串當標題。
      const [num, name] = splitTitle(lesson.title);
      const inner =
        (num ? `<span class="num">${num}</span>` : '') +
        `<h3>${name}</h3><p>${lesson.blurb}</p>`;
      // 每篇第一課排成跨兩欄的大卡片，一片等寬卡片才有輕重
      const lead = isPartLead ? ' lead' : '';
      if (lesson.status === 'ready') {
        return `<a class="lesson-card${lead}" href="${base}lessons/${lesson.id}/" ` +
          `aria-label="${lesson.title}">${inner}</a>`;
      }
      return `<div class="lesson-card planned${lead}">${inner}<span class="badge">規劃中</span></div>`;
    },
  );
}

// 「第 1 課 · Boids 三規則」→ ['第 1 課', 'Boids 三規則']。沒有分隔號就回傳 ['', 整串]。
function splitTitle(title) {
  const at = title.indexOf(' · ');
  return at === -1 ? ['', title] : [title.slice(0, at), title.slice(at + 3)];
}

// 全站頁尾：每頁一份，說明這是什麼、授權、原始碼在哪。
export function mountFoot(base) {
  const foot = document.createElement('footer');
  foot.className = 'site-foot';
  foot.innerHTML =
    `<div><span><b>Swarm Lab</b> · 群飛智能互動教學．MIT 授權、內容開源</span>` +
    `<nav aria-label="頁尾"><a href="${base}">課程首頁</a>` +
    `<a href="https://github.com/aqua5230/drone-swarm-lab">原始碼</a></nav></div>`;
  document.body.appendChild(foot);
}

// 課程清單依 part 分篇：換篇時插一條標題，篇名相同的連續排在一起。
// 沒寫 part 的課就不插標題，加課忘了填也不會壞。
// item 會收到第二個參數：這一課是不是所屬篇的第一課（首頁用它排大卡片）。
function withPartHeads(lessons, head, item) {
  let seen = null;
  return lessons.map((lesson) => {
    const isPartLead = Boolean(lesson.part) && lesson.part !== seen;
    const lead = isPartLead ? head(lesson.part) : '';
    if (lesson.part) seen = lesson.part;
    return lead + item(lesson, isPartLead);
  }).join('');
}
