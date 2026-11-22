// Desktop IPC transport health check against the built Tauri executable.
// Verifies the fetch-based ipc custom protocol is actually in use: a healthy
// transport delivers raw command responses as ArrayBuffer and never emits the
// "custom protocol failed" fallback warning. Requires the selected build
// (npm run build:desktop or cargo build) and, for the raw-chunk stage, at least one
// persisted file grant (open a file once in the app). Run: node scripts/tauri-ipc-probe.mjs
import { createServer } from 'node:net';
import { connectNativePage } from './native-cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { readFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveBuildProfile } from './build-profile.mjs';

if (platform() !== 'win32') {
  console.log('tauri ipc probe: skipped on this platform (WebView2/CDP is Windows-only)');
  process.exit(0);
}

// Resolve the built executable without any machine-specific absolute path:
// CARGO_TARGET_DIR (as used by the local cargo config) or the repo default.
const targetDir = process.env.CARGO_TARGET_DIR ?? resolve('src-tauri/target');
const exeName = platform() === 'win32' ? 'woslicer-dx.exe' : 'woslicer-dx';
const selected = resolveBuildProfile(process.argv.slice(2));
if (selected.args.length) throw new Error(`Unknown probe options: ${selected.args.join(' ')}`);
const exe = resolve(targetDir, selected.profile, exeName);
if (!existsSync(exe)) {
  console.error(
    `built executable not found: ${exe} — run npm run build:desktop${selected.profile === 'release' ? ' -- --release' : ''} first`,
  );
  process.exit(1);
}
// The probe drives WebView2 over CDP, which is Windows-specific; on other
// platforms it exits cleanly instead of guessing at file locations.
const grantsPath =
  platform() === 'win32'
    ? resolve(
        process.env.APPDATA ?? resolve(homedir(), 'AppData/Roaming'),
        'io.github.rirko.woslicer-dx/file-grants.json',
      )
    : null;
const listener = createServer();
await new Promise((ready) => listener.listen(0, '127.0.0.1', ready));
const port = listener.address().port;
await new Promise((closed) => listener.close(closed));
mkdirSync('test-artifacts/tauri-ipc', { recursive: true });
const data = mkdtempSync(resolve('test-artifacts/tauri-ipc/profile-'));
const child = spawn(exe, [], {
  env: {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: data,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
  stdio: 'ignore',
});
function stop() {
  if (child.pid)
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 5000,
    });
}
const watchdog = setTimeout(() => {
  stop();
  console.error('Native IPC probe exceeded 30 seconds');
  process.exit(1);
}, 30_000);
let client;
try {
  const { browser, session } = await connectNativePage(port);
  client = browser;
  const warnings = [];
  session.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'warning') warnings.push(args.map((arg) => arg.value ?? '').join(' '));
  });
  const grants = JSON.parse(readFileSync(grantsPath, 'utf8'));
  const reference = Object.entries(grants).find(([, path]) => existsSync(path))?.[0];
  if (!reference) throw new Error('no persisted file grant; open a file once in the app first');
  const expression = `(async () => {
    const T = window.__TAURI_INTERNALS__;
    const transfer = await T.invoke("begin_read", { reference: ${JSON.stringify(reference)} });
    const raw = await T.invoke("read_file_chunk", { transfer, offset: 0, length: 65536 });
    await T.invoke("close_reader", { transfer });
    return { isInstance: raw instanceof ArrayBuffer, byteLength: raw.byteLength };
  })()`;
  const reply = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (reply.exceptionDetails) throw new Error(`probe failed: ${reply.exceptionDetails.text}`);
  const result = reply.result.value;
  const fallback = warnings.filter((text) => text.includes('custom protocol'));
  if (fallback.length) throw new Error(`ipc fell back to postMessage: ${fallback[0]}`);
  if (!result.isInstance)
    throw new Error(`raw chunk arrived as ${Object.prototype.toString.call(result)}`);
  console.log(
    `tauri ipc transport ok: raw chunk arrived as ArrayBuffer (${result.byteLength} bytes), no fallback`,
  );
} finally {
  clearTimeout(watchdog);
  await client?.close();
  stop();
}
