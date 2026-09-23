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
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lessonsDir = join(root, 'lessons');
const SECTION = /(<section id="lesson-notes"[^>]*>)[\s\S]*?(<\/section>)/;
const JSON_LD = /(<script type="application\/ld\+json">\s*)(\{[\s\S]*?\})(\s*<\/script>)/;

function lastModified(id) {
  try {
    const date = execFileSync('git', [
      'log', '-1', '--format=%cs', '--',
      `lessons/${id}/lesson.md`, `lessons/${id}/sketch.js`,
    ], { cwd: root, encoding: 'utf8' }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  } catch {
    return null;
  }
}

function updateDateModified(html, id) {
  const date = lastModified(id);
  if (!date) return html;
  return html.replace(JSON_LD, (match, open, json, close) => {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return match;
    }
    if (data['@type'] !== 'LearningResource') return match;
    const propertyIndent = json.match(/\n(\s+)"@context"/)?.[1] || '    ';
    const nextJson = /"dateModified"\s*:/.test(json)
      ? json.replace(/\n\s*"dateModified"\s*:\s*"[^"]*"/,
        `\n${propertyIndent}"dateModified": "${date}"`)
      : json.replace(/\n(\s*)}\s*$/, (_end, indent) =>
        `,\n${propertyIndent}"dateModified": "${date}"\n${indent}}`);
    return `${open}${nextJson}${close}`;
  });
}

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
  const renderedHtml = html.replace(SECTION, (_m, open, close) => `${open}\n${rendered}${close}`);
  const next = updateDateModified(renderedHtml, id);
  writeFileSync(htmlPath, next);
  console.log(`✓ ${id}`);
}
