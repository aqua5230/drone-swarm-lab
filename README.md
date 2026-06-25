# Swarm Lab · 群飛實驗室

> 用瀏覽器就能玩的**群飛智能（swarm intelligence）互動教學**。
> 一課一個概念、可拖滑桿親手調、附一手出處。打開即動，零安裝。

A browser-based, interactive playground for teaching **swarm intelligence** —
one concept per lesson, tweak it live, sourced. Open and play, zero install.

**▶ 線上玩**：<https://aqua5230.github.io/drone-swarm-lab/>（部署在 GitHub Pages）

## 為什麼做這個

群體的智能不住在任何單一個體身上，而住在「鄰居之間的規則」裡——
少數便宜的節點，靠局部互動長出整體行為。這個原則橫跨自然界（鳥群、魚群、蟻群）
與工程界（去中心化的多機器人系統）。本專案把這條原則一步步演示給任何人看。

**防衛關聯（背景脈絡）**：去中心化群飛之所以重要，在於它沒有可被斬首的中央、
通訊被干擾仍能協同、可低成本擴量——這些正是現代無人機自主作戰的核心議題。
本專案教的是**底層的群飛科學與自主原理**，不是武器製造。

## 課程（10 課，全可玩）

| # | 課 | 一句話概念 |
|---|---|---|
| 1 | Boids 三規則 | 分離／對齊／聚合——沒有指揮官的群飛，看「湧現」 |
| 2 | 去中心化 vs 中央控制 | 把「有老大」和「沒老大」擺一起斬首，看誰先垮 |
| 3 | 斷通訊還能協同嗎 | 剪通訊半徑＋封包遺失，看群體在哪一刻碎成孤島 |
| 4 | 從 10 隻到 2000 隻 | 同一套規則數量放大百倍，行為還在、電腦撐不撐得住 |
| 5 | 分散式感知 | 每隻只看一點點，合起來把整片迷霧掃乾淨 |
| 6 | 群體共識 | 蜜蜂不靠老大、靠交叉抑制全群選定同一個新家 |
| 7 | 費洛蒙與自組織分工 | 螞蟻只改環境不互相下令，最短路徑自己浮現 |
| 8 | 抗毀韌性 | 打掉一半個體，剩下的自己補位、重新蓋滿空缺 |
| 9 | 人在環路 | 自主歸自主，人類在哪一格按下同意？量化移走人類的代價 |
| 10 | 綜合沙盒 | 把前九課規則全丟進一個場：放障礙、放掠食者，自己玩 |

每課都附一手學術出處（Reynolds、Seeley、Dorigo、Baran 等）。

## 技術組合

- [p5.js](https://p5js.org/) — 畫面引擎
- [Tweakpane](https://tweakpane.github.io/docs/) — 即時調參面板
- [Open Props](https://open-props.style/) — 排版設計變數
- [marked](https://marked.js.org/) — 把每課的 `lesson.md` 教學文轉成網頁
- 純靜態檔，無建置工具；可直接掛 GitHub Pages

## 結構

```
index.html            首頁／課程目錄（由 shared/lessons.js 清單生成）
shared/
  lessons.js          課程清單＝單一事實來源
  site.js             頂部導覽（漢堡選單 → 抽屜式課程目錄）＋首頁卡片
  lesson.js           載入本課 lesson.md → marked 渲染
  style.css           全站樣式
lessons/<id>/
  index.html          薄殼：引 CDN + shared/* + 本課 sketch.js
  sketch.js           本課 p5 邏輯（global mode，一頁一個 sketch）
  lesson.md           本課教學文（Markdown）
```

**加一課** = 開一個 `lessons/<id>/` 放三檔 + `shared/lessons.js` 加一筆，前面的課不受影響。

### 編輯課文後要重跑預渲染

每課的教學文除了被 `shared/lesson.js` 即時渲染，也預先烤成**靜態 HTML** 塞進該課 `index.html`，
讓不跑 JS 的搜尋爬蟲與 AI 答題引擎也讀得到（SEO/GEO）。改過任何 `lesson.md` 後，重跑一次同步：

```bash
node tools/prerender.mjs   # 只需 node，marked 已內建在 tools/
```

## 本機怎麼跑

教學文用 `fetch` 載入，**不能直接雙擊開 `index.html`**（瀏覽器的 CORS 會擋），請起個本機伺服器：

```bash
python3 -m http.server 8000   # 然後開 http://localhost:8000
```

## 出處（部分）

- Craig W. Reynolds (1987) *Flocks, Herds, and Schools: A Distributed Behavioral Model*,
  SIGGRAPH '87. [原始頁](https://www.red3d.com/cwr/boids/)
- Paul Baran (1964) *On Distributed Communications*, RAND — 集中／去中心／分散三張網
- Thomas D. Seeley (2010) *Honeybee Democracy* — 蜜蜂共識與交叉抑制
- Marco Dorigo & Thomas Stützle (2004) *Ant Colony Optimization* — 費洛蒙最短路
- Daniel Shiffman, *The Nature of Code* — Autonomous Agents / Flocking 章

## 授權

[MIT](./LICENSE)
