const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ASSETS_DIR = path.join(__dirname, '..', 'submission_assets');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900', '--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000?nointro=1', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // Set dark mode
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('bb-theme', 'dark'); } catch {}
  });
  await sleep(400);

  // Click start button to begin game
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const startBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Start');
    if (startBtn) startBtn.click();
  });
  await sleep(600);

  // Play a few drops with keyboard space/down/arrow keys
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('ArrowDown');
    await sleep(60);
    await page.keyboard.press('Space');
    await sleep(250);
  }

  // Remove dev toasts
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(e => e.remove());
  });

  // 1. Capture Active Dark Mode Gameplay
  await page.screenshot({ path: path.join(ASSETS_DIR, '03_gameplay_dark.png') });
  console.log('Saved active dark gameplay!');

  // 2. Light Mode Active Gameplay
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem('bb-theme', 'light'); } catch {}
  });
  await sleep(600);
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(e => e.remove());
  });
  await page.screenshot({ path: path.join(ASSETS_DIR, '04_gameplay_light.png') });
  console.log('Saved active light gameplay!');

  // 3. Leaderboard with full populated podium from reference
  console.log('Capturing full Tower Leaderboard...');
  const lbRefUrl = 'file:///' + path.join(__dirname, '..', 'design', 'leaderboard-tower-reference.html').replace(/\\/g, '/');
  await page.goto(lbRefUrl, { waitUntil: 'load' });
  await sleep(400);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await sleep(400);
  await page.screenshot({ path: path.join(ASSETS_DIR, '05_leaderboard.png') });
  console.log('Saved populated leaderboard!');

  await browser.close();
  console.log('All screenshots refined!');
})();
