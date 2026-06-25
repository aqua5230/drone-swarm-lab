// 預先把每課 lesson.md 渲染成靜態 HTML，烤進該課 index.html 的 #lesson-notes。
// 目的：不跑 JS 的爬蟲／AI 答題引擎也讀得到課文（SEO/GEO）。
// 載入頁面後，shared/lesson.js 會用即時渲染版替換這段，使用者體驗不變（漸進增強）。
//
// 編輯任何 lesson.md 後，重跑一次即可同步靜態版本：
//   node tools/prerender.mjs
import { marked } from './marked.esm.js';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lessonsDir = join(root, 'lessons');
const SECTION = /(<section id="lesson-notes"[^>]*>)[\s\S]*?(<\/section>)/;

for (const id of readdirSync(lessonsDir)) {
  const mdPath = join(lessonsDir, id, 'lesson.md');
  const htmlPath = join(lessonsDir, id, 'index.html');
  let md, html;
  try {
    md = readFileSync(mdPath, 'utf8');
    html = readFileSync(htmlPath, 'utf8');
  } catch {
    continue;
  }
  if (!SECTION.test(html)) {
    console.warn(`跳過 ${id}：找不到 #lesson-notes`);
    continue;
  }
  const rendered = marked(md);
  // 用函式版替換，避免 rendered 內含 $ 被當成特殊樣式
  const next = html.replace(SECTION, (_m, open, close) => `${open}\n${rendered}${close}`);
  writeFileSync(htmlPath, next);
  console.log(`✓ ${id}`);
}
