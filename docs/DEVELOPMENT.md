# Development guide

This guide starts from a new checkout. Run commands from the directory containing `package.json`.
For source locations and data flow, see [Architecture](ARCHITECTURE.md).
For branch selection and review, see [Contributing](../CONTRIBUTING.md).

## Requirements

Browser development needs Git, Node.js 26.x and npm. The repository records the Node version in [`.node-version`](../.node-version).
Desktop development also needs rustup and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/):

| Platform | Desktop prerequisites |
| --- | --- |
| Windows | MSVC C++ build tools, Windows SDK and WebView2 |
| macOS | Xcode Command Line Tools |
| Linux | WebKitGTK 4.1 and system development packages for your distribution |

The [desktop CI action](../.github/actions/build-desktop/action.yml) lists the Linux packages used on Ubuntu runners.
The root [`rust-toolchain.toml`](../rust-toolchain.toml) pins Rust, rustfmt and Clippy.
Run `rustup toolchain install` from the checkout to install that toolchain.

Application builds do not need sibling repositories, FFmpeg, wasm-pack or agent software.
`npm ci` installs the pinned format libraries and the prebuilt audio decoder.
Agent-assisted work can additionally use the optional [skill submodules](SKILLS.md).

## First run

Clone the integration branch:

```sh
git clone --branch dev https://github.com/gumi-conqueror/woslicer-dx.git
cd woslicer-dx
```

Set `IBM_TELEMETRY_DISABLED=true` before dependency installation. This disables the IBM font package's installation telemetry.

PowerShell:

```powershell
$env:IBM_TELEMETRY_DISABLED = 'true'
```

Bash or Zsh:

```sh
export IBM_TELEMETRY_DISABLED=true
```

Install dependencies, generate translation metadata, and start the browser UI:

```sh
npm ci
npm run generate:i18n
npm run dev
```

Open `http://127.0.0.1:1420`. The first startup also generates local font subsets.
Stop the server before starting desktop development, which uses the same port:

```sh
npm run dev:desktop
```

Tauri starts its own frontend server. Import a fixture from `tests/fixtures/audio/` to check loading, playback and the waveform.
Regenerate translation metadata after changing `src/i18n/*.json`. Restart the server after adding characters to UI text so font subsets include them.

## Commands and output

| Task | Command | Result |
| --- | --- | --- |
| Browser development | `npm run dev` | Vite server on port 1420 |
| Desktop development | `npm run dev:desktop` | Tauri window using its frontend server |
| Lint, format, types and version | `npm run check` | Validation only |
| Tooling, component and core tests | `npm test` | Test reports in the terminal |
| Build the website | `npm run build` | `dist/app/` |
| Build the desktop executable | `npm run build:desktop` | `src-tauri/target/debug/`, or the configured Cargo target directory |
| Build and archive the website | `npm run package:web` | `release/web/` |
| Build desktop installers | `npm run package:desktop` | Cargo target directory, under the selected profile's `bundle/` |
| Test the built website | `npm run test:ui` | `test-artifacts/app-ui/` |
| Test the built Windows window | `npm run test:desktop` | `test-artifacts/tauri-ui/` |
| Check Windows IPC | `npm run test:ipc` | Native command and permission checks |
| Apply formatting or lint fixes | `npm run format` / `npm run lint:fix` | Source changes |

Use `test:tooling`, `test:components` or `test:core` to run one unit-test group.
The package commands build fresh output. To archive an already tested website, run `node scripts/package-web.mjs`.
On macOS, select the DMG bundle explicitly with `npm run package:desktop -- --bundles dmg`.
Generated files under `dist/`, `src/app/generated/` and `src-tauri/generated/` are not source files.

## Validation

For frontend changes, install Playwright's Chromium once, then run:

```sh
npm exec -- playwright install chromium
npm run check
npm test
npm run build
npm run test:ui
node scripts/package-web.mjs
```

Linux hosts also need Playwright's browser system dependencies. CI uses a matching Playwright container with those dependencies installed.
The UI runner tests low and high device pixel ratios (DPR 1 and 2) separately at 1000×640 CSS pixels.
Each profile starts a fresh process and browser contexts, with a 30-second total deadline.
Two workers run independent test files within each profile. Raster checks also cover fractional DPR values.
The browser checks do not exercise native window controls or OS permissions.

For desktop changes, also run:

```sh
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm run build:desktop
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-features
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings
```

The Tauri build prepares static frontend assets and build identity before Cargo. Direct Cargo commands require those generated files.
After a commit or version change, regenerate identity with `node scripts/tauri-build-info.mjs` before direct Cargo checks.

On Windows, run `npm run test:desktop` and `npm run test:ipc` against the built executable.
The desktop UI runner checks native window decorations, file permissions, About links, audio decoding, menu visibility and canvas sizing.
It uses WebView2 at the host's natural scale and DPR 2, with a 30-second deadline per profile.
Its WebView2 directories are separate, but native recovery storage can still use the user's Windows data directory.
Run these checks with disposable application state. Native UI checks report skipped on other operating systems.

For font changes, run `node scripts/verify-fonts.mjs` after the web build.
It checks four languages at 100%, 125% and 150% scale, including 12px text in light and dark themes.
Reports go to `test-artifacts/fonts/`. Physical controllers require separate hardware checks.

## Build profiles

Local builds and package commands default to debug. Append `-- --release` to select release, for example `npm run build:desktop -- --release`.
`WOSLICER_BUILD_PROFILE` can also select the profile. Explicit command-line flags take precedence.

| Output | Debug | Release |
| --- | --- | --- |
| Frontend | Static assets without JS/CSS minification | Minified static assets |
| Rust host | Cargo dev profile | Cargo release profile |

Both static frontend variants retain the offline content security policy (CSP) and omit source maps.
Use the development server for source debugging. Rust profile settings are in [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml).
Set `CARGO_PROFILE_DEV_DEBUG=2` when native debug symbols are needed.
For release executable checks, pass `-- --release` to the build and native test commands.

## Common setup failures

| Symptom | Check |
| --- | --- |
| Missing `src/i18n/generated.ts` | Run `npm run generate:i18n` before the development server. Builds and type checks generate it automatically. |
| Port 1420 is occupied | Stop the other browser or Tauri development server. |
| Missing Chromium | Run `npm exec -- playwright install chromium` in the checkout. |
| Stale Tauri build identity | Run `node scripts/tauri-build-info.mjs`, then repeat the Cargo command. |
| Native test cannot find the executable | Build the same debug/release profile and use the same `CARGO_TARGET_DIR`. |
| New UI characters are missing | Restart the development server or rebuild the frontend to regenerate font subsets. |

See [CI](CI.md) for hosted build failures and [Versioning](VERSIONING.md) for version consistency errors.
