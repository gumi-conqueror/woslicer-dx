# Architecture and source map

woslicer-dx edits audio markers and exports WAV slices for BMS charts.
The browser and Tauri desktop application share the Vue interface, project model and audio Worker.
A project has one or more tracks, each with its own audio, markers and output settings.
Markers at the same tick on several tracks can be linked; edits of a linked marker then apply to all of them.
The editor works on one current track. `currentTrackId` and `track` in the editor store select it;
`currentTrack` in `src/project/codec.ts` finds a track in a document.
Decoded audio, peaks, band analysis and loading state are per-track `sessions` in the editor store.
The workspace keeps one audio engine (Worker) per track. Playback plays every track through a gain stage per track; the current track drives the playhead. Preview and single-track export use the current track.
See [Project format](PROJECT_FORMAT.md) for that compatibility boundary.

## Source map

| Behavior | Main source locations |
| --- | --- |
| Application assembly and project replacement | [`src/app/App.vue`](../src/app/App.vue) |
| Menu entries and availability | [`src/commands/menu.ts`](../src/commands/menu.ts), [`ApplicationMenu.vue`](../src/app/components/ApplicationMenu.vue) |
| Commands: ids, labels, help groups, availability and execution | [`src/commands/commands.ts`](../src/commands/commands.ts) |
| Keyboard, controller and YuanCon bindings, including recording keys 1–7 | [`src/input/bindings.ts`](../src/input/bindings.ts) |
| Where input goes (dialogs, menus, wheel, text fields) | `inputContext` in [`App.vue`](../src/app/App.vue), [`src/input/router.ts`](../src/input/router.ts), [`src/ui/focus.ts`](../src/ui/focus.ts) |
| Command wheel | [`src/input/wheel.ts`](../src/input/wheel.ts), [`use-wheel.ts`](../src/input/use-wheel.ts), [`CommandWheel.vue`](../src/input/CommandWheel.vue) |
| Timeline rendering and gestures, track header | [`src/timeline/`](../src/timeline/) |
| Marker edits, the marker clipboards and undoable document state | [`editor-store.ts`](../src/slicing/editor-store.ts), [`editor-actions.ts`](../src/slicing/editor-actions.ts) |
| Project loading, saving and recovery | [`src/workspace/`](../src/workspace/), [`src/project/`](../src/project/) |
| Playback and input timestamps | [`src/playback/`](../src/playback/) |
| Decoding and Worker requests | [`src/audio/`](../src/audio/) |
| Slice rendering, peaks and analysis | [`src/core/`](../src/core/) |
| Slice export | [`src/export/exporter.ts`](../src/export/exporter.ts); controls in [`OutputPanel.vue`](../src/export/OutputPanel.vue) and [`ExportDialog.vue`](../src/export/ExportDialog.vue) |
| Band and edge detection | [`src/detection/detection.ts`](../src/detection/detection.ts), [`DetectionPanel.vue`](../src/detection/DetectionPanel.vue) |
| BMHelper MIDI division | [`src/bmhelper/`](../src/bmhelper/) |
| WOS settings import and export, BMSE clipboard | [`src/interop/legacy.ts`](../src/interop/legacy.ts); the file formats are in `src/core/formats/` and `@gumi-conqueror/wos-file` |
| OS/browser services | [`src/platform/`](../src/platform/) |
| Gamepad reader, fixed menu and dialog navigation, polling | [`src/input/gamepad.ts`](../src/input/gamepad.ts), [`use-gamepad.ts`](../src/input/use-gamepad.ts) |
| YuanCon protocol, device session and recording | [`src/input/yuancon/`](../src/input/yuancon/) |
| Languages, fonts and theme | [`src/i18n/`](../src/i18n/), [`src/ui/`](../src/ui/), [`build-fonts.mjs`](../scripts/build-fonts.mjs) |
| Input settings, key and controller icons, recording guide, YuanCon dialog | `.vue` files in [`src/input/`](../src/input/) |
| Native commands and permissions | [`src-tauri/src/`](../src-tauri/src/), [`capabilities/`](../src-tauri/capabilities/), [`permissions/`](../src-tauri/permissions/) |

