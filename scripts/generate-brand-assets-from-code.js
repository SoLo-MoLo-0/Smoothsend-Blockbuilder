const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ASSETS_DIR = path.join(__dirname, '..', 'submission_assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// 1. HTML for 512x512 Logo
const logoHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0e0e0e;
    --ink: #f2f2f2;
    --mute: #888888;
    --acc: #ff3b1f;
    --line: #222222;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 512px;
    height: 512px;
    background: var(--bg);
    color: var(--ink);
    font-family: 'Space Grotesk', system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    border: 3px solid var(--line);
  }
  /* Subtle background grid */
  .grid-bg {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(to right, var(--line) 1px, transparent 1px),
      linear-gradient(to bottom, var(--line) 1px, transparent 1px);
    background-size: 32px 32px;
    opacity: 0.35;
    pointer-events: none;
  }
  .mark-container {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 36px;
  }
  .logo-mark {
    width: 160px;
    height: 160px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 14px;
    padding: 10px;
  }
  .block {
    width: 100%;
    height: 100%;
  }
  .b-acc {
    background: var(--acc);
    box-shadow: 0 0 0 2px var(--acc);
  }
  .b-ink {
    background: var(--ink);
  }
  .b-outline {
    border: 4px solid var(--ink);
    background: transparent;
  }
  .title-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .title {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.03em;
    text-transform: uppercase;
    line-height: 1;
    color: var(--ink);
    text-align: center;
  }
  .badge {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--acc);
    background: rgba(255, 59, 31, 0.12);
    border: 1px solid var(--acc);
    padding: 4px 14px;
  }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="mark-container">
    <div class="logo-mark">
      <div class="block b-acc"></div>
      <div class="block b-ink"></div>
      <div class="block b-ink"></div>
      <div class="block b-outline"></div>
    </div>
    <div class="title-group">
      <div class="title">Block Builder</div>
      <div class="badge">Avalanche C-Chain</div>
    </div>
  </div>
</body>
</html>`;

// 2. HTML for 840x300 Banner
const bannerHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0e0e0e;
    --ink: #f2f2f2;
    --mute: #999999;
    --acc: #ff3b1f;
    --line: #222222;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 840px;
    height: 300px;
    background: var(--bg);
    color: var(--ink);
    font-family: 'Space Grotesk', system-ui, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 48px;
    overflow: hidden;
    position: relative;
    border: 2px solid var(--line);
  }
  /* Grid lines in background */
  .grid-bg {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(to right, var(--line) 1px, transparent 1px),
      linear-gradient(to bottom, var(--line) 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.4;
    pointer-events: none;
  }
  .left-col {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 500px;
  }
  .brand-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .mini-mark {
    width: 32px;
    height: 32px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 3px;
  }
  .mini-mark .b1 { background: var(--acc); }
  .mini-mark .b2 { background: var(--ink); }
  .mini-mark .b3 { background: var(--ink); }
  .mini-mark .b4 { border: 2px solid var(--ink); }
  
  .banner-title {
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    color: var(--ink);
  }
  .subtitle {
    font-size: 15px;
    color: var(--mute);
    line-height: 1.4;
  }
  .tags-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .tag {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 5px 10px;
    border: 2px solid var(--ink);
    background: var(--bg);
    color: var(--ink);
  }
  .tag.acc {
    border-color: var(--acc);
    color: var(--acc);
    background: rgba(255, 59, 31, 0.08);
  }
  /* Right column: stylized board wireframe */
  .right-col {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .board-mock {
    width: 130px;
    height: 240px;
    border: 2px solid var(--ink);
    background: #090909;
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    grid-template-rows: repeat(20, 1fr);
    gap: 1px;
    padding: 2px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }
  .cell {
    background: rgba(255,255,255,0.03);
  }
  .cell.filled {
    background: var(--ink);
  }
  .cell.accent {
    background: var(--acc);
  }
  .cell.ghost {
    border: 1px dashed var(--acc);
    background: rgba(255, 59, 31, 0.15);
  }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="left-col">
    <div class="brand-row">
      <div class="mini-mark">
        <div class="b1"></div>
        <div class="b2"></div>
        <div class="b3"></div>
        <div class="b4"></div>
      </div>
      <div class="banner-title">BLOCK BUILDER</div>
    </div>
    <div class="subtitle">Daily 100-piece falling-blocks puzzle on Avalanche with gasless ERC-4337 proof of score.</div>
    <div class="tags-row">
      <div class="tag acc">Avalanche C-Chain</div>
      <div class="tag">Gasless ERC-4337</div>
      <div class="tag">EIP-712 Replay</div>
      <div class="tag">Mono Ink</div>
    </div>
  </div>
  <div class="right-col">
    <div class="board-mock" id="mockGrid"></div>
  </div>
  <script>
    const mock = document.getElementById('mockGrid');
    // 20 rows, 10 cols
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 10; c++) {
        const div = document.createElement('div');
        div.className = 'cell';
        // Active piece (T-piece in center)
        if (r === 6 && c === 4) div.classList.add('accent');
        if (r === 7 && (c === 3 || c === 4 || c === 5)) div.classList.add('accent');
        // Ghost piece near bottom
        if (r === 15 && c === 4) div.classList.add('ghost');
        if (r === 16 && (c === 3 || c === 4 || c === 5)) div.classList.add('ghost');
        // Stack at bottom
        if (r >= 17) {
          if (!(r === 18 && c === 4) && !(r === 19 && c === 7)) {
            div.classList.add('filled');
          }
        }
        mock.appendChild(div);
      }
    }
  </script>
</body>
</html>`;

(async () => {
  console.log('Launching Edge for code-based asset generation...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // 1. Render Logo (512x512)
  console.log('Rendering 512x512 Logo from pure HTML/CSS...');
  const pageLogo = await browser.newPage();
  await pageLogo.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
  await pageLogo.setContent(logoHtml, { waitUntil: 'networkidle0' });
  const logoPath = path.join(ASSETS_DIR, '01_logo_512x512.jpg');
  await pageLogo.screenshot({ path: logoPath, type: 'jpeg', quality: 95 });
  console.log(`Saved: ${logoPath}`);

  // 2. Render Cover Banner (840x300)
  console.log('Rendering 840x300 Banner from pure HTML/CSS...');
  const pageBanner = await browser.newPage();
  await pageBanner.setViewport({ width: 840, height: 300, deviceScaleFactor: 2 });
  await pageBanner.setContent(bannerHtml, { waitUntil: 'networkidle0' });
  const bannerPath = path.join(ASSETS_DIR, '02_cover_banner.jpg');
  await pageBanner.screenshot({ path: bannerPath, type: 'jpeg', quality: 95 });
  console.log(`Saved: ${bannerPath}`);

  await browser.close();
  console.log('Done! All assets generated directly through code.');
})();
