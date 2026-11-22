# Development guide

See [Contributing](../CONTRIBUTING.md) for branch routes and pull request targets.

## Repository layout

- `src/` contains the Vue interface, audio processing and project logic.
- `src-tauri/` contains the native desktop host, permissions and bundle configuration.
- `tests/` contains unit, component and browser tests, along with their runner configuration.
- `scripts/` contains build, packaging and verification commands.

### Finding a UI behavior

| UI area | Entry point and behavior owner |
| --- | --- |
| Application menu | `src/app/components/ApplicationMenu.vue` renders `src/app/menu.ts`, which owns the menu entries, command type and availability. `src/app/commands.ts` dispatches actions and keyboard shortcuts. |
| Waveform | `src/timeline/TimelineEditor.vue` owns the canvas lifecycle. `gestures.ts` handles pointer edits and `render.ts` draws the timeline. |
| Cut list | `src/slicing/MarkerList.vue` owns selection controls. `editor-actions.ts` implements marker operations. |
| BMHelper | `src/bmhelper/BMHelperPanel.vue` owns the panel. `store.ts` derives its content from the project payload and commits edits through the editor. |
| Project open/save | `src/workspace/workspace.ts` coordinates file operations and recovery. `persistence.ts` serializes recovery writes. `src/project/schema.ts` defines Zod field schemas and derives document types. `codec.ts` owns version compatibility, normalization and business validation. |
| Playback | `src/playback/PlaybackControls.vue` owns controls. Fader drafts preview the monitor gains, then commit one document edit on release. `index.ts` manages audio playback and cleanup. |
| Record and YuanCon | `src/app/recording-bindings.ts` owns the preset and help mappings. `use-yuancon-recording.ts` connects the application-owned device session to recording commands. `src/input/yuancon/` owns the device profile and connection state. `YuanconDialog.vue` displays that session. |
| Document/output settings | `src/app/components/DocumentOptions.vue` and `src/export/OutputPanel.vue` read reactive editor projections and write undoable transactions through `src/slicing/editor-store.ts`. |
| Language/theme and dialogs | `src/app/components/PreferencesControls.vue` uses `src/ui/preferences.ts`. Help and About live in `src/app/components/` and open from the Help menu; calibration opens from Tools. Calibration lives in `src/calibration/CalibrationDialog.vue`. |

`src/app/App.vue` assembles these features and owns project-replacement confirmations.
`WindowTitlebar.vue` owns native window controls through `src/platform/desktop-window.ts`.
Window-state restoration excludes `DECORATIONS`, so old saved borders cannot override
the frameless builder. The native UI runner verifies the actual decoration state.
`App.vue` confirms native exit and saves recovery data before the window closes.
The transport is above the workspace. `TrackHeader.vue` identifies the current audio lane,
and `WorkspacePanels.vue` owns the collapsible inspector. This layout leaves room for
future lanes. Editing and playback still use the existing single-track model.
`src/app/components/MediaLoading.vue` shows the current recovery or media-loading stage.
The workspace owns this transient state. Each open request clears only its own indicator.
The component accepts a media ID and file name, so a future track layout can place it beside its media.
UI consumers read the editor's reactive document projections directly. Revision
checks are for detecting stale asynchronous work and gestures. Platform file
access stays in `src/platform/`, and audio worker processing stays in `src/audio/`.

`tests/app/editor-actions.test.ts` checks marker actions through the same editor
store as the interface. `tests/components/bmhelper.test.ts` checks BMHelper edits,
project history and exports.

### Input, commands and platform boundaries

Discrete user intents follow input → command → feature action. Keyboard shortcuts
and menu buttons share `src/app/commands.ts`. `src/app/shortcuts.ts` owns key bindings,
command labels and help groups. The dispatcher, menu hints, tooltips, calibration
and `HelpDialog.vue` consume that registry; README files link to the in-app guide. The feature action owns document
validation, undo and playback behavior. Continuous pointer gestures and local
form edits stay with their feature rather than routing every movement through a
global dispatcher. An action uses platform capabilities only when it needs files, clipboard, recovery storage or other host services.

`src/app/use-input-controls.ts` reads standard gamepads and routes menu navigation.
YuanCon uses `src/platform/input/`: desktop builds select the native HID backend;
web builds select WebHID. `src-tauri/src/input.rs` opens only listed YuanCon joystick
interfaces and reads them on a dedicated thread. It removes identical consecutive
reports and sends every change through a Tauri channel. Both backends separate the
report ID from its payload and use the same TypeScript decoder. The seven key bits
remain distinct; the recording preset maps all seven to marker input.

The native adapter aligns its monotonic clock with `performance.now()` using the
shortest of five IPC round trips. `src/playback/input-timeline.ts` keeps recent
playback boundaries so delayed marker input uses its capture position across
rate changes, pauses and seeks. History expires after 30 seconds and resets when
the audio source changes. Focus and recording-context changes reject older input.
These are host receipt times, not measured mechanical contact times. Hardware
timing and platform device permissions still require physical-device checks.

