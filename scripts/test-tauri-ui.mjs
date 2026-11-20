// Native Windows WebView2 checks. Each isolated profile has a 30-second watchdog.
// Both profiles target a 1000×640 CSS viewport; only device scale changes.
import { createServer } from 'node:net';
import { connectNativePage } from './native-cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveBuildProfile } from './build-profile.mjs';
import creditLinks from '../src/platform/about-links.json' with { type: 'json' };

// Keep natural OS scaling for low and force DPR 2 for high.
const PROFILES = [
  { name: 'low', cssWidth: 1000, cssHeight: 640, dpr: null },
  { name: 'high', cssWidth: 1000, cssHeight: 640, dpr: 2 },
];
const HARD_TIMEOUT_MS = 30_000;
const VIEWPORT_TOLERANCE = 3;

// Tauri's build command embeds static assets in debug too. A plain cargo build
// without custom-protocol instead targets devUrl and is not a standalone app.
const selected = resolveBuildProfile(process.argv.slice(2));
if (selected.args.length) throw new Error(`Unknown profile options: ${selected.args.join(' ')}`);
if (platform() !== 'win32') {
  console.log('tauri ui profiles: skipped on this platform (WebView2/CDP is Windows-only)');
  process.exit(0);
}
const targetDir = process.env.CARGO_TARGET_DIR ?? resolve('src-tauri/target');
const exe = resolve(targetDir, selected.profile, 'woslicer-dx.exe');
if (!existsSync(exe)) {
  console.error(
    `built executable not found: ${exe} — run npm run tauri -- build --no-bundle${selected.profile === 'release' ? ' --release' : ''} first`,
  );
  process.exit(1);
}

const artifactsDir = resolve('test-artifacts/tauri-ui');
mkdirSync(artifactsDir, { recursive: true });

for (const profile of PROFILES) {
  console.log(`Running native UI profile: ${profile.name}`);
  const runDir = join(artifactsDir, profile.name);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  try {
    await runProfile(profile, exe, runDir);
  } catch (error) {
    console.error(`native UI profile ${profile.name} failed: ${error.message}`);
    process.exitCode = 1;
  }
}
if (process.exitCode) throw new Error('one or more native UI profiles failed');
console.log('native UI profiles: all passed');
// All artifacts are written synchronously; exit explicitly so a lingering
// child stream cannot keep the runner alive.
process.exit(process.exitCode ?? 0);

async function runProfile(profile, exe, runDir) {
  const port = await freePort();
  // Isolate WebView2 user data explicitly. APPDATA overrides do not redirect
  // Windows Known Folder APIs used by native recovery storage.
  const localRoot = join(runDir, 'appdata-local');
  const roamingRoot = join(runDir, 'appdata-roaming');
  mkdirSync(localRoot, { recursive: true });
  mkdirSync(roamingRoot, { recursive: true });
  const browserArgs =
    profile.dpr === null
      ? `--remote-debugging-port=${port}`
      : `--remote-debugging-port=${port} --force-device-scale-factor=${profile.dpr}`;
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      LOCALAPPDATA: localRoot,
      APPDATA: roamingRoot,
      WEBVIEW2_USER_DATA_FOLDER: join(localRoot, 'webview2'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: browserArgs,
    },
    stdio: 'ignore',
  });
  let client = null;
  let watchdog;
  try {
    const work = (async () => {
      client = await connectPage(port);
      client.page.setDefaultTimeout(5000);
      await verifyProfile(profile, client, runDir);
    })();
    const timeout = new Promise((_, reject) => {
      watchdog = setTimeout(
        () => reject(new Error(`${profile.name} exceeded 30 seconds`)),
        HARD_TIMEOUT_MS,
      );
    });
    await Promise.race([work, timeout]);
  } catch (error) {
    if (client) {
      await client.page.screenshot({ path: join(runDir, 'failure.png') }).catch(() => {});
      writeFileSync(
        join(runDir, 'failure.txt'),
        await client.page
          .locator('body')
          .innerText()
          .catch(() => 'unavailable'),
      );
    }
    throw error;
  } finally {
    clearTimeout(watchdog);
    if (client) {
      // Close the WebView2 browser gracefully first: a hard kill leaves the
      // shared user data folder locked, and the next profile's environment
      // creation fails with ERROR_INVALID_STATE (0x8007139F).
      await Promise.race([client.send('Browser.close').catch(() => {}), delay(2_000)]);
      await client.close();
    }
    // Give the browser process a moment to finish releasing its data folder.
    await delay(1_500);
    stopTree(child);
    dropHeavyProfileData(runDir);
  }
}

