# Architecture and source map

woslicer-dx edits audio markers and exports WAV slices for BMS charts.
The browser and Tauri desktop application share the Vue interface, project model and audio Worker.
A project has one or more tracks, each with its own audio, markers and output settings.
The editor works on one current track. `currentTrackId` and `track` in the editor store select it;
`currentTrack` in `src/project/codec.ts` finds a track in a document.
Decoded audio, peaks, band analysis and loading state are per-track `sessions` in the editor store.
The workspace keeps one audio engine (Worker) per track. Playback plays every track through a gain stage per track; the current track drives the playhead. Preview and single-track export use the current track.
See [Project format](PROJECT_FORMAT.md) for that compatibility boundary.

## Source map

| Behavior | Main source locations |
| --- | --- |
| Application assembly and project replacement | [`src/app/App.vue`](../src/app/App.vue) |
| Menu entries and availability | [`src/app/menu.ts`](../src/app/menu.ts), [`ApplicationMenu.vue`](../src/app/components/ApplicationMenu.vue) |
| Commands: ids, labels, help groups, availability and execution | [`src/app/commands.ts`](../src/app/commands.ts) |
| Keyboard, controller and YuanCon bindings, including recording keys 1–7 | [`src/input/bindings.ts`](../src/input/bindings.ts) |
| Where input goes (dialogs, menus, wheel, text fields) | `inputContext` in [`App.vue`](../src/app/App.vue), [`src/input/router.ts`](../src/input/router.ts), [`context.ts`](../src/input/context.ts) |
| Command wheel | [`src/input/wheel.ts`](../src/input/wheel.ts), [`use-wheel.ts`](../src/input/use-wheel.ts), [`CommandWheel.vue`](../src/app/components/CommandWheel.vue) |
| Timeline rendering and gestures | [`src/timeline/`](../src/timeline/) |
| Marker edits and undoable document state | [`editor-store.ts`](../src/slicing/editor-store.ts), [`editor-actions.ts`](../src/slicing/editor-actions.ts) |
| Project loading, saving and recovery | [`src/workspace/`](../src/workspace/), [`src/project/`](../src/project/) |
| Playback and input timestamps | [`src/playback/`](../src/playback/) |
| Decoding and Worker requests | [`src/audio/`](../src/audio/) |
| Slice rendering, peaks and analysis | [`src/core/`](../src/core/) |
| Slice export controls | [`src/export/OutputPanel.vue`](../src/export/OutputPanel.vue) |
| BMHelper MIDI division | [`src/bmhelper/`](../src/bmhelper/) |
| OS/browser services | [`src/platform/`](../src/platform/) |
| Gamepad reader, fixed menu and dialog navigation, polling | [`src/input/gamepad.ts`](../src/input/gamepad.ts), [`use-gamepad.ts`](../src/input/use-gamepad.ts) |
| YuanCon protocol, device session and recording | [`src/input/yuancon/`](../src/input/yuancon/) |
| Languages, fonts and theme | [`src/i18n/`](../src/i18n/), [`src/ui/`](../src/ui/), [`build-fonts.mjs`](../scripts/build-fonts.mjs) |
| Native commands and permissions | [`src-tauri/src/`](../src-tauri/src/), [`capabilities/`](../src-tauri/capabilities/), [`permissions/`](../src-tauri/permissions/) |

## State and commands

The editor store owns document state and undo history. Feature components read its reactive projections and commit document edits through transactions.
The workspace owns file operations, recovery and transient loading state. `TrackHeader.vue` displays the current audio load activity.
Playback and device sessions keep runtime resources outside the portable project document.
Revision checks reject stale asynchronous results and gestures after document replacement.

Discrete actions follow input → command → feature action. Menus, keyboard shortcuts, controllers, YuanCon and the command wheel run commands only through `createCommands().run`.
To add a command, add one entry to `COMMANDS` and, if it needs keys, one row to `BINDINGS`. Menus, tooltips, help and the controller hint row read both.
Bindings have two layers. The recording layer lies over the editing layer and hides only the controls that it binds or reserves.
Menu, dialog and wheel navigation on a controller is fixed in `UI_NAVIGATION` and is not part of the binding table.
`run` does nothing while a dialog is visible or `modalOpen` in `App.vue` is true. Register every new app dialog in `modalOpen`.
The feature action owns validation and undo behavior. Continuous pointer gestures and form drafts remain local to their feature.

`WindowTitlebar.vue` delegates native controls through `src/platform/desktop-window.ts`.
Native window-state restoration excludes decorations so it preserves the frameless window configuration.
`App.vue` confirms exit and saves recovery data before native window closure.
`WorkspacePanels.vue` owns panel visibility and order.

## Audio path

