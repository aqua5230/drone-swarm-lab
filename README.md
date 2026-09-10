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

## 課程（18 課，全可玩）

**基礎篇** 1–10：從「沒有指揮官也能成群」一路走到綜合沙盒。
**進階篇** 11–14：拆掉基礎篇沒說破的四個假設——同一個節拍、大家都知道要去哪、沒有人說謊、有人分派座位。
**群體物理篇** 15–18：換成物理學家的問法——這些行為什麼時候出現、什麼時候突然消失。

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
| 11 | 螢火蟲同步 | 沒有共同時鐘，「看到旁邊閃就提早一點」讓整群閃成同一拍 |
| 12 | 少數知情者領路 | 只有 5% 知道方向、沒人喊口令，整群卻走對；意見分裂時折衷或選邊 |
| 13 | 群裡混進叛徒 | 平均被 3% 假值吃掉全網；中位數守到三成五，但半徑一小就從鄰里破 |
| 14 | 自組裝隊形 | 梯度＋邊緣跟隨兩條規則，沒人分派座位也長出指定形狀 |
| 15 | 鄰居是「幾隻」不是「幾公尺」 | 椋鳥只跟最近的六七隻互動；換鄰居定義，群體散不散就反過來 |
| 16 | 秩序參數與臨界雜訊 | 把整齊度壓成一個數字，雜訊過臨界點整群啪一下垮掉 |
| 17 | 人流自己分出車道 | 兩股人相向而行，沒人畫線，密度一高車道自己浮出來 |
| 18 | 蝗蟲的密度門檻 | 規則沒變、只是擠得更近，整群就從亂走變成同向行軍 |

每課都附一手學術出處（Reynolds、Seeley、Dorigo、Baran、Couzin、Lamport、Nagpal 等）。

## 技術組合

- [p5.js](https://p5js.org/) — 畫面引擎
- [Tweakpane](https://tweakpane.github.io/docs/) — 即時調參面板
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) — 標題字（只載 Latin，中文走系統字）
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

**加一課** = 開一個 `lessons/<id>/` 放三檔 + `shared/lessons.js` 加一筆（含 `part` 篇名），前面的課不受影響。

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
  SIGGRAPH ’87. [原始頁](https://www.red3d.com/cwr/boids/)
- Paul Baran (1964) *On Distributed Communications*, RAND — 集中／去中心／分散三張網
- Thomas D. Seeley (2010) *Honeybee Democracy* — 蜜蜂共識與交叉抑制
- Marco Dorigo & Thomas Stützle (2004) *Ant Colony Optimization* — 費洛蒙最短路
- Renato E. Mirollo & Steven H. Strogatz (1990) *Synchronization of Pulse-Coupled Biological Oscillators*,
  SIAM J. Appl. Math. 50(6): 1645–1662 — 脈衝耦合同步
- Iain D. Couzin et al. (2005) *Effective leadership and decision-making in animal groups on the move*,
  Nature 433(7025): 513–516 — 知情少數帶動整群
- Leslie Lamport, Robert Shostak & Marshall Pease (1982) *The Byzantine Generals Problem*,
  ACM TOPLAS 4(3): 382–401 — 群裡有人說謊時的共識條件
- Michael Rubenstein, Alejandro Cornejo & Radhika Nagpal (2014) *Programmable self-assembly in a
  thousand-robot swarm*, Science 345(6198): 795–799 — Kilobots 千機自組裝
- Michele Ballerini et al. (2008) *Interaction ruling animal collective behavior depends on topological
  rather than metric distance*, PNAS 105(4): 1232–1237 — 椋鳥的拓樸鄰居
- Tamás Vicsek et al. (1995) *Novel type of phase transition in a system of self-driven particles*,
  Phys. Rev. Lett. 75(6): 1226–1229 — 秩序參數與臨界雜訊
- Dirk Helbing & Péter Molnár (1995) *Social force model for pedestrian dynamics*,
  Phys. Rev. E 51(5): 4282–4286 — 人流自組織分道
- Jérôme Buhl et al. (2006) *From Disorder to Order in Marching Locusts*,
  Science 312(5778): 1402–1406 — 蝗蟲的密度相變
- Daniel Shiffman, *The Nature of Code* — Autonomous Agents / Flocking 章

## 授權

[MIT](./LICENSE)
