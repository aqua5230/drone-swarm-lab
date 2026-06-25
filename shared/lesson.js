// 共用：把本課的教學文（lesson.md）讀進來、轉成網頁、塞進指定容器。
// marked 是把 Markdown（純文字標記語法）轉成 HTML 的小工具，從 CDN 直接載入。
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/lib/marked.esm.js';

// mdPath：要載入的 .md 檔（同資料夾傳 'lesson.md' 即可）
// targetSelector：要把結果塞進哪個容器（例 '#lesson-notes'）
export async function mountLesson(mdPath, targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  try {
    const res = await fetch(mdPath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    target.innerHTML = marked.parse(md);
    // 盤古之白：中文與英文／數字之間自動補小空隙，讀起來更透氣。
    if (window.pangu) window.pangu.spacingNode(target);
    wirePresetButtons(target);
  } catch (err) {
    // 多半是直接用 file:// 開、被瀏覽器擋了。提示走本機伺服器。
    target.innerHTML =
      '<p>教學文載入失敗，請用 <code>python3 -m http.server</code> 開啟，' +
      '不要直接雙擊 html 檔。</p>';
    console.error('mountLesson 失敗：', err);
  }
}

// 文章裡的 <button data-preset='{...}'> 點下去 → 把那組參數套進模擬。
// 每課的 sketch.js 自己掛一個 window.applyLessonPreset；第 1 課沿用舊名 applyBoidsPreset。
function wirePresetButtons(target) {
  target.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-preset]');
    const apply = window.applyLessonPreset || window.applyBoidsPreset;
    if (!button || typeof apply !== 'function') return;
    try {
      apply(JSON.parse(button.dataset.preset));
    } catch (err) {
      console.error('preset 解析失敗：', err);
    }
  });
}
