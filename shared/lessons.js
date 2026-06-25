// 課程清單 —— 單一事實來源。加一課：這裡加一筆 + 開一個 lessons/<id>/ 資料夾。
// status: 'ready' 可點進去；'planned' 在目錄顯示為灰底「規劃中」、還沒做。
export const LESSONS = [
  {
    id: '01-boids',
    title: '第 1 課 · Boids 三規則',
    blurb: '分離／對齊／聚合——沒有指揮官的群飛，整群卻像一個生命體。',
    status: 'ready',
  },
  {
    id: '02-decentralized',
    title: '第 2 課 · 去中心化 vs 中央控制',
    blurb: '把「有老大」和「沒老大」擺在一起斬首，看誰先垮。',
    status: 'ready',
  },
  {
    id: '03-broken-comms',
    title: '第 3 課 · 斷通訊還能協同嗎',
    blurb: '剪掉通訊半徑、加上封包遺失，看群體在哪一刻碎成孤島。',
    status: 'ready',
  },
  {
    id: '04-scaling',
    title: '第 4 課 · 從 10 隻到 2000 隻',
    blurb: '同一套規則，數量放大百倍。行為還在嗎？電腦撐得住嗎？',
    status: 'ready',
  },
  {
    id: '05-sensing',
    title: '第 5 課 · 分散式感知',
    blurb: '每隻只看得到一點點，合起來卻能把整片戰場掃乾淨。',
    status: 'ready',
  },
  {
    id: '06-consensus',
    title: '第 6 課 · 群體共識',
    blurb: '蜜蜂怎麼不靠老大，全群選定同一個新家。',
    status: 'ready',
  },
  {
    id: '07-stigmergy',
    title: '第 7 課 · 費洛蒙與自組織分工',
    blurb: '螞蟻不留訊息給彼此，只改環境——最短路徑自己浮現。',
    status: 'ready',
  },
  {
    id: '08-resilience',
    title: '第 8 課 · 抗毀韌性',
    blurb: '打掉一半個體，剩下的自己補位、重新蓋滿空缺。',
    status: 'ready',
  },
  {
    id: '09-human-loop',
    title: '第 9 課 · 人在環路',
    blurb: '自主歸自主，人類在哪一格按下同意？畫出不可逾越的線。',
    status: 'ready',
  },
  {
    id: '10-sandbox',
    title: '第 10 課 · 綜合沙盒',
    blurb: '把前九課的規則全丟進同一個場：放障礙、放掠食者、自己玩。',
    status: 'ready',
  },
];