async function verifyProfile(profile, client, runDir) {
  // CDP can attach before navigation and Vue mounting finish. The profile's
  // existing hard deadline bounds this wait as well as the checks below.
  for (;;) {
    const reply = await client.send('Runtime.evaluate', {
      expression:
        "document.readyState === 'complete' && !!document.querySelector('[role=menubar]') && document.querySelectorAll('canvas').length >= 4",
      returnByValue: true,
    });
    if (reply.result.result?.value === true) break;
    await delay(100);
  }
  const { result } = await client.send('Browser.getWindowForTarget');
  const windowId = result.windowId;
  // Tune the outer window until the client area reaches the profile's target
  // css viewport: start from the physical target, then rescale from the
  // measured viewport until it converges. Host screens smaller than the
  // physical target surface here as a clear failure.
  const targetW = profile.cssWidth;
  const targetH = profile.cssHeight;
  // First guess: css pixels map 1:1 to DIP under natural scaling, and the
  // physical target for forced-DPR profiles; both converge by rescaling.
  let boundsW = targetW;
  let boundsH = targetH;
  let metrics = null;
  let exceptions = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { width: boundsW, height: boundsH },
    });
    await delay(400);
    const reply = await client.send('Runtime.evaluate', {
      expression: metricsExpression(),
      returnByValue: true,
    });
    if (reply.result.exceptionDetails)
      throw new Error(`page evaluate failed: ${reply.result.exceptionDetails.text}`);
    metrics = reply.result.result.value;
    exceptions = client.exceptions.count;
    const error = Math.max(Math.abs(metrics.innerW - targetW), Math.abs(metrics.innerH - targetH));
    if (error <= VIEWPORT_TOLERANCE) break;
    const wRatio = metrics.innerW > 0 ? targetW / metrics.innerW : 1;
    const hRatio = metrics.innerH > 0 ? targetH / metrics.innerH : 1;
    boundsW = Math.round(boundsW * wRatio);
    boundsH = Math.round(boundsH * hRatio);
  }
  // Capture evidence before asserting: a failed profile still leaves its
  // screenshot and raw metrics for diagnosis.
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(runDir, 'screenshot.png'), Buffer.from(shot.result.data, 'base64'));
  writeFileSync(
    join(runDir, 'result.json'),
    JSON.stringify({ profile: profile.name, metrics }, null, 2),
  );
  if (!metrics || !metrics.ready) throw new Error('page never reached readyState complete');
  if (Math.abs(metrics.innerW - targetW) > VIEWPORT_TOLERANCE)
    throw new Error(
      `viewport width did not reach ${targetW}: got ${metrics.innerW} (host screen may be too small)`,
    );
  if (Math.abs(metrics.innerH - targetH) > VIEWPORT_TOLERANCE)
    throw new Error(
      `viewport height did not reach ${targetH}: got ${metrics.innerH} (host screen may be too small)`,
    );
  if (profile.dpr !== null && Math.abs(metrics.dpr - profile.dpr) > 0.01)
    throw new Error(`devicePixelRatio is ${metrics.dpr}, expected ${profile.dpr}`);
  if (profile.dpr === null && (metrics.dpr < 1 || metrics.dpr > 3))
    throw new Error(`natural devicePixelRatio ${metrics.dpr} is implausible`);
  if (!metrics.menubar || !metrics.menubar.visible)
    throw new Error('application menu bar is not visible');
  if (metrics.canvases.length < 4)
    throw new Error(`expected at least 4 canvases, got ${metrics.canvases.length}`);
  const effectiveDpr = profile.dpr ?? metrics.dpr;
  for (const canvas of metrics.canvases) {
    if (
      Math.abs(canvas.w - canvas.css * effectiveDpr) > 2 ||
      Math.abs(canvas.h - canvas.cssHeight * effectiveDpr) > 2
    )
      throw new Error(`canvas ${canvas.w} != css ${canvas.css} × ${profile.dpr}`);
  }
  if (metrics.scrollWidth > metrics.innerW + 1 || metrics.scrollHeight > metrics.innerH + 1)
    throw new Error('Application content overflows the native viewport');
  for (const region of metrics.regions) {
    if (
      region.top < -1 ||
      region.left < -1 ||
      region.bottom > metrics.innerH + 1 ||
      region.right > metrics.innerW + 1
    )
      throw new Error(`Native region exceeds the viewport: ${region.name}`);
  }
  if (exceptions > 0) throw new Error(`${exceptions} uncaught page exception(s)`);

  const manifest = JSON.parse(readFileSync('dist/app-tauri/.vite/manifest.json', 'utf8'));
  const entry = manifest['index.html']?.file;
  const embeddedEntry = await client.page.locator('script[type="module"][src]').getAttribute('src');
  if (!entry || !embeddedEntry?.endsWith(`/${entry}`))
    throw new Error(`Native window embeds stale assets: ${embeddedEntry}, expected ${entry}`);

  const workerAsset = readdirSync('dist/app-tauri/assets').find((name) =>
    /^audio\.worker-.*\.js$/.test(name),
  );
  if (!workerAsset) throw new Error('Built audio worker is missing');
  const oggBytes = [...readFileSync('tests/fixtures/audio/generated-tone.ogg')];
  const decoded = await client.send('Runtime.evaluate', {
    expression: `new Promise((resolve, reject) => {
      const worker = new Worker(new URL(${JSON.stringify(`assets/${workerAsset}`)}, location.href), { type: 'module' });
      worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = ({ data }) => {
        worker.terminate();
        if (data.kind !== 'decoded') { reject(new Error(JSON.stringify(data))); return; }
        resolve({ channels: data.source.channels, sampleRate: data.source.sampleRate, length: data.source.length });
      };
      worker.postMessage({ kind: 'decode', id: 1, name: 'generated-tone.ogg', bytes: Uint8Array.from(${JSON.stringify(oggBytes)}) });
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  const audio = decoded.result.result.value;
  if (
    decoded.result.exceptionDetails ||
    audio?.channels !== 1 ||
    audio.sampleRate !== 44100 ||
    audio.length !== 13230
  ) {
    throw new Error(`Native Ogg worker failed: ${JSON.stringify(decoded.result)}`);
  }
  writeFileSync(join(runDir, 'ogg.json'), JSON.stringify(audio, null, 2));

  // Exercise actual native permissions, including state changes initiated outside Vue.
  const decorated = await client.page.evaluate(() =>
    globalThis.__TAURI_INTERNALS__.invoke('plugin:window|is_decorated', { label: 'main' }),
  );
  if (decorated !== false) throw new Error('Native window restored system decorations');
  const controls = client.page.locator('.window-controls button');
  await controls.nth(1).click();
  await client.page.waitForFunction(() =>
    globalThis.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized', { label: 'main' }),
  );
  await controls.nth(1).click();
  await client.page.waitForFunction(
    async () =>
      !(await globalThis.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized', {
        label: 'main',
      })),
  );
  await controls.nth(0).click();
  await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  await client.page.locator('.window-titlebar').waitFor({ state: 'visible' });
  writeFileSync(
    join(runDir, 'window-controls.json'),
    JSON.stringify({ decorated, maximize: true, restore: true, minimizeRequested: true }),
  );

  // Browser commands must not reload the document or consume editor shortcuts.
  await client.page.evaluate(() => {
    globalThis.document.body.dataset.inputProbe = 'retained';
  });
  await client.page.locator('.timeline-viewport').focus();
  for (const key of ['F5', 'Control+r', 'Control+Shift+r', 'Control+p', 'Control+f', 'F12']) {
    await client.page.keyboard.press(key);
  }
  const inputProbe = await client.page.evaluate(() => ({
    retained: globalThis.document.body.dataset.inputProbe === 'retained',
    contextMenuBlocked: !globalThis.document.body.dispatchEvent(
      new globalThis.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    ),
  }));
  if (!inputProbe.retained || !inputProbe.contextMenuBlocked)
    throw new Error('Native WebView browser input was not disabled');
  await client.page.keyboard.press('F1');
  await client.page.getByRole('dialog').waitFor({ state: 'visible' });
  await client.page.keyboard.press('Escape');
  await client.page.getByRole('dialog').waitFor({ state: 'hidden' });
  writeFileSync(
    join(runDir, 'browser-input.json'),
    JSON.stringify({ ...inputProbe, editorHelp: true }),
  );

  // The native host exposes fixed application folders, never renderer paths.
  const folders = await client.page.evaluate(() =>
    globalThis.__TAURI_INTERNALS__.invoke('app_data_folders'),
  );
  if (
    folders.length < 2 ||
    folders.some((folder) => !folder.path.endsWith('io.github.rirko.woslicer-dx'))
  )
    throw new Error('Native data-folder list is incomplete or points outside the application');
  const rejectedPath = await client.page.evaluate(async () => {
    try {
      await globalThis.__TAURI_INTERNALS__.invoke('open_data_folder', { kind: 'C:/Windows' });
      return false;
    } catch {
      return true;
    }
  });
  if (!rejectedPath) throw new Error('Data-folder command accepted a renderer path');
  await client.page.bringToFront();
  await client.page.locator('.track-number').click();
  await client.page.waitForFunction(
    () => !globalThis.document.querySelector('.menu-trigger').disabled,
  );
  await client.page.keyboard.press('Alt');
  await client.page.keyboard.press('h');
  await client.page.locator('[data-command="open-data-folder"]').waitFor({ state: 'visible' });
  await client.page.keyboard.press('t');
  await client.page.locator('.support-content').waitFor({ state: 'visible' });
  await client.page.locator('.data-folder').first().waitFor({ state: 'visible' });
  await client.page.screenshot({ path: join(runDir, 'troubleshoot.png'), animations: 'disabled' });
  await client.page.keyboard.press('Escape');
  await client.page.getByRole('dialog').waitFor({ state: 'hidden' });
  const gamepadApi = await client.page.evaluate(() => typeof navigator.getGamepads === 'function');
  if (!gamepadApi) throw new Error('Gamepad API is unavailable in the native WebView');
  await client.page.evaluate(() => {
    const pad = {
      index: 0,
      connected: true,
      mapping: 'standard',
      id: 'Xbox test controller',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    globalThis.addEventListener('test-gamepad', (event) => {
      for (const [index, button] of pad.buttons.entries()) {
        button.pressed = index === event.detail;
        button.value = button.pressed ? 1 : 0;
      }
    });
  });
  const controller = async (button) => {
    await client.page.evaluate(async (button) => {
      globalThis.dispatchEvent(new CustomEvent('test-gamepad', { detail: button }));
      await new Promise((resolve) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
      );
      globalThis.dispatchEvent(new CustomEvent('test-gamepad', { detail: -1 }));
      await new Promise((resolve) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
      );
    }, button);
  };
  await controller(9);
  await client.page.locator('.menu-popup:not([hidden])').waitFor({ state: 'visible' });
  if ((await client.page.locator('.input-device').getAttribute('data-device')) !== 'gamepad')
    throw new Error('Native controller did not change input hints');
  await controller(15);
  await controller(15);
  await client.page.screenshot({ path: join(runDir, 'controller-menu.png') });
  await controller(9);
  await controller(8);
  await client.page.locator('.guide-switch').waitFor({ state: 'visible' });
  const choices = client.page.locator('.guide-switch button');
  if ((await choices.nth(0).getAttribute('aria-pressed')) !== 'true')
    throw new Error('Help automatically changed its input reference');
  await choices.nth(0).focus();
  await controller(15);
  await controller(0);
  if ((await choices.nth(1).getAttribute('aria-pressed')) !== 'true')
    throw new Error('Controller cannot change the help reference');
  await client.page.screenshot({
    path: join(runDir, 'controller-help.png'),
    animations: 'disabled',
  });
  await controller(1);
  await client.page.getByRole('dialog').waitFor({ state: 'hidden' });
  writeFileSync(
    join(runDir, 'input-navigation.json'),
    JSON.stringify(
      {
        altNavigation: true,
        gamepadApi,
        simulatedXboxNavigation: true,
        manualHelpChoice: true,
        folders,
        rejectedPath,
      },
      null,
      2,
    ),
  );

  await client.page.locator('.statusbar button').click();
  await client.page.getByRole('dialog').waitFor({ state: 'visible' });
  const about = await client.send('Runtime.evaluate', {
    expression: `(async () => {
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(element => element.getBoundingClientRect().height > 0);
      if (!dialog || !/[a-f0-9]{40,64}/.test(dialog.textContent)) {
        throw new Error('About does not show the full commit');
      }
      const close = dialog.querySelector('.el-dialog__footer button');
      const bounds = close?.getBoundingClientRect();
      if (!bounds || bounds.bottom > innerHeight || bounds.top < 0) {
        throw new Error('About close button is outside the native viewport');
      }
      const links = Array.from(dialog.querySelectorAll('.credits a')).map(a => a.href);
      const expectedLinks = ${JSON.stringify(Object.values(creditLinks))};
      if (links.length !== expectedLinks.length || expectedLinks.some(url => !links.includes(url))) {
        throw new Error('About credit links are missing');
      }
      try {
        await window.__TAURI_INTERNALS__.invoke('open_about_link', { link: 'https://example.org' });
        throw new Error('The native command accepted an arbitrary URL');
      } catch (error) {
        if (!String(error).includes('unknown variant')) throw error;
      }
      return { text: dialog.textContent, links };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (about.result.exceptionDetails)
    throw new Error('native About check failed: ' + JSON.stringify(about.result.exceptionDetails));
  writeFileSync(join(runDir, 'about.json'), JSON.stringify(about.result.result.value, null, 2));
  const aboutShot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(runDir, 'about.png'), Buffer.from(aboutShot.result.data, 'base64'));

  console.log(
    `native UI profile ${profile.name}: viewport ${metrics.innerW}×${metrics.innerH} @DPR${metrics.dpr}, menu visible, ${metrics.canvases.length} canvases ok`,
  );
}

function metricsExpression() {
  return `(() => {
    const bar = document.querySelector('[role="menubar"]');
    let menubar = null;
    if (bar) {
      const rect = bar.getBoundingClientRect();
      const style = getComputedStyle(bar);
      menubar = {
        visible:
          rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      };
    }
    return {
      dpr: window.devicePixelRatio,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      regions: Array.from(document.querySelectorAll('.editor-toolbar, .playback-strip, .timeline, .side-panel, .statusbar'), element => {
        const rect = element.getBoundingClientRect();
        return { name: element.className, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      }),
      ready: document.readyState === 'complete',
      menubar,
      canvases: Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
        w: canvas.width,
        css: canvas.clientWidth,
        h: canvas.height,
        cssHeight: canvas.clientHeight,
      })),
    };
  })()`;
}

/** Per-run WebView2 profile data is heavy temp state; dropping it is best-effort. */
function dropHeavyProfileData(runDir) {
  for (const name of ['appdata-local', 'appdata-roaming']) {
    try {
      rmSync(join(runDir, name), { recursive: true, force: true });
    } catch (error) {
      console.warn(`could not drop ${name}: ${error.message}`);
    }
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

function delay(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function connectPage(port) {
  const { browser, page, session } = await connectNativePage(port);
  const exceptions = { count: 0 };
  session.on('Runtime.exceptionThrown', () => exceptions.count++);
  return {
    exceptions,
    page,
    send: async (method, params) => ({ result: await session.send(method, params) }),
    close: () => browser.close(),
  };
}

function stopTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // Verify the kill: a graceful Browser.close leaves the app shell alive and
    // taskkill can race a still-exiting process tree, so retry once.
    for (let attempt = 0; attempt < 2; attempt++) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5_000,
      });
      const listing = spawnSync('tasklist', ['/FI', 'PID eq ' + child.pid], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5_000,
      });
      if (!(listing.stdout ?? '').includes('woslicer-dx')) return;
    }
    console.warn(`process tree for pid ${child.pid} survived two kill attempts`);
  } else {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
}