`tests/fixtures/input/yuancon-capture.json` contains the 1,481 state snapshots from
the supplied capture after identical consecutive reports were removed. It keeps
only relative times, seven-key masks and turntable values. The source archive hash
identifies the recording. Rust and TypeScript replay it to check 795 key presses,
795 releases and 31 turntable runs. The sample has no labeled mechanical actions;
it does not establish a tail-noise filter or physical key order.

Web and Tauri share the Vue interface, editing rules and audio worker. The Rust
host in `src-tauri/src/` handles native file access and transfers (`files.rs`),
clipboard interoperability (`clipboard.rs`), HID input (`input.rs`), recovery storage (`session.rs`) and
window setup (`lib.rs`). It does not implement audio processing or editing rules.

## Local setup and checks

For agent-assisted work, initialize the [project skill submodules](SKILLS.md#initialize-submodules).
Application builds do not require these submodules.

Install Node.js 26.x, npm and Git. For desktop work, install rustup and the Tauri system dependencies for your platform.
The root `rust-toolchain.toml` selects the compiler and components for local work and CI.
Run `rustup toolchain install` to install them. Run `rustup show` to inspect the active toolchain.
Windows uses WebView2 and Linux needs WebKitGTK and the corresponding system development packages. The [desktop build action](../.github/actions/build-desktop/action.yml) lists the Linux packages used by CI.

Start the browser development server with:

```sh
npm ci
npm run dev
```

Use these commands from the application root:

| Task | Command |
| --- | --- |
| Develop in the browser | `npm run dev` |
| Develop in the desktop window | `npm run dev:desktop` |
| Check lint, formatting, types and version | `npm run check` |
| Run tooling, component and core tests | `npm test` |
| Build the static website | `npm run build` |
| Build the desktop executable without installers | `npm run build:desktop` |
| Build and package the website | `npm run package:web` |
| Build the desktop application and installers | `npm run package:desktop` |
| Test the built website | `npm run test:ui` |
| Test the built desktop window or IPC | `npm run test:desktop` / `npm run test:ipc` |
| Apply source formatting or lint fixes | `npm run format` / `npm run lint:fix` |

Run individual test groups with `test:tooling`, `test:components` or `test:core`.
The desktop development command starts Tauri. Tauri starts its frontend server through its internal hook.
For a complete local validation, run:

```sh
npm run check
npm test
npm run build:desktop
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-features
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings
npm run build
npm run test:ui
npm run package:desktop
```

## Build profiles

All build and package commands default to debug locally.
Both package commands build fresh output before creating archives or installers.
Select release explicitly when needed:

```sh
npm run build -- --release
npm run build:desktop -- --release
npm run package:web -- --release
npm run package:desktop -- --release
```

The build scripts also accept `WOSLICER_BUILD_PROFILE=debug` or `release`.
CI prepares the desktop frontend once with `node scripts/build-app-frontend.mjs tauri --release` before Cargo checks.
It disables the Tauri build hook when packaging that tested output.
CI archives an already tested website with `node scripts/package-web.mjs`, without `--build`.
Local Rust checks and tests use Cargo's default dev/test profiles. Add
`--release` explicitly to run release checks or tests. JavaScript unit tests
do not have a Cargo compilation profile. UI tests exercise the static output
from the preceding build. Local builds use debug unless you select release.

Debug frontend output still comes from `vite build`, with the same offline
CSP and application behavior. It skips JS/CSS minification and compressed-size
reporting. Static builds omit source maps to reduce build work. Use the Vite
development server for source debugging. Rust dev/test builds use no optimization,
no debug symbols, no LTO, incremental compilation and 256 codegen units to favor
compile/link speed. Debug assertions and overflow checks remain enabled. For native
source debugging, set `CARGO_PROFILE_DEV_DEBUG=2` explicitly.
Release frontend output minifies JS/CSS and omits source maps.
Rust release builds use `opt-level = "z"`, LTO, one codegen unit and symbol
stripping. Panic unwinding remains enabled so tests and bundles can reuse
compatible release dependencies. These settings prioritize size, without
promising a fixed reduction for every platform.

### Release size tradeoffs

Vite runs `scripts/build-fonts.mjs` for both frontend variants and the development
server. It subsets local IBM Plex Sans fonts from translations, UI source
literals and Element Plus locale text. Generated WOFF2 files stay in the ignored
`src/app/generated/fonts/` directory. Builds include only these subsets, with their
license in NOTICE. Restart the development server after adding new characters.
The build renames subset families to WOS UI because Plex is a Reserved Font Name.
It retains hinting, layout features and copyright metadata. CJK faces include
weights 400, 500, 600 and 700. The Latin face retains its variable weight axis.
The SC source package has an install-time telemetry script. CI disables it with
`IBM_TELEMETRY_DISABLED=true`. Set the same environment variable before installing
dependencies in other environments. No font package scripts enter the app bundle.
The document language selects the regional font. Editable fields use `sans-serif`
so user text can use system fallback fonts. Do not use `system-ui` for UI chrome.

After a frontend build, run `node scripts/verify-fonts.mjs` to check all four
languages at 100%, 125% and 150% scale. Each isolated profile has a 30-second
deadline. The check records light/dark screenshots and verifies local glyphs at
12px in every bundled weight. Results are in `test-artifacts/fonts/`.

All input formats, including WAV, use the published `audio-decode` Symphonia WASM package
inside the audio Worker. The fixed GitHub Release URL and npm integrity hash are locked
in `package-lock.json`. App builds do not compile the decoder or fetch runtime assets.
Desktop and Web use this same path. The decoder repository also exposes a native Rust API,
but the application does not add a second native decode/IPC path.
Runtime source buffers retain Float32 samples on the existing 32768 amplitude scale.
Playback and analysis retain fractional samples and floating-point headroom. Slice export
converts only the requested frames into the existing PCM16 fade/gate pipeline.
The canonical WAV writer and original `.wos` / `.bmh` formats do not change.
Matroska decodes one audio track and supports only the enabled codecs. Symphonia 0.6.1
can select the first audio track when a later track's default flag is implicit.
The application does not offer track selection; extract the desired audio track first if needed.
AAC can retain encoder delay and padding. The source header, not its extension, selects
the decoder; file pickers and project media use the extension list in `core/audio-formats.ts`.
The generated package notices are bundled in the About dialog and `THIRD_PARTY_NOTICES.txt`.
Application Rust profiles optimize the native host, not this prebuilt decoder.
`strip = "symbols"` is equivalent to `strip = true`. It removes symbol information
without changing normal error handling. Keep separate symbols if you need to resolve native crash addresses to source locations. `panic = "abort"` is a separate failure-policy choice:
it terminates the process on a Rust panic, skips stack unwinding and prevents
`catch_unwind` recovery. Ordinary `Result` errors still behave normally. Standard
Cargo tests require unwind, so abort application builds may need a second set of
compiled dependencies. Unwind permits cleanup and catch boundaries but does not
guarantee that the application survives every panic.
Fat LTO and one codegen unit favor cross-crate optimization at the expense of
build parallelism and link time. Evaluate `s`, thin LTO and more codegen units as
a combination using identical frontend assets. Compare compressed package size
as well as executable size. See [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html).

## Validation

Lint and format checks run on the whole managed scope and must pass with zero
findings. CI runs them right after `npm ci` and before any build. Local commits run staged-file lint/format checks through the pre-commit hook.
Keep the working tree clean before preparing a commit.
Typecheck covers Vue and core test sources. Tests cover components and core.
### Browser UI

The UI wrapper starts separate Playwright processes for low (DPR 1) and high
(DPR 2), both at 1000×640 CSS pixels, against the built static dist/app on loopback. Each has
a 30-second outer deadline that kills the process tree. Playwright closes
its browser contexts and server between profiles. Install Chromium using
npm exec --no -- playwright install chromium.

The checks cover viewport boundaries while loading and resizing. Raster checks
also cover DPR 1.25 and 1.5 and require one-device-pixel waveform lines across zoom levels.

### Native window and IPC

`npm run test:ipc` is a Windows-local desktop IPC health check against
the debug executable by default. Use `npm run test:ipc -- --release`
to check an explicitly built release executable.

`npm run test:desktop` drives the native window through the WebView2 Chrome DevTools Protocol (CDP) on a dynamic loopback port.
It runs two profiles:

- Low: a 1000×640 CSS viewport at the host's natural device scale.
- High: the same 1000×640 CSS viewport at device scale 2.

Each profile uses a separate WebView2 user-data directory and a 30-second hard deadline.
Native recovery data can still use Windows Known Folders; these checks do not isolate it.
The runner terminates the full process tree after each profile. It verifies the
application menu bar visibility, devicePixelRatio, canvas-to-DPR size
relationships, viewport boundaries, Ogg decoding and About links. It captures screenshots under
`test-artifacts/tauri-ui/`. It defaults to the debug executable built with the
following command. Tauri embeds static assets in debug builds too. Plain
`cargo build` without `custom-protocol` instead requires the development server.
Add `--release` to both commands to check a release build.
On non-Windows hosts the profiles report skipped.

```sh
npm run build:desktop
npm run test:desktop
```

## References

- [Documentation guide](README.md)
- [CI and release workflows](CI.md)
- [Application versioning](VERSIONING.md)
- [Project format](PROJECT_FORMAT.md)

## Related repositories

- `../agent-skills`: shared skills, used through the `.agents` submodule.
- `../wos-file`: fixed WOS binary reader and writer.
- `../bmh-file`: original BMH binary reader, writer, types and CP932 name conversion.

The format packages have no runtime dependencies. The app imports their public APIs directly. npm installs the exact Git commits recorded in package.json and package-lock.json; sibling checkouts are only for package development.

Run npm test in the affected format package, then update its pinned commit in this app and run the application checks. The application retains integration tests for WOS settings, BMH recording construction and Unicode DX projects.
