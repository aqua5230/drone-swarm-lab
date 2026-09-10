// 共用：把模擬參數存進網址，讓一個調好的場景可以複製連結分享。
//
// 用法（各課 sketch.js 的 setup() 第一行）：SwarmLink.init(params);
// 之所以放在 setup() 最前面：這時 params 還是預設值，正好當「原廠設定」的快照，
// 而且 reset()、createControls() 都還沒跑，套進來的值會直接生效。
//
// 網址長這樣：...#count=140&rule=median　—— 只寫被改過的參數，沒改的不佔位子。
// 這支是一般 script（不是 module），因為各課 sketch.js 也是一般 script。

window.SwarmLink = (function () {
  let params = null;
  let defaults = null;

  // 依「原廠設定的型別」把網址上的字串轉回原本的型別，轉不動就不採用。
  function coerce(raw, sample) {
    if (typeof sample === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    if (typeof sample === 'boolean') return raw === '1' || raw === 'true';
    if (typeof sample === 'string') return raw;
    return undefined;            // 物件、陣列這類不放進網址
  }

  // 網址 → 參數。只認得原廠設定裡有的鍵，別人亂加的一律忽略。
  function readHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    const patch = {};
    for (const [key, raw] of new URLSearchParams(hash)) {
      if (!(key in defaults)) continue;
      const value = coerce(raw, defaults[key]);
      if (value !== undefined) patch[key] = value;
    }
    return Object.keys(patch).length ? patch : null;
  }

  // 參數 → 網址字串。跟原廠一樣的就不寫，連結才短、也才看得出改了什麼。
  function toHash() {
    const parts = [];
    for (const key of Object.keys(defaults)) {
      const now = params[key];
      const base = defaults[key];
      if (now === base) continue;
      if (typeof base === 'number') parts.push(`${key}=${Math.round(now * 1000) / 1000}`);
      else if (typeof base === 'boolean') parts.push(`${key}=${now ? 1 : 0}`);
      else if (typeof base === 'string') parts.push(`${key}=${encodeURIComponent(now)}`);
    }
    return parts.join('&');
  }

  function currentUrl() {
    const hash = toHash();
    return location.origin + location.pathname + location.search + (hash ? '#' + hash : '');
  }

  // 畫布下方那一條：左邊說現在改了幾個參數，右邊兩顆鈕。
  function mountBar() {
    const stage = document.querySelector('.stage');
    if (!stage) return;

    const bar = document.createElement('div');
    bar.className = 'share-bar';
    bar.innerHTML =
      '<span class="share-state" aria-live="polite">目前是預設場景</span>' +
      '<span class="share-acts">' +
      '<button type="button" class="share-copy">🔗 複製這個場景的連結</button>' +
      '<button type="button" class="share-reset">↺ 回到預設</button>' +
      '</span>';
    stage.appendChild(bar);

    const state = bar.querySelector('.share-state');
    const copyBtn = bar.querySelector('.share-copy');

    // 每半秒看一次參數有沒有變：Tweakpane 的旋鈕、課文裡的按鈕、畫布上的點擊
    // 都會改到 params，與其每個入口各掛一次通知，不如在這裡統一盯著。
    const refresh = () => {
      const n = toHash() ? toHash().split('&').length : 0;
      state.textContent = n === 0 ? '目前是預設場景' : `已改動 ${n} 個參數`;
      bar.classList.toggle('dirty', n > 0);
    };
    refresh();
    setInterval(refresh, 500);

    copyBtn.addEventListener('click', async () => {
      const url = currentUrl();
      history.replaceState(null, '', url);
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = '✓ 已複製，貼給別人就是這個場景';
      } catch {
        // 沒開剪貼簿權限（或不是 https）時退而求其次：網址列已經更新，請他自己複製
        copyBtn.textContent = '✓ 網址已更新，複製網址列即可';
      }
      setTimeout(() => { copyBtn.textContent = '🔗 複製這個場景的連結'; }, 2600);
    });

    bar.querySelector('.share-reset').addEventListener('click', () => {
      const apply = window.applyLessonPreset || window.applyBoidsPreset;
      history.replaceState(null, '', location.pathname + location.search);
      if (typeof apply === 'function') apply(structuredClone(defaults));
      refresh();
    });
  }

  return {
    // 在 setup() 最前面呼叫。傳進來的就是那一課的 params 物件本身（要能改到它）。
    init(lessonParams) {
      params = lessonParams;
      defaults = structuredClone(lessonParams);
      const patch = readHash();
      if (patch) Object.assign(params, patch);
      // p5 的 setup() 跑在 DOM 齊了之後，直接掛就好
      mountBar();
    },
  };
}());
