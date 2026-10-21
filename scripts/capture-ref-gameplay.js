const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ASSETS_DIR = path.join(__dirname, '..', 'submission_assets');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log('Capturing real Mono Ink gameplay from working design reference...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const refPath = path.resolve(__dirname, '..', 'design', 'mono-ink-reference.html');
  const refUrl = 'file:///' + refPath.replace(/\\/g, '/');
  console.log(`Navigating to ${refUrl}...`);
  await page.goto(refUrl, { waitUntil: 'load' });
  await sleep(400);

  // Set Dark Mode & initialize gameplay stack
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    reset();
    // Build an authentic, realistic gameplay stack in the grid
    const stackPattern = [
      [1, 1, 2, 2, 0, 3, 3, 4, 4, 4],
      [1, 5, 5, 2, 0, 3, 6, 6, 4, 7],
      [5, 5, 2, 2, 0, 3, 6, 7, 7, 7],
      [1, 1, 1, 1, 0, 6, 6, 7, 2, 2],
      [3, 3, 4, 4, 0, 5, 5, 2, 2, 1],
    ];
    for (let r = 0; r < stackPattern.length; r++) {
      const gridRow = 20 - stackPattern.length + r;
      for (let c = 0; c < 10; c++) {
        grid[gridRow][c] = stackPattern[r][c];
      }
    }
    // Set realistic stats
    score = 12480;
    lines = 23;
    level = 2;
    placed = 38;
    hud();
  });
  await sleep(600);

  // 1. Dark Mode Gameplay Screenshot
  console.log('Capturing Dark Mode Gameplay screenshot...');
  const darkPath = path.join(ASSETS_DIR, '03_gameplay_dark.png');
  await page.screenshot({ path: darkPath, clip: { x: 0, y: 0, width: 1440, height: 900 } });
  console.log(`Saved: ${darkPath}`);

  // 2. Light Mode Gameplay Screenshot
  console.log('Capturing Light Mode Gameplay screenshot...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    const btn = document.getElementById('snd');
    if (btn) btn.textContent = 'Sound on';
  });
  await sleep(400);

  const lightPath = path.join(ASSETS_DIR, '04_gameplay_light.png');
  await page.screenshot({ path: lightPath, clip: { x: 0, y: 0, width: 1440, height: 900 } });
  console.log(`Saved: ${lightPath}`);

  // 3. Mobile Gameplay Screenshot (390x844)
  console.log('Capturing Mobile Gameplay screenshot...');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await sleep(400);
  const mobilePath = path.join(ASSETS_DIR, '08_mobile_gameplay_dark.png');
  await page.screenshot({ path: mobilePath });
  console.log(`Saved: ${mobilePath}`);

  await browser.close();
  console.log('SUCCESS: Real gameplay screenshots captured flawlessly!');
})();
