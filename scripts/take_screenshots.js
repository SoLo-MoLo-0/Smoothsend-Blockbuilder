const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUTPUT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1366x650', width: 1366, height: 650 },
  { name: '390x844', width: 390, height: 844 },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });

    // 1. App - Light mode
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      const lbBtn = document.getElementById('leaderboard-tab-btn');
      if (lbBtn) lbBtn.click();
    });
    // Wait for podium animation / settle
    await new Promise((r) => setTimeout(r, 2000));
    const lightPath = path.join(OUTPUT_DIR, `leaderboard-${vp.name}-light.png`);
    await page.screenshot({ path: lightPath });
    console.log(`Saved: ${lightPath}`);

    // 2. App - Dark mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await new Promise((r) => setTimeout(r, 400));
    const darkPath = path.join(OUTPUT_DIR, `leaderboard-${vp.name}-dark.png`);
    await page.screenshot({ path: darkPath });
    console.log(`Saved: ${darkPath}`);

    // 3. Reference file comparison
    const refUrl = 'file:///' + path.join(__dirname, '..', 'design', 'leaderboard-tower-reference.html').replace(/\\/g, '/');
    await page.goto(refUrl, { waitUntil: 'load' });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await new Promise((r) => setTimeout(r, 2000));
    const refLightPath = path.join(OUTPUT_DIR, `reference-${vp.name}-light.png`);
    await page.screenshot({ path: refLightPath });
    console.log(`Saved: ${refLightPath}`);

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await new Promise((r) => setTimeout(r, 400));
    const refDarkPath = path.join(OUTPUT_DIR, `reference-${vp.name}-dark.png`);
    await page.screenshot({ path: refDarkPath });
    console.log(`Saved: ${refDarkPath}`);
  }

  // Also capture Post-Run Summary card at 1366x768 and 390x844
  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    // Switch to daily tab
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      const dailyBtn = document.getElementById('daily-tab-btn');
      if (dailyBtn) dailyBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    // Start game and trigger instant game over by pressing space/locking or simulation
    // Let's take screenshot of daily view
    const dailyPath = path.join(OUTPUT_DIR, `daily-run-${vp.name}-light.png`);
    await page.screenshot({ path: dailyPath });
    console.log(`Saved: ${dailyPath}`);
  }

  await browser.close();
  console.log('ALL_SCREENSHOTS_DONE');
})();
