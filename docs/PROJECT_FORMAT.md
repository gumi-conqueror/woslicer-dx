# `.wosdx` project format

This document describes the version 2 fields, the version 1 upgrade, compatibility rules and local media bindings.
[codec.ts](../src/project/codec.ts) and [schema.ts](../src/project/schema.ts) define the implementation.

## Format and validation

- `.wos` is the locked, 6,168-byte settings exchange format implemented by `@gumi-conqueror/wos-file`. Do not add fields or change its encoding.
- Original `.bmh` compatibility is also locked. The [BMH format contract](BMH_FORMAT.md) applies at import and export. DX uses UTF-8 JSON internally.
- `.wosdx` is bounded UTF-8 JSON with `format: "wosdx"` and `schemaVersion: 2`.
- The schema version is independent of the application, session and Rust crate versions.
- Audio is not embedded. Projects store media metadata and origin hints. Projects may embed BMHelper data.

`decodeProject`, `parseProject` and `encodeProject` are the codec entry points.
Parsing checks the format and version first. A version 1 file is upgraded in
memory (see below). Future versions take a separate path and are never interpreted.

`schema.ts` defines field shapes, ranges and enums with Zod and derives document
types from them. It does not coerce strings, numbers or booleans. String limits
count UTF-16 code units. `codec.ts` validates duplicate track IDs, duplicate marker ticks and marker keys.
Add field rules to the schema and cross-field business rules to the codec.
The parser rejects invalid UTF-8, JSON, format identifiers or invalid data.

## Version 2 fields

A project has tracks. Each track is one complete source file with its own
markers and output settings. All tracks share the time base, the global
playback settings and the BMHelper data. The codec, the editor and recovery data
handle 1 to 256 tracks. The editor edits one current track at a time.

| Path | Meaning |
| --- | --- |
| `projectId`, `name` | Stable project ID and display name. Decoding or recovering media must not replace the ID. |
| `timing.bpm`, `timing.shiftTicks` | BPM and offset in ticks, not seconds or source frames. Shared by all tracks. |
| `global` | `masterGainDb`, `masterMuted`, `cueGainDb`, `cueMode`, `playbackRate`, `views`. |
| `global.views` | Boolean `rms` and `bands` defaults. Spectrum is `"reserved"`. |
| `tracks[]` | `trackId`, `name`, `gainDb`, `muted`, `solo`, `views`, `media`, `slicing`, `output`. 1–256 entries. |
| `track.views` | `rms` and `bands` accept `null` (inherit), `true` or `false`. Spectrum is `"reserved"`. |
| `track.media` | `null` before audio is chosen, or one `MediaAsset` (below). |
| `track.slicing.fadeoutMs` | Integer milliseconds. |
| `track.slicing.noisegateDb`, `track.slicing.noisegateEnabled` | Threshold in dB and a separate enable flag. |
| `track.slicing.markers` | Ticks at 192 ticks per measure, from 0 through 49,151. The codec sorts ticks and rejects duplicates. |
| `track.slicing.markerKeys` | Optional `{tick, keys}` entries for recorded markers. `keys` contains unique integers 1–7, including chords. Entries must reference existing marker ticks. |
| `track.slicing.bandDetection` | `bands {low,mid,high}`, `thresholdDb`, `minGapUnits`, `snap`. Detection settings are separate from waveform visibility. |
| `track.output` | `baseName`, `clipStartNumber`, `useFfNumbering`. |
| `bmhelper` | `null` or `{format: "bmhelper", source, divisions}` containing structured BMHelper work. |

### Version 1 upgrade

Version 1 kept `slicing` and `output` at the project level, listed `media[]`
separately and placed audio on tracks as `clips[]`. The app upgrades a
version 1 file in memory when it opens it, and saves version 2.
Only the two layouts that earlier releases could edit upgrade:

- one track without clips or media;
- one track with one clip at timeline position 0 and source offset 0 that covers its whole media file.

Other version 1 layouts (several tracks or clips, trimmed clips, leading
silence) are rejected, and the original file stays unchanged. Unknown version 1
fields are dropped without a report. Releases before 2.0 reject version 2 files
as a future version.

### Recorded marker keys

