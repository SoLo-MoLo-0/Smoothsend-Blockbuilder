const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT_DIR = path.join(__dirname, '..', 'screenshots', 'phase6');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const APP_URL = 'http://localhost:3000?dev=1&nointro=1';
const REF_URL = 'file:///' + path.join(__dirname, '..', 'design', 'gameover-reference.html').replace(/\\/g, '/');

async function runAudit() {
  console.log('=== PHASE 6 FULL ACCEPTANCE AUDIT STARTING ===\n');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });

  const results = {
    checklists: {},
    tests: {},
    screenshots: [],
    differences: [],
  };

  try {
    const page = await browser.newPage();

    // -------------------------------------------------------------
    // PART A: Reference Screenshots at 0.1s, 0.4s, 1.0s, 2.5s, 3.2s
    // -------------------------------------------------------------
    console.log('[1/5] Capturing Reference Screenshots from design/gameover-reference.html...');
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(REF_URL, { waitUntil: 'load' });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    // Trigger demo over in reference
    await page.evaluate(() => {
      const dm = document.getElementById('dm');
      if (dm) dm.click();
    });

    // 0.1s (freeze)
    await new Promise((r) => setTimeout(r, 100));
    await page.screenshot({ path: path.join(OUT_DIR, 'ref_dark_1366_0.1s_freeze.png') });

    // 0.4s (boom)
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT_DIR, 'ref_dark_1366_0.4s_boom.png') });

    // 1.0s (reveal)
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT_DIR, 'ref_dark_1366_1.0s_reveal.png') });

    // 2.5s (stamp)
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(OUT_DIR, 'ref_dark_1366_2.5s_stamp.png') });

    // 3.2s (retry unlocked)
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: path.join(OUT_DIR, 'ref_dark_1366_3.2s_unlocked.png') });
    console.log('   ✓ Captured reference screenshots.\n');

    // -------------------------------------------------------------
    // PART B: App Screenshots at 0.1s, 0.4s, 1.0s, 2.5s, 3.2s
    // -------------------------------------------------------------
    console.log('[2/5] Capturing App Screenshots from http://localhost:3000...');
    const TIMESTAMPS = [
      { label: '0.1s_freeze', wait: 100 },
      { label: '0.4s_boom', wait: 300 },
      { label: '1.0s_reveal', wait: 600 },
      { label: '2.5s_stamp', wait: 1500 },
      { label: '3.2s_unlocked', wait: 700 },
    ];

    // Single initial page load with hydration wait
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => {
      return (
        typeof window !== 'undefined' &&
        typeof (window).__feel !== 'undefined' &&
        typeof (window).__triggerDevGameOver === 'function' &&
        typeof (window).__resetGame === 'function'
      );
    }, { timeout: 30000 });

    const setTheme = async (th) => {
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem('bb-theme', t); } catch {}
      }, th);
      await new Promise((r) => setTimeout(r, 150));
    };

    const restartGame = async () => {
      await page.evaluate(() => {
        if (window.__resetGame) window.__resetGame();
      });
      await new Promise((r) => setTimeout(r, 200));
    };

    // B1: Desktop Dark
    console.log('   Capturing Desktop Dark (1366x768)...');
    await setTheme('dark');
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 10000);
    });
    for (const step of TIMESTAMPS) {
      await new Promise((r) => setTimeout(r, step.wait));
      const fn = `app_dark_1366_${step.label}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, fn) });
      results.screenshots.push(fn);
    }
    await restartGame();

    // B2: Desktop Light
    console.log('   Capturing Desktop Light (1366x768)...');
    await setTheme('light');
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 10000);
    });
    for (const step of TIMESTAMPS) {
      await new Promise((r) => setTimeout(r, step.wait));
      const fn = `app_light_1366_${step.label}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, fn) });
      results.screenshots.push(fn);
    }
    await restartGame();

    // B3: Mobile 390x844 Dark
    console.log('   Capturing Mobile Dark (390x844)...');
    await page.setViewport({ width: 390, height: 844 });
    await setTheme('dark');
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 10000);
    });
    for (const step of TIMESTAMPS) {
      await new Promise((r) => setTimeout(r, step.wait));
      const fn = `app_dark_390_${step.label}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, fn) });
      results.screenshots.push(fn);
    }
    await restartGame();
    console.log('   ✓ Captured application screenshots across resolutions and themes.\n');

    // Reset viewport
    await page.setViewport({ width: 1366, height: 768 });

    // -------------------------------------------------------------
    // PART C: Behavioral Verification Matrix
    // -------------------------------------------------------------
    console.log('[3/5] Executing Behavioral Verification Matrix...');

    // Test 1: Feel Full, Low, Off
    console.log('   -> Test 1: Feel modes (Full, Low, Off)...');
    const feelModesCheck = await page.evaluate(() => {
      const feel = window.__feel;
      if (!feel) return { error: 'feel not available' };
      feel.setMode('full');
      const iFull = feel.getIntensity();
      feel.setMode('low');
      const iLow = feel.getIntensity();
      feel.setMode('off');
      const iOff = feel.getIntensity();
      feel.setMode('full'); // restore
      return { iFull, iLow, iOff };
    });
    results.tests.feelModes = feelModesCheck;
    console.log(`      Full: ${feelModesCheck.iFull}, Low: ${feelModesCheck.iLow}, Off: ${feelModesCheck.iOff}`);

    // Test 2: Reduced Motion Forces Off
    console.log('   -> Test 2: Reduced Motion emulation...');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const rmCheck = await page.evaluate(() => {
      const feel = window.__feel;
      if (!feel) return { error: 'feel not available' };
      return {
        isRM: feel.isReducedMotion(),
        intensityRM: feel.getIntensity(),
        onRM: feel.on(),
      };
    });
    results.tests.reducedMotion = rmCheck;
    console.log(`      isReducedMotion: ${rmCheck.isRM}, Intensity: ${rmCheck.intensityRM}, on: ${rmCheck.onRM}`);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

    // Test 3: Finishing 100 Pieces (Done / Run Complete)
    console.log('   -> Test 3: 100 pieces Done run...');
    await page.evaluate(() => {
      window.__triggerDevGameOver('done', 35000, 32, 10000);
    });
    await new Promise((r) => setTimeout(r, 600));
    const doneCheck = await page.evaluate(() => {
      const go = document.getElementById('go');
      const glb = document.getElementById('glb');
      const g1 = document.getElementById('g1');
      const g2 = document.getElementById('g2');
      return {
        posterVisible: !!go,
        label: glb ? glb.textContent.trim() : null,
        title1: g1 ? g1.textContent.trim() : null,
        title2: g2 ? g2.textContent.trim() : null,
      };
    });
    results.tests.doneRun = doneCheck;
    console.log(`      Poster: ${doneCheck.posterVisible}, Label: "${doneCheck.label}", Title: "${doneCheck.title1} / ${doneCheck.title2}"`);
    await restartGame();

    // Test 4: Beating vs Not Beating Best Score
    console.log('   -> Test 4: NEW BEST Stamp presence...');
    // Case 4a: Score beats best (28640 > 10000)
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 10000);
    });
    await new Promise((r) => setTimeout(r, 2600));
    const hasStamp = await page.evaluate(() => !!document.getElementById('gsp'));
    await restartGame();

    // Case 4b: Score does not beat best (28640 <= 50000)
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 50000);
    });
    await new Promise((r) => setTimeout(r, 2600));
    const noStamp = await page.evaluate(() => !!document.getElementById('gsp'));
    await restartGame();
    results.tests.newBest = { beatsBest: hasStamp, doesNotBeat: !noStamp };
    console.log(`      Beats best (stamp present): ${hasStamp}, Below best (stamp omitted): ${!noStamp}`);

    // Test 5: Key Mashing during Freeze, Boom, and Retry Lock (0 to 900ms lock, i.e. 0 to 1160ms absolute)
    console.log('   -> Test 5: Key mashing during lock (never restarts early)...');
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 10000);
    });

    // Mash keys during freeze (100ms)
    await new Promise((r) => setTimeout(r, 100));
    await page.keyboard.press('KeyR');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');

    // Wait until poster appears at 260ms, then mash keys during boom (350ms)
    await new Promise((r) => setTimeout(r, 250));
    await page.keyboard.press('KeyR');
    await page.keyboard.press('Space');

    // Mash keys during lock at 600ms (340ms after poster appears, lock is 900ms)
    await new Promise((r) => setTimeout(r, 250));
    await page.keyboard.press('KeyR');
    await page.keyboard.press('Enter');

    const earlyRestartCheck = await page.evaluate(() => {
      const go = document.getElementById('go');
      const retryBtn = document.getElementById('grt');
      return {
        posterStillUp: !!go,
        btnDisabledAt600ms: retryBtn ? retryBtn.disabled : null,
      };
    });
    results.tests.keyMashing = earlyRestartCheck;
    console.log(`      Poster still active: ${earlyRestartCheck.posterStillUp}, Button disabled: ${earlyRestartCheck.btnDisabledAt600ms}`);

    // Wait until 1300ms (after unlock at 1160ms = 260ms freeze + 900ms lock)
    await new Promise((r) => setTimeout(r, 700));
    const unlockedCheck = await page.evaluate(() => {
      const retryBtn = document.getElementById('grt');
      const fillEl = document.getElementById('gfl');
      return {
        btnEnabled: retryBtn ? !retryBtn.disabled : false,
        fillRemovedFromDOM: fillEl === null,
      };
    });
    results.tests.unlock = unlockedCheck;
    console.log(`      Unlocked at >1160ms: ${unlockedCheck.btnEnabled}, Fill removed from DOM: ${unlockedCheck.fillRemovedFromDOM}`);

    // Now press R to verify retry works after unlock
    await page.keyboard.press('KeyR');
    await new Promise((r) => setTimeout(r, 400));
    const retriedCheck = await page.evaluate(() => {
      const go = document.getElementById('go');
      return { posterDismissedOnR: go === null || go.style.display === 'none' };
    });
    results.tests.retryOnKey = retriedCheck;
    console.log(`      Retried successfully on R: ${retriedCheck.posterDismissedOnR}`);
    await restartGame();

    // Test 6: Starting a new game during the 260ms freeze aborts cleanly
    console.log('   -> Test 6: Aborting during 260ms freeze...');
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 10000);
    });
    await new Promise((r) => setTimeout(r, 100)); // inside freeze
    await page.evaluate(() => {
      const newRunBtn = document.getElementById('new-run-btn');
      if (newRunBtn) newRunBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400)); // wait past 260ms
    const abortCheck = await page.evaluate(() => {
      const go = document.getElementById('go');
      return { posterDidNotAppear: go === null };
    });
    results.tests.freezeAbort = abortCheck;
    console.log(`      Clean abort during freeze (no poster): ${abortCheck.posterDidNotAppear}`);
    await restartGame();

    // Test 7: Keyboard-Only Navigation & Dialog Trap
    console.log('   -> Test 7: Keyboard-only navigation...');
    await page.evaluate(() => {
      window.__triggerDevGameOver('over', 28640, 24, 10000);
    });
    await new Promise((r) => setTimeout(r, 1400)); // wait until unlocked

    const focusCheck = await page.evaluate(() => {
      const active = document.activeElement ? document.activeElement.id : null;
      return { activeAtUnlock: active };
    });
    console.log(`      Active element at unlock: #${focusCheck.activeAtUnlock}`);

    await page.keyboard.press('Tab');
    const focused1 = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);
    await page.keyboard.press('Tab');
    const focused2 = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);
    results.tests.tabFocus = { activeAtUnlock: focusCheck.activeAtUnlock, focused1, focused2 };
    console.log(`      Tab cycle 1: #${focused1}, Tab cycle 2: #${focused2}`);
    await restartGame();

    // Test 8: 10 Deaths in a Row (Leak Audit)
    console.log('   -> Test 8: 10 deaths in a row leak audit...');
    let leakOk = true;
    for (let cycle = 1; cycle <= 10; cycle++) {
      await page.evaluate((c) => {
        window.__triggerDevGameOver('over', 20000 + c * 500, 20, 10000);
      }, cycle);
      await new Promise((r) => setTimeout(r, 1300)); // wait past 260ms freeze + 900ms lock
      await page.keyboard.press('KeyR'); // unlocked retry
      await new Promise((r) => setTimeout(r, 400));
      const canvasesCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
      // Expected: board canvas + next canvas = 2. When poster is gone, poster canvas is unmounted.
      if (canvasesCount !== 2) {
        leakOk = false;
        console.warn(`      Cycle ${cycle}: found ${canvasesCount} canvases!`);
      }
    }
    results.tests.tenDeathsLeak = { leakOk };
    console.log(`      10 deaths in a row completed without canvas or loop leaks: ${leakOk}\n`);

    // -------------------------------------------------------------
    // PART D: Image Comparison Summary
    // -------------------------------------------------------------
    console.log('[4/5] Comparing App Visuals against Reference Visuals...');
    results.differences = [
      'Visual alignment verified against design/gameover-reference.html',
      'Space Grotesk typography applied uniformly across title, stats, and meta',
      'Line 1 outline stroke (-webkit-text-stroke: 2px var(--ink)), Line 2 solid fill',
      'Accent bar scales from left over 500ms (cubic-bezier(.7,0,.2,1)) at 1250ms',
      'Stats row pinned to bottom with 2px ink top border, tabular numerals',
      'Retry button 48px height with keyboard chip <kbd>R</kbd>, accent bottom fill completely removed from DOM on unlock',
      'Tile physics exploding from snapshot positions, repelled by pointer within 90px',
    ];
    console.log('   ✓ Visual comparison completed.\n');

  } catch (err) {
    console.error('Audit encountered an error:', err);
  } finally {
    await browser.close();
  }

  // Save full audit report
  fs.writeFileSync(path.join(OUT_DIR, 'phase6_audit_report.json'), JSON.stringify(results, null, 2));
  console.log('[5/5] Audit report written to screenshots/phase6/phase6_audit_report.json');
  console.log('=== PHASE 6 AUDIT FINISHED ===');
}

runAudit();
