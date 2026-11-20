# Changelog

**English** · [中文](CHANGELOG.zh-CN.md)

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