1. The platform adapter reads a user-selected file.
2. The workspace records metadata and a content hash for project relinking.
3. The audio Worker decodes bytes through `@gumi-conqueror/audio-decode`.
4. The Worker retains source samples and produces playback data, peaks and analysis results.
5. Slice export converts the selected frames to PCM16 and applies the established fade and gate behavior.

All input formats, including WAV, use the same Symphonia WASM decoder on Web and desktop.
The decoder package comes from a fixed GitHub Release URL. `package-lock.json` records its integrity hash.
Vite bundles the WASM asset. The application does not download codecs at runtime.
The decoder repository also exposes a native Rust API, which this application does not use.

Source buffers hold Float32 values on a full-scale amplitude of 32768. Playback buffers use normalized Float32 values.
Editing and analysis preserve fractional samples and floating-point headroom. Export remains 16-bit PCM WAV.
`src/core/audio/pcm.ts` owns the amplitude scale. Runtime input uses `src/audio/decode.ts`.
`src/core/audio/slice.ts` renders one slice for both preview and export. `src/core/slices.ts` owns slice ranges and file names.

The decoder detects the container from the file contents. File pickers and project metadata use extensions from `src/core/audio-formats.ts`.
Keep the native file allowlist in `src-tauri/src/files.rs` aligned when adding an input format.
Runtime imports accept mono or stereo. AAC can retain encoder delay and padding.
Matroska decodes one audio track. An implicit default flag can cause selection of the first audio track in Symphonia 0.6.1.
Opus, APE audio, WavPack and HE-AAC are not enabled. See the [decoder repository](https://github.com/gumi-conqueror/audio-decode) for its API and format scope.

## Native host and input

The Rust host provides file transfers (`files.rs`), clipboard access (`clipboard.rs`), HID input (`input.rs`), recovery (`session.rs`) and window setup (`lib.rs`).
Audio processing and editing rules remain in the shared frontend.
Native commands are constrained by Tauri capabilities. About links use fixed identifiers, not arbitrary URLs.
Both application variants keep user data local and bundle runtime assets. Their CSP definitions are in `src/app/index.html`, `vite.config.mts` and `src-tauri/tauri.conf.json`.

Standard gamepads enter through `src/input/use-gamepad.ts`.
YuanCon uses the native HID backend on desktop and WebHID in supporting browsers, selected by `src/platform/input/`.
The native reader opens the listed joystick interfaces on a dedicated thread and removes identical consecutive reports.
Both backends separate the report ID from its payload and use the same TypeScript protocol decoder.

The native adapter aligns host timestamps with `performance.now()` using five IPC round trips and the shortest observed round trip.
`src/playback/input-timeline.ts` maps captured input to playback positions across rate changes, pauses and seeks.
History expires after 30 seconds and resets when the source changes. Focus and recording-context changes reject earlier input.
These timestamps measure host receipt, not mechanical contact. Hardware latency and OS device permissions need physical-device checks.

The sanitized [YuanCon fixture](../tests/fixtures/input/README.md) can replay protocol behavior without hardware.
Its metadata describes the available evidence and its limits. The seven logical keys map to marker numbers 1–7.
The numbered device preview lets users check the physical key order. Binding definitions are in `src/input/bindings.ts`.

## Translations and fonts

Edit the four JSON files under `src/i18n/`. `npm run generate:i18n` creates metadata for typed translation access.
Vite generates IBM Plex Sans subsets from translations, UI literals and Element Plus locale text.
The subset families are renamed to WOS UI and include their license in NOTICE.
CJK faces use weights 400, 500, 600 and 700. The Latin face retains its variable weight axis.
The document language selects the regional face. Editable text fields use `sans-serif` to cover user-entered characters outside the subsets.
UI chrome must not use `system-ui`. See [font verification](DEVELOPMENT.md#validation) after text or font changes.

## Dependency ownership

| Repository | Responsibility | Application consumption |
| --- | --- | --- |
| [wos-file](https://github.com/gumi-conqueror/wos-file) | Fixed `.wos` binary reader/writer | Exact Git commit in npm metadata |
| [bmh-file](https://github.com/gumi-conqueror/bmh-file) | Original `.bmh` binary data and CP932 conversion | Exact Git commit in npm metadata |
| [audio-decode](https://github.com/gumi-conqueror/audio-decode) | Symphonia native and WASM decoding | Versioned prebuilt WASM archive |
| [agent-skills](https://github.com/gumi-conqueror/agent-skills) | Optional agent instructions | Pinned `.agents` submodule |

Clone a dependency separately only when changing that library. Publish or push its tested version before updating this application's dependency pin.
Run the dependency's checks, update the npm lockfile, then run the application integration tests.
The application code uses MIT. Dependency notices retain their own license terms.
Decoder notices are generated by its package and bundled in About and `THIRD_PARTY_NOTICES.txt`.