## Layers

A file imports only from its own layer or from a lower layer. `scripts/import-layers.test.mjs` holds the same table and fails on an import of a higher layer.
In a feature folder the `.vue` files are views and the `.ts` files are services.

| Layer | Contents | Location |
| ---: | --- | --- |
| 7 | App shell: assembly, menu bar, title bar, panel dock, status bar, help, About | `src/app/` |
| 6 | Views: the components of each feature | `src/timeline/`; `.vue` files in other folders |
| 5 | Input: devices, bindings, command wheel | `.ts` files in `src/input/` |
| 4 | Commands and menus | `src/commands/` |
| 3 | Feature services | `.ts` files in `src/playback/`, `src/workspace/`, `src/export/`, `src/detection/`, `src/bmhelper/`, `src/calibration/`, `src/interop/` |
| 2 | Editor state | `editor-store.ts` and `editor-actions.ts` in `src/slicing/` |
| 1 | Boundaries: project format, platform, audio Worker, languages, shared UI parts | `src/project/`, `src/platform/`, `src/audio/`, `src/i18n/`, `src/ui/` |
| 0 | Rules: pure computations and file formats | `src/core/` |

Every layer can import the generated message data in `src/i18n/generated.ts`.
A new source folder needs a row in the table of the test.

## Fact owners

Each fact below has one owner. Change the fact there; other code reads it.

| Fact | Owner |
| --- | --- |
| Slice file names and numbering | `sliceFileName` in [`src/core/slices.ts`](../src/core/slices.ts) |
| Ranges and limits of project fields (BPM, fade-out, noise gate, track count) | `FIELD_RANGES` and the `PROJECT_MAX_*` constants in [`src/project/schema.ts`](../src/project/schema.ts) |
| Tick and sample conversion | [`src/core/timebase.ts`](../src/core/timebase.ts) |
| A track's time base | `timeBaseOf` in [`editor-store.ts`](../src/slicing/editor-store.ts) |
| Slice processing of a track (a disabled noise gate renders as 0 dB) | `sliceProcessingOf` in [`editor-store.ts`](../src/slicing/editor-store.ts) |
| Track audibility (mute, solo, gain) | `trackAmps` in [`editor-store.ts`](../src/slicing/editor-store.ts) |
| Linked markers: link groups, how marker edits follow links, link copies | [`src/project/marker-links.ts`](../src/project/marker-links.ts); every marker edit goes through `setTicks` in [`editor-store.ts`](../src/slicing/editor-store.ts) |
| Where a track can hold a marker | `markerAllowed` in [`editor-store.ts`](../src/slicing/editor-store.ts) |
| Timeline length, also with a track that is still loading | `timelineLength` in [`editor-store.ts`](../src/slicing/editor-store.ts) |
| Tempo estimate of new audio | `estimateTempo` in [`src/core/tempo.ts`](../src/core/tempo.ts) |
| Export matrix: marker rows, default selection, job names | [`src/export/export-plan.ts`](../src/export/export-plan.ts) |
| Dropped files: page drops in the browser, granted native drops on the desktop | `watchDrops` in [`src/platform/`](../src/platform/); `openChosenFiles` in [`workspace.ts`](../src/workspace/workspace.ts) |
| Supported audio formats | [`src/core/audio-formats.ts`](../src/core/audio-formats.ts); `src-tauri/src/files.rs` repeats the extensions and a consistency test compares them |
| Commands, their labels and availability | `COMMANDS` in [`src/commands/commands.ts`](../src/commands/commands.ts) |
| Default key, controller and YuanCon bindings | `BINDINGS` in [`src/input/bindings.ts`](../src/input/bindings.ts) |
| The user's binding changes (local preference) and the one-control-one-command rule | [`src/input/binding-overrides.ts`](../src/input/binding-overrides.ts) |
| Fixed controller navigation | `UI_NAVIGATION` in [`src/input/gamepad.ts`](../src/input/gamepad.ts) |
| Status bar input hints: areas and their mouse and keyboard actions | `HINT_AREAS` in [`src/app/hint-areas.ts`](../src/app/hint-areas.ts); controller hints in [`GamepadHints.vue`](../src/input/GamepadHints.vue) |
| How a number box steps with the mouse wheel and the arrow keys | [`src/ui/NumberField.vue`](../src/ui/NumberField.vue); every number box uses it |
| When a mouse wheel gesture on a number box or a volume slider becomes one edit | `useWheelGesture` in [`src/ui/wheel-gesture.ts`](../src/ui/wheel-gesture.ts) |
| Level text in dB, with a plus sign above 0 dB | `formatDb` in [`src/core/volume.ts`](../src/core/volume.ts) |
| Which cursor moves keep the cursor centered | `moveCursorTo` in [`editor-store.ts`](../src/slicing/editor-store.ts) |
| Controller thresholds and repeat timing | top of [`src/input/gamepad.ts`](../src/input/gamepad.ts) |
| Command wheel travel and size; default slots | [`src/input/wheel.ts`](../src/input/wheel.ts), [`use-wheel.ts`](../src/input/use-wheel.ts) |
| The user's wheel layouts (local preference) | [`src/input/wheel-layout.ts`](../src/input/wheel-layout.ts) |
| Editor state saved with recovery data | `SAVED_STATE` in [`src/workspace/session.ts`](../src/workspace/session.ts) |
| Theme colors | [`src/app/styles.css`](../src/app/styles.css) for the interface, [`src/ui/palette.ts`](../src/ui/palette.ts) for canvases |

