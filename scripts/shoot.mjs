// 모바일/데스크톱 · 라이트/다크 스크린샷 도구 (시각 검수용).
// 사용: node scripts/shoot.mjs <base-url> <route1> [route2 ...]
// 예:  node scripts/shoot.mjs http://localhost:4321 / map chapters/gpu-cpu-conversation
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE =
  process.env.PW_CHROME ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const base = process.argv[2];
const routes = process.argv.slice(3);
if (!base || routes.length === 0) {
  console.error('usage: node scripts/shoot.mjs <base-url> <route...>');
  process.exit(1);
}

const VIEWS = [
  { tag: 'm', width: 390, height: 844, dsf: 2 }, // mobile
  { tag: 'd', width: 1366, height: 900, dsf: 1 }, // desktop
];
const THEMES = ['light', 'dark'];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
try {
  for (const route of routes) {
    const slug = route.replace(/[/]+/g, '_').replace(/^_|_$/g, '') || 'home';
    for (const v of VIEWS) {
      for (const theme of THEMES) {
        const ctx = await browser.newContext({
          viewport: { width: v.width, height: v.height },
          deviceScaleFactor: v.dsf,
        });
        await ctx.addInitScript((t) => {
          try {
            localStorage.setItem('theme', t);
          } catch {}
        }, theme);
        const page = await ctx.newPage();
        const url = `${base.replace(/\/$/, '')}/${route.replace(/^\//, '')}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
        // R3F 캔버스가 한 프레임 그릴 시간
        await page.waitForTimeout(1200);
        const file = `${OUT}/${slug}__${v.tag}-${theme}.png`;
        await page.screenshot({ path: file, fullPage: true }).catch((e) => {
          console.error('shot fail', url, e.message);
        });
        console.log(file);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
