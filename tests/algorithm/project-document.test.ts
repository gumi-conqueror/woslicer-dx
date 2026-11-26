import { describe, expect, it } from 'vitest';
import { WOS_FILE_SIZE, writeWos } from '@gumi-conqueror/wos-file';
import {
  decodeProject,
  encodeProject,
  parseProject,
  ProjectFormatError,
  projectToWos,
} from '../../src/project/codec';
import { PROJECT_FILE_MAX_BYTES } from '../../src/project/schema';
import { mediaOf, singleTrackProject as project, trackOf, withTrack } from '../support/project';
import { bmhelperToDocument } from '../../src/project/bmhelper';
import { readBmh } from '@gumi-conqueror/bmh-file';
import { readFileSync } from 'node:fs';
import { AUDIO_EXTENSIONS } from '../../src/core/audio-formats';

describe('.wosdx project document', () => {
  it.each(AUDIO_EXTENSIONS)('round-trips %s media without changing legacy WOS output', (format) => {
    const value = project();
    const legacy = writeWos(projectToWos(value));
    mediaOf(value).format = format;
    mediaOf(value).name = `audio.${format}`;
    const decoded = decodeProject(encodeProject(value));
    if (decoded.kind !== 'supported') throw new Error('Expected supported project');
    expect(mediaOf(decoded.project).format).toBe(format);
    expect(writeWos(projectToWos(decoded.project))).toEqual(legacy);
  });
  it('round-trips optional marker chords and keeps legacy WOS bytes unchanged', () => {
    const value = project();
    value.tracks[0].slicing.markers = [96, 24];
    const legacy = writeWos(projectToWos(value));
    value.tracks[0].slicing.markerKeys = [{ tick: 96, keys: [7, 1, 3] }];
    const decoded = decodeProject(encodeProject(value));
    if (decoded.kind !== 'supported') throw new Error('Expected supported project');
    expect(decoded.unknownFields).toEqual([]);
    expect(decoded.project.tracks[0].slicing.markers).toEqual([24, 96]);
    expect(decoded.project.tracks[0].slicing.markerKeys).toEqual([{ tick: 96, keys: [1, 3, 7] }]);
    expect(writeWos(projectToWos(decoded.project))).toEqual(legacy);
    expect(decodeProject(encodeProject(project())).kind).toBe('supported');
    expect(parseProject(project())).toMatchObject({
      project: { tracks: [{ slicing: { markers: [] } }] },
    });
  });
  it.each([
    [{ tick: 24, keys: [0] }],
    [{ tick: 24, keys: [8] }],
    [{ tick: 24, keys: ['1'] }],
    [{ tick: 24, keys: [] }],
    [{ tick: 24, keys: [1, 1] }],
    [{ tick: 25, keys: [1] }],
    [
      { tick: 24, keys: [1] },
      { tick: 24, keys: [2] },
    ],
  ])('rejects invalid or detached marker keys: %j', (...markerKeys) => {
    const value = project();
    expect(() =>
      parseProject(
        withTrack(value, { slicing: { ...trackOf(value).slicing, markers: [24], markerKeys } }),
      ),
    ).toThrow(ProjectFormatError);
  });
  it.each([
    null,
    [],
    {},
    { format: 'other', schemaVersion: 99 },
    { format: 'wosdx', schemaVersion: '99' },
    { format: 'wosdx', schemaVersion: 1.5 },
    { format: 'wosdx', schemaVersion: 0 },
    { format: 'wosdx', schemaVersion: 1_000_001 },
  ])('rejects an invalid version envelope: %j', (input) => {
    expect(() => parseProject(input)).toThrow(ProjectFormatError);
  });

  it.each(['120', null, undefined, NaN, Infinity, -1, 0, 10001])(
    'rejects invalid BPM without coercion: %s',
    (bpm) => {
      const value = project();
      expect(() => parseProject({ ...value, timing: { ...value.timing, bpm } })).toThrow(
        /timing.bpm/,
      );
    },
  );

  it('retains UTF-16 string bounds and accepts an empty output basename', () => {
    const value = project();
    expect(
      parseProject({
        ...(withTrack(value, { output: { ...trackOf(value).output, baseName: '' } }) as object),
        name: '😀'.repeat(256),
      }).kind,
    ).toBe('supported');
    expect(() => parseProject({ ...value, name: '😀'.repeat(257) })).toThrow(/name/);
  });

  it('distinguishes nullable metadata from absent required fields', () => {
    const value = project();
    const media = mediaOf(value);
    expect(parseProject(withTrack(value, { media: { ...media, channels: null } })).kind).toBe(
      'supported',
    );
    expect(() =>
      parseProject(withTrack(value, { media: { ...media, channels: undefined } })),
    ).toThrow();
    expect(() => parseProject(withTrack(value, { media: { ...media, channels: 1.5 } }))).toThrow();
    expect(() =>
      parseProject({ ...value, global: { ...value.global, masterMuted: 'false' } }),
    ).toThrow();
  });

  it('preserves origin variant normalization and reports only unknown keys', () => {
    const value = project();
    const parsed = parseProject(
      withTrack(value, {
        media: {
          ...mediaOf(value),
          originHint: { kind: 'desktop', pathHint: 'audio.wav', name: 7, extension: true },
        },
      }),
    );
    if (parsed.kind !== 'supported') throw new Error('Expected supported project');
    expect(mediaOf(parsed.project).originHint).toEqual({ kind: 'desktop', pathHint: 'audio.wav' });
    expect(parsed.unknownFields).toEqual(['tracks[0].media.originHint.extension']);
  });

  it('bounds unknown-field diagnostics and strips extensions from normalized output', () => {
    const value = project();
    const extensions = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => ['extra' + index, index]),
    );
    const parsed = parseProject({ ...value, ...extensions });
    if (parsed.kind !== 'supported') throw new Error('Expected supported project');
    expect(parsed.unknownFields).toHaveLength(16);
    expect(parsed.project).toEqual(value);
  });

  it('omits undefined browser hints without mutating an in-memory draft', () => {
    const value = project();
    const media = mediaOf(value);
    const hint = {
      kind: 'browser' as const,
      name: 'audio.wav',
      relativePathHint: undefined,
      lastModified: undefined,
    };
    const parsed = parseProject(withTrack(value, { media: { ...media, originHint: hint } }));
    if (parsed.kind !== 'supported') throw new Error('Expected supported project');
    expect(mediaOf(parsed.project).originHint).toEqual({ kind: 'browser', name: 'audio.wav' });
    expect(hint).toHaveProperty('relativePathHint');
    expect(hint).toHaveProperty('lastModified');
  });

  it('rejects duplicate markers and invalid embedded BMHelper data', () => {
    const value = project();
    expect(() =>
      parseProject(withTrack(value, { slicing: { ...trackOf(value).slicing, markers: [24, 24] } })),
    ).toThrow(/duplicate ticks/);
    expect(() =>
      parseProject({ ...value, bmhelper: { format: 'bmh', bytesBase64: 'not base64' } }),
    ).toThrow(/bmhelper/);
    expect(
      parseProject({
        ...value,
        bmhelper: {
          format: 'bmhelper',
          source: { quantize: 480, notes: [], pitches: [], controls: [] },
          divisions: [],
        },
      }).kind,
    ).toBe('supported');
  });

  it('reports unrecognized fields by path instead of dropping them silently', () => {
    const value = project();
    const parsed = parseProject({
      ...(withTrack(value, { output: { ...trackOf(value).output, gain: 2 } }) as object),
      mystery: 1,
      timing: { ...value.timing, swing: 0.5 },
    });
    expect(parsed.kind).toBe('supported');
    if (parsed.kind === 'supported') {
      expect(parsed.unknownFields).toEqual(['mystery', 'timing.swing', 'tracks[0].output.gain']);
      const clean = parseProject(value);
      expect(clean.kind === 'supported' && clean.unknownFields).toEqual([]);
    }
  });

  it('treats desktop and browser references as distinct non-interchangeable variants', () => {
    const value = project();
    const media = mediaOf(value);
    media.originHint = {
      kind: 'browser',
      name: 'audio.wav',
      relativePathHint: 'folder/audio.wav',
      lastModified: 1234,
    };
    const parsed = parseProject(JSON.parse(new TextDecoder().decode(encodeProject(value))));
    expect(parsed.kind).toBe('supported');
    if (parsed.kind !== 'supported') throw new Error('Expected supported project');
    expect(mediaOf(parsed.project).originHint).toEqual(media.originHint);
    expect(() =>
      parseProject(
        withTrack(value, {
          media: { ...media, originHint: { kind: 'browser', pathHint: 'C:\\Audio\\audio.wav' } },
        }),
      ),
    ).toThrow();
  });

  it('distinguishes future schemas from invalid data and enforces a bounded input size', () => {
    const value = project();
    const future = parseProject({ ...value, schemaVersion: 99 });
    expect(future).toMatchObject({
      kind: 'unsupported-version',
      version: 99,
      raw: { schemaVersion: 99 },
    });
    expect(() => decodeProject(new Uint8Array(PROJECT_FILE_MAX_BYTES + 1))).toThrow(
      /64 MiB limit/i,
    );
    expect(() => decodeProject(new TextEncoder().encode('{bad json'))).toThrow(/json/i);
  });

  it('round-trips structured BMHelper data above the old 16 MiB cap', () => {
    const value = project();
    const notes = Array.from({ length: 350_000 }, (_, index) => ({
      position: index * 120,
      gate: 60,
      nn: 60,
      vel: 100,
    }));
    value.bmhelper = {
      format: 'bmhelper',
      source: { quantize: 480, notes, pitches: [], controls: [] },
      divisions: [],
    };
    const bytes = encodeProject(value);
    expect(bytes.byteLength).toBeGreaterThan(16 * 1024 * 1024);
    const result = decodeProject(bytes);
    if (result.kind !== 'supported') throw new Error('Expected a supported project');
    expect(result.project.bmhelper?.source.notes.length).toBe(notes.length);
    expect(result.project.bmhelper?.source.notes[349_999]).toEqual(notes[349_999]);
  });
  it('validates BMHelper references and Unicode at the project boundary', () => {
    const bmhelper = bmhelperToDocument(
      readBmh(new Uint8Array(readFileSync('tests/fixtures/bmh/original.bmh'))),
    );
    const value = { ...project(), bmhelper };
    bmhelper.divisions[0].name = '简体中文・한국어・🎵';
    expect(parseProject(value).kind).toBe('supported');
    bmhelper.divisions[0].src2def[0] = 999;
    expect(() => parseProject(value)).toThrow(/source-to-definition/);
    bmhelper.divisions[0].src2def[0] = 0;
    bmhelper.divisions[0].definitions[0].div = 999;
    expect(() => parseProject(value)).toThrow(/missing recording note/);
    bmhelper.divisions[0].definitions[0].div = 0;
    bmhelper.divisions[0].name = '\ud800';
    expect(() => parseProject(value)).toThrow(/Unicode/);
  });

  it('rejects a track with an invalid gain', () => {
    const value = project();
    expect(() => parseProject(withTrack(value, { gainDb: Number.NaN }))).toThrow();
  });

  it('opens only projects with one track in this version', () => {
    const value = project();
    const second = { ...trackOf(value), trackId: 'track-2' };
    expect(() => parseProject({ ...value, tracks: [trackOf(value), second] })).toThrow(/2 tracks/);
  });

  it('keeps spectrum explicitly reserved and keeps global view defaults separate from detection settings', () => {
    const value = project();
    expect(value.global.views).toEqual({ rms: false, bands: false, spectrum: 'reserved' });
    expect(value.tracks[0]?.views).toEqual({ rms: null, bands: null, spectrum: 'reserved' });
    expect(value.tracks[0].slicing).toHaveProperty('bandDetection');
  });

  it('does not alter the locked legacy WOS byte layout', () => {
    const value = project();
    expect(
      writeWos({
        bpm: value.timing.bpm,
        shift: value.timing.shiftTicks,
        fadeoutMs: value.tracks[0].slicing.fadeoutMs,
        noisegateDb: value.tracks[0].slicing.noisegateDb,
        markers: Uint8Array.from({ length: 49152 }, (_, i) =>
          Number(value.tracks[0].slicing.markers.includes(i)),
        ),
      }),
    ).toHaveLength(WOS_FILE_SIZE);
  });

  describe('version 1 files', () => {
    // Version 1 kept markers and output at the project level and described audio as clips.
    function v1(clips: unknown[], media: unknown[]) {
      const current = project();
      const { media: _media, slicing, output, ...track } = trackOf(current);
      return {
        ...current,
        schemaVersion: 1,
        slicing: { ...slicing, markers: [24, 96] },
        output,
        media,
        tracks: [{ ...track, clips }],
      };
    }
    const asset = mediaOf(project());
    const whole = {
      clipId: 'c',
      mediaId: 'media-1',
      timelineStartSeconds: 0,
      sourceOffsetFrames: 0,
      frameCount: 48000,
    };

    it('upgrades a project without audio', () => {
      const parsed = parseProject(v1([], []));
      if (parsed.kind !== 'supported') throw new Error('Expected supported project');
      expect(parsed.project.schemaVersion).toBe(2);
      expect(trackOf(parsed.project).media).toBeNull();
      expect(trackOf(parsed.project).slicing.markers).toEqual([24, 96]);
    });

    it('upgrades one clip that covers its whole file and moves markers to the track', () => {
      const parsed = parseProject(v1([whole], [asset]));
      if (parsed.kind !== 'supported') throw new Error('Expected supported project');
      expect(mediaOf(parsed.project)).toEqual(asset);
      expect(trackOf(parsed.project).slicing.markers).toEqual([24, 96]);
      expect(trackOf(parsed.project).output.baseName).toBe('Song');
      expect(parsed.unknownFields).toEqual([]);
    });

    it.each([
      ['a trimmed clip', [{ ...whole, frameCount: 1200 }], [asset]],
      ['an offset clip', [{ ...whole, timelineStartSeconds: 2 }], [asset]],
      ['two clips', [whole, { ...whole, clipId: 'd' }], [asset]],
      ['media without a clip', [], [asset]],
    ])('rejects %s', (_label, clips, media) => {
      expect(() => parseProject(v1(clips, media))).toThrow(ProjectFormatError);
    });

    it('rejects several tracks', () => {
      const value = v1([], []);
      expect(() => parseProject({ ...value, tracks: [value.tracks[0], value.tracks[0]] })).toThrow(
        /several tracks/,
      );
    });
  });
});