## State and commands

The editor store owns document state and undo history. Feature components read its reactive projections and commit document edits through transactions.
The workspace owns file operations, recovery, each track's audio engine and transient loading state. `TrackHeader.vue` displays the current audio load activity.
`App.vue` creates the other services beside the workspace: the editor actions, the exporter, detection and the legacy exchange. Each service provides itself to its views, for example `useExporter()` in `src/export/exporter.ts`.
The exporter, detection and the legacy exchange get the tracks' audio from `workspace.audio`; they drop a result when its generation changed meanwhile.
Playback and device sessions keep runtime resources outside the portable project document.
Revision checks reject stale asynchronous results and gestures after document replacement.

Discrete actions follow input → command → feature action. Menus, keyboard shortcuts, controllers, YuanCon and the command wheel run commands only through `createCommands().run`.
To add a command, add one entry to `COMMANDS` and, if it needs keys, one row to `BINDINGS`. Menus, tooltips, help and the controller hint row read both.
Bindings have two layers. The recording layer lies over the editing layer and hides only the controls that it binds or reserves.
Menu, dialog and wheel navigation on a controller is fixed in `UI_NAVIGATION` and is not part of the binding table.
`run` does nothing while a dialog is visible or `modalOpen` in `App.vue` is true. `App.vue` keeps one switch for each of its dialogs in `dialogs` and derives `modalOpen` from them.
To add a dialog, add a key to `dialogs` and a tag to the template. If a command opens it without a condition, add its id to `DialogId` in `commands.ts` and run `hosts.openDialog`.
The feature action owns validation and undo behavior. Continuous pointer gestures and form drafts remain local to their feature.

`WindowTitlebar.vue` delegates native controls through `src/platform/desktop-window.ts`.
Native window-state restoration excludes decorations so it preserves the frameless window configuration.
`App.vue` confirms exit and saves recovery data before native window closure.
`WorkspacePanels.vue` owns panel visibility and order. Its `panels` table has one row for each side panel; to add a panel, add a row.

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
`app_data.rs` owns the application data directory for recovery data and file grants. Only debug builds accept the `WOSLICER_DX_DEBUG_DATA_DIR` override.
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
