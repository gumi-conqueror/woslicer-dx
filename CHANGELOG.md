# Changelog

**English** · [中文](CHANGELOG.zh-CN.md)

## Unreleased

## 2.0.0-alpha.6 — 2026-11-27

### Added

- Playback plays all tracks together. Each track header has **M** (mute) and **S** (solo) buttons; mute wins over solo. Slice preview and recording still use the current track.
- **Project → Export slices of all tracks** writes the slices of every track into one archive or folder. Each track uses its own output name and numbering; the export stops if two tracks would write the same file name.

## 2.0.0-alpha.5 — 2026-11-27

### Added

- Several audio tracks per project. **Project → Add audio track** adds a track with its own audio, markers, detection and output settings. Click a track to edit it, or press Ctrl/Cmd+↑ and Ctrl/Cmd+↓. Double-click a track name to rename it. **Project → Remove current track** removes it; undo restores it with its audio.
- Projects and recovery data keep every track. The desktop app reopens the audio of each track.

### Changed

- In a project with several tracks, opening audio replaces only the current track's audio, and undo reverts it.
- Playback, slice preview, recording and export use the current track. Playing all tracks together and exporting all tracks follow in a later alpha.

## 2.0.0-alpha.4 — 2026-11-27

### Changed

- The command wheel is larger: two thirds of the smaller window side.
- LT and RT respond to a light touch, so controllers with trigger stops work.

### Fixed

- Returning the right stick to its center no longer leaves a wheel command selected.

## 2.0.0-alpha.3 — 2026-11-27

### Changed

- The light and dark themes use new colors: neutral gray surfaces with an orange accent. The waveform is cyan.
- Band detection settings are saved in the project with each track, and changing them can be undone. Earlier versions kept them only in recovery data.

## 2.0.0-alpha.2 — 2026-11-26

### Added

- Command wheel: hold LT on a controller or R on the keyboard, point at a command and release to run it. Tap to keep the wheel open. Two wheels hold eight commands each, including undo, redo, clipboard, saving and export.
- While you use a controller, a row above the status bar shows what the main buttons do.

### Changed

- Controller buttons follow common game conventions. A adds a marker, X toggles the marker at the cursor, Y previews, B clears the selection and RT plays. LB and RB move by measures, D-pad up and down change the grid, and the right stick zooms and moves by ticks. Recording keys are unchanged.
- In recording mode, controller buttons that are not recording controls keep their editing functions, such as the command wheel and zoom.

## 2.0.0-alpha.1 — 2026-11-26

This is a prerelease for testing. It includes the unreleased 1.2.0 changes.

### Before upgrading

- Save open work in your current version first. Recovery data from versions before 2.0 is not restored.
- Versions before 2.0 cannot open projects saved by this version. Keep copies of projects you still edit there.
- The desktop app replaces an installed 1.x version and uses the same data folder.

### Added

- Record markers with keyboard, Xbox or YuanCon controls, with seeking and playback-speed controls.
- Save marker key numbers 1–7 and chords in `.wosdx` projects.
- Import FLAC, MP3, AAC-LC, ALAC and AIFF, including supported audio in MKV/MKA files.
- Keep higher-precision source samples during editing. WAV export remains 16-bit PCM.

### Changed

- Projects are saved in a new file version that keeps markers and output settings with each track. Projects from earlier versions open as before and are upgraded when saved.
- Projects with several tracks or clips, or with trimmed audio, no longer open. Earlier versions opened them read-only.
- Recovery data from earlier versions is not restored. The status bar says where it came from. The app keeps the data and asks before it replaces it. The **Import legacy recovery data** menu item is removed.
- Exported slice names drop trailing dots and spaces from the base name.
- Moving selected markers with a shortcut past the end of the audio stops them at the end, as dragging does. Earlier, the shortcut did nothing.

### Fixed

- Markers that would start before the audio can no longer be placed. With a negative offset, such markers made the export fail.
- The website serves its icon at `/favicon.ico` and provides SVG and touch icons.

