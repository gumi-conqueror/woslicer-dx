import { describe, expect, it, vi } from 'vitest';
import { audioFile, createTestApp as setup, processorEngine } from '../support/app';
import { createEmptyProject, decodeProject, encodeProject } from '../../src/project/codec';
import type { DecodedAudio } from '../../src/audio/audio-jobs';
import { captureEditorSession } from '../../src/workspace/session';
import { ampToDb } from '../../src/core/volume';
import { projectToWos } from '../../src/project/codec';
import { writeWos } from '@gumi-conqueror/wos-file';

describe('portable project workflow', () => {
  it('saves absolute media paths and opens project media through the project grant', async () => {
    const f = setup();
    const file = { ...audioFile(), absolutePath: 'C:\\Audio\\tone.wav' };
    await f.workspace.loadAudio(file);
    await f.workspace.saveProject();
    const saved = f.saved[0];
    if (!saved) throw new Error('Missing saved project');
    const restored = setup();
    restored.opened = { ...saved, reference: 'project-grant' };
    const resolve = vi.spyOn(restored.platform, 'openProjectMedia').mockResolvedValue(file);
    await restored.workspace.openProject();
    expect(resolve).toHaveBeenCalledWith(
      'project-grant',
      f.editor.document.tracks[0].media.mediaId,
    );
    expect(restored.editor.document.tracks[0].media.originHint).toEqual({
      kind: 'desktop',
      pathHint: file.absolutePath,
    });
    expect(restored.editor.source?.length).toBe(48000);
    expect(restored.editor.isDirty).toBe(false);
    expect(restored.editor.canUndo).toBe(false);
    await restored.workspace.flushSession();
    const recovered = setup();
    recovered.session = restored.session;
    recovered.opened = file;
    await recovered.workspace.restoreSession();
    expect(recovered.editor.source?.length).toBe(48000);
  });
  it('updates a moved media path on relink and saves it for the next open', async () => {
    const f = setup();
    await f.workspace.loadAudio({ ...audioFile(), absolutePath: 'C:\\Old\\tone.wav' });
    await f.workspace.saveProject();
    f.opened = { ...audioFile(), absolutePath: 'D:\\New\\tone.wav' };
    await f.workspace.relinkAudio();
    expect(f.editor.document.tracks[0].media.originHint).toEqual({
      kind: 'desktop',
      pathHint: 'D:\\New\\tone.wav',
    });
    expect(f.editor.isDirty).toBe(true);
    f.workspace.actions.undo();
    expect(f.editor.document.tracks[0].media.originHint).toEqual({
      kind: 'desktop',
      pathHint: 'C:\\Old\\tone.wav',
    });
  });
  it('records audio identity, round-trips the project, and relinks without changing its document or history', async () => {
    const f = setup();
    const file = audioFile();
    await f.workspace.loadAudio(file);
    f.editor.setTicks([0, 24]);
    expect(f.editor.document.tracks[0].media).toMatchObject({
      name: 'tone.wav',
      sampleRateHz: 48000,
      framesPerChannel: 48000,
      byteLength: file.bytes.length,
      integrity: { algorithm: 'sha256' },
    });
    expect(f.editor.isDirty).toBe(true);
    await f.workspace.saveProject();
    expect(f.editor.isDirty).toBe(false);
    f.editor.setTicks([0, 48]);
    f.workspace.actions.undo();
    expect(f.editor.isDirty).toBe(false);
    const saved = f.saved[0];
    if (!saved) throw new Error('Missing project output');
    const parsed = decodeProject(saved.bytes);
    expect(parsed.kind).toBe('supported');
    const restored = setup();
    restored.opened = { ...saved, reference: 'project-file-grant' };
    const reopen = vi.spyOn(restored.platform, 'reopenFile');
    await restored.workspace.openProject();
    expect(restored.editor.document).toEqual(f.editor.document);
    expect(restored.editor.source).toBeNull();
    expect(reopen).not.toHaveBeenCalled();
    expect(restored.editor.canUndo).toBe(false);
    const original = restored.editor.document;
    restored.opened = file;
    await restored.workspace.relinkAudio();
    expect(restored.editor.source?.length).toBe(48000);
    expect(restored.editor.document).toBe(original);
    expect(restored.editor.isDirty).toBe(false);
    expect(restored.editor.canUndo).toBe(false);
  });
  it('rejects mismatched audio, including same-size content, and preserves the current source on a failed replacement', async () => {
    const f = setup();
    await f.workspace.loadAudio(audioFile());
    const source = f.editor.source,
      original = f.editor.document;
    const wrong = audioFile();
    wrong.bytes[44] ^= 127;
    f.opened = wrong;
    await f.workspace.relinkAudio();
    expect(f.editor.isError).toBe(true);
    expect(f.editor.source).toBe(source);
    expect(f.editor.document).toBe(original);
    await f.workspace.loadAudio({
      name: 'broken.wav',
      reference: null,
      bytes: new Uint8Array([1]),
    });
    expect(f.editor.source).toBe(source);
    expect(f.editor.document).toBe(original);
    await f.workspace.exportAll();
    f.opened = null;
    await f.workspace.relinkAudio();
    expect(f.editor.source).toBe(source);
  });
  it('adopts different audio after explicit confirmation as one undoable metadata edit', async () => {
    const f = setup();
    await f.workspace.loadAudio(audioFile());
    f.confirmOptions.confirmRelinkDifference = () => Promise.resolve(true);
    const media = f.editor.document.tracks[0].media;
    if (!media) throw new Error('Expected media');
    const other = audioFile('other.wav', 24000);
    f.opened = other;
    await f.workspace.relinkAudio();
    expect(f.editor.source?.name).toBe('other');
    const updated = f.editor.document.tracks[0].media;
    expect(updated?.mediaId).toBe(media.mediaId);
    expect(updated?.name).toBe('other.wav');
    expect(updated?.framesPerChannel).toBe(24000);
    expect(updated?.integrity).not.toEqual(media.integrity);
    expect(updated?.framesPerChannel).toBe(24000);
    expect(f.editor.isDirty).toBe(true);
    expect(f.editor.canUndo).toBe(true);
    f.workspace.actions.undo();
    expect(f.editor.document.tracks[0].media).toEqual(media);
  });
  it('keeps the current audio when a relink difference is declined', async () => {
    const f = setup();
    await f.workspace.loadAudio(audioFile());
    f.confirmOptions.confirmRelinkDifference = () => Promise.resolve(false);
    const source = f.editor.source,
      document = f.editor.document;
    const wrong = audioFile('other.wav');
    wrong.bytes[44] ^= 127;
    f.opened = wrong;
    await f.workspace.relinkAudio();
    expect(f.editor.isError).toBe(true);
    expect(f.editor.source).toBe(source);
    expect(f.editor.document).toBe(document);
    expect(f.editor.canUndo).toBe(false);
  });
  it('opens an empty project and rejects future versions and multi-track projects', async () => {
    const f = setup();
    const project = createEmptyProject('portable', 'Empty');
    f.opened = { name: 'empty.wosdx', reference: null, bytes: encodeProject(project) };
    await f.workspace.openProject();
    expect(f.editor.document.projectId).toBe('portable');
    f.editor.setTicks([12]);
    const original = f.editor.document;
    f.opened = {
      name: 'future.wosdx',
      reference: null,
      bytes: new TextEncoder().encode(JSON.stringify({ ...project, schemaVersion: 99 })),
    };
    await f.workspace.openProject();
    expect(f.editor.document).toBe(original);
    expect(f.editor.isError).toBe(true);
    const track = project.tracks[0];
    if (!track) throw new Error('Missing track');
    f.opened = {
      name: 'multi.wosdx',
      reference: null,
      bytes: new TextEncoder().encode(
        JSON.stringify({ ...project, tracks: [track, { ...track, trackId: 'second' }] }),
      ),
    };
    await f.workspace.openProject();
    expect(f.editor.document).toBe(original);
    expect(f.editor.status.segments[0]?.params?.message).toMatch(/2 tracks/);
  });

  it('persists playback properties in the saved project and restores them', async () => {
    const f = setup();
    await f.workspace.loadAudio(audioFile());
    f.editor.setVolume(0.25);
    f.editor.setCueVolume(0.5);
    f.editor.setPlaybackRate(0.75);
    f.editor.cueMode = 'triangle';
    f.editor.rmsVisible = true;
    await f.workspace.saveProject();
    const saved = f.saved[0];
    if (!saved) throw new Error('Missing output');
    const parsed = decodeProject(saved.bytes);
    if (parsed.kind !== 'supported') throw new Error('Unsupported save');
    expect(parsed.project.global.masterGainDb).toBeCloseTo(ampToDb(0.25), 10);
    expect(parsed.project.global.cueGainDb).toBeCloseTo(ampToDb(0.5), 10);
    expect(parsed.project.global.playbackRate).toBe(0.75);
    expect(parsed.project.global.cueMode).toBe('triangle');
    expect(parsed.project.global.views.rms).toBe(true);
    const restored = setup();
    restored.opened = { ...saved, reference: null };
    await restored.workspace.openProject();
    expect(restored.editor.volume).toBeCloseTo(0.25, 12);
    expect(restored.editor.cueVolume).toBeCloseTo(0.5, 12);
    expect(restored.editor.playbackRate).toBe(0.75);
    expect(restored.editor.cueMode).toBe('triangle');
    expect(restored.editor.rmsVisible).toBe(true);
  });
  it('discloses unrecognized fields on editable projects and normalizes them on save', async () => {
    const f = setup();
    const project = createEmptyProject('odd', 'Odd');
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        ...project,
        legacyHint: 'keepme',
        timing: { ...project.timing, swing: 0.5 },
      }),
    );
    f.opened = { name: 'odd.wosdx', reference: null, bytes };
    await f.workspace.openProject();
    expect(f.editor.status.segments.map((segment) => segment.key)).toEqual([
      'projectOpened',
      'projectUnknownFields',
    ]);
    f.editor.setTicks([7]);
    await f.workspace.saveProject();
    const saved = f.saved[0];
    if (!saved) throw new Error('Missing output');
    expect(new TextDecoder().decode(saved.bytes)).not.toContain('legacyHint');
    const parsed = decodeProject(saved.bytes);
    expect(parsed.kind === 'supported' && parsed.unknownFields).toEqual([]);
  });
  it('never marks newer edits or a replacement project saved after an asynchronous save', async () => {
    const f = setup();
    f.editor.setTicks([12]);
    let finish: ((saved: boolean) => void) | undefined;
    f.platform.saveFile = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const saving = f.workspace.saveProject();
    f.editor.setTicks([24]);
    if (!finish) throw new Error('Expected pending save');
    finish(true);
    await saving;
    expect(f.editor.isDirty).toBe(true);
    f.platform.saveFile = () => Promise.resolve(false);
    await f.workspace.saveProject();
    expect(f.editor.isDirty).toBe(true);
    f.platform.saveFile = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const stale = f.workspace.saveProject();
    f.editor.replaceDocument(createEmptyProject('replacement'));
    f.editor.setTicks([36]);
    finish(true);
    await stale;
    expect(f.editor.isDirty).toBe(true);
    f.platform.saveFile = () => Promise.reject(new Error('Disk full'));
    await f.workspace.saveProject();
    expect(f.editor.isDirty).toBe(true);
    expect(f.editor.isError).toBe(true);
  });
  it('does not replace edits made while a project picker is pending', async () => {
    const f = setup();
    let finish: ((file: { name: string; reference: null; bytes: Uint8Array }) => void) | undefined;
    f.platform.openFile = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const opening = f.workspace.openProject();
    f.editor.setTicks([12]);
    if (!finish) throw new Error('Expected picker');
    finish({ name: 'empty.wosdx', reference: null, bytes: encodeProject(createEmptyProject()) });
    await opening;
    expect(f.editor.ticks).toEqual([12]);
    expect(f.editor.canUndo).toBe(true);
  });
  it('discards a late relink when a different project is opened', async () => {
    const f = setup();
    await f.workspace.loadAudio(audioFile());
    await f.workspace.saveProject();
    let complete: ((audio: DecodedAudio) => void) | undefined;
    const restored = setup(() => ({
      ...processorEngine(),
      decode: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    }));
    const saved = f.saved[0];
    if (!saved) throw new Error('Missing output');
    restored.opened = { ...saved, reference: null };
    await restored.workspace.openProject();
    restored.opened = audioFile();
    const relinking = restored.workspace.relinkAudio();
    // Wait for hashing and the asynchronous picker to reach the decoder.
    await vi.waitFor(() => expect(complete).toBeDefined());
    restored.opened = {
      name: 'other.wosdx',
      reference: null,
      bytes: encodeProject(createEmptyProject('other')),
    };
    await restored.workspace.openProject();
    if (!complete) throw new Error('Expected pending decode');
    complete(await processorEngine().decode('tone.wav', audioFile().bytes));
    await relinking;
    expect(restored.editor.document.projectId).toBe('other');
    expect(restored.editor.source).toBeNull();
  });
  it('retains the dirty state in recovery while successful relinking adds no edits', async () => {
    const f = setup();
    const file = audioFile();
    await f.workspace.loadAudio(file);
    const restored = setup();
    restored.session = captureEditorSession(f.editor);
    restored.opened = file;
    await restored.workspace.restoreSession();
    expect(restored.editor.isDirty).toBe(true);
    expect(restored.editor.canUndo).toBe(false);
    await f.workspace.saveProject();
    const clean = setup();
    clean.session = captureEditorSession(f.editor);
    clean.opened = file;
    await clean.workspace.restoreSession();
    expect(clean.editor.isDirty).toBe(false);
  });
  it('imports WOS settings into the current project as one undo step without touching its identity', async () => {
    const f = setup();
    await f.workspace.loadAudio(audioFile());
    const media = f.editor.document.tracks[0].media,
      source = f.editor.source,
      projectId = f.editor.document.projectId,
      output = f.editor.document.tracks[0].output;
    const wos = projectToWos(createEmptyProject());
    wos.bpm = 150;
    wos.shift = 2;
    wos.markers[5] = 1;
    f.opened = { name: 'cuts.wos', reference: null, bytes: writeWos(wos) };
    await f.workspace.importWosSettings();
    expect(f.editor.doc.bpm).toBe(150);
    expect(f.editor.doc.shift).toBe(2);
    expect(f.editor.ticks).toEqual([5]);
    expect(f.editor.source).toBe(source);
    expect(f.editor.document.tracks[0].media).toEqual(media);
    expect(f.editor.document.projectId).toBe(projectId);
    expect(f.editor.document.tracks[0].output).toEqual(output);
    expect(f.editor.isDirty).toBe(true);
    expect(f.editor.canUndo).toBe(true);
    f.workspace.actions.undo();
    expect(f.editor.doc.bpm).toBe(120);
    expect(f.editor.ticks).toEqual([]);
    await f.workspace.saveProject();
    const saved = f.saved[0];
    if (!saved) throw new Error('Missing output');
    const parsed = decodeProject(saved.bytes);
    expect(parsed.kind === 'supported' && parsed.project.tracks[0]?.media).not.toBeNull();
  });
  it('imports WOS settings into an empty workspace without inventing media', async () => {
    const f = setup();
    const projectId = f.editor.document.projectId;
    const wos = projectToWos(createEmptyProject());
    wos.bpm = 90;
    wos.markers[3] = 1;
    f.opened = { name: 'cuts.wos', reference: null, bytes: writeWos(wos) };
    await f.workspace.importWosSettings();
    expect(f.editor.doc.bpm).toBe(90);
    expect(f.editor.ticks).toEqual([3]);
    expect(f.editor.document.projectId).toBe(projectId);
    expect(f.editor.document.tracks[0].media).toBeNull();
    expect(f.editor.source).toBeNull();
    expect(f.editor.canUndo).toBe(true);
  });
  it('creates a fresh project from WOS, discarding the previous workspace content', async () => {
    const f = setup();
    await f.workspace.loadAudio(audioFile());
    f.workspace.actions.setMarker(24);
    const oldProjectId = f.editor.document.projectId;
    const wos = projectToWos(createEmptyProject());
    wos.bpm = 90;
    wos.markers[3] = 1;
    f.opened = { name: 'fresh.wos', reference: null, bytes: writeWos(wos) };
    await f.workspace.newProjectFromWos();
    expect(f.editor.doc.bpm).toBe(90);
    expect(f.editor.ticks).toEqual([3]);
    expect(f.editor.document.projectId).not.toBe(oldProjectId);
    expect(f.editor.document.tracks[0].media).toBeNull();
    expect(f.editor.source).toBeNull();
    expect(f.editor.document.tracks[0].output.baseName).toBe('slice');
    expect(f.editor.canUndo).toBe(false);
    expect(f.editor.canRedo).toBe(false);
    expect(f.editor.status.segments[0]?.key).toBe('loadedWos');
  });
  it('bounds dropped projects before reading them and never follows portable origin hints', async () => {
    const f = setup();
    const file = new File(['{}'], 'large.wosdx');
    Object.defineProperty(file, 'size', { value: 64 * 1024 * 1024 + 1 });
    const read = vi.spyOn(file, 'arrayBuffer');
    const original = f.editor.document;
    await f.workspace.openDroppedFile(file);
    expect(read).not.toHaveBeenCalled();
    expect(f.editor.document).toBe(original);
    await f.workspace.loadAudio(audioFile());
    f.editor.transact((draft) => {
      const media = draft.tracks[0].media;
      if (media) media.originHint = { kind: 'desktop', pathHint: 'C:/untrusted/secret.wav' };
    });
    f.opened = {
      name: 'hinted.wosdx',
      reference: 'project-grant',
      bytes: encodeProject(f.editor.document),
    };
    const reopen = vi.spyOn(f.platform, 'reopenFile');
    await f.workspace.openProject();
    expect(reopen).not.toHaveBeenCalled();
    expect(f.editor.source).toBeNull();
    expect(f.editor.document.tracks[0].media.originHint).toEqual({
      kind: 'desktop',
      pathHint: 'C:/untrusted/secret.wav',
    });
  });
  it('leaves no loading state when a new picker cancels an in-flight decoder', async () => {
    let complete: ((audio: DecodedAudio) => void) | undefined;
    const f = setup(() => ({
      ...processorEngine(),
      decode: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    }));
    const loading = f.workspace.loadAudio(audioFile());
    await vi.waitFor(() => expect(complete).toBeDefined());
    f.opened = null;
    await f.workspace.openProject();
    expect(f.editor.phase.kind).toBe('empty');
    if (!complete) throw new Error('Expected pending decoder');
    complete(await processorEngine().decode('tone.wav', audioFile().bytes));
    await loading;
    expect(f.editor.source).toBeNull();
  });
});
