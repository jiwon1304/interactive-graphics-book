// 챕터의 각 figure(데모/도식)를 개별 요소로 캡처 → 좁은 폭에서 라벨 겹침/잘림 검수.
// 사용: node scripts/shoot-figs.mjs <base-url> <route> [theme] [width]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp/figs';
mkdirSync(OUT, { recursive: true });

const base = process.argv[2];
const route = process.argv[3];
const theme = process.argv[4] || 'light';
const width = parseInt(process.argv[5] || '390', 10);
if (!base || !route) {
  console.error('usage: node scripts/shoot-figs.mjs <base-url> <route> [theme] [width]');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
try {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  const url = `${base.replace(/\/$/, '')}/${route.replace(/^\//, '')}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  // headless에서 client:visible(IntersectionObserver) 강제 발화: 전체 스크롤 패스 후 복귀
  const full = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < full; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  const slug = route.replace(/[/]+/g, '_').replace(/^_|_$/g, '');
  const figs = await page.$$('figure.demo, .map-scroll');
  console.log(`${route}: ${figs.length} figures @${width}/${theme}`);
  for (let i = 0; i < figs.length; i++) {
    await figs[i].scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    const file = `${OUT}/${slug}__${width}-${theme}__${String(i).padStart(2, '0')}.png`;
    await figs[i].screenshot({ path: file }).catch((e) => console.error('fail', i, e.message));
    console.log(file);
  }
  await ctx.close();
} finally {
  await browser.close();
}
