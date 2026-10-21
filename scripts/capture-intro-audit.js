const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT_DIR = path.join(__dirname, '..', 'screenshots', 'intro');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];

const THEMES = ['dark', 'light'];
const TIMESTAMPS = [
  { label: '0.5s', delay: 500 },
  { label: '1.0s', delay: 500 },
  { label: '1.5s', delay: 500 },
  { label: '2.0s', delay: 500 },
  { label: '2.6s', delay: 600 },
  { label: '3.2s', delay: 600 },
];

async function captureRun(page, url, prefix, vp, theme) {
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Set theme & storage
  await page.evaluate((th) => {
    document.documentElement.setAttribute('data-theme', th);
    try {
      localStorage.setItem('bb-intro-theme', th);
      localStorage.setItem('bb-theme', th);
    } catch {}
    const introEl = document.getElementById('intro');
    if (introEl) {
      introEl.setAttribute('data-it', th);
    }
  }, theme);

  // Wait for gate to be created (80ms delay in both spec and app)
  await new Promise((r) => setTimeout(r, 250));

  // Dismiss gate to trigger play (pointerdown satisfies both ref and app)
  await page.evaluate(() => {
    const gateBtn = document.getElementById('gate');
    if (gateBtn) {
      gateBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
  });

  // Capture sequence at each timestamp
  for (const step of TIMESTAMPS) {
    await new Promise((r) => setTimeout(r, step.delay));
    const filename = `${prefix}_${theme}_${vp.name}_${step.label}.png`;
    const filePath = path.join(OUT_DIR, filename);
    await page.screenshot({ path: filePath });
    console.log(`Saved: ${filename}`);
  }
}

async function main() {
  console.log('Launching Edge for Intro Audit...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const refUrl = 'file:///' + path.join(__dirname, '..', 'design', 'intro-reference.html').replace(/\\/g, '/');
  const appUrl = 'http://localhost:3000/?intro=1';

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      console.log(`\n--- Capturing App [${vp.name} - ${theme}] ---`);
      await captureRun(page, appUrl, 'app', vp, theme);

      console.log(`\n--- Capturing Reference [${vp.name} - ${theme}] ---`);
      await captureRun(page, refUrl, 'ref', vp, theme);
    }
  }

  await browser.close();
  console.log('\nAudit capture complete!');
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
