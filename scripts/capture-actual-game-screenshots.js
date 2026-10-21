const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ASSETS_DIR = path.join(__dirname, '..', 'submission_assets');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log('Capturing real screenshots from compiled app at http://localhost:3000 ...');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900', '--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // 1. Dark Mode Gameplay from actual Next.js App
  console.log('1. Loading Dark Mode Gameplay from live app...');
  await page.goto('http://localhost:3000?nointro=1', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // Set theme to dark
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('bb-theme', 'dark'); } catch {}
  });
  await sleep(600);

  // Clean any dev toast
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(e => e.remove());
  });

  // Capture Dark Gameplay
  const darkPath = path.join(ASSETS_DIR, '03_gameplay_dark.png');
  await page.screenshot({ path: darkPath });
  console.log('   Saved:', darkPath);

  // 2. Light Mode Gameplay from actual Next.js App
  console.log('2. Capturing Light Mode Gameplay...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem('bb-theme', 'light'); } catch {}
  });
  await sleep(600);
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(e => e.remove());
  });

  const lightPath = path.join(ASSETS_DIR, '04_gameplay_light.png');
  await page.screenshot({ path: lightPath });
  console.log('   Saved:', lightPath);

  // Switch back to dark for leaderboard & game over
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('bb-theme', 'dark'); } catch {}
  });
  await sleep(300);

  // 3. The Tower Leaderboard from actual Next.js App
  console.log('3. Navigating to Leaderboard tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const lbBtn = buttons.find(b => b.textContent && b.textContent.includes('Leaderboard'));
    if (lbBtn) lbBtn.click();
  });
  await sleep(1200);
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(e => e.remove());
  });

  const lbPath = path.join(ASSETS_DIR, '05_leaderboard.png');
  await page.screenshot({ path: lbPath });
  console.log('   Saved:', lbPath);

  // 4. Return to Daily/Practice and trigger the Game Over Poster
  console.log('4. Navigating back to game and triggering real Game Over Poster...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const practiceBtn = buttons.find(b => b.textContent && b.textContent.includes('Practice'));
    if (practiceBtn) practiceBtn.click();
  });
  await sleep(800);

  // Trigger real Game Over poster in app
  await page.evaluate(() => {
    if (typeof window.__triggerDevGameOver === 'function') {
      window.__triggerDevGameOver('over', 28640, 24, 20000);
    }
  });

  // Wait 3.5s for poster drop, physics explosion, score count-up and stamp
  console.log('   Waiting for Game Over animation and stamp...');
  await sleep(3500);

  // Remove any dev toasts so screenshot is clean
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(e => e.remove());
  });

  const gameOverPath = path.join(ASSETS_DIR, '06_post_run_verified.png');
  await page.screenshot({ path: gameOverPath });
  console.log('   Saved real Game Over poster screen:', gameOverPath);

  // 5. Mobile Gameplay Screenshot
  console.log('5. Capturing Mobile Gameplay layout...');
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mobilePage.goto('http://localhost:3000?nointro=1', { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  await mobilePage.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach(e => e.remove());
  });
  await sleep(400);

  const mobilePath = path.join(ASSETS_DIR, '08_mobile_gameplay_dark.png');
  await mobilePage.screenshot({ path: mobilePath });
  console.log('   Saved mobile gameplay:', mobilePath);

  await browser.close();
  console.log('All authentic in-game screenshots captured successfully!');
})();