## 1.1.1 — 2026-11-21

### Fixed

- Menus and controller input remain available while audio loads. Parameter and marker edits made during loading are preserved.
- Playback controls remain available for the current audio while replacement audio loads.
- Switching interface languages uses the correct fonts and keeps the menu bar height consistent.

### Changed

- Shorter, consistent interface labels and help text in English, Chinese, Japanese and Korean.

## 1.1.0 — 2026-11-21

### Added

- A frameless desktop layout with a waveform overview and side panels. When space runs out, the oldest open panel closes.
- Alt menu navigation and Xbox controls for frequent editing actions. Menu hints follow the active input device.
- Help includes an operation guide, troubleshooting and desktop/web data cleanup instructions.
- Exiting with unsaved changes asks for confirmation.

### Changed

- Calibration moves to Tools; About and the guide move to Help.

### Fixed

- Cut lists fit the panel height, and opening BMHelper keeps the module bar width stable.
- Playback and cue volumes update while dragging their sliders.

## 1.0.2 — 2026-11-19

No user-facing functional changes.

## 1.0.1 — 2026-11-13

### Added

- About includes links to the project and credited tools.

### Fixed

- Waveforms stay sharp and connected when zoomed. The timeline fits resized windows.
- Short Ogg files load completely.
- The web app starts correctly and shows build information offline.

## 1.0.0 — 2026-11-13

### Added

- Save cuts, settings and BMHelper work in `.wosdx` projects; relink moved audio.
- Preserve Unicode division names and ZZ/FF numbering in DX projects.
- View multi-track projects and save them unchanged.
- Import `.wos` settings and older saved sessions.
- Show loading and session recovery progress.

### Fixed

- Read and write the original BMHelper beta 4′ format, including Japanese names. BMH export warns when it must substitute name characters.
- Desktop projects reconnect saved audio paths and remember relinked files.
- Save large BMHelper projects and keep their contents in sync with undo, redo and reopening.
- Show the original format of 32-bit WAV files; processing and output remain 16-bit.
- Preserve damaged recovery files until discarded, and report failed recovery saves.

## 0.3.0 — 2026-11-08

### Added

- Light, dark and system themes. Interface language can also follow the system.
- Restore the previous session on launch, including audio, cuts and settings.
- Close the current audio and clear unsaved work after confirmation.
- Inspect individual samples when zooming in, and toggle the RMS waveform overlay.

### Fixed

- Dense waveforms stay readable when zooming and on high-resolution screens.

## 0.2.1 — 2026-11-07

### Added

- Adjust playback and slice-preview volume, with levels shown in dB.

### Fixed

- Cuts at the audio's end export correctly. Slice tails no longer produce a reversed echo there.

## 0.2.0 — 2026-11-07

### Added

- Built-in BMHelper turns key-sound MIDI into recording sequences and cuts, with MIDI and BMS export.

## 0.1.3 — 2026-11-06

### Added

- Use the [browser version](https://woslicer-dx.pages.dev/) without installing the app.

### Fixed

- Japanese interface terms match the original woslicerIII.

## 0.1.2 — 2026-11-05

### Added

- Renamed the app to **woslicer-dx**.
- English, Chinese, Japanese and Korean interface options.

### Fixed

- The left arrow moves the cursor left. Scrolling and zooming keep the cursor visible.
- Replaying a slice starts it again without overlapping the previous playback.
- Cuts placed before loading audio appear on the timeline.
- Q/W grid changes update the grid selector.
- Deleted cuts no longer interfere with copying, cutting or quantizing the selection.

## 0.1.1 — 2026-11-04

### Added

- About shows version and build details for reporting problems.
- Portable packages play OGG files without an extra installation.

## 0.1.0 — 2026-11-02

### Added

- Import WAV/OGG, edit cuts on the timeline and export WAV slices.
- Import/export `.wos` settings and copy cuts to BMSE.
- Tap calibration, frequency-band display and automatic cut detection.

### Fixed

- Grid lines, snapping and keyboard movement agree.
