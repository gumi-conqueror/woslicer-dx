import { createEmptyProject } from '../../src/project/codec';
import type { MediaAsset, ProjectFile, ProjectTrack } from '../../src/project/schema';

/** A project with one track and a 48000-frame stereo WAV file. */
export function singleTrackProject(): ProjectFile {
  const project = createEmptyProject('project-1', 'Song');
  const track = project.tracks[0];
  if (!track) throw new Error('Expected a track');
  track.output.baseName = 'Song';
  track.media = {
    mediaId: 'media-1',
    name: 'audio.wav',
    format: 'wav',
    byteLength: 192044,
    sampleRateHz: 48000,
    channels: 2,
    framesPerChannel: 48000,
    integrity: null,
    originHint: { kind: 'desktop', pathHint: 'C:\\Audio\\audio.wav' },
  };
  return project;
}

/** The project's only track, for tests. */
export function trackOf(project: { tracks: readonly ProjectTrack[] }): ProjectTrack {
  const track = project.tracks[0];
  if (!track) throw new Error('Expected a track');
  return track;
}

export function mediaOf(project: { tracks: readonly ProjectTrack[] }): MediaAsset {
  const media = trackOf(project).media;
  if (!media) throw new Error('Expected media');
  return media;
}

/** A shallow copy of `project` whose track has `fields` replaced. Values may be invalid on purpose. */
export function withTrack(project: ProjectFile, fields: Record<string, unknown>): unknown {
  return { ...project, tracks: [{ ...trackOf(project), ...fields }] };
}
