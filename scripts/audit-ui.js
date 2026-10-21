const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function audit() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  const outDir = path.resolve(__dirname, '../screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Navigating to http://127.0.0.1:3000...');
  try {
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'load', timeout: 10000 });
  } catch (e) {
    console.log('Goto note:', e.message);
  }
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Audit font families
  const fontAudit = await page.evaluate(() => {
    const selectors = [
      'body',
      '.lg',
      '.tab',
      '.tab.on',
      '.clk',
      'dt',
      'dd',
      '#sc',
      '#li',
      '#lv',
      '#pc',
      '#bs',
      '.ov h2',
      '.ov p',
      '.btn',
      '.btn.p',
      'h3',
      '.keys',
      '#theme-toggle-btn',
    ];
    const results = {};
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const style = window.getComputedStyle(el);
        results[sel] = {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          color: style.color,
          letterSpacing: style.letterSpacing,
        };
      }
    }
    return results;
  });

  console.log('--- FONT AUDIT RESULTS ---');
  console.log(JSON.stringify(fontAudit, null, 2));

  // Screenshot 1: Practice mode (light)
  await page.screenshot({ path: path.join(outDir, 'audit_practice_light.png'), fullPage: true });
  console.log('Saved audit_practice_light.png');

  // Screenshot 2: Daily 100 mode (light)
  await page.click('#daily-tab-btn');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'audit_daily_light.png'), fullPage: true });
  console.log('Saved audit_daily_light.png');

  // Screenshot 3: Leaderboard mode (ready)
  await page.click('#leaderboard-tab-btn');
  try {
    await page.waitForSelector('.rw', { timeout: 8000 });
  } catch (e) {
    console.log('Wait for .rw notice:', e.message);
  }
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'audit_leaderboard_light.png'), fullPage: true });
  console.log('Saved audit_leaderboard_light.png');

  // Screenshot 4: Toggle Theme
  await page.click('#theme-toggle-btn');
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'audit_leaderboard_dark.png'), fullPage: true });
  console.log('Saved audit_leaderboard_dark.png');

  // Screenshot 5: Daily 100 mode
  await page.click('#daily-tab-btn');
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'audit_daily_dark.png'), fullPage: true });
  console.log('Saved audit_daily_dark.png');

  await browser.close();
}

audit().catch(console.error);