The optional `slicing.markerKeys` field extends a track's numeric
`slicing.markers` array. For example, `[{"tick":96,"keys":[1,3,5]}]` records a
three-key chord at tick 96. Missing entries mean that a marker has no recorded
key identity. The codec sorts entries and keys, rejects duplicate ticks or keys,
and omits an empty collection.

Key numbers are logical marker attributes, independent of the input device.
[`src/input/bindings.ts`](../src/input/bindings.ts) defines the keyboard,
Xbox and YuanCon mappings and supplies the in-app guide. Device protocol evidence
and limitations are documented with the [input fixture](../tests/fixtures/input/README.md).

Only new presses create markers; held keys do not become new notes when another
key is pressed. Presses at the same resolved tick merge their key sets. Moves,
quantization, internal clipboard operations, undo and recovery retain the sets.
Replacing markers from WOS, BMSE, MIDI or edge detection clears old key attributes.

Projects without the field remain valid.
Legacy `.wos` and original `.bmh` formats remain unchanged and do not store these
attributes. WOS export retains the marker positions.

### BMHelper data

`src/project/bmhelper.ts` validates the DX representation and reconstructs derived note references.
`source` contains `quantize`, `notes`, `pitches` and `controls`.
Each division contains `name`, `quantize`, `recording`, `definitions`, `src2def` and `zzDefinition`.
Event fields retain the signed 32-bit ranges used by BMH. Quantize must be positive.
Definition indices must refer to recording notes. The source mapping must cover every source note and reference valid definitions.

Names remain Unicode in memory and UTF-8 in the project file. Unpaired surrogates are rejected.
DX does not impose a CP932 restriction or a separate name-length limit. The total project byte limit still applies.
DX also preserves ZZ/FF numbering mode. Original `.bmh` files omit that mode and reopen in ZZ mode.
The project stores neither original MIDI bytes nor Base64 BMH data. It does not duplicate derived note references.
Legacy BMH conversion occurs only at file import and export.
BMH export applies the original program's CP932 substitutions and continues with a warning showing the original and converted names.
The editor retains the Unicode project and its unsaved state. Lossy BMH output does not mark Unicode content as saved.
Users can rename the division before another export, or save `.wosdx` to preserve the name.

### Media metadata

| `MediaAsset` field | Meaning |
| --- | --- |
| `mediaId`, `name`, `format` | Stable identity, original filename, and `wav`, `ogg`, `oga`, `flac`, `mp3`, `aac`, `m4a`, `mp4`, `aif`, `aiff`, `mka` or `mkv` (filename extension). |
| `byteLength` | Original file size or `null`, not decoded PCM buffer size. |
| `sampleRateHz`, `channels`, `framesPerChannel` | Known values or `null`. Frames are per channel. Duration is frames divided by sample rate. |
| `integrity` | `null` or `{algorithm: "sha256", digest: <64 hex chars>}`. The parser converts digests to lowercase. |
| `originHint` | `null`, `{kind: "desktop", pathHint}` or `{kind: "browser", name, relativePathHint?, lastModified?}`. |


## Timing, playback and views

Every track starts at the beginning of its source file. Markers are ticks on
the shared time base; each track maps them to frames with its own sample rate,
so tracks may use different sample rates.

Gains use dB, with 0 dB as unity. Mute is independent of gain and takes precedence
over solo. If any track is soloed, only unmuted solo tracks are audible.
`masterMuted` controls the media bus. Cue audio uses a separate route.
Playback and export currently use the current track only. The editor does not yet sum tracks or apply headroom or loudness policies.

