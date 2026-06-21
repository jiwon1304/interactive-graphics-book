// 데모 런타임 검증: 페이지를 끝까지 스크롤해 client:visible 위젯을 모두 로드시키고,
// (1) 콘솔/페이지 에러를 수집, (2) 각 <canvas>가 비어있지 않은지(픽셀 분산) 검사, (3) 스크린샷.
// 사용: node scripts/verify-demos.mjs <url> [outPrefix]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const url = process.argv[2];
const prefix = process.argv[3] || 'verify';
if (!url) {
  console.error('usage: node scripts/verify-demos.mjs <url> [outPrefix]');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

// 천천히 끝까지 스크롤(IntersectionObserver로 client:visible 위젯 로드)
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = Math.round(window.innerHeight * 0.6);
  for (let y = 0; y <= document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await sleep(300);
  }
  window.scrollTo(0, 0);
  await sleep(300);
});
await page.waitForTimeout(1500);

// 캔버스별 비어있지 않은지 검사
const canvasReport = await page.evaluate(() => {
  const out = [];
  const cs = Array.from(document.querySelectorAll('canvas'));
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const w = 64, h = 48;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const g = off.getContext('2d');
    let nonBlank = false, distinct = 0;
    try {
      g.drawImage(c, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const seen = new Set();
      for (let p = 0; p < d.length; p += 4) {
        seen.add((d[p] >> 4) + ',' + (d[p + 1] >> 4) + ',' + (d[p + 2] >> 4));
      }
      distinct = seen.size;
      nonBlank = distinct > 3; // 색이 3가지 초과면 무언가 그려진 것
    } catch (e) {
      out.push({ i, error: String(e) });
      continue;
    }
    out.push({ i, w: c.width, h: c.height, distinct, nonBlank });
  }
  return out;
});

await page.screenshot({ path: `${OUT}/${prefix}.png`, fullPage: true });

console.log('URL:', url);
console.log('canvases:', JSON.stringify(canvasReport, null, 2));
console.log('errors:', errors.length ? JSON.stringify(errors, null, 2) : 'none');

await browser.close();
process.exit(errors.length ? 2 : 0);
