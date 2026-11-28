# Changelog

**English** · [中文](CHANGELOG.zh-CN.md)

## Unreleased

### Fixed

- When saving a project, detection, a clipboard copy or a BMHelper action fails, the status bar names that action. It no longer reports a failed load.

## 2.0.0-alpha.9 — 2026-11-28

### Added

- Right-click a track to open the track menu: add, rename, remove, move, mute, solo, open or relink audio, and export.
- A **Track** menu in the menu bar collects the track commands. Add audio track, Remove current track, Relink audio and Export slices of all tracks moved there from the Project menu.
- F2 renames the current track; Shift+M and Shift+S mute and solo it.
- Selecting another track during playback keeps playing from the same time.
- Linked markers. **Edit → Link markers to all tracks** (L) copies the selected markers, or all markers, to every other track. The Markers panel can also link them to one track. A linked marker moves and disappears together with its copies on the other tracks and has its own color on the waveform. **Unlink markers** (Shift+L) and **Relink markers at the same position** change the links.
- **Share markers across tracks** (default on; toolbar checkbox **Shared markers**). While it is on, new markers go to every track, a new track starts with linked copies of the current track's markers, and marker edits follow links. While it is off, marker edits change the current track only.
- The Markers panel lists the markers of all tracks in time order, one row per position, with one cell per track that shows a marker and its link. Click a cell to select it; a double click adds its linked cells and a triple click the whole row. A middle click links the selection while any of it is unlinked, and unlinks it when all of it is linked. A right click goes to that marker on its track; a double right click adds or removes that track's marker there. With more than eight tracks, the cells continue on a second line.
- The status bar shows the common controller buttons while you use a controller, and the mouse and keyboard actions of the area under the pointer otherwise, with mouse and key icons. In a narrow window these hints are cut off first. The user guide and the key settings also show keys as key caps, and the guide lists the mouse actions of each area with icons.
- Drop several audio files on the window, or choose several in **Track → Add audio track**, to add a track for each file. The first file fills the current track when it has no audio. This also works in the desktop app, which can reopen dropped files later.
- The tempo of the first audio in a project without audio or markers is detected and set as the BPM.
- With several tracks, **Export all slices** opens an export window. Each column is a track's audio and each row a set of markers; tracks with equal markers share a row, and one more row holds the markers linked on all tracks. Check which audio is cut at which markers. Each track uses its own markers by default, and a button per row switches between default, all and none.
- The timeline has no 256-measure limit: it is as long as the longest audio or the last marker. **View → Show the whole timeline** (0) fits it in the window, and zooming out stops there. Exporting `.wos` keeps the first 256 measures and reports how many later markers were not written.

### Changed

- Controller: push the left stick left or right lightly to move by ticks, fully to move by grid steps, and hold a full push to speed up. After 1.5 s of a full push, the cursor moves by measures. Left stick up and down zoom. The right stick selects tracks (up, down) and moves the playhead (left, right); after 1.5 s of a full push, it seeks faster.
- When keys or the controller move the cursor, the view glides to keep the cursor in the middle.
- Track gain is a slider. Every volume slider moves by 1 dB per mouse-wheel notch.
- Shortcuts show Ctrl outside macOS and Cmd on macOS. Outside macOS the Windows key no longer acts as Ctrl.
- Mouse, controller and YuanCon icons have filled bodies, in the light and the dark theme.
- In a command wheel kept open by a tap, the D-pad and arrow keys move one slot at a time and pass through the corners.
- Choosing an audio file no longer shows the loading animation. A new track appears as a loading row while its audio decodes. When the file states its length, the loading box ends where the audio ends and fills as decoding progresses, and its animation keeps moving until the track is ready.

### Fixed

- The window no longer stalls while a long audio file finishes loading.
- A held stick or key no longer moves the cursor past the end of the timeline.

Projects saved by this version cannot be opened by 2.0.0-alpha.8 or earlier. Older projects open without changes, with shared markers on.

## 2.0.0-alpha.8 — 2026-11-27

### Added

- Ctrl/Cmd+Shift+↑ and Ctrl/Cmd+Shift+↓ move the current track up or down the track list.
- Each track header has a gain field in dB for playback.

## 2.0.0-alpha.7 — 2026-11-27

### Added

- **Tools → Input settings** changes keyboard and controller bindings for editing and recording, and the commands of the wheel (up to four wheels). Settings stay on this device. A new binding takes the key away from its previous command.

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
