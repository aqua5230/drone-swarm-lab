# 截每課模擬畫面當首頁卡片縮圖：lessons/<id>/thumb.webp（640×400）。
# 模擬改了外觀後重跑：先 python3 -m http.server 8777，再 python3 tools/thumbs.py
import io, subprocess, sys
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
ids = sys.argv[1:] or sorted(p.name for p in (root / 'lessons').iterdir() if (p / 'sketch.js').exists())

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    for lesson in ids:
        page.goto(f'http://localhost:8777/lessons/{lesson}/')
        # 面板疊在畫布右上角，截圖前藏起來；讓模擬跑幾秒，畫面才有東西
        page.add_style_tag(content='#controls-holder { display: none !important; }')
        page.wait_for_timeout(5000)
        shot = Image.open(io.BytesIO(page.locator('#canvas-holder canvas').screenshot()))
        # 裁成 16:10，取畫布中間
        w, h = shot.size
        cw = min(w, round(h * 1.6))
        ch = round(cw / 1.6)
        left, top = (w - cw) // 2, (h - ch) // 2
        png = root / 'lessons' / lesson / 'thumb.png'
        shot.crop((left, top, left + cw, top + ch)).resize((640, 400), Image.LANCZOS).save(png)
        subprocess.run(['cwebp', '-quiet', '-q', '72', str(png), '-o', str(png.with_suffix('.webp'))], check=True)
        png.unlink()
        print('✓', lesson)
    browser.close()