Track `rms` and `bands` values override global defaults unless they are `null`.
Spectrum is reserved: there is no enabled control or analysis task.
See [Opening and saving](#opening-and-saving) for supported editing layouts.

## Limits and defaults

Numbers must be finite. Integer fields must be safe integers. The codec and
schema contain the complete validation rules.

| Resource or field | Limit |
| --- | --- |
| Entire encoded UTF-8 JSON | 64 MiB, including BMHelper data and metadata. |
| Desktop recovery JSON | 65 MiB, including the project and session fields. |
| Tracks | 256, each with at most one media file. |
| Markers | At most 49,152 markers. Ticks range from 0 through 49,151. |
| Source frames | 0 through 2,000,000,000 per channel. |
| Track / master / cue gain | −96 through +12 dB. |
| BPM / `shiftTicks` | 0 < BPM ≤ 10,000. Shift from −1e9 through 1e9. |
| Fadeout / noise gate | Fadeout: 0 through 60,000 integer milliseconds. Noise gate: −200 through 0 dB. |
| Sample rate / channels | Known sample rates: 1 through 768,000 Hz. Known channel counts: 1 through 64. |
| Media `byteLength` metadata | `null` or 0 through 16 GiB. This does not guarantee the host can load that size. |
| Actual audio input | Platform limit of 2 GiB. Decoding also depends on memory and format limits. |
| `playbackRate` | 0.25 through 1.5. |

The JSON byte limits are application memory budgets. They do not change the original `.wos` or `.bmh` binary contracts.
Recovery reserves an additional 1 MiB for local bindings and UI settings. JSON remains uncompressed.
The byte limit applies after UTF-8 serialization, not to the original MIDI or BMH file size.
Browser recovery also depends on the browser's local-storage quota. Failed recovery writes remain visible to users.

`createEmptyProject` creates one track without media.

Empty projects default to master −10 dB, cue −6 dB, playback rate 1, cue off,
and RMS/bands off. Tracks default to 0 dB, unmuted, not soloed, and inherited
views. These are constructor defaults, not user-configurable defaults.

## Opening and saving

| Input | Behavior |
| --- | --- |
| Version 2 | Editable and saveable with any number of tracks. Missing media can be relinked per track. The desktop app reopens each track's audio. |
| Version 1 | Upgraded as described above, or rejected. |
| Future version or invalid file | Rejected; the current workspace and source file stay. |

### Normalization and unknown fields

The parser constructs new objects containing known fields. It sorts markers,
rejects duplicate ticks, lowercases digests and converts track spectrum `null`
to `"reserved"`. For version 2 files, `parseProject` collects up to 16 unknown
field paths in `unknownFields`, and the app shows `projectUnknownFields` to warn
that saving keeps only recognized data. Normalized JSON does not preserve
whitespace or field order. The locked `.wos` byte format is a separate
compatibility requirement. The workspace rejects future versions and does not
write them to disk.

## Local bindings, recovery and relinking

Portable projects must not contain Tauri UUIDs, picker tokens, Blob URLs,
`FileSystemHandle` objects, PCM buffers or machine-specific window state.
The recovery session stores the active media's host reference separately as `lastFile`.
Recovery data has its own version (3), separate from the project format. It stores the project, `dirty`, `lastFile`
and editor state grouped by owner: `state.view`, `state.detection` and `state.calibration`.
`src/workspace/session.ts` lists the saved fields. The app keeps a record of any other version unchanged,
reports it, and asks before it replaces the record. Version 3 does not read the records of releases before 2.0;
the status bar names them as records from an earlier version.
Decode failures must not delete bindings. Desktop paths must not become browser references.

Desktop media stores its absolute native path in `originHint.pathHint`.
Opening a selected `.wosdx` file resolves its active media through `open_project_media`.
This command accepts the selected project's host reference and a media ID, not a path.
The host reads the bounded project file and grants access only to that entry's absolute supported audio path.
The workspace verifies the media metadata and hash before adoption.
Recovery reuses the persisted host grant. Browser file inputs and drops cannot provide absolute paths and require manual relinking.
Projects without paths require one manual relink before saving the path.

Relinking stages and decodes the candidate, then compares size, format,
sample rate, channels, frames and hash. Matching names do not prove matching
content. Unknown metadata stays unknown. Users can confirm replacement when
media differs. Replacement updates the track's media metadata as one
undoable transaction. A matching file at a new native path updates the path as an undoable edit.
Cancellation or failure leaves the document, bindings
and history unchanged.

`.wos` import maps only the fields it can represent. Importing settings into
loaded audio preserves the actual media. Starting a project from WOS creates
an empty project. `.wos` export is a partial projection and does not mark the
whole project as saved. It rejects unrepresentable values such as fractional
noise-gate thresholds. It writes the current track only.

## Validation coverage

Behavior tests live in:

- `tests/algorithm/project-document.test.ts`: codec and project data.
- `tests/algorithm/project-history.test.ts`: document editing.
- `tests/business/project-files.test.ts`: project file operations.
- `tests/e2e/project-workflow.spec.ts`: browser workflows.

Cover preservation across capability/version boundaries, host isolation,
recovery identity and media mismatch confirmation through observable behavior.
Keep `.wos` and original `.bmh` format regressions covered separately.
